// The first-screen pitch: what the app is, who it is for, that it is free, and one free "Star the repo" link.
//
// Where this fits: a pure view helper for first-run-view.js. It takes no input, reads no storage and makes no request.
//
// Why a plain link and not a button that stores a flag: a link needs no state, cannot fail on blocked site data and
// does something real. A star count on the repo page is the only readable signal that someone liked the app, and the
// app stays tracker-free. The app is free and shows no prices; the Sponsors link lives in the footer (support-link.js).

import { esc } from "./ui.js";

/** Stable selectors, so a browser test does not depend on wording; tests name them literally. */
const PITCH_TESTID = Object.freeze({
  root: "pitch", what: "pitch-what", who: "pitch-who", free: "pitch-free", star: "pitch-star",
});

/** The one place the repo address lives (not named *_URL: the static check reads those as app-owned paths); change it here if the idea moves to its own repository. */
const PITCH_REPO_LINK = "https://github.com/JeremyahFlowers/interview-prep-coach";

/** The first-screen pitch wording; also the single source for `make launch-post`, so the post and the app agree. */
export const PITCH_COPY = Object.freeze({
  heading: "A study coach for a fixed interview date",
  what: "Plans the weeks to your interview date, schedules practice by pattern with spaced repetition, runs timed "
    + "sessions and drills system design on a whiteboard.",
  who: "For engineers with a fixed interview date and only a few hours a week.",
  free: "Everything in the app is free and stays free.",
  star: "Star the repo on GitHub",
});

/** @returns {string} the pitch block as HTML; every string is escaped. */
export function pitchHtml() {
  const t = PITCH_TESTID;
  return `
      <section class="pitch" data-testid="${t.root}">
        <h2>${esc(PITCH_COPY.heading)}</h2>
        <p data-testid="${t.what}">${esc(PITCH_COPY.what)}</p>
        <p data-testid="${t.who}">${esc(PITCH_COPY.who)}</p>
        <p data-testid="${t.free}">${esc(PITCH_COPY.free)}</p>
        <p class="small"><a href="${esc(PITCH_REPO_LINK)}" target="_blank" rel="noopener noreferrer"
          data-testid="${t.star}">${esc(PITCH_COPY.star)}</a></p>
      </section>`;
}
