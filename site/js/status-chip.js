// What the header chip says about where the log is and whether it is safe.
//
// Where this fits: pure data between the store's `status` and app.js, which paints it. Kept out of
// app.js so the wording — the thing a person relies on to know whether their work is safe — can be
// tested without a browser.

// Each status says what it means *for the user's work*, not what the network
// did. "Offline — showing cached data" describes the app's situation and
// leaves the only question that matters — is what I just did safe? — for the
// user to guess at.
//
// "local" is a warn chip and never good: a good chip would claim a safety that a log held in one
// browser does not have.
const STATUS_MAP = {
  unconfigured: ["Choose where to save", "info",
    "Nothing is being saved yet. Pick where your log should live."],
  local: ["This device only", "warn",
    "Your log is saved in this browser only, and clearing your browser data deletes it. "
    + "Download a copy from Settings now and then, or back up to GitHub."],
  loading: ["Syncing…", "info", "Fetching your log from GitHub."],
  saving: ["Saving…", "info", "Writing your latest changes to GitHub."],
  synced: ["Synced", "good", "Everything you've done is on GitHub."],
  offline: ["Offline", "warn",
    "Your work is saved on this device and will go to GitHub by itself once the connection is back. "
    + "Carry on — nothing is lost. Until then this is the only copy, so don't clear your browser data."],
  conflict: ["Needs a decision", "bad",
    "This log changed somewhere else too. Nothing has been overwritten — choose which version to keep."],
  error: ["Can't save", "bad", "Your work is safe on this device. See Settings for what's wrong."],
};

// In local mode a failed write means the only copy is not being kept, so the generic "safe on this
// device" line would be false exactly when it matters.
const LOCAL_ERROR_EXPLANATION = "This browser refused to save your latest work, so it is not safe yet. "
  + "Use Export now in Settings to keep a copy.";

/** The chip for a store status: text, style class, tooltip and the spoken label. */
export function statusChip(status, error, mode = null) {
  const [text, cls, mapped] = STATUS_MAP[status] || ["", "", ""];
  const explanation = status === "error" && mode === "local" ? LOCAL_ERROR_EXPLANATION : mapped;
  return {
    text,
    cls: `status status-${cls}`,
    // The specific error, if there is one, then what it means. A raw API
    // message on its own tells you what failed and not what to do.
    title: [error, explanation].filter(Boolean).join("\n\n"),
    // Announced, because the chip changing colour in the corner is not something
    // a screen-reader user finds out about otherwise.
    label: `Storage: ${text}. ${explanation}`,
  };
}
