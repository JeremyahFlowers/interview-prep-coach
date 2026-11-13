// Moving session events between devices.
//
// Where this fits: above session-log.js, which owns what an event means, and
// below the workspace, which neither knows nor cares how an event arrived. This
// file is only transport.
//
// One interface, so that adding the fast channel later changes nothing here or
// above:
//
//   publish(event)        send it, eventually or immediately
//   subscribe(handler)    called with each event that arrives; returns unsubscribe
//   status                "connected" | "connecting" | "offline"
//   stop()
//
// This file implements the durable one: your own repo, at a coarse cadence. It
// is what makes handoff work — draw on the tablet, open the laptop, the drawing
// is there. It is not and cannot be the live one: a git commit takes a second or
// two and the rate limit is real, so a stroke-by-stroke cadence would flood the
// history and still not feel live.
//
// See docs/realtime-architecture.md. The design said session logs should live on
// a separate branch to keep `main` a record of releases; that was written
// thinking of the app repo. They go to the *data* repo, whose history is already
// a log of practice ("Ledger: session pattern-recall answer"), so a branch buys
// nothing and costs the Git refs API.

import { mergeLogs, compact, reduce, makeEvent } from "./session-log.js";

/** How often the log is pushed while a session is open. Coarse on purpose. */
export const PUSH_EVERY_MS = 10_000;

/** How often another device's changes are looked for. Slower than pushing: the
 *  common case is one device working alone, and polling for a second device that
 *  is not there is the one cost this pays for nothing. */
const PULL_EVERY_MS = 15_000;

export function sessionPath(sessionId) {
  return `prep-data/sessions/${sessionId}.json`;
}

/**
 * The durable channel.
 *
 * Owns a local copy of the log, which is the authority for what this device
 * knows. Publishing appends and schedules a push; pushing merges with whatever
 * is in the repo first, so two devices that both wrote cannot clobber each
 * other — the merge is commutative, so it does not matter which pushed last.
 */
export function createRepoChannel({ gh, sessionId, now = () => Date.now() }) {
  const path = sessionPath(sessionId);
  let log = [];
  let sha = null;
  let dirty = false;
  let status = "connecting";
  let pushTimer = null;
  let pullTimer = null;
  let stopped = false;
  const handlers = new Set();

  const announce = (events) => {
    if (!events.length) return;
    for (const handler of handlers) {
      for (const event of events) handler(event);
    }
  };

  /** Fold a remote log in, and tell subscribers about anything new to us. */
  const adopt = (remote) => {
    const before = new Set(log.map((e) => e.id));
    const merged = mergeLogs(log, remote);
    log = merged;
    announce(merged.filter((e) => !before.has(e.id)));
  };

  const push = async () => {
    if (stopped || !dirty || !gh) return;
    dirty = false;
    try {
      // Read first, always. Another device may have written since our last
      // push, and the point of merging before writing rather than after is that
      // nothing has to be discarded to resolve it.
      const current = await gh.readJsonFile(path);
      if (current) {
        sha = current.sha;
        adopt(current.data?.events || []);
      }
      // Compacted before it goes, not after it comes back, so the file never
      // gets large in the first place.
      log = compact(log, { now: now() });
      sha = await gh.writeJsonFile(path, { sessionId, events: log, at: now() }, {
        sha,
        message: `Ledger: session ${sessionId.slice(0, 8)}`,
      });
      status = "connected";
    } catch (err) {
      // Anything went wrong: the work is still in `log` and still in the
      // caller's own checkpoint. Mark it unsent and try on the next tick.
      dirty = true;
      sha = err?.code === "conflict" ? null : sha;
      status = "offline";
    }
  };

  const pull = async () => {
    if (stopped || !gh) return;
    try {
      const current = await gh.readJsonFile(path);
      if (current) {
        sha = current.sha;
        adopt(current.data?.events || []);
      }
      status = "connected";
    } catch (_) {
      status = "offline";
    }
  };

  return {
    /** Everything this device knows, replayed. */
    get state() { return reduce(log); },
    get log() { return log; },
    get status() { return status; },

    publish(event) {
      log = mergeLogs(log, [event]);
      dirty = true;
      // Debounced rather than per-event: a stroke every 40ms would otherwise be
      // a commit every 40ms.
      clearTimeout(pushTimer);
      pushTimer = setTimeout(push, PUSH_EVERY_MS);
    },

    /** Send now, without waiting for the debounce — for a phase change, or for
     *  leaving the page, where the next tick may never come. */
    flush() {
      clearTimeout(pushTimer);
      return push();
    },

    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    /** Load what the repo has, once. This is the whole handoff: a device that
     *  was asleep replays and carries on.
     *
     *  Deliberately does not start polling. A function that loads *and* quietly
     *  installs an interval is two jobs, and the interval outlives every caller
     *  that only wanted the first one — which is how this hung a test suite
     *  before the two were split. */
    async start() {
      await pull();
      return reduce(log);
    },

    /** Keep looking for another device's changes. The workspace calls this; a
     *  caller that only wants to catch up does not. */
    watch() {
      clearInterval(pullTimer);
      pullTimer = setInterval(pull, PULL_EVERY_MS);
      return () => clearInterval(pullTimer);
    },

    async stop({ discard = false } = {}) {
      clearTimeout(pushTimer);
      clearInterval(pullTimer);
      // `stopped` is set *after* the final push, not before. Setting it first
      // makes push() early-return, so stop() silently dropped whatever had not
      // been sent yet — which is the one moment it exists to prevent.
      if (!discard && dirty) await push();
      stopped = true;
      if (discard) {
        // The session is over and its attempt is saved; the scratch log is not
        // the durable record and should not accumulate.
        try {
          const current = await gh.readJsonFile(path);
          if (current) await gh.deleteFile(path, current.sha, `Ledger: end session ${sessionId.slice(0, 8)}`);
        } catch (_) {
          /* a leftover scratch file is untidy, not harmful */
        }
      }
    },
  };
}

/**
 * One session's outgoing events, and the channels they go to.
 *
 * Owns the per-device sequence counter, which is the one piece of state that
 * must not be duplicated: two events sharing a sequence number share an id, and
 * then one of them silently disappears into the deduplication. Everything that
 * emits an event goes through here.
 *
 * `channels` is a list rather than one, because the whole point of the event
 * model is that the durable one and a live one can both be attached and neither
 * needs to know. Today there is one.
 */
export function createEmitter({ sessionId, deviceId, channels, seq = 0 }) {
  let next = seq;
  const list = [].concat(channels).filter(Boolean);

  return {
    get seq() { return next; },

    /** Build, send and return an event. Returns it so a caller can apply it
     *  locally without waiting for a channel to echo it back. */
    emit(kind, payload = {}, at = Date.now()) {
      const event = makeEvent({ sessionId, deviceId, seq: next++, kind, payload, at });
      for (const channel of list) channel.publish(event);
      return event;
    },

    /** Send everything pending on every channel now. */
    flush() {
      return Promise.all(list.map((c) => c.flush?.()).filter(Boolean));
    },

    /** Subscribe to arrivals from every channel at once. Events this device
     *  emitted never come back through here — a channel does not announce what
     *  it was given. */
    subscribe(handler) {
      const offs = list.map((c) => c.subscribe(handler));
      return () => offs.forEach((off) => off());
    },
  };
}
