// Two mediums in forty-five minutes: the pace a Meta coding round runs at.
//
// Where this fits: above session-view.js, which runs one problem at a time,
// and unchanged by it. A pair mock is two ordinary mock sessions sharing one
// budget: each is given whatever is left of the forty-five minutes, and this
// file decides what that is, which two problems, and whether the round would
// have passed.
//
// Why it is its own thing rather than a longer mock. The skill is not solving
// a medium; it is solving one in twenty minutes *and then another*, which is
// a different discipline — knowing when an approach is good enough to write,
// and not spending the second problem's time polishing the first. A single
// forty-five-minute mock cannot teach that, because it never runs short.
//
// The clock counts working time only. Each problem is reflected on while it is
// fresh, and that reflection does not come out of the second problem's time —
// less like the real round's hard switch, and honest about pace, which is the
// thing being measured.

import { todayISO, daysBetween, dayOf, latestDay, uid } from "./logic.js";
import { storageKey } from "./channel.js";

export const PAIR_MINUTES = 45;
const PAIR_DIFFICULTY = "Medium";

/** Never less than this for the second problem, even when the first overran:
 *  practice at an impossible box teaches nothing, and the verdict already
 *  records that the round was lost. */
export const MIN_SECOND_MIN = 10;

/** Outcomes that count as solving it. "Struggled" still counts — the bar is
 *  getting there inside the time, not getting there gracefully. */
const SOLVED = new Set(["solved-clean", "solved-struggled"]);

/**
 * Two mediums from different patterns.
 *
 * Unattempted first, then the ones longest untouched, because a mock that
 * hands you a problem you solved on Tuesday is a memory test. Stable through
 * the day — rotated by the date rather than random — so reopening the page
 * does not reshuffle the round.
 */
export function pickPair(state, today = todayISO()) {
  // "" (never) when no attempt has a real day: a damaged date must not read as the most recent practice.
  const lastTouched = (p) => latestDay(p.attempts || []) ?? "";
  const mediums = (state?.problems || []).filter((p) => p.difficulty === PAIR_DIFFICULTY);
  if (mediums.length < 2) return null;

  const salt = Number(today.replaceAll("-", ""));
  const hash = (id) => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, salt % 997);
  const ranked = [...mediums].sort((a, b) => {
    const ta = lastTouched(a);
    const tb = lastTouched(b);
    if (ta !== tb) return ta < tb ? -1 : 1;      // "" (never) sorts first
    return hash(a.id) - hash(b.id);
  });

  const first = ranked[0];
  const second = ranked.find((p) => p.patternId !== first.patternId) || ranked[1];
  return [first, second];
}

/**
 * The phases for one problem of a pair, sized to whatever budget it has.
 *
 * Shorter than a normal session's and weighted differently: at this pace there
 * is room for two clarifying questions, not ten, and the approach is said in
 * two sentences rather than argued. Same shape as questionPlan, so the
 * workspace clock renders it without knowing which it has.
 */
export function pairPlan(budgetMin) {
  const totalMin = Math.max(1, Math.round(budgetMin));
  if (totalMin < 8) {
    return { totalMin, phases: [{ key: "solve", label: "Solve", startMin: 0, endMin: totalMin, minutes: totalMin,
      prompt: "Almost no time left. Say the approach, write the core of it, and state what is missing." }] };
  }
  const clarify = 2;
  const approach = 3;
  const test = 3;
  const code = totalMin - clarify - approach - test;
  const spec = [
    ["clarify", "Clarify", clarify, "Two questions at most — input size and the edge case that worries you. Then commit."],
    ["approach", "Approach", approach, "The approach and its complexity in two sentences. If you know the pattern, name it and go."],
    ["code", "Code", code, "Write it once. Polishing this one is spending the second problem's time."],
    ["test", "Test", test, "One normal case and one edge case, traced through the code out loud."],
  ];
  let cursor = 0;
  return {
    totalMin,
    phases: spec.map(([key, label, minutes, prompt]) => {
      const startMin = cursor;
      cursor += minutes;
      return { key, label, prompt, startMin, endMin: cursor, minutes };
    }),
  };
}

// ---------- a round in progress ----------

export function startPair(problems, today = todayISO()) {
  return { id: uid(), date: today, ids: problems.map((p) => p.id), index: 0, results: [] };
}

export const pairIsCurrent = (run, today = todayISO()) =>
  !!run && run.date === today && Array.isArray(run.ids) && run.ids.length === 2;

export const pairFinished = (run) => (run?.results?.length || 0) >= 2;

/** Minutes of the round already worked. */
export const usedMinutes = (run) => (run?.results || []).reduce((n, r) => n + (r.workMin || 0), 0);

/** What the next problem gets: the rest of the round, and never less than the
 *  floor. `short` says the floor was needed — the round was already lost. */
export function budgetFor(run) {
  const left = PAIR_MINUTES - usedMinutes(run);
  return { minutes: Math.max(MIN_SECOND_MIN, left), left, short: left < MIN_SECOND_MIN };
}

/** Record one problem's result and move on. Returns a new run. */
export function recordPairStep(run, { problemId, workMin, outcome }) {
  if (pairFinished(run)) return run;
  return {
    ...run,
    index: run.index + 1,
    results: [...run.results, { problemId, workMin: Math.max(0, Math.round(workMin || 0)), outcome }],
  };
}

/**
 * Whether the round would have passed.
 *
 * "Met" is both solved inside forty-five minutes. "Close" is both solved but
 * over, or one solved in time — the round a borderline debrief argues about.
 * Anything less is "missed". Said in words, because a single number here
 * would hide which of those it was.
 */
export function pairVerdict(run) {
  const results = run?.results || [];
  const total = usedMinutes(run);
  const solved = results.filter((r) => SOLVED.has(r.outcome)).length;
  const inTime = total <= PAIR_MINUTES;
  let bar;
  let message;
  if (solved === 2 && inTime) {
    bar = "met";
    message = `Both solved in ${total} minutes. That is the pace the round runs at.`;
  } else if (solved === 2) {
    bar = "close";
    message = `Both solved, in ${total} minutes — ${total - PAIR_MINUTES} over. The second problem is where the time went missing; next time, write the first one sooner.`;
  } else if (solved === 1 && inTime) {
    bar = "close";
    message = `One solved inside the round. Enough for some loops, not the one this practises for.`;
  } else {
    bar = "missed";
    message = solved === 1
      ? `One solved, and the round ran to ${total} minutes. Worth looking at where the first one's time went.`
      : `Neither solved. Try the pair again as ordinary sessions first — pace comes after the patterns do.`;
  }
  return { bar, message, total, solved, inTime };
}

/** Keep the finished round in the log. Mutates `state`; for store.mutate. */
export const PAIR_MEMORY = 60;
export function recordPairMock(state, run) {
  if (!pairFinished(run)) return;
  const v = pairVerdict(run);
  const log = (state.pairMocks || []).filter((m) => m.id !== run.id);
  log.push({ id: run.id, date: run.date, results: run.results, totalMin: v.total, bar: v.bar });
  state.pairMocks = log.slice(-PAIR_MEMORY);
}

/** How the recent rounds went, for the dashboard. */
export function pairHistory(state, today = todayISO(), days = 30) {
  // A round with no real day is not recent: reading it as one would throw or count it as NaN days old.
  const recent = (state?.pairMocks || []).filter((m) => {
    const day = dayOf(m.date);
    return day !== null && daysBetween(day, today) < days;
  });
  return { rounds: recent.length, met: recent.filter((m) => m.bar === "met").length };
}

export const pairMocksToday = (state, today = todayISO()) =>
  (state?.pairMocks || []).filter((m) => m.date === today).length;

// ---------- where the round in progress is kept ----------

/**
 * The round in progress lives in this browser, not the synced log: it is a
 * place-marker for one sitting on one device, and only the finished round —
 * recordPairMock above — is worth a byte of the log. Here rather than in the
 * view because the session's save path needs it too, and the view imports the
 * session.
 */
const PAIR_KEY = storageKey("ledger.pairMock");

export function readPair() {
  try { return JSON.parse(localStorage.getItem(PAIR_KEY)); } catch (_) { return null; }
}

export function writePair(run) {
  try {
    if (run) localStorage.setItem(PAIR_KEY, JSON.stringify(run));
    else localStorage.removeItem(PAIR_KEY);
  } catch (_) { /* private mode: the round just does not survive a reload */ }
}
