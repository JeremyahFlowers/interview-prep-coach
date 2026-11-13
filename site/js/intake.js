// The three answers a stranger gives on first run, turned into the settings the app already understands.
//
// Where this fits: pure logic under first-run-view.js, above prep.js and week.js. It owns no state and touches no DOM
// or storage; the view hands it form text and writes the result through store.mutate.
//
// Why it reuses prep.js and week.js rather than computing its own plan: the band and week rules then exist once, so a
// person who answers "10 hours a week, senior" gets exactly what Settings would have produced for the same choices.

import { LEVELS, INTENSITIES, DEFAULT_PREP, applyIntensity, planStart } from "./prep.js";
import { DEFAULT_WEEK, problemsForBand, designDaysPlaced } from "./week.js";
import { setWeek } from "./week-history.js";
import { exactDayOf } from "./logic.js";

/** Hours a week the form accepts. A recommendation, not a measured limit: 40 is a full-time week. */
export const MIN_HOURS_PER_WEEK = 1;
export const MAX_HOURS_PER_WEEK = 40;

/** The weekdays template practises five days, so weekly hours are spread over five days to find a daily band. */
const PRACTICE_DAYS_PER_WEEK = 5;
const MINUTES_PER_HOUR = 60;

/** The shape first run builds; the default shape, so a person who wants another edits it in Settings. */
const FIRST_RUN_TEMPLATE = "weekdays";

/** Design days a week asks for, by level. LEVELS' `designShare` is a fraction of a day, not a count of days. */
const DESIGN_DAYS_BY_LEVEL = Object.freeze({ newgrad: 0, mid: 1, senior: 2 });

/** The commit message for the one write first run makes. */
export const FIRST_RUN_MESSAGE = "Ledger: first run — profile and week";

const WHOLE_NUMBER = /^\d+$/;

/** A refusal a person can read, naming the form field it belongs to. Returned by validateIntake, never thrown. */
class IntakeError {
  constructor(field, message) {
    this.field = field;
    this.message = message;
  }
}

/**
 * Checks the raw form text. `today` is an ISO day.
 * @param {{date?: string, level?: string, hours?: string}} raw
 * @returns {{ok: true, answers: {date: string|null, level: string, hoursPerWeek: number}}
 *   | {ok: false, error: IntakeError}}
 */
export function validateIntake(raw, today) {
  const refuse = (field, message) => ({ ok: false, error: new IntakeError(field, message) });

  const level = LEVELS.find((l) => l.key === raw?.level)?.key;
  if (!level) return refuse("level", "Pick the level you are interviewing at.");

  const hoursText = String(raw?.hours ?? "").trim();
  const hoursPerWeek = Number(hoursText);
  if (!WHOLE_NUMBER.test(hoursText) || hoursPerWeek < MIN_HOURS_PER_WEEK || hoursPerWeek > MAX_HOURS_PER_WEEK) {
    return refuse("hours", `Enter a whole number of hours a week, from ${MIN_HOURS_PER_WEEK} to ${MAX_HOURS_PER_WEEK}.`);
  }

  const dateText = String(raw?.date ?? "").trim();
  if (dateText === "") return { ok: true, answers: { date: null, level, hoursPerWeek } };
  // Strings compare correctly as ISO days, and exactDayOf has already rejected anything that is not a real one.
  if (exactDayOf(dateText) === null || dateText < today) {
    return refuse("date", "Pick today or a later day for your interview, or leave the date blank.");
  }
  return { ok: true, answers: { date: dateText, level, hoursPerWeek } };
}

/** The intensity whose band midpoint is nearest to a daily minute figure. */
function nearestIntensity(dailyMinutes) {
  const distance = (i) => Math.abs((i.band[0] + i.band[1]) / 2 - dailyMinutes);
  return INTENSITIES.reduce((best, i) => (distance(i) < distance(best) ? i : best));
}

/**
 * The plan for validated answers: the prep profile, the intensity, and the week.
 * @returns {{prep: object, intensityKey: string, week: object}}
 */
export function intakeToPlan({ date, level, hoursPerWeek }, today) {
  const intensity = nearestIntensity((hoursPerWeek * MINUTES_PER_HOUR) / PRACTICE_DAYS_PER_WEEK);
  const [min, max] = intensity.band;
  const perWeek = designDaysPlaced(FIRST_RUN_TEMPLATE, DESIGN_DAYS_BY_LEVEL[level]);
  return {
    prep: { targetDate: date, level, startedOn: date ? planStart(today) : null, intensity: intensity.key },
    intensityKey: intensity.key,
    week: {
      ...DEFAULT_WEEK,
      template: FIRST_RUN_TEMPLATE,
      problems: problemsForBand({ min, max }, PRACTICE_DAYS_PER_WEEK),
      design: { ...DEFAULT_WEEK.design, perWeek },
    },
  };
}

/**
 * Writes a plan into a state, for use inside store.mutate. The week goes through setWeek so the week history is
 * recorded as it is when Settings changes the week.
 */
export function applyIntake(state, plan, today) {
  state.settings.prep = { ...DEFAULT_PREP, ...(state.settings.prep || {}), ...plan.prep };
  applyIntensity(state.settings, plan.intensityKey);
  setWeek(state, plan.week, today);
}
