// Does the planned practice reach every pattern the person has never attempted?
//
// Where this fits: a pure reader beside adherence.js and prep.js, feeding one Progress card. It holds no state, never
// reads the clock (`today` is a caller's argument) and writes nothing back.
//
// It counts the PLAN (coding and mock problems a week), not what has been done: adherence already compares those, and
// a first attempt per untouched pattern is deliberately a low bar. One attempt is a first look, not competence; any
// higher bar would be an invented number, so it is the named ATTEMPTS_PER_PATTERN for the owner to rule on.

import { patternStats, isRecord, dayOf, exactDayOf, daysBetween, todayISO } from "./logic.js";
import { prepOf, interviewPassed } from "./prep.js";
import { weekPlan, weeklyProblems } from "./week.js";

/** First attempts each untouched pattern needs before the runway counts it as reached. */
export const ATTEMPTS_PER_PATTERN = 1;

/** Untouched pattern names the card spells out before saying "and N more". */
export const RUNWAY_NAMES_SHOWN = 8;

const DAYS_PER_WEEK = 7;

/** @typedef {{id: string, name: string}} UntouchedPattern */
/**
 * @typedef {{status: "no-date"|"covered"|"fits"|"short", daysLeft: number|null, perWeek: number,
 *   capacity: number, needed: number, spare: number, shortfall: number, untouched: UntouchedPattern[]}} Runway
 */

/** The result when there is no run-up to measure: no date, a passed date, or an unreadable clock. */
const NO_RUNWAY = Object.freeze({
  status: "no-date", daysLeft: null, perWeek: 0, capacity: 0, needed: 0, spare: 0, shortfall: 0, untouched: [],
});

/** A problem keeping only attempts that are records, with `mistakeTags` a list, which `patternStats` iterates unchecked. */
function readableProblem(problem) {
  const attempts = problem.attempts.filter(isRecord)
    .map((a) => (Array.isArray(a.mistakeTags) ? a : { ...a, mistakeTags: [] }));
  return { ...problem, attempts };
}

/**
 * The state `patternStats` can read. Saved files are hand-editable, so a missing pattern list, a null pattern or a
 * problem whose attempts are not a list is dropped here rather than allowed to crash Progress.
 */
function readableState(state) {
  const patterns = Array.isArray(state?.patterns)
    ? state.patterns.filter((p) => isRecord(p) && typeof p.id === "string") : [];
  const problems = Array.isArray(state?.problems)
    ? state.problems.filter((p) => isRecord(p) && Array.isArray(p.attempts)).map(readableProblem) : [];
  return { ...state, patterns, problems };
}

/** The pattern's name, or its id when the name is missing or blank so the card never lists an empty entry. */
function nameOf(pattern) {
  return typeof pattern.name === "string" && pattern.name.trim() ? pattern.name : pattern.id;
}

/**
 * Whether the planned coding and mock practice between `today` and the interview can give every never-attempted
 * pattern a first attempt.
 *
 * Capacity counts whole days, not `weeksUntil`, which rounds up and would promise a part week that is already gone.
 *
 * @returns {Runway}
 */
export function runwayCheck(state, today = todayISO()) {
  const now = dayOf(today);
  const target = exactDayOf(prepOf(state).targetDate);
  if (!now || !target || interviewPassed(state, now)) return { ...NO_RUNWAY };

  const readable = readableState(state);
  const untouched = patternStats(readable)
    .filter((s) => s.attempts === 0)
    .map((s) => ({ id: s.pattern.id, name: nameOf(s.pattern) }));
  const daysLeft = daysBetween(now, target);
  const perWeek = weeklyProblems(weekPlan(readable));
  const capacity = Math.floor((daysLeft * perWeek) / DAYS_PER_WEEK);
  const needed = untouched.length * ATTEMPTS_PER_PATTERN;
  const status = untouched.length === 0 ? "covered" : needed <= capacity ? "fits" : "short";
  return {
    status, daysLeft, perWeek, capacity, needed, untouched,
    spare: status === "fits" ? capacity - needed : 0,
    shortfall: status === "short" ? needed - capacity : 0,
  };
}
