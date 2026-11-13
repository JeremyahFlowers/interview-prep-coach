// Text helpers for the Markdown exports: block quotes, fenced code and inline names that survive awkward text.
//
// Where this fits: it sits under the two export formatters (problemToMarkdown in detail-view.js and
// weekToMarkdown in progress-view.js), so the quote rule and the fence rule have one home. It must stay
// pure: no DOM, no state, no clock, no imports. The quote and fence helpers return arrays of lines so the callers'
// own `lines.join("\n")` remains the only place a newline is added; inlineText returns one line.

/** The shortest fence Markdown allows; a longer one is used only when the code contains backticks. */
const MIN_FENCE_LENGTH = 3;

/** The fence character. */
const FENCE_CHAR = "`";

/**
 * A language tag is printed into the fence line, so only a single plain word is allowed: a space, backtick or
 * newline there would end the line or the fence and corrupt everything after it. Covers c++, c#, objective-c.
 */
const SAFE_LANG = /^[A-Za-z0-9+#.-]+$/;

/** Any line break a textarea can produce. U+2028 is deliberately not one: Markdown does not treat it as a break. */
const LINE_BREAK = /\r\n|\r|\n/;

const BACKTICK_RUN = /`+/g;

const asText = (value) => (typeof value === "string" ? value : "");

/**
 * The characters that start emphasis, a code span, a link or raw HTML anywhere inside a line. Others (#, -, +, &, |)
 * only act at the start of a block or in constructs the exports do not build, and every printed name follows a fixed
 * prefix, so escaping them would only put backslashes into every "C#" in the raw file.
 */
const INLINE_SPECIALS = /[\\`*_[\]<>]/g;

/**
 * Each line of `text` as a block-quote line: "> line", or a bare ">" for an empty line so the quote does not break.
 * A non-string or empty value gives no lines, because a hand-edited file can put anything in a saved field.
 */
export function quoteLines(text) {
  const s = asText(text);
  if (s === "") return [];
  return s.split(LINE_BREAK).map((line) => (line === "" ? ">" : `> ${line}`));
}

/**
 * `code` as a fenced block, [open, ...code lines, close], with a fence one longer than the longest backtick run
 * in the code so that no line of it can close the block early. No code gives no block.
 */
export function fencedLines(code, lang) {
  const s = asText(code);
  if (s === "") return [];
  const longest = Math.max(0, ...(s.match(BACKTICK_RUN) || []).map((run) => run.length));
  const fence = FENCE_CHAR.repeat(Math.max(MIN_FENCE_LENGTH, longest + 1));
  const tag = typeof lang === "string" && SAFE_LANG.test(lang) ? lang : "";
  return [fence + tag, s, fence];
}

/**
 * A one-line value as Markdown-safe plain text: specials backslash-escaped, line breaks folded to a space, outer
 * whitespace trimmed. A finite number keeps its text (a hand-edited name can be one); anything else is "".
 * Folding happens before escaping so a folded break can never leave a stray backslash behind.
 */
export function inlineText(value) {
  const s = typeof value === "number" && Number.isFinite(value) ? String(value) : asText(value);
  // Split rather than a regex: `\s*(?:break\s*)+` backtracks quadratically on a long run of spaces with no break.
  const folded = s.split(LINE_BREAK).map((line) => line.trim()).filter((line) => line !== "").join(" ");
  return folded.replace(INLINE_SPECIALS, "\\$&");
}
