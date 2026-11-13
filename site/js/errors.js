// The app's error surface: one place where anything that goes wrong becomes
// something the user can see.
//
// Where this fits: installed once from app.js at boot, before anything else
// runs. Everything else in the app either throws, rejects, or calls report()
// — none of them decide how a failure is presented.
//
// Why it exists. A session could not be saved, and the reason was not a crash:
// the save button refused, correctly, and said nothing. The user pressed a
// bright, live-looking control over and over with no output of any kind. That
// is the same shape as an exception nobody catches or a promise nobody
// handles — work is lost and the interface looks fine.
//
// So the rule here is that silence is the bug. A failure may be recoverable,
// expected, or the user's own fault, but it may never be invisible.
//
// Two levels, deliberately different:
//   notice   something expected didn't happen, and the user can fix it. A
//            toast; it fades.
//   fault    something broke that shouldn't have. A banner that stays until
//            dismissed, because a message you might have missed is no better
//            than no message.

/** Code on the error raised when a feature needs a GitHub repo and there is none. Callers branch on
 * this rather than on message text, and treat it as "not available here", not as a fault. */
export const LOCAL_ONLY = "local_only";

/** What to tell someone whose drawing could not be kept because there is no repo to put it in. */
export const DRAWINGS_NEED_REPO_NOTE = "Drawings are kept in a GitHub repo, and this device is saving "
  + "on its own, so this one was not saved. Use Back up to GitHub in Settings to keep drawings.";

/** Is this the "needs a repo" refusal? */
export function isLocalOnly(err) {
  return err?.code === LOCAL_ONLY;
}

/** Code on the error raised when a GitHub config is refused before anything changes. */
export const INVALID_CONFIG = "invalid_config";

/** Codes on the errors raised when a chosen backup file is not JSON, or is JSON that is not a Ledger log. */
export const IMPORT_UNPARSEABLE = "import_unparseable";
export const IMPORT_INVALID = "import_invalid";

/** Errors the app raises on purpose, with a message already fit to show. */
export class AppError extends Error {
  /**
   * @param {string} message  shown to the user as written
   * @param {object} [options]
   * @param {string} [options.code]  short machine-readable tag for logging
   * @param {Error}  [options.cause] the underlying failure, logged not shown
   */
  constructor(message, { code = "app_error", cause } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
  }
}

// Kept so Settings can show what went wrong on a device with no console —
// which is every phone. Bounded: this is a debugging aid, not a log file.
const MAX_REMEMBERED = 20;
const remembered = [];

/** Recent failures, newest first. Read by the Settings page. */
export function recentFaults() {
  return remembered.slice().reverse();
}

export function clearFaults() {
  remembered.length = 0;
}

/**
 * Turn any thrown value into something worth showing.
 *
 * An AppError already carries a written message. Anything else is a bug rather
 * than a condition, so the user gets a plain sentence and the detail goes to
 * the console — stack traces are for whoever is fixing it, not for whoever hit
 * it.
 */
function humanize(err, context) {
  if (err instanceof AppError) return err.message;
  const where = context ? ` while ${context}` : "";
  return `Something went wrong${where}. Your work is still saved locally.`;
}

/**
 * Record a failure and show it.
 *
 * `context` is a fragment naming what was being attempted ("saving your
 * session"), used to make the message specific.
 */
export function report(err, context) {
  const entry = {
    at: new Date().toISOString(),
    context: context || "",
    code: err?.code || err?.name || "error",
    message: String(err?.message || err),
  };
  remembered.push(entry);
  if (remembered.length > MAX_REMEMBERED) remembered.shift();

  // The detail, for whoever is debugging. Never rendered.
  console.error(`[ledger] ${context || "error"}:`, err);

  showBanner(humanize(err, context));
  return entry;
}

/**
 * Run `fn`, reporting anything it throws instead of letting it escape.
 *
 * Wraps event handlers and render passes. Returns undefined when `fn` failed,
 * so callers can tell — but the point is that the failure has already been
 * shown by the time this returns.
 */
export function guard(fn, context) {
  return (...args) => {
    try {
      const out = fn(...args);
      // An async handler's rejection would otherwise escape this try block.
      if (out && typeof out.then === "function") {
        return out.catch((err) => { report(err, context); });
      }
      return out;
    } catch (err) {
      report(err, context);
      return undefined;
    }
  };
}

// ---------- the banner ----------

const BANNER_ID = "error-banner";

function showBanner(message) {
  let el = document.getElementById(BANNER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = BANNER_ID;
    el.className = "error-banner";
    el.setAttribute("role", "alert");
    document.body.appendChild(el);
  }
  el.innerHTML = "";

  const text = document.createElement("span");
  // textContent, not innerHTML: an error message can contain anything,
  // including a server's response body.
  text.textContent = message;
  el.appendChild(text);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "error-banner-dismiss";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => el.remove());
  el.appendChild(dismiss);
}

/**
 * Catch what the app itself didn't.
 *
 * Both handlers exist because they catch different things: onerror gets
 * synchronous throws that escaped every try block, unhandledrejection gets
 * async ones. Before this, either would reach the console and stop there,
 * leaving a dead button and a user with no idea why.
 */
export function installErrorHandling() {
  window.addEventListener("error", (event) => {
    // Failed <img>/<script> loads also fire this, on the element rather than
    // the window; those are not worth a banner.
    if (event.error) report(event.error, "");
  });

  window.addEventListener("unhandledrejection", (event) => {
    report(event.reason, "");
  });
}
