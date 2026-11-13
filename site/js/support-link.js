// The one "Support this project" link, shown in a footer that outlives every view swap.
//
// Where this fits: constants and a pure renderer, painted once at boot by app.js (a browser script no test can
// import, so the logic lives here). Reads no storage and makes no network call; the app stays tracker-free.
//
// Constraint: the free route only. No prices, tiers or paid wording belong in this file, and this is the only place
// the Sponsors URL may appear. The profile URL form is unverified, so changing it means changing `SUPPORT.url` alone.

import { esc } from "./ui.js";

/** Everything about the link in one frozen place; `testId` and `footerId` are the stable selectors. */
export const SUPPORT = Object.freeze({
  url: "https://github.com/sponsors/JeremyahFlowers",
  label: "Support this project",
  testId: "support-link",
  footerId: "support-footer",
});

/**
 * The link as one anchor. `noopener noreferrer` because the target is a third-party page opened in a new tab.
 *
 * @returns {string} HTML for a single anchor element.
 */
function supportLinkHtml() {
  return `<a href="${esc(SUPPORT.url)}" target="_blank" rel="noopener noreferrer" data-testid="${SUPPORT.testId}">${esc(SUPPORT.label)}</a>`;
}

/**
 * Fills the footer and unhides it; quietly does nothing on a page without the footer.
 *
 * @param {{innerHTML: string, hidden: boolean}|null} root the `#support-footer` element, if the page has one.
 */
export function paintSupportLink(root) {
  if (!root) return;
  root.innerHTML = supportLinkHtml();
  root.hidden = false;
}
