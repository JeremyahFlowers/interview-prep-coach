// A system-design session, run the way a design interview is run.
//
// Where this fits: beside session-view.js, which owns the coding session, and
// sharing its parts rather than copying them — the same whiteboard, the same
// event log and sync, the same timebox, the same checkpointing. What differs is
// the format, and only the format.
//
// The format is the feature. A design interview has a shape — requirements,
// core entities, API, high-level design, then deep dives — and the shape is
// load-bearing rather than decorative: an API designed before the entities
// exist has nothing to carry, and a diagram drawn before the requirements are
// agreed is a careful drawing of the wrong system. This used to be one open
// timebox with the reference revealed at the end, which is a format that
// collapses into "draw boxes for forty minutes" and then tells you on minute
// forty that the requirements were wrong on minute four.
//
// So each stage is worked and then checked against the answer key before the
// next one starts, and each stage has its own slice of the box. The check is
// the exercise: the reference stays shut until you have committed to an answer,
// because reading it first turns an exercise into a lecture.

import {
  DESIGN_STAGES, designPlan, stageClock, keyFor, designProblemById, componentsFor, componentById,
} from "./design-logic.js";
import { COMPONENTS } from "./design-components.js";
import { updateDayBudget } from "./chrome.js";
import { createWhiteboard } from "./whiteboard.js";
import { createRepoChannel, createEmitter } from "./session-sync.js";
import { createLiveChannel } from "./live-channel.js";
import { deviceId } from "./session-log.js";
import { storageKey } from "./channel.js";
import {
  uid, todayISO, applyOutcome, updateStreak, claimDayTimer, dayTimerRunning, stopDayTimer,
} from "./logic.js";
import { esc, richText, toast, confirmLoss } from "./ui.js";
import { resetWalkthrough } from "./design-view.js";

let session = null;

/** How honestly a stage went, recorded per stage rather than once at the end.
 *  One number for a whole design says nothing about which part was weak, and
 *  which part was weak is the only thing worth knowing afterwards. */
const CHECKS = [
  { key: "had", label: "Had it", cls: "pill-good" },
  { key: "partly", label: "Partly", cls: "pill-warn" },
  { key: "missed", label: "Missed it", cls: "pill-bad" },
];

export function hasActiveDesignSession() {
  return session != null;
}

export function currentDesignProblemName() {
  return session?.problem?.name || "";
}

export function startDesignSession(problemId) {
  const problem = designProblemById(problemId);
  if (!problem) return false;
  // The reference is closed again, because you are about to answer it. Leaving
  // it open where you last read it would be handing you the answer.
  resetWalkthrough();
  session = {
    problem, startedAt: null, endedAt: null, plan: null,
    stageIndex: 0, stageStartedAt: null, view: "work",
    answers: {},            // stage key -> what they wrote
    checks: {},             // stage key -> "had" | "partly" | "missed"
    spent: {},              // stage key -> minutes actually taken
    deepIndex: 0, deepRevealed: false, deepAnswers: [],
    intervalId: null, whiteboardCtl: null, mountKey: null,
    syncId: uid(), emitter: null, sync: null, live: null,
    covered: new Set(), boardDataUrl: null,
  };
  return true;
}

function abandonDesignSession({ saved = false } = {}) {
  // A recorded session stops its clock inside the save, in the same commit.
  if (!saved) session?.releaseDayClock?.();
  if (session?.intervalId) clearInterval(session.intervalId);
  if (session?.whiteboardCtl) session.whiteboardCtl.destroy();
  session?.sync?.stop({ discard: true }).catch(() => {});
  session?.live?.stop().catch(() => {});
  session = null;
}

/** Leaving without recording it, asked the same way every other discard is. */
export function discardDesignSession(actions) {
  if (!confirmLoss({
    action: "Discard this design session?",
    lost: "your answers, the drawing and the timer from this one sitting",
    kept: "every attempt you have recorded before now",
  })) return false;
  abandonDesignSession();
  actions.switchTab("designBank");
  return true;
}

// ---------- moving through the stages ----------

const stageAt = (i) => session.plan.stages[i] || null;
const currentStage = () => stageAt(session.stageIndex);

/** Leave the board alone unless the thing on screen actually changed: a
 *  re-render during the drawing stage would tear the canvas out from under the
 *  pen. Everything else is cheap to redraw and safer for being stateless. */
const mountKeyNow = () => `${session.stageIndex}:${session.view}:${session.deepIndex}:${session.deepRevealed}`;

function finishStage(store) {
  const stage = currentStage();
  if (!stage) return;
  session.spent[stage.key] = (Date.now() - (session.stageStartedAt || Date.now())) / 60000;
  if (stage.kind === "draw" && session.whiteboardCtl) {
    // Captured now rather than at the end, because the board is about to stop
    // being on screen and its controller is about to be destroyed.
    session.boardDataUrl = session.whiteboardCtl.toDataUrl();
    session.board = session.whiteboardCtl.toJSON();
  }
  session.view = "compare";
  session.emitter?.emit("note", { stage: stage.key, spentMin: session.spent[stage.key] });
}

function advance(actions) {
  const next = stageAt(session.stageIndex + 1);
  if (!next) {
    session.endedAt = Date.now();
    if (session.intervalId) clearInterval(session.intervalId);
    actions.switchTab("designCompare");
    return;
  }
  session.stageIndex += 1;
  session.view = "work";
  session.stageStartedAt = Date.now();
  session.deepIndex = 0;
  session.deepRevealed = false;
  actions.rerender();
}

// ---------- the session ----------

export function renderDesignSession(root, store, actions) {
  if (!session) {
    actions.switchTab("designBank");
    return;
  }
  const p = session.problem;
  if (!session.plan) session.plan = designPlan(store.state, p.difficulty);

  if (!session.startedAt) { renderPrestart(root, store, actions); return; }

  // Re-rendering the drawing stage would tear the canvas out from under the
  // pen, so it is skipped unless what is on screen has actually changed.
  const key = mountKeyNow();
  if (session.mountKey === key && root.querySelector("#ds-stage-body")) return;
  session.mountKey = key;

  const stage = currentStage();
  root.innerHTML = `
    <div class="ws">
      ${stageBarHtml(stage)}
      <div class="ds-stage" id="ds-stage-body">
        ${session.view === "compare" ? compareHtml(stage) : workHtml(stage)}
      </div>
    </div>`;

  wireStage(root, store, actions, stage);
  startClock(root, store);
}

/** The bar: which stage, its clock, what the stage is asking for, and the way
 *  out. The stage strip along the top is there so the shape of the interview is
 *  visible the whole way through rather than being something you are told
 *  about once at the start. */
function stageBarHtml(stage) {
  const stages = session.plan.stages;
  return `
    <div class="ws-bar">
      <div class="ws-bar-id">
        <strong>${esc(session.problem.name)}</strong>
        <span class="muted small">${esc(session.problem.difficulty)}</span>
        <ol class="ds-steps">
          ${stages.map((s, i) => `<li class="ds-step${i === session.stageIndex ? " current" : ""}${i < session.stageIndex ? " done" : ""}">
            <span class="ds-step-n">${i + 1}</span>
            <span class="ds-step-label">${esc(s.label)}</span>
            <span class="ds-step-min">${s.minutes}m</span>
          </li>`).join("")}
        </ol>
      </div>
      <div class="session-clock-group">
        <div class="session-clock" id="ds-clock">00:00</div>
        <div class="session-day" id="ds-day"></div>
      </div>
      <div class="mock-phase" id="ds-phase">
        <span class="mock-phase-label">${esc(stage.label)}</span>
        <span class="mock-phase-prompt">${esc(session.view === "compare" ? "Against the answer key." : stage.prompt)}</span>
      </div>
      <div class="ws-bar-actions">
        ${session.view === "compare" ? "" : `<button class="btn btn-ghost btn-sm" id="ds-brief-toggle">The brief</button>`}
        <button class="btn btn-primary btn-sm" id="ds-advance">${advanceLabel(stage)}</button>
        <button class="btn btn-ghost btn-sm session-exit" id="ds-discard">Exit</button>
      </div>
    </div>`;
}

function advanceLabel(stage) {
  if (session.view === "work") {
    if (stage.kind === "questions") {
      return session.deepRevealed ? "Next question" : "Show the answer";
    }
    return "Check against the key";
  }
  return stageAt(session.stageIndex + 1) ? `Next: ${stageAt(session.stageIndex + 1).label}` : "Finish";
}

// ---------- working a stage ----------

function workHtml(stage) {
  const hint = stage.hint
    ? `<p class="muted small ds-hint">${esc(stage.hint)}</p>` : "";

  if (stage.kind === "draw") {
    return `
      <div class="ds-panes">
        <section class="ws-pane ds-brief" id="ds-brief" hidden>
          ${briefHtml()}
        </section>
        <section class="ws-pane ds-board-pane">
          ${stencilHtml()}
          <div class="ws-pane-body ws-pane-body-flush"><div id="ds-board" class="board-host"></div></div>
        </section>
      </div>`;
  }

  if (stage.kind === "questions") return deepDiveHtml(stage);

  const written = session.answers[stage.key] || "";
  return `
    <div class="ds-write">
      <div class="card ds-write-card">
        <h2>${esc(stage.label)}</h2>
        <p class="muted">${esc(stage.prompt)}</p>
        ${hint}
        <textarea class="textarea ds-answer" id="ds-answer" rows="14"
          placeholder="${esc(stage.placeholder || "")}"
          spellcheck="false">${esc(written)}</textarea>
        <p class="muted small">Write it as you would say it. Nothing here is marked — the
        comparison is yours to make, and a generous one teaches nothing.</p>
      </div>
      <aside class="card ds-aside">
        <h3 class="small-heading">The brief</h3>
        ${briefHtml({ compact: true })}
      </aside>
    </div>`;
}

function briefHtml({ compact = false } = {}) {
  const p = session.problem;
  return `
    ${compact ? "" : `<header class="ws-pane-head"><span class="label">The brief</span></header>`}
    <div class="${compact ? "" : "ws-pane-body"}">
      <p class="${compact ? "muted small" : "muted"}">${esc(p.prompt)}</p>
      ${session.answers.requirements ? `
        <h3 class="small-heading">Your requirements</h3>
        <p class="muted small ds-recall">${richText(session.answers.requirements)}</p>` : ""}
      ${session.answers.entities ? `
        <h3 class="small-heading">Your entities</h3>
        <p class="muted small ds-recall">${richText(session.answers.entities)}</p>` : ""}
      ${session.answers.api ? `
        <h3 class="small-heading">Your API</h3>
        <p class="muted small ds-recall">${richText(session.answers.api)}</p>` : ""}
    </div>`;
}

/** One question at a time, with the model answer revealed before the next one
 *  — which is how a follow-up actually works. Holding all five back until the
 *  end would let one wrong assumption run through all of them. */
function deepDiveHtml(stage) {
  const dives = keyFor(session.problem, "deepdive") || [];
  const i = Math.min(session.deepIndex, dives.length - 1);
  const dive = dives[i];
  if (!dive) return `<div class="card"><p class="muted">No deep dives for this one yet.</p></div>`;
  const mine = session.deepAnswers[i] || "";

  return `
    <div class="ds-write">
      <div class="card ds-write-card">
        <p class="label">Question ${i + 1} of ${dives.length}</p>
        <h2 class="ds-question">${esc(dive.q)}</h2>
        ${session.deepRevealed ? "" : `<p class="muted small ds-hint">${esc(stage.hint)}</p>`}
        <textarea class="textarea ds-answer" id="ds-answer" rows="6"
          placeholder="What would you change, and what does it cost you?"
          spellcheck="false" ${session.deepRevealed ? "readonly" : ""}>${esc(mine)}</textarea>
        ${session.deepRevealed ? `
          <div class="ds-key">
            <h3 class="small-heading">A good answer</h3>
            <p>${esc(dive.answer)}</p>
            ${dive.watchFor ? `<p class="ds-watch"><strong>Watch for.</strong> ${esc(dive.watchFor)}</p>` : ""}
          </div>` : ""}
      </div>
      <aside class="card ds-aside">
        <h3 class="small-heading">Your design</h3>
        ${session.boardDataUrl
          ? `<img class="ds-thumb" src="${session.boardDataUrl}" alt="The design you drew" />`
          : `<p class="muted small">Nothing drawn.</p>`}
        ${briefHtml({ compact: true })}
      </aside>
    </div>`;
}

// ---------- checking a stage against the key ----------

const bullets = (items, cls = "tight-list") =>
  `<ul class="${cls}">${(items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

/** The answer key for one stage, beside what they wrote. Side by side and not
 *  scored: there is more than one right design, and a bank that only rewards
 *  matching the reference teaches matching the reference. */
function compareHtml(stage) {
  const p = session.problem;
  const mine = stage.kind === "draw"
    ? (session.boardDataUrl
      ? `<img class="ds-thumb" src="${session.boardDataUrl}" alt="What you drew" />`
      : `<p class="muted">Nothing drawn.</p>`)
    : stage.kind === "questions"
      ? deepRecapHtml()
      : `<p class="ds-recall">${richText(session.answers[stage.key] || "") || "<em class=\"muted\">Nothing written.</em>"}</p>`;

  return `
    <div class="ds-compare">
      <div class="card">
        <h2>${esc(stage.label)} — yours</h2>
        ${mine}
        ${checkRowHtml(stage)}
      </div>
      <div class="card ds-key-card">
        <h2>${esc(stage.label)} — a reference answer</h2>
        ${keyHtml(stage, p)}
      </div>
    </div>`;
}

function checkRowHtml(stage) {
  const chosen = session.checks[stage.key];
  return `
    <div class="ds-check">
      <span class="label">How did that go?</span>
      <div class="row gap-sm">
        ${CHECKS.map((c) => `<button type="button" class="btn btn-sm ds-check-btn${chosen === c.key ? " active" : ""}"
          data-check="${c.key}" aria-pressed="${chosen === c.key}">${esc(c.label)}</button>`).join("")}
      </div>
    </div>`;
}

function deepRecapHtml() {
  const dives = keyFor(session.problem, "deepdive") || [];
  return `<ol class="ds-recap">${dives.map((d, i) => `
    <li>
      <p class="ds-recap-q">${esc(d.q)}</p>
      <p class="ds-recall">${richText(session.deepAnswers[i] || "") || "<em class=\"muted\">No answer.</em>"}</p>
    </li>`).join("")}</ol>`;
}

function keyHtml(stage, p) {
  switch (stage.key) {
    case "requirements": {
      const est = p.estimate;
      return `
        <h3 class="small-heading">Functional</h3>
        ${bullets(p.requirements.functional)}
        <h3 class="small-heading">Non-functional</h3>
        ${bullets(p.requirements.nonFunctional)}
        ${est ? `
          <h3 class="small-heading">The numbers that decide the design</h3>
          ${bullets(est.assumptions)}
          ${bullets(est.derive, "tight-list muted")}` : ""}`;
    }
    case "entities":
      return `<ul class="ds-entities">${(p.entities || []).map((e) => `
        <li>
          <p class="ds-entity-name">${esc(e.name)}</p>
          <p class="ds-entity-fields"><code>${esc(e.fields)}</code></p>
          ${e.note ? `<p class="muted small">${esc(e.note)}</p>` : ""}
        </li>`).join("")}</ul>`;
    case "api":
      return `<ul class="ds-api">${(p.api || []).map((a) => `
        <li>
          <p class="ds-api-call"><code>${esc(a.call)}</code></p>
          <p class="muted small"><code>${esc(a.body)}</code> &rarr; <code>${esc(a.returns)}</code></p>
          ${a.note ? `<p class="muted small">${esc(a.note)}</p>` : ""}
        </li>`).join("")}</ul>`;
    case "highlevel":
      return `
        <ol class="ds-walk">${(p.walkthrough || []).map((step) => `
          <li>
            <h3>${esc(step.title)}</h3>
            <p>${esc(step.says)}</p>
            <p class="muted small"><strong>Why.</strong> ${esc(step.because)}</p>
            ${step.watchFor ? `<p class="ds-watch"><strong>Watch for.</strong> ${esc(step.watchFor)}</p>` : ""}
          </li>`).join("")}</ol>
        ${componentCheckHtml()}`;
    case "deepdive":
      return `<ol class="ds-recap">${(p.deepDives || []).map((d) => `
        <li>
          <p class="ds-recap-q">${esc(d.q)}</p>
          <p>${esc(d.answer)}</p>
          ${d.watchFor ? `<p class="ds-watch"><strong>Watch for.</strong> ${esc(d.watchFor)}</p>` : ""}
        </li>`).join("")}</ol>`;
    default:
      return `<p class="muted">No key for this stage.</p>`;
  }
}

/** Which components the reference reached for, ticked honestly. It lives on the
 *  high-level check because that is the stage they belong to, and because it is
 *  the one place where "I did not think of that" is a specific, nameable gap
 *  rather than a feeling about the whole design. */
function componentCheckHtml() {
  const components = componentsFor(session.problem);
  if (!components.length) return "";
  return `
    <div class="ds-covered">
      <h3 class="small-heading">Which of these did you have?</h3>
      <p class="muted small">Unticked means the reference used it and you did not — which is not a
      failure, it is the list of what to read next.</p>
      <ul class="checklist" id="ds-covered">
        ${components.map((c) => `<li><label>
          <input type="checkbox" data-covered="${esc(c.id)}" ${session.covered.has(c.id) ? "checked" : ""} />
          <span>${esc(c.name)} <span class="muted small">— ${esc(c.hook)}</span></span>
        </label></li>`).join("")}
      </ul>
    </div>`;
}

// ---------- wiring ----------

/** Keep what is typed in the session rather than in the DOM: a stage that is
 *  re-rendered — by a sync tick, a store change, anything — must not lose the
 *  sentence somebody is halfway through. */
function captureAnswer(root, stage) {
  const box = root.querySelector("#ds-answer");
  if (!box) return;
  if (stage.kind === "questions") session.deepAnswers[session.deepIndex] = box.value;
  else session.answers[stage.key] = box.value;
}

function wireStage(root, store, actions, stage) {
  const box = root.querySelector("#ds-answer");
  box?.addEventListener("input", () => captureAnswer(root, stage));
  if (box && !session.deepRevealed) requestAnimationFrame(() => box.focus({ preventScroll: true }));

  if (stage.kind === "draw" && root.querySelector("#ds-board")) {
    mountBoard(root, store);
    root.querySelector("#ds-brief-toggle")?.addEventListener("click", () => {
      const brief = root.querySelector("#ds-brief");
      brief.hidden = !brief.hidden;
      session.whiteboardCtl?.resize();
    });
  }

  root.querySelectorAll(".ds-check-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      session.checks[stage.key] = btn.dataset.check;
      root.querySelectorAll(".ds-check-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    });
  });

  root.querySelectorAll("#ds-covered [data-covered]").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) session.covered.add(cb.dataset.covered);
      else session.covered.delete(cb.dataset.covered);
    });
  });

  root.querySelector("#ds-discard")?.addEventListener("click", () => discardDesignSession(actions));
  root.querySelector("#ds-advance")?.addEventListener("click", () => {
    captureAnswer(root, stage);

    if (session.view === "compare") { advance(actions); return; }

    // A deep dive is a run of question, answer, next — so the button means
    // three different things depending on where in that run you are.
    if (stage.kind === "questions") {
      const dives = keyFor(session.problem, "deepdive") || [];
      if (!session.deepRevealed) { session.deepRevealed = true; actions.rerender(); return; }
      if (session.deepIndex < dives.length - 1) {
        session.deepIndex += 1;
        session.deepRevealed = false;
        actions.rerender();
        return;
      }
    }

    finishStage(store);
    actions.rerender();
  });
}

/**
 * The stencil: name a component and it is on the board, as a labelled box.
 *
 * A design answer is a dozen named boxes joined by arrows. Drawing each box,
 * then fetching the text tool, then typing the name over it, is three gestures
 * per component on a clock — and the name did not even move with the box.
 * Every component the app teaches autocompletes here, and anything else typed
 * ("Payment service") is placed just the same. Storage is drawn as a circle so
 * the data and the services are told apart at a glance.
 *
 * Deliberately not the problem's own components: offering those would hand you
 * the reference answer while you are meant to be producing your own.
 */
function stencilHtml() {
  return `
    <form class="ds-stencil" id="ds-stencil" autocomplete="off">
      <input class="input" id="ds-stencil-name" list="ds-stencil-list"
        placeholder="Add a component — type a name, press Enter" aria-label="Add a component to the board" />
      <datalist id="ds-stencil-list">
        ${COMPONENTS.map((c) => `<option value="${esc(c.name)}"></option>`).join("")}
      </datalist>
      <button type="submit" class="btn btn-ghost btn-sm">Add</button>
    </form>`;
}

const STORAGE_NAMES = new Set(COMPONENTS.filter((c) => c.category === "storage").map((c) => c.name.toLowerCase()));

function wireStencil(root) {
  const form = root.querySelector("#ds-stencil");
  const input = root.querySelector("#ds-stencil-name");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const kind = STORAGE_NAMES.has(name.toLowerCase()) ? "ellipse" : "rect";
    session.whiteboardCtl?.placeLabeled(name, { kind });
    input.value = "";
  });
}

function mountBoard(root, store) {
  const host = root.querySelector("#ds-board");
  if (!host) return;
  session.whiteboardCtl?.destroy();
  session.whiteboardCtl = createWhiteboard(host, {
    onAdd: (el) => session.emitter?.emit("element", el),
    onUpdate: (el) => session.emitter?.emit("element-move", el),
    onRemove: (id) => session.emitter?.emit("element-del", { id }),
    onClear: () => session.emitter?.emit("board-clear"),
  });
  // Coming back to the drawing stage — from a compare, or after a reload —
  // must not come back to an empty board.
  if (session.board?.length) session.whiteboardCtl.restore(session.board);
  wireStencil(root);
}

/** One ticking clock for the stage in hand, recreated with each render and
 *  self-cancelling when its readout leaves the page. */
function startClock(root, store) {
  clearInterval(session.intervalId);
  session.intervalId = setInterval(() => {
    const clock = root.querySelector("#ds-clock");
    if (!clock) { clearInterval(session.intervalId); return; }
    const stage = currentStage();
    if (!stage) return;
    const c = stageClock(stage, Date.now() - (session.stageStartedAt || Date.now()));
    const abs = Math.abs(c.remainingMin);
    clock.textContent = `${c.overrun ? "+" : ""}${String(Math.floor(abs)).padStart(2, "0")}:`
      + String(Math.floor((abs % 1) * 60)).padStart(2, "0");
    clock.classList.toggle("clock-overrun", c.overrun);
    clock.classList.toggle("clock-urgent", !c.overrun && c.endingSoon);
    updateDayBudget(root.querySelector("#ds-day"), store.state);
  }, 250);
}

// ---------- before it starts ----------

function renderPrestart(root, store, actions) {
  const p = session.problem;
  // session-card is the same reading column the coding pre-start uses. A bare
  // card on a page-full view has no max width and no padding.
  root.innerHTML = `
    <div class="card session-card">
      <h2>${esc(p.name)}</h2>
      <p class="muted">${esc(p.prompt)}</p>
      <p class="muted small">Five stages, in the order an interview runs them. You answer each one
      first and only then see a reference answer — reading it first turns the exercise into a
      lecture. Nothing stops when a stage's time is up; the clock is there so you notice you have
      spent nine minutes naming three nouns.</p>
      ${boxPreviewHtml(session.plan)}
      <button class="btn btn-primary" id="ds-start">Start</button>
      <button class="btn btn-ghost" id="ds-exit">Back</button>
    </div>`;
  root.querySelector("#ds-start").addEventListener("click", () => {
    session.startedAt = Date.now();
    session.stageStartedAt = Date.now();
    session.mountKey = null;
    // The session runs the day clock, as a coding session does, so the day's
    // time moves while you work rather than landing when you record it.
    const held = session;
    store.mutate((s) => { held.ownsDayClock = claimDayTimer(s); }, "Ledger: day clock");
    held.releaseDayClock = () => {
      if (held.ownsDayClock) store.mutate((s) => stopDayTimer(s), "Ledger: day clock");
    };
    startSync(store);
    actions.rerender();
  });
  root.querySelector("#ds-exit").addEventListener("click", () => {
    abandonDesignSession();
    actions.switchTab("designBank");
  });
}

function boxPreviewHtml(plan) {
  if (!plan?.stages?.length) return "";
  return `
    <div class="box-preview">
      <p class="muted small"><strong>${plan.totalMin} minutes,</strong> divided the way the interview
      divides them. Entities is the short one on purpose — naming the nouns is a two minute job that
      routinely takes ten.</p>
      <ol class="box-phases">
        ${plan.stages.map((s) => `<li style="flex-grow:${s.minutes}">
          <span class="box-phase-label">${esc(s.label)}</span>
          <span class="muted small">${s.minutes}m</span></li>`).join("")}
      </ol>
    </div>`;
}

// ---------- the end of the session ----------

/** A stage that took forty seconds took under a minute, not zero of them. */
function formatSpent(min) {
  if (min == null) return "—";
  if (min < 1) return min > 0 ? "&lt;1m" : "0m";
  return `${Math.round(min)}m`;
}

function outcomeFor(selfScore) {
  if (selfScore >= 4) return "solved-clean";
  if (selfScore === 3) return "solved-struggled";
  if (selfScore === 2) return "ran-out-of-time";
  return "failed";
}

/** What the five stages added up to, and the one record that goes in the log.
 *
 * The reference is not repeated here — it was read stage by stage, which is the
 * whole change. This is the honest summary: which stages held up, how long each
 * actually took against its box, and the components the reference used that you
 * did not. */
export function renderDesignCompare(root, store, actions) {
  if (!session || !session.endedAt) {
    actions.switchTab("designBank");
    return;
  }
  const p = session.problem;
  const components = componentsFor(p);
  const minutes = Math.round((session.endedAt - session.startedAt) / 60000);
  const missedComponents = components.filter((c) => !session.covered.has(c.id));
  const stages = session.plan.stages;
  // A default that reflects what they already said stage by stage, rather than
  // making them summarise their own session a second time from nothing.
  const hadCount = stages.filter((s) => session.checks[s.key] === "had").length;
  const missedCount = stages.filter((s) => session.checks[s.key] === "missed").length;
  const suggested = missedCount >= 2 ? 2 : hadCount >= 3 ? 4 : 3;

  root.innerHTML = `
    <div class="card">
      <h2>${esc(p.name)} — how it went</h2>
      <p class="muted">${minutes} minute${minutes === 1 ? "" : "s"} across five stages. You have
      already compared each one; this is what they add up to.</p>
    </div>

    <div class="card">
      <h2>Stage by stage</h2>
      <table class="table ds-summary">
        <thead><tr><th>Stage</th><th>Box</th><th>Took</th><th>How it went</th></tr></thead>
        <tbody>
          ${stages.map((s) => {
            const spent = session.spent[s.key];
            const check = CHECKS.find((c) => c.key === session.checks[s.key]);
            const over = spent != null && spent > s.minutes;
            return `<tr>
              <td>${esc(s.label)}</td>
              <td class="muted">${s.minutes}m</td>
              <td class="${over ? "over-box" : ""}">${formatSpent(spent)}</td>
              <td>${check ? `<span class="pill ${check.cls}">${esc(check.label)}</span>`
                : `<span class="muted small">not marked</span>`}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    ${session.boardDataUrl ? `
    <div class="card">
      <h2>What you drew</h2>
      <img class="ds-thumb" src="${session.boardDataUrl}" alt="The design you drew" />
    </div>` : ""}

    ${missedComponents.length ? `
    <div class="card">
      <h2>What to read next</h2>
      <p class="muted small">The reference reached for these and you did not. That is a reading
      list, not a verdict.</p>
      <ul class="tight-list">
        ${missedComponents.map((c) => `<li><strong>${esc(c.name)}</strong>
          <span class="muted small">— ${esc(c.hook)}</span></li>`).join("")}
      </ul>
    </div>` : ""}

    <div class="card">
      <form id="ds-save" class="form">
        <label class="field"><span class="label">Overall</span>
          <select class="select" name="selfScore">
            <option value="4"${suggested === 4 ? " selected" : ""}>Had most of it, and the reasoning</option>
            <option value="3"${suggested === 3 ? " selected" : ""}>Got the shape, missed some pieces</option>
            <option value="2"${suggested === 2 ? " selected" : ""}>Struggled, but learned something specific</option>
            <option value="1">Did not know where to start</option>
          </select></label>
        <label class="field"><span class="label">One thing you will do differently</span>
          <textarea class="textarea" name="notes" rows="3"
            placeholder="I designed the API before I had named the entities, so it had nothing to carry."></textarea></label>
        <button class="btn btn-primary" type="submit">Save this attempt</button>
        <button class="btn btn-ghost" type="button" id="ds-cancel">Discard it</button>
      </form>
    </div>`;

  root.querySelector("#ds-cancel").addEventListener("click", () => discardDesignSession(actions));
  root.querySelector("#ds-save").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const covered = [...session.covered];
    const missed = components.map((c) => c.id).filter((id) => !covered.includes(id));
    const selfScore = Number(form.get("selfScore")) || 3;
    const problemId = p.id;
    const date = todayISO();
    // Kept per stage, because "the design was weak" is not actionable and
    // "the API stage was weak three times running" is.
    const byStage = stages.map((s) => ({
      stage: s.key, check: session.checks[s.key] || null,
      boxMin: s.minutes,
      spentMin: session.spent[s.key] != null ? Math.round(session.spent[s.key]) : null,
    }));

    const ownsDayClock = !!session.ownsDayClock;
    store.mutate((s) => {
      const record = (s.designProblems || []).find((x) => x.id === problemId);
      if (!record) return;
      record.attempts.push({
        id: uid(), date, covered, missed, selfScore, byStage,
        notes: form.get("notes") || "",
        minutes,
        // Whether the day clock was already counting these minutes — the same
        // flag the coding side records, for the same reason.
        onClock: dayTimerRunning(s),
      });
      if (ownsDayClock) stopDayTimer(s);
      // Scored on the same ladder as a coding problem: a strong pass moves it
      // up a box, a weak one holds, not knowing where to start resets it.
      applyOutcome(record, outcomeFor(selfScore), s.settings);
      updateStreak(s);
    }, `Ledger: design — ${p.name}`);

    abandonDesignSession({ saved: true });
    toast("Recorded.");
    actions.switchTab("designBank");
  });
}

function startSync(store) {
  const device = deviceId(localStorage, storageKey("ledger.device"));
  const durable = store.gh ? createRepoChannel({ gh: store.gh, sessionId: session.syncId }) : null;
  const relayUrl = store.state?.settings?.relayUrl || "";
  const live = relayUrl
    ? createLiveChannel({ relayUrl, sessionId: session.syncId, deviceId: device })
    : null;

  session.sync = durable;
  session.live = live;
  session.emitter = createEmitter({
    sessionId: session.syncId, deviceId: device, channels: [durable, live].filter(Boolean),
  });
  session.emitter.emit("session", {
    problemId: session.problem.id,
    problemName: session.problem.name,
    difficulty: session.problem.difficulty,
    statement: session.problem.prompt,
    plan: session.plan,
  });
  session.emitter.emit("timer", { action: "start" }, session.startedAt);

  if (!live) return;
  live.subscribe((event) => {
    const ctl = session?.whiteboardCtl;
    if (!ctl) return;
    const payload = event.payload || {};
    if (event.kind === "element") ctl.applyRemote({ id: event.id, ...payload });
    else if (event.kind === "element-move") ctl.applyRemote({ ...ctl.toJSON().find((e) => e.id === payload.id), ...payload });
    else if (event.kind === "element-del") ctl.removeRemote(payload.id);
    else if (event.kind === "board-clear") ctl.restore([]);
  });
  live.start();
}
