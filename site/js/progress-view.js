// The Progress view: "am I actually getting better?"
//
// Where this fits: its own page under Track. The app already recorded
// everything needed to answer this, but spread across the queue, the quiz and
// the mastery table, so the answer was never actually on screen.
//
// Two decisions shape everything here.
//
// First, better does not mean more. The failure mode this whole app exists to
// prevent is grinding harder and calling it progress, so the headline measures
// are solving cleanly and recognizing the pattern faster. Volume appears only
// so that a spike followed by a collapse is visible for what it is, and a week
// far above the usual is named rather than congratulated.
//
// Second, the charts refuse to flatter. A week with a single attempt shows a
// gap rather than 0% or 100%, empty weeks stay visible instead of being
// collapsed, and a pattern without enough attempts on both sides of a split is
// left out rather than drawn as flat. A chart that misleads is worse than no
// chart, because it gets believed.

import {
  esc, pct, mins, fmtDate, NO_DAY, toast, outcomeLabel, downloadFile, outcomeClass,
} from "./ui.js";
import { emptyState } from "./chrome.js";
import { quoteLines, inlineText } from "./markdown-text.js";
import {
  designAttempts, componentStats, blindSpots, splitBudget,
} from "./design-logic.js";
import {
  weeklyProgress, patternMovement, progressSummary, PROGRESS_WEEKS, allAttempts, weekInReview,
  todayISO, isCleanSolve, dayOf,
} from "./logic.js";
import { patternIcon } from "./icons.js";
import { planAdherence, planLooksTooBig, nothingLoggedNote } from "./adherence.js";
import { weekConfigured } from "./week.js";
import { runwayCheck, RUNWAY_NAMES_SHOWN, ATTEMPTS_PER_PATTERN } from "./runway.js";
import { PAIR_ROUND_SITTINGS } from "./sittings.js";

const CHART_WIDTH = 560;
const CHART_HEIGHT = 120;
const PADDING = { top: 10, right: 8, bottom: 20, left: 30 };
// Below this many rated weeks there is no trend to draw, only noise to
// over-interpret.
const MIN_POINTS_FOR_CHART = 2;

export function renderProgress(root, store, actions) {
  const state = store.state;
  const summary = progressSummary(state, PROGRESS_WEEKS);
  const movers = patternMovement(state);
  const week = weekInReview(state);

  root.innerHTML = `
    ${weekHtml(state, week)}

    ${adherenceCardHtml(planAdherence(state), weekConfigured(state))}

    ${runwayCardHtml(runwayCheck(state))}

    <div class="card">
      <h2>Are you getting better?</h2>
      ${summary.hasEnoughData
        ? `<p class="muted">${headlineText(summary)}</p>`
        : `<p class="muted">Not enough logged yet to show a trend — this needs a couple of weeks
           with at least two sessions each. ${summary.totalAttempts} attempt${summary.totalAttempts === 1 ? "" : "s"}
           recorded across ${summary.activeWeeks} week${summary.activeWeeks === 1 ? "" : "s"} so far.</p>`}
      ${summary.spike ? spikeNoticeHtml(summary.spike) : ""}
    </div>

    ${summary.hasEnoughData ? `
    <div class="card">
      <h2>Clean solves</h2>
      <p class="muted small">Share of attempts you solved without stumbling, by week. Weeks with a
      single attempt are left blank — one attempt isn't a rate.</p>
      ${lineChart(summary.weeks.map((w) => ({ label: shortWeek(w.weekStart), value: w.cleanRate })),
        { format: (v) => `${Math.round(v * 100)}%`, max: 1, min: 0 })}
    </div>

    <div class="card">
      <h2>Time to insight</h2>
      <p class="muted small">Median minutes before you knew the approach. This one is the interview
      skill — falling is good, and it improves long before clean-solve rate does.</p>
      ${lineChart(summary.weeks.map((w) => ({ label: shortWeek(w.weekStart), value: w.medianInsightMin })),
        { format: (v) => `${Math.round(v)}m`, lowerIsBetter: true })}
    </div>` : ""}

    <div class="card">
      <h2>Weekly volume</h2>
      <p class="muted small">Here to show consistency, not to be maximized. An even line beats a
      tall one — spikes are what precede stopping altogether.</p>
      ${volumeChart(summary.weeks)}
    </div>

    ${moversHtml(movers)}
    ${designProgressHtml(store.state)}`;

  wireWeek(root, store, week, actions);
  wireAdherence(root, actions);
}

// ---------- The last seven days ----------
//
// Everything below this on the page answers "am I improving", over twelve
// weeks, in rates — and refuses on principle to say anything about a single
// week, because one week is not a trend. Which left no answer at all to the
// plainer question you actually have on a Sunday evening: what did I do.
//
// So this counts instead of rating, and leads with the account rather than a
// score. The one rate it shows carries its sample beside it, and disappears
// below three attempts: a "100% clean week" off one problem is the most
// misleading thing this app could print, and the easiest.

function weekHtml(state, week) {
  const range = `${fmtDate(week.startISO)} – ${fmtDate(week.endISO)}`;

  if (week.quiet) {
    return `
      <div class="card">
        <h2>Your week</h2>
        <p class="muted small">${esc(range)}</p>
        <p class="muted">Nothing logged in the last seven days. That is information, not a
        verdict — weeks happen. The queue will still be there, and nothing you have built
        expires.</p>
      </div>`;
  }

  return `
    <div class="card">
      <div class="row space-between" style="align-items:flex-start;gap:0.75rem;flex-wrap:wrap">
        <div>
          <h2>Your week</h2>
          <p class="muted small">${esc(range)}</p>
        </div>
        <button class="btn btn-ghost btn-sm" id="export-week">Export this week</button>
      </div>

      <div class="stat-row" style="margin-top:0.5rem">
        <div class="stat"><span class="stat-num">${week.sessionCount}</span>
          <span class="stat-label">session${week.sessionCount === 1 ? "" : "s"}</span></div>
        <div class="stat"><span class="stat-num">${week.activeDays}</span>
          <span class="stat-label">of 7 days</span></div>
        ${week.timedCount ? `<div class="stat"><span class="stat-num">${mins(week.minutes)}</span>
          <span class="stat-label">${week.timedCount === week.sessionCount
            ? "solving" : `across ${week.timedCount} timed`}</span></div>` : ""}
        ${week.cleanRate != null ? `<div class="stat"><span class="stat-num">${pct(week.cleanRate)}</span>
          <span class="stat-label">clean, of ${week.sessionCount}</span></div>` : ""}
      </div>
      ${week.cleanRate == null ? `<p class="muted small">Too few attempts this week for a
        clean-solve rate to mean anything — ${week.cleanCount} of ${week.sessionCount} went
        cleanly.</p>` : ""}
      <p class="muted small">${esc(comparisonText(week))}</p>

      ${week.promoted.length ? `
        <h3 class="week-heading">What moved up</h3>
        <ul class="week-list">
          ${week.promoted.map((p) => `<li>
            <button type="button" class="link-button" data-open-problem="${esc(p.id)}">${esc(p.name)}</button>
            <span class="muted small">— now box ${p.box}</span></li>`).join("")}
        </ul>` : ""}

      <h3 class="week-heading">What you worked on</h3>
      <ul class="week-list">
        ${week.sessions.map((a) => `<li>
          <span class="outcome-dot ${esc(outcomeClass(a.outcome))}" aria-hidden="true"></span>
          <button type="button" class="link-button" data-open-problem="${esc(a.problemId)}">${esc(a.problemName)}</button>
          <span class="muted small">— ${esc(outcomeLabel(a.outcome))}, ${esc(fmtDate(a.date))}</span>
        </li>`).join("")}
      </ul>

      ${week.notes.length ? `
        <h3 class="week-heading">What you wrote down</h3>
        <ul class="week-notes">
          ${week.notes.map((n) => `<li>
            <blockquote>${esc(n.text)}</blockquote>
            <span class="muted small">${esc(n.problemName)} · ${esc(fmtDate(n.date))}</span>
          </li>`).join("")}
        </ul>` : ""}

      ${week.mocks.length || week.journal.length ? `
        <p class="muted small week-also">Also this week:
        ${[week.mocks.length ? `${week.mocks.length} mock${week.mocks.length === 1 ? "" : "s"}` : null,
           week.journal.length ? `${week.journal.length} journal entr${week.journal.length === 1 ? "y" : "ies"}` : null]
          .filter(Boolean).join(" and ")}.</p>` : ""}
    </div>`;
}

/** Quieter or busier than the week before — said as a fact, never as praise or
 *  a reprimand. A lighter week is a legitimate outcome everywhere else in this
 *  app and has to read as one here. */
function comparisonText(week) {
  const prev = week.previous;
  if (!prev || prev.sessionCount === 0) {
    return `Nothing logged the week before, so there's nothing to compare against yet.`;
  }
  const diff = week.sessionCount - prev.sessionCount;
  if (diff === 0) return `The same number of sessions as the week before.`;
  return `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} session${Math.abs(diff) === 1 ? "" : "s"} `
    + `than the week before, which had ${prev.sessionCount}.`;
}

/**
 * The same week, as text you can paste somewhere.
 *
 * Markdown for the same reason a problem's history is: the audience is a
 * person reading it — you next Sunday, or whoever is helping you prepare.
 */
export function weekToMarkdown(state, week) {
  const lines = [`# Week of ${week.startISO} to ${week.endISO}`, ""];
  if (week.quiet) {
    lines.push("Nothing logged this week.");
    return lines.join("\n");
  }

  lines.push(`- ${week.sessionCount} session${week.sessionCount === 1 ? "" : "s"} across `
    + `${week.activeDays} of ${week.days} days`);
  if (week.timedCount) {
    lines.push(`- ${week.minutes} minutes solving`
      + (week.timedCount === week.sessionCount ? "" : ` (across the ${week.timedCount} I timed)`));
  }
  lines.push(week.cleanRate != null
    ? `- ${Math.round(week.cleanRate * 100)}% solved cleanly (${week.cleanCount} of ${week.sessionCount})`
    : `- ${week.cleanCount} of ${week.sessionCount} solved cleanly — too few for a rate`);
  lines.push("");

  if (week.promoted.length) {
    lines.push("## What moved up");
    for (const p of week.promoted) lines.push(`- ${inlineText(p.name)} — now box ${p.box}`);
    lines.push("");
  }

  lines.push("## What I worked on");
  for (const a of week.sessions) {
    lines.push(`- ${dayOf(a.date) ?? NO_DAY} — ${inlineText(a.problemName)}: ${outcomeLabel(a.outcome)}`);
  }
  lines.push("");

  // A hand-edited, non-string note quotes to nothing; an attribution or heading with no note under it would mislead.
  const quotedNotes = week.notes
    .map((n) => ({ n, quote: quoteLines(n.text) }))
    .filter(({ quote }) => quote.length);
  if (quotedNotes.length) {
    lines.push("## What I wrote down");
    for (const { n, quote } of quotedNotes) {
      lines.push(...quote, ...quoteLines(`— ${inlineText(n.problemName)}, ${dayOf(n.date) ?? NO_DAY}`), "");
    }
  }
  return lines.join("\n");
}

function wireWeek(root, store, week, actions) {
  root.querySelector("#export-week")?.addEventListener("click", () => {
    downloadFile(`week-${week.endISO}.md`, weekToMarkdown(store.state, week), "text/markdown");
    toast("Downloaded.");
  });
  root.querySelectorAll(".card [data-open-problem]").forEach((btn) => {
    btn.addEventListener("click", () => actions.openProblem(btn.dataset.openProblem));
  });
}

// ---------- Are you keeping the plan? ----------
//
// Home counts the last seven days against the week's plan; this lays the last
// few whole weeks side by side, because "7 of 10" cannot tell somebody who does
// 10, 2, 9, 1 that they alternate. It reports and offers. It never scolds: the
// app's stance is that a missed day is not a debt, so a week short of the plan
// is described as exactly that, and the plan is named as the thing to change.

/** How each week's status reads, and which existing pill colour carries it. */
const ADHERENCE_STATUS = {
  "kept": { label: "Kept", cls: "pill-good" },
  "missed": { label: "Short of the plan", cls: "pill-muted" },
  "in-progress": { label: "This week so far", cls: "pill-muted" },
  "not-started": { label: "Before your plan", cls: "pill-muted" },
};

/**
 * What the card says when a saved plan has nothing logged. It reports only what the card can see and why it cannot
 * tell the cause: an empty log is no evidence that the plan is too big (TODO 101), and the person may log elsewhere.
 */
const NOTHING_LOGGED_TEXT = `No coding problems, mocks or design runs are logged here in these weeks, so this card
        cannot tell whether the plan doesn't fit your week or the work isn't being logged here. If it's the plan, you can change it.`;

/** The one link to the week editor, shared by both notes so the path to it cannot drift. */
const ADJUST_PLAN_BUTTON = `<button type="button" class="btn btn-ghost btn-sm" data-testid="adherence-adjust"
          data-tab="settings" data-jump="set-week">Adjust the plan</button>`;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function adherenceRowHtml(w) {
  const status = ADHERENCE_STATUS[w.status];
  const amount = w.planned === 0 ? "A rest week" : `${w.done} of ${w.planned}`;
  return `
    <li class="adherence-week" data-testid="adherence-week" data-status="${w.status}">
      <span>Week of ${esc(fmtDate(w.weekStart))}</span>
      <span class="muted">${w.status === "not-started" ? "" : amount}</span>
      <span class="pill ${status.cls}">${status.label}</span>
    </li>`;
}

/**
 * The card as markup. Pure, so it can be tested as a string.
 *
 * @param {import("./adherence.js").AdherenceSummary} summary
 * @param {boolean} configured whether a week has been set up at all
 */
export function adherenceCardHtml(summary, configured) {
  const title = "<h2>Are you keeping the plan?</h2>";
  if (!configured) {
    return `
      <div class="card" data-testid="adherence-card">
        ${title}
        <p class="muted" data-testid="adherence-setup">This compares each week with the plan you set.
        There is no week set up yet.
        <button type="button" class="link-button" data-tab="settings" data-jump="set-prep">Set it up</button></p>
      </div>`;
  }
  if (summary.judged === 0) {
    return `
      <div class="card" data-testid="adherence-card">
        ${title}
        <p class="muted" data-testid="adherence-empty">Once a whole week has passed, this shows how many
        problems you did against what the plan asked for, week by week. The current week is never
        counted until it is over.</p>
      </div>`;
  }
  const run = summary.run > 1 ? ` That is ${summary.run} kept weeks in a row.` : "";
  return `
    <div class="card" data-testid="adherence-card">
      ${title}
      <p data-testid="adherence-summary">You kept the plan in ${summary.kept} of the last
      ${plural(summary.judged, "full week")}.${run}</p>
      <ul class="adherence-list">${summary.weeks.map(adherenceRowHtml).join("")}</ul>
      ${planLooksTooBig(summary) ? `
        <p data-testid="adherence-too-big">Most of these weeks fell short. The plan may be larger
        than your real week, and if it is, the plan is the thing to change, not you.
        ${ADJUST_PLAN_BUTTON}</p>` : ""}
      ${nothingLoggedNote(summary) ? `
        <p data-testid="adherence-nothing-logged">${NOTHING_LOGGED_TEXT}
        ${ADJUST_PLAN_BUTTON}</p>` : ""}
      <p class="muted small" data-testid="adherence-basis">${usesAssumedPlan(summary)
        ? "Some weeks are measured against your current plan, because the plan that was in force then was not recorded, so changing the plan changes how those weeks look."
        : "Each week is measured against the plan that was in force that week, so changing the plan does not change how earlier weeks look."}
      Coding problems, mocks and design problems logged here count, and a planned two-mediums round counts as ${PAIR_ROUND_SITTINGS}, and design topics you tick on Home count as ticked; drills and clarify prompts do not.
      ${usesLegacyScope(summary) ? "Weeks recorded before this release count coding problems and mocks only." : ""}
      ${usesWeekWithoutTicks(summary) ? "Earlier weeks were written before ticks were tracked, so they leave ticked design topics out." : ""}</p>
    </div>`;
}

/** Sentence for each runway status; the numbers are the card's, the framing is "your plan", never a verdict. */
function runwaySummary(r) {
  if (r.status === "covered") return "Every pattern has been attempted at least once.";
  const pace = !r.perWeek
    ? "Your plan has no coding problems in it"
    : `Your plan asks for ${plural(r.perWeek, "problem")} a week, which is room for ${plural(r.capacity, "problem")} in the ${plural(r.daysLeft, "day")} left`;
  const untried = `Nothing is logged against ${plural(r.untouched.length, "pattern")} yet`;
  const verdict = r.status === "fits"
    ? `so your plan fits, with ${plural(r.spare, "problem")} to spare`
    : `so your plan reaches ${r.capacity} of ${r.needed}`;
  return `${pace}. ${untried}, ${verdict}.`;
}

/**
 * The untouched patterns as links to their topic pages, capped so twelve of them do not fill the card.
 *
 * Each name only emits `data-goto-topic`; chrome.js wires it centrally, so this stays a pure string builder.
 */
function runwayNamesHtml(untouched) {
  // A saved file can hold a pattern with a blank id; no topic page exists for it, so it stays plain text rather than
  // becoming a focusable button that goes nowhere.
  const shown = untouched.slice(0, RUNWAY_NAMES_SHOWN).map((p) => p.id.trim()
    ? `<button type="button" class="link-button" data-testid="runway-pattern-link" data-goto-topic="${esc(p.id)}">${esc(p.name)}</button>`
    : esc(p.name),
  ).join(", ");
  const more = untouched.length - RUNWAY_NAMES_SHOWN;
  return `<p class="muted small" data-testid="runway-names">${shown}${more > 0 ? `, and ${more} more` : ""}</p>`;
}

/**
 * The "Does your runway reach every pattern?" card as markup; empty when there is no run-up to measure. Pure, so it
 * can be tested as a string.
 *
 * @param {import("./runway.js").Runway} runway
 */
export function runwayCardHtml(runway) {
  if (runway.status === "no-date") return "";
  const open = runway.status !== "covered";
  return `
    <div class="card" data-testid="runway-card" data-status="${runway.status}">
      <h2>Does your runway reach every pattern?</h2>
      <p data-testid="runway-summary">${runwaySummary(runway)}</p>
      ${open ? runwayNamesHtml(runway.untouched) : ""}
      ${runway.status === "short" ? `<p><button type="button" class="btn btn-ghost btn-sm" data-testid="runway-adjust"
          data-tab="settings" data-jump="set-week">Adjust the plan</button></p>` : ""}
      ${open ? `<p><button type="button" class="link-button" data-testid="runway-patterns" data-tab="patterns">See the patterns</button></p>` : ""}
      <p class="muted small" data-testid="runway-basis">This counts ${plural(ATTEMPTS_PER_PATTERN, "first attempt")} for each pattern with nothing logged,
      not mastery, and it counts your plan, not what you have done. Coding problems and mocks in the plan count; design
      and drills do not.</p>
    </div>`;
}

/** Whether any week with a verdict rests on the current plan rather than a recorded one. */
function usesAssumedPlan(summary) {
  return summary.weeks.some((w) => (w.status === "kept" || w.status === "missed") && w.planSource !== "recorded");
}

/** Whether any week with a verdict was judged without design, because its plan was recorded before design counted. */
function usesLegacyScope(summary) {
  return summary.weeks.some((w) => (w.status === "kept" || w.status === "missed") && w.scope === "problems");
}

/** Whether any week with a verdict was judged without ticked topics, because its plan was recorded before ticks were tracked. */
function usesWeekWithoutTicks(summary) {
  return summary.weeks.some((w) => (w.status === "kept" || w.status === "missed") && w.scope !== "with-ticks");
}

function wireAdherence(root, actions) {
  root.querySelectorAll("[data-testid='adherence-card'] [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => actions.switchTab(btn.dataset.tab, { jump: btn.dataset.jump || null }));
  });
}

/**
 * The design half's record, on the same page as the coding half's.
 *
 * Here rather than on its own page because the question — am I getting better —
 * is one question about one person, and answering it in two places invites
 * reading one and forgetting the other.
 *
 * Silent when design is off, rather than showing an empty section to somebody
 * who has not turned it on.
 */
function designProgressHtml(state) {
  const attempts = designAttempts(state);
  if (!splitBudget(state).enabled && !attempts.length) return "";

  const stats = componentStats(state).filter((s) => s.seen > 0);
  const reached = new Set(attempts.flatMap((a) => a.covered || [])).size;
  const spots = blindSpots(state);

  if (!attempts.length) {
    return `
      <div class="card">
        <h2>System design</h2>
        ${emptyState("systemDesign", "No design attempts yet",
          "Each attempt records which components you reached for unprompted and which the reference "
          + "used that you did not. That gap is what this section becomes.",
          { tab: "designBank", label: "Pick a problem" })}
      </div>`;
  }

  const weakest = [...stats].sort((a, b) => (a.recallRate ?? 1) - (b.recallRate ?? 1)).slice(0, 5);
  return `
    <div class="card">
      <h2>System design</h2>
      <div class="stat-row">
        <div class="stat"><span class="stat-num">${attempts.length}</span>
          <span class="stat-label">attempts</span></div>
        <div class="stat"><span class="stat-num">${reached}</span>
          <span class="stat-label">components reached for</span></div>
        ${spots.length ? `<div class="stat"><span class="stat-num">${spots.length}</span>
          <span class="stat-label">recurring gaps</span></div>` : ""}
      </div>
      <p class="muted small">Reached for means you produced it cold, before reading the reference —
      the same thing pattern recall measures on the coding half.</p>
      ${weakest.length ? `
        <h3 class="week-heading">Least reliable so far</h3>
        <ul class="week-list">
          ${weakest.map((s) => `<li>
            <button type="button" class="link-button" data-open-component="${esc(s.component.id)}">${esc(s.component.name)}</button>
            <span class="muted small">— ${s.recalled} of ${s.seen}</span>
          </li>`).join("")}
        </ul>` : ""}
    </div>`;
}

function headlineText(summary) {
  const parts = [];
  if (summary.cleanRateDelta != null) {
    const points = Math.round(Math.abs(summary.cleanRateDelta) * 100);
    if (points < 3) parts.push("Your clean-solve rate is holding steady");
    else parts.push(`Your clean-solve rate is ${summary.cleanRateDelta > 0 ? "up" : "down"} about ${points} points`);
  }
  if (summary.insightDelta != null) {
    const mins = Math.abs(summary.insightDelta);
    if (mins >= 1) {
      parts.push(`you're reaching the approach about ${mins.toFixed(0)} minute${mins >= 2 ? "s" : ""} ${summary.insightDelta < 0 ? "faster" : "slower"}`);
    }
  }
  if (!parts.length) return "Steady across the last few weeks — no meaningful movement either way.";
  return `${parts.join(", and ")}, comparing the recent half of this window with the earlier half.`;
}

function spikeNoticeHtml(spike) {
  return `
    <div class="banner banner-warn" style="margin-top:0.75rem">
      <strong>That was a big week.</strong>
      <p class="small" style="margin:0.3rem 0 0">${spike.attempts} attempts against a usual
      ${spike.typical}. Worth noticing rather than repeating — this is the shape that tends to come
      right before a fortnight of nothing. A lighter week next is a good outcome, not lost ground.</p>
    </div>`;
}

function shortWeek(iso) {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * A line chart that draws gaps as gaps.
 *
 * Null values break the line instead of interpolating across them, because
 * joining two points across a blank week would draw a trend through data that
 * doesn't exist.
 */
function lineChart(points, { format, max = null, min = null, lowerIsBetter = false } = {}) {
  const values = points.map((p) => p.value).filter((v) => v != null);
  if (values.length < MIN_POINTS_FOR_CHART) {
    return `<p class="empty">Not enough weeks with data to draw this yet.</p>`;
  }

  const hi = max != null ? max : Math.max(...values) * 1.15;
  const lo = min != null ? min : Math.min(0, Math.min(...values));
  const span = hi - lo || 1;
  const plotW = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;

  const x = (i) => PADDING.left + i * step;
  const y = (v) => PADDING.top + plotH - ((v - lo) / span) * plotH;

  // Contiguous runs, so a missing week breaks the line rather than being
  // silently bridged.
  const runs = [];
  let run = [];
  points.forEach((p, i) => {
    if (p.value == null) { if (run.length) runs.push(run); run = []; return; }
    run.push([x(i), y(p.value)]);
  });
  if (run.length) runs.push(run);

  const paths = runs
    .filter((r) => r.length > 1)
    .map((r) => `<path d="${r.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ")}"
      fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join("");

  const dots = points.map((p, i) => p.value == null ? "" : `
    <circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3"
      fill="var(--accent)"><title>${esc(p.label)}: ${esc(format(p.value))}</title></circle>`).join("");

  const isolated = runs.filter((r) => r.length === 1)
    .map(([[px, py]]) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="var(--accent)"/>`).join("");

  // The first and last labels are anchored inward; centred, they overhang the
  // viewBox and get clipped at both ends.
  const anchorFor = (i) => (i === 0 ? "start" : i === points.length - 1 ? "end" : "middle");
  const labels = points.map((p, i) =>
    (i % 2 === 0 || i === points.length - 1)
      ? `<text x="${x(i).toFixed(1)}" y="${CHART_HEIGHT - 5}" text-anchor="${anchorFor(i)}" class="chart-label">${esc(p.label)}</text>`
      : "").join("");

  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" class="chart" role="img"
           aria-label="${esc(describeSeries(points, format, lowerIsBetter))}">
        <line x1="${PADDING.left}" y1="${PADDING.top + plotH}" x2="${CHART_WIDTH - PADDING.right}" y2="${PADDING.top + plotH}"
              stroke="var(--border)" stroke-width="1"/>
        <text x="${PADDING.left - 6}" y="${PADDING.top + 4}" text-anchor="end" class="chart-label">${esc(format(hi))}</text>
        <text x="${PADDING.left - 6}" y="${PADDING.top + plotH}" text-anchor="end" class="chart-label">${esc(format(lo))}</text>
        ${paths}${isolated}${dots}${labels}
      </svg>
    </div>`;
}

/** A sentence version of the series, so the chart isn't invisible to anyone
 * using a screen reader. */
function describeSeries(points, format, lowerIsBetter) {
  const withValues = points.filter((p) => p.value != null);
  if (withValues.length < 2) return "Not enough data to describe a trend.";
  const first = withValues[0];
  const last = withValues[withValues.length - 1];
  const rose = last.value > first.value;
  const better = lowerIsBetter ? !rose : rose;
  return `From ${format(first.value)} in the week of ${first.label} to ${format(last.value)} in the week of ${last.label} — ${better ? "an improvement" : "a decline"}.`;
}

function volumeChart(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.attempts));
  return `
    <!-- One image with one description, rather than a row of decorative spans
         carrying title attributes that most screen readers ignore outright.
         The bars are a picture of the numbers; the sentence below is the
         numbers, and a reader gets whichever one it can use. -->
    <ul class="volume-bars" role="img" aria-label="${esc(describeVolume(weeks))}">
      ${weeks.map((w) => `
        <li aria-hidden="true">
          <span class="volume-bar" style="--h:${Math.round((w.attempts / max) * 100)}%"
                title="${esc(shortWeek(w.weekStart))}: ${w.attempts} attempt${w.attempts === 1 ? "" : "s"}, ${w.minutes} min"></span>
          <span class="chart-label">${esc(shortWeek(w.weekStart))}</span>
        </li>`).join("")}
    </ul>
    <p class="muted small" style="margin-top:0.4rem">
      ${weeks.reduce((s, w) => s + w.attempts, 0)} attempts across
      ${weeks.filter((w) => w.attempts > 0).length} active week${weeks.filter((w) => w.attempts > 0).length === 1 ? "" : "s"}.</p>`;
}

/** The volume chart as a sentence. Weeks with nothing in them are named as
 * such, because a gap is the part of this chart most worth knowing about. */
function describeVolume(weeks) {
  const active = weeks.filter((w) => w.attempts > 0);
  if (!active.length) return "No practice recorded in this window.";
  const total = weeks.reduce((n, w) => n + w.attempts, 0);
  const busiest = weeks.reduce((a, b) => (b.attempts > a.attempts ? b : a));
  return `${total} attempts across ${active.length} active week${active.length === 1 ? "" : "s"} `
    + `of ${weeks.length}. Busiest was the week of ${shortWeek(busiest.weekStart)} with `
    + `${busiest.attempts}. ${weeks.length - active.length} week${weeks.length - active.length === 1 ? "" : "s"} with none.`;
}

function moversHtml(movers) {
  if (!movers.length) {
    return `
      <div class="card">
        <h2>Pattern movement</h2>
        <p class="muted small">Nothing has enough attempts on both sides of a split yet. A pattern
        needs a few reps before and a few after before "improving" means anything.</p>
      </div>`;
  }
  const improved = movers.filter((m) => m.delta > 0.01).slice(0, 5);
  const slipped = movers.filter((m) => m.delta < -0.01).slice(-5).reverse();
  const row = (m) => `
    <li>
      <span class="row gap-sm" style="align-items:center">
        <span class="pattern-icon">${patternIcon(m.pattern.id, { size: 15 })}</span>
        <span>${esc(m.pattern.name)}</span>
      </span>
      <span class="mover-delta ${m.delta > 0 ? "up" : "down"}">
        ${m.delta > 0 ? "+" : ""}${Math.round(m.delta * 100)} pts
        <span class="muted small">${Math.round(m.before * 100)}% &rarr; ${Math.round(m.after * 100)}%</span>
      </span>
    </li>`;

  return `
    <div class="card">
      <h2>Pattern movement</h2>
      <p class="muted small">Recent attempts against everything before them, for patterns with
      enough reps on both sides to compare.</p>
      <div class="two-col">
        <div>
          <h3 class="small-heading">Coming together</h3>
          ${improved.length ? `<ul class="mover-list">${improved.map(row).join("")}</ul>`
            : `<p class="muted small">Nothing clearly improving yet.</p>`}
        </div>
        <div>
          <h3 class="small-heading">Slipping</h3>
          ${slipped.length ? `<ul class="mover-list">${slipped.map(row).join("")}</ul>`
            : `<p class="muted small">Nothing going backwards — good.</p>`}
        </div>
      </div>
    </div>`;
}


/**
 * An attempt's outcome as plain words ("clean solve"); empty when the stored
 * value is not a string, so one damaged record cannot stop the whole topic page
 * from drawing.
 */
function outcomeWords(outcome) {
  return typeof outcome === "string" ? outcome.replace(/-/g, " ") : "";
}

/**
 * One pattern's own trend, for its topic page.
 *
 * The Progress page answers "am I getting better" across everything, which is
 * the right question there and useless the moment you know *which* pattern is
 * weak: "Sliding Window is at 0% across 3 attempts" is only actionable if you
 * can then see the attempts that made it so.
 *
 * Deliberately the same weeklyProgress/progressSummary as the global charts,
 * narrowed by patternId, so the two can never tell different stories about the
 * same data.
 */
export function patternProgressHtml(state, patternId) {
  const attempts = allAttempts(state, patternId);
  if (attempts.length === 0) {
    return `
      <div class="card">
        <h2>Your history here</h2>
        ${emptyState("progress", "Nothing logged against this pattern yet",
          "One attempt is enough to start a record here — the clean-solve rate and the trend both "
          + "build from the first one.",
          { tab: "bank", label: "Find a problem for this pattern" })}
      </div>`;
  }

  const summary = progressSummary(state, PROGRESS_WEEKS, patternId);
  const clean = attempts.filter(isCleanSolve).length;
  const recalled = attempts.filter((a) => a.patternGuess === "correct").length;

  return `
    <div class="card">
      <h2>Your history here</h2>
      <div class="stat-row" style="margin-bottom:0.75rem">
        <div class="stat"><span class="stat-num">${attempts.length}</span><span class="stat-label">attempts</span></div>
        <div class="stat"><span class="stat-num">${Math.round((clean / attempts.length) * 100)}%</span><span class="stat-label">solved clean</span></div>
        <div class="stat"><span class="stat-num">${Math.round((recalled / attempts.length) * 100)}%</span><span class="stat-label">pattern recalled</span></div>
      </div>
      ${summary.hasEnoughData
        ? lineChart(summary.weeks.map((w) => ({ label: shortWeek(w.weekStart), value: w.cleanRate })),
            { format: (v) => `${Math.round(v * 100)}%`, max: 1, min: 0 })
        : `<p class="muted small">Not enough weeks with data to draw a trend for this pattern yet —
           that needs a couple of weeks with at least two attempts each.</p>`}
      <ul class="attempt-mini-list">
        ${attempts.slice(-6).reverse().map((a) => `
          <li>
            <button type="button" class="link-button" data-open-problem="${esc(a.problemId)}">${esc(a.problemName)}</button>
            <span class="muted small">${esc(fmtDate(a.date))} · ${esc(outcomeWords(a.outcome))}${
              a.patternGuess === "correct" ? "" : " · missed the pattern"}</span>
          </li>`).join("")}
      </ul>
    </div>`;
}
