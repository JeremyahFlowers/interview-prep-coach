// The long session's screen: where you are in the day, and where to go next.
//
// Where this fits: a page like the problem history — reached from the
// dashboard, full navigation kept — because each step sends you somewhere
// else and this is where you come back to. It holds no timer of its own that
// matters: the run records when each step started, so the countdown is right
// however long you spent on the screen the step sent you to.
//
// The run lives in this browser, not in the synced log. It is a place-marker
// for one day on one device, and a log that carried it would pay for it on
// every save for the rest of its life.

import { todayISO } from "./logic.js";
import { todaysRecommendation } from "./recommendation.js";
import {
  longSessionFor, totalMinutes, startRun, runIsCurrent, advanceRun, runFinished, stepRemaining,
} from "./long-session.js";
import { storageKey } from "./channel.js";
import { esc } from "./ui.js";
import { openQuizMode } from "./drill-view.js";
import { startSession, hasActiveSession } from "./session-view.js";

const RUN_KEY = storageKey("ledger.longSession");

function readRun() {
  try { return JSON.parse(localStorage.getItem(RUN_KEY)); } catch (_) { return null; }
}

function writeRun(run) {
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(RUN_KEY);
  } catch (_) { /* private mode: the run just does not survive a reload */ }
}

/** Today's run and plan together, or nulls — for the dashboard's resume line. */
export function currentLongRun(state, today = todayISO()) {
  const plan = longSessionFor(state, today);
  const run = readRun();
  return { plan, run: runIsCurrent(run, plan, today) ? run : null };
}

const fmt = (min) => {
  const total = Math.max(0, Math.round(Math.abs(min) * 60));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function renderLongSession(root, store, actions) {
  const state = store.state;
  const { plan, run } = currentLongRun(state);

  if (!plan) {
    root.innerHTML = `
      <div class="card">
        <h2>Nothing long today</h2>
        <p class="muted">Your week does not make today a long session — no design deep session, and a
        band short enough for one sitting. The dashboard has today's plan.</p>
        <button type="button" class="btn btn-primary" data-tab-go="dashboard">Back to today</button>
      </div>`;
    root.querySelector("[data-tab-go]").addEventListener("click", () => actions.switchTab("dashboard"));
    return;
  }

  const finished = run && runFinished(run, plan);
  const index = run ? run.index : -1;
  const step = run && !finished ? plan.steps[index] : null;
  const clock = step ? stepRemaining(step, run.startedAt) : null;

  root.innerHTML = `
    <div class="card">
      <h2>${esc(plan.title)}</h2>
      <p class="muted">${totalMinutes(plan.steps)} minutes in two sittings, with a real break between
      them. Each step sends you to the right screen; come back here when it is done, and the clock
      will have kept your place.</p>
      ${!run ? `<button type="button" class="btn btn-primary" id="long-start">Start</button>` : ""}
    </div>

    ${step ? `
    <div class="card long-now${step.isBreak ? " is-break" : ""}">
      <p class="label">${step.isBreak ? "Now" : `Step ${index + 1} of ${plan.steps.length}`}</p>
      <div class="row space-between" style="align-items:flex-start;gap:1rem;flex-wrap:wrap">
        <h2 style="margin:0">${esc(step.label)}</h2>
        <span class="long-clock${clock.overrun ? " clock-overrun" : ""}" id="long-clock">
          ${clock.overrun ? "+" : ""}${fmt(clock.remainingMin)}</span>
      </div>
      <p>${esc(step.prompt)}</p>
      <div class="row gap-sm" style="flex-wrap:wrap">
        ${step.action ? `<button type="button" class="btn btn-primary" id="long-go">${esc(goLabel(step))}</button>` : ""}
        <button type="button" class="btn ${step.action ? "btn-ghost" : "btn-primary"}" id="long-next">
          ${step.isBreak ? "I'm back" : "Done — next step"}</button>
        ${step.isBreak ? "" : `<button type="button" class="btn btn-ghost" id="long-skip">Skip it</button>`}
      </div>
    </div>` : ""}

    ${finished ? `
    <div class="card long-now">
      <h2>That's the day</h2>
      <p class="muted">${run.done.filter((d) => !d.skipped).length} of ${plan.steps.length} steps done,
      ${run.done.reduce((n, d) => n + d.minutes, 0)} minutes in all. Whatever you wrote down in the last
      step is next week's reading list.</p>
      <button type="button" class="btn btn-ghost" id="long-reset">Start again</button>
    </div>` : ""}

    <div class="card">
      <h3>The plan</h3>
      <ol class="long-steps">
        ${plan.steps.map((s, i) => {
          const done = run?.done[i];
          const state = done ? (done.skipped ? "skipped" : "done") : i === index ? "current" : "";
          return `<li class="long-step ${state}${s.isBreak ? " is-break" : ""}">
            <span class="long-step-mark" aria-hidden="true">${done ? (done.skipped ? "–" : "✓") : i + 1}</span>
            <span class="long-step-body"><strong>${esc(s.label)}</strong>
              <span class="muted small">${s.minutes} min${done && !done.skipped ? ` · took ${done.minutes}` : ""}</span></span>
          </li>`;
        }).join("")}
      </ol>
    </div>`;

  root.querySelector("#long-start")?.addEventListener("click", () => {
    writeRun(startRun(plan));
    actions.rerender();
  });
  root.querySelector("#long-next")?.addEventListener("click", () => {
    writeRun(advanceRun(run, plan));
    actions.rerender();
  });
  root.querySelector("#long-skip")?.addEventListener("click", () => {
    writeRun(advanceRun(run, plan, { skipped: true }));
    actions.rerender();
  });
  root.querySelector("#long-reset")?.addEventListener("click", () => {
    writeRun(null);
    actions.rerender();
  });
  root.querySelector("#long-go")?.addEventListener("click", () => go(step, state, actions));

  // The countdown, self-cancelling when it leaves the page.
  const el = root.querySelector("#long-clock");
  if (el && step) {
    const tick = setInterval(() => {
      if (!el.isConnected) { clearInterval(tick); return; }
      const c = stepRemaining(step, run.startedAt);
      el.textContent = `${c.overrun ? "+" : ""}${fmt(c.remainingMin)}`;
      el.classList.toggle("clock-overrun", c.overrun);
    }, 1000);
  }
}

function goLabel(step) {
  if (step.action?.start) return "Start a problem";
  const LABELS = { components: "Open the components", designBank: "Pick a design problem",
    quiz: "Open the drill", warmup: "Open the warm-up", journal: "Open the journal" };
  return LABELS[step.action?.tab] || "Go";
}

/** Send somebody to where the step happens. */
function go(step, state, actions) {
  const action = step.action || {};
  if (action.start === "recommended") {
    if (hasActiveSession()) { actions.switchTab("workspace"); return; }
    const rec = todaysRecommendation(state);
    if (rec.problem) {
      startSession(rec.problem);
      actions.switchTab("workspace");
    } else {
      actions.switchTab("queue");
    }
    return;
  }
  if (action.mode) openQuizMode(action.mode);
  actions.switchTab(action.tab);
}
