// The line under a saved statement: where it came from, when, and the way to replace it.
//
// Where this fits: a pure presentation string for the session screen. session-view.js owns the DOM and the click
// handler on the button; this owns only the sentence, so a test can import it without loading a DOM module.
// Constraint: imports ui.js and logic.js only, and touches no DOM, storage or clock.

import { esc } from "./ui.js";
import { dayOf } from "./logic.js";

/** Where a statement came from, said plainly. A statement fetched against the
 *  wrong problem looks exactly like a right one until you read it, and the
 *  first question then is "where did this come from". */
const STATEMENT_SOURCE = {
  leetcode: "fetched from LeetCode",
  pasted: "pasted by you",
};

/** Said when the app cannot name where a statement came from: saved before provenance, or a source this version does not know. */
const SOURCE_NOT_RECORDED = "source not recorded";

/** The label for a stored source. Stored data is untrusted, so only a string that is an own key of the map is believed:
 *  an inherited key ("constructor") would print a function body, and a non-string such as `["pasted"]` would be
 *  coerced to a key and pass for a real source. */
function sourceLabel(source) {
  return typeof source === "string" && Object.hasOwn(STATEMENT_SOURCE, source) ? STATEMENT_SOURCE[source] : SOURCE_NOT_RECORDED;
}

/** The provenance sentence plus the "Replace it" button (id `ws-replace-statement`) for a problem's saved statement. */
export function statementSourceHtml(problem) {
  const meta = problem.statementMeta;
  // Statements saved before provenance was recorded have no meta at all. Saying
  // "source not recorded" is the truth; guessing "pasted" because that used to
  // be the only way would be a plausible lie.
  const where = sourceLabel(meta?.source);
  // A damaged date is left out rather than shown as "on —", which reads worse than no date.
  const day = dayOf(meta?.at);
  const when = day ? ` on ${day}` : "";
  return `<p class="muted small ws-statement-source">Statement ${esc(where)}${when}.
    <button type="button" class="link-button" id="ws-replace-statement">Replace it</button></p>`;
}
