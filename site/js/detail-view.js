// Two pages that answer "what happened here": one problem, and one day.
//
// Where this fits: neither is in the nav. You arrive at a problem from the
// queue, a search hit, a chart or an overrule in the Analyze scorecard, and at
// a day from the heatmap. Both are read-mostly views over history that other
// pages summarise — which is why the editing that exists here (correcting an
// attempt, deleting one) lives here and nowhere else.

import {
  isBacklog, refresherStatus, removeAttempt, editAttempt, recomputeSchedule, todayISO,
  allAttempts, MISTAKE_TAGS, isCleanSolve, dateSortKey, dayOf,
} from "./logic.js";
import { problemUrl, slugify } from "./catalog.js";
import { quoteLines, fencedLines, inlineText } from "./markdown-text.js";
import { patternIcon } from "./icons.js";
import {
  esc, fmtDate, NO_DAY, patternName, toast, offerUndo, outcomeOptions, outcomeLabel, downloadFile,
  showTopic,
} from "./ui.js";
import { wireBoardViewers, outcomeIcon } from "./chrome.js";
import { wireStartButtons } from "./session-view.js";

/**
 * One problem's history, as readable text.
 *
 * Markdown rather than JSON on purpose. The whole-log export exists to move
 * your data; this exists to take one problem's story somewhere a person will
 * read it — a note to yourself, a message to someone helping you prepare. JSON
 * would be the wrong format for either.
 */
function problemToMarkdown(state, problem) {
  const lines = [];
  lines.push(`# ${inlineText(problem.name)}${problem.number ? ` (#${problem.number})` : ""}`);
  lines.push("");
  lines.push(`- Pattern: ${inlineText(patternName(state, problem.patternId))}`);
  lines.push(`- Difficulty: ${problem.difficulty}`);
  lines.push(`- Attempts: ${(problem.attempts || []).length}`);
  const url = problemUrl(problem);
  if (url) lines.push(`- Link: ${url}`);
  lines.push("");

  if (problem.analysis?.predictions?.length) {
    lines.push(`## What I thought going in (${dayOf(problem.analysis.at) ?? NO_DAY})`);
    for (const p of problem.analysis.predictions) {
      lines.push(`- ${inlineText(patternName(state, p.pattern))} — ${Math.round(p.probability * 100)}%`);
    }
    lines.push("");
  }

  const history = [...(problem.attempts || [])].sort((a, b) => dateSortKey(a).localeCompare(dateSortKey(b)));
  if (!history.length) {
    lines.push("_No attempts recorded yet._");
  } else {
    lines.push("## History");
    lines.push("");
    for (const a of history) {
      lines.push(`### ${dayOf(a.date) ?? NO_DAY} — ${outcomeLabel(a.outcome)}`);
      const timings = [
        a.timeToInsightMin != null ? `${a.timeToInsightMin} min to the approach` : null,
        a.timeToSolveMin != null ? `${a.timeToSolveMin} min total` : null,
        a.patternGuess === "correct" ? "recalled the pattern" : "missed the pattern",
        a.isMock ? "mock interview" : null,
      ].filter(Boolean);
      lines.push(timings.join(" · "));
      if ((a.mistakeTags || []).length) {
        lines.push("");
        lines.push(`Mistakes: ${a.mistakeTags.map((t) => inlineText(String(t ?? "").replace(/-/g, " "))).join(", ")}`);
      }
      if (a.soulStatement) {
        lines.push("", ...quoteLines(a.soulStatement));
      }
      if (a.code) {
        lines.push("", ...fencedLines(a.code, a.codeLang));
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

/** File-name stem for a problem whose name has no letters or digits, so a download never starts with "-". */
const FALLBACK_FILE_STEM = "problem";

// ---------- Problem detail ----------
//
// Every attempt was recorded and none of it was readable per problem: you
// could see that Sliding Window sat at 0% but not which sessions made it so,
// and an attempt logged wrongly was permanent and silently skewed every
// statistic downstream.
//
// Same handoff convention as showTopic: a module-level slot rather than a
// routed URL param.
const problemNav = { problemId: null };
export function showProblem(problemId) {
  problemNav.problemId = problemId;
  editingAttemptId = null;
}

// Which attempt is open for correction, if any. Module state rather than DOM
// state so a re-render (a sync landing, the day clock) restores the open
// editor instead of discarding a half-typed correction.
let editingAttemptId = null;



export function renderProblemDetail(root, store, actions) {
  const state = store.state;
  const p = state.problems.find((x) => x.id === problemNav.problemId);
  if (!p) {
    actions.switchTab("queue");
    return;
  }

  const history = [...(p.attempts || [])].sort((a, b) => dateSortKey(b).localeCompare(dateSortKey(a)));
  const boards = (state.whiteboards || []).filter((b) => b.problemId === p.id)
    .sort((a, b) => dateSortKey(b).localeCompare(dateSortKey(a)));
  const status = refresherStatus(p, todayISO());
  const url = problemUrl(p);

  root.innerHTML = `
    <div class="card">
      <button class="btn btn-ghost btn-sm" id="problem-back" style="margin-bottom:0.6rem">&larr; Back</button>
      <div class="row gap-sm" style="flex-wrap:wrap">
        <span class="pill pill-icon"><span class="pattern-icon">${patternIcon(p.patternId, { size: 14 })}</span>${esc(patternName(state, p.patternId))}</span>
        <span class="pill pill-muted">${esc(p.difficulty)}</span>
        ${isBacklog(p) ? `<span class="pill pill-muted">in your bank</span>` : ""}
      </div>
      <h2 style="margin:0.35rem 0 0.2rem">${esc(p.name)}${p.number ? ` <span class="muted">#${p.number}</span>` : ""}</h2>
      <p class="muted small">${esc(status.text)}${history.length ? ` · ${history.length} attempt${history.length === 1 ? "" : "s"}` : ""}
      ${isBacklog(p) ? "" : ` · box ${p.box} of ${state.settings.boxIntervalsDays.length - 1}`}</p>
      <div class="row gap-sm" style="margin-top:0.6rem;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-start-problem="${esc(p.id)}">Practice this</button>
        ${url ? `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open on LeetCode &#8599;</a>` : ""}
        <button class="btn btn-ghost btn-sm" data-goto-topic="${esc(p.patternId)}">Read the pattern</button>
        <button class="btn btn-ghost btn-sm" id="export-problem">Export this history</button>
      </div>
    </div>

    ${p.analysis ? `
    <!-- Carried over from Analyze. What you thought before you started is the
         part worth keeping: comparing it against how the session actually
         went is the whole point of recording a pattern guess. -->
    <div class="card">
      <h2>What you thought going in</h2>
      <p class="muted small">From analysing this on ${fmtDate(p.analysis.at)}.</p>
      <ul class="pred-list">
        ${p.analysis.predictions.map((pred) => `
          <li class="pred-row">
            <span class="row gap-sm" style="align-items:center">
              <span class="pattern-icon">${patternIcon(pred.pattern, { size: 15 })}</span>
              ${esc(patternName(state, pred.pattern))}
            </span>
            <span class="muted small">${Math.round(pred.probability * 100)}%</span>
          </li>`).join("")}
      </ul>
    </div>` : ""}

    ${boards.length ? `
    <!-- Boards are indexed by problem id and were only ever visible in the
         Whiteboard page's flat list, which is the one place you would not
         look for the drawing you made while solving this. -->
    <div class="card">
      <h2>What you drew</h2>
      <p class="muted small">${boards.length} board${boards.length === 1 ? "" : "s"} from working this problem.</p>
      <ul class="board-list">
        ${boards.map((b) => `
          <li>
            <div class="row space-between" style="align-items:center;gap:0.5rem">
              <span class="muted small">${fmtDate(b.date)}${b.caption ? ` · ${esc(b.caption)}` : ""}</span>
              <button class="btn btn-ghost btn-xs" data-view-board="${esc(b.id)}">Show</button>
            </div>
            <div class="whiteboard-thumb-host" id="wb-thumb-${esc(b.id)}"></div>
          </li>`).join("")}
      </ul>
    </div>` : ""}

    <div class="card">
      <h2>History</h2>
      ${history.length === 0
        ? `<p class="empty">No attempts yet. Practising it is what starts the record.</p>`
        : `<ul class="attempt-list">${history.map((a) => attemptRowHtml(state, p, a)).join("")}</ul>`}
    </div>`;

  root.querySelector("#problem-back").addEventListener("click", () => actions.switchTab("queue"));
  root.querySelector("#export-problem").addEventListener("click", () => {
    downloadFile(`${slugify(p.name) || FALLBACK_FILE_STEM}-${todayISO()}.md`, problemToMarkdown(state, p), "text/markdown");
    toast("Downloaded.");
  });
  wireBoardViewers(root, store, boards);
  wireStartButtons(root, store, actions);
  root.querySelectorAll("[data-edit-attempt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingAttemptId = btn.dataset.editAttempt;
      actions.rerender();
    });
  });
  root.querySelectorAll("[data-cancel-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingAttemptId = null;
      actions.rerender();
    });
  });

  root.querySelectorAll("[data-delete-attempt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.deleteAttempt;
      let removed = null;
      store.mutate((s) => {
        const problem = s.problems.find((x) => x.id === p.id);
        if (problem) removed = removeAttempt(problem, id, s.settings);
      }, `Ledger: remove an attempt on ${p.name}`);
      if (!removed) return;
      // Deleting practice history is the most destructive thing on this page,
      // so it is the one action that offers a way back.
      offerUndo(store, `Removed that attempt on ${p.name}.`, (s) => {
        const problem = s.problems.find((x) => x.id === p.id);
        if (!problem) return;
        problem.attempts.push(removed);
        recomputeSchedule(problem, s.settings);
      }, `Ledger: restore an attempt on ${p.name}`);
    });
  });

  const editForm = root.querySelector("#attempt-edit-form");
  if (editForm) {
    editForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(editForm);
      const id = editingAttemptId;
      store.mutate((s) => {
        const problem = s.problems.find((x) => x.id === p.id);
        if (!problem) return;
        editAttempt(problem, id, {
          outcome: f.get("outcome"),
          timeToInsightMin: numberOrNull(f.get("timeToInsightMin")),
          timeToSolveMin: numberOrNull(f.get("timeToSolveMin")),
          mistakeTags: f.getAll("mistakeTags"),
          soulStatement: f.get("soulStatement") || "",
        }, s.settings);
      }, `Ledger: correct an attempt on ${p.name}`);
      editingAttemptId = null;
      toast("Corrected — the schedule was recalculated from your history.");
      actions.rerender();
    });
  }
}

function numberOrNull(value) {
  const n = Number(value);
  return value === "" || value === null || Number.isNaN(n) ? null : n;
}

function attemptRowHtml(state, problem, a) {
  if (a.id === editingAttemptId) return attemptEditHtml(a);
  return `
    <li class="attempt-row">
      <div class="row space-between" style="align-items:flex-start;gap:0.75rem;flex-wrap:wrap">
        <div>
          <div class="row gap-sm" style="flex-wrap:wrap">
            ${outcomeIcon(a.outcome)}
            <strong>${esc(outcomeLabel(a.outcome))}</strong>
            <span class="muted small">${fmtDate(a.date)}</span>
            ${a.isMock ? `<span class="pill pill-warn">mock</span>` : ""}
            <span class="pill ${a.patternGuess === "correct" ? "pill-good" : "pill-muted"}">
              ${a.patternGuess === "correct" ? "recalled the pattern" : "missed the pattern"}</span>
          </div>
          <p class="muted small" style="margin:0.3rem 0 0">
            ${a.timeToInsightMin != null ? `${a.timeToInsightMin} min to the approach` : "no insight time"} ·
            ${a.timeToSolveMin != null ? `${a.timeToSolveMin} min total` : "no total"}</p>
          ${(a.mistakeTags || []).length ? `<div class="row gap-sm" style="margin-top:0.3rem;flex-wrap:wrap">
            ${a.mistakeTags.map((t) => `<span class="pill pill-muted">${esc(t.replace(/-/g, " "))}</span>`).join("")}</div>` : ""}
          ${a.soulStatement ? `<p class="attempt-soul">${esc(a.soulStatement)}</p>` : ""}
        </div>
        <div class="row gap-sm">
          <button class="btn btn-ghost btn-xs" data-edit-attempt="${esc(a.id)}">Correct</button>
          <button class="btn btn-ghost btn-xs" data-delete-attempt="${esc(a.id)}">Delete</button>
        </div>
      </div>
      ${a.code ? `<details class="attempt-code"><summary class="muted small">Code you wrote</summary><pre class="code-view-pre">${esc(a.code)}</pre></details>` : ""}
    </li>`;
}

function attemptEditHtml(a) {
  return `
    <li class="attempt-row attempt-row-editing">
      <form id="attempt-edit-form" class="form">
        <p class="label">Correcting the attempt from ${fmtDate(a.date)}</p>
        <label class="field"><span class="label">Outcome</span>
          <select class="select" name="outcome">
            ${outcomeOptions(a.outcome)}
          </select></label>
        <div class="two-col">
          <label class="field"><span class="label">Minutes to the approach</span>
            <input class="input" type="number" min="0" name="timeToInsightMin" value="${a.timeToInsightMin ?? ""}" /></label>
          <label class="field"><span class="label">Minutes in total</span>
            <input class="input" type="number" min="0" name="timeToSolveMin" value="${a.timeToSolveMin ?? ""}" /></label>
        </div>
        <div class="field"><span class="label">Mistake tags</span>
          <div class="row gap-sm" style="flex-wrap:wrap">
            ${MISTAKE_TAGS.map((t) => `<label class="checkbox-field"><input type="checkbox" name="mistakeTags" value="${t}"
              ${(a.mistakeTags || []).includes(t) ? "checked" : ""} /> ${esc(t.replace(/-/g, " "))}</label>`).join("")}
          </div>
        </div>
        <label class="field"><span class="label">Soul statement</span>
          <textarea class="textarea" name="soulStatement" rows="3">${esc(a.soulStatement || "")}</textarea></label>
        <div class="row gap">
          <button class="btn btn-primary btn-sm" type="submit">Save correction</button>
          <button class="btn btn-ghost btn-sm" type="button" data-cancel-edit="1">Cancel</button>
        </div>
      </form>
    </li>`;
}

// ---------- One day's practice ----------
//
// The activity heatmap showed a year of counts and answered nothing about any
// of them: the densest square on the grid was as opaque as the empty ones.
// This is what a cell opens.

const dayNav = { date: null };
export function showDay(iso) {
  dayNav.date = iso;
}

export function renderDayDetail(root, store, actions) {
  const state = store.state;
  const iso = dayNav.date;
  const attempts = allAttempts(state).filter((a) => a.date === iso);

  if (!iso) {
    actions.switchTab("dashboard");
    return;
  }

  const minutes = attempts.reduce((n, a) => n + (a.timeToSolveMin || 0), 0);
  const clean = attempts.filter(isCleanSolve).length;
  const recalled = attempts.filter((a) => a.patternGuess === "correct").length;
  const boards = (state.whiteboards || []).filter((b) => b.date === iso);
  const journal = (state.journal || []).filter((j) => j.date === iso);

  root.innerHTML = `
    <div class="card">
      <button class="btn btn-ghost btn-sm" id="day-back" style="margin-bottom:0.6rem">&larr; Back</button>
      <h2 style="margin:0">${esc(fmtDate(iso))}</h2>
      ${attempts.length === 0
        ? `<p class="muted">Nothing recorded on this day.</p>`
        : `<div class="stat-row" style="margin-top:0.75rem">
            <div class="stat"><span class="stat-num">${attempts.length}</span><span class="stat-label">attempt${attempts.length === 1 ? "" : "s"}</span></div>
            <div class="stat"><span class="stat-num">${minutes}</span><span class="stat-label">minutes</span></div>
            <div class="stat"><span class="stat-num">${clean}</span><span class="stat-label">solved clean</span></div>
            <div class="stat"><span class="stat-num">${recalled}</span><span class="stat-label">pattern recalled</span></div>
          </div>`}
    </div>

    ${attempts.length ? `
    <div class="card">
      <h2>What you worked</h2>
      <ul class="attempt-list">
        ${attempts.map((a) => {
          return `
          <li class="attempt-row">
            <div class="row gap-sm" style="flex-wrap:wrap;align-items:center">
              ${outcomeIcon(a.outcome)}
              <button type="button" class="link-button" data-open-problem="${esc(a.problemId)}">${esc(a.problemName)}</button>
              <span class="pill pill-icon"><span class="pattern-icon">${patternIcon(a.patternId, { size: 13 })}</span>${esc(patternName(state, a.patternId))}</span>
              ${a.isMock ? `<span class="pill pill-warn">mock</span>` : ""}
            </div>
            <p class="muted small" style="margin:0.3rem 0 0">
              ${a.timeToInsightMin != null ? `${a.timeToInsightMin} min to the approach` : "no insight time"} ·
              ${a.timeToSolveMin != null ? `${a.timeToSolveMin} min total` : "no total"}</p>
            ${a.soulStatement ? `<p class="attempt-soul">${esc(a.soulStatement)}</p>` : ""}
          </li>`;
        }).join("")}
      </ul>
    </div>` : ""}

    ${journal.length ? `
    <div class="card">
      <h2>What you wrote</h2>
      <ul class="journal-list">
        ${journal.map((j) => `<li><p>${esc(j.text)}</p></li>`).join("")}
      </ul>
    </div>` : ""}

    ${boards.length ? `
    <div class="card">
      <h2>What you drew</h2>
      <ul class="board-list">
        ${boards.map((b) => `
          <li>
            <div class="row space-between" style="align-items:center;gap:0.5rem">
              <span class="muted small">${esc(b.caption || "Whiteboard")}</span>
              <button class="btn btn-ghost btn-xs" data-view-board="${esc(b.id)}">Show</button>
            </div>
            <div class="whiteboard-thumb-host" id="wb-thumb-${esc(b.id)}"></div>
          </li>`).join("")}
      </ul>
    </div>` : ""}`;

  root.querySelector("#day-back").addEventListener("click", () => actions.switchTab("dashboard"));
  wireBoardViewers(root, store, boards);
}
