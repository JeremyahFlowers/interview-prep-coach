// The record of which weekly problem count was in force from which Monday.
//
// Where this fits: saved state (`settings.weekHistory`) written only from here,
// read by adherence.js. It sits beside week.js (the plan itself) and never
// touches a view, the DOM or the clock: the caller passes "today" in.
//
// Why it exists. Adherence judges one number per week, `weeklyProblems`. With
// no record, every past week was judged against the plan as it is now, so
// lowering the plan after three bad weeks turned them into "kept" and the card
// stopped being truthful right after the person acted on its advice. Only the
// count is kept, not whole plans: a pair is tens of bytes, whole days would
// bloat every sync, and the count is all adherence judges.
//
// Invariants a reader must not break:
//  - An entry's `from` is the ISO Monday it took effect, or null for "in force
//    for as long as anyone knows" (a migrated log, whose true start is not
//    recoverable and must not be invented).
//  - A change on any day of a week takes effect for that whole week: someone
//    who lowers the plan on Thursday expects this week judged by the new plan.
//  - Writers only add or replace their own week's entry, so an entry written
//    on another device is never silently re-sorted away.

import { addDaysISO, exactDayOf, mondayOf, todayISO } from "./logic.js";
import { MAX_WEEK_COUNT, weekConfigured, weekPlan, weeklyProblems } from "./week.js";
import { plannedDesignSittings, plannedPairSittings, plannedTickedSittings } from "./sittings.js";

/** Most entries kept, so the synced file does not grow without bound. */
export const WEEK_HISTORY_KEEP = 26;

/**
 * `planned` is coding plus mocks, as it has been since the record began.
 * `design` is the design sittings the plan asked for; absent means the entry
 * was written before design was counted ("legacy"), which is not the same as 0.
 * `pair` is the round sittings the plan asked for; absent means 0, because the
 * log always counted a round's attempts, so an old entry is not a different unit.
 *
 * `ticked` is the hand-ticked topic sittings the plan asked for, written always,
 * 0 included: absent means ticks were not tracked when the entry was written,
 * which a 0 must be able to be told apart from.
 *
 * @typedef {{from: string|null, planned: number, design?: number, pair?: number, ticked?: number}} PlanEntry
 */

function isUsable(entry) {
  if (!entry || typeof entry !== "object") return false;
  const fromOk = entry.from === null || exactDayOf(entry.from) !== null;
  return fromOk && isCount(entry.planned);
}

/**
 * The counts a plan history entry records for the plan in force now. `pair` is
 * written only when above 0, so a plan with no round keeps the same bytes in
 * the synced file as before the field existed.
 */
function plannedCounts(state) {
  const plan = weekPlan(state);
  const pair = plannedPairSittings(plan);
  return {
    planned: weeklyProblems(plan), design: plannedDesignSittings(plan), ...(pair > 0 ? { pair } : {}),
    ticked: plannedTickedSittings(plan),
  };
}

const isCount = (n) => Number.isInteger(n) && n >= 0;

/** Optional count fields of an entry; the one list the damaged-field rule reads. */
const OPTIONAL_COUNTS = ["design", "pair", "ticked"];

/** Keeps the entry but drops damaged optional counts, so one bad field cannot lose a good `planned`. */
function withoutBadCounts(entry) {
  const bad = OPTIONAL_COUNTS.filter((key) => key in entry && !isCount(entry[key]));
  if (bad.length === 0) return entry;
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !bad.includes(key)));
}

/**
 * Bounds every count the entry holds to MAX_WEEK_COUNT. A huge count is "a lot", not damage, so the entry is kept
 * (dropping it would judge the week against an older plan); read-time only, like the item ceiling, so the stored
 * file is not rewritten until the next write goes through cleanHistory.
 */
function withBoundedCounts(entry) {
  const over = ["planned", ...OPTIONAL_COUNTS].filter((key) => entry[key] > MAX_WEEK_COUNT);
  return over.length === 0 ? entry : { ...entry, ...Object.fromEntries(over.map((key) => [key, MAX_WEEK_COUNT])) };
}

/**
 * Usable entries only, oldest first (null first), one per `from` (the last
 * wins). Never throws: a hand-edited or truncated file is dropped entry by
 * entry so one bad row cannot take the rest of the record with it.
 *
 * @returns {PlanEntry[]}
 */
export function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const byFrom = new Map();
  for (const entry of raw) if (isUsable(entry)) byFrom.set(entry.from, withBoundedCounts(withoutBadCounts(entry)));
  return [...byFrom.values()].sort((a, b) => {
    if (a.from === b.from) return 0;
    if (a.from === null) return -1;
    if (b.from === null) return 1;
    return a.from < b.from ? -1 : 1;
  });
}

/** The entry in force for a Monday: the newest whose `from` is not after it, or null. */
export function entryFor(history, weekStart) {
  const inForce = cleanHistory(history).filter((e) => e.from === null || e.from <= weekStart);
  return inForce.length ? inForce[inForce.length - 1] : null;
}

/**
 * Record this week's plan. Mutates `state`, for use inside store.mutate.
 *
 * Does nothing when the entry already in force holds the same counts, so an
 * edit that changes nothing does not churn the synced file. A legacy entry
 * (no `design`, or no `ticked`) for this very Monday is replaced even when
 * nothing changed: it was written before that was counted, and this week should
 * be judged on what is now.
 */
export function recordWeekPlan(state, today = todayISO()) {
  if (!weekConfigured(state) || exactDayOf(today) === null) return;
  const from = mondayOf(today);
  const counts = plannedCounts(state);
  const history = cleanHistory(state.settings.weekHistory);
  const inForce = entryFor(history, from);
  const legacyThisWeek = inForce?.from === from && (inForce.design === undefined || inForce.ticked === undefined);
  const same = inForce?.planned === counts.planned && (inForce.design ?? 0) === counts.design
    && (inForce.pair ?? 0) === (counts.pair ?? 0) && (inForce.ticked ?? 0) === counts.ticked;
  if (same && !legacyThisWeek) return;

  const next = [...history.filter((e) => e.from !== from), { from, ...counts }];
  state.settings.weekHistory = cleanHistory(next).slice(-WEEK_HISTORY_KEEP);
}

/**
 * Replace the week plan and record it. The one place a `settings.week` write
 * is allowed to happen, so the record cannot be forgotten by a new editor.
 */
export function setWeek(state, nextWeek, today = todayISO()) {
  state.settings.week = nextWeek;
  recordWeekPlan(state, today);
}

/**
 * The migration step: give a configured week a record, and drop unusable rows
 * from one that exists. Idempotent; a clean record is left as the same array.
 *
 * A new record is two entries. The `from: null` one is there because nobody
 * knows when the current plan began, and a date would be invented data. The
 * entry for this Monday is known: every later change goes through setWeek, so
 * weeks from now on can be "recorded" even if the plan is never edited again.
 * Without it the "measured against your current plan" caveat would never go
 * away for someone who does not change their plan.
 */
export function seedWeekHistory(state, today = todayISO()) {
  if (!weekConfigured(state)) return;
  const raw = state.settings.weekHistory;
  const cleaned = cleanHistory(raw);
  if (cleaned.length === 0) {
    const counts = plannedCounts(state);
    const seed = [{ from: null, ...counts }];
    if (exactDayOf(today) !== null) seed.push({ from: mondayOf(today), ...counts });
    state.settings.weekHistory = seed;
  } else if (!Array.isArray(raw) || JSON.stringify(raw) !== JSON.stringify(cleaned)) {
    state.settings.weekHistory = cleaned;
  }
}

/**
 * The schema-6 migration step: make design count for a record written before
 * it did.
 *
 * An old entry means "this was the coding-and-mock plan from `from` on", and
 * nobody can know what design plan was in force then, so it is left as it is
 * (adherence labels such weeks as counted the old way) and an entry from this
 * Monday is appended from the current plan. Every later change goes through
 * setWeek, so that entry is true. Without it, someone who never edits their
 * plan would be judged on the old count for ever. Idempotent: it does nothing
 * once the newest entry carries `design`.
 */
export function upgradeWeekHistory(state, today = todayISO()) {
  if (!weekConfigured(state) || exactDayOf(today) === null) return;
  const history = cleanHistory(state.settings.weekHistory);
  const newest = history[history.length - 1];
  if (!newest || newest.design !== undefined) return;
  const from = mondayOf(today);
  if (newest.from !== null && newest.from > from) return;

  const next = [...history.filter((e) => e.from !== from), { from, ...plannedCounts(state) }];
  state.settings.weekHistory = cleanHistory(next).slice(-WEEK_HISTORY_KEEP);
}

/**
 * The schema-7 migration step: give a plan that includes a two-mediums round
 * an entry that says so.
 *
 * Entries written before `pair` existed read as "no round planned", which is
 * false for someone who had added one, and nothing recorded when. Recording the
 * current plan from this Monday is the same move as any later edit, so it reuses
 * recordWeekPlan, which is idempotent. Plans with no round are not touched at
 * all, so migrating cannot churn anyone's synced file.
 */
export function upgradeWeekHistoryForRounds(state, today = todayISO()) {
  if (plannedPairSittings(weekPlan(state)) > 0) recordWeekPlan(state, today);
}

/**
 * The schema-8 migration step: make a ticked design topic count.
 *
 * Same move as upgradeWeekHistory: entries written before `ticked` existed stay
 * as written (adherence labels them), and an entry from this Monday is recorded
 * from the current plan so someone who never edits their plan is not judged the
 * old way for ever. It builds the entry itself rather than going through
 * recordWeekPlan, which deliberately leaves an unchanged older entry alone and
 * would therefore never mark ticks as tracked for a plan with no topic.
 * Idempotent: it does nothing once the newest entry carries `ticked`.
 */
export function upgradeWeekHistoryForTicks(state, today = todayISO()) {
  if (!weekConfigured(state) || exactDayOf(today) === null) return;
  const history = cleanHistory(state.settings.weekHistory);
  const newest = history.at(-1);
  if (!newest || newest.ticked !== undefined) return;
  const from = mondayOf(today);
  if (newest.from !== null && newest.from > from) return;

  const next = [...history.filter((e) => e.from !== from), { from, ...plannedCounts(state) }];
  state.settings.weekHistory = cleanHistory(next).slice(-WEEK_HISTORY_KEEP);
}
