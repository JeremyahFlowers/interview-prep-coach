// A log with something in it, for anything that needs a screen that isn't empty.
//
// Where this fits: in demo/, not js/. The app proper never imports it; the render check, the local triage
// server and the static demo do, so all three look at the *same* populated state instead of
// each inventing one that drifts from the others and from the real shape.
//
// Two attempts, a mock, a retro, four quiz answers, a design session and a
// running day clock: enough for every list, chart and empty-state branch to
// take its non-empty path.

import { buildSeedState } from "../js/seed.js";
import * as logic from "../js/logic.js";

/** A populated log, built fresh on each call so callers can mutate it. */
export function demoState() {
  const state = buildSeedState();
  const today = logic.todayISO();
  const problem = state.problems[0];
  problem.statement = "Given an array, return indices.";
  problem.statementMeta = { source: "pasted", at: today };
  problem.box = 2;
  problem.attempts = [
    { id: "a1", date: logic.addDaysISO(today, -9), outcome: "failed", patternGuess: "incorrect",
      timeToInsightMin: 18, timeToSolveMin: 45, mistakeTags: ["off-by-one"],
      soulStatement: "never shrank the window", code: "def f(): pass", codeLang: "python" },
    { id: "a2", date: today, outcome: "solved-clean", patternGuess: "correct",
      timeToInsightMin: 4, timeToSolveMin: 22, mistakeTags: [], soulStatement: "shrink from the left" },
  ];
  problem.analysis = { at: today, predictions: [{ pattern: problem.patternId, probability: 0.88 }] };
  state.mocks = [{ id: "m1", date: today, problemId: problem.id, outcome: "solved-struggled",
    communicationRating: 3, durationActualMin: 44, notes: "", checklist: { 0: true, 1: true } }];
  state.journal = [{ id: "j1", date: today, type: "weekly-retro", text: "kept rushing into code" }];
  state.quiz = { totalAsked: 4, totalCorrect: 2, recent: [
    { correct: false, actual: problem.patternId, said: "greedy", problemId: problem.id },
    { correct: false, actual: problem.patternId, said: "greedy", problemId: problem.id },
    { correct: true, actual: problem.patternId, said: problem.patternId, problemId: problem.id },
    { correct: false },
  ] };
  state.systemDesign = { manualUnlock: true, sessions: [
    { id: "s1", date: today, topic: "rate limiter", notes: "token bucket", confidence: 3 }] };
  state.whiteboards = [{ id: "w1", date: today, problemId: problem.id, path: "p.png", caption: "trace" }];
  state.resources = { [problem.patternId]: [{ id: "r1", title: "A talk", url: "https://example.com", addedAt: today }] };
  state.streak = { current: 3, longest: 9, lastActiveDate: today };
  return state;
}
