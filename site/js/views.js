// The pages that make up the app's spine.
//
// What's left here after the split: the Dashboard, the refresher Queue, the
// Log form, Pattern mastery, the Journal, System Design, Topics and LeetCode.
// They share a file because each is a page over the same one document, and
// none is large enough to be worth its own.
//
// What left, and why: the furniture every page uses is chrome.js; connecting
// and conflict resolution are setup-view.js; the quiz and warm-up are
// drill-view.js; Settings is settings-view.js; a problem's and a day's detail
// are detail-view.js. This file had reached 2,534 lines and sixteen unrelated
// renderers — the same state logic.js was in before cycle 3 split it.
//
// It is no longer a door: every module that wanted `esc` or `startSession`
// used to import them from here, and now names the module they actually live
// in. The facade was load-bearing during the split and nothing but indirection
// afterwards.

import {
  todayISO, applyOutcome, activateProblem, dueProblems, planToday, allAttempts, patternStats,
  updateStreak, systemDesignUnlock, uid, MISTAKE_TAGS, activityByDate, patternTrend,
  difficultyRank, isCleanSolve, ownValue, isRecord,
  refresherBands,
  MOCK_CHECKLIST, mockReview,
  computePlantState, streakGraceInfo, refresherStatus, STATUS_ACTIVE, currentFocus, setFocus,
} from "./logic.js";
import { todaysRecommendation, skipRecommendation } from "./recommendation.js";
import { warmupFor, prepStatus } from "./prep.js";
import { afterInterviewCardHtml, wireAfterInterview } from "./after-interview.js";
import { dayProgress, itemKind, setDayCheck, weekConfigured } from "./week.js";
import { weekProgress } from "./sittings.js";

import { migrateState } from "./seed.js";
import {
  splitBudget, recommendDesign, planDesignToday, designAttempts, studyPick,
} from "./design-logic.js";

import { patternProgressHtml } from "./progress-view.js";
import { renderCatalogLadder } from "./topic-practice.js";

import { TOPICS } from "./topics-content.js";
import { loadCodeMirror, CODE_MODES } from "./codemirror-loader.js";
import { createWhiteboard } from "./whiteboard.js";

import { patternIcon } from "./icons.js";
import { resetWarmup, openFluencyDrill, openQuizMode } from "./drill-view.js";
import { currentLongRun } from "./long-session-view.js";
import { showProblem, showDay } from "./detail-view.js";
import {
  esc, richText, pct, mins, fmtDate, patternName, toast, topicNav, showTopic, outcomeOptions,
  offerUndo,
} from "./ui.js";
import { isLocalOnly, DRAWINGS_NEED_REPO_NOTE } from "./errors.js";
import {
  startSession, hasActiveSession, currentSessionProblemName, wireStartButtons,
} from "./session-view.js";

import {
  loadDiagramModules, plantCardHtml, prefill, recencyPill, heatmapSvg,
  leetcodeCalendarToDateCounts, emptyState, trendLineHtml, sparklineSvg, ringSvg, outcomeIcon,
  weekStripSvg, wireBoardViewers, dayRingHtml, wireTabButtons,
} from "./chrome.js";

/**
 * Today's system design, if it is switched on.
 *
 * Deliberately a second card rather than a competing headline. The coding
 * recommendation owns the top of this page; two things telling you what to do
 * next is two people talking over each other, and the point of comingling the
 * two halves is that the day has one shape, not two.
 */
/**
 * Today's design work, as the week sees it.
 *
 * It used to offer the same full problem every day — on the rest day, under
 * the long session, and on a day whose plan was one component read properly.
 * With a week set up, the week decides: nothing on a day without design, the
 * long session's own card on a long-session day, a component on a topic day,
 * and a problem on a problem day. On a day with no coding, the off-duty card
 * already speaks for the design item, so this stays out of its way.
 */
function designCardHtml(state) {
  const split = splitBudget(state);
  if (!split.enabled) return "";
  if (weekConfigured(state)) {
    const progress = dayProgress(state);
    const design = progress.items.find((i) => i.kind.startsWith("design"));
    if (progress.rested || !design || design.kind === "designMock" || !wantsCodingToday(state)) return "";
    if (design.kind === "designStudy") return studyCardHtml(state, design.met);
  }
  const rec = recommendDesign(state);
  const today = planDesignToday(state);
  const doneToday = designAttempts(state).filter((a) => a.date === todayISO()).length;

  return `
    <div class="card design-card">
      <div class="row space-between session-cta-row">
        <div>
          <h2>System design${doneToday ? " — done for today" : ""}</h2>
          <p class="muted">${doneToday
            ? `${doneToday} design problem${doneToday === 1 ? "" : "s"} worked today. `
              + `That is the ${split.designMin} minutes of the day this half gets.`
            : rec ? esc(rec.message)
            : `${split.designMin} of today's ${split.budgetMin} minutes are set aside for design.`}</p>
        </div>
        ${!doneToday && rec ? `
          <div class="row gap-sm">
            ${rec.componentId ? `<button class="btn btn-ghost" data-open-component="${esc(rec.componentId)}">Read it first</button>` : ""}
            <button class="btn btn-primary" data-start-design="${esc(rec.problemId)}">Work it</button>
          </div>` : `
          <button class="btn btn-ghost" data-goto="designBank">Design problems</button>`}
      </div>
      ${today.plan.length > 1 ? `<p class="muted small">Today's design plan:
        ${today.plan.map((x) => esc(x.problem.name)).join(", ")}.</p>` : ""}
    </div>`;
}

/** A week's "design topic": one named component, read properly, and a problem
 *  that uses it to try straight after. */
function studyCardHtml(state, met) {
  const pick = studyPick(state);
  return `
    <div class="card design-card">
      <div class="row space-between session-cta-row">
        <div>
          <h2>Design topic${met ? " — done for today" : ""}</h2>
          <p class="muted">${met ? "Ticked off. " : ""}<strong>${esc(pick.component.name)}</strong> — ${esc(pick.reason)}.
          Read its page, answer its follow-ups out loud, then see it used.</p>
        </div>
        <div class="row gap-sm">
          <button class="btn ${met ? "btn-ghost" : "btn-primary"}" data-open-component="${esc(pick.component.id)}">Read ${esc(pick.component.name)}</button>
          ${pick.problem ? `<button class="btn btn-ghost" data-start-design="${esc(pick.problem.id)}">Then: ${esc(pick.problem.name.replace(/^Design (a |an )?/i, ""))}</button>` : ""}
        </div>
      </div>
    </div>`;
}

/**
 * What the recommendation is leaning towards, and the way to change it.
 *
 * Said on the card because a weighting nobody can see is a recommender that
 * seems arbitrary: "why DP again?" is answered here, and so is "not DP".
 */
function focusLineHtml(state, rec) {
  const focus = currentFocus(state);
  // Block practice is a focus too, chosen by the phase rather than by you.
  // Saying "spread across your patterns" under "Staying on Two Pointers" was
  // the card contradicting itself.
  if (!focus && rec?.type === "block") {
    return `<p class="muted small rec-focus">Want a different pattern?
      <button type="button" class="link-button" data-tab="topics">Choose one to focus on</button></p>`;
  }
  if (!focus) {
    return `<p class="muted small rec-focus">No focus — suggestions are spread across your patterns.
      <button type="button" class="link-button" data-tab="topics">Pick one to work on</button></p>`;
  }
  const name = esc(patternName(state, focus.patternId));
  return focus.source === "chosen"
    ? `<p class="muted small rec-focus">Focus: <strong>${name}</strong>, which you chose — most suggestions come from it.
        <button type="button" class="link-button" data-focus-clear>Stop focusing</button></p>`
    : `<p class="muted small rec-focus">Focus: <strong>${name}</strong>, from your last few problems.
        <button type="button" class="link-button" data-focus-set="${esc(focus.patternId)}">Keep it</button></p>`;
}

/** Set or clear the focus pattern, wherever the buttons for it are. */
function wireFocusButtons(root, store) {
  root.querySelectorAll("[data-focus-set]").forEach((b) => b.addEventListener("click", () => {
    store.mutate((s) => setFocus(s, b.dataset.focusSet), "Ledger: focus");
  }));
  root.querySelectorAll("[data-focus-clear]").forEach((b) => b.addEventListener("click", () => {
    store.mutate((s) => setFocus(s, null), "Ledger: focus");
  }));
}

/** The focus control on a pattern's page: what it is now, and the one change
 *  that makes sense from here. */
function topicFocusHtml(state, patternId) {
  const focus = currentFocus(state);
  const mine = focus?.patternId === patternId;
  if (mine && focus.source === "chosen") {
    return `<div class="topic-focus"><span class="pill pill-good">Your focus</span>
      <button type="button" class="btn btn-ghost btn-sm" data-focus-clear>Stop focusing</button></div>`;
  }
  return `<div class="topic-focus">
    ${mine ? `<span class="pill pill-muted">Your recent focus</span>` : ""}
    <button type="button" class="btn btn-ghost btn-sm" data-focus-set="${esc(patternId)}"
      title="Most of what Home suggests will come from this pattern until you change it">Make this my focus</button>
  </div>`;
}

/** Selector for the "N of M this week" figure on the Home card, so tests read it without matching on its wording. */
const HOME_WEEK_COUNT_TESTID = "home-week-count";

export function renderDashboard(root, store, actions) {
  const state = store.state;
  const rec = todaysRecommendation(state);
  const plant = computePlantState(state);
  const { plan, overflow, usedMin, budgetMin } = planToday(state);
  const stats = patternStats(state).filter((s) => s.attempts > 0).sort((a, b) => a.solvedCleanRate - b.solvedCleanRate);
  const weakest = stats.slice(0, 2);
  const sd = systemDesignUnlock(state);
  const REC_LABEL = {
    "first-rep": "Recommended",
    "deep-dive": "Recommended — repeated weak spot",
    // Not "Recommended". The whole point of this one is that the app is not
    // recommending another attempt.
    stuck: "This one isn't going in",
    "stale-nudge": "Recommended — review",
    due: "Up next",
    none: "",
  };

  root.innerHTML = `
    ${plantCardHtml(plant)}
    ${afterInterviewCardHtml(state, todayISO())}
    ${todayCardHtml(state)}
    ${hasActiveSession() ? `
    <!-- An unfinished session is the only thing more urgent than today's
         recommendation, and without this there is no way back to one you
         navigated away from. -->
    <div class="card session-cta-card">
      <div class="row space-between session-cta-row">
        <div>
          <h2>Session in progress</h2>
          <p class="muted">${esc(currentSessionProblemName())} — still open, with your code and timer.</p>
        </div>
        <button class="btn btn-primary" id="cta-resume">Back to it</button>
      </div>
    </div>` : ""}
    ${wantsCodingToday(state) ? `
    <div class="card session-cta-card${weekConfigured(state) && dayProgress(state).complete ? " optional" : ""}">
      <div class="row space-between session-cta-row">
        <div>
          <h2>${weekConfigured(state) && dayProgress(state).complete
            ? "If you want more"
            : REC_LABEL[rec.type] || "Today's session"}</h2>
          ${rec.problem && rec.type !== "stuck" ? `<p class="rec-problem"><strong>${esc(rec.problem.name)}</strong>
            <span class="pill pill-muted">${esc(rec.problem.difficulty)}</span>
            <span class="pill pill-muted">${esc(patternName(state, rec.problem.patternId))}</span></p>` : ""}
          <p class="muted">${esc(rec.message)}</p>
          ${focusLineHtml(state, rec)}
        </div>
        <div class="row gap-sm">
          ${rec.problem && rec.type !== "stuck" ? `<button class="btn btn-ghost" id="cta-skip"
            title="A different problem, weighted the same way">Something else</button>` : ""}
          <button class="btn btn-ghost" id="cta-warmup">${warmupFor(state).kind === "fluency" ? "Fluency warm-up" : "5-min warmup"}</button>
          ${emphasisButtons(state)}
          ${rec.type === "deep-dive" || rec.type === "stale-nudge" ? `<button class="btn btn-ghost" data-tab="topics">Review pattern</button>` : ""}
          ${rec.type === "stuck" ? `
            <button class="btn btn-primary" data-goto-topic="${esc(rec.patternId)}">Read the pattern</button>
            <button class="btn btn-ghost" data-open-problem="${esc(rec.problem.id)}">See what I tried</button>
            <!-- Still offered, and deliberately last and plain. The app has
                 said what it thinks; it does not get to refuse. -->
            <button class="btn btn-ghost" id="cta-start">Try it anyway</button>`
          : rec.problem ? `<button class="btn btn-primary" id="cta-start">${rec.mock ? "Start the mock" : rec.type === "deep-dive" ? "Drill it" : "Start session"}</button>` : ""}
        </div>
      </div>
    </div>` : offDutyCardHtml(state)}

    ${designCardHtml(state)}

    <div class="grid dashboard-grid">
      <div class="card streak-card">
        <div class="row space-between" style="align-items:center; flex-wrap:wrap; gap:1rem">
          <div class="stat-row">
            <div class="stat">
              <span class="stat-num">${state.streak.current}</span>
              <!-- Says outright when a rest day is holding the streak
                   together. A streak that quietly papers over a gap is a
                   number the record cannot support, and this app does not
                   get to claim you practised on a day you didn't. -->
              <span class="stat-label">day streak${streakGraceInfo(state).used
                ? ` <span class="muted" title="A rest day this week is covered, so the streak holds.">· incl. a rest day</span>` : ""}</span>
            </div>
            <div class="stat"><span class="stat-num">${state.streak.longest}</span><span class="stat-label">longest</span></div>
          </div>
          ${dayRingHtml(state)}
        </div>
        <p class="muted small" style="margin:0.6rem 0 0">Last 7 days</p>
        ${weekStripSvg(state)}
        ${trendLineHtml(state)}
      </div>

      <div class="card">
        <h2>Today's plan</h2>
        ${plan.length ? `<p class="muted small">About ${usedMin} min of refreshers lined up, against today's ${budgetMin}.</p>` : ""}
        ${plan.length === 0 ? `<p class="empty">Nothing needs a refresher right now.</p>` : `
        <ul class="queue-list">
          ${plan.map((p) => queueItemHtml(state, p)).join("")}
        </ul>`}
        ${overflow.length ? `<p class="muted small">${overflow.length} more could use a refresher, beyond today's ${budgetMin} min — they'll keep.</p>` : ""}
      </div>

      <div class="card">
        <h2>Weakest patterns</h2>
        ${weakest.length === 0 ? `<p class="empty">Not enough attempts yet to tell.</p>` : `
        <ul class="pattern-mini-list">
          ${weakest.map((s) => `
            <li>
              <div class="row space-between"><span class="row gap-sm" style="align-items:center"><span class="pattern-icon">${patternIcon(s.pattern.id, { size: 16 })}</span><strong>${esc(s.pattern.name)}</strong></span><span>${pct(s.solvedCleanRate)} clean-solve</span></div>
              <div class="bar"><div class="bar-fill" style="width:${Math.round((s.solvedCleanRate || 0) * 100)}%"></div></div>
            </li>`).join("")}
        </ul>`}
        <div class="row gap-sm">
          <button class="btn btn-ghost" data-tab="patterns">See all patterns</button>
          <button class="btn btn-ghost" data-tab="topics">Browse topics</button>
        </div>
      </div>

      <div class="card">
        <h2>System design track</h2>
        <p class="muted small">${sd.mocksLogged}/${sd.minMocks} mocks logged · ${pct(sd.recentSolvedCleanRate)} clean-solve on recent mocks (need ${pct(sd.minSolvedCleanRate)})</p>
        <span class="badge ${sd.unlocked ? "badge-good" : "badge-warn"}">${sd.unlocked ? "Unlocked" : "Not yet"}</span>
      </div>

      <div class="card">
        <h2>Activity</h2>
        ${heatmapSvg(activityByDate(state))}
        <p class="muted small">Every logged rep, mock, and system design session, last 20 weeks.</p>
      </div>
    </div>`;

  wireTabButtons(root, actions);
  wireAfterInterview(root, store, actions);
  wireStartButtons(root, store, actions);

  const startBtn = root.querySelector("#cta-start");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      // The simulation phase recommends mocks. Nothing read that flag before,
      // so "do this one as a mock" was said and never honoured.
      startSession(rec.problem, { isMock: !!rec.mock });
      actions.switchTab("workspace");
    });
  }
  root.querySelector("#cta-resume")?.addEventListener("click", () => actions.switchTab("workspace"));
  root.querySelector("#cta-skip")?.addEventListener("click", () => {
    skipRecommendation(state);
    actions.rerender();
  });
  wireFocusButtons(root, store);

  // Optional, because on a rest day neither card offers a warm-up — the week
  // said stop. Bound without the `?.` this threw every Sunday.
  root.querySelector("#cta-warmup")?.addEventListener("click", () => {
    // Where the plan says the warm-up is. For a target that assumes fluency
    // that is the language drill, not the pattern one.
    if (warmupFor(state).kind === "fluency") {
      openFluencyDrill();
      actions.switchTab("quiz");
      return;
    }
    resetWarmup();
    actions.switchTab("warmup");
  });

  root.querySelectorAll("[data-open-quiz]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openQuizMode(btn.dataset.openQuiz);
      actions.switchTab("quiz");
    });
  });

  root.querySelectorAll("[data-day-check]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.dayCheck;
      const on = btn.getAttribute("aria-pressed") !== "true";
      store.mutate((st) => setDayCheck(st, kind, on), `Ledger: today — ${kind}`);
    });
  });

}

function queueItemHtml(state, p) {
  return `
    <li class="queue-item">
      <div>
        <div class="row gap-sm">
          <span class="pill pill-icon"><span class="pattern-icon">${patternIcon(p.patternId, { size: 14 })}</span>${esc(patternName(state, p.patternId))}</span>
          <span class="pill pill-muted">${esc(p.difficulty)}</span>
          ${recencyPill(p)}
        </div>
        <!-- The name opens this problem's own history. It used to be a link
             straight out to LeetCode, which meant the record the app had been
             keeping was the one thing you could not reach from it. -->
        <div class="queue-name"><button type="button" class="link-button" data-open-problem="${esc(p.id)}">${esc(p.name)}</button>${p.number ? ` <span class="muted">#${p.number}</span>` : ""}</div>
      </div>
      <button class="btn btn-primary btn-sm" data-start-problem="${esc(p.id)}">Start</button>
    </li>`;
}

/** Wires every "Start" button rendered by queueItemHtml — the single entry
 * point into a guided session, used from Dashboard, Review Queue, and the
 * Topics practice ladder alike. */
/** Problem names are buttons into that problem's history; bound here rather
 * than in every view that happens to list one. */
/** Heatmap cells that have something in them open that day. Bound alongside
 * the other cross-view links, since the heatmap appears on more than one
 * page. Keyboard too: they are focusable, so Enter and Space must work. */
export function wireHeatmapDays(root, actions) {
  root.querySelectorAll("[data-heat-day]").forEach((cell) => {
    const open = () => {
      showDay(cell.dataset.heatDay);
      actions.switchTab("dayDetail");
    };
    cell.addEventListener("click", open);
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

export function wireProblemLinks(root, actions) {
  root.querySelectorAll("[data-open-problem]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showProblem(btn.dataset.openProblem);
      actions.switchTab("problemDetail");
    });
  });
}

// ---------- Review Queue ----------

export function renderQueue(root, store, actions) {
  const state = store.state;
  const due = dueProblems(state);
  const today = todayISO();
  // Banded by how long it has been, not by how late anything is — and a
  // problem you have never practised is in its own band rather than in the
  // oldest one, which is what a null gap used to fall into.
  const bands = refresherBands(due, today).filter((b) => b.count > 0);
  const total = due.length || 1;
  const unpractised = bands.find((b) => b.key === "fresh")?.count || 0;

  root.innerHTML = `
    <div class="card">
      <h2>Ready for a refresher</h2>
      <p class="muted">${unpractised === due.length && due.length
        ? `Everything here is new — you haven't worked any of these yet. Start anywhere;
           the schedule builds itself from what you do.`
        : `Whatever you haven't looked at in a while, the ones you find hardest first.
           There's no deadline on any of this — it's here when you want it.`}</p>
      ${due.length > 0 ? `
      <div class="backlog-bar">
        ${bands.map((b) => `<div class="backlog-seg"
          style="width:${(b.count / total) * 100}%; background:${b.color}"></div>`).join("")}
      </div>
      <div class="backlog-legend">
        ${bands.map((b) => `<span style="--_c:${b.color}">${b.count} ${esc(b.label)}</span>`).join("")}
      </div>` : ""}
      ${due.length === 0 ? `<p class="empty">Nothing's gone stale — everything you're tracking is recent.</p>` : `
      <ul class="queue-list">${due.map((p) => queueItemHtml(state, p)).join("")}</ul>`}
    </div>`;
  wireStartButtons(root, store, actions);
}

// ---------- Log Session ----------

export function renderLog(root, store, actions) {
  const state = store.state;
  const prefillId = prefill.problemId;
  const prefillName = prefill.name || "";
  const prefillUrl = prefill.url || "";
  prefill.problemId = null;
  prefill.name = null;
  prefill.url = null;
  const problemsByPattern = state.patterns.map((pat) => ({
    pat, problems: state.problems.filter((p) => p.patternId === pat.id),
  }));

  root.innerHTML = `
    <div class="card">
      <h2>Log a past rep</h2>
      <p class="muted">For something you already solved elsewhere — a LeetCode submission, a whiteboard
      interview, working through it on paper. For a live guided session with a timer, whiteboard, and
      code editor built in, start from the Dashboard instead.</p>
      <form id="log-form" class="form">
        <div class="field">
          <span class="label">Problem</span>
          <div class="row gap-sm">
            <select class="select" name="problemId" id="problem-select">
              <option value="__new__">+ New problem…</option>
              ${problemsByPattern.map(({ pat, problems }) => problems.length ? `
                <optgroup label="${esc(pat.name)}">
                  ${problems.map((p) => `<option value="${esc(p.id)}" ${p.id === prefillId ? "selected" : ""}>${esc(p.name)}${p.number ? ` (#${p.number})` : ""}</option>`).join("")}
                </optgroup>` : "").join("")}
            </select>
          </div>
        </div>

        <fieldset id="new-problem-fields" class="fieldset" hidden>
          <label class="field"><span class="label">Name</span><input class="input" name="newName" value="${esc(prefillName)}" /></label>
          <label class="field"><span class="label">LeetCode #</span><input class="input" name="newNumber" type="number" /></label>
          <label class="field"><span class="label">Difficulty</span>
            <select class="select" name="newDifficulty">
              <option>Easy</option><option selected>Medium</option><option>Hard</option><option>Unrated</option>
            </select></label>
          <label class="field"><span class="label">Pattern</span>
            <select class="select" name="newPatternId">
              ${state.patterns.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}
            </select></label>
          <label class="field"><span class="label">Approach (one line)</span><input class="input" name="newApproach" /></label>
          <input type="hidden" name="newUrl" value="${esc(prefillUrl)}" />
        </fieldset>

        <div class="two-col">
          <label class="field"><span class="label">Date</span><input class="input" type="date" name="date" value="${todayISO()}" /></label>
          <label class="field"><span class="label">Outcome</span>
            <select class="select" name="outcome">
              ${outcomeOptions()}
            </select></label>
        </div>

        <div class="two-col">
          <label class="field"><span class="label">Pattern ID'd correctly before coding?</span>
            <select class="select" name="patternGuess">
              <option value="correct">Yes</option>
              <option value="partial">Partially</option>
              <option value="incorrect">No</option>
            </select></label>
          <div></div>
        </div>

        <div class="two-col">
          <label class="field"><span class="label">Time to insight (min)</span><input class="input" type="number" min="0" name="timeToInsightMin" /></label>
          <label class="field"><span class="label">Time to working solution (min)</span><input class="input" type="number" min="0" name="timeToSolveMin" /></label>
        </div>

        <div class="field">
          <span class="label">Mistake tags</span>
          <div class="chip-group">
            ${MISTAKE_TAGS.map((t) => `<label class="chip"><input type="checkbox" name="mistakeTags" value="${t}" />${t.replace(/-/g, " ")}</label>`).join("")}
          </div>
        </div>

        <label class="field"><span class="label">Soul statement <span class="muted small" style="font-weight:400">— optional, but this is the part worth having in six months</span></span>
          <textarea class="textarea" name="soulStatement" rows="4" placeholder="What was your confusion, and what clicked?"></textarea></label>

        <div class="field">
          <div class="row space-between">
            <span class="label">Your code (optional — for reviewing mistakes later)</span>
            <select class="select" id="code-lang" style="max-width:9rem">
              ${Object.entries(CODE_MODES).map(([k, v]) => `<option value="${k}" ${k === "cpp" ? "selected" : ""}>${v.label}</option>`).join("")}
            </select>
          </div>
          <div id="code-editor" class="code-editor-host"></div>
        </div>

        <label class="field checkbox-field"><input type="checkbox" name="isMock" id="is-mock" /> This was a timed mock, not regular review</label>
        <div id="mock-fields" class="two-col" hidden>
          <label class="field"><span class="label">Communication rating (1-5)</span><input class="input" type="number" min="1" max="5" name="communicationRating" /></label>
          <label class="field"><span class="label">Actual duration (min)</span><input class="input" type="number" min="0" name="durationActualMin" /></label>
        </div>

        <button class="btn btn-primary" type="submit">Save rep</button>
      </form>
    </div>`;

  const form = root.querySelector("#log-form");
  const select = root.querySelector("#problem-select");
  const newFields = root.querySelector("#new-problem-fields");
  const mockCheck = root.querySelector("#is-mock");
  const mockFields = root.querySelector("#mock-fields");
  const langSelect = root.querySelector("#code-lang");
  const codeHost = root.querySelector("#code-editor");

  function syncNewFields() {
    newFields.hidden = select.value !== "__new__";
  }
  select.addEventListener("change", syncNewFields);
  syncNewFields();
  mockCheck.addEventListener("change", () => (mockFields.hidden = !mockCheck.checked));

  let cm = null;
  loadCodeMirror().then((CodeMirror) => {
    if (!codeHost.isConnected) return; // tab changed before the CDN load finished
    cm = CodeMirror(codeHost, { mode: CODE_MODES[langSelect.value].mode, lineNumbers: true, viewportMargin: Infinity });
    langSelect.addEventListener("change", () => cm.setOption("mode", CODE_MODES[langSelect.value].mode));
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    // Checked before the mutate, not inside it: a new problem with no name
    // used to abandon the whole submission from within store.mutate, so the
    // form sat there looking untouched and the rep was gone.
    if (f.get("problemId") === "__new__" && !(f.get("newName") || "").trim()) {
      const nameField = form.querySelector('[name="newName"]');
      nameField?.focus();
      toast("Give the problem a name first.");
      return;
    }
    const code = cm ? cm.getValue().trim() : "";
    const codeLang = langSelect.value;
    store.mutate((s) => {
      let problemId = f.get("problemId");
      if (problemId === "__new__") {
        const name = (f.get("newName") || "").trim();
        if (!name) {
          // Inside store.mutate, so this cannot toast from here without the
          // message being lost to the re-render; the submit handler checks
          // first and never reaches this. Kept as a guard, not a refusal.
          return;
        }
        problemId = uid();
        s.problems.push({
          id: problemId,
          name,
          number: f.get("newNumber") ? Number(f.get("newNumber")) : null,
          difficulty: f.get("newDifficulty"),
          patternId: f.get("newPatternId"),
          approach: f.get("newApproach") || "",
          filePath: "",
          url: f.get("newUrl") || "",
          notes: "",
          // Stated rather than left to migrateState's "no status means active"
          // fallback. That rule exists to read state files written before the
          // field did; new records shouldn't be relying on it.
          status: STATUS_ACTIVE,
          box: 0,
          nextReviewDate: todayISO(),
          attempts: [],
        });
      }
      const problem = s.problems.find((p) => p.id === problemId);
      if (!problem) return;
      const outcome = f.get("outcome");
      const attempt = {
        id: uid(),
        date: f.get("date") || todayISO(),
        outcome,
        patternGuess: f.get("patternGuess"),
        // Stated rather than left absent: this is work done elsewhere, so the
        // day clock never saw it and it always counts toward the budget.
        onClock: false,
        timeToInsightMin: f.get("timeToInsightMin") ? Number(f.get("timeToInsightMin")) : null,
        timeToSolveMin: f.get("timeToSolveMin") ? Number(f.get("timeToSolveMin")) : null,
        mistakeTags: f.getAll("mistakeTags"),
        soulStatement: f.get("soulStatement") || "",
        isMock: !!f.get("isMock"),
        code: code || "",
        codeLang: code ? codeLang : "",
      };
      problem.attempts.push(attempt);
      activateProblem(problem); // working it is what moves it out of the bank
      applyOutcome(problem, outcome, s.settings);
      updateStreak(s);
      if (attempt.isMock) {
        s.mocks.push({
          id: uid(),
          date: attempt.date,
          problemId: problem.id,
          outcome,
          communicationRating: f.get("communicationRating") ? Number(f.get("communicationRating")) : null,
          durationActualMin: f.get("durationActualMin") ? Number(f.get("durationActualMin")) : null,
          notes: "",
          checklist: {},
        });
      }
    }, `Ledger: log ${f.get("problemId") === "__new__" ? (f.get("newName") || "new problem") : "rep"}`);
    toast("Saved.");
    actions.switchTab("dashboard");
  });
}

// ---------- Patterns ----------

export function renderPatterns(root, store, actions) {
  const state = store.state;
  const stats = patternStats(state).sort((a, b) => (a.solvedCleanRate ?? 1) - (b.solvedCleanRate ?? 1));
  const worked = stats.filter((s) => s.attempts > 0);

  // Before any practice this table is twenty-three rows of em dashes: a
  // screenful of nothing formatted as data, on the page whose stated job is to
  // say what to focus on next. It cannot do that job yet, so it says so and
  // says what starts it, rather than implying the answer is "everything,
  // equally, at zero".
  if (!worked.length) {
    root.innerHTML = `
      <div class="card">
        <h2>Pattern mastery</h2>
        ${emptyState("patterns", "Nothing measured yet",
          "This ranks the " + stats.length + " patterns weakest-first once there is something to rank "
          + "them by — clean-solve rate, how often you name the pattern cold, and how long it takes you "
          + "to see the approach. One logged session starts it.",
          { tab: "queue", label: "Pick something to practise" })}
        <p class="muted small">Until then the patterns themselves are worth reading, and the topic
        pages explain each one from scratch.</p>
        <button class="btn btn-ghost btn-sm" data-goto="topics">Read the patterns</button>
      </div>`;
    wireTopicRows(root, actions);
    return;
  }

  root.innerHTML = `
    <div class="card">
      <h2>Pattern mastery</h2>
      <p class="muted">Weakest first — this is what "next 2 weeks of focus" should be picked from. Click a
      pattern to open its Topics page.</p>
      ${worked.length < stats.length ? `<p class="muted small">${stats.length - worked.length} of
        ${stats.length} patterns have nothing logged against them yet and sit at the bottom
        unranked — an untouched pattern is not a weak one.</p>` : ""}
      <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Mastery</th><th>Pattern</th><th># problems</th><th>Attempts</th><th>Clean-solve rate</th><th>Trend</th><th>ID'd correctly</th><th>Avg time to insight</th><th>Top mistake</th></tr></thead>
        <tbody>
          ${stats.map((s) => `
            <tr class="table-row-link" data-open-topic="${esc(s.pattern.id)}">
              <td>${ringSvg(s.attempts ? s.solvedCleanRate || 0 : 0, { size: 34, stroke: 4, label: s.attempts ? pct(s.solvedCleanRate) : "–",
                description: s.attempts ? `${pct(s.solvedCleanRate)} clean-solve rate across ${s.attempts} attempts` : "No attempts yet" })}</td>
              <td><span class="row gap-sm" style="align-items:center"><span class="pattern-icon">${patternIcon(s.pattern.id, { size: 15 })}</span>${esc(s.pattern.name)}</span></td>
              <td class="num">${s.problemCount}</td>
              <td class="num">${s.attempts}</td>
              <td class="num">${s.attempts ? `<div class="bar bar-inline"><div class="bar-fill" style="width:${Math.round((s.solvedCleanRate || 0) * 100)}%"></div></div>${pct(s.solvedCleanRate)}` : "—"}</td>
              <td>${s.attempts >= 2 ? sparklineSvg(patternTrend(state, s.pattern.id)) : "—"}</td>
              <td class="num">${pct(s.patternGuessRate)}</td>
              <td class="num">${mins(s.avgInsightMin)}</td>
              <td>${s.topMistake ? s.topMistake.replace(/-/g, " ") : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      </div>
    </div>`;

  wireTopicRows(root, actions);
}

function wireTopicRows(root, actions) {
  root.querySelectorAll("[data-open-topic]").forEach((row) => {
    row.addEventListener("click", () => {
      showTopic(row.dataset.openTopic);
      actions.switchTab("topicDetail");
    });
  });
}

// ---------- Journal ----------

export function renderJournal(root, store) {
  const state = store.state;
  const entries = allAttempts(state).filter((a) => a.soulStatement).reverse();
  const notes = [...state.journal].reverse();
  const mocks = [...state.mocks].reverse();
  const review = mockReview(state, MOCK_CHECKLIST);

  const reflectionCounts = {};
  for (const a of entries) reflectionCounts[a.date] = (reflectionCounts[a.date] || 0) + 1;
  for (const n of notes) reflectionCounts[n.date] = (reflectionCounts[n.date] || 0) + 1;
  const hasReflections = entries.length + notes.length > 0;

  root.innerHTML = `
    ${hasReflections ? `
    <div class="card">
      <h2>Reflection frequency</h2>
      <p class="muted small">Every soul statement and note, by day. Reflecting regularly is what turns grinding into learning.</p>
      ${heatmapSvg(reflectionCounts)}
    </div>` : ""}
    <div class="card">
      <h2>Add a note</h2>
      <form id="journal-form" class="form">
        <div class="two-col">
          <label class="field"><span class="label">Type</span>
            <select class="select" name="type"><option value="weekly-retro">Weekly retro</option><option value="note">Note</option></select></label>
          <label class="field"><span class="label">Date</span><input class="input" type="date" name="date" value="${todayISO()}" /></label>
        </div>
        <label class="field"><span class="label">Text</span><textarea class="textarea" name="text" rows="4"></textarea></label>
        <button class="btn btn-primary" type="submit">Add</button>
      </form>
    </div>
    <div class="card">
      <h2>Notes</h2>
      ${notes.length === 0 ? emptyState("journal", "No notes yet",
        "A weekly retro here is where patterns across sessions become visible — what keeps tripping you up, and what finally clicked.",
        { focus: "#journal-form [name=text]", label: "Write the first one" }) : `
      <ul class="journal-list">
        ${notes.map((n) => `<li><div class="row space-between"><strong>${esc(n.type.replace(/-/g, " "))}</strong><span class="muted">${fmtDate(n.date)}</span></div><p>${esc(n.text)}</p></li>`).join("")}
      </ul>`}
    </div>
    ${mockReviewHtml(state, review)}
    <div class="card">
      <h2>Mock interviews</h2>
      ${mocks.length === 0 ? emptyState("log", "No mock interviews yet",
        "Toggle \"Verbalized mock\" when starting a session to practice talking through your approach out loud, on a strict timer. It gets logged here.",
        { tab: "queue", label: "Start one from the queue" }) : `
      <ul class="queue-list">
        ${mocks.map((m) => `
          <li class="queue-item">
            <div class="row gap-sm" style="align-items:flex-start">
              ${outcomeIcon(m.outcome)}
              <div>
                <div class="row gap-sm">
                  <span class="pill ${isCleanSolve(m) ? "pill-good" : "pill-muted"}">${esc(m.outcome)}</span>
                  <span class="pill pill-muted">${fmtDate(m.date)}</span>
                </div>
                <div class="queue-name">${esc(state.problems.find((p) => p.id === m.problemId)?.name || "Untitled")}${m.communicationRating ? ` · comms ${m.communicationRating}/5` : ""}${m.durationActualMin != null ? ` · ${m.durationActualMin} min` : ""}</div>
                ${mockChecklistHtml(m)}
              </div>
            </div>
          </li>`).join("")}
      </ul>`}
    </div>
    <div class="card">
      <h2>Soul statements</h2>
      ${entries.length === 0 ? emptyState("journal", "No soul statements yet",
        "At the end of every session you write one sentence about what actually happened. Months of those become the most useful thing in this app.",
        { tab: "queue", label: "Start a session" }) : `
      <ul class="journal-list">
        ${entries.map((a) => `
          <li>
            <div class="row space-between">
              <span class="row gap-sm" style="align-items:center">${outcomeIcon(a.outcome)}<strong>${esc(a.problemName)}</strong></span>
              <span class="muted">${fmtDate(a.date)} · ${esc(a.outcome)}</span>
            </div>
            <p>${esc(a.soulStatement)}</p>
            ${a.code ? `<button type="button" class="btn btn-ghost btn-sm" data-show-code="${esc(a.id)}">View code from this attempt</button>
            <div class="code-editor-host code-view" id="code-view-${esc(a.id)}" hidden></div>` : ""}
          </li>`).join("")}
      </ul>`}
    </div>`;

  root.querySelectorAll("[data-show-code]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.showCode;
      const host = root.querySelector(`#code-view-${CSS.escape(id)}`);
      const attempt = entries.find((a) => a.id === id);
      if (host.hidden === false) {
        host.hidden = true;
        return;
      }
      host.hidden = false;
      if (host.childElementCount) return; // already mounted once
      const CodeMirror = await loadCodeMirror();
      CodeMirror(host, {
        value: attempt.code,
        mode: CODE_MODES[attempt.codeLang]?.mode || "text/x-c++src",
        lineNumbers: true,
        readOnly: true,
        viewportMargin: Infinity,
      });
    });
  });

  root.querySelector("#journal-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!(f.get("text") || "").trim()) return;
    store.mutate((s) => {
      s.journal.push({ id: uid(), date: f.get("date") || todayISO(), type: f.get("type"), text: f.get("text") });
    }, "Ledger: journal entry");
    e.target.reset();
    toast("Noted.");
  });
}

/**
 * What your recent mocks say about how you interview.
 *
 * Deliberately not about whether you solved them — that is already in the
 * attempt, and counting it twice would make a mock look like a harder rep. A
 * mock exists for the part that only happens when someone is watching, and
 * the checklist was the only record of that anywhere in the app.
 */
function mockReviewHtml(state, review) {
  if (!review.total) return "";

  if (!review.enough) {
    return `
      <div class="card">
        <h2>How your mocks are going</h2>
        <p class="muted">${review.total} logged. ${review.needed} more and this will start
        reporting which of the five habits you actually keep — a rate over
        ${review.counted} would be a verdict on one bad morning.</p>
      </div>`;
  }

  return `
    <div class="card">
      <h2>How your mocks are going</h2>
      <p class="muted small">Across your last ${review.counted} mock${review.counted === 1 ? "" : "s"}.
      Not whether you solved them — that's in the attempt. This is the part that only happens
      when someone is watching.</p>

      ${review.weakest ? `<p>The one to work on: <strong>${esc(review.weakest.label.toLowerCase())}</strong>,
        which you did in ${review.weakest.done} of ${review.weakest.of}. You are most reliable at
        ${esc(review.strongest.label.toLowerCase())}.</p>` : ""}

      <ul class="habit-list">
        ${review.habits.map((h) => `
          <li>
            <span>${esc(h.label)}</span>
            <span class="row gap-sm" style="align-items:center">
              <span class="habit-bar" aria-hidden="true"><span style="width:${Math.round(h.rate * 100)}%"></span></span>
              <span class="muted small">${h.done}/${h.of}</span>
            </span>
          </li>`).join("")}
      </ul>

      ${review.avgCommunication != null || review.medianMinutes != null ? `
        <p class="muted small">${[
          review.avgCommunication != null
            ? `Communication averaging ${review.avgCommunication.toFixed(1)}/5 across the ${review.commsCount} you rated`
            : null,
          review.medianMinutes != null ? `${review.medianMinutes} min typical` : null,
        ].filter(Boolean).join(" · ")}.</p>` : ""}
    </div>`;
}

/** The five behaviours for one mock, so a row is a record of that run rather
 *  than a line in a list. */
function mockChecklistHtml(mock) {
  const done = MOCK_CHECKLIST.map((label, i) => ({ label, done: !!(mock.checklist || {})[i] }));
  if (!done.some((d) => d.done)) return "";
  return `<ul class="mock-ticks">
    ${done.map((d) => `<li class="${d.done ? "tick-done" : "tick-missed"}">
      <span aria-hidden="true">${d.done ? "\u2713" : "\u00b7"}</span>
      <span class="${d.done ? "" : "muted"}">${esc(d.label)}</span>
    </li>`).join("")}
  </ul>`;
}

// ---------- Topics ----------

// Diagrams mount immediately on the (now dedicated, one-per-pattern) topic
// page — there's nothing else competing for load time there — and their
// play-button timers are torn down whenever that page re-renders, so
// leaving mid-animation doesn't leave a setInterval ticking against a
// detached diagram forever.
let topicDiagramPlayers = [];
// Bumped on every topic render so a slow diagram import can tell whether the
// page it was loading for is still the one on screen.
let topicRenderToken = 0;

/** Appends a link under `patternId`, repairing a damaged `resources` map. defineProperty, not assignment: an id such as
 *  "constructor" is truthy on a plain object (push would throw) and "__proto__" would set the prototype and lose the link. */
function addResourceLink(s, patternId, link) {
  if (!isRecord(s.resources)) s.resources = {};
  const list = ownValue(s.resources, patternId);
  if (Array.isArray(list)) list.push(link);
  else Object.defineProperty(s.resources, patternId, { value: [link], writable: true, enumerable: true, configurable: true });
}


/** The Topics index — a table of contents, not an accordion: one card per
 * pattern (icon, name, mastery, the plain-language hook) that links to its
 * own dedicated page rather than expanding in place. 23 patterns in one
 * scrolling accordion was exactly the "wall of everything" this whole
 * redesign is against. */
export function renderTopics(root, store, actions) {
  const state = store.state;
  const stats = patternStats(state);
  const statByPattern = new Map(stats.map((s) => [s.pattern.id, s]));

  // Reading about a pattern lands better when you're about to practise it, so
  // the index says which ones have work waiting rather than leaving you to
  // cross-reference the queue yourself.
  const dueByPattern = new Map();
  for (const p of dueProblems(state)) {
    dueByPattern.set(p.patternId, (dueByPattern.get(p.patternId) || 0) + 1);
  }

  root.innerHTML = `
    <div class="card">
      <h2>Topics</h2>
      <p class="muted">Pick a pattern. Each page: what it is in plain terms, how to recognize it, the
      invariant that makes it work, animated worked examples, and your own logged problems as the
      practice ladder — so it stays accurate instead of linking to problems you haven't touched.</p>
    </div>
    <div class="index-grid">
      ${state.patterns.map((pat) => {
        const s = statByPattern.get(pat.id);
        const t = ownValue(TOPICS, pat.id);
        const due = dueByPattern.get(pat.id);
        return `
        <button type="button" class="card index-card topic-index-card" data-open-topic="${esc(pat.id)}">
          <div class="row gap-sm" style="align-items:center">
            <span class="topic-index-icon">${patternIcon(pat.id, { size: 22 })}</span>
            <h3 style="margin:0">${esc(pat.name)}</h3>
          </div>
          <p class="muted small">${esc(t?.hook || pat.description)}</p>
          <span class="row gap-sm">
            ${s && s.attempts ? `<span class="pill ${pct(s.solvedCleanRate)[0] === "1" ? "pill-good" : "pill-muted"}">${pct(s.solvedCleanRate)} clean-solve</span>` : `<span class="pill pill-muted">not practiced yet</span>`}
            ${due ? `<span class="pill pill-warn">${due} due</span>` : ""}
          </span>
        </button>`;
      }).join("")}
    </div>`;

  root.querySelectorAll("[data-open-topic]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showTopic(btn.dataset.openTopic);
      actions.switchTab("topicDetail");
    });
  });
}

/** The dedicated per-pattern page — reached only by clicking a Topics card
 * (topicNav.patternId set just before the tab switch), same handoff idiom
 * used for prefilling Log Session and starting a Workspace session. */
/**
 * Where you stand on this pattern, in one line, in the header.
 *
 * The full history was already at the bottom of this page, which is the right
 * place for a chart and six recent attempts — and it is below the hook, the
 * concept, the recognisers, the invariant, the pitfalls, two diagrams, the
 * practice ladder and your resource links. "How am I doing on this" should not
 * need a scroll.
 *
 * Silent on a pattern you have never practised: the empty state at the bottom
 * of the page already says so, and saying it twice on one screen reads as the
 * page insisting.
 */
function topicRecordHtml(state, patternId) {
  const record = patternStats(state).find((s) => s.pattern.id === patternId);
  if (!record || !record.attempts) return "";

  const parts = [
    `${record.attempts} attempt${record.attempts === 1 ? "" : "s"}`,
    record.solvedCleanRate != null ? `${pct(record.solvedCleanRate)} clean` : null,
    record.patternGuessRate != null ? `${pct(record.patternGuessRate)} recalled` : null,
    record.avgInsightMin != null ? `${Math.round(record.avgInsightMin)} min to the approach` : null,
  ].filter(Boolean);

  return `
    <p class="topic-record muted small">
      ${esc(parts.join(" · "))}${record.topMistake
        ? ` · most often <span class="pill pill-warn">${esc(record.topMistake.replace(/-/g, " "))}</span>` : ""}
    </p>`;
}

export function renderTopicDetail(root, store, actions) {
  topicDiagramPlayers.forEach((p) => p.destroy());
  topicDiagramPlayers = [];
  const state = store.state;
  const pat = state.patterns.find((p) => p.id === topicNav.patternId);
  if (!pat) {
    actions.switchTab("topics");
    return;
  }
  const t = ownValue(TOPICS, pat.id);
  const problems = state.problems.filter((p) => p.patternId === pat.id)
    .sort((a, b) => difficultyRank(a.difficulty) - difficultyRank(b.difficulty));
  const resources = ownValue(state.resources, pat.id) || [];

  root.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" id="topic-back">← Topics</button>
    <div class="card topic-detail-header">
      <div class="row gap-sm" style="align-items:center">
        <span class="topic-index-icon topic-index-icon-lg">${patternIcon(pat.id, { size: 30 })}</span>
        <div>
          <h2 style="margin:0">${esc(pat.name)}</h2>
          <p class="muted small" style="margin:0.15rem 0 0">${esc(pat.description)}</p>
        </div>
      </div>
      ${topicRecordHtml(state, pat.id)}
      ${topicFocusHtml(state, pat.id)}
    </div>
    ${t ? `
    <div class="card">
      <p class="topic-hook">${richText(t.hook)}</p>
      <p><strong>More precisely.</strong> ${richText(t.concept)}</p>
      <p><strong>Recognize it from:</strong> ${t.recognize.map((r) => `<span class="pill pill-muted">${richText(r)}</span>`).join(" ")}</p>
      <p><strong>Invariant.</strong> ${richText(t.invariant)}</p>
      <p><strong>Pitfalls</strong></p>
      <ul class="tight-list">${t.pitfalls.map((p) => `<li>${richText(p)}</li>`).join("")}</ul>
    </div>` : ""}
    <div id="topic-diagrams">
      <div class="card"><div class="skeleton skeleton-line" style="width:40%"></div>
      <div class="skeleton" style="height:7rem;margin-top:0.6rem"></div></div>
    </div>
    <div class="card">
      <h2>Practice ladder</h2>
      ${problems.length === 0
        ? `<p class="muted small">None of yours yet — start with one from the catalog below.</p>`
        : `<p class="muted small">Yours, easiest first.</p>
      <ul class="queue-list">${problems.map((p) => queueItemHtml(state, p)).join("")}</ul>`}
      <h3 class="ladder-subhead">From the catalog</h3>
      <div id="topic-catalog"><div class="skeleton skeleton-line" style="width:60%"></div></div>
    </div>
    <div class="card">
      <h2>Resources</h2>
      ${resources.length === 0 ? `<p class="muted small">No links saved yet.</p>` : `
      <ul class="resource-list">${resources.map((r) => `
        <li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a>
        <button type="button" class="btn-icon" data-remove-resource="${esc(pat.id)}::${esc(r.id)}" aria-label="Remove">×</button></li>`).join("")}</ul>`}
      <form class="form resource-form" data-add-resource="${esc(pat.id)}">
        <input class="input" name="title" placeholder="Title (optional)" />
        <input class="input" name="url" placeholder="https://youtube.com/watch?v=…" required />
        <button class="btn btn-ghost btn-sm" type="submit">Add link</button>
      </form>
      <a class="btn btn-ghost btn-sm" href="https://www.youtube.com/results?search_query=${encodeURIComponent(pat.name + " leetcode pattern explained")}" target="_blank" rel="noopener">Search YouTube for "${esc(pat.name)}"</a>
    </div>

    <!-- The pattern's own trend lives here rather than on Progress. Progress
         answers "am I getting better" across everything, which is the right
         question there and useless the moment you know which pattern is weak:
         "0% across 3 attempts" is only actionable next to the attempts that
         made it so. -->
    ${patternProgressHtml(state, pat.id)}`;

  root.querySelector("#topic-back").addEventListener("click", () => actions.switchTab("topics"));

  const diagramHost = root.querySelector("#topic-diagrams");
  if (diagramHost) {
    const renderToken = ++topicRenderToken;
    loadDiagramModules().then(({ mounters, specs: allSpecs }) => {
      // Guard against arriving after the user has already moved on — mounting
      // into a detached node would leak players that never get destroyed.
      if (renderToken !== topicRenderToken || !document.contains(diagramHost)) return;
      diagramHost.innerHTML = "";
      for (const spec of ownValue(allSpecs, pat.id) || []) {
        const mount = mounters[spec.kind];
        if (!mount) continue;
        const slot = document.createElement("div");
        diagramHost.appendChild(slot);
        topicDiagramPlayers.push(mount(slot, spec));
      }
    }).catch(() => {
      if (renderToken !== topicRenderToken) return;
      diagramHost.innerHTML = `<div class="card"><p class="muted small">The worked examples couldn't
        be loaded. Everything above is unaffected.</p></div>`;
    });
  }

  const catalogHost = root.querySelector("#topic-catalog");
  if (catalogHost) {
    const renderToken = topicRenderToken;
    renderCatalogLadder(catalogHost, store, actions, pat.id, {
      isCurrent: () => renderToken === topicRenderToken && document.contains(catalogHost),
    });
  }

  wireStartButtons(root, store, actions);
  wireFocusButtons(root, store);
  root.querySelectorAll("[data-add-resource]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const patternId = form.dataset.addResource;
      const f = new FormData(form);
      const url = (f.get("url") || "").trim();
      if (!url) return;
      store.mutate((s) => {
        addResourceLink(s, patternId, { id: uid(), title: (f.get("title") || "").trim(), url, addedAt: todayISO() });
      }, "Ledger: add resource link");
      toast("Added.");
    });
  });
  // Removing one thing from a list: it happens, and it can be taken back.
  // This was the one destructive action in the app with neither a question
  // nor an undo — the quietest of the three, on the only one with no way back.
  root.querySelectorAll("[data-remove-resource]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [patternId, resourceId] = btn.dataset.removeResource.split("::");
      const removed = (ownValue(store.state.resources, patternId) || []).find((r) => r.id === resourceId);
      if (!removed) return;
      const at = (ownValue(store.state.resources, patternId) || []).indexOf(removed);
      store.mutate((s) => {
        s.resources[patternId] = (s.resources[patternId] || []).filter((r) => r.id !== resourceId);
      }, "Ledger: remove resource link");
      offerUndo(store, `Removed ${removed.title || removed.url}.`, (s) => {
        // Back where it was, not appended: the order is the user's.
        const list = s.resources[patternId] || (s.resources[patternId] = []);
        list.splice(Math.min(at, list.length), 0, removed);
      }, "Ledger: restore resource link");
    });
  });
}

// ---------- Whiteboard ----------

let activeWhiteboard = null;

export function renderWhiteboard(root, store, actions) {
  const state = store.state;
  const boards = [...state.whiteboards].reverse();

  root.innerHTML = `
    <div class="card">
      <h2>Whiteboard</h2>
      <p class="muted">A freeform scratchpad — for sketching outside an active session (system design,
      general note-taking). During a live session, a whiteboard panel is built into the workspace
      already and saves automatically when you submit. Works with mouse, touch, or a stylus.</p>
      <div id="wb-root"></div>
      <form id="wb-save-form" class="form" style="margin-top:0.75rem">
        <div class="two-col">
          <label class="field"><span class="label">Attach to problem (optional)</span>
            <select class="select" name="problemId">
              <option value="">— none —</option>
              ${state.problems.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}
            </select></label>
          <label class="field"><span class="label">Caption</span><input class="input" name="caption" placeholder="e.g. two-pointer trace" /></label>
        </div>
        <button class="btn btn-primary" type="submit">Save to GitHub</button>
      </form>
    </div>
    <div class="card">
      <h2>Saved boards</h2>
      ${boards.length === 0 ? emptyState("whiteboard", "No boards saved yet",
        "Sketching the shape of a problem before writing code is most of the work in an interview. Anything you draw here can be saved against a problem.",
        { focus: "#wb-save-form [name=caption]", label: "Draw one and save it" }) : `
      <ul class="queue-list">
        ${boards.map((b) => `
          <li class="queue-item">
            <div>
              <div class="row gap-sm"><span class="pill pill-muted">${fmtDate(b.date)}</span>${b.problemId ? `<span class="pill pill-muted">${esc(state.problems.find((p) => p.id === b.problemId)?.name || "")}</span>` : ""}</div>
              <div class="queue-name">${esc(b.caption || "Untitled")}</div>
              <div class="whiteboard-thumb-host" id="wb-thumb-${esc(b.id)}"></div>
            </div>
            <button class="btn btn-ghost btn-sm" data-view-board="${esc(b.id)}">View</button>
          </li>`).join("")}
      </ul>`}
    </div>`;

  activeWhiteboard = createWhiteboard(root.querySelector("#wb-root"));

  root.querySelector("#wb-save-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (activeWhiteboard.isEmpty()) {
      toast("Nothing drawn yet.");
      return;
    }
    const f = new FormData(e.target);
    const id = uid();
    const path = `prep-data/whiteboards/${id}.png`;
    const dataUrl = activeWhiteboard.toDataUrl();
    toast("Saving…");
    try {
      await store.saveWhiteboardImage(path, dataUrl, "Ledger: save whiteboard drawing");
      store.mutate((s) => {
        s.whiteboards.push({ id, date: todayISO(), problemId: f.get("problemId") || null, path, caption: (f.get("caption") || "").trim() });
        updateStreak(s);
      }, "Ledger: index whiteboard drawing");
      toast("Saved.");
      actions.rerender();
    } catch (err) {
      toast(isLocalOnly(err) ? DRAWINGS_NEED_REPO_NOTE : "Save failed — check your connection.");
    }
  });

  wireBoardViewers(root, store, boards);
}

/**
 * Wire "show this drawing" buttons against a list of boards.
 *
 * Boards are PNGs in the repo rather than in state, so each one is a fetch —
 * hence lazily, on click, rather than loading every thumbnail on render.
 * Shared by the Whiteboard page and a problem's own page, which would
 * otherwise be two copies of the same fetch-decode-insert.
 */

// ---------- LeetCode ----------

export function renderLeetCode(root, store, actions) {
  const state = store.state;
  const lc = store.leetcode;

  // Without a repo nothing will ever load this, so "Loading…" would be a lie that never resolves.
  if (!store.gh) {
    root.innerHTML = `<div class="card" data-testid="leetcode-needs-repo"><h2>LeetCode</h2>
      <p class="muted">These stats come from a daily GitHub Action in your repo, and this device is
      saving on its own. Use Back up to GitHub in Settings if you want them here.</p></div>`;
    return;
  }

  if (!lc || lc.status === "loading") {
    root.innerHTML = `<div class="card"><p class="muted">Loading LeetCode stats…</p></div>`;
    return;
  }
  if (lc.status === "error" || lc.status === "empty" || (lc.data && lc.data.error)) {
    root.innerHTML = `
      <div class="card">
        <h2>LeetCode</h2>
        <p class="muted">No synced data yet. LeetCode's API can't be called directly from a browser (no
        CORS support), so a daily GitHub Action in your private repo fetches your public profile
        server-side and commits it to <code>prep-data/leetcode-stats.json</code> — this tab just reads
        that file.</p>
        <ol class="setup-steps">
          <li>In the <code>leetcode</code> repo on GitHub: <strong>Settings → Secrets and variables →
            Actions → Variables</strong> → add <code>LEETCODE_USERNAME</code> with your LeetCode handle.</li>
          <li><strong>Actions</strong> tab → <strong>Sync LeetCode stats</strong> → <strong>Run
            workflow</strong> to sync immediately instead of waiting for the daily run.</li>
        </ol>
        <button class="btn btn-ghost" id="lc-refresh">Check again</button>
        ${lc.error ? `<p class="muted small">${esc(lc.error)}</p>` : ""}
      </div>`;
    root.querySelector("#lc-refresh").addEventListener("click", () => {
      store.loadLeetCodeStats().then(() => actions.rerender());
    });
    return;
  }

  const d = lc.data;
  const loggedCount = state.problems.filter((p) => p.attempts.length > 0).length;
  root.innerHTML = `
    <div class="card">
      <div class="row space-between">
        <h2>LeetCode — ${esc(d.username)}</h2>
        <button class="btn btn-ghost btn-sm" id="lc-refresh">Refresh</button>
      </div>
      <p class="muted small">Last synced ${d.fetchedAt ? new Date(d.fetchedAt).toLocaleString() : "—"} · updates ~daily</p>
      <div class="stat-row">
        <div class="stat"><span class="stat-num">${d.solvedByDifficulty?.All ?? 0}</span><span class="stat-label">solved on LeetCode</span></div>
        <div class="stat"><span class="stat-num">${loggedCount}</span><span class="stat-label">logged in Ledger</span></div>
        <div class="stat"><span class="stat-num">${d.streak ?? 0}</span><span class="stat-label">LC streak</span></div>
      </div>
      <div class="row gap" style="margin-top:0.5rem">
        <span class="pill pill-muted">Easy ${d.solvedByDifficulty?.Easy ?? 0}</span>
        <span class="pill pill-muted">Medium ${d.solvedByDifficulty?.Medium ?? 0}</span>
        <span class="pill pill-muted">Hard ${d.solvedByDifficulty?.Hard ?? 0}</span>
      </div>
    </div>
    <div class="card">
      <h2>Submission activity</h2>
      ${heatmapSvg(leetcodeCalendarToDateCounts(d.submissionCalendar))}
    </div>
    <div class="card">
      <h2>Recent accepted</h2>
      ${(d.recentAccepted || []).length === 0 ? `<p class="empty">Nothing recent, or your submission list is private on LeetCode.</p>` : `
      <ul class="queue-list">
        ${d.recentAccepted.map((s) => `
          <li class="queue-item">
            <div>
              <div class="queue-name"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></div>
              <span class="muted small">${new Date(s.timestamp * 1000).toLocaleDateString()} · ${esc(s.lang)}</span>
            </div>
            <button class="btn btn-primary btn-sm" data-quick-log="${esc(s.title)}" data-quick-slug="${esc(s.titleSlug)}">Quick log</button>
          </li>`).join("")}
      </ul>`}
    </div>`;

  root.querySelector("#lc-refresh").addEventListener("click", () => {
    store.loadLeetCodeStats().then(() => actions.rerender());
  });
  root.querySelectorAll("[data-quick-log]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const existing = state.problems.find((p) => p.name.toLowerCase() === btn.dataset.quickLog.toLowerCase());
      prefill.problemId = existing ? existing.id : "__new__";
      prefill.name = btn.dataset.quickLog;
      prefill.url = `https://leetcode.com/problems/${btn.dataset.quickSlug}/`;
      actions.switchTab("log");
    });
  });
}

/**
 * What today is for, according to the week.
 *
 * Above the recommendation rather than beside it, because it is the thing that
 * decides whether the recommendation is even wanted: on a rest day there is
 * nothing to recommend, and an app that asks for one more problem on the day
 * you set aside to stop is an app people stop trusting.
 *
 * Counted from the log rather than from anything anyone ticks, so it cannot
 * drift from what actually happened.
 */
function todayCardHtml(state) {
  // Unconfigured, it says the setup exists and nothing more. One line, no
  // dismiss button to manage: it goes away the moment a week is chosen, which
  // is the only thing it is asking for.
  if (!weekConfigured(state)) {
    return `
      <div class="card setup-nudge">
        <p class="muted small">Tell Ledger when your interview is and what your week looks like, and it
        plans each day around it — which problems, which days are for design, which days are off.
        <button type="button" class="link-button" data-tab="settings" data-jump="set-prep">Set it up</button></p>
      </div>`;
  }
  const progress = dayProgress(state);
  const week = weekProgress(state);
  const slot = progress.slot;

  if (progress.rested) {
    return `
      <div class="card today-card resting">
        <h2>${esc(slot.label)} — rest</h2>
        <p class="muted">Your week puts a day off here, so this one is already done. Seven days of
        this is what people quit in three.</p>
        <p class="muted small">${week.got} of ${week.want} problems over the last seven days.</p>
      </div>`;
  }

  const done = progress.complete;
  const long = currentLongRun(state);
  // Where a long day is up to, or the offer to run it as one. The design
  // Saturday already has its own card below, so only a long *coding* day is
  // offered here.
  const longLine = long.run && long.plan
    ? `<p class="long-resume">${long.run.index >= long.plan.steps.length
        ? "The long session is done."
        : `Long session: step ${long.run.index + 1} of ${long.plan.steps.length} —
           ${esc(long.plan.steps[long.run.index].label)}.`}
        <button type="button" class="link-button" data-tab="longSession">Back to the plan</button></p>`
    : long.plan && long.plan.kind === "coding"
      ? `<p class="long-resume">Today is two sittings with a break between.
          <button type="button" class="link-button" data-tab="longSession">Run it as a guided session</button></p>`
      : "";
  return `
    <div class="card today-card${done ? " complete" : ""}">
      <div class="row space-between" style="align-items:flex-start;gap:0.75rem;flex-wrap:wrap">
        <div>
          <h2>${esc(slot.label)}${done ? " — done" : ""}</h2>
          <p class="muted">${done
            ? "Everything the week asked for today. Anything more is a bonus, not a debt."
            : "What the week asks for today."}</p>
        </div>
        <span class="muted small" data-testid="${HOME_WEEK_COUNT_TESTID}">${week.got} of ${week.want} this week</span>
      </div>
      <ul class="today-items">
        ${progress.items.map((item) => `
          <li class="${item.met ? "met" : ""}">
            ${item.manual
              // Only what the log cannot see gets a control. A tick on coding
              // would be a second source of truth about something already counted.
              ? `<button type="button" class="today-tick today-check" data-day-check="${esc(item.kind)}"
                   aria-pressed="${item.met}" aria-label="${item.met ? "Mark not done" : "Mark done"}: ${esc(item.label)}">${item.met ? "✓" : "○"}</button>`
              : `<span class="today-tick" aria-hidden="true">${item.met ? "✓" : "○"}</span>`}
            <span><strong>${esc(item.label)}</strong>
              ${!item.manual && (item.want > 1 || item.got > 0) ? `<span class="muted small">${item.got} of ${item.want}</span>` : ""}
              ${item.manual && !item.met ? `<span class="muted small">tick it when it's done</span>` : ""}
              ${!item.met && ITEM_GO[item.kind]
                ? `<button type="button" class="link-button"
                     ${ITEM_GO[item.kind].tab ? `data-tab="${ITEM_GO[item.kind].tab}"` : `data-open-quiz="${ITEM_GO[item.kind].quiz}"`}>${ITEM_GO[item.kind].label}</button>`
                : ""}
              <br /><span class="muted small">${esc(itemKind(item.kind)?.blurb || "")}</span></span>
          </li>`).join("")}
      </ul>
      ${longLine}
    </div>`;
}

/**
 * The drills a target weights, offered where the day's work is offered.
 *
 * Only what the target says it cares about: speed gets the two-mediums round,
 * ambiguity gets the clarify drill. Somebody who has not chosen a target sees
 * neither, which is the rule every part of this profile follows.
 */
function emphasisButtons(state) {
  const emphasis = prepStatus(state).emphasis;
  return [
    emphasis.includes("speed") ? `<button class="btn btn-ghost" data-tab="pairMock">Two-mediums mock</button>` : "",
    emphasis.includes("ambiguity") ? `<button class="btn btn-ghost" data-open-quiz="clarify">Clarify drill</button>` : "",
  ].join("");
}

/** Where a scheduled item that the dashboard can start is started from. */
const ITEM_GO = {
  pairMock: { tab: "pairMock", label: "start the round" },
  clarify: { quiz: "clarify", label: "open the drill" },
  drill: { quiz: "pattern", label: "open the drill" },
};

/**
 * Whether today is a day the week asks for coding at all.
 *
 * The recommendation is only worth making if the answer is yes. A day set
 * aside for design that still opens with "here is your next coding problem" is
 * two parts of the same app disagreeing in front of the user, and the one that
 * loses is the plan they wrote.
 */
function wantsCodingToday(state) {
  if (!weekConfigured(state)) return true;
  const progress = dayProgress(state);
  if (progress.rested) return false;
  return progress.items.some((i) => i.kind === "coding" || i.kind === "mock");
}

/** What to offer instead, on a day the week has given to something else. */
function offDutyCardHtml(state) {
  if (!weekConfigured(state)) return "";
  const progress = dayProgress(state);
  if (progress.rested) return "";      // the Today card has already said it

  const design = progress.items.find((i) => i.kind.startsWith("design"));
  if (!design) return "";
  const { run: longRun } = currentLongRun(state);
  const ACTION = {
    designMock: { tab: "longSession", label: longRun ? "Back to the long session" : "Start the long session" },
    designProblem: { tab: "designBank", label: "Pick a problem" },
    designStudy: { tab: "components", label: "Open the components" },
  };
  const action = ACTION[design.kind] || ACTION.designStudy;
  // The specific thing, where there is one, rather than a page to go and choose from.
  const pick = design.kind === "designStudy" ? studyPick(state) : null;
  const problemRec = design.kind === "designProblem" ? recommendDesign(state) : null;
  const button = pick
    ? `<button class="btn btn-primary" data-open-component="${esc(pick.component.id)}">Read ${esc(pick.component.name)}</button>`
    : problemRec
      ? `<button class="btn btn-primary" data-start-design="${esc(problemRec.problemId)}">Work it</button>`
      : `<button class="btn btn-primary" data-tab="${action.tab}">${esc(action.label)}</button>`;
  const detail = pick
    ? ` Today: <strong>${esc(pick.component.name)}</strong> — ${esc(pick.reason)}.`
    : problemRec ? ` ${esc(problemRec.message)}` : "";
  return `
    <div class="card session-cta-card">
      <div class="row space-between session-cta-row">
        <div>
          <h2>${esc(itemKind(design.kind)?.label || "Design")}</h2>
          <p class="muted">Today is a design day in your week — no coding problem is scheduled.
          ${esc(itemKind(design.kind)?.blurb || "")}${detail}</p>
        </div>
        <div class="row gap-sm">
          <button class="btn btn-ghost" id="cta-warmup">${warmupFor(state).kind === "fluency" ? "Fluency warm-up" : "5-min warmup"}</button>
          ${button}
        </div>
      </div>
    </div>`;
}
