// Shared UI primitives: escaping, small formatters, toasts.
//
// Where this fits: the bottom of the view layer. Everything that renders
// imports from here; this imports from nothing but logic.js, which keeps the
// dependency direction one-way and means a view module can be split off
// without creating a cycle back through views.js.
//
import { OUTCOMES, todayISO, dayOf } from "./logic.js";

// Why it exists: views.js had grown past 3,000 lines holding the dashboard,
// queue, session, settings and a dozen shared helpers, and every new feature
// made it worse. Splitting it needs these primitives to live somewhere both
// halves can reach.

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Escaped text with markdown-style `inline code` marked up.
 *
 * The topic content is written as prose with backticks around identifiers —
 * "Using `if` to shrink when the window needs a `while`" — and rendering it
 * through esc() alone put literal backticks on screen. Escaping happens first
 * and the only markup introduced afterwards is <code>, so this cannot be used
 * to inject anything: by the time the replacement runs there are no angle
 * brackets left to close.
 */
export function richText(s) {
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function pct(x) {
  return x == null ? "—" : `${Math.round(x * 100)}%`;
}

export function mins(x) {
  return x == null ? "—" : `${Math.round(x)} min`;
}

/** What stands in for a date that is not a real day. */
export const NO_DAY = "—";

/** A stored date as MM/DD/YY; a timestamp shows its day, and anything that is not a real day shows a dash. */
export function fmtDate(value) {
  const iso = dayOf(value);
  if (iso === null) return NO_DAY;
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

/** A pattern's display name, from the state that owns the list. Read rather
 * than hardcoded so a second copy can't drift from seed.js. */
export function patternName(state, id) {
  return state.patterns.find((p) => p.id === id)?.name || id;
}

export function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2600);
}

/**
 * A toast that can be taken back.
 *
 * `confirm()` is a speed bump, not a safety net: it asks before you know what
 * you are losing, and it is the one thing everyone clicks through. An undo
 * asks nothing and is still there ten seconds later, which is when people
 * actually notice.
 *
 * `undoFn` is applied inside a normal mutate, so putting something back syncs
 * like any other change rather than being a special case.
 */
export function offerUndo(store, message, undoFn, undoMessage) {
  const el = document.getElementById("toast");
  if (!el) return;
  clearTimeout(toast._t);
  el.textContent = "";

  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);

  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "toast-undo";
  undo.textContent = "Undo";
  undo.addEventListener("click", () => {
    store.mutate(undoFn, undoMessage || "Ledger: undo");
    el.classList.remove("show");
    toast("Put back.");
  });
  el.appendChild(undo);

  el.classList.add("show");
  // Longer than a plain toast: this one is asking a question, and two and a
  // half seconds is not enough time to notice a mistake and reach for it.
  toast._t = setTimeout(() => el.classList.remove("show"), 10000);
}

/**
 * Ask before something this app cannot take back.
 *
 * The counterpart to offerUndo, and the line between them is the whole rule:
 * removing one thing from a list happens immediately and offers an undo,
 * because that is recoverable and a dialog would only be in the way. This is
 * for the rest — replacing the whole log, forgetting the credentials,
 * discarding the copy on the other device — where there is nothing to undo
 * with afterwards.
 *
 * All three parts are required, because the failure they prevent is the same
 * every time: a dialog that says what is about to happen but not what it
 * costs, answered by someone who decided to click yes before reading it.
 * `lost` has to be specific — "2 attempts that exist only on this device",
 * never "your data" — and `kept` exists because most of these are far less
 * frightening than they sound, and saying so is what stops the dialog from
 * being clicked through on reflex.
 */
export function confirmLoss({ action, lost, kept }) {
  return window.confirm(`${action}\n\nThis discards: ${lost}\nThis keeps: ${kept}`);
}

/** Built from the OUTCOMES table rather than repeating it, so an outcome
 * cannot exist in the scheduler and be missing a glyph here. */
export const OUTCOME_GLYPH = Object.fromEntries(
  OUTCOMES.map((o) => [o.value, { symbol: o.symbol, cls: o.cls, title: o.label }]));

/**
 * What an outcome looks like, derived rather than retyped.
 *
 * OUTCOMES carries a `cls` per outcome for exactly this, and its own comment
 * says it replaced five separate lists because that was four chances for a new
 * outcome to be half-added. Two more were then added by hand anyway — an
 * OUTCOME_CLASS in progress-view and an OUTCOME_PILL in session-view — and
 * they had already drifted: the table called `ran-out-of-time` a warning and
 * `failed` bad, while the pill copy called them muted and warning.
 *
 * `outcomeClass` is the plain `outcome-*` name for a dot or an icon;
 * `outcomePill` is the same judgement in the pill vocabulary. Both fall back
 * to the neutral one, because an outcome nobody has heard of is not a failure.
 */
export function outcomeClass(outcome) {
  return OUTCOMES.find((o) => o.value === outcome)?.cls || "outcome-warn";
}

const PILL_FOR_CLASS = { "outcome-good": "pill-good", "outcome-warn": "pill-warn", "outcome-bad": "pill-bad" };

export function outcomePill(outcome) {
  return PILL_FOR_CLASS[outcomeClass(outcome)] || "pill-muted";
}



/** The <option> list for any outcome picker. */
export function outcomeOptions(selected) {
  return OUTCOMES.map((o) =>
    `<option value="${o.value}" ${o.value === selected ? "selected" : ""}>${esc(o.label)}</option>`).join("");
}

/** An outcome's display name. */
export function outcomeLabel(value) {
  return OUTCOMES.find((o) => o.value === value)?.label || value;
}

// Cross-view handoff for "click a pattern card" -> dedicated page, the same
// pattern used elsewhere (chrome.js prefill, reflectState): a module-level
// slot app.js reads via showTopic()/current, not a routed URL param.
export const topicNav = { patternId: null };
export function showTopic(patternId) {
  topicNav.patternId = patternId;
}

// Long enough for the browser to have started reading the blob, short enough
// that a page full of exports doesn't hold them all open.
const REVOKE_DELAY_MS = 1000;

/** Offer some text as a file download. One helper, because the whole-log
 * export and a single problem's history were otherwise the same six lines
 * twice.
 *
 * The anchor goes into the document and the object URL is released on a later
 * turn of the event loop: Firefox ignores a click on a detached anchor, and
 * revoking synchronously can pull the blob out from under a download that has
 * not started reading it yet. */
export function downloadFile(filename, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** The whole log, as the JSON that syncs. This one is for moving your data;
 * a problem's history and a week's account export as Markdown instead,
 * because those are read by people. */
export function downloadState(state) {
  downloadFile(`ledger-export-${todayISO()}.json`, JSON.stringify(state, null, 2));
}
