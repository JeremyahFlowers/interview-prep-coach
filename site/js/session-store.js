// Checkpointing an in-progress session, so closing the tab doesn't throw the
// work away.
//
// Where this fits: js/views.js owns the live `session` object and calls
// checkpoint() whenever something worth keeping changes. On boot, app.js asks
// for restore() before the first render, so a reload lands back in the
// workspace rather than on the dashboard.
//
// Why it exists: `session` was module state and nothing else. A refresh, a
// followed link, or a phone evicting a background tab discarded the timer, the
// typed code, the whiteboard and the pasted statement, with no warning and no
// way back. The app already asks people to work in a tab for an hour; it has
// to survive that hour.
//
// What is *not* kept here: anything already in the synced state. This holds
// only what exists between starting a problem and saving it, which is exactly
// the window where a crash costs something unrecoverable.

import { storageKey } from "./channel.js";

const KEY = storageKey("ledger.session");

// Past this, a restored session is almost certainly abandoned rather than
// interrupted, and silently resuming it would put a stale problem in front of
// someone who has moved on.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Time the workspace was actually open, given a checkpoint and the present.
 *
 * The clock measures how long you have been working on the problem, so the
 * stretch where the tab was closed is not work and must not be counted. The
 * gap between the last checkpoint and now is therefore removed by moving the
 * start forward — the elapsed time on screen is unchanged by the reload, which
 * is what someone who reloaded would expect to see.
 *
 * Pure, and exported, because this is the part that would otherwise silently
 * produce a nine-hour session after an overnight tab.
 */
export function adjustedStart(snapshot, now) {
  const { startedAt, savedAt } = snapshot;
  if (typeof startedAt !== "number") return null;
  if (typeof savedAt !== "number") return startedAt;
  const away = Math.max(0, now - savedAt);
  return startedAt + away;
}

/** Whether a checkpoint is recent enough to pick back up. */
export function isResumable(snapshot, now) {
  if (!snapshot || typeof snapshot.savedAt !== "number") return false;
  return now - snapshot.savedAt < MAX_AGE_MS;
}

/**
 * Reduce a live session to the parts worth keeping.
 *
 * `problem` is stored by id, never by value: the object in `session` is a
 * reference into the synced state, and writing a stale copy back on restore
 * would resurrect whatever it looked like when the session began.
 *
 * Kept separate from `checkpoint` so the shape of what is stored is one pure
 * function of the session and a clock reading, apart from the storage call.
 */
function snapshotOf(session, now = Date.now()) {
  if (!session || !session.problem) return null;
  return {
    problemId: session.problem.id,
    isMock: !!session.isMock,
    // Which half of a two-mediums round this is, and its budget. Without it a
    // reload mid-round comes back as an ordinary mock with a 45-minute clock,
    // and saving it never hands back to the round.
    pair: session.pair || null,
    startedAt: session.startedAt,
    // Whether this session started the day clock, and so stops it when it ends.
    ownsDayClock: session.ownsDayClock ?? null,
    insightAt: session.insightAt,
    codeLang: session.codeLang,
    code: session.cm ? session.cm.getValue() : session.capturedCode || "",
    checklist: { ...session.checklist },
    whiteboardShown: !!session.whiteboardShown,
    // Falls back to the drawing still waiting to be replayed, never to an
    // empty one. A checkpoint can fire before the board has mounted — a
    // restored session checkpoints its code after a second of typing, and the
    // canvas may not exist yet — and writing [] there would erase the drawing
    // it was in the middle of recovering.
    whiteboard: session.whiteboardCtl?.toJSON
      ? session.whiteboardCtl.toJSON()
      : (session.restoredBoard || []),
    savedAt: now,
  };
}

export function checkpoint(session) {
  try {
    // Building the snapshot reads the editor and the board, which can already
    // be torn down when a late pointer-up or timer fires; that is inside the
    // try so it costs one checkpoint rather than the session that asked.
    const snap = snapshotOf(session);
    if (!snap || !snap.startedAt) return;   // nothing to lose before the clock starts
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch (_) {
    // A full or blocked localStorage must not break an active session; the
    // worst case is the behaviour that existed before this file.
  }
}

/** The stored checkpoint, or null. Never throws on malformed content. */
export function readCheckpoint() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return raw && typeof raw === "object" ? raw : null;
  } catch (_) {
    return null;
  }
}

export function clearCheckpoint() {
  try {
    localStorage.removeItem(KEY);
  } catch (_) { /* nothing to do */ }
}
