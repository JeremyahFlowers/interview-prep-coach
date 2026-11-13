// What you are preparing for, and what that changes.
//
// Where this fits: above logic.js, which owns a practice day, and read by the
// dashboard, the settings screen and the recommendation. It holds no state of
// its own — everything here is derived from four answers the user gives once
// and can change whenever they like.
//
// Why it exists. The app knew how long a day was and nothing else, so it gave
// the same advice to somebody six months out as to somebody interviewing on
// Friday, and the same advice to a new grad as to a senior. Those are not the
// same preparation. What actually differs:
//
//   * **How long you have** decides whether you are still building foundations
//     or should be simulating the real thing. Topic-by-topic blocks are right
//     early and wrong late; random problems under a strict clock are right late
//     and wrong early.
//   * **Where you are starting** decides how much a day has to hold.
//   * **What you are aiming at** decides what gets weighted. A top-tier loop
//     assumes fluency and clean code as the floor and tests ambiguity on top;
//     a broad search does not.
//   * **What level** decides whether system design is part of the day at all.
//
// One thing this deliberately does not do is set a single number and call it a
// plan. A day is a band — a floor below which the day did not really happen,
// and a ceiling past which the evidence is that you stop learning and start
// skimming. Two hours of deliberate technical practice is the top of the range
// most people sustain; the band makes that visible instead of implying that
// more is always better.

import { todayISO, daysBetween, addDaysISO, dayOf, exactDayOf } from "./logic.js";

/** Where somebody is starting from, and what a day has to hold because of it. */
export const STARTING_POINTS = [
  {
    key: "sharp", label: "Currently sharp",
    note: "Interviewing now, or practising already. Maintenance, not rebuilding.",
    weeksNeeded: 3, lift: -15,
  },
  {
    key: "rusty", label: "Done this before, gone rusty",
    note: "The ideas are in there somewhere. Most of the work is retrieval and speed.",
    weeksNeeded: 6, lift: 0,
  },
  {
    key: "new", label: "New to data structures and algorithms",
    note: "Foundations first. This takes longer than anyone wants it to, and compressing it does not work.",
    weeksNeeded: 12, lift: 20,
  },
];

/**
 * What you are aiming at, and what that weights.
 *
 * The distinction that matters is not the company's name, it is what the loop
 * assumes you already have. A top-tier loop treats fluency in your language and
 * clean first-draft code as the floor and spends its time on ambiguity and
 * follow-ups; somewhere else, getting a correct answer is the bar.
 */
export const TARGETS = [
  {
    key: "top", label: "Top tier",
    hint: "Meta, Google and the like",
    note: "Assumes fluency and clean code as the floor. The differentiators are speed on classics, and handling a deliberately vague prompt without flailing.",
    emphasis: ["fluency", "clean", "ambiguity", "speed"],
  },
  {
    key: "strong", label: "Strong engineering org",
    hint: "Series B and up, good product companies",
    note: "Correctness and communication carry it. Depth matters more than raw speed.",
    emphasis: ["clean", "communication"],
  },
  {
    key: "broad", label: "Broad search",
    hint: "Casting wide, mixed bar",
    note: "Coverage over depth: more patterns seen once beats three seen perfectly.",
    emphasis: ["coverage"],
  },
];

/**
 * The bar a top-tier interviewer holds first-draft code to, as checks you can
 * answer honestly about the code you just wrote.
 *
 * Each is something an interviewer notices without saying so. None of them is
 * about whether the answer was right — that is the outcome — and every one of
 * them costs a pass on a loop that assumes correctness and grades the rest.
 */
export const CLEAN_CODE_BAR = [
  { key: "ranFirst", label: "It ran the first time",
    why: "No syntax errors, no undefined names. Fixing those live eats the minutes the follow-up needed." },
  { key: "noDebris", label: "No debugging left in",
    why: "Stray prints and commented-out attempts read as not knowing which version you meant." },
  { key: "names", label: "Names say what they hold",
    why: "left and right, not i and j2. The interviewer is reading it at the speed you talk." },
  { key: "edgesUnprompted", label: "Edge cases handled before being asked",
    why: "Empty input, one element, duplicates. Waiting to be asked is the difference between a hire and a lean hire." },
  { key: "complexity", label: "Stated time and space, correctly",
    why: "Out loud, before being asked, and right. It is the first follow-up at every top-tier loop." },
];

/** Whether the target you chose weights clean first-draft code. */
export function wantsCleanBar(state) {
  return (targetByKey(prepOf(state).target)?.emphasis || []).includes("clean");
}

/** What the level changes. Mostly: whether system design is part of the day. */
export const LEVELS = [
  { key: "newgrad", label: "New grad / junior", designShare: 0,
    note: "Coding rounds decide this. System design, if it appears at all, is a conversation rather than a round." },
  { key: "mid", label: "Mid level", hint: "L4 / E4",
    designShare: 0.2,
    note: "One design round, usually. Enough to need the shape of an answer, not enough to need depth everywhere." },
  { key: "senior", label: "Senior and up", hint: "L5 / E5+",
    designShare: 0.4,
    note: "Design carries as much weight as coding, and is where the level is actually decided." },
];

/**
 * How much of a day this is, as a band rather than a number.
 *
 * The floor is where a day starts counting — below it there is no room for a
 * real problem *and* the review afterwards, and the review is the part that
 * teaches. The ceiling is where deliberate practice stops being deliberate.
 * Past roughly two hours of this kind of work most people stop analysing their
 * own mistakes and start skimming solutions, which feels like progress and is
 * not; the long bands exist for people genuinely doing this full time, and say
 * so.
 */
export const INTENSITIES = [
  {
    key: "light", label: "Light", band: [30, 45], blocks: 1,
    note: "A rep and a proper review. Slow progress, but it is progress and it survives a busy month.",
  },
  {
    key: "steady", label: "Steady", band: [45, 75], blocks: 1,
    note: "One problem worked properly plus a refresher. The most common sustainable shape alongside a job.",
  },
  {
    key: "focused", label: "Focused", band: [75, 120], blocks: 1,
    note: "Warm-up, one hard problem under the clock, and a real review. The top of what most people sustain daily.",
  },
  {
    key: "rigorous", label: "Rigorous", band: [120, 180], blocks: 2,
    note: "Two blocks with a genuine break between them. One sitting this long stops being deliberate practice about halfway through.",
  },
  {
    key: "fulltime", label: "Full time", band: [180, 240], blocks: 2,
    note: "Only if this is your job right now. Split morning and afternoon; four hours in one sitting is three hours of skimming.",
  },
];

/** Past this, a day is split into blocks rather than run as one sitting. */
export const LONG_DAY_MIN = 120;

export const DEFAULT_PREP = {
  targetDate: null,
  startingPoint: "rusty",
  // No target until one is chosen. A default target would switch on its
  // emphasis — the clean-code bar, the fluency warm-up — for somebody who
  // never said what they were aiming at.
  target: null,
  level: "mid",
  intensity: null,      // null means "follow the suggestion"
  startedOn: null,
  // The language you will interview in. Sessions open in it and the fluency
  // drill teaches it; null means "whatever you last wrote code in".
  language: null,
  // How the interview went, once the person has said: null or
  // `{ date, result, recordedOn }`. `date` is the interview it answers, so an
  // answer for an earlier interview is ignored rather than cleared. Read only by
  // `outcomeFor`; no advice here depends on it.
  outcome: null,
};

/** The intensity "Keep my days light" applies: the app's existing lightest band. */
export const REFRESHER_INTENSITY = "light";

/** The answers a person can give about an interview that has happened. */
export const OUTCOMES = [
  { key: "offer", label: "I got an offer" },
  { key: "no_offer", label: "Not this time" },
];

export const intensityByKey = (key) => INTENSITIES.find((i) => i.key === key) || null;
const startingPointByKey = (key) => STARTING_POINTS.find((s) => s.key === key) || null;
const targetByKey = (key) => TARGETS.find((t) => t.key === key) || null;
const levelByKey = (key) => LEVELS.find((l) => l.key === key) || null;

export function prepOf(state) {
  return { ...DEFAULT_PREP, ...(state?.settings?.prep || {}) };
}

/**
 * The stored answer for this passed interview ("offer" | "no_offer"), or null.
 * Stored data is hostile here: the result is matched against `OUTCOMES` by
 * equality (never by property lookup, so "__proto__" cannot match) and only own
 * properties count.
 */
export function outcomeFor(state, passed) {
  if (!passed) return null;
  const stored = prepOf(state).outcome;
  if (typeof stored !== "object" || stored === null) return null;
  if (!Object.hasOwn(stored, "date") || !Object.hasOwn(stored, "result")) return null;
  if (stored.date !== passed.date) return null;
  return OUTCOMES.find((o) => o.key === stored.result)?.key ?? null;
}

/**
 * Set the intensity and the minute band it stands for. Choosing an intensity
 * writes the band because a band that did not move would make the choice look
 * like it did nothing (the stored band wins over the suggestion in `dailyBand`).
 * An unknown key changes nothing.
 */
export function applyIntensity(settings, key) {
  const chosen = intensityByKey(key);
  if (!chosen) return;
  settings.prep = { ...DEFAULT_PREP, ...(settings.prep || {}), intensity: chosen.key };
  settings.dailyFloorMin = chosen.band[0];
  settings.dailyBudgetMin = chosen.band[1];
}

/** The interview date as a real calendar day, or null. The one reader of the
 *  stored target, so no caller sees text that only looks like a date. */
const targetDayOf = (state) => exactDayOf(prepOf(state).targetDate);

/** A stored date counts as present unless it is what the app writes for "no date" (null, absent or ""); present but
 *  not a whole real day means every reader treats it as not set. */
const isIgnored = (value) => value != null && value !== "" && exactDayOf(value) === null;

/**
 * Which saved prep dates are present but not a whole real day, and so read as not set. Built on `exactDayOf`, the rule
 * the readers use, so the Settings note and the missing run-up cannot disagree. Never throws, whatever was stored.
 */
export function ignoredSavedDates(state) {
  const { targetDate, startedOn } = prepOf(state);
  return { targetDate: isIgnored(targetDate), startedOn: isIgnored(startedOn) };
}

/** Whole weeks until the target date, or null if there isn't one (or it is not
 *  a real day), or if `today` is not a real day. Never negative: the day of the
 *  interview is zero weeks out, not minus one. */
export function weeksUntil(state, today = todayISO()) {
  // The clock is a caller's argument, so it is checked like the stored dates: a bad one reads as no run-up
  // rather than as NaN weeks.
  const now = dayOf(today);
  const day = targetDayOf(state);
  if (!now || !day) return null;
  return Math.max(0, Math.ceil(daysBetween(now, day) / 7));
}

/**
 * The saved interview date if it is already behind us, as `{date, daysAgo}`;
 * otherwise null. The day of the interview itself is not behind us.
 *
 * Beside `weeksUntil` rather than inside it, because that one is pinned to
 * clamp at zero and callers rely on it. Null as well when `today` is not a
 * real day.
 */
export function interviewPassed(state, today = todayISO()) {
  const now = dayOf(today);
  const date = targetDayOf(state);
  if (!now || !date) return null;
  const daysAgo = daysBetween(date, now);
  return daysAgo > 0 ? { date, daysAgo } : null;
}

/**
 * Weeks left in a run-up that is still ahead of us, or null when there is no
 * run-up: no date, or a date that has passed. Every reader that shapes advice
 * goes through this rather than `weeksUntil`, so a passed date behaves like no
 * date everywhere at once instead of as "zero weeks out, maximum pressure".
 */
function runUpWeeks(state, today) {
  return interviewPassed(state, today) ? null : weeksUntil(state, today);
}

/**
 * Which part of the preparation this is.
 *
 * By how far through the plan you are rather than by a fixed number of weeks,
 * because "topic blocks for two months, then mix it up" is advice about
 * proportions. Somebody with six weeks and somebody with six months both need
 * a foundations stretch and a simulation stretch; they just need them at
 * different lengths.
 *
 * With no target date it stays on `mixed`, which is what the app did before
 * any of this existed. Nobody is made to pick a date to get sensible defaults.
 */
export const PREP_PHASES = {
  foundations: {
    key: "foundations", label: "Foundations",
    blurb: "One pattern at a time, until the shape of it is obvious.",
    detail: "Block practice: stay on a pattern until you can see it coming, rather than meeting it once and moving on. Mixing too early feels harder and teaches less, because every problem becomes a fresh search instead of a recognition.",
  },
  mixed: {
    key: "mixed", label: "Mixed practice",
    blurb: "Patterns interleaved, the way the queue decides.",
    detail: "Spaced and interleaved: what you saw longest ago comes back first. This is where recognition actually forms, because you no longer know what kind of problem is coming.",
  },
  simulation: {
    key: "simulation", label: "Simulation",
    blurb: "Random, strictly timed, spoken out loud.",
    detail: "Stop learning new patterns and start rehearsing the event. Random problems, a hard clock, talking through it — the gap being closed now is performance, not knowledge.",
  },
};

/** Always simulate inside this, however long the plan was. */
const SIMULATION_WEEKS = 2;

export function prepPhase(state, today = todayISO()) {
  const weeksOut = runUpWeeks(state, today);
  if (weeksOut == null) return PREP_PHASES.mixed;
  if (weeksOut <= SIMULATION_WEEKS) return PREP_PHASES.simulation;

  // A number from runUpWeeks means `today` is readable; use its day, not a timestamp's raw text.
  const now = dayOf(today);
  const started = exactDayOf(prepOf(state).startedOn);
  if (!started) return weeksOut > 8 ? PREP_PHASES.foundations : PREP_PHASES.mixed;

  const elapsed = Math.max(0, daysBetween(started, now));
  const remaining = Math.max(0, daysBetween(now, targetDayOf(state)));
  const total = elapsed + remaining;
  if (total <= 0) return PREP_PHASES.simulation;

  const through = elapsed / total;
  if (through < 0.4) return PREP_PHASES.foundations;
  if (through < 0.75) return PREP_PHASES.mixed;
  return PREP_PHASES.simulation;
}

/**
 * How hard a day should be, given how long is left and where you started.
 *
 * Short runway raises it, because there is less time for the same ground; a
 * standing start raises it, because there is more ground. Both are capped
 * below the full-time band, which is a decision somebody makes about their
 * life rather than something an app infers from a date.
 */
export function suggestIntensity(state, today = todayISO()) {
  const prep = prepOf(state);
  const start = startingPointByKey(prep.startingPoint) || STARTING_POINTS[1];
  const weeksOut = runUpWeeks(state, today);

  let i = INTENSITIES.findIndex((x) => x.key === "steady");
  if (weeksOut != null) {
    const pressure = start.weeksNeeded / Math.max(1, weeksOut);
    if (pressure >= 2) i += 2;
    else if (pressure >= 1.2) i += 1;
    else if (pressure < 0.6) i -= 1;
  } else if (start.key === "new") {
    i += 1;
  }
  // Never suggests full time. That is a statement about somebody's week, not
  // something to be inferred from a date in a form.
  const max = INTENSITIES.findIndex((x) => x.key === "rigorous");
  return INTENSITIES[Math.max(0, Math.min(max, i))];
}

/** The intensity in force: whatever was chosen, or the suggestion. */
export function currentIntensity(state, today = todayISO()) {
  return intensityByKey(prepOf(state).intensity) || suggestIntensity(state, today);
}

/**
 * Today's band, in minutes.
 *
 * Read from the saved settings when they exist, so a hand-set band is never
 * overwritten by the suggestion, and derived from the intensity otherwise.
 */
export function dailyBand(state, today = todayISO()) {
  const settings = state?.settings || {};
  const max = settings.dailyBudgetMin;
  const min = settings.dailyFloorMin;
  if (max != null && min != null) return { min: Math.min(min, max), max };
  const [lo, hi] = currentIntensity(state, today).band;
  return { min: min ?? Math.min(lo, max ?? hi), max: max ?? hi };
}

/**
 * The shape of a day: blocks, and what each block is for.
 *
 * A long day is not one long session. Past two hours the useful move is two
 * sittings with a real break, and inside each sitting the same three-part
 * shape: something you already know to get the machinery running, one hard
 * thing under the clock, and then the review — which is the part that is
 * skipped first and teaches most.
 */
const BLOCK_SHAPE = [
  { key: "warmup", label: "Warm-up", share: 0.16,
    prompt: "Re-code something from last week from memory, or take an easy one. This is to get the machinery running, not to learn anything." },
  { key: "core", label: "Deliberate practice", share: 0.53,
    prompt: "One problem at the top of your range, under a hard clock, spoken out loud. No hints." },
  { key: "review", label: "Review", share: 0.31,
    prompt: "Why did it go the way it did? Write the sentence you would need in six months, and the complexity you argued for." },
];

/**
 * What the warm-up is, given what you are aiming at.
 *
 * For a loop that assumes fluency, the warm-up is where fluency is built: a
 * few idioms written from memory in your language costs five minutes and
 * removes the hesitation that a two-mediums-in-forty-five round has no room
 * for. Elsewhere the general warm-up is the better use of the time.
 */
export function warmupFor(state) {
  const prep = prepOf(state);
  const emphasis = targetByKey(prep.target)?.emphasis || [];
  if (emphasis.includes("fluency")) {
    return {
      kind: "fluency",
      prompt: "Three idioms from the fluency drill in your language, from memory, then re-code something from last week. The loop you are aiming at assumes the syntax takes no thought.",
    };
  }
  return { kind: "recall", prompt: BLOCK_SHAPE[0].prompt };
}

export function dayPlan(state, today = todayISO()) {
  const band = dailyBand(state, today);
  const intensity = currentIntensity(state, today);
  const warmup = warmupFor(state);
  const target = Math.round((band.min + band.max) / 2);
  const count = band.max > LONG_DAY_MIN ? Math.max(2, intensity.blocks) : 1;
  const per = Math.round(target / count);

  const blocks = [];
  for (let b = 0; b < count; b++) {
    let used = 0;
    const parts = BLOCK_SHAPE.map((part, i) => {
      const minutes = i === BLOCK_SHAPE.length - 1
        ? per - used
        : Math.max(1, Math.round(per * part.share));
      used += minutes;
      return part.key === "warmup"
        ? { ...part, minutes, prompt: warmup.prompt, warmupKind: warmup.kind }
        : { ...part, minutes };
    });
    blocks.push({
      index: b,
      label: count === 1 ? "Today" : b === 0 ? "First block" : "Second block",
      minutes: per,
      parts,
    });
  }
  return { band, target, blocks, splitReason: count > 1 ? intensity.note : null };
}

/**
 * Whether the band is somewhere the evidence supports.
 *
 * Said rather than enforced. Somebody who has decided to do four hours a day
 * is allowed to; what they should not be able to do is set it without the app
 * having mentioned what happens past the top of the range.
 */
export const SUSTAINABLE_MAX = 120;
export const MIN_USEFUL_DAY = 25;

export function bandAdvice(state, today = todayISO()) {
  const { min, max } = dailyBand(state, today);
  if (max > 240) {
    return { level: "bad", message: "Past four hours this stops being practice. Nobody analyses their own mistakes in the fourth hour; they skim solutions and feel productive." };
  }
  if (max > SUSTAINABLE_MAX) {
    const intensity = currentIntensity(state, today);
    if (intensity.blocks > 1) {
      return { level: "warn", message: `Over ${SUSTAINABLE_MAX} minutes of this is two sittings, not one. Today is planned as ${intensity.blocks} blocks with a real break between them.` };
    }
    return { level: "warn", message: `Over ${SUSTAINABLE_MAX} minutes in one sitting is where deliberate practice stops being deliberate. Split it into two blocks, or bring the ceiling down.` };
  }
  if (max < MIN_USEFUL_DAY) {
    return { level: "warn", message: "Under half an hour there is no room for the review, and the review is the part that teaches. A shorter day is fine; a day with no review is not." };
  }
  if (min >= max) {
    return { level: "warn", message: "A floor equal to the ceiling is a target, not a band — every day is then either short or over." };
  }
  return { level: "ok", message: "" };
}

/**
 * Everything the dashboard needs to say what this preparation is.
 *
 * One call, because these are answers to one question and computing them in
 * four places is how they start disagreeing.
 */
export function prepStatus(state, today = todayISO()) {
  const prep = prepOf(state);
  const weeksOut = runUpWeeks(state, today);
  const phase = prepPhase(state, today);
  const intensity = currentIntensity(state, today);
  const band = dailyBand(state, today);
  const start = startingPointByKey(prep.startingPoint);
  const target = targetByKey(prep.target);
  const level = levelByKey(prep.level);
  const suggested = suggestIntensity(state, today);

  return {
    configured: !!prep.targetDate || !!prep.intensity,
    targetDate: prep.targetDate, weeksOut, phase, passed: interviewPassed(state, today), intensity, band,
    startingPoint: start, target, level,
    suggestedIntensity: suggested,
    followingSuggestion: !prep.intensity,
    emphasis: target?.emphasis || [],
    advice: bandAdvice(state, today),
    // Whether the runway is honest about the ground still to cover. Said once,
    // plainly, rather than nagged: it is their date and their call.
    tight: weeksOut != null && start != null && weeksOut < start.weeksNeeded,
  };
}

/** The date the plan should have started from, for somebody setting a target
 *  date today. Used to seed `startedOn` so the phases have a span to divide. */
export function planStart(today = todayISO()) {
  return today;
}

export { addDaysISO };
