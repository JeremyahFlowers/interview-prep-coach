// What counts as a finished sitting of the weekly plan, on both sides of the ratio.
//
// Where this fits: pure helpers above week.js (the plan) and logic.js (dates),
// read by adherence.js (Progress) and by weekProgress below (Home). No DOM, no
// clock: "today" is always passed in. It lives apart from week.js so that the
// plan module does not depend on the log.
//
// Why it exists. Both "am I keeping the plan?" numbers used to count coding
// attempts only, so a week heavy on system design read as a short week. One
// function now says which plan items the log can confirm and one counts the
// confirmed work, so Home (a rolling seven days) and Progress (calendar weeks)
// cannot drift into disagreeing about what counts.

import { addDaysISO, dayOf, exactDayOf, todayISO } from "./logic.js";
import { weeklyCount, weeklyProblems, weekPlan, ADHERENCE_KEPT_RATIO, MAX_ITEM_COUNT } from "./week.js";

/**
 * Design runs one deep session records. The session sends the person to the
 * design bank once per block, and each finished run saves its own attempt, so
 * counting the session as one sitting would let two attempts clear a plan of one.
 */
export const DEEP_SESSION_SITTINGS = 2;

/**
 * Attempts one two-mediums round records: the session saves one per problem, so
 * the round reaches the log as two ordinary mock attempts. Weighing it as one
 * would let a single round clear a plan of two, and as none would read a week
 * that did the round as "5 of 3".
 */
export const PAIR_ROUND_SITTINGS = 2;

/** Sittings one plan item of each kind stands for; the keys are the kinds the log can confirm. */
const SITTING_WEIGHT = {
  coding: 1, mock: 1, designProblem: 1, designMock: DEEP_SESSION_SITTINGS, pairMock: PAIR_ROUND_SITTINGS,
};
const DESIGN_KINDS = ["designProblem", "designMock"];
const PAIR_KINDS = ["pairMock"];

/** Plan item kinds the log can confirm as a finished sitting. The only list. */
export const SITTING_KINDS = Object.keys(SITTING_WEIGHT);

/**
 * Hand-ticked plan item kinds that count as a sitting. The only list: the
 * recommended call (TODO 64; the owner has not confirmed it) is that a design
 * topic counts and a ten-minute drill does not. Reversing it means editing this line.
 */
export const TICKED_SITTING_KINDS = ["designStudy"];

/** The `kinds` value that counts hand-ticked topics as well as logged work. */
export const WITH_TICKS = "with-ticks";

/** The rolling window Home reports on. */
const HOME_WINDOW_DAYS = 7;
const sittingsOf = (week, kinds) => kinds.reduce((n, kind) => n + weeklyCount(week, kind) * SITTING_WEIGHT[kind], 0);

/** Design sittings a week plan asks for (design problems plus weighted deep sessions). */
export const plannedDesignSittings = (week) => sittingsOf(week, DESIGN_KINDS);

/** Round sittings a week plan asks for (two per planned two-mediums round). */
export const plannedPairSittings = (week) => sittingsOf(week, PAIR_KINDS);

/** Ticked-topic sittings a week plan asks for: one per item of a kind in TICKED_SITTING_KINDS, counted like `weeklyCount`. */
export const plannedTickedSittings = (week) => TICKED_SITTING_KINDS.reduce((n, kind) => n + weeklyCount(week, kind), 0);

/** Sittings a week plan asks for: coding and mocks, plus the design and round sittings. */
export const plannedSittings = (week) => sittingsOf(week, SITTING_KINDS);

/** `plannedSittings` plus the ticked topics: what a week is judged against once ticks are tracked. */
export const plannedWithTicks = (week) => plannedSittings(week) + plannedTickedSittings(week);

const recordedDays = (records) => (Array.isArray(records) ? records : [])
  .flatMap((r) => (Array.isArray(r?.attempts) ? r.attempts : []))
  .map((a) => dayOf(a?.date))
  .filter((day) => day !== null);

/**
 * Every usable day a sitting was logged on, one entry per sitting, unordered.
 * The only reader of the attempt lists for these surfaces.
 *
 * Coding and mock attempts both live under `state.problems`; a finished design
 * run is an attempt under `state.designProblems`. `kinds: "problems"` leaves
 * the design runs out: the count a plan-history entry written before design was
 * counted was judged against, kept so an old week stays like-for-like.
 *
 * @param {{kinds?: "all"|"problems"|"with-ticks"}} [options]
 */
export function sittingDays(state, { kinds = "all" } = {}) {
  const days = recordedDays(state?.problems);
  if (kinds === "all" || kinds === WITH_TICKS) days.push(...recordedDays(state?.designProblems));
  return days;
}

/**
 * Days that hold counted tick credit, with each day's credit, in no particular order.
 * The only reader of `tickLog` for counting. Reads defensively: the log is synced and
 * importable, so a damaged entry counts nothing instead of throwing.
 *
 * @returns {{day: string, credit: number}[]}
 */
export function tickCreditDays(state) {
  const log = state?.tickLog;
  if (log === null || typeof log !== "object" || Array.isArray(log)) return [];
  return Object.entries(log).flatMap(([day, kinds]) => {
    if (exactDayOf(day) === null || kinds === null || typeof kinds !== "object") return [];
    const credit = TICKED_SITTING_KINDS.reduce((n, kind) => {
      const value = kinds[kind];
      // Capped on read because the log is hand-editable; the app itself never writes a credit above the ceiling.
      return n + (Number.isInteger(value) && value > 0 ? Math.min(value, MAX_ITEM_COUNT) : 0);
    }, 0);
    return credit > 0 ? [{ day, credit }] : [];
  });
}

/** Credit from the tick log on the days fromISO..toISO. */
const tickedSittingsBetween = (state, fromISO, toISO) => tickCreditDays(state)
  .filter(({ day }) => day >= fromISO && day <= toISO)
  .reduce((total, { credit }) => total + credit, 0);

/**
 * Sittings logged on the days fromISO..toISO, inclusive. Never throws.
 * The caller clamps `toISO` to today, which keeps future entries out.
 *
 * `kinds: "with-ticks"` adds the credit of hand-ticked topics from the tick
 * log; it is the only place that reads it for counting.
 *
 * @param {{kinds?: "all"|"problems"|"with-ticks"}} [options]
 */
export function sittingsBetween(state, fromISO, toISO, options) {
  if (exactDayOf(fromISO) === null || exactDayOf(toISO) === null) return 0;
  const logged = sittingDays(state, options).filter((day) => day >= fromISO && day <= toISO).length;
  return options?.kinds === WITH_TICKS ? logged + tickedSittingsBetween(state, fromISO, toISO) : logged;
}

/**
 * Sittings recorded over the seven days ending today, against what the week
 * asks for. The honest unit for "am I keeping to this".
 */
export function weekProgress(state, rawToday = todayISO()) {
  const week = weekPlan(state);
  const want = plannedWithTicks(week);
  // A window that ends on no day holds no sittings; the plan is still the plan (see planAdherence, TODO 91).
  const today = dayOf(rawToday);
  const got = today === null
    ? 0
    : sittingsBetween(state, addDaysISO(today, 1 - HOME_WINDOW_DAYS), today, { kinds: WITH_TICKS });
  return { want, got, week, onTrack: got >= want * ADHERENCE_KEPT_RATIO };
}

const SITTING_WORD = "sitting";
const SITTING_WORD_PLURAL = "sittings";

/**
 * "sitting" for exactly one, "sittings" otherwise: the unit the app counts a week in, written once. A person-facing
 * total is not only coding problems (design problems, deep sessions, rounds and ticked topics all count), so
 * calling it "problems" made a box saying 1 sit above a line saying 2. Expects the bounded integer
 * `plannedWithTicks` returns; it does not round or clamp. The count is not included so a view can mark it up alone.
 */
export const sittingsWord = (count) => (count === 1 ? SITTING_WORD : SITTING_WORD_PLURAL);

/**
 * Words for each slice of a week's total, [singular, plural]. The only copy: a view must not spell these itself.
 * The wording is a recommendation, untested on any person; reversing it means editing this table.
 */
const PART_WORDS = {
  coding: ["coding", "coding"],
  design: ["design", "design"],
  rounds: ["from rounds", "from rounds"],
  ticked: ["from a ticked topic", "from ticked topics"],
};

/**
 * The week's sittings split by kind, in a fixed order, zero parts left out. The counts sum to `plannedWithTicks`
 * because each part is read from the same planners it adds up, never recounted. Why it exists: with design days on,
 * the "Problems a week" box sets coding only, so a total of 2 beside a box of 1 needs its parts to be believable.
 *
 * @returns {{key: "coding"|"design"|"rounds"|"ticked", count: number}[]}
 */
export function sittingsBreakdown(week) {
  return [
    { key: "coding", count: weeklyProblems(week) },
    { key: "design", count: plannedDesignSittings(week) },
    { key: "rounds", count: plannedPairSittings(week) },
    { key: "ticked", count: plannedTickedSittings(week) },
  ].filter((part) => part.count > 0);
}

/** One part as words, singular for exactly one: "1 coding", "2 from ticked topics". Throws on a key it has no words for. */
export function sittingPartLabel({ key, count }) {
  // Own keys only: "constructor" or "toString" would otherwise resolve to an inherited function and print "1 undefined".
  const words = Object.hasOwn(PART_WORDS, key) ? PART_WORDS[key] : null;
  if (!words) throw new Error(`Unknown sitting part: ${key}`);
  return `${count} ${words[count === 1 ? 0 : 1]}`;
}
