// The week, as a shape somebody agrees to once.
//
// Where this fits: above prep.js, which says what you are preparing for, and
// below the dashboard, which asks it what today is. prep.js answers "how much
// and how hard"; this answers "on which days, and doing what".
//
// Why a week and not a day. A daily minute budget cannot express the thing
// people actually plan — "two problems Monday, one plus a design topic
// Tuesday, and Saturday is the long design day" — and it cannot express a rest
// day at all, so every day off reads as a failure. A week can hold all of
// that, and it is also the unit people think in: eight problems a week is a
// commitment somebody can keep, where "75 minutes a day" is one they will
// break on the first Thursday they work late.
//
// Two rules hold the design together:
//
//   * **A day is a small list of items, not a duration.** "Two problems" is
//     something you can finish; "sixty minutes" is something you can sit
//     through. The minute band from prep.js stays, as the guard rail it always
//     was — it says when to stop, not what to do.
//   * **The template is a starting point, never a cage.** Every generated week
//     is editable per day, and an edited week is stored whole rather than as a
//     diff against a template that might later change under it.

import { todayISO, daysBetween, exactDayOf, isRecord } from "./logic.js";
import { REFRESHER_INTENSITY, intensityByKey } from "./prep.js";
import { clarifyToday } from "./clarify.js";
import { pairMocksToday } from "./pair-mock.js";

/** Monday first: the week people plan in starts on Monday, whatever
 *  Date.getDay() thinks. */
export const DAYS = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

/**
 * What a day can be asked to hold.
 *
 * Deliberately few. A planner with twenty kinds of session is a planner nobody
 * fills in, and every one of these is something the app can actually start for
 * you — which is the test for whether it earns a place here.
 */
export const ITEM_KINDS = {
  coding: {
    key: "coding", label: "Coding problems", unit: "problem",
    blurb: "Worked under the clock, then reflected on.",
    countable: true, defaultCount: 2, minutesEach: 35,
  },
  mock: {
    key: "mock", label: "Coding mock", unit: "mock",
    blurb: "Spoken out loud, counting down, no hints.",
    countable: true, defaultCount: 1, minutesEach: 45,
  },
  designStudy: {
    key: "designStudy", label: "Design topic", unit: "topic",
    blurb: "One component or pattern read properly, not a whole system.",
    countable: true, defaultCount: 1, minutesEach: 30,
  },
  designProblem: {
    key: "designProblem", label: "Design problem", unit: "problem",
    blurb: "A full staged run: requirements through deep dives.",
    countable: true, defaultCount: 1, minutesEach: 45,
  },
  designMock: {
    key: "designMock", label: "Design deep session", unit: "session",
    blurb: "The long one. Two blocks with a break: a system end to end, then stress-tested.",
    countable: false, defaultCount: 1, minutesEach: 180,
  },
  pairMock: {
    key: "pairMock", label: "Two-mediums mock", unit: "round",
    blurb: "Two mediums in forty-five minutes — the pace some top-tier rounds run at.",
    countable: false, defaultCount: 1, minutesEach: 55,
  },
  clarify: {
    key: "clarify", label: "Clarify drill", unit: "prompt",
    blurb: "A vague prompt: the questions to ask before writing a line.",
    countable: true, defaultCount: 2, minutesEach: 5,
  },
  drill: {
    key: "drill", label: "Pattern drill", unit: "drill",
    blurb: "Recall only — which pattern is this, and why.",
    countable: true, defaultCount: 1, minutesEach: 10,
  },
  rest: {
    key: "rest", label: "Rest", unit: "",
    blurb: "Genuinely off. A week with no rest day is a week somebody abandons in three.",
    countable: false, defaultCount: 0, minutesEach: 0,
  },
};

// Own keys only: "toString" or "constructor" in a hand-edited file must not resolve to an Object.prototype member.
export const itemKind = (key) => (Object.hasOwn(ITEM_KINDS, key) ? ITEM_KINDS[key] : null);

const MINUTES_PER_HOUR = 60;
/** Hours in a day; exported so the Settings wording and the minutes cap cannot disagree. */
export const HOURS_PER_DAY = 24;

/**
 * The most one day of the plan can add up to: the minutes in a day.
 *
 * A recommendation, reversible in one line (set it to `Infinity`). It is the one bound that needs no guess about how
 * much study is reasonable, and `MAX_ITEM_COUNT` cannot supply it: several items at their own cap still add up to days.
 * No week the app builds comes near it. Applied when read, never to the stored week, so a hand edit stays recoverable.
 */
export const MAX_DAY_MINUTES = HOURS_PER_DAY * MINUTES_PER_HOUR;

// Same rule as normalizeItem: a count that is not a whole number of zero or more is ignored for the kind's default.
// dayMinutes may be handed a week weekPlan has not repaired, and NaN or a negative count would escape the cap.
const usableCount = (count, fallback) => (Number.isInteger(count) && count >= 0 ? count : fallback);

/**
 * How many of its kind a plan item asks for: the kind's default when the count is absent or not a whole number of zero or
 * more, 1 for a kind that is not countable or not known. The one place a plan item's count is read for meaning, so the day,
 * the week, today's progress and the Settings box cannot disagree about what an absent or unusable count means.
 */
export function itemCount(item) {
  const kind = itemKind(item?.kind);
  return kind?.countable ? usableCount(item.count, kind.defaultCount) : 1;
}

// The week's day list, or [] for anything that is not one: weekPlan repairs `days`, but a caller can hold a week it has not.
const daysOf = (week) => (Array.isArray(week?.days) ? week.days : []);

// The one place an item is priced. Everything that asks what a day costs goes through it, so they cannot disagree.
const minutesOfItem = (item) => {
  const kind = itemKind(item?.kind);
  return kind ? kind.minutesEach * itemCount(item) : 0;
};

// The one place a day's items are summed. dayMinutes, dayIsCapped and dayIsFull all read it.
const rawDayMinutes = (day) => (Array.isArray(day?.items) ? day.items : []).reduce((n, item) => n + minutesOfItem(item), 0);

/** Minutes a day's items are expected to take, never more than the day itself holds. */
export const dayMinutes = (day) => Math.min(rawDayMinutes(day), MAX_DAY_MINUTES);

/** True when the day's items add up to more than a day holds, so dayMinutes is showing less than was asked for. */
export const dayIsCapped = (day) => rawDayMinutes(day) > MAX_DAY_MINUTES;

/** True when the day's items already add up to a whole day, so nothing more can be added to it. */
export const dayIsFull = (day) => rawDayMinutes(day) >= MAX_DAY_MINUTES;

// Minutes a day has left once `item` is taken out of it: the one place that is worked out, so a count box and a kind switch
// cannot price the rest of a day two ways. Negative on a day already over the cap.
const roomWithout = (day, item) => MAX_DAY_MINUTES - (rawDayMinutes(day) - minutesOfItem(item));

/**
 * The count to store when someone types `wanted` for the item at `index` of `day`: what they typed if it fits, otherwise the
 * most that does. Never refuses to lower a count, so an over-full day can always be repaired, and never takes an item below
 * what it already holds. Anything it cannot price (a damaged day, a missing or uncountable item) is handed back unchanged.
 */
export function countThatFits(day, index, wanted) {
  const item = Array.isArray(day?.items) && Number.isInteger(index) ? day.items[index] : undefined;
  const kind = itemKind(item?.kind);
  if (!kind?.countable || !Number.isInteger(wanted)) return wanted;
  const current = itemCount(item);
  if (wanted <= current) return wanted;
  return Math.min(wanted, Math.max(current, Math.floor(roomWithout(day, item) / kind.minutesEach)));
}

/** Separates the day from the item index in a week-editor control's slot text ("mon:2"). */
const SLOT_SEPARATOR = ":";

/**
 * A plain whole number with no sign, point, exponent, prefix or leading zero. Strict on purpose: Number() reads "", "x",
 * "-1" and "1e0" as an item the markup never named, and the markup only ever writes the digits of a loop index.
 */
const SLOT_INDEX = /^(?:0|[1-9][0-9]*)$/;

/**
 * Reads a week-editor slot ("mon:2") into its day name and item index. `index` is null unless the text after the first
 * separator is a plain whole number, so a damaged slot names no item instead of item 0 or the last one. Never throws.
 */
export function parseSlot(ref) {
  if (typeof ref !== "string") return { day: "", index: null };
  const cut = ref.indexOf(SLOT_SEPARATOR);
  if (cut < 0) return { day: ref, index: null };
  const digits = ref.slice(cut + SLOT_SEPARATOR.length);
  const index = SLOT_INDEX.test(digits) ? Number(digits) : null;
  return { day: ref.slice(0, cut), index: Number.isSafeInteger(index) ? index : null };
}

/** True when `index` names an item that exists in `day`: the one thing a kind switch needs before it can replace anything. */
export function hasItemAt(day, index) {
  if (!Array.isArray(day?.items) || !Number.isInteger(index)) return false;
  const item = day.items[index];
  return typeof item === "object" && item !== null;
}

/**
 * The item to store when someone picks `kindKey` for the item at `index` of `day`: the kind's default, with the count lowered
 * to the most that fits the day, or null when not even one fits and the switch would make the day longer. Rest is never
 * refused, and neither is a switch that costs no more than the item it replaces, so an over-full day can always be repaired.
 * A kind that is unknown or cannot be counted gives null; a day it cannot read gives the plain default. An index that names
 * no item is priced as an addition.
 */
export function kindSwitchFits(day, index, kindKey) {
  if (kindKey === "rest") return { kind: "rest" };
  // typeof first: itemKind coerces, so ["coding"] would otherwise resolve to the coding kind.
  const kind = typeof kindKey === "string" ? itemKind(kindKey) : null;
  if (!kind?.countable) return null;
  const plain = { kind: kind.key, count: kind.defaultCount };
  // A day that cannot be read cannot be priced. An index that names no item (stale after a drop) is an addition: it costs
  // nothing to take out, so the whole day is the bound.
  if (!Array.isArray(day?.items)) return plain;
  const old = Number.isInteger(index) ? day.items[index] : undefined;
  const fitting = Math.floor(roomWithout(day, old) / kind.minutesEach);
  if (fitting >= 1) return { ...plain, count: Math.min(plain.count, fitting) };
  return minutesOfItem(plain) <= minutesOfItem(old) ? plain : null;
}

/** How many of one kind a whole week asks for. */
export function weeklyCount(week, kindKey) {
  // A synced file can hold a null day or item, or items that are not a list; skip them rather than crash Home.
  return daysOf(week).reduce((n, day) => n + (Array.isArray(day?.items) ? day.items : [])
    .filter((i) => i?.kind === kindKey)
    .reduce((m, i) => m + itemCount(i), 0), 0);
}

export const weeklyProblems = (week) => weeklyCount(week, "coding") + weeklyCount(week, "mock");
export const weeklyMinutes = (week) => daysOf(week).reduce((n, d) => n + dayMinutes(d), 0);

const rest = (key) => ({ day: key, items: [{ kind: "rest" }] });
const coding = (key, count, extra = []) => ({ day: key, items: [{ kind: "coding", count }, ...extra] });

/** The share of a heavy-weekend week that lands on Saturday and Sunday. */
const WEEKEND_SHARE = 0.6;

/**
 * The least a heavy weekend asks for when the week has problems to give it, so two problems stay a Saturday and a
 * Sunday rather than a one-plus-one split. Capped by the week's own number: the box says what the person can do, and
 * a plan that asks for more than they typed is how a week gets missed.
 */
const WEEKEND_MIN_PROBLEMS = 2;

/**
 * A design session a shape places whatever "Design days a week" says. Written once, here: the builder places it and
 * Settings names it, both through `fixedDesignOf`, so the line under the box cannot describe a different week.
 */
const SATURDAY_DEEP_SESSION = Object.freeze({ day: "sat", kind: "designMock" });

/**
 * The shapes people actually keep to.
 *
 * Each one is a function of how much coding a week should hold and whether
 * design is part of the picture, so the same shape scales from four problems a
 * week to twelve without becoming a different plan.
 *
 * `maxDesignDays` is the most design days `build` places for `design.perWeek`. It is data rather than a probe build so a
 * reader can see it; test/design-days-placed.test.js builds every shape and fails if a builder disagrees.
 */
export const WEEK_TEMPLATES = [
  {
    key: "weekdays", label: "Weekdays, weekend off",
    maxDesignDays: 2,
    blurb: "Five working days, both weekend days genuinely free.",
    build: ({ problems, design }) => {
      const designDays = design.perWeek > 0 ? ["tue", "thu"].slice(0, design.perWeek) : [];
      const spread = spreadOver(["mon", "tue", "wed", "thu", "fri"], problems, { light: designDays });
      const days = DAYS.map((d) => {
        if (d.key === "sat" || d.key === "sun") return rest(d.key);
        const extra = designDays.includes(d.key) ? [{ kind: design.kind, count: 1 }] : [];
        return coding(d.key, spread[d.key], extra);
      });
      return { days };
    },
  },
  {
    key: "weekdaysPlusDesign", fixedDesign: SATURDAY_DEEP_SESSION, label: "Weekdays, plus a design Saturday",
    maxDesignDays: 2,
    blurb: "Coding Monday to Friday, with design folded into two of them, and one long design session at the weekend.",
    build: ({ problems, design }) => {
      // Tuesday reads a topic, Thursday works a whole problem: the study comes
      // before the thing it is studied for.
      const designDays = design.perWeek > 0 ? ["tue", "thu"].slice(0, design.perWeek) : [];
      const spread = spreadOver(["mon", "tue", "wed", "thu", "fri"], problems, { light: designDays });
      const fixed = fixedDesignOf("weekdaysPlusDesign");
      const days = DAYS.map((d) => {
        if (d.key === "sun") return rest(d.key);
        if (d.key === fixed.day) return { day: fixed.day, items: [{ kind: fixed.kind }] };
        const extra = designDays.includes(d.key)
          ? [{ kind: d.key === "tue" ? "designStudy" : "designProblem", count: 1 }] : [];
        return coding(d.key, spread[d.key], extra);
      });
      return { days };
    },
  },
  {
    key: "everyOther", label: "Every other day",
    maxDesignDays: 1,
    blurb: "Fewer, longer sittings. Suits a week that will not give you an hour every evening.",
    build: ({ problems, design }) => {
      const on = ["mon", "wed", "fri", "sat"];
      const spread = spreadOver(on, problems);
      return {
        days: DAYS.map((d) => {
          if (!on.includes(d.key)) return rest(d.key);
          const extra = design.perWeek > 0 && d.key === "sat"
            ? [{ kind: design.kind, count: 1 }] : [];
          return coding(d.key, spread[d.key], extra);
        }),
      };
    },
  },
  {
    key: "weekendHeavy", label: "Light weekdays, heavy weekend",
    maxDesignDays: 1,
    blurb: "A drill or one problem on working days, and the real work on Saturday and Sunday.",
    build: ({ problems, design }) => {
      const weekend = Math.min(problems, Math.max(WEEKEND_MIN_PROBLEMS, Math.round(problems * WEEKEND_SHARE)));
      const weekday = Math.max(0, problems - weekend);
      // Monday off, because it is the day after the heavy weekend. A shape
      // whose light days are still every day is not a light week.
      const working = ["tue", "wed", "thu", "fri"];
      const spreadWeek = spreadOver(working, weekday);
      const spreadEnd = spreadOver(["sat", "sun"], weekend);
      return {
        days: DAYS.map((d) => {
          if (d.key === "mon") return rest("mon");
          if (d.key === "sat" || d.key === "sun") {
            const extra = design.perWeek > 0 && d.key === "sat" ? [{ kind: design.kind, count: 1 }] : [];
            return coding(d.key, spreadEnd[d.key], extra);
          }
          if (!spreadWeek[d.key]) return { day: d.key, items: [{ kind: "drill", count: 1 }] };
          return coding(d.key, spreadWeek[d.key]);
        }),
      };
    },
  },
  {
    key: "daily", label: "A little every day",
    maxDesignDays: 1,
    blurb: "Seven short days. The most forgiving shape, and the one that builds a habit fastest.",
    build: ({ problems, design }) => {
      const spread = spreadOver(DAYS.map((d) => d.key), problems);
      return {
        days: DAYS.map((d) => {
          const extra = design.perWeek > 0 && d.key === "sun" ? [{ kind: design.kind, count: 1 }] : [];
          return spread[d.key] ? coding(d.key, spread[d.key], extra)
            : { day: d.key, items: [{ kind: "drill", count: 1 }, ...extra] };
        }),
      };
    },
  },
];

export const templateByKey = (key) => WEEK_TEMPLATES.find((t) => t.key === key) || WEEK_TEMPLATES[0];

/**
 * The design session a shape always places, as a frozen `{ day, kind }`, or null when it has none. An unknown key reads
 * as the default shape, as `templateByKey` does.
 */
export const fixedDesignOf = (templateKey) => templateByKey(templateKey).fixedDesign ?? null;

/** A day carrying design work takes one problem, not two. */
export const LIGHT_DAY_PROBLEMS = 1;

/**
 * Hand out n problems across the given days.
 *
 * Whole numbers, never an average: two on Monday and one on Tuesday is a plan
 * somebody follows, and 1.6 every day is a rounding error they have to resolve
 * every morning.
 *
 * Days named `light` are the ones already carrying something else — a design
 * topic, a deep dive — and they are capped first, so the coding load moves off
 * them and onto the days that have room. Without that the design days become
 * the heaviest days of the week, which is how design quietly stops happening.
 */
function spreadOver(dayKeys, n, { light = [] } = {}) {
  const out = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  const lightSet = new Set(light.filter((k) => dayKeys.includes(k)));
  const heavy = dayKeys.filter((k) => !lightSet.has(k));
  let left = Math.max(0, n);

  for (const k of lightSet) {
    const take = Math.min(LIGHT_DAY_PROBLEMS, left);
    out[k] = take;
    left -= take;
  }
  const order = heavy.length ? heavy : dayKeys;
  for (let i = 0; left > 0 && i < left + order.length * (n + 1); i++) {
    out[order[i % order.length]] += 1;
    left -= 1;
  }
  return out;
}

/**
 * The share of a day that is actually new problems.
 *
 * A day is not all core work: it opens with a warm-up and ends with the review,
 * and the review is the part that teaches. Costing the whole day against
 * problems is how an estimate tells somebody with ninety minutes that they can
 * do eighteen problems a week, which is both wrong and exactly the
 * over-committing this app exists to argue against. Matches the core share of
 * the block shape in prep.js.
 */
const CORE_SHARE = 0.53;

/** Roughly how many problems a week a band supports, once the warm-up and the
 *  review are paid for. */
export function problemsForBand(band, codingDaysPerWeek = 5) {
  const perDay = ((band.min + band.max) / 2) * CORE_SHARE;
  const each = ITEM_KINDS.coding.minutesEach;
  return Math.max(1, Math.round((perDay * codingDaysPerWeek) / each));
}

/** Days in a week that ask for a coding problem at all — the only days the
 *  estimate above should be spread over. */
export function codingDays(week) {
  return (week?.days || []).filter((d) => (d.items || [])
    .some((i) => i.kind === "coding" || i.kind === "mock")).length;
}

export const DEFAULT_WEEK = {
  template: "weekdays",
  problems: 8,
  design: { perWeek: 0, kind: "designStudy" },
  days: null,          // null means "derive from the template"
};

/** Whether somebody has set up a week at all. Until they have, nothing reads
 *  from it: the dashboard's day card and the day's gating of the coding
 *  recommendation both stay out of the way. */
export function weekConfigured(state) {
  return !!state?.settings?.week;
}

export function weekSettings(state) {
  return { ...DEFAULT_WEEK, ...(state?.settings?.week || {}) };
}

/**
 * The most of one item a week can ask for. 40 is the Settings form's own maximum for problems a week, so it is the
 * smallest ceiling that cannot shrink a week the app can build (the largest template item is 13); the editor's old
 * 9 would. A recommendation, not a measured limit: change it here and the form and editor follow.
 */
export const MAX_ITEM_COUNT = 40;

/**
 * The most a week can ask for if every day holds one maximal item: DAYS.length * MAX_ITEM_COUNT, so it has no reason
 * of its own and moves with the 40. It bounds the counts in the plan-history record, whose entries a hand edit can
 * make absurd. A week with several maximal items on one day could legitimately sum above it and would be recorded as
 * this; that trade keeps the record bounded without dropping the week. A recommendation, like the 40.
 */
export const MAX_WEEK_COUNT = DAYS.length * MAX_ITEM_COUNT;

/**
 * A whole number from 1 to MAX_ITEM_COUNT from whatever the editor or a file hands over.
 *
 * Infinity clamps to the ceiling rather than to 1: whoever typed "a lot" meant a lot. Only numbers and numeric
 * strings are read (the editor passes the input's text), so an array like [5] is not quietly taken as 5.
 */
export function clampItemCount(value) {
  const n = typeof value === "number" || typeof value === "string" ? Math.floor(Number(value)) : NaN;
  if (Number.isNaN(n)) return 1;
  return Math.min(MAX_ITEM_COUNT, Math.max(1, n));
}

/**
 * How many problems a week the plan really uses for a stored `problems` setting: a whole number, 0..MAX_ITEM_COUNT.
 *
 * One rule for the plan and for the Settings box, so the box cannot show 9999 above a plan of 40. The builders sit
 * outside normalizeItem's clamp and `spreadOver` loops once per problem, so a hand-edited 1e9 printed a 3,000-problem
 * day and Infinity never returned: the ceiling is the Settings form's own maximum. A fraction rounds up because that
 * is what `spreadOver` does with one (2.4 builds 3). Read through `Number`, as the builders always did, so a week
 * that builds today builds the same; anything that is not a number is 0 (not 1, unlike clampItemCount: a week with no
 * problems is a real answer, an item of zero is not an item).
 *
 * Every shape builds exactly this many, including `weekendHeavy`, whose weekend floor is capped by it.
 */
export function problemsInForce(value) {
  const n = Math.ceil(Number(value));
  return Number.isNaN(n) ? 0 : Math.min(MAX_ITEM_COUNT, Math.max(0, n));
}

/** A week has seven days, so that is the most design days it can hold. */
export const MAX_DESIGN_DAYS = DAYS.length;

/**
 * How many design days a week the plan reads from a stored `design.perWeek`: a whole number, 0..MAX_DESIGN_DAYS.
 *
 * One rule for the Settings box and for what Apply stores, so the box cannot show 9999 above a plan that uses two.
 * A fraction rounds down because that is what the weekday templates do (`slice` truncates); the other templates only
 * ask whether it is above 0, so the two differ for a value between 0 and 1, which only a hand-edited file holds.
 * Only numbers and numeric strings are read, so an array like [3] is not quietly taken as 3; anything else is 0.
 */
export function designDaysInForce(value) {
  const n = typeof value === "number" || typeof value === "string" ? Math.floor(Number(value)) : NaN;
  return Number.isNaN(n) ? 0 : Math.min(MAX_DESIGN_DAYS, Math.max(0, n));
}

/**
 * The design days a shape really places for a stored setting: `designDaysInForce` capped at the shape's
 * `maxDesignDays`.
 *
 * The builders already ignore the excess, so a typed 5 on a two-day shape builds the same week as 2; this is the one
 * place that says so, so the box, the hint and what Apply stores cannot show a figure the week does not use.
 */
export function designDaysPlaced(templateKey, value) {
  return Math.min(designDaysInForce(value), templateByKey(templateKey).maxDesignDays);
}

/** What the hint says for a shape that places several, one, or no design days. */
const hintUpTo = (n) => `This shape places up to ${n} design days a week.`;
const hintOne = "This shape places 1 design day a week.";
const hintNone = "This shape places no design days.";

/**
 * The sentence under the volume form saying how many design days the shape places. It speaks of what this box
 * controls: `weekdaysPlusDesign` also carries a Saturday design session that the box does not, so the wording says
 * "places", never that the week holds only that many.
 */
export function designDaysHint(templateKey) {
  const n = templateByKey(templateKey).maxDesignDays;
  if (n === 0) return hintNone;
  return n === 1 ? hintOne : hintUpTo(n);
}

/**
 * The two stored numbers for the raw values of the volume form's boxes (text from the form, or a number).
 *
 * Separate from `problemsInForce` because that reads a stored value, where an empty string is 0; a box the person left
 * empty means "I did not answer", so it takes the default and only a typed (or given) number is read. A typed 0 stays 0.
 */
export function volumeFromInput({ problems, designPerWeek } = {}) {
  return {
    problems: answeredNumber(problems) ? problemsInForce(problems) : DEFAULT_WEEK.problems,
    perWeek: answeredNumber(designPerWeek) ? designDaysInForce(designPerWeek) : 0,
  };
}

/**
 * Whether a box holds an answer that reads as a number: a finite number, or text that reads as one (blank, whitespace
 * and words do not). Text keeps its older, looser test, so "Infinity" still reads and clamps; a number must be finite,
 * because a computed NaN or infinity is a bug upstream, not an answer.
 */
const answeredNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value));
};

/** A tally with nothing repaired: the answer for a week that is built, not stored. */
const noRepairs = () => ({ unreadableDays: 0, droppedItems: 0, countsRemoved: 0, countsClamped: 0 });

/**
 * A usable item, or null, and which count repair (if any) it needed.
 *
 * Unknown kinds are kept: an older build that edits a week written by a newer one must not delete the newer build's
 * item. The repair is reported here, beside the rule that makes it, so the tally in auditWeekDays cannot disagree
 * with what was done.
 */
function normalizeItem(item) {
  if (!isRecord(item) || typeof item.kind !== "string" || item.kind === "") return { item: null };
  if (!itemKind(item.kind)?.countable || !("count" in item)) return { item: { ...item } };
  const { count, ...rest } = item;
  // A bad count is removed rather than guessed, so the kind's default applies.
  // Zero is valid: the templates write it for a light day that asks for none.
  if (!Number.isInteger(count) || count < 0) return { item: rest, countRemoved: true };
  // Clamped, not dropped: an over-large count is "a lot", and dropping it would quietly become the default.
  return count > MAX_ITEM_COUNT
    ? { item: { ...item, count: MAX_ITEM_COUNT }, countClamped: true }
    : { item: { ...item } };
}

/**
 * Seven well-formed days in DAYS order from whatever a synced file holds, and a tally of what had to be repaired.
 *
 * Pure and read-time only: the stored week is never rewritten by a load, so a hand-edit stays recoverable until the
 * person edits the week. Applied in weekPlan so no reader has to guard separately — guarding each reader already
 * failed once, leaving five of them to throw.
 *
 * The tally counts what was left out or changed, not what is merely empty: a readable day with no usable items is
 * how the app itself writes a rest day. An entry that is not used (not a record, a repeated day, a key that is not a
 * day) counts once as an unreadable day and its items are not counted again.
 */
export function auditWeekDays(days) {
  const repairs = noRepairs();
  const seen = new Map();
  for (const day of Array.isArray(days) ? days : []) {
    if (!isRecord(day) || seen.has(day.day) || !DAYS.some((d) => d.key === day.day)) {
      repairs.unreadableDays += 1;
      continue;
    }
    const listed = Array.isArray(day.items);
    if ("items" in day && !listed) repairs.droppedItems += 1;
    const items = [];
    for (const raw of listed ? day.items : []) {
      const { item, countRemoved, countClamped } = normalizeItem(raw);
      if (!item) repairs.droppedItems += 1;
      else items.push(item);
      if (countRemoved) repairs.countsRemoved += 1;
      if (countClamped) repairs.countsClamped += 1;
    }
    seen.set(day.day, items.length ? { day: day.day, items } : null);
  }
  return { days: DAYS.map((d) => seen.get(d.key) || rest(d.key)), repairs };
}

/** Seven well-formed days in DAYS order from whatever a synced file holds; see auditWeekDays. */
export const normalizeWeekDays = (days) => auditWeekDays(days).days;

/** The sum of a repairs tally: how many things were left out or changed. */
export const repairTotal = (repairs) => Object.values(repairs).reduce((n, v) => n + v, 0);

/**
 * Whether a stored `days` value is a whole edited week. The one rule weekPlan, weekRepairs and ignoredStoredWeek share,
 * so they cannot disagree about which stored values are in use; anything else is rebuilt from the shape.
 */
const storedWeekIsUsable = (days) => Array.isArray(days) && days.length === DAYS.length;

/** Whether the stored week is a whole edited one; anything else is rebuilt from the shape and nothing is repaired. */
const isEditedWeek = (settings) => storedWeekIsUsable(settings.days);

/** The `reason` values of ignoredStoredWeek. */
const IGNORED_WEEK_REASONS = Object.freeze({ wrongLength: "wrong_length", notAList: "not_a_list" });

/**
 * Why a stored week that is present was not used: `{ reason, entries }`, or null when it is used or absent. `entries`
 * is the list's length for a wrong-length list and null for a value that is not a list. Describes the length and never
 * the contents, which a damaged file can make arbitrary. Pure; never writes the state. Throws only where weekSettings
 * does, for a state no JSON can produce (a throwing getter).
 */
export function ignoredStoredWeek(state) {
  const days = weekSettings(state).days;
  if (days === null || days === undefined || storedWeekIsUsable(days)) return null;
  if (Array.isArray(days)) return { reason: IGNORED_WEEK_REASONS.wrongLength, entries: days.length };
  return { reason: IGNORED_WEEK_REASONS.notAList, entries: null };
}

/**
 * What reading the stored week repaired, by kind: all zeros unless the week is edited, because a built week is
 * produced by the app and holds nothing a hand edit could have damaged. Pure; never writes the state.
 */
export function weekRepairs(state) {
  const settings = weekSettings(state);
  return isEditedWeek(settings) ? auditWeekDays(settings.days).repairs : noRepairs();
}

/**
 * The week in force.
 *
 * An edited week is stored whole and wins outright. Otherwise it is built from
 * the template each time, so changing the problem count or turning design on
 * reshapes the week rather than leaving a stale copy behind.
 */
export function weekPlan(state) {
  const settings = weekSettings(state);
  if (isEditedWeek(settings)) {
    return { days: normalizeWeekDays(settings.days), template: settings.template, edited: true };
  }
  const built = templateByKey(settings.template).build({
    problems: problemsInForce(settings.problems),
    design: settings.design || DEFAULT_WEEK.design,
  });
  return { ...built, template: settings.template, edited: false };
}

/**
 * The shape the light week is built from: the app's own default, so "rebuild it from a shape" keeps working on it
 * and the week editor opens on a shape the person already knows.
 */
export const REFRESHER_TEMPLATE = "weekdays";

/** Days that shape places coding on; the band's per-day figure is spread over this many. */
const REFRESHER_CODING_DAYS = 5;

/** The weekly problem count the Light band supports. Read from the intensity table so the daily minutes and the weekly problems cannot drift apart. */
function refresherProblems() {
  const [min, max] = intensityByKey(REFRESHER_INTENSITY).band;
  return problemsForBand({ min, max }, REFRESHER_CODING_DAYS);
}

/**
 * A lighter week for someone who has finished the loop: the default shape, the problem count the Light band supports,
 * and design days off (a refresher with design topics on is not light; the week editor turns them back on).
 *
 * Returns a new object and reads `week` as untrusted: it may be missing or damaged, and then the app's default design
 * kind is used. Edited days are dropped because the plan is rebuilt from the shape.
 */
export function refresherWeek(week) {
  const base = isRecord(week) ? week : {};
  const design = isRecord(base.design) ? base.design : DEFAULT_WEEK.design;
  return {
    ...base,
    template: REFRESHER_TEMPLATE,
    days: null,
    problems: refresherProblems(),
    design: { ...design, perWeek: 0 },
  };
}

/**
 * Whether the week in force already is the one `refresherWeek` builds: configured, built from the shape (not hand
 * edited), at the refresher problem count, with design off. Reads through `weekSettings` and the *InForce readers, so a
 * damaged stored week answers false and never throws.
 */
export function weekIsRefresher(state) {
  if (!weekConfigured(state)) return false;
  const settings = weekSettings(state);
  return !isEditedWeek(settings)
    && settings.template === REFRESHER_TEMPLATE
    && problemsInForce(settings.problems) === refresherProblems()
    && isRecord(settings.design)
    && designDaysInForce(settings.design.perWeek) === 0;
}

/** Which day of the week an ISO date is, Monday-first. */
export function dayKeyOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();   // 0 = Sunday
  return DAYS[(js + 6) % 7].key;
}

/** What today is for. */
export function todaysSlot(state, today = todayISO()) {
  const week = weekPlan(state);
  const key = dayKeyOf(today);
  const day = week.days.find((d) => d.day === key) || rest(key);
  return { ...day, label: DAYS.find((d) => d.key === key).label, minutes: dayMinutes(day) };
}

export const isRestDay = (slot) => (slot.items || []).every((i) => i.kind === "rest");

/**
 * How far through today's list you are.
 *
 * Counted from what was actually recorded rather than from a checkbox, so it
 * cannot drift from the log. A day is done when every countable item is met —
 * and a rest day is done on arrival, which is the point of having one.
 */
export function dayProgress(state, today = todayISO()) {
  const slot = todaysSlot(state, today);
  const attempts = (state.problems || []).flatMap((p) => (p.attempts || [])
    .filter((a) => a.date === today)
    .map((a) => ({ ...a, problemId: p.id })));
  const mocksToday = (state.mocks || []).filter((m) => m.date === today).length;
  const designToday = (state.designProblems || [])
    .flatMap((p) => (p.attempts || []).filter((a) => a.date === today)).length;

  const done = {
    coding: attempts.filter((a) => !a.isMock).length,
    mock: mocksToday,
    designProblem: designToday,
    designMock: designToday,
    pairMock: pairMocksToday(state, today),
    clarify: clarifyToday(state, today),
  };
  // What the log cannot see — reading a topic, a drill — is ticked by hand.
  // Counting it as silently done told somebody their Tuesday was finished
  // while the design topic sat unread; counting it as outstanding with no way
  // to clear it would nag for ever. A tick is the honest middle.
  const ticked = state.dayChecks?.[today] || {};

  const items = (slot.items || []).filter((i) => i.kind !== "rest").map((item) => {
    const kind = itemKind(item.kind);
    const want = itemCount(item);
    const detectable = CAN_DETECT.has(item.kind);
    const got = detectable
      ? Math.min(want, done[item.kind] ?? 0)
      : (ticked[item.kind] ? want : 0);
    return {
      ...item, kind: item.kind, label: kind?.label || item.kind,
      want, got, met: got >= want, manual: !detectable,
    };
  });

  const rested = isRestDay(slot);
  return {
    slot, items, rested,
    complete: rested || items.every((i) => i.met),
    remaining: items.filter((i) => !i.met),
  };
}

/** How many days of hand ticks are kept. Only today's are ever read; the rest
 *  are kept briefly so a tick survives a device that is a day behind. */
const DAY_CHECK_DAYS = 14;

/** Days of tick records kept: eight weeks, the six the Progress card looks back plus slack. */
export const TICK_LOG_KEEP_DAYS = 56;

/**
 * What a hand tick is worth for a slot: the number of items of that kind it
 * asks for, counted the way the plan side counts them (`weeklyCount`) so a fully
 * ticked week equals the planned total. At least 1, so a tick on a kind the slot
 * does not hold still leaves a trace.
 */
export const tickCredit = (state, kind, today) => Math.max(1, weeklyCount({ days: [todaysSlot(state, today)] }, kind));

/** Drops tick-log days that are not real days or are older than the window. */
const keptTickDays = (log, today) => Object.fromEntries(Object.entries(isRecord(log) ? log : {})
  .filter(([date, kinds]) => exactDayOf(date) !== null && isRecord(kinds) && daysBetween(date, today) < TICK_LOG_KEEP_DAYS));

/**
 * Tick, or untick, something the log cannot see.
 *
 * Mutates `state`, for use inside store.mutate. Old dates are dropped on the
 * way through, so a year of ticks never accumulates in the synced file — every
 * byte of that file is paid for on every save.
 *
 * `dayChecks` is only the checkbox Home shows for today; the durable record
 * that adherence counts is `tickLog`, written here and nowhere else. Its credit
 * is fixed at tick time so a later edit of the plan cannot rewrite how a past
 * tick counts.
 */
export function setDayCheck(state, kind, on, today = todayISO()) {
  const checks = { ...(state.dayChecks || {}) };
  const day = { ...(checks[today] || {}) };
  if (on) day[kind] = true; else delete day[kind];
  if (Object.keys(day).length) checks[today] = day; else delete checks[today];
  for (const date of Object.keys(checks)) {
    if (daysBetween(date, today) >= DAY_CHECK_DAYS) delete checks[date];
  }
  state.dayChecks = checks;

  if (exactDayOf(today) === null) return;
  const log = keptTickDays(state.tickLog, today);
  if (HAND_TICKED_KINDS.includes(kind)) {
    const tickDay = { ...(log[today] || {}) };
    if (on) tickDay[kind] = tickCredit(state, kind, today); else delete tickDay[kind];
    if (Object.keys(tickDay).length) log[today] = tickDay; else delete log[today];
  }
  if (state.tickLog !== undefined || Object.keys(log).length) state.tickLog = log;
}

/** The kinds the log can actually confirm. */
const CAN_DETECT = new Set(["coding", "mock", "designProblem", "designMock", "pairMock", "clarify"]);

/** Plan item kinds the log cannot confirm, so the person ticks them. Derived from CAN_DETECT so a newly detectable kind drops out. */
export const HAND_TICKED_KINDS = Object.keys(ITEM_KINDS).filter((k) => k !== "rest" && !CAN_DETECT.has(k));

/** The share of a week's problems that counts as keeping the plan. One value
 *  for the rolling "on track" flag and the week-by-week adherence card, so the
 *  two can never call the same week different things. */
export const ADHERENCE_KEPT_RATIO = 0.75;
