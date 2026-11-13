// A live session as an append-only log of events, and the reducer that turns
// one back into state.
//
// Where this fits: pure, below everything, no I/O and no DOM. The transports in
// session-sync.js move these events around; this file decides what an event is
// and what a log means. Keeping the two apart is the whole point — a durable
// channel and a live one carry identical events, and neither needs to know the
// other exists.
//
// See docs/realtime-architecture.md for why it is a log and not a series of
// state snapshots. Briefly: two transports with different latencies cannot
// share snapshots without one of them arriving carrying an older whole-world
// and overwriting the other's work. With identified events there is nothing to
// overwrite, and applying one twice is a no-op — which is what makes it safe to
// run both at once.

/** The kinds a board compaction replaces. Nothing else is absorbable: a
 *  snapshot of the drawing has no business swallowing the session event, the
 *  timer, or the interviewer's notes — which is exactly what a per-device
 *  high-water mark did until it was told to only apply to these. */
const BOARD_KINDS = new Set(["stroke", "stroke-undo", "board", "board-clear"]);

/** Events, in the order the reducer cares about when two share an instant. */
export const KINDS = [
  "session",      // what is being worked: problem, difficulty, the timebox plan
  "timer",        // started / paused / resumed
  "stroke",       // a freehand stroke — what 1.8.0 wrote, kept so old logs replay
  "stroke-undo",  // remove one stroke by id
  "element",      // any board element: pen, arrow, box, circle, text, array
  "element-move", // the same element, somewhere else or a different colour
  "element-del",  // remove one element by id
  "board",        // a compaction: these strokes, and what they absorbed
  "board-clear",
  "code",         // a snapshot of the editor, from whoever holds the lease
  "lease",        // who may type
  "rubric",       // the interviewer's observations
  "note",         // a line of the interviewer's feedback
  "hello",        // someone joined and has no history; send them the board
];

/**
 * A device's identity, stable across sessions and reloads.
 *
 * Per browser rather than per session, because "which device wrote this" is how
 * events are deduplicated and how the code lease is decided, and both have to
 * survive a reload. Namespaced by channel like every other stored key, so a dev
 * build is a different device from the stable one — which it is.
 */
export function deviceId(storage, key) {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const fresh = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    storage.setItem(key, fresh);
    return fresh;
  } catch (_) {
    // Private browsing, or storage refused. A session still works; its events
    // just will not be recognised as this device's after a reload.
    return `ephemeral-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Make an event.
 *
 * `seq` is monotonic per device and the caller owns it, because the id has to be
 * unique without asking anybody — `${deviceId}-${seq}` is, with no coordination,
 * no server and no clock accuracy required.
 */
export function makeEvent({ sessionId, deviceId: device, seq, kind, payload = {}, at = Date.now() }) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown event kind: ${kind}`);
  return { id: `${device}-${seq}`, sessionId, deviceId: device, seq, at, kind, payload };
}

/**
 * Put a log in a defined order.
 *
 * By `at`, then by id. The id tie-break is not decoration: two devices drawing
 * at the same millisecond must produce the same board on both, and without it
 * the order would depend on which arrived first, which is different on each
 * side. Sorting has to be total and deterministic or nothing below it holds.
 */
export function ordered(events) {
  return [...events].sort((a, b) => (a.at - b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Merge logs, dropping duplicates and anything already absorbed by a compaction.
 *
 * Commutative and idempotent by construction: it is a set union keyed by id,
 * then a filter, then a sort. Merge order cannot matter because no step depends
 * on it.
 */
export function mergeLogs(...logs) {
  const byId = new Map();
  for (const log of logs) {
    for (const event of log || []) {
      if (event && event.id && !byId.has(event.id)) byId.set(event.id, event);
    }
  }
  const all = ordered([...byId.values()]);

  // A compaction says which per-device sequence numbers it swallowed. A stroke
  // from a device that was offline can arrive after the snapshot that already
  // contains it, and re-applying it would draw it twice.
  const absorbed = new Map();
  for (const event of all) {
    if (event.kind !== "board") continue;
    for (const [device, seq] of Object.entries(event.payload.absorbed || {})) {
      absorbed.set(device, Math.max(absorbed.get(device) ?? -1, seq));
    }
  }
  if (!absorbed.size) return all;
  return all.filter((event) => {
    if (event.kind === "board") return true;
    // Only board history is absorbable. The high-water mark is per device and
    // spans every kind that device sent, so applying it to all of them dropped
    // the session and timer events a compaction had deliberately kept.
    if (!BOARD_KINDS.has(event.kind)) return true;
    return event.seq > (absorbed.get(event.deviceId) ?? -1);
  });
}

/** The state a session log describes. Everything a view needs, nothing else. */
export function emptyState() {
  return {
    problemId: null, difficulty: null, plan: null,
    startedAt: null, pausedAt: null, pausedMs: 0,
    strokes: [],
    code: "", codeLang: null, codeAt: 0, codeBy: null,
    lease: null, leaseAt: 0,
    rubric: {}, rating: null, notes: [],
    joined: [],
    // What is being worked, for a view that has never seen the practice log and
    // never will. Nothing else about the problem reaches the other side.
    problemName: null, statement: null, url: null,
  };
}

/**
 * Replay a log into state.
 *
 * Idempotent and order-independent, because `mergeLogs` normalises both before this
 * ever runs. Every branch is a pure assignment or an append — nothing here reads
 * the wall clock or the DOM, which is what makes the invariants testable.
 */
export function reduce(events) {
  const state = emptyState();
  for (const event of mergeLogs(events)) {
    const p = event.payload || {};
    switch (event.kind) {
      case "session":
        state.problemId = p.problemId ?? state.problemId;
        state.difficulty = p.difficulty ?? state.difficulty;
        state.plan = p.plan ?? state.plan;
        state.problemName = p.problemName ?? state.problemName;
        state.statement = p.statement ?? state.statement;
        state.url = p.url ?? state.url;
        break;

      case "timer":
        // The clock is described by instants, not by a running total, so every
        // device computes the same elapsed time from the same events without
        // anyone ticking anything.
        if (p.action === "start" && state.startedAt == null) state.startedAt = event.at;
        else if (p.action === "pause" && state.pausedAt == null) state.pausedAt = event.at;
        else if (p.action === "resume" && state.pausedAt != null) {
          state.pausedMs += event.at - state.pausedAt;
          state.pausedAt = null;
        }
        break;

      case "stroke":
      case "element": {
        // Add, or replace in place if it is already there. Replacing rather
        // than appending matters for a redo: undoing and redoing the same
        // element must not leave two of it.
        const el = { id: event.id, ...p };
        const at = state.strokes.findIndex((s) => s.id === el.id);
        if (at >= 0) state.strokes[at] = el; else state.strokes.push(el);
        break;
      }

      case "element-move": {
        // Moving keeps an element's place in the stack. Re-appending it would
        // silently bring it to the front, which is a different drawing.
        const at = state.strokes.findIndex((s) => s.id === p.id);
        if (at >= 0) state.strokes[at] = { ...state.strokes[at], ...p };
        break;
      }

      case "stroke-undo":
      case "element-del":
        state.strokes = state.strokes.filter((s) => s.id !== (p.strokeId ?? p.id));
        break;

      case "board":
        // A compaction replaces the board wholesale. Safe only because mergeLogs()
        // has already dropped the events it absorbed.
        state.strokes = (p.strokes || []).map((s, i) => ({ id: s.id ?? `${event.id}-${i}`, ...s }));
        break;

      case "board-clear":
        state.strokes = [];
        break;

      case "code":
        // Last writer wins by instant. The lease below is what stops two people
        // typing at once; it is a UI affordance, not the integrity mechanism,
        // because a lease event can arrive late and losing a snapshot someone
        // actually typed would be the worse failure.
        if (event.at >= state.codeAt) {
          state.code = p.text ?? state.code;
          state.codeLang = p.lang ?? state.codeLang;
          state.codeAt = event.at;
          state.codeBy = event.deviceId;
        }
        break;

      case "lease":
        if (event.at >= state.leaseAt) {
          state.lease = p.deviceId ?? event.deviceId;
          state.leaseAt = event.at;
        }
        break;

      case "rubric":
        // Merged rather than replaced: an interviewer ticking a fifth box must
        // not clear the four they already ticked if the events arrive apart.
        state.rubric = { ...state.rubric, ...(p.observed || {}) };
        if (p.rating != null) state.rating = p.rating;
        break;

      case "note":
        state.notes.push({ id: event.id, at: event.at, text: p.text || "" });
        break;

      case "hello":
        // Carries nothing and changes nothing. It exists so that whoever is
        // already in the room hears a newcomer and answers with a snapshot —
        // the relay stores nothing, so joining ten minutes in would otherwise
        // show an empty board with no way to know it was wrong.
        state.joined.push({ id: event.id, deviceId: event.deviceId, at: event.at, role: p.role || "viewer" });
        break;
    }
  }
  return state;
}

/** Milliseconds on the clock, from the timer events alone. */
export function elapsedMs(state, now = Date.now()) {
  if (state.startedAt == null) return 0;
  const end = state.pausedAt ?? now;
  return Math.max(0, end - state.startedAt - state.pausedMs);
}

/** Strokes are the bulk of a log; past this many, compaction is worth it. */
export const COMPACT_ABOVE = 200;

/**
 * Replace the board's history with its result.
 *
 * A long session is thousands of stroke events, and the durable copy has to
 * stay small — it lives in a repo whose one-file limit this project has already
 * measured against. The snapshot records the highest sequence number it absorbed
 * per device, so a late event from a device that was offline is dropped rather
 * than drawn twice.
 *
 * The tail is kept uncompacted: events newer than the snapshot are still needed
 * by anyone catching up, and recent strokes are the ones most likely to be
 * in flight.
 */
export function compact(events, { keepTail = 40, now = Date.now() } = {}) {
  const all = mergeLogs(events);
  const boardEvents = all.filter((e) => BOARD_KINDS.has(e.kind));
  if (boardEvents.length <= COMPACT_ABOVE) return all;

  const cut = boardEvents[boardEvents.length - keepTail];
  const upTo = all.slice(0, all.indexOf(cut));
  const tail = all.slice(all.indexOf(cut));

  const absorbed = {};
  for (const e of upTo) {
    if (!BOARD_KINDS.has(e.kind)) continue;
    absorbed[e.deviceId] = Math.max(absorbed[e.deviceId] ?? -1, e.seq);
  }
  const snapshot = {
    id: `compact-${now.toString(36)}`,
    sessionId: all[0]?.sessionId ?? null,
    deviceId: "compaction", seq: 0,
    // Dated before everything it replaces, so ordering puts it first and the
    // tail applies on top of it rather than under it.
    at: (all[0]?.at ?? now) - 1,
    kind: "board",
    payload: { strokes: reduce(upTo).strokes, absorbed },
  };
  // Events that were not about the board are kept whatever their age: the
  // session event, the timer, the interviewer's notes.
  const keptNonBoard = upTo.filter((e) => !BOARD_KINDS.has(e.kind));
  return mergeLogs([snapshot, ...keptNonBoard, ...tail]);
}
