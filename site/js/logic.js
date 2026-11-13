// Pure functions: spaced repetition, daily budget planning, pattern analytics,
// streaks, system-design unlock. No DOM, no network — easy to reason about and
// easy to extend as the system grows.

/** True for a plain object. Saved state comes from a file a person can edit, so
 *  "has a field" is not enough; null, arrays and primitives all pass `typeof`
 *  or truthiness checks that this rejects. */
export function isRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Reads `map[key]` only when `key` is a string that is an own property of a record `map`, so a stored id such as
 *  "constructor" never resolves to an Object.prototype member. */
export function ownValue(map, key) {
  return isRecord(map) && typeof key === "string" && Object.hasOwn(map, key) ? map[key] : undefined;
}

export function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/**
 * The Monday of the Monday-first week containing an ISO date.
 *
 * Built from local-date fields end to end. Formatting a local-midnight Date
 * with toISOString() converts to UTC, which in any timezone ahead of UTC lands
 * on the previous day and shifts every week bucket by one.
 */
export function mondayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dayFromMonday = (new Date(y, m - 1, d).getDay() + 6) % 7;   // getDay: 0 = Sunday
  return addDaysISO(iso, -dayFromMonday);
}

export function daysBetween(aISO, bISO) {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  const a = new Date(ay, am - 1, ad);
  const b = new Date(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DAY_LENGTH = 10;

/**
 * The calendar day of a stored date, or null if it is not a real one.
 *
 * Logs arrive from imports and older versions, so a date can be empty, a
 * timestamp or not a date at all. Taking the day part keeps a timestamp from
 * today counting as "in the future", and the round trip rejects values such as
 * 2026-13-45 that would otherwise start a plan in a week that never existed.
 */
export function dayOf(value) {
  if (typeof value !== "string") return null;
  const day = value.slice(0, ISO_DAY_LENGTH);
  return ISO_DAY.test(day) && addDaysISO(day, 0) === day ? day : null;
}

/**
 * The day a stored *setting* holds, only if the whole value is a real YYYY-MM-DD day; else null.
 *
 * Unlike a log entry, a saved prep date is only ever written by the date input, so text after
 * the tenth character is damage, not a timestamp to be trimmed. Built on `dayOf` so the
 * definition of a real day exists once.
 */
export function exactDayOf(value) {
  const day = dayOf(value);
  return day !== null && day === value ? day : null;
}

export const MISTAKE_TAGS = [
  "misread-problem",
  "wrong-pattern-id",
  "edge-case-missed",
  "implementation-bug",
  "time-management",
  "forgot-technique",
  "off-by-one",
  "complexity-misjudged",
  "communication",
  "other",
];

/** Counts practice "events" per calendar date across attempts, mocks, and
 * system design sessions — the data a GitHub-style activity heatmap needs. */
export function activityByDate(state) {
  const counts = {};
  // A heatmap key must be a day: a damaged date adds no cell, and a timestamp counts on the day it names.
  const bump = (date) => {
    const day = dayOf(date);
    if (day) counts[day] = (counts[day] || 0) + 1;
  };
  allAttempts(state).forEach((a) => bump(a.date));
  state.mocks.forEach((m) => bump(m.date));
  state.systemDesign.sessions.forEach((s) => bump(s.date));
  return counts;
}

/** Rolling solved-clean rate over a pattern's last N attempts, oldest to
 * newest — what a trend sparkline draws, so a pattern that's recently
 * improving doesn't get buried by a bad all-time average. */

export function patternStats(state) {
  return state.patterns.map((pat) => {
    const attempts = allAttempts(state, pat.id);
    const n = attempts.length;
    const solvedClean = attempts.filter(isCleanSolve).length;
    const guessedCorrect = attempts.filter((a) => a.patternGuess === "correct").length;
    const times = attempts.map((a) => a.timeToInsightMin).filter((t) => typeof t === "number" && !Number.isNaN(t));
    const avgInsight = times.length ? times.reduce((s, t) => s + t, 0) / times.length : null;
    // No prototype: a saved tag named "constructor" or "toString" would otherwise find an inherited member and count as NaN.
    const mistakeFreq = Object.create(null);
    attempts.forEach((a) => (a.mistakeTags || []).forEach((t) => (mistakeFreq[t] = (mistakeFreq[t] || 0) + 1)));
    const topMistake = Object.entries(mistakeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return {
      pattern: pat,
      problemCount: state.problems.filter((p) => p.patternId === pat.id).length,
      attempts: n,
      solvedCleanRate: n ? solvedClean / n : null,
      patternGuessRate: n ? guessedCorrect / n : null,
      avgInsightMin: avgInsight,
      topMistake,
    };
  });
}


// Re-exported from stats.js and state-health.js, where these now live.
export {
  patternTrend,
  PROGRESS_WEEKS, weeklyProgress, patternMovement, progressSummary,
  SCORECARD_MIN, modelScorecard,
  weekInReview, quizConfusions, mockReview,
} from "./stats.js";

// Re-exported from state-health.js, where these now live. Everything already
// imports them from here, and a split that forces every caller to be rewritten
// is a split that gets abandoned halfway.
export {
  SYNC_LIMIT_BYTES, SYNC_WARN_FRACTION, syncFootprint, formatBytes,
  inspectImport, describeState, compareStates,
} from "./state-health.js";

// ---------- Mock interviews ----------
//
// A mock used to be an ordinary session with a pill on it and five prompts
// listed in a box. Nothing about it felt different from practising alone,
// which is the entire point of practising one: the pressure, the clock you
// cannot quietly ignore, and the habit of saying what you are doing before
// you do it.
//
// So a mock now has a shape. The same five things the checklist always asked
// for, but arriving when they would actually matter in a real interview,
// against a clock that runs down rather than up.

/** A standard technical screen. Long enough to be realistic, short enough to
 * be a constraint. */
export const MOCK_MINUTES = 45;

/**
 * The phases of a mock, as fractions of the whole.
 *
 * Fractions rather than fixed minutes so a shorter or longer mock keeps its
 * proportions — the point of "state your approach before coding" is that it
 * comes early, not that it comes at minute five.
 */
export const MOCK_PHASES = [
  { until: 0.12, label: "Clarify",  prompt: "Ask about constraints and edge cases before writing anything." },
  { until: 0.22, label: "Approach", prompt: "Say your approach out loud, and why, before you start typing." },
  { until: 0.75, label: "Code",     prompt: "Keep narrating — say what you're doing and the trade-offs you're making." },
  { until: 0.88, label: "Complexity", prompt: "State the time and space complexity without being asked." },
  { until: 1.00, label: "Test",     prompt: "Walk an example through your code before you call it done." },
];

/**
 * Which phase a mock is in, and how long is left.
 *
 * `overrun` rather than clamping at zero: running over is information, and an
 * interview that quietly stops counting teaches the opposite of the lesson.
 */
export function mockPhase(elapsedMin, totalMin = MOCK_MINUTES) {
  const fraction = totalMin > 0 ? elapsedMin / totalMin : 0;
  const remainingMin = totalMin - elapsedMin;
  const phase = MOCK_PHASES.find((p) => fraction <= p.until) || MOCK_PHASES[MOCK_PHASES.length - 1];
  return {
    index: MOCK_PHASES.indexOf(phase),
    label: phase.label,
    prompt: phase.prompt,
    remainingMin,
    fraction,
    overrun: remainingMin < 0,
    // The last few minutes of an interview feel different from the middle,
    // and the UI should too.
    urgent: remainingMin <= totalMin * 0.15,
  };
}

// Re-exported from rubric.js, which is its own module so the interviewer's
// page can have it without importing the domain layer. Everything already
// imports it from here.
export { MOCK_CHECKLIST } from "./rubric.js";

// How a session ended, in one table.
//
// This used to be five separate lists — two <select>s, a glyph map, a label
// map and a pair of if-chains in the scheduler — which is four chances for a
// new outcome to be half-added.
//
// "Ran out of time" exists because "failed" was doing too much work. Not
// finishing a hard problem you understood is not the same as not getting it,
// and collapsing them made the clean-solve rate say less than it could. It
// steps back one box rather than resetting: you didn't finish, so you lose
// ground, but not all of it.
/**
 * Easiest to hardest, with Unrated placed on purpose.
 *
 * There were two of these. The bank's had no entry for Unrated and fell back
 * to 9, sorting it to the far end; views' put it at 1.5, between Medium and
 * Hard. So the same problem sat in two different places in a list depending on
 * which page was drawing it.
 *
 * 1.5 is the deliberate choice of the two. An unrated problem is usually one
 * you typed in or pasted from Analyze, and burying it at the end of an
 * easiest-first list hides the problems you cared about enough to add by hand.
 */
const DIFFICULTY_ORDER = { Easy: 0, Medium: 1, Unrated: 1.5, Hard: 2 };

export function difficultyRank(difficulty) {
  return DIFFICULTY_ORDER[difficulty] ?? DIFFICULTY_ORDER.Unrated;
}

/** The one outcome that counts as having solved it properly, and the question
 *  asked about it. It was written out as a string literal in fifteen places
 *  across six files — fifteen to find if the value is renamed, or if a second
 *  outcome should ever start counting. */
export const CLEAN_SOLVE = "solved-clean";

export function isCleanSolve(attempt) {
  return attempt?.outcome === CLEAN_SOLVE;
}

export const OUTCOMES = [
  { value: "solved-clean",     label: "Solved clean",      symbol: "✓", cls: "outcome-good", box: "up" },
  { value: "solved-struggled", label: "Solved, struggled", symbol: "~", cls: "outcome-warn", box: "hold" },
  { value: "ran-out-of-time",  label: "Ran out of time",   symbol: "⏱", cls: "outcome-warn", box: "back" },
  { value: "failed",           label: "Didn't solve",      symbol: "✕", cls: "outcome-bad",  box: "reset" },
];

/** The box after an outcome, given where it was. One place, so the scheduler
 * and the replay in recomputeSchedule cannot disagree. */
export function nextBox(box, outcome, intervalCount) {
  const effect = OUTCOMES.find((o) => o.value === outcome)?.box || "hold";
  if (effect === "up") return Math.min(box + 1, intervalCount - 1);
  if (effect === "reset") return 0;
  if (effect === "back") return Math.max(0, box - 1);
  return box;
}

/** Leitner-style box scheduling. Mutates `problem` in place. */
export function applyOutcome(problem, outcome, settings) {
  const intervals = settings.boxIntervalsDays;
  const box = nextBox(problem.box || 0, outcome, intervals.length);
  problem.box = box;
  problem.nextReviewDate = addDaysISO(todayISO(), intervals[box]);
}

/**
 * Rebuild a problem's box and next date by replaying its whole history.
 *
 * applyOutcome advances the box one attempt at a time, which is right while
 * attempts only ever arrive. The moment one can be corrected or removed, an
 * incrementally-built box no longer follows from the record it claims to
 * summarise — delete the failure that reset you to box 0 and the schedule
 * still believes it happened.
 *
 * Replaying is cheap (a handful of attempts) and leaves no way for the two to
 * disagree, so editing routes through here rather than trying to undo a step.
 */
export function recomputeSchedule(problem, settings) {
  const intervals = settings.boxIntervalsDays;
  const history = [...(problem.attempts || [])].sort((a, b) => dateSortKey(a).localeCompare(dateSortKey(b)));

  let box = 0;
  for (const attempt of history) {
    box = nextBox(box, attempt.outcome, intervals.length);
  }
  problem.box = box;

  // Scheduled from the last attempt rather than from today: the interval
  // measures time since you last worked it, and a correction made weeks later
  // must not quietly push the next refresher weeks further out.
  const lastDay = latestDay(history);
  problem.nextReviewDate = lastDay ? addDaysISO(lastDay, intervals[box]) : todayISO();
  return problem;
}

/**
 * Remove one attempt and bring the schedule back in line with what is left.
 *
 * Returns the removed attempt so a caller can offer to put it back.
 */
export function removeAttempt(problem, attemptId, settings) {
  const removed = (problem.attempts || []).find((a) => a.id === attemptId) || null;
  problem.attempts = (problem.attempts || []).filter((a) => a.id !== attemptId);
  recomputeSchedule(problem, settings);
  return removed;
}

/** Fields an edit is allowed to change. Anything else about an attempt is a
 * record of what happened and is not up for revision. */
const EDITABLE_ATTEMPT_FIELDS = ["outcome", "patternGuess", "timeToInsightMin", "timeToSolveMin", "mistakeTags", "soulStatement"];

/** Apply a correction to one attempt, then replay the schedule. */
export function editAttempt(problem, attemptId, changes, settings) {
  const attempt = (problem.attempts || []).find((a) => a.id === attemptId);
  if (!attempt) return null;
  for (const field of EDITABLE_ATTEMPT_FIELDS) {
    if (field in changes) attempt[field] = changes[field];
  }
  recomputeSchedule(problem, settings);
  return attempt;
}

// A saved problem is in one of two states, and the difference is the whole
// reason a large problem bank doesn't wreck the review schedule:
//
//   active   in the spaced-repetition rotation — the schedule tracks how long
//            since you worked it, which is a signal that means something.
//   backlog  collected but not started. Never surfaced as needing anything,
//            never counted against you.
//
// Without this split, saving 300 problems from the bank would surface all 300
// at once, and a week later the plant would read 300 neglected problems and wilt —
// turning a healthy act (stocking up on practice material) into the exact
// burnout signal the plant exists to warn about. A problem becomes active the
// first time you actually work it.
export const STATUS_ACTIVE = "active";
export const STATUS_BACKLOG = "backlog";

/** States written before this field existed hold active problems only. */
export function isBacklog(problem) {
  return problem.status === STATUS_BACKLOG;
}

/**
 * The refresher queue, banded by how long it has been.
 *
 * A fourth band, and the whole reason this function exists: a problem you have
 * never practised is not one you have neglected for a month. The queue banded
 * on `daysSince` alone, which is null when there is no history, and null fell
 * into the oldest bucket — so a brand-new account opened on "23, a month or
 * more". That is the deadline framing this app specifically removed, surviving
 * in the one view named after removing it.
 *
 * `fresh` leads rather than trailing, because on a new account it is the whole
 * list and it is where you start.
 */
export const REFRESHER_BANDS = [
  { key: "fresh", label: "not practiced yet", color: "var(--accent)" },
  { key: "recent", label: "from the last fortnight", color: "var(--good)" },
  { key: "aWhile", label: "it's been a few weeks", color: "var(--warn)" },
  { key: "longest", label: "a month or more", color: "var(--bad)" },
];
const A_FEW_WEEKS = 14;
const A_MONTH = 30;

export function refresherBands(problems, today = todayISO()) {
  const counts = Object.fromEntries(REFRESHER_BANDS.map((b) => [b.key, 0]));
  for (const p of problems) {
    counts[bandOf(p, today)] += 1;
  }
  return REFRESHER_BANDS.map((b) => ({ ...b, count: counts[b.key] }));
}

/** Which band one problem sits in. Exported so the queue can order by it. */
export function bandOf(problem, today = todayISO()) {
  const { daysSince } = refresherStatus(problem, today);
  if (daysSince == null) return "fresh";
  if (daysSince >= A_MONTH) return "longest";
  if (daysSince >= A_FEW_WEEKS) return "aWhile";
  return "recent";
}

export function dueProblems(state) {
  const today = todayISO();
  return state.problems
    .filter((p) => !isBacklog(p))
    .filter((p) => !p.nextReviewDate || p.nextReviewDate <= today)
    .sort((a, b) => a.box - b.box || (a.nextReviewDate || "").localeCompare(b.nextReviewDate || ""));
}

export function backlogProblems(state, patternId = null) {
  return state.problems
    .filter(isBacklog)
    .filter((p) => !patternId || p.patternId === patternId);
}

/** Moves a bank problem into the rotation. Called when a session is saved
 * against it, so working a problem is what schedules it. */
export function activateProblem(problem) {
  if (!isBacklog(problem)) return;
  problem.status = STATUS_ACTIVE;
  if (!problem.nextReviewDate) problem.nextReviewDate = todayISO();
}

// A problem statement is the user's own pasted copy, kept in their private
// repo. The app ships no statement text of its own: the catalog carries titles,
// difficulties and pattern labels, which are facts about a problem, not the
// problem's prose.
//
// The cap exists because the whole state is one JSON file synced through the
// GitHub Contents API, which refuses anything over 1 MB. A statement runs
// 1-3 KB, so a few hundred of them is a real fraction of that budget; 12 KB is
// far more than any single statement needs and still bounds the worst case.
export const MAX_STATEMENT_CHARS = 12000;

/**
 * Prepare a pasted statement for storage.
 *
 * Reports truncation rather than silently cutting the text, so the UI can say
 * so — finding out that the bottom of a problem is missing halfway through
 * solving it would be worse than being told up front.
 */
export function normalizeStatement(text) {
  const trimmed = String(text ?? "").replace(/\r\n/g, "\n").trim();
  return {
    text: trimmed.slice(0, MAX_STATEMENT_CHARS),
    truncated: trimmed.length > MAX_STATEMENT_CHARS,
  };
}

/** Greedily fills today's budget with the weakest patterns and the problems
 * left longest first, so a 75-minute day never silently drops what matters
 * most. Whatever doesn't fit simply waits — see the refresher block above for
 * why nothing here is framed as late. */
export function planToday(state) {
  const due = dueProblems(state);
  const budget = state.settings.dailyBudgetMin;
  const est = state.settings.estimateMinByDifficulty;
  let used = 0;
  const plan = [];
  const overflow = [];
  for (const p of due) {
    const cost = est[p.difficulty] ?? est.Unrated ?? 30;
    if (plan.length === 0 || used + cost <= budget) {
      plan.push(p);
      used += cost;
    } else {
      overflow.push(p);
    }
  }
  return { plan, overflow, usedMin: used, budgetMin: budget };
}

/**
 * What an attempt sorts by: its date when that is text, else "".
 *
 * A damaged attempt has to sort somewhere rather than throw, and it stays in the list so counts do not move. It
 * is not `dayOf`: that would tie two timestamps on one day and change their order.
 */
export function dateSortKey(attempt) {
  return typeof attempt?.date === "string" ? attempt.date : "";
}

/**
 * The greatest real day among attempts, or null when none has one; a damaged date is skipped, not an error.
 *
 * The greatest rather than the last in list order: a problem's own attempts are in insertion order, so an
 * attempt added late with an earlier date must not become "last practiced". ISO days compare as text.
 */
export function latestDay(attempts) {
  return attempts.reduce((latest, a) => {
    const day = dayOf(a.date);
    return day !== null && (latest === null || day > latest) ? day : latest;
  }, null);
}

/**
 * The attempt with the greatest real day; on a tie the later one in list order. An attempt with no real day is
 * chosen only when none has one, so a damaged date never beats a real one and the list is never empty-handed.
 */
function latestByDay(attempts) {
  return attempts.reduce((latest, a) => {
    const day = dayOf(a.date);
    if (day === null) return latest;
    const latestDayOf = dayOf(latest.date);
    return latestDayOf === null || day >= latestDayOf ? a : latest;
  }, attempts[0]);
}

export function allAttempts(state, patternId) {
  const problems = patternId ? state.problems.filter((p) => p.patternId === patternId) : state.problems;
  const out = [];
  for (const p of problems) {
    for (const a of p.attempts) {
      out.push({ ...a, problemId: p.id, problemName: p.name, patternId: p.patternId });
    }
  }
  return out.sort((x, y) => dateSortKey(x).localeCompare(dateSortKey(y)));
}


// One missed day per week is forgiven. The rest of this app spends its effort
// telling people to stop at their budget, that a lighter week is a good
// outcome, and that a volume spike is the shape that precedes quitting — and
// then reset a forty-day streak to 1 for taking a single Sunday off. That is
// the loudest number on the dashboard contradicting everything around it.
//
// One per rolling week, not unlimited: a streak that survives any gap is not
// measuring anything. And a used grace day is shown as a grace day rather
// than backfilled as practice, because the streak has to stay something the
// record can support.
export const STREAK_GRACE_DAYS_PER_WEEK = 1;
const GRACE_WINDOW_DAYS = 7;

/** Grace days spent in the week ending `today`. */
function recentGraceUsed(streak, today) {
  return (streak.graceDays || []).filter((d) => daysBetween(d, today) < GRACE_WINDOW_DAYS).length;
}

export function updateStreak(state) {
  const today = todayISO();
  const streak = state.streak;
  if (!Array.isArray(streak.graceDays)) streak.graceDays = [];
  if (streak.lastActiveDate === today) return;

  const gap = streak.lastActiveDate ? daysBetween(streak.lastActiveDate, today) : null;

  // Keep only the grace days still inside the window, so the allowance
  // genuinely renews rather than accumulating a record of every one ever used.
  streak.graceDays = streak.graceDays.filter((d) => daysBetween(d, today) < GRACE_WINDOW_DAYS);

  if (gap === 1) {
    streak.current += 1;
  } else if (gap === 2 && recentGraceUsed(streak, today) < STREAK_GRACE_DAYS_PER_WEEK) {
    // Exactly one day missed, and an allowance left to cover it. The missed
    // day is recorded, not the practice.
    streak.graceDays.push(addDaysISO(streak.lastActiveDate, 1));
    streak.current += 1;
  } else {
    streak.current = 1;
    streak.graceDays = [];
  }
  streak.longest = Math.max(streak.longest || 0, streak.current);
  streak.lastActiveDate = today;
}

/** Whether a grace day is currently holding the streak together, for the UI
 * to say so honestly rather than implying an unbroken run. */
export function streakGraceInfo(state, today = todayISO()) {
  const streak = state.streak || {};
  const used = (streak.graceDays || []).filter((d) => daysBetween(d, today) < GRACE_WINDOW_DAYS);
  return {
    used: used.length,
    allowance: STREAK_GRACE_DAYS_PER_WEEK,
    remaining: Math.max(0, STREAK_GRACE_DAYS_PER_WEEK - used.length),
    dates: used,
  };
}

export function systemDesignUnlock(state) {
  const { minMocks, minSolvedCleanRate } = state.settings.systemDesignUnlockThreshold;
  const recent = state.mocks.slice(-10);
  const rate = recent.length ? recent.filter(isCleanSolve).length / recent.length : 0;
  const meetsAuto = state.mocks.length >= minMocks && rate >= minSolvedCleanRate;
  return {
    unlocked: state.systemDesign.manualUnlock || meetsAuto,
    manualUnlock: state.systemDesign.manualUnlock,
    mocksLogged: state.mocks.length,
    minMocks,
    recentSolvedCleanRate: rate,
    minSolvedCleanRate,
  };
}

/**
 * The most recent attempt on a problem that recorded code, or null.
 *
 * Used by the workspace to offer your last solution *after* you've had your
 * own attempt. Spaced repetition on something you solved a month ago is
 * exactly when seeing what you did last time is worth the most — and exactly
 * when showing it up front would destroy the rep.
 */
export function lastAttemptWithCode(problem) {
  const withCode = (problem?.attempts || []).filter((a) => a.code && a.code.trim());
  if (!withCode.length) return null;
  return latestByDay(withCode);
}

/**
 * What you did last time on this problem — the part that is safe to show.
 *
 * Reopening a problem you failed last week gave you the statement and an empty
 * editor. Your old code was already here behind a `<details>`, deliberately
 * shut, because handing you your own solution before you have tried is the one
 * thing this app exists to prevent.
 *
 * The same reasoning splits the rest in two, and the split is the whole point
 * of this function. What you *scored* — the outcome, how long it took, which
 * mistakes you tagged — tells you what to watch for without telling you the
 * approach, so it leads. "Last time: off by one, edge case missed" is a warning.
 * Your soul statement is not: "the window only shrinks from the left" is the
 * answer written down, so it stays behind the same closed door as the code.
 *
 * Returns null when there is no previous attempt, so a first rep shows nothing
 * rather than an empty frame.
 */
export function priorAttemptSummary(problem) {
  const attempts = problem?.attempts || [];
  if (!attempts.length) return null;
  const last = latestByDay(attempts);
  return {
    // Null, not the raw text, when the attempt has no real day, so the view prints a dash.
    date: dayOf(last.date),
    attemptNumber: attempts.length,
    outcome: last.outcome,
    timeToInsightMin: typeof last.timeToInsightMin === "number" ? last.timeToInsightMin : null,
    timeToSolveMin: typeof last.timeToSolveMin === "number" && last.timeToSolveMin > 0
      ? last.timeToSolveMin : null,
    mistakeTags: Array.isArray(last.mistakeTags) ? last.mistakeTags : [],
    recalledPattern: last.patternGuess === "correct",
    // Behind the same door as the code, and named here only so the view knows
    // whether the door is worth showing.
    note: last.soulStatement || "",
    hasCode: !!(last.code && last.code.trim()),
  };
}

// ---------- Box intervals ----------
//
// boxIntervalsDays decides when each box comes back round, and was honoured
// everywhere while being changeable only by hand-editing JSON. It is the one
// number that defines what this app *is*, so it should be adjustable — and
// guarded, because a bad table is not a bad setting, it is a schedule that
// stops working.

export const MIN_BOX_INTERVALS = 3;
export const MAX_BOX_INTERVALS = 8;
export const MAX_BOX_INTERVAL_DAYS = 365;

/**
 * Check a proposed interval table.
 *
 * Must be non-decreasing: the whole premise is that each box waits longer than
 * the last, and a table that dips would send a problem you just solved cleanly
 * back sooner than one you struggled with.
 */
export function validateBoxIntervals(values) {
  const errors = [];
  if (!Array.isArray(values) || values.length < MIN_BOX_INTERVALS) {
    return { ok: false, errors: [`Needs at least ${MIN_BOX_INTERVALS} boxes.`], values: [] };
  }
  if (values.length > MAX_BOX_INTERVALS) {
    errors.push(`More than ${MAX_BOX_INTERVALS} boxes is more schedule than anyone needs.`);
  }
  if (values.some((n) => !Number.isInteger(n) || n < 0)) {
    errors.push("Every interval must be a whole number of days, zero or more.");
  }
  if (values.some((n) => n > MAX_BOX_INTERVAL_DAYS)) {
    errors.push(`Nothing should wait longer than ${MAX_BOX_INTERVAL_DAYS} days.`);
  }
  if (values[0] !== 0) {
    errors.push("The first box must be 0 days — a problem you just failed comes back today.");
  }
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) {
      errors.push("Each box must wait at least as long as the one before it.");
      break;
    }
  }
  return { ok: errors.length === 0, errors, values };
}

/** Parse a comma-separated interval list from a text field. */
export function parseBoxIntervals(text) {
  return String(text ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => (/^\d+$/.test(part) ? Number(part) : NaN));
}

// ---------- Refreshers, not deadlines ----------
//
// The scheduling underneath is unchanged — Leitner boxes still decide when
// recall is likely to be fading, and that's a real signal worth acting on.
// What changed is what gets said about it.
//
// This used to be presented as a deadline: "due today", "12d overdue", a red
// band labelled "slipping". Nobody is owed this work, and a problem you set
// down three weeks ago isn't a missed obligation — it's just a thing you
// haven't looked at in three weeks. Deadline language turns an ordinary gap
// into a debt, and a growing pile of debts is the thing people quit over.
//
// So the number on screen is now how long since you last practiced it, which
// is a fact about what you did rather than a judgment about what you owe, and
// the suggestion is a refresher rather than a reckoning.

/** The day a problem was last actually worked, or null if it never has been (an unreadable date is not a day). */
export function lastPracticedISO(problem) {
  return latestDay(problem.attempts ?? []);
}

/** Past roughly a week beyond its interval, recall has usually drifted far
 * enough to be worth saying something about. */
export const FADING_DAYS = 7;

/**
 * What to say about a problem's recency.
 *
 * `tone` still comes from the schedule, because the schedule is what knows
 * when recall fades — it just drives emphasis now rather than a scolding.
 */
export function refresherStatus(problem, today = todayISO()) {
  const last = lastPracticedISO(problem);
  const daysSince = last ? daysBetween(last, today) : null;
  const pastInterval = problem.nextReviewDate ? daysBetween(problem.nextReviewDate, today) : 0;

  let tone = "fresh";
  if (!last) tone = "new";
  else if (pastInterval >= FADING_DAYS) tone = "fading";
  else if (pastInterval >= 0) tone = "ready";

  return { last, daysSince, pastInterval, tone, text: recencyText(daysSince) };
}

/**
 * A gap in words.
 *
 * Coarser as it grows, because the difference between 38 and 41 days isn't
 * information — and an exact day count that far back reads as a tally being
 * kept against you.
 */
export function recencyText(days) {
  if (days == null) return "not practiced yet";
  if (days === 0) return "practiced today";
  if (days === 1) return "practiced yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${weeks} weeks ago`;
  }
  // The weeks branch runs to 59 days, so this is only ever reached at two
  // months or more — no need to special-case a singular "1 month".
  return `${Math.round(days / 30)} months ago`;
}

// ---------- The daily budget, as a live clock ----------
//
// The budget was only ever used two ways: planToday() stops filling the day's
// plan once it's spent, and computePlantState() docks health after the fact if
// a day ran past 1.5x it. Both look at attempts already logged, so the number
// only meant anything in hindsight — you found out you'd overdone it the next
// time you opened the app.
//
// This makes it a clock you can watch while you work. It is deliberately a
// separate thing from the session timer in the workspace: that one measures
// one problem for the record, this one measures the day against the ceiling
// you set for yourself, and it keeps running between problems.

/** A day's timer, fresh. Kept per-day so yesterday's total never leaks into
 * today — the date is stored alongside rather than the timer being cleared by
 * something that has to remember to run at midnight. */
export function newDayTimer(dateISO = todayISO()) {
  // `adjustmentMs` is kept apart from `accumulatedMs` on purpose. The clock's
  // own reading stays exactly what it measured, and a correction stays
  // visible as a correction — a single merged number would quietly become the
  // thing you remember editing and stop being either.
  return { date: dateISO, running: false, startedAt: null, accumulatedMs: 0, adjustmentMs: 0 };
}

/**
 * Milliseconds on the clock today, including the stretch currently running.
 *
 * `now` is a parameter rather than read from the clock so this can be tested
 * and so a render can pass a single consistent instant to everything it draws.
 */
export function dayTimerElapsedMs(state, now = Date.now()) {
  const timer = state.dayTimer;
  if (!timer || timer.date !== todayISO()) return 0;
  // `!= null` rather than a truthiness check: a startedAt of 0 is a real
  // instant, and treating it as "never started" silently reports an empty day.
  const open = timer.running && timer.startedAt != null ? Math.max(0, now - timer.startedAt) : 0;
  // Never negative: a correction larger than the clock means "none of this
  // was practice", which is zero, not a debt carried into tomorrow.
  return Math.max(0, timer.accumulatedMs + open + (timer.adjustmentMs || 0));
}

/** Start today's clock. Rolls over to a new day's timer if the stored one is
 * stale, so the first start after midnight begins at zero. */
export function startDayTimer(state, now = Date.now()) {
  const today = todayISO();
  if (!state.dayTimer || state.dayTimer.date !== today) state.dayTimer = newDayTimer(today);
  if (state.dayTimer.running) return;
  state.dayTimer.running = true;
  state.dayTimer.startedAt = now;
}

/** Whether today's clock is running now. A clock left running overnight is
 *  yesterday's, and does not count. */
export function dayTimerRunning(state) {
  return !!(state.dayTimer?.running && state.dayTimer.date === todayISO());
}

/**
 * Start today's clock for a session, and say whether this call is what started
 * it.
 *
 * A session is study time by definition, so it runs the clock. Before this,
 * the day's time moved only if you remembered to start the clock yourself;
 * otherwise nothing happened for forty minutes and then the whole session
 * landed at once when it was saved. The answer matters for the end: a clock
 * the session started stops with it, and one you started yourself is yours,
 * and keeps running.
 */
export function claimDayTimer(state, now = Date.now()) {
  if (dayTimerRunning(state)) return false;
  startDayTimer(state, now);
  return true;
}

/** Stop the clock, banking the stretch that was running. */
export function stopDayTimer(state, now = Date.now()) {
  const timer = state.dayTimer;
  if (!timer || !timer.running) return;
  timer.accumulatedMs += timer.startedAt != null ? Math.max(0, now - timer.startedAt) : 0;
  timer.running = false;
  timer.startedAt = null;
}

export function resetDayTimer(state) {
  state.dayTimer = newDayTimer();
}

/**
 * Add or subtract minutes from today's clock.
 *
 * The clock is the input to the budget ring and to the plant's health, and it
 * could not be corrected: leave it running over lunch and the day was spent,
 * with no way to say otherwise. A number you cannot correct is a number you
 * stop trusting, and then stop looking at — which would cost more than the
 * wrong forty minutes did.
 *
 * Returns the correction actually applied, which is not always the one asked
 * for: subtracting an hour from a twenty-minute day removes twenty minutes,
 * because the rest never happened.
 */
export function adjustDayTimer(state, deltaMin, now = Date.now()) {
  const today = todayISO();
  if (!state.dayTimer || state.dayTimer.date !== today) state.dayTimer = newDayTimer(today);
  const timer = state.dayTimer;

  const before = dayTimerElapsedMs(state, now);
  const wanted = Math.round(deltaMin * 60000);
  // Clamped against the total, not against the adjustment, so two successive
  // corrections can't drive the reported time below zero between them.
  const applied = Math.max(wanted, -before);
  timer.adjustmentMs = (timer.adjustmentMs || 0) + applied;
  // `|| 0` normalises -0, which is what Math.max produces when it clamps a
  // subtraction to nothing, and which would render as "-0 min".
  return applied / 60000 || 0;
}

/** The running correction on today's clock, in minutes. Zero when untouched. */
export function dayTimerAdjustmentMin(state) {
  const timer = state.dayTimer;
  if (!timer || timer.date !== todayISO()) return 0;
  return (timer.adjustmentMs || 0) / 60000;
}

/** Past this multiple of the budget the day counts as a real overrun — the
 * same threshold computePlantState() already uses to dock health, kept in one
 * place so the live warning and the recorded penalty can't disagree. */
export const OVERRUN_MULTIPLE = 1.5;

/**
 * Where today stands against the budget.
 *
 * `usedMin` is the day clock plus any attempt the clock did *not* already
 * count. The original version added the two outright, on the reasoning that a
 * day where you logged two problems and then ran the clock for twenty minutes
 * has used both — which is true, and which quietly assumed the two are never
 * the same minutes.
 *
 * They are the same minutes whenever the clock is running during a session you
 * then save, which is the ordinary way to use this app. Saving a 45-minute
 * problem turned "30 minutes left" into "15 minutes over" without a second of
 * work happening in between.
 *
 * So a session saved while the clock was running is marked, and its minutes are
 * left to the clock. A rep logged manually for something you did on paper is
 * not marked, and still counts — it was never on the clock.
 *
 * Attempts recorded before this fix carry no mark at all, and there is no way
 * to know after the fact whether the clock was running through them. When the
 * clock has run today they are assumed to have been on it — which is what an
 * unmarked attempt dated today overwhelmingly is, since the session workspace
 * was the only thing creating them. Without that assumption the day this
 * shipped stays wrong until midnight for anyone who had already practised.
 *
 * It only ever applies to that data: a manually logged rep now records
 * `onClock: false` outright and keeps counting, and every new session records
 * a real boolean.
 *
 * Where the clock covered only part of a session this slightly under-counts.
 * That is the right direction to be wrong in: the budget is a ceiling, and
 * over-reporting tells you to stop when you have not yet started.
 */
/** Below this the day clock has not meaningfully run, and an unmarked attempt
 *  cannot have been covered by it. A bare `> 0` made a clock started two
 *  milliseconds ago swallow a 45-minute rep. */
const CLOCK_RAN_MIN = 1;

export function budgetProgress(state, now = Date.now()) {
  const budgetMin = state.settings.dailyBudgetMin || 75;
  const today = todayISO();
  const clockMin = dayTimerElapsedMs(state, now) / 60000;
  const clockRan = clockMin >= CLOCK_RAN_MIN;
  const coveredByClock = (a) => (a.onClock === undefined ? clockRan : a.onClock === true);
  const loggedMin = allAttempts(state)
    .filter((a) => a.date === today && !coveredByClock(a))
    .reduce((sum, a) => sum + (a.timeToSolveMin || 0), 0);
  const usedMin = loggedMin + clockMin;
  return {
    budgetMin,
    usedMin,
    loggedMin,
    clockMin,
    remainingMin: Math.max(0, budgetMin - usedMin),
    overMin: Math.max(0, usedMin - budgetMin),
    fraction: budgetMin > 0 ? usedMin / budgetMin : 0,
    over: usedMin > budgetMin,
    overrun: usedMin > budgetMin * OVERRUN_MULTIPLE,
    running: dayTimerRunning(state),
  };
}

/**
 * How the plant should respond to today's clock, from -1 to +1.
 *
 * Positive as the day fills toward the budget and the plant grows into it;
 * back through zero once the budget is spent, and negative from there as it
 * shrinks. It reaches its full negative at twice the budget.
 *
 * This drives the *drawing* only, never the stored health. The plant's two
 * axes mean something — stage is cumulative and never regresses, health reads
 * the last fortnight — and a number that swung with a clock running right now
 * would belong to neither. What the user sees while they work is a preview of
 * the consequence; the consequence itself is still recorded from the attempts
 * they actually log.
 */
export function budgetPressure(state, now = Date.now()) {
  const { fraction } = budgetProgress(state, now);
  if (fraction <= 1) return fraction;           // growing into the day's target
  return Math.max(-1, 1 - (fraction - 1) * 2);  // and shrinking back past it
}

export const PLANT_STAGES = [
  { min: 0, key: "seed", label: "Seed" },
  { min: 3, key: "sprout", label: "Sprout" },
  { min: 7, key: "seedling", label: "Seedling" },
  { min: 14, key: "young", label: "Young Plant" },
  { min: 30, key: "budding", label: "Budding" },
  { min: 60, key: "flowering", label: "Flowering" },
  { min: 120, key: "tree", label: "Mature Tree" },
];

const HEALTH_WINDOW_DAYS = 14;

/** The plant is two separate axes on purpose, matching how real growth
 * actually works: `stage` is cumulative and never regresses (total distinct
 * days you've ever practiced — one bad week doesn't shrink a tree back to a
 * seed), while `health` is a volatile 0-100 read on the last two weeks of
 * behavior (can rise and fall) — pure signals, grounded in the learning
 * principles that were actually asked for: spacing/consistency, active
 * recall accuracy, not letting reviews go stale, and not cramming past the
 * point of diminishing returns in one sitting. */
export function computePlantState(state) {
  const today = todayISO();
  const activity = activityByDate(state);
  const totalDaysPracticed = Object.keys(activity).length;

  let stage = PLANT_STAGES[0];
  for (const s of PLANT_STAGES) if (totalDaysPracticed >= s.min) stage = s;
  const nextStage = PLANT_STAGES[PLANT_STAGES.indexOf(stage) + 1] || null;

  let activeDaysInWindow = 0;
  for (let i = 0; i < HEALTH_WINDOW_DAYS; i++) {
    if (activity[addDaysISO(today, -i)]) activeDaysInWindow++;
  }

  const dates = Object.keys(activity).sort();
  const lastActive = dates[dates.length - 1] || null;
  const daysSinceActive = lastActive ? daysBetween(lastActive, today) : 999;

  const recentQuiz = state.quiz.recent.slice(-10);
  const recallRate = recentQuiz.length >= 3 ? recentQuiz.filter((q) => q.correct).length / recentQuiz.length : null;

  // Backlog problems are excluded deliberately: an unstarted problem sitting
  // in the bank is not a neglected review, and counting it as one would punish
  // the user for collecting practice material.
  const overdueCount = state.problems.filter(
    (p) => !isBacklog(p) && p.nextReviewDate && daysBetween(p.nextReviewDate, today) > 7).length;

  const todaysAttempts = allAttempts(state).filter((a) => a.date === today);
  const todaysMin = todaysAttempts.reduce((sum, a) => sum + (a.timeToSolveMin || 0), 0);
  const budget = state.settings.dailyBudgetMin || 75;
  const overloaded = todaysMin > budget * 1.5 || todaysAttempts.length > 5;

  // Nothing practiced yet means there is nothing to judge. Without this, a new
  // account scored 0 and rendered as wilting before anyone had done a
  // single rep: never active (-25), no consistency (-15), and every seeded
  // problem counted as a neglected review (-20). Opening the app for the first
  // time and being shown a dying plant is the exact discouragement the plant
  // exists to prevent, and it is the same reproach in pictures that the
  // refresher wording removed from the text.
  if (totalDaysPracticed === 0) {
    return {
      stage: stage.key,
      stageLabel: stage.label,
      totalDaysPracticed: 0,
      nextStageLabel: nextStage?.label || null,
      daysToNextStage: nextStage ? nextStage.min : 0,
      health: 50,
      vitality: "steady",
      contributions: [],
      signals: { activeDaysInWindow: 0, windowDays: HEALTH_WINDOW_DAYS, daysSinceActive: null,
        recallRate: null, overdueCount: 0, overloaded: false, todaysMin: 0, budget: state.settings.dailyBudgetMin || 75 },
    };
  }

  // Built as a list of contributions rather than a running total, so the UI
  // can show what actually moved the verdict instead of asserting one. The
  // plant is this app's headline judgment and was its least explained thing:
  // it said "stressed" and left you to guess which of six inputs did it.
  //
  // Faithful by construction, the same principle as the pattern model's
  // explanations — these ARE the arithmetic, summed below, not a story told
  // about a number computed elsewhere.
  const contributions = [];
  const add = (label, delta) => { if (delta) contributions.push({ label, delta: Math.round(delta) }); };

  add(`Practised ${activeDaysInWindow} of the last ${HEALTH_WINDOW_DAYS} days`,
    Math.round((activeDaysInWindow / HEALTH_WINDOW_DAYS) * 30) - 15);
  add(`${state.streak.current}-day streak`, Math.min(15, state.streak.current * 1.5));
  if (daysSinceActive >= 7) add(`${daysSinceActive} days since you last practised`, -25);
  else if (daysSinceActive >= 3) add(`${daysSinceActive} days since you last practised`, -10);
  if (recallRate != null) {
    add(`Recognising the pattern ${Math.round(recallRate * 100)}% of the time`,
      Math.round(recallRate * 20) - 10);
  }
  add(`${overdueCount} problem${overdueCount === 1 ? "" : "s"} left a long time`,
    -Math.min(20, overdueCount * 3));
  if (overloaded) add("Today's volume is past a healthy single sitting", -15);

  const BASE_HEALTH = 50;
  let health = contributions.reduce((n, c) => n + c.delta, BASE_HEALTH);
  health = Math.max(0, Math.min(100, Math.round(health)));

  let vitality = "thriving";
  if (health < 30) vitality = "wilting";
  else if (health < 55) vitality = "stressed";
  else if (health < 80) vitality = "steady";

  return {
    stage: stage.key,
    stageLabel: stage.label,
    totalDaysPracticed,
    nextStageLabel: nextStage?.label || null,
    daysToNextStage: nextStage ? Math.max(0, nextStage.min - totalDaysPracticed) : 0,
    health,
    vitality,
    // Largest effect first: the question is "what is doing this", and the
    // answer is the top of this list.
    contributions: contributions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    signals: { activeDaysInWindow, windowDays: HEALTH_WINDOW_DAYS, daysSinceActive, recallRate, overdueCount, overloaded, todaysMin, budget },
  };
}

export function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


/**
 * Score a problem's worth as a recall question. Higher is more worth asking.
 *
 * The quiz used to pick uniformly at random from everything ever attempted,
 * while sitting inside an app built entirely on a spacing algorithm — the one
 * page purely about recall was the one not using it.
 *
 * Three signals, in the order they matter:
 *   fading   how far past its interval the problem is, which is the schedule's
 *            own estimate of what you are closest to forgetting.
 *   missed   whether you got this pattern wrong last time. A pattern you
 *            misidentified is worth asking again long before one you nailed.
 *   rested   how long since it was last asked *here*, so a short session
 *            doesn't circle the same three problems.
 *
 * Exported for testing: weighting is the whole feature, and a weighting nobody
 * can inspect is indistinguishable from the random pick it replaced.
 */
export function quizPriority(problem, today = todayISO()) {
  if (!problem.attempts?.length) return 0;

  const pastInterval = problem.nextReviewDate ? daysBetween(problem.nextReviewDate, today) : 0;
  const fading = Math.max(0, pastInterval);

  const last = problem.attempts[problem.attempts.length - 1];
  const missed = last.patternGuess === "incorrect" ? 12 : 0;

  const lastPractised = lastPracticedISO(problem);
  const rested = lastPractised ? Math.min(30, Math.max(0, daysBetween(lastPractised, today))) : 30;

  // A floor of 1 so nothing is ever unreachable: a problem you are on top of
  // should be rare, not impossible, or the quiz stops being a quiz.
  return 1 + fading + missed + rested * 0.5;
}

/**
 * Choose the next quiz problem, weighted rather than uniform.
 *
 * Weighted sampling, not "take the highest": always asking the single most
 * overdue problem would make the quiz a queue with extra steps, and the point
 * of it is that the next question is not predictable.
 */
export function pickQuizProblem(state, excludeIds = [], pick = Math.random) {
  const candidates = state.problems.filter((p) => p.attempts.length > 0);
  if (candidates.length === 0) return null;
  const fresh = candidates.filter((p) => !excludeIds.includes(p.id));
  // Falling back to the full set once everything has been asked is deliberate
  // — the alternative is the quiz ending, which is not what anyone wants from
  // a drill.
  const pool = fresh.length ? fresh : candidates;

  const today = todayISO();
  const weights = pool.map((p) => quizPriority(p, today));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[Math.floor(pick() * pool.length)];

  let target = pick() * total;
  for (let i = 0; i < pool.length; i++) {
    target -= weights[i];
    if (target <= 0) return pool[i];
  }
  return pool[pool.length - 1];   // floating-point slack
}

/** Builds a shuffled multiple-choice option list for the quiz: the correct
 * pattern plus up to count-1 random distractors from the other patterns. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function quizOptions(state, correctPatternId, count = 4) {
  const others = shuffle(state.patterns.filter((p) => p.id !== correctPatternId).map((p) => p.id));
  return shuffle([correctPatternId, ...others.slice(0, count - 1)]);
}

const STALE_DAYS = 21;
const WEAK_CLEAN_RATE = 0.6;
const WEAK_MIN_ATTEMPTS = 2;

// How many attempts in a row have to go badly before the app says something.
//
// Three, not two. Two bad attempts on a hard problem is normal and being told
// to stop after them would be wrong and irritating. Three in a row on the same
// problem is a pattern, and the schedule's own answer to it — reset to box 0,
// so it comes back tomorrow — is the grinding this app's source comments say
// it exists to prevent, prescribed by the app itself.
export const STUCK_ATTEMPTS = 3;

/** Outcomes that mean the attempt did not get there. "Solved, struggled" is
 *  not one of them: struggling through it is the thing working. */
const STUCK_OUTCOMES = new Set(["failed", "ran-out-of-time"]);

/**
 * Problems whose last few attempts all went badly, worst first.
 *
 * Deliberately about a *problem*, where the existing deep-dive is about a
 * pattern. They are different failures with different answers: a weak pattern
 * means you have not learned the technique, and a stuck problem often means
 * you have, and this particular one is not the way to practise it today.
 */
export function stuckProblems(state, run = STUCK_ATTEMPTS) {
  const out = [];
  for (const problem of state.problems || []) {
    const attempts = (problem.attempts || []).map((a) => ({ ...a, date: dayOf(a.date) })).filter((a) => a.date !== null);
    if (attempts.length < run) continue;
    const ordered = attempts.sort((a, b) => a.date.localeCompare(b.date));
    const last = ordered.slice(-run);
    if (!last.every((a) => STUCK_OUTCOMES.has(a.outcome))) continue;
    out.push({
      problem,
      run: countTrailing(ordered, (a) => STUCK_OUTCOMES.has(a.outcome)),
      since: last[0].date,
      lastTried: last[last.length - 1].date,
    });
  }
  return out.sort((a, b) => b.run - a.run || b.lastTried.localeCompare(a.lastTried));
}

function countTrailing(list, predicate) {
  let n = 0;
  for (let i = list.length - 1; i >= 0 && predicate(list[i]); i--) n += 1;
  return n;
}

/** The single thing to do next, so opening the app never means deciding
 * where to go — just what today calls for:
 *   1. Haven't practiced yet today -> do one rep (due first, else a stale pattern).
 *   2. Already practiced today and a pattern keeps coming up wrong -> dig into
 *      that pattern specifically rather than grabbing anything new.
 *   3. A pattern hasn't been touched in a while, even though it's not
 *      technically due yet -> a gentle nudge, spaced-repetition style.
 *   4. Otherwise, whatever's next in the queue.
 *   5. Nothing left -> say so; stopping is a fine answer. */
/**
 * Pull an unstarted problem from the bank, preferring the weakest pattern the
 * bank can serve.
 *
 * This is what makes a large problem bank useful rather than just large: when
 * the review schedule is genuinely clear, the answer shouldn't be "free day"
 * if there are hundreds of unstarted problems sitting there — it should be a
 * specific next problem, chosen for the pattern that needs the work.
 */
/** How long a pattern is worked before moving on, while building foundations. */
const BLOCK_CLEAN_RATE = 0.7;
const BLOCK_MIN_ATTEMPTS = 3;

/**
 * The pattern to stay on, or null when there is nothing to block on.
 *
 * Whatever was last worked, as long as it still has material and has not been
 * got right often enough to be worth leaving. Moving on the moment a pattern
 * is merely finished is what turns block practice back into interleaving.
 */
function blockPattern(state, due, picker) {
  const attempts = allAttempts(state);
  // A chosen focus is the block; otherwise whatever was worked last.
  const last = picker.focus?.source === "chosen"
    ? { patternId: picker.focus.patternId }
    : attempts[attempts.length - 1];
  const stats = Object.fromEntries(patternStats(state).map((s) => [s.pattern.id, s]));

  const material = (patternId) => picker.pick(due.filter((p) => p.patternId === patternId))
    || picker.pick(backlogProblems(state, patternId))
    || picker.pick(state.problems.filter((p) => p.patternId === patternId));

  const mastered = (patternId) => {
    const st = stats[patternId];
    return st && st.attempts >= BLOCK_MIN_ATTEMPTS
      && (st.solvedCleanRate ?? 0) >= BLOCK_CLEAN_RATE;
  };

  if (last && !mastered(last.patternId)) {
    const problem = material(last.patternId);
    const pattern = state.patterns.find((p) => p.id === last.patternId);
    if (problem && pattern) {
      const st = stats[last.patternId];
      const rate = st?.solvedCleanRate;
      return {
        type: "block", problem, patternId: pattern.id,
        message: `Staying on ${pattern.name}${rate != null ? ` — ${Math.round(rate * 100)}% clean so far` : ""}. `
          + `Block practice while you are this far out: the point is to see it coming, and that only `
          + `happens after several in a row.`,
      };
    }
  }

  // Nothing in hand, so open the block that has the most ground to cover.
  const next = patternStats(state)
    .filter((st) => material(st.pattern.id))
    .sort((a, b) => (a.attempts ? a.solvedCleanRate ?? 1 : -1) - (b.attempts ? b.solvedCleanRate ?? 1 : -1))[0];
  if (!next) return null;
  return {
    type: "block", problem: material(next.pattern.id), patternId: next.pattern.id,
    message: `Starting a block on ${next.pattern.name}. Stay on it until the shape of it is obvious — `
      + `read the topic first if it is new.`,
  };
}

// ---------- Focus and variety ----------
//
// The recommendation used to be the head of a sorted list: lowest box first,
// then oldest review date. On a real account that is the same problem every
// morning — "Up next: 3Sum", for days — and it takes no notice of what you are
// actually working on. Someone deep in dynamic programming with two pointers
// long since solid was being sent back to Container With Most Water.
//
// So the pick is now a weighted draw. The weights say what matters: the pattern
// you are focused on counts for a lot, a pattern you have mastered for little,
// a problem low in the schedule for more than one high in it. The draw is
// seeded by the day, so the dashboard does not reshuffle every time it renders,
// and "something else" moves the seed on.

/** Clean-solve rate and attempts past which a pattern counts as mastered, and
 *  is suggested rarely rather than never — spaced review still needs it. */
export const MASTERED_CLEAN_RATE = 0.8;
export const MASTERED_MIN_ATTEMPTS = 3;

/** How much more likely a problem in the focus pattern is to be drawn. */
const FOCUS_WEIGHT = 6;
/** How much less likely a problem in a mastered pattern is. */
const MASTERED_WEIGHT = 0.2;
/** Discount for repeating the pattern just worked, outside a focus. Mixing is
 *  the point of the interleaved phase. */
const REPEAT_WEIGHT = 0.5;

/** Inferring a focus: of the last few attempts inside a week, how many have to
 *  share a pattern before it counts as the thing being worked on. */
const FOCUS_RECENT = 4;
const FOCUS_RECENT_DAYS = 7;
const FOCUS_MIN_SHARE = 2;

/** Whether a pattern's record says it is solid. */
export function isMastered(stat) {
  return !!stat && stat.attempts >= MASTERED_MIN_ATTEMPTS
    && (stat.solvedCleanRate ?? 0) >= MASTERED_CLEAN_RATE;
}

/**
 * The pattern being worked on, or null.
 *
 * Chosen outright (from a topic page) wins. Otherwise it is inferred from the
 * last few attempts: two or more of the last four in a week on one pattern
 * that is not yet mastered. A chosen focus that has since been mastered still
 * stands — you picked it, and taking it away silently would be the app
 * overruling you; the topic page says it is mastered instead.
 */
export function currentFocus(state, today = todayISO()) {
  const chosen = state.settings?.prep?.focusPatternId;
  if (chosen && state.patterns.some((p) => p.id === chosen)) {
    return { patternId: chosen, source: "chosen" };
  }
  // Without a readable clock nothing can be called recent; a quiet null, not a throw.
  const now = dayOf(today);
  if (now === null) return null;
  const recent = allAttempts(state)
    .filter((a) => isRecent(a, now))
    .slice(-FOCUS_RECENT);
  const counts = new Map();
  for (const a of recent) counts.set(a.patternId, (counts.get(a.patternId) || 0) + 1);
  const stats = Object.fromEntries(patternStats(state).map((st) => [st.pattern.id, st]));
  const [patternId, n] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
  if (!patternId || n < FOCUS_MIN_SHARE || isMastered(stats[patternId])) return null;
  return { patternId, source: "recent" };
}

/** Whether an attempt has a real day within the focus window of `now`; a damaged date is never recent work. */
function isRecent(attempt, now) {
  const day = dayOf(attempt.date);
  return day !== null && daysBetween(day, now) <= FOCUS_RECENT_DAYS;
}

/** Choose a focus pattern, or clear it with null. */
export function setFocus(state, patternId) {
  state.settings.prep = { ...(state.settings.prep || {}), focusPatternId: patternId || null };
}

/** A deterministic random source from a string, so a seed gives the same draw
 *  on every render and every device. (mulberry32 over an FNV-1a hash.) */
export function seededRandom(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let t = h >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** One item, drawn with probability proportional to its weight. */
export function weightedPick(items, weightOf, rand) {
  if (!items.length) return null;
  const weights = items.map((x) => Math.max(0, weightOf(x)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(rand() * items.length)];
  let roll = rand() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}

/** How strongly one problem should be suggested, all else equal. */
function problemWeight(problem, { focus, stats, lastPatternId }) {
  let w = 1 + 1 / (1 + (problem.box || 0));
  if (focus && problem.patternId === focus.patternId) return w * FOCUS_WEIGHT;
  if (isMastered(stats[problem.patternId])) w *= MASTERED_WEIGHT;
  if (problem.patternId === lastPatternId) w *= REPEAT_WEIGHT;
  return w;
}

/** A picker over problems for this state and seed, shared by every branch. */
function makePicker(state, seed, today) {
  const rand = seededRandom(seed);
  const focus = currentFocus(state, today);
  const stats = Object.fromEntries(patternStats(state).map((st) => [st.pattern.id, st]));
  const attempts = allAttempts(state);
  const lastPatternId = attempts[attempts.length - 1]?.patternId || null;
  const ctx = { focus, stats, lastPatternId };
  return { focus, rand, pick: (list) => weightedPick(list, (p) => problemWeight(p, ctx), rand) };
}

/** How long without a mock before simulation asks for one. */
const MOCK_GAP_DAYS = 4;

/**
 * Close to the date: a mock if one is overdue, otherwise a problem picked
 * without regard to pattern.
 *
 * "Without regard to pattern" rather than genuinely random: it rotates by the
 * date so the choice is stable through the day. A recommendation that changed
 * every time the dashboard re-rendered would be noise.
 */
function simulationPick(state, due, today, rand) {
  const mocks = state.mocks || [];
  // The greatest real day, so a mock with a damaged date is treated as absent rather than as a gap of NaN days.
  const lastMock = latestDay(mocks);
  // Uniform, not weighted: this close in, what the pattern is must not matter.
  const drawn = due.length ? due[Math.floor(rand() * due.length)] : null;
  if (drawn && (!lastMock || daysBetween(lastMock, today) >= MOCK_GAP_DAYS)) {
    return {
      type: "simulate", problem: drawn, patternId: drawn.patternId, mock: true,
      message: `${drawn.name}, as a mock — clock running, talking out loud, no hints. `
        + `${lastMock ? `Your last one was ${daysBetween(lastMock, today)} days ago. ` : ""}`
        + `This close in, what is still missing is performing it rather than knowing it.`,
    };
  }
  if (!drawn) return null;
  const problem = drawn;
  return {
    type: "simulate", problem, patternId: problem.patternId,
    message: `${problem.name}, picked without regard to pattern. Not knowing what is coming is the `
      + `part being practised now.`,
  };
}

function freshFromBank(state, picker) {
  const bank = backlogProblems(state);
  if (!bank.length) return null;

  const focused = picker.focus && bank.filter((p) => p.patternId === picker.focus.patternId);
  if (focused?.length) {
    const problem = picker.pick(focused);
    return {
      type: "fresh-volume", problem, patternId: problem.patternId, focus: picker.focus,
      message: `Nothing needs a refresher, so something new in ${state.patterns.find((x) => x.id === problem.patternId)?.name || "this pattern"}, `
        + `which is what you are working on. ${problem.name} is in your bank.`,
    };
  }

  const bankPatterns = new Set(bank.map((p) => p.patternId));
  const weakest = patternStats(state)
    .filter((s) => bankPatterns.has(s.pattern.id))
    .sort((a, b) => {
      // Never-attempted patterns first, then worst clean-solve rate.
      const aRate = a.attempts ? a.solvedCleanRate ?? 1 : -1;
      const bRate = b.attempts ? b.solvedCleanRate ?? 1 : -1;
      return aRate - bRate;
    })[0];

  const patternId = weakest ? weakest.pattern.id : bank[0].patternId;
  const problem = picker.pick(bank.filter((p) => p.patternId === patternId)) || bank[0];
  const reason = weakest && weakest.attempts
    ? `${weakest.pattern.name} is your weakest at ${Math.round((weakest.solvedCleanRate ?? 0) * 100)}% clean-solve`
    : `you haven't attempted ${weakest ? weakest.pattern.name : "this pattern"} yet`;
  return {
    type: "fresh-volume", problem, patternId,
    message: `Nothing needs a refresher — good time for something new. ${problem.name} is in your bank, and ${reason}.`,
  };
}

/**
 * What to do next, in the part of the preparation this is.
 *
 * `phase` is passed in rather than read, because prep.js already imports this
 * file and the dependency cannot run both ways. It defaults to the interleaved
 * behaviour, which is what this did before phases existed and what somebody
 * who has not told the app about an interview still gets.
 *
 * What each phase changes:
 *
 *  * **foundations** stays on one pattern until it is obvious. Mixing too
 *    early feels harder and teaches less: every problem becomes a fresh search
 *    instead of a recognition, and the recognition is the thing being built.
 *  * **mixed** is the queue as the scheduler sees it — spaced and interleaved.
 *  * **simulation** stops caring what pattern anything is. Two weeks out the
 *    gap being closed is performance rather than knowledge, so the point is
 *    not knowing what is coming.
 */
export function recommendSession(state, phase = "mixed", { seed = todayISO() } = {}) {
  const today = todayISO();
  const picker = makePicker(state, seed, today);
  const withFocus = (rec) => (rec && picker.focus && rec.patternId === picker.focus.patternId
    ? { ...rec, focus: picker.focus } : rec);
  const todaysAttempts = allAttempts(state).filter((a) => a.date === today);
  const due = dueProblems(state);
  const duePatternIds = new Set(due.map((p) => p.patternId));

  let stale = null;
  for (const pat of state.patterns) {
    if (duePatternIds.has(pat.id)) continue;
    const atts = allAttempts(state, pat.id);
    if (!atts.length) continue;
    // Not the last by sort: a damaged text date such as "soon" sorts last, and must not hide an older real one.
    const lastDay = latestDay(atts);
    if (lastDay === null) continue;
    const daysSince = daysBetween(lastDay, today);
    if (daysSince >= STALE_DAYS && (!stale || daysSince > stale.daysSince)) {
      stale = { pattern: pat, daysSince };
    }
  }

  // Block practice, and it comes before everything else: while foundations are
  // being built, staying on a pattern matters more than what the queue thinks
  // is overdue.
  if (phase === "foundations") {
    const block = blockPattern(state, due, picker);
    if (block) return withFocus(block);
  }

  // Two weeks out, a mock is worth more than another rep — the thing that is
  // still missing is performing it, not knowing it.
  if (phase === "simulation") {
    const sim = simulationPick(state, due, today, picker.rand);
    if (sim) return sim;
  }

  if (todaysAttempts.length === 0) {
    if (due.length) {
      const problem = picker.pick(due);
      return withFocus({
        type: "first-rep", problem, patternId: problem.patternId,
        message: `Haven't practiced yet today — let's do one. ${problem.name} is a good place to start.`,
      });
    }
    if (stale) {
      const problem = picker.pick(state.problems.filter((p) => p.patternId === stale.pattern.id));
      return { type: "stale-nudge", problem, patternId: stale.pattern.id, message: `Nothing is pressing, but ${stale.pattern.name} hasn't come up in ${stale.daysSince} days — worth a refresher before it fades.` };
    }
    const fresh = freshFromBank(state, picker);
    if (fresh) return fresh;
    return { type: "none", problem: null, patternId: null, message: "Nothing has gone stale. Free day — browse Topics, or take it." };
  }

  // Before the pattern deep-dive: a named problem that has gone nowhere three
  // times is more actionable than a rate across a whole pattern, and it is the
  // one case where the right recommendation is not another attempt.
  const stuck = stuckProblems(state)[0];
  if (stuck) {
    return {
      type: "stuck", problem: stuck.problem, patternId: stuck.problem.patternId,
      message: `${stuck.problem.name} hasn't gone in ${stuck.run} attempts, the last on `
        + `${stuck.lastTried}. Another go at it today is unlikely to be the thing that works — `
        + `read the pattern, or look at what you wrote last time, and come back to it.`,
    };
  }

  // With a focus you chose, only a weak spot in that pattern pulls you off it.
  // Being sent to review a different pattern's technique is exactly the
  // "why am I being given two pointers?" this is here to stop.
  const chosenFocus = picker.focus?.source === "chosen" ? picker.focus.patternId : null;
  const weak = patternStats(state)
    .filter((s) => !chosenFocus || s.pattern.id === chosenFocus)
    .filter((s) => s.attempts >= WEAK_MIN_ATTEMPTS && s.solvedCleanRate != null && s.solvedCleanRate < WEAK_CLEAN_RATE)
    .sort((a, b) => a.solvedCleanRate - b.solvedCleanRate)[0];
  if (weak) {
    const problem = picker.pick(due.filter((p) => p.patternId === weak.pattern.id))
      || picker.pick(state.problems.filter((p) => p.patternId === weak.pattern.id));
    return withFocus({
      type: "deep-dive", problem, patternId: weak.pattern.id,
      message: `${weak.pattern.name} is at ${Math.round(weak.solvedCleanRate * 100)}% clean-solve across ${weak.attempts} attempts — that's a repeated pattern, not a one-off. Worth reviewing the technique before drilling another rep.`,
    });
  }

  if (stale) {
    const problem = picker.pick(state.problems.filter((p) => p.patternId === stale.pattern.id));
    return { type: "stale-nudge", problem, patternId: stale.pattern.id, message: `It's been ${stale.daysSince} days since ${stale.pattern.name} came up — a quick review would help it stick.` };
  }

  if (due.length) {
    const problem = picker.pick(due);
    return withFocus({ type: "due", problem, patternId: problem.patternId, message: `${problem.name} is next in the queue.` });
  }

  return { type: "none", problem: null, patternId: null, message: "You've covered today's queue. That's a real stopping point." };
}


// ---------- Timeboxing one question ----------
//
// The daily budget is a ceiling for the day. It said nothing about one problem,
// so a single medium could absorb the whole seventy-five minutes — which is not
// how the thing being practised works. An interview gives you forty-five
// minutes and takes the laptop away, and the skill being trained is partly
// deciding, inside that box, when to stop planning and start typing.
//
// So each difficulty gets its own box, and the box is divided into the phases
// the process actually has. The division is not proportional, because the real
// process is not: understanding the problem takes about five minutes whether
// it is easy or hard, and what scales with difficulty is how long you should
// be willing to spend planning before committing to code.
//
// These are guardrails and not gates. Nothing stops when a phase ends; the app
// says where you are and what the phase is for, and running over is reported
// rather than hidden — an app that quietly stops counting teaches the opposite
// of the lesson.

/** Minutes for one question, by difficulty. Overridable in Settings. */
export const DEFAULT_QUESTION_MINUTES = { Easy: 30, Medium: 45, Hard: 60, Unrated: 45 };

/**
 * How long to be willing to plan before writing code, by difficulty.
 *
 * The number that matters most here. Too low and you train yourself to start
 * typing before you know the shape of the answer, which is the single most
 * common way a solvable interview problem goes wrong. Too high and you run out
 * of clock with a good plan and nothing to show.
 */
export const DEFAULT_PLAN_MINUTES = { Easy: 10, Medium: 15, Hard: 25, Unrated: 15 };

/** Reading the problem and working out what it is actually asking. Flat,
 *  because it does not scale with difficulty — a hard problem is not harder to
 *  read, it is harder to solve. */
export const READ_MINUTES = 5;

/** Held back at the end for writing down what happened while it is still
 *  fresh. Reserved rather than hoped for: the reflection is the part this whole
 *  app is built to collect, and it is the first thing to be squeezed out. */
export const REFLECT_MINUTES = 5;

/** Below this there is no room to divide anything, so the plan is one phase. */
const MIN_DIVISIBLE_MINUTES = 12;

export function questionMinutes(state, difficulty) {
  const table = state?.settings?.questionMinutes || DEFAULT_QUESTION_MINUTES;
  return table[difficulty] ?? table.Unrated ?? DEFAULT_QUESTION_MINUTES.Unrated;
}

export function planMinutes(state, difficulty) {
  const table = state?.settings?.planMinutes || DEFAULT_PLAN_MINUTES;
  return table[difficulty] ?? table.Unrated ?? DEFAULT_PLAN_MINUTES.Unrated;
}

/**
 * The phases of one question, with real minute boundaries.
 *
 * Returns `{ totalMin, phases: [{ key, label, prompt, startMin, endMin, minutes }] }`,
 * contiguous and covering the whole box.
 *
 * When the box is too small to hold read + plan + reflect at their stated
 * sizes, every phase shrinks by the same factor rather than code going
 * negative. A fifteen-minute box is a legitimate thing to want — a warm-up on
 * an easy problem — and it should produce a small version of the same shape,
 * not a broken one.
 */
export function questionPlan(state, difficulty) {
  const totalMin = Math.max(1, Math.round(questionMinutes(state, difficulty)));

  if (totalMin < MIN_DIVISIBLE_MINUTES) {
    return {
      totalMin,
      phases: [{
        key: "solve", label: "Solve", startMin: 0, endMin: totalMin, minutes: totalMin,
        prompt: "Short box — read it, decide on an approach and write it. Reflect afterwards.",
      }],
    };
  }

  // Allocated, not scaled. An earlier version scaled the three fixed phases by
  // a factor and let code take the remainder, and rounding could push the last
  // boundary a minute or two *past* the box — a 15-minute box reporting itself
  // as 16. The sum is now correct by construction: read, plan and reflect are
  // whatever they can be, and code is exactly what is left.
  let read = READ_MINUTES;
  let plan = Math.max(1, Math.round(planMinutes(state, difficulty)));
  let reflect = REFLECT_MINUTES;

  // Code needs a minute at minimum, and what it borrows comes from planning
  // first. Planning is the elastic one: you can decide on an approach in less
  // time than you would like, but you cannot read the problem in no time and
  // you cannot write down what happened in no time.
  const MIN_CODE = 1;
  while (read + plan + reflect + MIN_CODE > totalMin) {
    if (plan > 1) plan -= 1;
    else if (read > 1) read -= 1;
    else if (reflect > 1) reflect -= 1;
    else break;
  }
  const code = Math.max(MIN_CODE, totalMin - read - plan - reflect);

  const spec = [
    ["read", "Read", read,
      "What is it actually asking? Note the constraints, the edge cases, and the questions you'd ask an interviewer."],
    ["plan", "Plan", plan,
      "Decide the approach and say why, before typing. Name the invariant and the complexity you expect."],
    ["code", "Code", code,
      "Write it. If the approach is wrong you'll find out here — that's information, not lost time."],
    ["reflect", "Reflect", reflect,
      "Stop coding. Write down what happened while it's fresh; that sentence is the part you'll reread."],
  ];

  let cursor = 0;
  const phases = spec.map(([key, label, minutes, prompt]) => {
    const startMin = cursor;
    cursor += minutes;
    return { key, label, prompt, startMin, endMin: cursor, minutes };
  });
  return { totalMin, phases };
}

/**
 * Which surface the current phase is about, as pane fractions.
 *
 * Statement, code, whiteboard — the three panes of the workspace, in that
 * order, summing to 1.
 *
 * This follows how a real interview actually goes rather than how a code editor
 * usually looks. You read the problem, you diagram the approach while the
 * interviewer watches you think, and *then* you write code — with the diagram
 * still on screen, because the whole reason you drew it is to code against it.
 *
 * So the emphasis moves with the phase: the statement leads while you are
 * reading it, the board takes the room while you are planning, and the editor
 * takes it when it is time to type — at which point the board shrinks but does
 * not disappear, because "reference the drawing while coding" is the point of
 * having drawn it.
 *
 * Suggestions, not impositions. A drag wins and keeps winning: see
 * `phaseLayoutIsAdvisory` in session-view.js.
 */
export const PHASE_LAYOUTS = {
  read:    [0.42, 0.23, 0.35],   // the statement, and room to sketch while reading it
  plan:    [0.25, 0.20, 0.55],
  code:    [0.20, 0.52, 0.28],
  reflect: [0.34, 0.33, 0.33],
  solve:   [0.30, 0.45, 0.25],
};

export function phaseLayout(phaseKey) {
  return PHASE_LAYOUTS[phaseKey] || PHASE_LAYOUTS.solve;
}

/**
 * Where you are in the plan, given minutes elapsed.
 *
 * `overrun` counts past the end of the box rather than clamping, for the same
 * reason mockPhase does: going over is the information.
 */
export function questionPhase(elapsedMin, plan) {
  const { phases, totalMin } = plan;
  const current = phases.find((p) => elapsedMin < p.endMin) || phases[phases.length - 1];
  const remainingInPhase = current.endMin - elapsedMin;
  const remainingMin = totalMin - elapsedMin;
  const next = phases[phases.indexOf(current) + 1] || null;
  return {
    key: current.key,
    label: current.label,
    prompt: current.prompt,
    index: phases.indexOf(current),
    remainingInPhase,
    remainingMin,
    fraction: totalMin > 0 ? elapsedMin / totalMin : 0,
    overrun: remainingMin < 0,
    // Said a minute before the boundary rather than at it, so the nudge lands
    // while there is still time to act on it.
    endingSoon: remainingInPhase <= 1 && remainingInPhase > 0,
    nextLabel: next ? next.label : null,
  };
}
