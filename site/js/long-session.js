// A long day, run as a sequence of steps with a break in the middle.
//
// Where this fits: above week.js and prep.js, which say *that* today is a long
// day; this says what to do with it, in order, and keeps your place while you
// go off and do each part. The dashboard starts it; the steps send you to the
// screens that already exist — the component library, a staged design problem,
// a coding session — and the plan is where you come back to between them.
//
// Why it exists. "Saturday: three hours of system design" is a commitment with
// no shape, and a three-hour session with no shape becomes ninety minutes of
// reading and ninety of feeling vaguely guilty. The advice this follows is
// specific about the shape: past about two hours, deliberate practice stops
// being deliberate, so a long day is two sittings with a genuine break, and
// each sitting has a job — learn the parts, build a system with them, then
// break it and write down where it broke.
//
// Pure data and arithmetic. The run's progress lives in the browser (see
// runStore below) rather than in the synced log: it is a place-marker for one
// day on one device, and every byte of the log is paid for on every save.

import { todayISO } from "./logic.js";
import { dayPlan } from "./prep.js";
import { todaysSlot } from "./week.js";

/** Long enough to leave the desk, short enough not to lose the thread. */
export const BREAK_MIN = 20;

/**
 * The long design session, as shares of whatever the week gave it.
 *
 * Block one learns the parts and builds one system with them; block two builds
 * a harder one, drills the trade-offs, and ends by writing down what broke —
 * which is the one output of the day that is still useful next week.
 */
const DESIGN_STEPS = [
  { key: "blueprint", block: 0, share: 0.15, label: "Components, read properly",
    prompt: "Two components you have been missing — the library marks your blind spots — read end to end: what each buys, what it costs, and what they ask next. Not a skim.",
    action: { tab: "components" } },
  { key: "deconstruct", block: 0, share: 0.29, label: "A system, end to end",
    prompt: "One design problem through all five stages. Requirements before boxes; check each stage against the key before you move on.",
    action: { tab: "designBank" } },
  { key: "break", block: null, share: 0, label: "Break",
    prompt: "Away from the screen. The second block is only worth having if you come back to it with something left.",
    isBreak: true },
  { key: "stress", block: 1, share: 0.29, label: "A harder system",
    prompt: "A second problem, a step up in difficulty if you can manage it. Spend the most care on the deep dives — that stage is where designs break.",
    action: { tab: "designBank" } },
  { key: "tradeoffs", block: 1, share: 0.09, label: "Trade-off drill",
    prompt: "Name the component from what it buys and what it costs. Quick, and the one part of today that tests recall rather than reading.",
    action: { tab: "quiz", mode: "component" } },
  { key: "writeup", block: 1, share: 0.09, label: "What broke",
    prompt: "Two sentences: which component you did not reach for, and which deep dive you could not answer. That is next week's reading list.",
    action: { tab: "journal" } },
];

function designPlanFor(totalMin) {
  const working = Math.max(30, totalMin - BREAK_MIN);
  const shares = DESIGN_STEPS.filter((s) => !s.isBreak).reduce((n, s) => n + s.share, 0);
  let used = 0;
  const work = DESIGN_STEPS.filter((s) => !s.isBreak);
  return DESIGN_STEPS.map((step) => {
    if (step.isBreak) return { ...step, minutes: BREAK_MIN };
    const last = step === work[work.length - 1];
    const minutes = last ? working - used : Math.max(5, Math.round((working * step.share) / shares));
    used += minutes;
    return { ...step, minutes };
  });
}

/** A long coding day, from the day's own blocks, with a break between them. */
function codingPlanFor(state, today) {
  const plan = dayPlan(state, today);
  const steps = [];
  plan.blocks.forEach((block, b) => {
    if (b > 0) {
      steps.push({ key: "break", block: null, label: "Break", minutes: BREAK_MIN, isBreak: true,
        prompt: "Away from the screen. Past two hours in one sitting you stop analysing your own mistakes and start skimming; this is what stops that." });
    }
    for (const part of block.parts) {
      steps.push({
        key: `${part.key}-${b}`, block: b, label: part.label, minutes: part.minutes, prompt: part.prompt,
        action: part.key === "warmup"
          ? (part.warmupKind === "fluency" ? { tab: "quiz", mode: "language" } : { tab: "warmup" })
          : part.key === "core" ? { start: "recommended" }
            : { tab: "journal" },
      });
    }
  });
  return steps;
}

/**
 * Today's long session, or null if today is not one.
 *
 * A day the week gave to the long design session is one; so is any day whose
 * band splits into more than one block. Everything else is an ordinary day
 * and the dashboard handles it as it always has.
 */
export function longSessionFor(state, today = todayISO()) {
  if (!state?.settings?.week) return null;
  const slot = todaysSlot(state, today);
  const deep = (slot.items || []).find((i) => i.kind === "designMock");
  if (deep) {
    return {
      kind: "design", title: `${slot.label}'s long design session`,
      steps: designPlanFor(slot.minutes || 180),
    };
  }
  const plan = dayPlan(state, today);
  if (plan.blocks.length > 1) {
    return { kind: "coding", title: `${slot.label}, in two blocks`, steps: codingPlanFor(state, today) };
  }
  return null;
}

export const totalMinutes = (steps) => steps.reduce((n, s) => n + s.minutes, 0);

// ---------- a run in progress ----------

/**
 * A fresh run, for today. `index` is the step in hand; `startedAt` is when it
 * began, so its clock survives going off to another screen and coming back.
 */
export function startRun(plan, today = todayISO(), now = Date.now()) {
  return { date: today, kind: plan.kind, index: 0, startedAt: now, done: [] };
}

/** Whether a stored run still applies. Yesterday's run is not today's. */
export function runIsCurrent(run, plan, today = todayISO()) {
  return !!run && !!plan && run.date === today && run.kind === plan.kind
    && run.index >= 0 && run.index <= plan.steps.length;
}

/** Move on. `skipped` is recorded rather than lost: the end of the day should
 *  say what was actually done. */
export function advanceRun(run, plan, { skipped = false } = {}, now = Date.now()) {
  const step = plan.steps[run.index];
  if (!step) return run;
  return {
    ...run,
    index: run.index + 1,
    startedAt: now,
    done: [...run.done, { key: step.key, skipped, minutes: Math.round((now - run.startedAt) / 60000) }],
  };
}

export const runFinished = (run, plan) => run.index >= plan.steps.length;

/** Time left on the step in hand. Negative once it has run over, which is
 *  shown rather than enforced. */
export function stepRemaining(step, startedAt, now = Date.now()) {
  const remainingMin = step.minutes - (now - startedAt) / 60000;
  return { remainingMin, overrun: remainingMin < 0 };
}
