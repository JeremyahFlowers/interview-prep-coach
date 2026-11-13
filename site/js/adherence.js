// Plan adherence: for each recent week, did you do what the plan asked?
//
// Where this fits: a pure reporting layer above week.js (the plan), prep.js
// (when the plan began) and logic.js (dates). It never reads the clock, never
// mutates state, and is shown by the Progress page.
//
// Why it exists. Home's "7 of 10 this week" is one rolling number, so a person
// who does 10, 2, 9, 1 looks fine on the best Sunday and terrible on the worst,
// and neither reading says they alternate. Weekly rows against the plan answer
// "am I keeping this?", and a run of missed weeks is the evidence that the plan,
// not the person, is the thing to change.
//
// Two honesty rules. The week that contains today is never judged: a Tuesday is
// not a failed week. And each past week is measured against the plan that was
// in force that week, from the record in week-history.js. A week the record
// cannot vouch for (a migrated log, or one older than the record) falls back to
// the plan as it is now and is labelled "assumed", so the card can say so.
//
// What starts the clock. A saved start date wins. Without one, the first logged
// sitting does, and so does a hand tick that falls in a week judged with ticks
// tracked; a tick in an older-scope week cannot, since it was never scored.

import { todayISO, addDaysISO, dayOf, exactDayOf, mondayOf } from "./logic.js";
import { weekPlan, ADHERENCE_KEPT_RATIO } from "./week.js";
import { prepOf } from "./prep.js";
import { plannedSittings, sittingDays, sittingsBetween, tickCreditDays, WITH_TICKS } from "./sittings.js";
import { entryFor, WEEK_HISTORY_KEEP } from "./week-history.js";

/** How many weeks the card looks back, the current one included. */
const ADHERENCE_WEEKS = 6;
/** Most weeks a caller may ask for: the plan record keeps WEEK_HISTORY_KEEP entries, so older weeks are all "assumed". */
const MAX_ADHERENCE_WEEKS = WEEK_HISTORY_KEEP;
/** Fewer judged weeks than this is not a pattern, so no verdict is offered. */
const ADHERENCE_MIN_WEEKS = 3;
/** Kept-share of judged weeks below which the plan may be bigger than the week. */
const TOO_BIG_BELOW = 0.5;
/** Judged weeks that must hold a logged sitting before the plan can be called too big; a tick is not one. */
const TOO_BIG_MIN_LOGGED_WEEKS = 1;
const DAYS_PER_WEEK = 7;

/** @typedef {"kept"|"missed"|"in-progress"|"not-started"} WeekStatus */
/** @typedef {"recorded"|"assumed"} PlanSource  recorded: the plan history vouches for the week; assumed: the current plan was used. */
/** @typedef {"with-ticks"|"sittings"|"problems"} AdherenceScope  with-ticks: sittings plus hand-ticked design topics, for a week an entry written once ticks were tracked decides; sittings: coding, mocks and design runs; problems: coding and mocks only, for a week an entry written before design counted decides. */
/** @typedef {{weekStart: string, planned: number, done: number, planSource: PlanSource, scope: AdherenceScope,
 *             ratio: number|null, status: WeekStatus}} AdherenceWeek */
/** @typedef {{weeks: AdherenceWeek[], judged: number, kept: number, run: number, loggedWeeks: number,
 *             startSaved: boolean}} AdherenceSummary  loggedWeeks: judged weeks holding a logged sitting (an attempt, mock or design run; never a tick).
 *             startSaved: a readable saved start date, not a logged sitting or a tick, began the plan clock. */

/** Which `sittingsBetween` kinds count as done for each scope, so both sides of a week's ratio share one unit. */
const DONE_KINDS = { problems: "problems", sittings: "all", "with-ticks": WITH_TICKS };

/** The same units as DONE_KINDS with hand ticks left out: what the person actually logged, in the week's own unit. */
const LOGGED_KINDS = { problems: "problems", sittings: "all", "with-ticks": "all" };

/** Only a finished week that started on or after the plan did is evidence either way; the week in progress is not. */
const isJudged = (status) => status === "kept" || status === "missed";

/** Days a sitting was logged on that have already happened. Future entries cannot belong to a past week. */
const sittingDaysUpTo = (state, today) => sittingDays(state).filter((day) => day <= today);

/**
 * Days that can start the plan clock when no start date is saved: logged sittings, plus hand-ticked days whose week
 * was judged with ticks tracked. A tick in an older-scope week is left out because the 2.18.0 migration seeded ticks
 * into weeks that never scored them, and starting there would mark those weeks missed. Reversing the rule means
 * returning `logged` alone (TODO 76).
 */
function planStartDays(state, history, today) {
  const logged = sittingDaysUpTo(state, today);
  const ticked = tickCreditDays(state)
    .map(({ day }) => day)
    .filter((day) => day <= today && scopeOf(entryFor(history, mondayOf(day))) === "with-ticks");
  return [...logged, ...ticked];
}

/** The prep start date if it is a real day, else null; the one reading of "was a start date saved?" that both the clock and `startSaved` use. */
const savedStartDay = (state) => exactDayOf(prepOf(state).startedOn) || null;

/**
 * The first week the plan can be judged from, or null if it has not begun: the saved start day if there is one, else
 * the earliest of `dates` (see `planStartDays` for what may start it).
 */
function planStartWeek(savedStart, dates) {
  const started = savedStart || dates.reduce((a, b) => (b < a ? b : a), dates[0]);
  return started ? mondayOf(started) : null;
}

function statusOf({ weekStart, planned, done }, { currentWeek, startWeek }) {
  if (startWeek === null || weekStart < startWeek) return "not-started";
  if (weekStart === currentWeek) return "in-progress";
  if (planned === 0) return "kept";
  return done >= planned * ADHERENCE_KEPT_RATIO ? "kept" : "missed";
}

/**
 * The unit a history entry judged its week in; no entry means the current plan stands in, measured in sittings.
 * Shared by `planFor` and the plan-start rule so both read "were ticks tracked that week?" the same way.
 *
 * @returns {AdherenceScope}
 */
function scopeOf(entry) {
  if (!entry) return "sittings";
  return entry.design === undefined ? "problems" : entry.ticked === undefined ? "sittings" : "with-ticks";
}

/**
 * What the plan asked of one week, in which unit, and whether the record said
 * so or we assumed.
 *
 * Falls back to the current plan when no entry reaches back that far. A
 * `from: null` seed is an assumption too: it means "as far back as anyone
 * knows", not a date the plan really began. An entry with no `design` was
 * written before design counted, so that week is measured in coding and mocks
 * only on both sides; mixing units would make a design-heavy week look done.
 * An entry with no `pair` is not a different unit: the log always counted a
 * round's attempts, so absent just means no round was planned. An entry with
 * no `ticked` was written before ticks were tracked, so no tick exists for that
 * week and counting the topic on the plan side alone would mark it missed.
 */
function planFor(weekStart, history, current) {
  const entry = entryFor(history, weekStart);
  if (!entry) return { planned: current, planSource: "assumed", scope: scopeOf(null) };
  return {
    planned: entry.planned + (entry.design ?? 0) + (entry.pair ?? 0) + (entry.ticked ?? 0),
    planSource: entry.from === null ? "assumed" : "recorded",
    scope: scopeOf(entry),
  };
}

/**
 * A caller's `weeks` as a whole number of weeks from 0 to MAX_ADHERENCE_WEEKS; anything unreadable is 0. An unbounded
 * count builds one row per week (a billion exhausts memory, Infinity never ends) and a fraction hands addDaysISO a
 * fractional day. Reversing this means restoring `Math.max(0, weeks)` in the loop (TODO 130).
 */
function lookBackWeeks(weeks) {
  let wanted;
  try {
    wanted = Math.floor(Number(weeks));
  } catch {
    // Number() throws on a Symbol, a prototype-less object and an object whose valueOf throws; none is a count.
    return 0;
  }
  return Number.isNaN(wanted) ? 0 : Math.min(Math.max(wanted, 0), MAX_ADHERENCE_WEEKS);
}

/**
 * The last `weeks` Monday-to-Sunday weeks, oldest first, each against the plan in force.
 *
 * Judging starts at the saved prep start date, else at the first logged sitting or hand-ticked topic from a week
 * judged with ticks tracked; before that every week is "not-started".
 *
 * @returns {AdherenceSummary}
 */
export function planAdherence(state, rawToday = todayISO(), weeks = ADHERENCE_WEEKS) {
  const savedStart = savedStartDay(state);
  // An injected clock is read like any stored date: a timestamp means its day, and anything else means no week at
  // all. Window arithmetic on a non-day gives NaN rows or throws, and the card is better told nothing than that.
  const today = dayOf(rawToday);
  if (today === null) return summarise([], savedStart);

  const currentPlanned = plannedSittings(weekPlan(state));
  const history = state?.settings?.weekHistory;
  const startDays = planStartDays(state, history, today);
  const context = { currentWeek: mondayOf(today), startWeek: planStartWeek(savedStart, startDays) };

  const rows = [];
  let loggedWeeks = 0;
  for (let i = lookBackWeeks(weeks) - 1; i >= 0; i--) {
    const weekStart = addDaysISO(context.currentWeek, -i * DAYS_PER_WEEK);
    const weekEnd = addDaysISO(weekStart, DAYS_PER_WEEK - 1);
    const { planned, planSource, scope } = planFor(weekStart, history, currentPlanned);
    const end = weekEnd < today ? weekEnd : today;
    const done = sittingsBetween(state, weekStart, end, { kinds: DONE_KINDS[scope] });
    const logged = sittingsBetween(state, weekStart, end, { kinds: LOGGED_KINDS[scope] });
    const status = statusOf({ weekStart, planned, done }, context);
    rows.push({
      weekStart, planned, done, status, planSource, scope,
      ratio: planned > 0 && status !== "not-started" ? done / planned : null,
    });
    if (logged > 0 && isJudged(status)) loggedWeeks += 1;
  }

  return summarise(rows, savedStart, loggedWeeks);
}

/** Builds the summary from its rows, so the empty summary of an unreadable clock cannot drift from the real shape. */
function summarise(rows, savedStart, loggedWeeks = 0) {
  const judgedRows = rows.filter((w) => isJudged(w.status));
  let run = 0;
  for (let i = judgedRows.length - 1; i >= 0 && judgedRows[i].status === "kept"; i--) run += 1;
  return {
    weeks: rows,
    judged: judgedRows.length,
    kept: judgedRows.filter((w) => w.status === "kept").length,
    run,
    loggedWeeks,
    startSaved: savedStart !== null,
  };
}

/** Enough full weeks are judged and under half were kept: the one shared test behind both notes on the card. */
const fellShort = ({ judged, kept }) => judged >= ADHERENCE_MIN_WEEKS && kept / judged < TOO_BIG_BELOW;

/**
 * Whether to suggest the plan is larger than the person's real week.
 *
 * Silent below ADHERENCE_MIN_WEEKS judged weeks: one bad week is not a pattern. Also silent until a judged week holds a
 * logged sitting: a hand tick says "I studied a topic", not "this is all the week I have", so weeks that only ever held
 * ticks (or nothing) are no evidence about capacity. Reversing this means dropping the `loggedWeeks` clause (TODO 101).
 *
 * @param {{judged: number, kept: number, loggedWeeks?: number}} summary
 */
export function planLooksTooBig(summary) {
  const { loggedWeeks } = summary;
  const hasLoggedWeeks = Number.isInteger(loggedWeeks) && loggedWeeks >= TOO_BIG_MIN_LOGGED_WEEKS;
  return hasLoggedWeeks && fellShort(summary);
}

/**
 * Whether to say that nothing is logged: the person saved a start date, enough weeks went by with under half kept, and
 * no judged week holds a logged sitting. It claims only what the card can see, never that the plan is too big, since an
 * empty log is no evidence of capacity (TODO 101). `loggedWeeks === 0` keeps it disjoint from `planLooksTooBig`. A
 * recommendation, not an owner decision: returning `false` here restores the 2.26.0 card (TODO 102).
 *
 * @param {{judged: number, kept: number, loggedWeeks?: number, startSaved?: boolean}} summary
 */
export function nothingLoggedNote(summary) {
  return summary.startSaved === true && summary.loggedWeeks === 0 && fellShort(summary);
}
