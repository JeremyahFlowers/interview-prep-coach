// Reporting: what the log says about how you're doing.
//
// Where this fits: above the domain and below the views. Everything here reads
// state and returns numbers — it never schedules anything, never mutates, and
// is the only place that decides what counts as "improving".
//
// Split out of logic.js, which had reached 1,254 lines holding scheduling, the
// plant, planning, the day clock, mock phases, quiz weighting and all of this
// at once. It was becoming what views.js had been.
//
// The honesty rules live here too, and they matter more than the arithmetic: a
// week with one attempt reports no rate rather than 0% or 100%, empty weeks
// stay visible instead of being collapsed, and a pattern without enough
// attempts on both sides of a split is left out rather than drawn as flat. A
// chart that misleads is worse than no chart, because it gets believed.

import {
  todayISO, addDaysISO, daysBetween, mondayOf, dayOf, dateSortKey, allAttempts, activityByDate, isCleanSolve, CLEAN_SOLVE,
} from "./logic.js";

export function patternTrend(state, patternId, window = 10) {
  const attempts = allAttempts(state, patternId).slice(-window);
  let solved = 0;
  return attempts.map((a, i) => {
    if (isCleanSolve(a)) solved += 1;
    return solved / (i + 1);
  });
}

/** Picks a random already-attempted problem for the pattern-recognition
 * quiz, avoiding the last few asked where possible so it doesn't repeat the
 * same one twice in a row. */
// ---------- Progress over time ----------
//
// The app already records everything needed to answer "am I actually getting
// better?", but scattered across three pages: outcomes in the queue, recall
// accuracy in the quiz, per-pattern rates in the mastery table. These functions
// aggregate that into a trajectory.
//
// Deliberately, none of them reward volume on its own. The failure mode this
// whole app exists to prevent is grinding harder and calling it progress, so
// the measures here are about getting *better* — solving cleanly, and
// recognizing the pattern faster — with volume reported only so a spike
// followed by a collapse is visible for what it is.

const MS_PER_DAY = 86400000;
const DAYS_PER_WEEK = 7;
export const PROGRESS_WEEKS = 8;
/** Below this a week's rate is noise, not a trend, and is reported as null. */
const MIN_ATTEMPTS_FOR_RATE = 2;
/** A week this far above the trailing norm is a spike worth naming. */
const SPIKE_MULTIPLE = 2.5;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * One row per week, oldest first, including weeks with no activity — a gap is
 * part of the story and collapsing it would hide exactly the pattern worth
 * seeing.
 */
export function weeklyProgress(state, weeks = PROGRESS_WEEKS, patternId = null) {
  // patternId narrows the same calculation to one pattern, so the per-pattern
  // trend on a topic page is the global chart with a filter rather than a
  // second implementation that could disagree with it.
  const attempts = allAttempts(state, patternId);
  const thisMonday = mondayOf(todayISO());

  const buckets = new Map();
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.set(addDaysISO(thisMonday, -i * DAYS_PER_WEEK), []);
  }
  for (const a of attempts) {
    const day = dayOf(a.date);
    if (day === null) continue;
    const week = mondayOf(day);
    if (buckets.has(week)) buckets.get(week).push(a);
  }

  return [...buckets.entries()].map(([weekStart, rows]) => {
    const clean = rows.filter(isCleanSolve).length;
    const insights = rows.map((a) => a.timeToInsightMin).filter((n) => typeof n === "number");
    return {
      weekStart,
      attempts: rows.length,
      cleanRate: rows.length >= MIN_ATTEMPTS_FOR_RATE ? clean / rows.length : null,
      medianInsightMin: median(insights),
      minutes: rows.reduce((sum, a) => sum + (a.timeToSolveMin || 0), 0),
    };
  });
}

/**
 * Which patterns moved, comparing the most recent attempts against what came
 * before them.
 *
 * Split by attempt count rather than by date: practice is uneven, and a
 * fortnight where a pattern never came up says nothing about whether it
 * improved. Patterns without enough attempts on both sides are left out rather
 * than shown with a meaningless delta.
 */
export function patternMovement(state, { recent = 5, minEach = 2 } = {}) {
  const out = [];
  for (const pattern of state.patterns) {
    const attempts = allAttempts(state, pattern.id);
    if (attempts.length < minEach * 2) continue;

    const split = Math.max(minEach, attempts.length - recent);
    const before = attempts.slice(0, split);
    const after = attempts.slice(split);
    if (before.length < minEach || after.length < minEach) continue;

    const rate = (rows) => rows.filter(isCleanSolve).length / rows.length;
    const beforeRate = rate(before);
    const afterRate = rate(after);
    out.push({
      pattern,
      before: beforeRate,
      after: afterRate,
      delta: afterRate - beforeRate,
      attempts: attempts.length,
    });
  }
  return out.sort((a, b) => b.delta - a.delta);
}

/**
 * A plain-language read of the trajectory, plus anything worth flagging.
 *
 * The flag matters as much as the trend: a week at several times the usual
 * volume is the shape that precedes burning out and stopping, and this app
 * exists because that happened. Naming it while it's happening is the point.
 */
export function progressSummary(state, weeks = PROGRESS_WEEKS, patternId = null) {
  const rows = weeklyProgress(state, weeks, patternId);
  const rated = rows.filter((r) => r.cleanRate != null);
  const timed = rows.filter((r) => r.medianInsightMin != null);

  const half = Math.floor(rated.length / 2);
  const avg = (list, key) => (list.length ? list.reduce((s, r) => s + r[key], 0) / list.length : null);
  const cleanEarlier = half ? avg(rated.slice(0, half), "cleanRate") : null;
  const cleanRecent = half ? avg(rated.slice(half), "cleanRate") : null;

  const insightHalf = Math.floor(timed.length / 2);
  const insightEarlier = insightHalf ? avg(timed.slice(0, insightHalf), "medianInsightMin") : null;
  const insightRecent = insightHalf ? avg(timed.slice(insightHalf), "medianInsightMin") : null;

  const active = rows.filter((r) => r.attempts > 0);
  const typical = active.length > 1
    ? active.slice(0, -1).reduce((s, r) => s + r.attempts, 0) / Math.max(1, active.length - 1)
    : null;
  const latest = rows[rows.length - 1];
  const spike = typical != null && typical > 0 && latest.attempts > typical * SPIKE_MULTIPLE;

  return {
    weeks: rows,
    hasEnoughData: rated.length >= 2,
    cleanRateDelta: cleanEarlier != null && cleanRecent != null ? cleanRecent - cleanEarlier : null,
    insightDelta: insightEarlier != null && insightRecent != null ? insightRecent - insightEarlier : null,
    totalAttempts: rows.reduce((s, r) => s + r.attempts, 0),
    activeWeeks: active.length,
    spike: spike ? { attempts: latest.attempts, typical: Math.round(typical * 10) / 10 } : null,
  };
}


// ---------- Has the model been right, on your problems? ----------
//
// Analyze has written its ranked guesses onto every problem tracked from it
// since the feature shipped, and the problem then records which pattern it
// settled on. Nothing ever compared the two. The model's published numbers
// come from a held-out split of a public corpus, which says how it does on
// problems in general and nothing about how it does on yours.
//
// The honest caveat, and the reason this is called agreement rather than
// accuracy: on the Analyze form you pick the pattern in the same breath as
// reading the prediction, so a match may be the model being right or you
// being anchored. A *disagreement* has no such doubt — you saw its answer and
// chose a different one — which is why those are reported separately and by
// name. The view is required to carry the caveat; see renderAnalyze.

/** Below this there is nothing to say, and a percentage over four problems
 * reads as precision that isn't there. */
export const SCORECARD_MIN = 8;

/**
 * How often the model's ranking contained the pattern you settled on.
 *
 * Returns `{ n, top1, top3, top1Rate, top3Rate, enough, needed, disagreements }`.
 * Rates are null below the minimum rather than a number nobody should read.
 */
export function modelScorecard(state) {
  const judged = (state.problems || []).filter(
    (p) => p.analysis?.predictions?.length && p.patternId,
  );

  let top1 = 0;
  let top3 = 0;
  const disagreements = [];
  for (const p of judged) {
    const ranked = p.analysis.predictions.map((pred) => pred.pattern);
    if (ranked[0] === p.patternId) top1 += 1;
    else {
      disagreements.push({
        problemId: p.id,
        problemName: p.name,
        said: ranked[0],
        saidProbability: p.analysis.predictions[0].probability,
        actual: p.patternId,
        at: p.analysis.at,
      });
    }
    if (ranked.includes(p.patternId)) top3 += 1;
  }

  const n = judged.length;
  const enough = n >= SCORECARD_MIN;
  return {
    n,
    top1,
    top3,
    top1Rate: enough ? top1 / n : null,
    top3Rate: enough ? top3 / n : null,
    enough,
    needed: Math.max(0, SCORECARD_MIN - n),
    // Newest first: the recent ones are the ones you can still remember.
    disagreements: disagreements.sort((a, b) => dateSortKey({ date: b.at }).localeCompare(dateSortKey({ date: a.at }))),
  };
}

// ---------- What you actually did this week ----------
//
// The charts above answer "am I improving", over twelve weeks, as rates. They
// deliberately refuse to say anything about a single week, because one week is
// not a trend — which left the app with no answer at all to the plainer and
// more immediate question of what you did in the last seven days.
//
// So this counts rather than rates. It reports what happened: which problems
// you worked, what you wrote down, what moved up a box. The one number it does
// compute — the share solved cleanly — carries its own sample size, and the
// view is required to show it, because seven days is exactly the window where
// a percentage is most tempting and least meaningful.
//
// Ends today rather than on a calendar boundary. "This week" means the last
// seven days you lived through, not the remains of one that started Monday.

export const REVIEW_DAYS = 7;

/** Whether a stored date names a day inside the window; by the day, because a timestamp on the last day sorts after it as text. */
function inDayRange(value, startISO, endISO) {
  const day = dayOf(value);
  return day !== null && day >= startISO && day <= endISO;
}

/**
 * A readable account of the last `days` days, ending on `endISO` inclusive.
 *
 * Returns counts, the sessions themselves, the notes you wrote, the problems
 * that moved up a box, and — separately — the same figures for the week before,
 * so the view can say quieter or busier without the caller doing the arithmetic
 * twice.
 */
export function weekInReview(state, endISO = todayISO(), days = REVIEW_DAYS) {
  const startISO = addDaysISO(endISO, -(days - 1));
  const inWindow = (d) => inDayRange(d, startISO, endISO);

  const sessions = allAttempts(state).filter((a) => inWindow(a.date));
  const outcomes = {};
  for (const a of sessions) outcomes[a.outcome] = (outcomes[a.outcome] || 0) + 1;

  // A Map: a plain object reads "constructor" as an inherited function and "__proto__" as the prototype.
  const patterns = new Map();
  // String(): an object key was always a string, so a damaged attempt with no patternId still tallies as "undefined".
  for (const a of sessions) {
    const id = String(a.patternId);
    patterns.set(id, (patterns.get(id) || 0) + 1);
  }

  // Self-reported solve time, which is what an attempt records. Not the day
  // clock's wall time — that is budget spent, including the half hour you sat
  // looking at it, and the two answer different questions.
  //
  // Counted separately from the sessions, because most attempts carry no time
  // at all: totalling them and labelling the result "this week" would say the
  // week was twenty minutes long when it was ten sessions with two timed.
  const timed = sessions.filter((a) => typeof a.timeToSolveMin === "number" && a.timeToSolveMin > 0);
  const minutes = timed.reduce((sum, a) => sum + a.timeToSolveMin, 0);
  const clean = outcomes[CLEAN_SOLVE] || 0;

  // Only problems whose most recent attempt landed in the window: a box
  // reached last month is not something that moved this week.
  const promoted = (state.problems || []).filter((p) => {
    const last = (p.attempts || [])[p.attempts.length - 1];
    return last && inWindow(last.date) && p.box > 0 && isCleanSolve(last);
  }).map((p) => ({ id: p.id, name: p.name, box: p.box }));

  const notes = sessions
    .filter((a) => a.soulStatement)
    .map((a) => ({ date: a.date, problemId: a.problemId, problemName: a.problemName, text: a.soulStatement }))
    .reverse();

  const mocks = (state.mocks || []).filter((m) => inWindow(m.date));
  const journal = (state.journal || []).filter((j) => inWindow(j.date));
  const daysWorked = new Set(sessions.map((a) => dayOf(a.date)));
  const previous = countOnly(state, addDaysISO(startISO, -1), days);

  return {
    startISO, endISO, days,
    sessions: [...sessions].reverse(),  // newest first, the way it reads
    sessionCount: sessions.length,
    activeDays: daysWorked.size,
    minutes,
    timedCount: timed.length,
    outcomes,
    cleanCount: clean,
    // Null below three: a "100% clean week" off one attempt is the single most
    // misleading number this app could print.
    cleanRate: sessions.length >= 3 ? clean / sessions.length : null,
    patterns: [...patterns]
      .map(([id, n]) => ({ patternId: id, attempts: n }))
      .sort((a, b) => b.attempts - a.attempts),
    promoted, notes, mocks, journal,
    previous,
    quiet: sessions.length === 0,
  };
}

/** The bare counts for a window, without recursing into its own predecessor. */
function countOnly(state, endISO, days) {
  const startISO = addDaysISO(endISO, -(days - 1));
  const sessions = allAttempts(state).filter((a) => inDayRange(a.date, startISO, endISO));
  return {
    startISO, endISO,
    sessionCount: sessions.length,
    activeDays: new Set(sessions.map((a) => dayOf(a.date))).size,
    cleanCount: sessions.filter(isCleanSolve).length,
  };
}

// ---------- What you keep swapping ----------
//
// The quiz kept a lifetime score and revealed the right answer, and threw away
// the one thing worth knowing: which pattern you reached for instead. A score
// tells you that recall is at 62%. It cannot tell you that four of the last
// six misses were Sliding Window answered as Two Pointers, which is a specific
// thing to go and read about.
//
// Only pairs seen more than once are reported. Once is a slip — you misread
// the problem, or clicked the wrong button — and calling that a confusion
// would send people off to study a mistake they did not make twice.

/** Twice is a habit. Once is a slip. */
export const CONFUSION_MIN = 2;

/**
 * Pattern pairs you have mixed up, most-confused first.
 *
 * Returns `{ pairs, graded, ungraded }`. `ungraded` counts answers recorded
 * before the app started keeping which pattern was chosen — they still count
 * toward your score and can never appear here, and the view says so rather
 * than letting the list look shorter than your history.
 */
export function quizConfusions(state) {
  const recent = state.quiz?.recent || [];
  const detailed = recent.filter((r) => r.actual && r.said);
  const counts = new Map();
  for (const r of detailed) {
    if (r.correct) continue;
    counts.set(`${r.actual}>${r.said}`, (counts.get(`${r.actual}>${r.said}`) || 0) + 1);
  }
  const pairs = [...counts]
    .map(([key, times]) => {
      const [actual, said] = key.split(">");
      return { actual, said, times };
    })
    .filter((p) => p.times >= CONFUSION_MIN)
    .sort((a, b) => b.times - a.times);

  return { pairs, graded: detailed.length, ungraded: recent.length - detailed.length };
}

// ---------- How your mocks are going ----------
//
// A mock records five specific interview behaviours — did you clarify
// constraints, state the approach out loud, narrate trade-offs, give
// complexity unprompted, test before declaring done — and every one of them
// was written down and never read again. `state.mocks` fed exactly one thing:
// the ring that unlocks the system design track.
//
// That is the wrong half to keep. Whether you solved it is already in the
// attempt; the mock exists for the part that only happens when someone is
// watching, and the checklist is the only record of it anywhere in the app.
//
// The rates here are over recent mocks rather than all of them, because a
// habit you fixed four months ago is not what you want to be shown, and the
// weakest one is named because "you are at 40% on three of five" is a table,
// not an answer.

/** Mocks counted toward the habit rates. Enough to be a pattern, recent
 *  enough to still be true of you. */
export const MOCK_WINDOW = 10;

/** Below this, a rate per behaviour is one or two runs and reads as a verdict. */
export const MOCK_MIN = 3;

/**
 * Per-behaviour rates across your recent mocks.
 *
 * `checklist` is a sparse object keyed by the behaviour's index — an unticked
 * box is simply absent — so a missing key counts as not done, which is what it
 * meant when the box was left alone.
 */
export function mockReview(state, checklistItems, window = MOCK_WINDOW) {
  const all = state.mocks || [];
  const recent = all.slice(-window);
  const enough = recent.length >= MOCK_MIN;

  const habits = checklistItems.map((label, i) => {
    const done = recent.filter((m) => !!(m.checklist || {})[i]).length;
    return { index: i, label, done, of: recent.length, rate: enough ? done / recent.length : null };
  });

  const rated = habits.filter((h) => h.rate != null);
  const weakest = rated.length ? rated.reduce((lo, h) => (h.rate < lo.rate ? h : lo)) : null;
  const strongest = rated.length ? rated.reduce((hi, h) => (h.rate > hi.rate ? h : hi)) : null;

  const comms = recent.map((m) => m.communicationRating).filter((r) => typeof r === "number");
  const durations = recent.map((m) => m.durationActualMin).filter((d) => typeof d === "number" && d > 0);

  return {
    total: all.length,
    counted: recent.length,
    enough,
    needed: Math.max(0, MOCK_MIN - recent.length),
    habits,
    // Only worth naming when there is a gap to act on: five behaviours all at
    // the same rate has no weakest one, it has a number.
    weakest: weakest && strongest && weakest.rate < strongest.rate ? weakest : null,
    strongest: weakest && strongest && weakest.rate < strongest.rate ? strongest : null,
    avgCommunication: comms.length ? comms.reduce((s, r) => s + r, 0) / comms.length : null,
    commsCount: comms.length,
    medianMinutes: durations.length ? median(durations) : null,
  };
}
