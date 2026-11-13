// The first run.
//
// Where this fits: shown once, after the GitHub connection succeeds and before
// the dashboard, and never again unless asked for from Settings.
//
// Why it exists: a new account lands on a dashboard holding a plant, a budget
// ring, a recommendation and a 23-pattern taxonomy, with no indication what
// any of it is for. The reasoning behind every one of those is written down —
// in source comments and a changelog, where nobody looks. An app whose whole
// argument is "don't grind, practise deliberately" has to make that argument
// somewhere the user actually is.
//
// Deliberately short, and skippable on the first screen. An onboarding nobody
// can escape is its own kind of disrespect, and the app is usable without any
// of this.

import { esc } from "./ui.js";
import { storageKey } from "./channel.js";

const SEEN_KEY = storageKey("ledger.welcomed");

/** Whether the introduction has been shown. Stored per device rather than in
 * synced state: it is about this browser, not about the prep log. */
export function hasSeenWelcome() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch (_) {
    // A browser that won't give us storage shouldn't get stuck on onboarding.
    return true;
  }
}

export function markWelcomeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch (_) { /* nothing to do */ }
}

export function resetWelcome() {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch (_) { /* nothing to do */ }
}

// Four screens, each answering one question a new user would actually ask.
// The last is the only one that asks for anything.
const STEPS = [
  {
    title: "This is a log, not a leaderboard",
    body: `Ledger records what you practised, how long it took you to see the approach, and what
      you'd tell yourself next time. Everything else here is built out of those three things.
      Nothing is scored against anyone else, and nothing is public.`,
    aside: `Your log lives in your own GitHub repository. This app never sends it anywhere else.`,
  },
  {
    title: "Patterns, not problems",
    body: `Interview problems are a long tail; the ideas behind them are not. Ledger sorts
      everything into 23 patterns — sliding window, two pointers, topological sort — and tracks
      how you're doing at <em>recognising</em> each one, because that's the part that transfers.`,
    aside: `After every session it asks which pattern it was, before showing you. Retrieving it
      yourself is the rep.`,
  },
  {
    title: "Spacing, without deadlines",
    body: `Problems come back round on a widening schedule, so you meet them again roughly when
      you'd otherwise start forgetting. Nothing is ever "overdue" — you'll be told how long it's
      been, and it's your call.`,
    aside: `A refresher you skip costs nothing. This is a tool, not a streak app that sulks.`,
  },
  {
    title: "Stopping is part of it",
    body: `Set a daily budget and Ledger will plan to it, tell you when you've hit it, and stop
      asking for more. The plant in the corner grows as you work toward that budget and shrinks
      when you push past it — because the failure this app exists to prevent is burning out in
      three weeks.`,
    aside: `You can change the budget, the schedule, and everything else in Settings.`,
  },
];

/**
 * Render the introduction.
 *
 * `onDone` is called when it's finished or skipped; app.js uses it to mark the
 * flag and go to the dashboard.
 */
export function renderWelcome(root, { step = 0, onStep, onDone }) {
  const s = STEPS[Math.min(step, STEPS.length - 1)];
  const last = step >= STEPS.length - 1;

  root.innerHTML = `
    <div class="card welcome-card">
      <div class="welcome-dots" role="presentation">
        ${STEPS.map((_, i) => `<span class="welcome-dot ${i === step ? "on" : ""}"></span>`).join("")}
      </div>
      <h2>${esc(s.title)}</h2>
      <p class="welcome-body">${s.body}</p>
      <p class="muted small welcome-aside">${s.aside}</p>
      <div class="row gap" style="margin-top:1rem">
        <button class="btn btn-primary" id="welcome-next">${last ? "Start" : "Next"}</button>
        ${last ? "" : `<button class="btn btn-ghost" id="welcome-skip">Skip</button>`}
      </div>
    </div>`;

  root.querySelector("#welcome-next").addEventListener("click", () => {
    if (last) onDone();
    else onStep(step + 1);
  });
  root.querySelector("#welcome-skip")?.addEventListener("click", onDone);
}
