// The live channel: the same events, fast.
//
// Where this fits: beside createRepoChannel in session-sync.js, behind the
// identical interface — publish, subscribe, status, flush, stop. Neither knows
// the other exists, and the emitter sends to both. Events carry ids, so
// receiving one twice is a no-op, which is what makes running both at once safe
// rather than a race.
//
// The division of labour: the repo is durable and slow, this is fast and
// forgets. A stroke drawn while both are connected arrives here in a fraction
// of a second; the same stroke reaches the repo within ten, and that is the copy
// that survives a closed tab. If this never connects, or drops mid-session,
// nothing is lost — the session degrades to handoff speed, which is how it
// worked yesterday.
//
// See docs/realtime-architecture.md §3. Server-Sent Events rather than a
// WebSocket because the traffic is one-way push plus occasional writes, which
// is exactly what SSE is for, and because it is plain HTTP that survives the
// corporate proxies that quietly drop WebSocket upgrades — which matters when
// the other end is an interviewer whose network you cannot debug.

import { mergeLogs, reduce } from "./session-log.js";

/** Strokes arrive faster than they are worth sending one at a time. A frame at
 *  60fps is 16ms; this is short enough to feel immediate and long enough that a
 *  fast scribble is a handful of requests rather than a hundred. */
export const BATCH_MS = 120;

/** How long to wait before trying the stream again, growing each time. Capped,
 *  because a session is forty-five minutes and a relay that has been down for
 *  thirty seconds may well come back. */
const RETRY_MS = [1000, 2000, 5000, 10_000];

export function createLiveChannel({ relayUrl, sessionId, deviceId, fetchImpl, EventSourceImpl } = {}) {
  const fetcher = fetchImpl || globalThis.fetch?.bind(globalThis);
  const Source = EventSourceImpl || globalThis.EventSource;
  const endpoint = relayUrl ? `${relayUrl.replace(/\/$/, "")}/r/${encodeURIComponent(sessionId)}` : null;

  let log = [];
  let status = "offline";
  let source = null;
  let stopped = false;
  let retries = 0;
  let pending = [];
  let batchTimer = null;
  const handlers = new Set();

  const announce = (event) => {
    for (const handler of handlers) handler(event);
  };

  const receive = (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return;   // the relay forwards verbatim; anything could be on the wire
    }
    // A fast scribble is sent as one batch rather than fifty requests, so what
    // arrives is either an event or an envelope holding several.
    const incoming = Array.isArray(parsed?.batch) ? parsed.batch : [parsed];
    for (const event of incoming) {
      if (!event || !event.id) continue;
      // Deduplicated here as well as by the reducer, so a subscriber is never
      // told twice about the same stroke — a view that repaints per event would
      // otherwise flicker for no reason.
      if (log.some((e) => e.id === event.id)) continue;
      log = mergeLogs(log, [event]);
      announce(event);
    }
  };

  function connect() {
    if (stopped || !endpoint || !Source) return;
    status = "connecting";
    try {
      source = new Source(`${endpoint}?from=${encodeURIComponent(deviceId)}`);
    } catch (_) {
      status = "offline";
      return;
    }
    source.onopen = () => { status = "connected"; retries = 0; };
    source.onmessage = (e) => receive(e.data);
    source.onerror = () => {
      status = "offline";
      try { source.close(); } catch (_) { /* already gone */ }
      source = null;
      if (stopped) return;
      // EventSource reconnects on its own, but not after the connection is
      // closed — and closing it is the only way to stop a broken one retrying
      // against a dead relay every second.
      const wait = RETRY_MS[Math.min(retries++, RETRY_MS.length - 1)];
      setTimeout(connect, wait);
    };
  }

  async function send(events) {
    if (!events.length || !endpoint || !fetcher) return;
    try {
      const res = await fetcher(`${endpoint}?from=${encodeURIComponent(deviceId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: events.length === 1 ? JSON.stringify(events[0]) : JSON.stringify({ batch: events }),
      });
      if (res && res.ok && status !== "connected") status = "connected";
    } catch (_) {
      // Dropped on purpose. The durable channel has the same events and will
      // deliver them; re-queueing here would mean the same stroke arriving
      // twice by two routes at different times, which is worse than late.
      status = "offline";
    }
  }

  const flushBatch = () => {
    clearTimeout(batchTimer);
    batchTimer = null;
    const batch = pending;
    pending = [];
    return send(batch);
  };

  return {
    get status() { return status; },
    get state() { return reduce(log); },

    publish(event) {
      log = mergeLogs(log, [event]);
      pending.push(event);
      if (!batchTimer) batchTimer = setTimeout(flushBatch, BATCH_MS);
    },

    flush() { return flushBatch(); },

    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    start() {
      stopped = false;
      connect();
      return Promise.resolve();
    },

    async stop() {
      stopped = true;
      await flushBatch();
      if (source) { try { source.close(); } catch (_) { /* already gone */ } }
      source = null;
      status = "offline";
    },
  };
}
