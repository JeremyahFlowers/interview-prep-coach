// The two-mediums round: before it, between its halves, and the verdict.
//
// Where this fits: a page like the long session's — reached from the
// dashboard, full navigation kept — because each half is an ordinary session
// in the workspace, and this is where you land between them. The round's
// arithmetic is in pair-mock.js; this only reads it and starts sessions.

import { todayISO } from "./logic.js";
import {
  PAIR_MINUTES, pickPair, startPair, pairIsCurrent, pairFinished, budgetFor,
  pairVerdict, pairHistory, readPair, writePair,
} from "./pair-mock.js";
import { esc, outcomeLabel } from "./ui.js";
import { startSession, hasActiveSession } from "./session-view.js";

const VERDICT_CLASS = { met: "pill-good", close: "pill-warn", missed: "pill-bad" };
const VERDICT_LABEL = { met: "Met the bar", close: "Close", missed: "Missed" };

export function renderPairMock(root, store, actions) {
  const state = store.state;
  const stored = readPair();
  const run = pairIsCurrent(stored) ? stored : null;
  const history = pairHistory(state);
  const byId = (id) => state.problems.find((p) => p.id === id);

  const begin = (r) => {
    const index = r.results.length;
    const problem = byId(r.ids[index]);
    if (!problem) {
      writePair(null);
      actions.rerender();
      return;
    }
    startSession(problem, { pair: { runId: r.id, index, budgetMin: budgetFor(r).minutes } });
    actions.switchTab("workspace");
  };

  const historyLine = history.rounds
    ? `<p class="muted small">Last 30 days: ${history.rounds} round${history.rounds === 1 ? "" : "s"},
       ${history.met} at the bar.</p>` : "";

  // ---- the verdict ----
  if (run && pairFinished(run)) {
    const v = pairVerdict(run);
    root.innerHTML = `
      <div class="card">
        <p class="label">Two mediums, ${PAIR_MINUTES} minutes</p>
        <div class="row gap-sm" style="align-items:center;flex-wrap:wrap">
          <h2 style="margin:0">${v.total} minutes</h2>
          <span class="pill ${VERDICT_CLASS[v.bar]}">${VERDICT_LABEL[v.bar]}</span>
        </div>
        <p>${esc(v.message)}</p>
        <ol class="pair-results">
          ${run.results.map((r, i) => `<li>
            <strong>${esc(byId(r.problemId)?.name || "A problem")}</strong>
            <span class="muted small">${r.workMin} min · ${esc(outcomeLabel(r.outcome))}</span>
            ${i === 0 && r.workMin > PAIR_MINUTES / 2 ? `<span class="muted small">— past halfway, which is where the second one's time came from</span>` : ""}
          </li>`).join("")}
        </ol>
        ${historyLine}
        <div class="row gap-sm">
          <button type="button" class="btn btn-primary" id="pair-done">Done</button>
        </div>
      </div>`;
    root.querySelector("#pair-done").addEventListener("click", () => {
      writePair(null);
      actions.switchTab("dashboard");
    });
    return;
  }

  // ---- between the halves, or a half left open ----
  if (run) {
    const index = run.results.length;
    const budget = budgetFor(run);
    const first = run.results[0];
    root.innerHTML = `
      <div class="card">
        <p class="label">Two mediums, ${PAIR_MINUTES} minutes · problem ${index + 1} of 2</p>
        ${first ? `
          <h2>${first.workMin} minutes on the first</h2>
          <p>${esc(byId(first.problemId)?.name || "The first problem")} — ${esc(outcomeLabel(first.outcome))}.
          ${budget.short
            ? `The round is already gone: the second gets ${budget.minutes} minutes as practice, and the verdict will say so.`
            : `<strong>${budget.minutes} minutes</strong> left for the second. In the real round there is no pause here — start it straight away.`}</p>`
          : `<h2>The first problem is waiting</h2>
             <p class="muted">It was left without being saved. Start it again; the round's clock only
             counts the time you spend working.</p>`}
        <div class="row gap-sm">
          <button type="button" class="btn btn-primary" id="pair-next">${hasActiveSession() ? "Back to it" : first ? "Start the second" : "Start the first"}</button>
          <button type="button" class="btn btn-ghost" id="pair-abandon">Abandon the round</button>
        </div>
      </div>`;
    root.querySelector("#pair-next").addEventListener("click", () => {
      if (hasActiveSession()) { actions.switchTab("workspace"); return; }
      begin(run);
    });
    root.querySelector("#pair-abandon").addEventListener("click", () => {
      writePair(null);
      actions.rerender();
    });
    return;
  }

  // ---- before it starts ----
  const pair = pickPair(state);
  root.innerHTML = `
    <div class="card">
      <h2>Two mediums, ${PAIR_MINUTES} minutes</h2>
      <p>The pace some top-tier rounds run at — Meta's is the known example. The skill is not solving
      a medium; it is solving one in about twenty minutes and then another, which means knowing when
      an approach is good enough to write and not spending the second problem's time polishing the
      first.</p>
      <ul class="tight-list muted small">
        <li>The problems are picked for you and not shown in advance, as in the real round.</li>
        <li>The second gets whatever the first left of the ${PAIR_MINUTES} minutes.</li>
        <li>The clock counts working time only: you reflect on each while it is fresh, and that does
        not come out of the second problem's minutes.</li>
      </ul>
      ${historyLine}
      ${pair
        ? `<button type="button" class="btn btn-primary" id="pair-start">Start the round</button>`
        : `<p class="banner banner-warn">This needs at least two medium problems in your list. Save a
           couple from the Problem Bank first.</p>
           <button type="button" class="btn btn-ghost" id="pair-bank">Open the Problem Bank</button>`}
    </div>`;
  root.querySelector("#pair-start")?.addEventListener("click", () => {
    if (hasActiveSession()) { actions.switchTab("workspace"); return; }
    const r = startPair(pair, todayISO());
    writePair(r);
    begin(r);
  });
  root.querySelector("#pair-bank")?.addEventListener("click", () => actions.switchTab("bank"));
}
