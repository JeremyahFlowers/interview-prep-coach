// What Home and Settings say once the saved interview date is behind us.
//
// Where this fits: the view layer, between prep.js (which decides whether the
// date has passed) and views.js / settings-view.js (which place the output).
// It reads state and writes only through `store.mutate`, and only when the
// person presses one of its buttons: the two answers, "Change my answer",
// "Keep my days light", "Keep my week light" or "Carry on without a date".
//
// Why a module of its own: Home and Settings need the same sentence about how
// long ago the interview was, and the card has to be renderable and pressable
// in a test without a browser.
//
// Until the person says how it went, the wording does not: the app does not
// know, and a card that guessed would be wrong for half the people who see it.
// The answer is a record kept in their own file; only the card reads it.

import {
  DEFAULT_PREP, OUTCOMES, REFRESHER_INTENSITY, applyIntensity, intensityByKey, interviewPassed, outcomeFor,
} from "./prep.js";
import { todayISO } from "./logic.js";
import { confirmLoss, esc } from "./ui.js";
import {
  REFRESHER_TEMPLATE, refresherWeek, templateByKey, weekConfigured, weekIsRefresher, weekPlan, weekSettings,
} from "./week.js";
import { setWeek } from "./week-history.js";

const TESTID = {
  card: "after-interview",
  newDate: "after-interview-new-date",
  clear: "after-interview-clear",
  answered: "after-interview-answered",
  change: "after-interview-change",
  light: "after-interview-light",
  lightWeek: "after-interview-light-week",
  lightWeekDone: "after-interview-light-week-done",
};

/** One answer button per `OUTCOMES` key, so the keys are written only in prep.js. */
const ANSWER_TESTID = {
  offer: "after-interview-offer",
  no_offer: "after-interview-no-offer",
};

const ASK = "How did it go?";

/** Wording for each stored answer. Neither assumes more than the person said. */
const NO_OFFER_TEXT = "Thanks for telling Ledger. Your log and your patterns are all still here, and nothing about them changes.";
const offerText = (band) =>
  `Congratulations. Ledger keeps your log. If you want to keep your skills warm without a countdown, a light day is ${band[0]} to ${band[1]} minutes.`;

const KEEP_LIGHT_LABEL = "Keep my days light";
const CHANGE_LABEL = "Change my answer";

const KEEP_LIGHT_WEEK_LABEL = "Keep my week light";

/** What the button will do, said with the figure the builder will use. */
const lightWeekOfferText = ({ problems }) =>
  `${KEEP_LIGHT_WEEK_LABEL} sets your weekly plan to ${problems} problems a week, with no design days. You can change it in Settings whenever you like.`;

/** Said in place of the button once the week already is that week, so the card never offers a no-op. */
const lightWeekDoneText = ({ problems, shape }) =>
  `Your week is light: ${problems} problems a week on the "${shape}" shape, with no design days. Settings has the week editor if you want it different.`;

/** Asked only when the week was edited by hand, because those days are not kept anywhere else. */
const LIGHT_WEEK_CONFIRM = {
  action: "Make your week a light one?",
  lost: "the days you edited by hand; the week is rebuilt from the shape",
  kept: "your log, your patterns and your interview answer",
};

/** The label the week editor shows for the shape the light week is built from. */
const refresherShapeLabel = () => templateByKey(REFRESHER_TEMPLATE).label;

/** The Settings section the date field lives in, as the "Set it up" link names it. */
const PREP_SECTION = "set-prep";

const byTestId = (id) => `[data-testid="${id}"]`;

/** "1 day ago" / "65 days ago". */
function daysAgoText(daysAgo) {
  return `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
}

/** The answer buttons, shown until the person has answered. */
function askHtml() {
  return `
        <p class="muted">${ASK}</p>
        <div class="row">
          ${OUTCOMES.map((o) => `<button type="button" class="btn btn-ghost btn-sm" data-testid="${ANSWER_TESTID[o.key]}">${esc(o.label)}</button>`).join("\n          ")}
        </div>`;
}

/** What the card says and offers once an answer is stored for this interview. */
function answeredHtml(result) {
  const isOffer = result === "offer";
  const text = isOffer ? offerText(intensityByKey(REFRESHER_INTENSITY).band) : NO_OFFER_TEXT;
  return `
        <div data-testid="${TESTID.answered}"><p>${esc(text)}</p></div>`;
}

/** The Home card, or an empty string when the date has not passed. */
export function afterInterviewCardHtml(state, today) {
  const passed = interviewPassed(state, today);
  if (!passed) return "";
  const result = outcomeFor(state, passed);
  return `
      <div class="card after-interview" data-testid="${TESTID.card}">
        <h2>Your interview date has passed</h2>
        <p class="muted">The date you saved, ${esc(passed.date)}, was ${esc(daysAgoText(passed.daysAgo))}.
        Until you set another, Ledger plans your days as if there were no date: mixed practice at a
        steady pace, with no countdown.</p>${result ? answeredHtml(result) : askHtml()}${lightWeekNoteHtml(state, result)}
        <div class="row">
          <button type="button" class="btn btn-primary btn-sm" data-testid="${TESTID.newDate}">Set another date</button>
          <button type="button" class="btn btn-ghost btn-sm" data-testid="${TESTID.clear}">Carry on without a date</button>${result ? changeButtonsHtml(result, lightWeekButtonHtml(state, result)) : ""}
        </div>
      </div>`;
}

/** Whether the light-week control applies: an offer is stored and the person has a week set up. */
const offersLightWeek = (state, result) => result === "offer" && weekConfigured(state);

/** What the light week is, read from the builder so the card and the press agree. */
const lightWeekFacts = (state) => ({ problems: refresherWeek(weekSettings(state)).problems, shape: refresherShapeLabel() });

/** The sentence under the answer: what the button does, or that the week already is that week. Empty when neither applies. */
function lightWeekNoteHtml(state, result) {
  if (!offersLightWeek(state, result)) return "";
  const done = weekIsRefresher(state);
  const text = done ? lightWeekDoneText(lightWeekFacts(state)) : lightWeekOfferText(lightWeekFacts(state));
  const attr = done ? ` data-testid="${TESTID.lightWeekDone}"` : "";
  return `
        <p class="muted"${attr}>${esc(text)}</p>`;
}

/** The "Keep my week light" button; one contiguous block so it can be removed alone. */
function lightWeekButtonHtml(state, result) {
  if (!offersLightWeek(state, result) || weekIsRefresher(state)) return "";
  return `
          <button type="button" class="btn btn-ghost btn-sm" data-testid="${TESTID.lightWeek}">${KEEP_LIGHT_WEEK_LABEL}</button>`;
}

/** "Keep my days light" (offer only), the light-week button, and "Change my answer", beside the old buttons. */
function changeButtonsHtml(result, lightWeekButton) {
  const light = result === "offer"
    ? `
          <button type="button" class="btn btn-ghost btn-sm" data-testid="${TESTID.light}">${KEEP_LIGHT_LABEL}</button>`
    : "";
  return `${light}${lightWeekButton}
          <button type="button" class="btn btn-ghost btn-sm" data-testid="${TESTID.change}">${CHANGE_LABEL}</button>`;
}

/** Settings' stand-in for "N weeks out · phase" when the date has passed. */
export function passedReadoutHtml(passed) {
  if (!passed) return "";
  return `
          <p class="prep-readout" data-testid="prep-passed">Your interview was ${esc(daysAgoText(passed.daysAgo))}.</p>
          <p class="muted small">With no date ahead, practice stays interleaved at a steady pace. Set a new
          date above whenever there is one.</p>`;
}

/** Merge `patch` into the stored prep settings in one mutation. */
function patchPrep(store, patch, message) {
  store.mutate((s) => {
    s.settings ||= {};
    s.settings.prep = { ...DEFAULT_PREP, ...(s.settings.prep || {}), ...patch };
  }, message);
}

/** Store how the interview went. Its one caller passes a key from `OUTCOMES` and a date that has passed, so it does not re-check them. */
function recordOutcome(store, passed, result, today) {
  patchPrep(store, { outcome: { date: passed.date, result, recordedOn: today } }, "Ledger: prep — interview outcome");
}

/** Forget the stored answer, so the card asks again. */
function clearOutcome(store) {
  patchPrep(store, { outcome: null }, "Ledger: prep — clear interview outcome");
}

/**
 * Bind the card's buttons. Safe to call when the card was not rendered.
 *
 * "Carry on" writes the same two values as Settings' "No date yet" button
 * (`targetDate` and `startedOn` both null). That is a second copy of the rule, kept
 * because Settings' button goes through its own `save` helper; change both together.
 *
 * `today` is a parameter so tests control the clock.
 */
export function wireAfterInterview(root, store, actions, today = todayISO()) {
  const on = (id, fn) => root.querySelector(byTestId(id))?.addEventListener("click", fn);
  on(TESTID.newDate, () => actions.switchTab("settings", { jump: PREP_SECTION }));
  on(TESTID.clear, () => {
    patchPrep(store, { targetDate: null, startedOn: null }, "Ledger: prep — no date");
  });
  for (const o of OUTCOMES) {
    on(ANSWER_TESTID[o.key], () => {
      // The card may be a day stale; with no passed date there is nothing to answer.
      const passed = interviewPassed(store.state, today);
      if (passed) recordOutcome(store, passed, o.key, today);
    });
  }
  on(TESTID.change, () => clearOutcome(store));
  on(TESTID.light, () => {
    store.mutate((s) => {
      s.settings ||= {};
      applyIntensity(s.settings, REFRESHER_INTENSITY);
    }, "Ledger: prep — keep my days light");
  });
  on(TESTID.lightWeek, () => pressLightWeek(store, today));
}

/**
 * "Keep my week light": rebuild the week through `setWeek`, the one writer of `settings.week`, so the history
 * stays truthful. Asks first only for a hand-edited week, whose days are kept nowhere else.
 */
function pressLightWeek(store, today) {
  const state = store.state;
  // The card may be a day stale: act only while an offer, a passed date and a configured week still hold.
  const passed = interviewPassed(state, today);
  if (!offersLightWeek(state, outcomeFor(state, passed))) return;
  if (weekPlan(state).edited && !confirmLoss(LIGHT_WEEK_CONFIRM)) return;
  // The stored week itself, not `weekSettings`: that spreads a damaged string week into index keys which would be saved.
  store.mutate((s) => setWeek(s, refresherWeek(s.settings.week), today), "Ledger: week — keep my week light");
}
