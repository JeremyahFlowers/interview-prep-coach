// Today's recommendation, as every screen asks for it.
//
// Where it fits: logic.js decides what to recommend from a state and a seed;
// this is the one place that knows which seed. Home shows the recommendation,
// the `s` shortcut starts it, and the drill, long-session and summary views
// point at it — five callers that must agree, or "start the recommended
// problem" starts a different one from the one on screen.
//
// The seed is the date plus how many times "something else" has been pressed
// today, kept per device in localStorage. Per device on purpose: it is a
// preference of the moment, not a record, and syncing it would put a commit on
// every press.

import { recommendSession, todayISO } from "./logic.js";
import { prepPhase } from "./prep.js";
import { storageKey } from "./channel.js";

/** How many seeds "something else" tries before settling for a repeat — the
 *  queue may hold only one problem. */
const SKIP_TRIES = 6;

const skipKey = () => storageKey("ledger.recSkip");

/** How many times "something else" has been pressed today on this device. */
function skipsToday(storage, today) {
  try {
    const saved = JSON.parse(storage?.getItem(skipKey()) || "null");
    return saved?.date === today ? Number(saved.n) || 0 : 0;
  } catch (_) {
    return 0;       // blocked or corrupt storage: today's first pick
  }
}

function writeSkips(storage, today, n) {
  try { storage?.setItem(skipKey(), JSON.stringify({ date: today, n })); } catch (_) { /* private mode */ }
}

const seedFor = (today, n) => (n ? `${today}#${n}` : today);

/** The recommendation every screen shows today. */
export function todaysRecommendation(state, storage = globalThis.localStorage, today = todayISO()) {
  return recommendSession(state, prepPhase(state).key, { seed: seedFor(today, skipsToday(storage, today)) });
}

/**
 * Move on to a different recommendation, and return it.
 *
 * Tries successive seeds until the problem changes, so the button never
 * appears to do nothing; with only one candidate it gives that one back.
 */
export function skipRecommendation(state, storage = globalThis.localStorage, today = todayISO()) {
  const phase = prepPhase(state).key;
  const start = skipsToday(storage, today);
  const current = recommendSession(state, phase, { seed: seedFor(today, start) });
  let n = start;
  let next = current;
  for (let i = 1; i <= SKIP_TRIES; i++) {
    n = start + i;
    next = recommendSession(state, phase, { seed: seedFor(today, n) });
    if (next.problem?.id !== current.problem?.id) break;
  }
  writeSkips(storage, today, n);
  return next;
}
