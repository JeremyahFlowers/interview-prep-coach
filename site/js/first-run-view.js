// The first screen a stranger sees: three questions, then a plan.
//
// Where this fits: shown by app.js in place of the storage choice when no storage mode has been chosen. It is a view
// only — validation and the plan itself come from intake.js, and the one write goes through store.mutate. It imports
// nothing from views.js or app.js; everything it needs from the shell arrives as an argument.
//
// Why a plan before a storage question: the value of the app is the plan, and a person cannot judge it until they have
// seen one. Choosing local mode here costs them nothing and can be reversed from Settings.

import { esc } from "./ui.js";
import { pitchHtml } from "./pitch.js";
import { todayISO } from "./logic.js";
import { LEVELS } from "./prep.js";
import { validateIntake, intakeToPlan, applyIntake, MIN_HOURS_PER_WEEK, MAX_HOURS_PER_WEEK, FIRST_RUN_MESSAGE } from "./intake.js";

/** Stable selectors, so a browser test does not depend on wording. */
const TESTID = Object.freeze({
  screen: "first-run", date: "first-run-date", level: "first-run-level", hours: "first-run-hours",
  submit: "first-run-submit", error: "first-run-error", privacy: "first-run-privacy", github: "first-run-github",
  demoLink: "first-run-demo-link",
});

const DEFAULT_LEVEL = "mid";
const DEFAULT_HOURS = "6";
const FORM_ID = "first-run-form";
/** Relative, so it works under a sub-path such as /<repo>/. The static build puts the demo at demo/index.html. */
const DEMO_HREF = "demo/";

/** Shown when the browser refuses to save anything (storage blocked or full), so submit is not a silent no-op. */
const STORAGE_REFUSED_MESSAGE = "This browser won't let the page save anything, so your plan can't be kept. "
  + "Allow site data for this page (or leave private browsing) and try again.";

const levelOptions = (selected) => LEVELS.map((l) => `
  <option value="${esc(l.key)}"${l.key === selected ? " selected" : ""}>${esc(l.label)}</option>`).join("");

/** The three answers as typed, from a form element. */
function readForm(formEl) {
  const form = new FormData(formEl);
  return { date: form.get("date"), level: form.get("level"), hours: form.get("hours") };
}

/** The form, filled with `values` (the person's last entry after a refusal) and an optional refusal message. */
function formHtml({ values, error, today }) {
  const refusal = (field) => (error?.field === field
    ? `<p class="banner banner-warn small" role="alert" data-testid="${TESTID.error}">${esc(error.message)}</p>` : "");
  return `
    <div class="card setup-card" data-testid="${TESTID.screen}">
      ${pitchHtml()}
      <h2>Get a plan for your interview</h2>
      <p class="muted">Three questions, then you land on a week plan and a first problem to try.</p>
      <form id="${FORM_ID}" class="form">
        <label class="field"><span class="label">Interview date (leave blank if you don't have one yet)</span>
          <input class="input" type="date" name="date" min="${esc(today)}" value="${esc(values.date)}"
            data-testid="${TESTID.date}" /></label>
        ${refusal("date")}
        <label class="field"><span class="label">Level</span>
          <select class="input" name="level" data-testid="${TESTID.level}">${levelOptions(values.level)}</select></label>
        ${refusal("level")}
        <label class="field"><span class="label">Hours a week you can practise</span>
          <input class="input" type="number" name="hours" min="${MIN_HOURS_PER_WEEK}" max="${MAX_HOURS_PER_WEEK}"
            step="1" value="${esc(values.hours)}" data-testid="${TESTID.hours}" /></label>
        ${refusal("hours")}
        ${refusal("storage")}
        <button class="btn btn-primary" type="submit" data-testid="${TESTID.submit}">Show me my plan</button>
      </form>
      <p class="muted small" data-testid="${TESTID.privacy}">Nothing leaves this browser: your answers and your
      practice log are saved on this device only. You can add GitHub sync later in Settings.</p>
      <p class="muted small">Just looking? <a href="${DEMO_HREF}" data-testid="${TESTID.demoLink}">See a demo with
      made-up data</a> (it resets when you reload).</p>
      <button class="btn btn-ghost btn-sm" type="button" data-testid="${TESTID.github}">I already sync with GitHub</button>
    </div>`;
}

/**
 * Draws the first-run screen into `root`.
 *
 * @param {object} store the shell's Store: `useLocal`, `init`, `mutate`, and `state` once initialised.
 * @param {object} options
 * @param {() => void} options.onGithub open the existing GitHub form.
 * @param {() => void} [options.onAccepted] called once the answers are valid, before anything is stored. The shell uses
 *   it to mark the welcome seen first, because `store.init()` renders Home and would otherwise show the welcome.
 * @param {string} [options.today] ISO day, injectable so tests need no clock. When omitted, each submit reads the clock
 *   itself: a form left open past midnight must not judge the interview date against the day it was drawn.
 */
export function renderFirstRun(root, store, options) {
  // Destructured in the body: the reference check reads a parameter list with a default call in it as no parameters.
  const { onGithub, onAccepted = () => {}, today: fixedToday } = options;
  const drawnOn = fixedToday ?? todayISO();
  /** Re-draws the form with what the person typed, so a refusal never costs them their entries. */
  const showRefusal = (raw, error) => show(
    { date: String(raw.date ?? ""), level: raw.level || DEFAULT_LEVEL, hours: String(raw.hours ?? "") }, error);
  const show = (values, error) => {
    root.innerHTML = formHtml({ values, error, today: drawnOn });
    const formEl = root.querySelector(`#${FORM_ID}`);
    formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      const raw = readForm(e.target);
      const today = fixedToday ?? todayISO();
      const checked = validateIntake(raw, today);
      if (!checked.ok) {
        showRefusal(raw, checked.error);
        return;
      }
      onAccepted();
      try {
        store.useLocal();
      } catch (_) {
        showRefusal(raw, { field: "storage", message: STORAGE_REFUSED_MESSAGE });
        return;
      }
      store.init();
      // An unreadable existing local log leaves no state; the shell then shows its own recovery screen.
      if (!store.state) return;
      const plan = intakeToPlan(checked.answers, today);
      store.mutate((state) => applyIntake(state, plan, today), FIRST_RUN_MESSAGE);
    });
    root.querySelector(`[data-testid="${TESTID.github}"]`).addEventListener("click", onGithub);
  };
  show({ date: "", level: DEFAULT_LEVEL, hours: DEFAULT_HOURS }, null);
}
