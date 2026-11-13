// The system-design half of the domain: how a design session is timeboxed, how
// mastery of a component is measured, and how the two halves share one day.
//
// Where this fits: beside logic.js, which owns the coding half, and importing
// from it rather than duplicating. Spaced repetition, box intervals and the
// budget are the same machinery — a design problem is a problem with a
// different practice format, not a different kind of thing.
//
// The framing this whole file follows, and the reason it is not a separate
// feature: a day is 75 minutes of practice, and system design is part of that
// day rather than something you do instead. For anyone aiming past junior, the
// two are assessed in the same loop and should be prepared in the same loop.

import { todayISO, addDaysISO, dayOf, daysBetween, dateSortKey, latestDay, isCleanSolve, seededRandom } from "./logic.js";
import { COMPONENTS } from "./design-components.js";
import { DESIGN_PROBLEMS } from "./design-problems.js";

/**
 * How a design interview actually runs, in the order it runs.
 *
 * This is the order every published framework teaches and the order an
 * interviewer expects, and the order matters more than any one part: an API
 * designed before the entities exist has nothing to carry, and a diagram drawn
 * before the requirements are agreed is a drawing of the wrong system. The
 * session walks them one at a time and will not let the whole thing collapse
 * into "draw boxes for forty minutes", which is what a single open-ended
 * timebox becomes.
 *
 * Each stage is worked, then checked against the answer key before the next
 * one starts. Checking at the end instead — which is what this used to do —
 * finds out on minute forty that the requirements were wrong on minute four,
 * by which point everything built on them was wasted.
 *
 * `kind` is what the stage is worked *in*: a list you write, the board you
 * draw on, or a series of questions put to you. `share` is its slice of the
 * box. Entities is deliberately the shortest — naming the nouns is a two
 * minute job that people routinely spend ten on.
 */
export const DESIGN_STAGES = [
  {
    key: "requirements", label: "Requirements", kind: "write", share: 0.14,
    prompt: "What must it do, and what must be true of how it does it? Functional first, then the non-functional ones that actually decide the design — scale, latency, consistency, availability.",
    hint: "Ask rather than assume, and write down the numbers you are given. A requirement nobody stated is a requirement you invented.",
    placeholder: "Functional:\n- \n\nNon-functional:\n- ",
  },
  {
    key: "entities", label: "Core entities", kind: "write", share: 0.07,
    prompt: "The nouns the system is about, and the few fields that matter. Not a schema — the handful of things every later part of the design will be moving around.",
    hint: "Two minutes. If you are still here at five you are designing the database instead of naming the problem.",
    placeholder: "- User: id, ...\n- ",
  },
  {
    key: "api", label: "API", kind: "write", share: 0.14,
    prompt: "The calls a client makes, with what goes in and what comes back. One line each. This is the contract the high-level design has to satisfy.",
    hint: "Work from the functional requirements: each one should turn into a call. If a requirement has no call, you have missed something.",
    placeholder: "POST /things  { ... } -> { id }\nGET  /things/:id -> { ... }",
  },
  {
    key: "highlevel", label: "High-level design", kind: "draw", share: 0.37,
    prompt: "Boxes and arrows, end to end, on the board. A complete path from client to storage and back before you make any part of it good.",
    hint: "Satisfy the API you just wrote, and nothing more. Optimising a path you have not drawn yet is the most common way to run out of time.",
  },
  {
    key: "deepdive", label: "Deep dives", kind: "questions", share: 0.28,
    prompt: "Now it gets stress-tested. Each question is somewhere the design is likely to break — answer with what you would change and what it costs.",
    hint: "\"It depends\" is not an answer. Name the thing you would do, then name what you gave up to do it.",
  },
];

/** The default box per difficulty. A harder system is not harder to draw so
 *  much as it has more to agree about before anything can be drawn. */
export const DEFAULT_DESIGN_MINUTES = { Easy: 30, Medium: 40, Hard: 50, Unrated: 40 };

/** Below this the stages are ceremony rather than guidance. */
const MIN_DIVISIBLE = 15;

export function designMinutes(state, difficulty) {
  const table = state?.settings?.designMinutes || DEFAULT_DESIGN_MINUTES;
  return table[difficulty] ?? table.Unrated ?? DEFAULT_DESIGN_MINUTES.Unrated;
}

/** A design session's box, in minutes, and how it is divided between stages. */
export function designPlan(state, difficulty) {
  const totalMin = Math.max(1, Math.round(designMinutes(state, difficulty)));
  if (totalMin < MIN_DIVISIBLE) {
    return {
      totalMin,
      stages: [{
        key: "sketch", label: "Sketch", kind: "draw", index: 0,
        startMin: 0, endMin: totalMin, minutes: totalMin,
        prompt: "Short box — requirements, one diagram, one tradeoff named out loud.",
        hint: "",
      }],
    };
  }

  // Allocated by share and then reconciled, so the stages sum to the box
  // exactly. Rounding each independently leaves a box that reports a minute it
  // does not have — the same bug the coding timebox had before it was swept.
  let cursor = 0;
  const stages = DESIGN_STAGES.map((stage, i) => {
    const last = i === DESIGN_STAGES.length - 1;
    const minutes = last ? totalMin - cursor : Math.max(1, Math.round(totalMin * stage.share));
    const startMin = cursor;
    cursor += minutes;
    return {
      key: stage.key, label: stage.label, kind: stage.kind, index: i,
      prompt: stage.prompt, hint: stage.hint, placeholder: stage.placeholder,
      startMin, endMin: cursor, minutes,
    };
  });
  return { totalMin, stages };
}

/**
 * The clock for the stage in hand.
 *
 * Per stage rather than cumulative, because the stages are advanced by hand:
 * you move on when you are done, not when a clock decides. What the box is for
 * is telling you that you have spent nine minutes naming three nouns, which is
 * the mistake it exists to catch. Running over is allowed and shown — it is
 * information, not a buzzer.
 */
export function stageClock(stage, elapsedMs) {
  const usedMin = Math.max(0, elapsedMs) / 60000;
  const remainingMin = stage.minutes - usedMin;
  return {
    usedMin, remainingMin,
    overrun: remainingMin < 0,
    endingSoon: remainingMin <= 1 && remainingMin > 0,
    fraction: stage.minutes > 0 ? Math.min(1, usedMin / stage.minutes) : 1,
  };
}

/** The stage after this one, or null at the end. */
export function nextStage(plan, key) {
  const i = plan.stages.findIndex((s) => s.key === key);
  return i >= 0 ? plan.stages[i + 1] || null : null;
}

/** The part of the answer key a stage is checked against. */
export function keyFor(problem, stageKey) {
  if (!problem) return null;
  switch (stageKey) {
    case "requirements": return problem.requirements || null;
    case "entities": return problem.entities || null;
    case "api": return problem.api || null;
    case "highlevel": return problem.walkthrough || null;
    case "deepdive": return problem.deepDives || null;
    default: return null;
  }
}

// ---------- the bank ----------

export function designProblemById(id) {
  return DESIGN_PROBLEMS.find((p) => p.id === id) || null;
}

export function componentById(id) {
  return COMPONENTS.find((c) => c.id === id) || null;
}

/** Every component a problem's reference answer reaches for, in the order the
 *  walkthrough introduces them and without repeats. */
export function componentsFor(problem) {
  const seen = new Set();
  const out = [];
  for (const stage of problem?.walkthrough || []) {
    for (const id of stage.components || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const component = componentById(id);
      if (component) out.push(component);
    }
  }
  return out;
}

/** The problems whose reference answer uses this component — the practice
 *  ladder for a component page, built from the bank rather than listed by hand
 *  so it cannot drift. */
export function problemsUsing(componentId) {
  return DESIGN_PROBLEMS.filter((p) =>
    (p.walkthrough || []).some((s) => (s.components || []).includes(componentId)));
}

// ---------- your record ----------

/** Every design attempt across every design problem, oldest first. */
export function designAttempts(state, componentId = null) {
  const out = [];
  for (const problem of state?.designProblems || []) {
    for (const attempt of problem.attempts || []) {
      if (componentId && !(attempt.covered || []).includes(componentId)) continue;
      out.push({ ...attempt, problemId: problem.id, problemName: problem.name });
    }
  }
  return out.sort((a, b) => dateSortKey(a).localeCompare(dateSortKey(b)));
}

/**
 * How you are doing on each component.
 *
 * Measured by whether you reached for it unprompted, not by whether you have
 * read its page. An attempt records which components you covered before seeing
 * the reference answer, and which the answer used that you missed — so
 * "recalled" here means the same thing the coding side's pattern recall does:
 * you produced it cold.
 */
export function componentStats(state) {
  return COMPONENTS.map((component) => {
    const relevant = designAttempts(state).filter((a) =>
      (a.covered || []).includes(component.id) || (a.missed || []).includes(component.id));
    const recalled = relevant.filter((a) => (a.covered || []).includes(component.id)).length;
    return {
      component,
      problemCount: problemsUsing(component.id).length,
      seen: relevant.length,
      recalled,
      recallRate: relevant.length ? recalled / relevant.length : null,
      lastSeen: latestDay(relevant),
    };
  });
}

/** Components a reference answer used that you did not name, most often first.
 *  The design half's equivalent of the quiz's confusion list: a specific thing
 *  to go and read rather than a rate to feel bad about. */
export const BLIND_SPOT_MIN = 2;

export function blindSpots(state, min = BLIND_SPOT_MIN) {
  const counts = new Map();
  for (const attempt of designAttempts(state)) {
    for (const id of attempt.missed || []) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= min)
    .map(([id, times]) => ({ component: componentById(id), times }))
    .filter((x) => x.component)
    .sort((a, b) => b.times - a.times);
}

// ---------- one day, two halves ----------

/** What share of the daily budget goes to system design once it is switched on.
 *  Forty-five minutes of coding and thirty of design inside a seventy-five
 *  minute day is the split the default encodes. */
export const DEFAULT_DESIGN_SHARE = 0.4;

export function designShare(state) {
  const raw = state?.settings?.designShare;
  return typeof raw === "number" && raw >= 0 && raw <= 1 ? raw : 0;
}

/**
 * How today's minutes divide between the two halves.
 *
 * Returns whole minutes that sum to the budget. A share of zero means design is
 * off and the day is entirely coding, which is what every existing user gets
 * until they turn it on — this must not silently take time away from someone
 * who never asked for it.
 */
export function splitBudget(state) {
  const budgetMin = state?.settings?.dailyBudgetMin || 75;
  const share = designShare(state);
  const designMin = Math.round(budgetMin * share);
  return { budgetMin, codingMin: budgetMin - designMin, designMin, enabled: share > 0 };
}

/** Design problems ready for another attempt, soonest first. The same Leitner
 *  schedule the coding side uses — a design problem you drew a month ago is due
 *  for the same reason a coding problem is.
 *
 *  With a clock that is not a real day nothing is due: "everything is overdue"
 *  would be a claim, and with no day there is nothing to measure it against. */
export function dueDesignProblems(state, rawToday = todayISO()) {
  const today = dayOf(rawToday);
  if (today === null) return [];
  return (state?.designProblems || [])
    .filter((p) => !p.nextReviewDate || p.nextReviewDate <= today)
    .sort((a, b) => (a.box - b.box) || (a.nextReviewDate || "").localeCompare(b.nextReviewDate || ""));
}

/**
 * Today's design work, filling the design share of the budget.
 *
 * Due problems first, then anything never attempted — the same rule as the
 * coding plan, so a day reads the same on both halves.
 */
export function planDesignToday(state, rawToday = todayISO()) {
  const { designMin, enabled } = splitBudget(state);
  if (!enabled) return { plan: [], usedMin: 0, budgetMin: 0, overflow: [] };

  const due = dueDesignProblems(state, rawToday);
  const fresh = (state?.designProblems || []).filter((p) => !(p.attempts || []).length && !due.includes(p));
  const plan = [];
  const overflow = [];
  let used = 0;
  for (const problem of [...due, ...fresh]) {
    const cost = designMinutes(state, problem.difficulty);
    // The first one always goes in, even if it alone exceeds the share: a
    // budget that plans nothing is worse than one that plans one thing.
    if (plan.length === 0 || used + cost <= designMin) {
      plan.push({ problem, estimateMin: cost });
      used += cost;
    } else {
      overflow.push(problem);
    }
  }
  return { plan, usedMin: used, budgetMin: designMin, overflow };
}

/**
 * The one design thing to do next, or nothing.
 *
 * Deliberately quieter than recommendSession: the coding half owns the
 * dashboard's headline, and two competing recommendations is two people telling
 * you what to do.
 */
export function recommendDesign(state, rawToday = todayISO()) {
  if (!splitBudget(state).enabled) return null;
  // "Done today" and "stable for the day" both need a day; say nothing without one.
  const today = dayOf(rawToday);
  if (today === null) return null;
  const doneToday = designAttempts(state).filter((a) => a.date === today).length;
  if (doneToday) return null;

  const spot = blindSpots(state)[0];
  if (spot) {
    const problem = problemsUsing(spot.component.id)[0];
    if (problem) {
      return {
        type: "blind-spot", problemId: problem.id, componentId: spot.component.id,
        message: `${spot.component.name} has come up in ${spot.times} reference answers you didn't reach for. `
          + `${problem.name} leans on it.`,
      };
    }
  }
  // "Another pass" only makes sense for something you have had a first pass
  // at. A never-attempted problem is new, not neglected — the same distinction
  // the refresher queue draws, and for the same reason: telling somebody they
  // are behind on work they have never seen is the framing this app removed.
  const due = dueDesignProblems(state, rawToday).find((p) => (p.attempts || []).length);
  if (due) {
    return { type: "due", problemId: due.id, componentId: null,
      message: `${due.name} is ready for another pass.` };
  }
  // Drawn from the unattempted ones, stable for the day, rather than always
  // the first in the bank — which made it the URL shortener every morning.
  const fresh = (state?.designProblems || []).filter((p) => !(p.attempts || []).length);
  if (fresh.length) {
    const pick = fresh[Math.floor(seededRandom(`${today}#design`)() * fresh.length)];
    return { type: "first", problemId: pick.id, componentId: null,
      message: `${pick.name} — you haven't worked this one yet.` };
  }
  return null;
}

/**
 * One component to read properly today — what a week's "design topic" day is
 * for — and a problem that uses it, to try straight after.
 *
 * A blind spot first: something the reference answers keep using that you did
 * not reach for. Otherwise one you have not met in any design yet, then the
 * one met longest ago. Stable for the day, so the card does not change its
 * mind between visits.
 */
/** How many of the longest-unmet components a topic day chooses among, and how
 *  long ago counts as "a while" — the same fortnight the coding side uses. */
const STUDY_POOL = 5;
const STUDY_STALE_DAYS = 14;

/** Seeds the topic pick when the clock is unreadable, so the pick is still the same on every call. */
const NO_DAY_SEED = "no-day";

export function studyPick(state, rawToday = todayISO()) {
  // Never null: the topic card reads `pick.component` unguarded.
  const today = dayOf(rawToday);
  const spot = blindSpots(state)[0];
  if (spot) {
    return {
      component: spot.component, problem: problemsUsing(spot.component.id)[0] || null,
      reason: `it was in ${spot.times} reference answers you didn't reach for it in`,
    };
  }
  const withAge = COMPONENTS.map((c) => ({ c, days: componentRecency(state, c.id, today).daysSince }));
  const unmet = withAge.filter((x) => x.days == null);
  const oldest = [...withAge].sort((a, b) => b.days - a.days).slice(0, STUDY_POOL);
  const stale = oldest.filter((x) => x.days >= STUDY_STALE_DAYS);
  const pool = unmet.length ? unmet : stale.length ? stale : oldest;
  const { c, days } = pool[Math.floor(seededRandom(`${today ?? NO_DAY_SEED}#study`)() * pool.length)];
  return {
    component: c, problem: problemsUsing(c.id)[0] || null,
    reason: days == null ? "you haven't used it in a design yet" : `you last met it ${days} days ago`,
  };
}

/** How long since a component last appeared in anything you attempted. Feeds
 *  the same "it's been a while" framing the coding side uses, rather than a
 *  deadline nobody set. */
export function componentRecency(state, componentId, rawToday = todayISO()) {
  const attempts = designAttempts(state, componentId);
  const today = dayOf(rawToday);
  // No day means no age: the same "unknown" as no attempts, never NaN.
  // The latest attempt that has a real day: a damaged date is neither "recent" nor an error.
  const lastDay = latestDay(attempts);
  if (today === null || lastDay === null) return { daysSince: null, tone: "new" };
  const daysSince = daysBetween(lastDay, today);
  return { daysSince, tone: daysSince >= 30 ? "fading" : daysSince >= 14 ? "aWhile" : "recent" };
}

// ---------- drilling components ----------

/**
 * A recall question about a component: its own description, and three others
 * from the same category to choose between.
 *
 * Same-category distractors on purpose. "Is this a cache or a load balancer"
 * is not a question anybody gets wrong; "is this Redis or a CDN" is, and
 * telling two things in the same family apart is what the interview actually
 * tests.
 */
export function pickComponentQuestion(state, recentIds = []) {
  const stats = componentStats(state);
  const avoid = new Set(recentIds);
  // Weighted toward what you have missed and away from what you have just been
  // asked — the same priority the coding quiz uses.
  const weighted = stats
    .filter((s) => !avoid.has(s.component.id))
    .map((s) => ({
      component: s.component,
      weight: 1 + (s.recallRate == null ? 1 : (1 - s.recallRate) * 3) + (s.seen === 0 ? 0.5 : 0),
    }));
  if (!weighted.length) return null;
  const total = weighted.reduce((n, w) => n + w.weight, 0);
  let roll = Math.random() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.component;
  }
  return weighted[weighted.length - 1].component;
}

export function componentOptions(component, count = 4) {
  const siblings = COMPONENTS.filter((c) => c.category === component.category && c.id !== component.id);
  // Falls back to the whole library when a category is too small to fill the
  // options, rather than returning two choices and making it a coin flip.
  const pool = siblings.length >= count - 1
    ? siblings
    : [...siblings, ...COMPONENTS.filter((c) => c.category !== component.category)];
  const picked = shuffleLocal(pool).slice(0, count - 1);
  return shuffleLocal([component, ...picked]).map((c) => c.id);
}

function shuffleLocal(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
