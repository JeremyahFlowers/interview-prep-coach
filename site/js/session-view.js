// The guided session: Workspace, Reflect and the summary that follows.
//
// Where this fits: the single path from "start a problem" to "it is recorded".
// app.js dispatches these as SESSION_TABS, which swap the full nav for a
// minimal exit bar so the session stays the focus.
//
// Split out of views.js, which had grown past 3,000 lines holding this
// alongside the dashboard, queue, settings and a dozen shared helpers. This is
// the most intricate part of the app and the part where a bug costs the user
// actual work — it had already eaten a session once — so it is worth being
// able to read on its own.
//
// Rule for anyone editing this: once the code editor or whiteboard is mounted,
// never re-render. See the session.mounted guard in renderWorkspace.

import {
  todayISO, applyOutcome, activateProblem, uid, MISTAKE_TAGS, MOCK_CHECKLIST,
  quizOptions, updateStreak, computePlantState, allAttempts,
  normalizeStatement, MAX_STATEMENT_CHARS, lastAttemptWithCode, mockPhase, MOCK_MINUTES,
  questionPlan, questionPhase, phaseLayout,
  priorAttemptSummary, dayTimerRunning, claimDayTimer, stopDayTimer, adjustDayTimer, ownValue,
} from "./logic.js";
import { prepOf, wantsCleanBar, CLEAN_CODE_BAR } from "./prep.js";
import { todaysRecommendation } from "./recommendation.js";
import { statementSourceHtml } from "./statement-source.js";
import {
  esc, richText, fmtDate, patternName, toast, showTopic, outcomeOptions,
  confirmLoss, outcomeLabel, outcomePill,
} from "./ui.js";
import { TOPICS } from "./topics-content.js";
import { loadCodeMirror, CODE_MODES } from "./codemirror-loader.js";
import { updateDayBudget } from "./chrome.js";
import { pairPlan, readPair, writePair, recordPairStep, pairFinished, recordPairMock } from "./pair-mock.js";
import { createWhiteboard } from "./whiteboard.js";
import { createRepoChannel, createEmitter } from "./session-sync.js";
import { createLiveChannel } from "./live-channel.js";
import { deviceId } from "./session-log.js";
import { storageKey } from "./channel.js";
import { plantSvg } from "./plant.js";
import { patternIcon } from "./icons.js";
import { problemUrl, slugify } from "./catalog.js";
import { report, AppError, isLocalOnly, DRAWINGS_NEED_REPO_NOTE } from "./errors.js";
import { checkpoint, readCheckpoint, clearCheckpoint, isResumable, adjustedStart } from "./session-store.js";
import { installSplitters, loadSizes, gridTemplate, redistribute } from "./split-pane.js";


// ---------- Session: Workspace + Reflect ----------
//
// The single guided path: Dashboard -> Workspace (statement + timer +
// whiteboard + code editor, all in one place) -> Submit -> Reflect (outcome,
// pattern recall, mistakes, soul statement) -> one save -> back to Dashboard.
// `session` carries state across that whole arc; `reflectState` is Reflect's
// own small slice (the pattern-recall answer), reset each time Workspace
// hands off to it.
//
// Rule for anyone editing this: once the code editor or whiteboard is
// mounted, never call actions.rerender() or reset root.innerHTML — either
// destroys the live widget and loses whatever was typed/drawn. Every
// in-session interaction (mark insight, toggle whiteboard, check a checklist
// item) mutates specific DOM nodes directly instead.
//
// That rule used to be only a convention, and it was being broken from outside
// this file: store.flush() emits on the way into a save and again on the way
// out, every emit runs renderAll, and renderAll calls straight back into
// renderWorkspace. So a debounced save landing while someone was mid-problem
// rebuilt the markup underneath them and took the code with it. session.mounted
// now makes the rule something the function enforces rather than something
// callers are trusted to respect — see the guard in renderWorkspace.

// Statement, code, whiteboard. Code gets the largest share because it's where
// the time goes; the statement is a reading column and doesn't need to be as
// wide as the thing you're writing.
const DEFAULT_PANES = [0.3, 0.45, 0.25];
const SPLITTER_PX = 8;

let session = null;
let reflectState = null;

/**
 * Put back a session that a reload interrupted.
 *
 * Called once from app.js before the first render. Returns true when a session
 * was restored, so the caller knows the workspace tab is worth showing.
 *
 * The problem is re-resolved from current state by id rather than trusted from
 * the checkpoint: it may have been edited, or removed entirely, since.
 */
export function restoreSession(state, now = Date.now()) {
  const snap = readCheckpoint();
  if (!snap || !isResumable(snap, now)) {
    if (snap) clearCheckpoint();       // too old to resume, and no use keeping
    return false;
  }
  const problem = state.problems.find((p) => p.id === snap.problemId);
  if (!problem) {
    clearCheckpoint();
    return false;
  }
  session = {
    problem,
    isMock: snap.isMock,
    pair: snap.pair || null,
    // Moved forward by however long the tab was closed, so the clock shows
    // time spent working rather than time since you started.
    startedAt: adjustedStart(snap, now),
    ownsDayClock: snap.ownsDayClock ?? null,
    // How long the tab was gone. The session clock skips it (above); a day
    // clock this session started has been running all that time and gives it
    // back on mount, so the two never disagree about how long you worked.
    awayMs: typeof snap.startedAt === "number" ? Math.max(0, adjustedStart(snap, now) - snap.startedAt) : 0,
    insightAt: snap.insightAt,
    endedAt: null,
    intervalId: null,
    whiteboardCtl: null,
    whiteboardShown: !!snap.whiteboardShown,
    cm: null,
    codeLang: snap.codeLang || null,   // resolved on mount, like a new one
    checklist: snap.checklist || {},
    capturedCode: snap.code || "",
    capturedWhiteboardDataUrl: null,
    mounted: false,
    teardownSplitters: null,
    restoredBoard: snap.whiteboard || [],
  };
  return true;
}

/** How long after starting a session it can still be turned into a mock.
 *  The switch restarts the clock, so it is offered only while little has been
 *  done: the Read phase, roughly. Later, a mock would be a fresh start with
 *  the problem already half-solved, which is not a mock of anything. */
const MOCK_SWITCH_MIN = 5;

export function startSession(problem, { isMock = false, pair = null } = {}) {
  session = {
    problem, isMock: isMock || !!pair,
    // Half of a two-mediums round: { runId, index, budgetMin }. The round
    // itself lives in pair-mock.js; the session only needs its own budget and
    // where to hand back to when it is saved.
    pair,
    // Resolved on first mount by renderWorkspace, which has the store — eight
    // call sites start a session and none of them should have to know about
    // timeboxing. Fixed once and then left alone: changing the box in Settings
    // mid-session must not move the boundaries under someone inside them.
    plan: null,
    startedAt: null, insightAt: null, endedAt: null,
    // Open from the start. It used to appear five minutes in, at the Plan
    // phase — after the first thinking had already happened somewhere else.
    intervalId: null, whiteboardCtl: null, whiteboardShown: true,
    cm: null, codeLang: null, checklist: {},
    capturedCode: "", capturedWhiteboardDataUrl: null,
    mounted: false, teardownSplitters: null,
  };
}

/**
 * Leaving a session without saving it, asked the same way everywhere.
 *
 * There were three ways out of a session — the workspace's exit, Reflect's
 * discard, and the nav's own escape — and three different questions, one of
 * which ("Leave without saving this session?") did not mention that the code
 * goes with it.
 */
export function discardSession(actions) {
  if (!confirmLoss({
    action: "Discard this session?",
    lost: "the code, notes and timer from this one sitting",
    kept: "every rep you have logged before now",
  })) return false;
  abandonSession();
  actions.switchTab("dashboard");
  return true;
}

/** Called when the user exits Workspace or Reflect without saving. */
function abandonSession({ saved = false } = {}) {
  // A saved session stops its clock inside the save, in the same commit.
  if (!saved) session?.releaseDayClock?.();
  clearCheckpoint();
  if (session?.intervalId) clearInterval(session.intervalId);
  if (session?.whiteboardCtl) session.whiteboardCtl.destroy();
  if (session?.teardownSplitters) session.teardownSplitters();
  if (session?.stopWatching) session.stopWatching();
  // Fire and forget. A session that is over must not make anyone wait for a
  // network call, and the two outcomes differ: a saved session's scratch log
  // has been superseded by the attempt and the board PNG, while an abandoned
  // one's is kept, because the next device to open this problem may still want
  // the drawing.
  session?.sync?.stop({ discard: saved }).catch(() => {});
  session?.live?.stop().catch(() => {});
  session = null;
  reflectState = null;
}

/**
 * Run the day clock for as long as this session is open.
 *
 * Starts it if it is not already running and remembers that the session did,
 * so ending the session — saved or discarded — stops it again. A clock you
 * started yourself is left alone at both ends. Runs on every mount, because a
 * restored session has to settle the time it was away (see restoreSession)
 * and needs its release hook back.
 */
function holdDayClock(store) {
  const held = session;
  if (held.ownsDayClock == null) {
    let claimed = false;
    store.mutate((s) => { claimed = claimDayTimer(s); }, "Ledger: day clock");
    held.ownsDayClock = claimed;
    checkpoint(held);
  } else if (held.ownsDayClock && held.awayMs > 0) {
    const awayMin = held.awayMs / 60000;
    store.mutate((s) => { if (dayTimerRunning(s)) adjustDayTimer(s, -awayMin); }, "Ledger: day clock");
  }
  held.awayMs = 0;
  held.releaseDayClock = () => {
    if (held.ownsDayClock) store.mutate((s) => stopDayTimer(s), "Ledger: day clock");
  };
}

/** Checkpoint the live session, if there is one. Called when the tab is hidden. */
export function checkpointSession() {
  if (session?.startedAt) checkpoint(session);
}

/** The problem the open session is on, for the Dashboard's resume card. */
export function currentSessionProblemName() {
  return session?.problem?.name || "A problem";
}

export function hasActiveSession() {
  return session != null;
}

/** The language a new session opens in. */
function preferredLanguage(state) {
  const chosen = prepOf(state).language;
  if (chosen && CODE_MODES[chosen]) return chosen;
  const last = allAttempts(state).filter((a) => a.codeLang && CODE_MODES[a.codeLang]).pop();
  return last?.codeLang || "cpp";
}

function fmtClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function renderWorkspace(root, store, actions) {
  // First, because the active tab is remembered across reloads and the session
  // is not always restored with it: exit a session in a way that leaves the tab
  // set to `workspace` and the next load renders a workspace with nothing in
  // it. This guard was written for that and sat three lines below the first two
  // statements that dereference `session`, so it never ran — the reload threw
  // "cannot read properties of null" and the error boundary took the page.
  if (!session) {
    actions.switchTab("dashboard");
    return;
  }

  // Sync, started once per mounted session. Everything below can emit events
  // whether or not a channel ever connects — the emitter is local, and a
  // channel that cannot reach the repo keeps the log in memory and retries.
  if (!session.sync) startSessionSync(store);

  // The language, decided once, the same way: your chosen one, or failing
  // that whatever you last wrote code in. Every session used to open in C++
  // whatever you actually used, which is one more thing to fix before you can
  // start — and the start is exactly when the clock is running.
  if (!session.codeLang) session.codeLang = preferredLanguage(store.state);

  // The box for this question, from this user's settings, decided once.
  if (!session.plan) {
    session.plan = session.pair
      ? pairPlan(session.pair.budgetMin)
      : session.isMock
        ? { totalMin: MOCK_MINUTES, phases: [] }
        : questionPlan(store.state, session.problem.difficulty);
  }

  const state = store.state;
  const p = session.problem;
  const header = `
    <div class="row gap-sm" id="ws-pills">
      <span class="pill">${esc(patternName(state, p.patternId))}</span>
      <span class="pill pill-muted">${esc(p.difficulty)}</span>
      ${p.number ? `<span class="pill pill-muted">#${p.number}</span>` : ""}
      ${session.pair
        ? `<span class="pill pill-warn">Two-mediums mock · ${session.pair.index + 1} of 2</span>`
        : session.isMock ? `<span class="pill pill-warn">Mock</span>` : ""}
    </div>
    <h2 class="session-problem-title">${esc(p.name)}</h2>`;
  const readUrl = problemUrl(p);

  // Arriving is starting. There used to be a page in between — "read it,
  // then start the clock" — which did not show the problem, did not show the
  // board, and was one more click between choosing a problem and working on
  // it. The Read phase is the first five minutes of the clock instead, with
  // the statement and the board both on screen.
  if (!session.startedAt) {
    session.startedAt = Date.now();
    checkpoint(session);
  }

  // The editor and board are live DOM widgets, so this markup may only ever be
  // built once per session. Anything that would previously have re-rendered —
  // a sync finishing, a statement being saved — now lands here and stops.
  if (session.mounted && root.querySelector("#ws-panes")) return;

  root.innerHTML = `
    <div class="ws">
      <div class="ws-bar">
        <div class="ws-bar-id">${header}</div>
        <div class="session-clock-group">
          <div class="session-clock" id="ws-clock">00:00</div>
          <!-- The day budget, which the floating plant panel carries everywhere
               else and cannot carry here: in a session it lands on the
               whiteboard canvas. The number matters most while you are head
               down in a problem, so it moves into the bar rather than going
               away. -->
          <div class="session-day" id="ws-day"></div>
        </div>
        <div class="mock-phase" id="ws-mock-phase"></div>
        <div class="ws-bar-actions">
          ${session.isMock ? "" : `<button type="button" class="btn btn-ghost btn-sm" id="ws-make-mock"
            title="Restart the clock at ${MOCK_MINUTES} minutes, with the prompts an interviewer would give">Make it a mock</button>`}
          <button type="button" class="btn btn-ghost btn-sm" id="ws-mark-insight" ${session.insightAt ? "disabled" : ""}>
            ${session.insightAt ? `Insight at ${Math.round((session.insightAt - session.startedAt) / 60000)} min` : "I've got my approach"}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" id="ws-toggle-board"
                  aria-pressed="${session.whiteboardShown}">Whiteboard</button>
          ${readUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(readUrl)}" target="_blank" rel="noopener noreferrer"
            title="Re-read the problem without losing the timer">Problem &#8599;</a>
          <button type="button" class="btn btn-ghost btn-sm" id="ws-run-on-leetcode"
            title="Copy your code and open the problem, ready to paste and run">Run on LeetCode &#8599;</button>` : ""}
          <button class="btn btn-primary btn-sm" id="ws-submit">${session.pair?.index === 0 ? "Submit — then the second" : "Submit solution"}</button>
          <button class="btn btn-ghost btn-sm session-exit" id="ws-exit">Exit</button>
        </div>
      </div>
      <div class="ws-panes" id="ws-panes">
        <section class="ws-pane" id="ws-pane-statement" aria-label="Problem statement">
          <header class="ws-pane-head">
            <span class="label">Problem</span>
            <button type="button" class="btn btn-ghost btn-xs" id="ws-edit-statement"
              ${p.statement ? "" : "hidden"}>Edit</button>
          </header>
          <div class="ws-pane-body" id="ws-statement-body">${priorHtml(p)}${statementHtml(p, { hasRepo: !!store.gh })}</div>
        </section>
        <div class="ws-splitter" data-splitter="0" role="separator" tabindex="0"
             aria-orientation="vertical" aria-label="Resize problem and code panes"></div>
        <section class="ws-pane" id="ws-pane-code" aria-label="Code editor">
          <header class="ws-pane-head">
            <span class="label">Your code</span>
            <select class="select select-xs" id="ws-code-lang" aria-label="Language">
              ${Object.entries(CODE_MODES).map(([k, v]) => `<option value="${k}" ${k === session.codeLang ? "selected" : ""}>${v.label}</option>`).join("")}
            </select>
          </header>
          <div class="ws-pane-body ws-pane-body-flush">
            <div id="ws-code-editor" class="code-editor-host code-editor-fill"></div>
            ${(() => {
              // Behind a <details> on purpose. Coming back to a problem you
              // solved a month ago is when your old solution is worth the
              // most, and showing it up front would hand you the answer
              // before you'd tried — which is the one thing this whole app
              // exists to prevent.
              const prior = lastAttemptWithCode(p);
              if (!prior) return "";
              return `
                <details class="ws-prior-code">
                  <summary class="muted small">Show what you wrote on ${fmtDate(prior.date)}
                    — only worth opening once you've had a go</summary>
                  ${prior.soulStatement ? `<blockquote class="ws-prior-note">${esc(prior.soulStatement)}</blockquote>` : ""}
                  <pre class="code-view-pre">${esc(prior.code)}</pre>
                </details>`;
            })()}
            ${session.isMock ? `
            <div class="ws-checklist">
              <p class="label">Verbalization checklist</p>
              <ul class="checklist">
                ${MOCK_CHECKLIST.map((item, i) => `<li><label><input type="checkbox" data-ws-check="${i}" ${session.checklist[i] ? "checked" : ""} /><span>${esc(item)}</span></label></li>`).join("")}
              </ul>
            </div>` : ""}
          </div>
        </section>
        <div class="ws-splitter" data-splitter="1" role="separator" tabindex="0"
             aria-orientation="vertical" aria-label="Resize code and whiteboard panes"></div>
        <section class="ws-pane" id="ws-pane-board" aria-label="Whiteboard">
          <header class="ws-pane-head">
            <span class="label">Whiteboard</span>
            <!-- Closing the board from the board is the obvious gesture; the
                 toolbar button is how it comes back once it's gone. -->
            <button type="button" class="btn btn-ghost btn-xs" id="ws-close-board"
                    title="Minimize whiteboard" aria-label="Minimize whiteboard">&minus;</button>
          </header>
          <div class="ws-pane-body ws-pane-body-flush"><div id="ws-board-host" class="board-host"></div></div>
        </section>
      </div>
    </div>`;
  session.mounted = true;
  holdDayClock(store);

  clearInterval(session.intervalId);
  session.intervalId = setInterval(() => {
    const clock = document.getElementById("ws-clock");
    if (!clock) {
      clearInterval(session.intervalId);
      return;
    }
    const elapsedMin = (Date.now() - session.startedAt) / 60000;

    // Every session counts down now, not only a mock. The clock in an
    // interview is the constraint rather than a stopwatch, and a session with
    // no box could absorb the whole day's budget on one medium — which is not
    // the thing being practised.
    const phase = session.isMock && !session.pair
      ? mockPhase(elapsedMin)
      : questionPhase(elapsedMin, session.plan);

    clock.textContent = (phase.overrun ? "+" : "") + fmtClock(Math.abs(phase.remainingMin) * 60000);
    clock.classList.toggle("clock-urgent", !phase.overrun
      && (phase.urgent ?? phase.remainingMin <= session.plan.totalMin * 0.15));
    clock.classList.toggle("clock-overrun", phase.overrun);

    const host = document.getElementById("ws-mock-phase");
    // Written only when the phase or the ending-soon nudge changes, not four
    // times a second: replacing this text continuously would make it
    // unreadable and would fight a screen reader trying to announce it.
    const stamp = `${phase.index}:${phase.endingSoon ? 1 : 0}`;
    if (host && host.dataset.phase !== stamp) {
      host.dataset.phase = stamp;
      const nudge = phase.endingSoon && phase.nextLabel
        ? `<span class="mock-phase-next">${esc(phase.nextLabel)} next</span>` : "";
      host.innerHTML = `<span class="mock-phase-label">${esc(phase.label)}</span>
        <span class="mock-phase-prompt">${esc(phase.prompt)}</span>${nudge}`;
    }
    updateDayBudget(document.getElementById("ws-day"), store.state);
    if (elapsedMin > MOCK_SWITCH_MIN) document.getElementById("ws-make-mock")?.remove();

    // Follows the phase, not the clock: only a change of phase moves anything,
    // so this costs nothing on the other three ticks a second.
    if (!session.isMock) layoutForPhase(phase.key);
  }, 250);

  // ---- panes ----
  //
  // Sizes are written straight onto the grid rather than re-rendered, for the
  // same reason as everything else in here: the panes have live widgets in
  // them. applyPanes() is the single place that turns the fractions into
  // layout, so a drag, a keyboard nudge and the whiteboard toggle all land the
  // same way.
  const panes = root.querySelector("#ws-panes");
  const boardHost = root.querySelector("#ws-board-host");
  const visible = () => [true, true, session.whiteboardShown];
  let sizes = loadSizes(DEFAULT_PANES);

  // Once you drag a splitter, the app stops moving the panes for you — for the
  // rest of the session, not just the rest of the phase. A layout that keeps
  // reasserting itself over a deliberate adjustment is worse than one that
  // never helps, because you cannot tell whether your drag took.
  let phaseLayoutIsAdvisory = true;
  let lastLaidOutPhase = null;

  const applyPanes = (next) => {
    sizes = next;
    panes.style.gridTemplateColumns = gridTemplate(next, visible(), SPLITTER_PX);
    root.querySelector("#ws-pane-board").hidden = !session.whiteboardShown;
    root.querySelector('[data-splitter="1"]').hidden = !session.whiteboardShown;
    // CodeMirror caches its own width and will keep drawing at the old size —
    // including putting the cursor in the wrong place — until it is told.
    if (session.cm) session.cm.refresh();
    if (session.whiteboardCtl?.resize) session.whiteboardCtl.resize();
  };
  applyPanes(redistribute(sizes, visible(), DEFAULT_PANES));

  /**
   * Move the emphasis to whichever surface the phase is about.
   *
   * The whiteboard is opened for the planning phase if it is closed, because
   * "plan" with the board hidden is the phase without its instrument. It is not
   * closed again afterwards: shutting a panel someone is looking at is the kind
   * of help nobody asks for twice.
   */
  const layoutForPhase = (phaseKey) => {
    if (!phaseLayoutIsAdvisory || phaseKey === lastLaidOutPhase) return;
    lastLaidOutPhase = phaseKey;
    // setBoard handles creating the canvas on first show and replaying a
    // recovered drawing onto it; it also applies panes, which the line below
    // then overrides with the phase's own emphasis.
    if (phaseKey === "plan" && !session.whiteboardShown) setBoard(true);
    applyPanes(redistribute(phaseLayout(phaseKey), visible(), DEFAULT_PANES));
  };

  session.teardownSplitters = installSplitters({
    container: panes,
    getSizes: () => sizes,
    setSizes: (next) => {
      sizes = next;
      // A deliberate drag ends the app's involvement for the rest of the
      // session. A layout that reasserts itself over an adjustment is worse
      // than one that never helps, because you cannot tell if your drag took.
      phaseLayoutIsAdvisory = false;
    },
    apply: applyPanes,
  });

  // One function behind both controls — the toolbar toggle and the minimize
  // button on the board itself — so they can't disagree about the state.
  const boardBtn = root.querySelector("#ws-toggle-board");
  const setBoard = (shown) => {
    session.whiteboardShown = shown;
    boardBtn.setAttribute("aria-pressed", String(shown));
    // Created on first show rather than up front: someone who never opens the
    // board shouldn't pay for a canvas and its listeners.
    if (shown && !session.whiteboardCtl) {
      session.whiteboardCtl = createWhiteboard(boardHost, {
        // Each change becomes an event. The board does not know that; it
        // reports what happened and this decides where it goes.
        onAdd: (el) => session.emitter?.emit("element", el),
        onUpdate: (el) => session.emitter?.emit("element-move", el),
        onRemove: (id) => session.emitter?.emit("element-del", { id }),
        onClear: () => session.emitter?.emit("board-clear"),
      });
      // A drawing recovered from a checkpoint is replayed onto the fresh
      // canvas; strokes are resolution-independent so the pane's current size
      // doesn't matter.
      if (session.restoredBoard?.length) {
        session.whiteboardCtl.restore(session.restoredBoard);
        session.restoredBoard = null;
      }
      boardHost.addEventListener("pointerup", () => checkpoint(session));
    }
    applyPanes(redistribute(sizes, visible(), DEFAULT_PANES));
  };
  boardBtn.addEventListener("click", () => setBoard(!session.whiteboardShown));
  root.querySelector("#ws-close-board").addEventListener("click", () => setBoard(false));
  // A session restored from a checkpoint can arrive with the board already
  // open, which nothing else would act on: until restore existed, the board
  // was always closed at mount and could only be created by the toggle.
  if (session.whiteboardShown) setBoard(true);

  const codeHost = root.querySelector("#ws-code-editor");
  const langSelect = root.querySelector("#ws-code-lang");
  loadCodeMirror().then((CodeMirror) => {
    if (!codeHost.isConnected || session?.cm) return; // tab left, or already mounted
    session.cm = CodeMirror(codeHost, {
      value: session.capturedCode,
      mode: CODE_MODES[session.codeLang].mode,
      lineNumbers: true,
      viewportMargin: Infinity,
    });
    // Debounced: typing shouldn't write to storage on every keystroke, but a
    // second of idle is short enough that nothing meaningful is ever lost.
    let codeTimer = null;
    session.cm.on("change", () => {
      clearTimeout(codeTimer);
      codeTimer = setTimeout(() => {
        checkpoint(session);
        // Sent as a whole snapshot rather than a diff, which is only correct
        // because exactly one device is ever typing — see the code lease in
        // docs/realtime-architecture.md. Watching somebody code is watching
        // them think, and a second of lag is the difference between that and
        // reading a transcript.
        session.emitter?.emit("code", { text: session.cm.getValue(), lang: session.codeLang });
      }, 1000);
    });
  });
  langSelect.addEventListener("change", () => {
    session.codeLang = langSelect.value;
    if (session.cm) session.cm.setOption("mode", CODE_MODES[session.codeLang].mode);
    if (session.cm) session.emitter?.emit("code", { text: session.cm.getValue(), lang: session.codeLang });
  });

  // A link somebody can open to watch this session. Both halves live in the
  // fragment, which is never sent to a server — so the room id stays out of
  // access logs and out of whatever scans a link pasted into a chat.
  root.querySelector("#ws-share")?.addEventListener("click", async () => {
    const relayUrl = store.state?.settings?.relayUrl;
    if (!relayUrl) {
      toast("Set a live sync relay in Settings first — without one there is nothing to watch.");
      return;
    }
    const link = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}interview.html`
      + `#${encodeURIComponent(`${relayUrl}|${session.syncId}`)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied. They will see the problem, your board and your code — nothing else.");
    } catch (_) {
      // Clipboard access can be refused, and a share button that fails silently
      // is worse than one that makes you select the text yourself.
      prompt("Copy this and send it to them:", link);
    }
  });

  // Getting the code into LeetCode's own editor is as close as a web page can
  // come: nothing on this origin can write into a page on theirs, and their
  // run endpoint needs a session and a CSRF token that only their own site
  // has. So this does the two steps the user would otherwise do by hand —
  // copy, then open — and leaves them one paste away from hitting Run.
  const runBtn = root.querySelector("#ws-run-on-leetcode");
  if (runBtn) {
    runBtn.addEventListener("click", async () => {
      const code = session.cm ? session.cm.getValue() : "";
      if (!code.trim()) {
        toast("Nothing to copy yet — write some code first.");
        return;
      }
      try {
        await navigator.clipboard.writeText(code);
        window.open(readUrl, "_blank", "noopener");
        toast("Code copied. Paste it into LeetCode's editor and run.");
      } catch (_) {
        // Clipboard access can be refused outright, and opening the tab
        // without the code would be the worst of both.
        toast("Couldn't copy to the clipboard — select the code and copy it manually.");
      }
    });
  }

  wireStatementPane(root, store, p);

  // Choosing a mock used to be a checkbox on a page before the clock started.
  // That page is gone, so the choice moved here, for the first few minutes.
  root.querySelector("#ws-make-mock")?.addEventListener("click", (e) => {
    if (session.isMock) return;
    session.isMock = true;
    session.plan = { totalMin: MOCK_MINUTES, phases: [] };
    session.startedAt = Date.now();
    checkpoint(session);
    e.target.remove();
    root.querySelector("#ws-pills")?.insertAdjacentHTML("beforeend", `<span class="pill pill-warn">Mock</span>`);
    const phaseHost = document.getElementById("ws-mock-phase");
    if (phaseHost) delete phaseHost.dataset.phase;
  });

  root.querySelector("#ws-mark-insight").addEventListener("click", (e) => {
    if (session.insightAt) return;
    session.insightAt = Date.now();
    e.target.textContent = `Insight at ${Math.round((session.insightAt - session.startedAt) / 60000)} min`;
    e.target.disabled = true;
    checkpoint(session);
  });

  root.querySelectorAll("[data-ws-check]").forEach((cb) => {
    cb.addEventListener("change", () => {
      session.checklist[cb.dataset.wsCheck] = cb.checked;
      checkpoint(session);
    });
  });

  root.querySelector("#ws-submit").addEventListener("click", () => {
    session.endedAt = Date.now();
    clearInterval(session.intervalId);
    if (session.cm) session.capturedCode = session.cm.getValue().trim();
    if (session.whiteboardCtl && !session.whiteboardCtl.isEmpty()) {
      session.capturedWhiteboardDataUrl = session.whiteboardCtl.toDataUrl();
    }
    reflectState = { patternAnswered: null, options: quizOptions(store.state, p.patternId) };
    actions.switchTab("reflect");
  });

  root.querySelector("#ws-exit").addEventListener("click", () => discardSession(actions));
}

const FETCH_STATEMENT_BUTTON = `<button type="button" class="btn btn-ghost btn-sm" id="ws-fetch-statement">Fetch it for me</button>`;

/**
 * The problem statement pane.
 *
 * The app ships no statement text: the catalog carries titles, difficulties
 * and pattern labels, and the prose belongs to whoever published the problem.
 * So the statement is the user's own copy, pasted once and then kept in their
 * private repo — which is why this reads and writes it rather than fetching
 * anything.
 *
 * Pasting it once is worth it because the alternative is what this used to be:
 * a link that throws you into another tab, where the timer isn't, every time
 * you need to re-read a constraint.
 */
function statementHtml(problem, { loading = false, hasRepo = true } = {}) {
  if (loading) return `<p class="muted small">Looking for a synced copy…</p>`;
  if (!problem.statement) {
    return `
      <div class="ws-statement-empty">
        <p class="muted small">No statement synced for this one yet. Paste it here and it stays
        with the problem${hasRepo ? " — or ask the sync job to fetch it, which takes a minute or two" : ""}.</p>
        ${hasRepo ? FETCH_STATEMENT_BUTTON : ""}
        <textarea class="textarea ws-statement-input" id="ws-statement-input" rows="10"
          placeholder="Paste the problem statement, constraints and examples…"></textarea>
        <button type="button" class="btn btn-sm btn-primary" id="ws-save-statement">Save statement</button>
      </div>`;
  }
  return `<div class="ws-statement">${richText(problem.statement)}</div>
    ${statementSourceHtml(problem)}`;
}

/**
 * What you did last time, above the statement.
 *
 * Only the half that cannot hand you the answer: the outcome, how long it
 * took, whether you named the pattern, and which mistakes you tagged. That
 * last one is the most useful and the least dangerous — "off by one, edge case
 * missed" is a thing to watch for, not a solution.
 *
 * Your note and your code stay in the closed `<details>` in the code pane. A
 * soul statement is usually the insight itself, which is exactly what you are
 * here to reproduce.
 */
function priorHtml(problem) {
  const prior = priorAttemptSummary(problem);
  if (!prior) return "";

  const facts = [
    prior.timeToInsightMin != null ? `${prior.timeToInsightMin} min to the approach` : null,
    prior.timeToSolveMin != null ? `${prior.timeToSolveMin} min in total` : null,
    prior.recalledPattern ? "you named the pattern" : "you missed the pattern",
  ].filter(Boolean);

  return `
    <div class="ws-prior">
      <p class="ws-prior-head">
        <span class="pill ${esc(outcomePill(prior.outcome))}">${esc(outcomeLabel(prior.outcome))}</span>
        <span class="muted small">last time, ${esc(fmtDate(prior.date))}${
          prior.attemptNumber > 1 ? ` · attempt ${prior.attemptNumber + 1} coming up` : ""}</span>
      </p>
      <p class="muted small">${esc(facts.join(" · "))}.</p>
      ${prior.mistakeTags.length
        ? `<p class="small ws-prior-watch">Worth watching for:
           ${prior.mistakeTags.map((t) => `<span class="pill pill-warn">${esc(t.replace(/-/g, " "))}</span>`).join(" ")}</p>`
        : ""}
      ${prior.note || prior.hasCode
        ? `<p class="muted small">What you wrote and the code you got to are in the code pane,
           behind a fold — worth opening after you have had a go, not before.</p>`
        : ""}
    </div>`;
}


/**
 * Attach this session to its durable log.
 *
 * What makes handoff work: the log is read once at mount, so a device that was
 * asleep replays whatever the other one drew, and from then on each stroke is
 * appended and pushed on a coarse debounce.
 *
 * Deliberately not fatal. If there is no connection, or no repo configured at
 * all, the emitter still exists and the session still works exactly as it did
 * before any of this — the strokes live in the canvas and in the local
 * checkpoint, which is where they lived already.
 */
function startSessionSync(store) {
  const sessionId = session.syncId || (session.syncId = uid());
  const device = deviceId(localStorage, storageKey("ledger.device"));

  // Two channels, same events, neither aware of the other. The repo is durable
  // and slow — it is what survives a closed tab. The relay is fast and forgets,
  // and is what makes a stroke appear on the other screen while you are still
  // drawing it. Events carry ids, so arriving by both routes is a no-op.
  const durable = store.gh ? createRepoChannel({ gh: store.gh, sessionId }) : null;
  const relayUrl = store.state?.settings?.relayUrl || "";
  const live = relayUrl
    ? createLiveChannel({ relayUrl, sessionId, deviceId: device })
    : null;

  session.sync = durable;
  session.live = live;
  session.emitter = createEmitter({
    sessionId, deviceId: device, channels: [durable, live].filter(Boolean),
  });

  if (live) {
    // Applied element by element rather than by replacing the board: a full
    // restore mid-session would drop a selection and fight a drag, and the
    // whole point of this channel is that it lands while you are working.
    live.subscribe((event) => {
      const p = event.payload || {};

      // Somebody joined with no history. The relay stores nothing, so they are
      // looking at an empty board and have no way to know it is wrong; this is
      // the only moment anyone can tell them.
      if (event.kind === "hello") {
        answerHello();
        return;
      }
      // What the interviewer sends back. Held on the session so the reflection
      // form can offer it when the session is saved.
      if (event.kind === "rubric") {
        session.observed = { ...(session.observed || {}), ...(p.observed || {}) };
        if (p.rating != null) session.observedRating = p.rating;
        return;
      }
      if (event.kind === "note") {
        session.interviewerNotes = [...(session.interviewerNotes || []), { at: event.at, text: p.text || "" }];
        toast("Note from your interviewer.");
        return;
      }

      const ctl = session.whiteboardCtl;
      if (!ctl) return;
      if (event.kind === "element" || event.kind === "stroke") ctl.applyRemote({ id: event.id, ...p });
      else if (event.kind === "element-move") ctl.applyRemote({ ...ctl.toJSON().find((e) => e.id === p.id), ...p });
      else if (event.kind === "element-del" || event.kind === "stroke-undo") ctl.removeRemote(p.id ?? p.strokeId);
      else if (event.kind === "board-clear") ctl.restore([]);
    });
    live.start();
  }

  /** Re-send everything a newcomer needs: what the problem is, when the clock
   *  started, and the board as it stands. Cheap, and only ever in response to
   *  somebody actually arriving. */
  function answerHello() {
    if (!session?.emitter) return;
    session.emitter.emit("session", {
      problemId: session.problem.id,
      problemName: session.problem.name,
      difficulty: session.problem.difficulty,
      statement: session.problem.statement || "",
      url: problemUrl(session.problem) || "",
      plan: session.plan,
    });
    if (session.startedAt) {
      session.emitter.emit("timer", { action: "start" }, session.startedAt);
    }
    const elements = session.whiteboardCtl?.toJSON() || [];
    // A wholesale replacement rather than one event per element: the newcomer's
    // board is empty, and `board` is the kind that already means "this is
    // everything".
    session.emitter.emit("board", { strokes: elements, absorbed: {} });
    if (session.cm) {
      session.emitter.emit("code", { text: session.cm.getValue(), lang: session.codeLang });
    }
  }

  // Said once, so a log that already exists is described rather than replayed
  // silently — coming back to a drawing you made on another device should be
  // visible, not mysterious.
  // Enough for a view that has never seen the practice log to know what is
  // being worked, and nothing more. No attempts, no notes, no history — the
  // other side receives events from this session and there is nothing else on
  // it to ask for.
  session.emitter.emit("session", {
    problemId: session.problem.id,
    problemName: session.problem.name,
    difficulty: session.problem.difficulty,
    statement: session.problem.statement || "",
    url: problemUrl(session.problem) || "",
    plan: session.plan,
  });

  if (!durable) return;

  durable.subscribe(() => {
    // The durable channel delivers in bulk on a poll, so the board is redrawn
    // from the reduced log rather than patched event by event — cheap, and it
    // cannot drift from what the events say.
    const ctl = session.whiteboardCtl;
    if (!ctl || ctl.isDrawing?.()) return;   // never yank the line under a moving pen
    ctl.restore(durable.state.strokes);
  });

  durable.start().then((state) => {
    if (!session || session.syncId !== sessionId) return;   // session ended while loading
    if (!state.strokes.length) return;
    session.restoredBoard = state.strokes;
    if (session.whiteboardCtl && !session.whiteboardCtl.isDrawing()) {
      session.whiteboardCtl.restore(state.strokes);
    }
    toast("Picked up the drawing from your other device.");
  }).catch(() => {
    /* offline is a normal state; the session works without a channel */
  });
  session.stopWatching = durable.watch();
}

function wireStatementPane(root, store, problem) {
  const body = root.querySelector("#ws-statement-body");
  const editBtn = root.querySelector("#ws-edit-statement");

  // A statement the sync Action already fetched beats asking the user to paste
  // one. It isn't in state.json — statements are one file per problem so the
  // synced document stays under the API's size limit — so it's read on demand,
  // and only when there's nothing stored locally already.
  if (!problem.statement) {
    const slug = problem.catalogSlug || slugify(problem.name);
    body.innerHTML = statementHtml(problem, { loading: true, hasRepo: !!store.gh });
    store.fetchStatement(slug).then((fetched) => {
      // The session can end while this is in flight, and the pane it was going
      // to paint would then belong to a different problem or be gone entirely.
      if (!body.isConnected || session?.problem?.id !== problem.id) return;
      if (fetched) saveStatement(store, problem, fetched, "leetcode");
      repaint();
    });
  }

  // Only this pane is ever rebuilt. Resetting the workspace root would take
  // the editor and the whiteboard with it.
  const repaint = () => {
    body.innerHTML = statementHtml(problem, { hasRepo: !!store.gh });
    editBtn.hidden = !problem.statement;
    wireSave();
  };

  function wireSave() {
    const saveBtn = body.querySelector("#ws-save-statement");
    if (!saveBtn) return;
    saveBtn.addEventListener("click", () => {
      const input = body.querySelector("#ws-statement-input");
      const { text, truncated } = normalizeStatement(input.value);
      if (!text) {
        toast("Paste the problem text first, then save.");
        input.focus();
        return;
      }
      saveStatement(store, problem, text, "pasted");
      repaint();
      if (truncated) toast(`Saved, but trimmed to ${MAX_STATEMENT_CHARS.toLocaleString()} characters.`);
    });
  }

  // Bound on the pane, which survives the repaints the paste box does not.
  body.addEventListener("click", async (event) => {
    if (!event.target.closest("#ws-fetch-statement")) return;
    const btn = event.target.closest("#ws-fetch-statement");
    btn.disabled = true;
    btn.textContent = "Asking…";
    try {
      await store.requestStatements();
      // Deliberately not promising it will appear: the job fetches twenty per
      // run and this problem may not be in the first twenty.
      toast("Asked GitHub to fetch statements. Check back in a minute or two.");
      btn.textContent = "Asked";
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Fetch it for me";
      // Not a fault: the button is hidden without a repo, so this only happens if the repo went away
      // while the pane was open.
      if (isLocalOnly(err)) { toast(err.message); return; }
      report(new AppError(err.message || "Couldn't start the sync job.",
        { code: err.code || "dispatch_failed", cause: err }), "asking for statements");
    }
  });

  const openEditor = ({ keepText }) => {
    const current = keepText ? problem.statement || "" : "";
    body.innerHTML = `
      <div class="ws-statement-empty">
        ${keepText ? "" : `<p class="muted small">Replacing the statement. Fetch it again, or paste
          the right one — whichever you save wins.</p>
          ${store.gh ? FETCH_STATEMENT_BUTTON : ""}`}
        <textarea class="textarea ws-statement-input" id="ws-statement-input" rows="14">${esc(current)}</textarea>
        <button type="button" class="btn btn-sm btn-primary" id="ws-save-statement">Save statement</button>
      </div>`;
    editBtn.hidden = true;
    wireSave();
  };

  // Edit keeps what is there — a typo, a missing constraint. Replace clears
  // it and offers the fetch again, which is the only way back from a
  // statement synced against the wrong problem.
  editBtn.addEventListener("click", () => openEditor({ keepText: true }));
  body.addEventListener("click", (event) => {
    if (event.target.closest("#ws-replace-statement")) openEditor({ keepText: false });
  });

  wireSave();
}

/**
 * Store a statement, with where it came from.
 *
 * The fetched path used to assign straight onto the problem object, which is
 * the same object that lives in state — so it changed the app's data without
 * going through mutate: never cached, never synced, and present only until the
 * tab closed. It looked like it worked, and the next session fetched it again.
 */
function saveStatement(store, problem, text, source) {
  const meta = { source, at: todayISO() };
  store.mutate((s) => {
    const stored = s.problems.find((x) => x.id === problem.id);
    if (!stored) return;
    stored.statement = text;
    stored.statementMeta = meta;
  }, `Ledger: statement for ${problem.name}`);
  // Keeps the in-session object in step so the pane repaints without
  // re-reading state.
  problem.statement = text;
  problem.statementMeta = meta;
}

function patternRevealHtml(state, problem, correctPatternId) {
  const t = ownValue(TOPICS, correctPatternId);
  const siblings = state.problems.filter((x) => x.patternId === correctPatternId && x.id !== problem.id).slice(0, 3);
  return `
    ${t ? `<p><strong>Why:</strong> ${esc(t.concept)}</p><p><strong>Invariant:</strong> ${esc(t.invariant)}</p>` : ""}
    ${siblings.length ? `<p class="muted small">Related in this pattern: ${siblings.map((s) => esc(s.name)).join(", ")}</p>` : ""}`;
}

/**
 * The feedback sentence plus the reveal, for Reflect's pattern question.
 * One function behind both paints (first render from a restored answer, and
 * the in-place update after a click) so they cannot drift apart.
 */
function patternRevealMarkup(state, problem, correct) {
  return `<p class="quiz-feedback">${correct
    ? "Correct — that's the core pattern."
    : `The core pattern is <strong>${esc(patternName(state, problem.patternId))}</strong>.`}</p>${patternRevealHtml(state, problem, problem.patternId)}`;
}

export function renderReflect(root, store, actions) {
  if (!session || !reflectState) {
    actions.switchTab("dashboard");
    return;
  }
  const state = store.state;
  const p = session.problem;
  const insightMin = session.insightAt ? Math.round((session.insightAt - session.startedAt) / 60000) : null;
  const solveMin = session.endedAt ? Math.round((session.endedAt - session.startedAt) / 60000) : null;

  const answered = reflectState.patternAnswered;
  const revealMarkup = answered ? patternRevealMarkup(state, p, answered === p.patternId) : "";

  root.innerHTML = `
    <div class="card">
      <h2>${esc(p.name)} — reflect</h2>
      <p class="muted small">${insightMin != null ? `${insightMin} min to insight, ` : ""}${solveMin != null ? `${solveMin} min total` : ""}</p>

      <form id="reflect-form" class="form">
        <label class="field"><span class="label">Outcome</span>
          <select class="select" name="outcome">
            ${outcomeOptions()}
          </select></label>

        <div class="field" id="pattern-recall">
          <span class="label">What was the core pattern here?</span>
          <p class="muted small" style="margin:0 0 0.4rem">Answer before saving, even when you're
          sure. Retrieving it yourself is what moves a pattern into memory — recognizing it in a
          list afterwards doesn't.</p>
          <div class="quiz-options">
            ${reflectState.options.map((optId) => {
              // Answered state lives in reflectState, not in the DOM: recording
              // the recall stat triggers a store mutation, which re-renders this
              // whole view. Markup that only got its answered state from a click
              // handler lost it on that re-render — and the early-return guard
              // then refused every retry, so the session could never be saved.
              const classes = ["quiz-option"];
              if (answered) {
                if (optId === p.patternId) classes.push("correct");
                else if (optId === answered) classes.push("incorrect");
              }
              return `<button type="button" class="${classes.join(" ")}" data-pattern-answer="${esc(optId)}" ${answered ? "disabled" : ""}><span class="pattern-icon">${patternIcon(optId, { size: 15 })}</span>${esc(patternName(state, optId))}</button>`;
            }).join("")}
          </div>
          <div id="pattern-reveal" class="pattern-reveal" ${answered ? "" : "hidden"}>${answered ? revealMarkup : ""}</div>
        </div>

        <div class="field">
          <span class="label">Mistake tags</span>
          <div class="chip-group">
            ${MISTAKE_TAGS.map((t) => `<label class="chip"><input type="checkbox" name="mistakeTags" value="${t}" />${t.replace(/-/g, " ")}</label>`).join("")}
          </div>
        </div>

        ${wantsCleanBar(state) ? `
        <div class="field clean-bar">
          <span class="label">The clean-code bar</span>
          <p class="muted small">Your target grades the code as well as the answer. Tick what was true of
          what you wrote — not what you would have done with more time.</p>
          <ul class="checklist">
            ${CLEAN_CODE_BAR.map((c) => `<li><label>
              <input type="checkbox" name="cleanBar" value="${c.key}" />
              <span><strong>${esc(c.label)}</strong> <span class="muted small">— ${esc(c.why)}</span></span>
            </label></li>`).join("")}
          </ul>
        </div>` : ""}

        <label class="field"><span class="label">Soul statement <span class="muted small" style="font-weight:400">— optional, but this is the part worth having in six months</span></span>
          <textarea class="textarea" name="soulStatement" rows="4" placeholder="What was your confusion, and what clicked?"></textarea></label>

        ${session.isMock ? `
        <label class="field"><span class="label">Communication rating (1-5)</span>
          <input class="input" type="number" min="1" max="5" name="communicationRating" /></label>` : ""}

        <div class="row gap">
          <!-- Deliberately never disabled. It used to be, with its label
               swapped for an instruction — but nothing in the stylesheet
               made a disabled button look disabled, so it rendered as a bright,
               fully-opaque primary button that did nothing at all when pressed.
               A control that looks pressable and silently ignores you is worse
               than one that explains itself, so the requirement is enforced on
               submit instead, where it can say what it wants and point at it. -->
          <button class="btn btn-primary" type="submit" id="reflect-save">Save &amp; finish
            <kbd class="btn-kbd">&#8984;&crarr;</kbd></button>
          <button class="btn btn-ghost" type="button" id="reflect-discard">Discard this session</button>
        </div>
      </form>
    </div>`;

  const form = root.querySelector("#reflect-form");

  // The form is entirely keyboard-reachable, but finishing meant a trip to the
  // mouse. Cmd/Ctrl+Enter is the convention for "submit this text form".
  form.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  root.querySelectorAll("[data-pattern-answer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (reflectState.patternAnswered) return;
      const chosen = btn.dataset.patternAnswer;
      reflectState.patternAnswered = chosen;
      const correct = chosen === p.patternId;

      // Updated in place rather than by re-rendering. This form holds an
      // outcome, mistake tags and a soul statement the user may already have
      // filled in, and rebuilding the markup would discard all of it. The
      // markup above still derives from reflectState, so a re-render triggered
      // by anything else restores this same state rather than losing it.
      root.querySelectorAll("[data-pattern-answer]").forEach((b) => {
        b.disabled = true;
        if (b.dataset.patternAnswer === p.patternId) b.classList.add("correct");
        else if (b === btn) b.classList.add("incorrect");
      });
      const revealHost = root.querySelector("#pattern-reveal");
      revealHost.innerHTML = patternRevealMarkup(state, p, correct);
      revealHost.hidden = false;
      root.querySelector("#pattern-recall")?.classList.remove("needs-answer");
    });
  });

  root.querySelector("#reflect-discard").addEventListener("click", () => discardSession(actions));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!reflectState.patternAnswered) {
      // Answering first is the point of the step, not red tape: retrieving the
      // pattern yourself is the rep. So this refuses, but never silently —
      // it says why and puts the question back in front of you.
      const recall = root.querySelector("#pattern-recall");
      recall.classList.remove("needs-answer");
      void recall.offsetWidth;            // restart the flash if it is already on
      recall.classList.add("needs-answer");
      recall.scrollIntoView({ block: "center", behavior: "smooth" });
      root.querySelector("[data-pattern-answer]")?.focus();
      toast("Answer the pattern question first — that recall is the rep.");
      return;
    }
    const f = new FormData(form);
    const outcome = f.get("outcome");
    const patternCorrect = reflectState.patternAnswered === p.patternId;
    const isMock = session.isMock;
    // Half of a two-mediums round hands its result back to the round. Worked
    // out before the save so the finished round can be logged in the same
    // mutation as its second attempt — two saves would be two commits, and a
    // failure between them would leave an attempt with no round.
    const pairRun = session.pair ? readPair() : null;
    const nextPair = pairRun && pairRun.id === session.pair.runId
      ? recordPairStep(pairRun, { problemId: p.id, workMin: solveMin, outcome })
      : null;
    const capturedCode = session.capturedCode;
    const capturedCodeLang = session.codeLang;
    const whiteboardDataUrl = session.capturedWhiteboardDataUrl;
    // What somebody watching ticked wins over what you ticked about yourself.
    // That is the entire reason the interviewer view exists: these five were
    // self-reported, after the fact, by the person being assessed, and an
    // observation is better evidence than a memory of one.
    const observed = session.observed || null;
    const checklist = observed ? { ...session.checklist, ...observed } : { ...session.checklist };
    const observedBy = observed ? "interviewer" : "self";
    const date = todayISO();
    const ownsDayClock = !!session.ownsDayClock;

    const finish = () => {
      store.mutate((s) => {
        const problem = s.problems.find((x) => x.id === p.id);
        if (!problem) {
          // Should not happen: the problem is looked up from this same state
          // when the session starts. If it ever does, the session is about to
          // be thrown away, which the user must not discover by its absence.
          report(new AppError("This problem is no longer in your list, so the session couldn't be saved."),
            "saving your session");
          return;
        }
        const attempt = {
          id: uid(),
          date,
          outcome,
          patternGuess: patternCorrect ? "correct" : "incorrect",
          timeToInsightMin: insightMin,
          timeToSolveMin: solveMin,
          mistakeTags: f.getAll("mistakeTags"),
          soulStatement: f.get("soulStatement") || "",
          // Only when it was asked. Absent means "not measured", which is not
          // the same thing as an empty list meaning "met none of it".
          ...(wantsCleanBar(state) ? { cleanBar: f.getAll("cleanBar") } : {}),
          isMock,
          // Whether the day clock was running through this session, and so has
          // already counted these minutes. Without it the budget added the
          // clock's time to the attempt's time and charged the same session
          // twice — a 45-minute problem turned "30 minutes left" into "15 over"
          // the moment it was saved.
          onClock: dayTimerRunning(s),
          code: capturedCode,
          codeLang: capturedCode ? capturedCodeLang : "",
        };
        problem.attempts.push(attempt);
        activateProblem(problem); // working it is what moves it out of the bank
        applyOutcome(problem, outcome, s.settings);
        updateStreak(s);

        // Every session is itself a pattern-recall rep, feeding the same stat
        // the Quiz and Warmup tabs use and the plant's health reads. Recorded
        // here rather than when the answer is clicked so that discarding a
        // session really does save nothing, and so answering mid-form doesn't
        // trigger a mutation that would re-render the form out from under you.
        s.quiz.totalAsked += 1;
        if (patternCorrect) s.quiz.totalCorrect += 1;
        s.quiz.recent.push({ correct: patternCorrect });
        if (s.quiz.recent.length > 20) s.quiz.recent.shift();

        if (isMock) {
          s.mocks.push({
            id: uid(), date, problemId: problem.id, outcome,
            // Same precedence: a rating from the person watching, if there was
            // one, rather than the one you gave yourself.
            communicationRating: session.observedRating
              ?? (f.get("communicationRating") ? Number(f.get("communicationRating")) : null),
            durationActualMin: solveMin,
            notes: (session.interviewerNotes || []).map((n) => n.text).join("\n"),
            checklist,
            // Which kind of evidence this is. A rate computed over a mix of
            // self-reports and observations, with no way to tell them apart, is
            // a number that quietly means two things.
            observedBy,
          });
        }
        if (nextPair && pairFinished(nextPair)) recordPairMock(s, nextPair);
        // After the attempt, which has just recorded the clock as running.
        if (ownsDayClock) stopDayTimer(s);
      }, `Ledger: session — ${p.name}`);
      // Saved: the attempt and the board PNG are now the durable record, so the
      // session's scratch log is cleaned up rather than left to accumulate one
      // file per session forever.
      abandonSession({ saved: true });
      toast("Saved.");
      if (nextPair) {
        writePair(nextPair);
        actions.switchTab("pairMock");
        return;
      }
      actions.switchTab("sessionSummary");
    };

    if (whiteboardDataUrl) {
      const wbId = uid();
      const path = `prep-data/whiteboards/${wbId}.png`;
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      store.saveWhiteboardImage(path, whiteboardDataUrl, "Ledger: save session whiteboard")
        .then(() => {
          store.mutate((s) => {
            s.whiteboards.push({ id: wbId, date, problemId: p.id, path, caption: `${p.name} — session` });
          }, "Ledger: index session whiteboard");
          finish();
        })
        .catch((err) => {
          toast(isLocalOnly(err) ? DRAWINGS_NEED_REPO_NOTE : "Whiteboard save failed — saving the rest anyway.");
          finish();
        });
    } else {
      finish();
    }
  });
}

/** The checkpoint after every save — deliberately not a silent bounce back
 * to Dashboard. Ending a session is framed as a real, supported choice
 * ("I'm done for today"), not something that only happens when a timer or
 * the queue runs out — the whole point is undercutting the grind-until-
 * burnout default. */
const PLANT_REACTION = {
  thriving: "Your plant's thriving — this rhythm is exactly what sticks long-term.",
  steady: "Your plant's steady. Keep this pace and it'll keep climbing.",
  stressed: "Your plant's looking a little stressed — check the signals above before piling on more today.",
  wilting: "Your plant's wilting. A lighter day, or an actual day off, would help it more than another rep right now.",
};

export function renderSessionSummary(root, store, actions) {
  const state = store.state;
  const today = todayISO();
  const todaysAttempts = allAttempts(state).filter((a) => a.date === today);
  const totalMin = todaysAttempts.reduce((sum, a) => sum + (a.timeToSolveMin || 0), 0);
  const rec = todaysRecommendation(state);
  const plant = computePlantState(state);
  const budgetMin = state.settings.dailyBudgetMin;
  const overBudget = totalMin >= budgetMin;
  const manyReps = todaysAttempts.length >= 3;

  root.innerHTML = `
    <div class="card session-card">
      <h2>Nice work</h2>
      <p class="muted">${todaysAttempts.length} rep${todaysAttempts.length === 1 ? "" : "s"} today${totalMin ? `, ${totalMin} min total` : ""}${budgetMin ? ` (budget: ${budgetMin} min)` : ""}.</p>
      <div class="plant-toast-row" style="margin: 0.75rem 0">
        ${plantSvg(plant.stage, plant.vitality, { size: 56, decorative: true })}
        <p class="muted small">${PLANT_REACTION[plant.vitality]}</p>
      </div>
      ${overBudget ? `<p class="banner banner-warn" style="padding:0.6rem 0.75rem;border-radius:8px">You've hit today's planned budget — a genuinely good place to stop. More isn't automatically better; consistency tomorrow beats a long session today.</p>` : ""}
      ${!overBudget && manyReps ? `<p class="muted small">That's a solid handful of reps — diminishing returns start to kick in past this point in one sitting.</p>` : ""}
      <div class="row gap" style="margin-top:0.75rem">
        ${rec.problem ? `<button class="btn ${overBudget ? "btn-ghost" : "btn-primary"}" id="ss-another">Do another — ${esc(rec.problem.name)}</button>` : ""}
        <button class="btn ${overBudget ? "btn-primary" : "btn-ghost"}" id="ss-done">I'm done for today</button>
      </div>
    </div>`;

  const anotherBtn = root.querySelector("#ss-another");
  if (anotherBtn) {
    anotherBtn.addEventListener("click", () => {
      startSession(rec.problem);
      actions.switchTab("workspace");
    });
  }
  root.querySelector("#ss-done").addEventListener("click", () => actions.switchTab("dashboard"));
}


/**
 * Wire every "Start" button on a page into a guided session.
 *
 * Lives here rather than in views.js because it is the entry point to this
 * module, and having views.js own it made the two import each other.
 */
export function wireStartButtons(root, store, actions) {
  root.querySelectorAll("[data-start-problem]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const problem = store.state.problems.find((p) => p.id === btn.dataset.startProblem);
      if (!problem) return;
      startSession(problem);
      actions.switchTab("workspace");
    });
  });
}
