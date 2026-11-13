// The two recall drills: the pattern quiz and the warm-up.
//
// Where this fits: both are pages under Practice that ask the same question in
// different settings — given a problem you have already solved, which pattern
// does it want? The quiz is open-ended and keeps a lifetime score; the warm-up
// is a fixed short run you do before a session to get your head in.
//
// They share a file because they share a shape: module-level question state, a
// weighted pick that avoids repeating what it just asked, and a reveal that
// shows the real approach rather than only marking you wrong.

import { pickQuizProblem, quizOptions, quizConfusions, allAttempts } from "./logic.js";
import { todaysRecommendation } from "./recommendation.js";
import { prepOf } from "./prep.js";
import {
  LANGUAGES, GRADES, pickFluencyCard, recordFluency, fluencySummary,
} from "./fluency.js";
import { CLARIFY_KINDS, pickClarifyPrompt, recordClarify, blindKinds } from "./clarify.js";
import { patternIcon } from "./icons.js";
import { esc, pct, patternName } from "./ui.js";
import { emptyState, ringSvg, wireTabButtons } from "./chrome.js";
import {
  pickComponentQuestion, componentOptions, componentById,
} from "./design-logic.js";
import { startSession } from "./session-view.js";

// ---------- Quiz ----------

// How many answers are kept. Twenty was enough for a trend line and too few
// to see a pattern pair twice; fifty of these is about three kilobytes, which
// the sync budget does not notice.
const QUIZ_MEMORY = 50;

let quizState = { current: null, options: [], answered: null, recentIds: [] };

/** The design half's drill, on the same page as the coding one. Two drills in
 *  two places would be two habits to build; one page with a switch is one. */
let quizMode = "pattern";

/** Open the quiz page on a given drill: "pattern", "component" or "language". */
export function openQuizMode(mode) {
  quizMode = mode;
  if (mode === "language") fluencyDrill = { ...fluencyDrill, card: null };
}

/** Open the quiz page on the fluency drill — the warm-up, for a target that
 *  assumes fluency. */
export function openFluencyDrill() {
  openQuizMode("language");
}

export function renderQuiz(root, store, actions) {
  if (quizMode === "component") return renderComponentQuiz(root, store, actions);
  if (quizMode === "language") return renderFluencyDrill(root, store, actions);
  if (quizMode === "clarify") return renderClarifyDrill(root, store, actions);
  return renderPatternQuiz(root, store, actions);
}

/**
 * Which component is being described?
 *
 * The mirror of the pattern drill, and the same argument for existing: naming
 * the thing from its properties is the recall an interview asks for, where
 * reading its page is recognition.
 */
function renderComponentQuiz(root, store, actions) {
  const state = store.state;
  if (!componentQuiz.current) nextComponentQuestion(state);
  const c = componentQuiz.current;
  const total = state.designQuiz?.totalAsked || 0;
  const correct = state.designQuiz?.totalCorrect || 0;

  root.innerHTML = `
    ${modeSwitchHtml("component")}
    <div class="card">
      <div class="row space-between" style="align-items:center">
        <h2>Component recall</h2>
        <span class="muted small">${correct}/${total} lifetime</span>
      </div>
      <p class="muted">Which component is this? The wrong answers are from the same family on
      purpose — telling two things in the same family apart is what the interview tests.</p>
      <div class="quiz-prompt"><div class="queue-name">${esc(c.concept)}</div></div>
      <div class="quiz-options">
        ${componentQuiz.options.map((id) => {
          const option = componentById(id);
          let cls = "quiz-option";
          if (componentQuiz.answered) {
            if (id === c.id) cls += " correct";
            else if (id === componentQuiz.answered) cls += " incorrect";
          }
          return `<button type="button" class="${cls}" data-answer="${esc(id)}"
            ${componentQuiz.answered ? "disabled" : ""}>${esc(option.name)}</button>`;
        }).join("")}
      </div>
      ${componentQuiz.answered ? `
        <p class="quiz-feedback">${componentQuiz.answered === c.id
          ? "Correct."
          : `It was <strong>${esc(c.name)}</strong>.`} ${esc(c.hook)}</p>
        <div class="row gap-sm">
          <button class="btn btn-primary" id="quiz-next">Next</button>
          <button class="btn btn-ghost" data-goto-component="${esc(c.id)}">Read its page</button>
        </div>` : ""}
    </div>`;

  root.querySelectorAll("[data-answer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      componentQuiz.answered = btn.dataset.answer;
      const right = componentQuiz.answered === c.id;
      store.mutate((s) => {
        if (!s.designQuiz) s.designQuiz = { totalAsked: 0, totalCorrect: 0, recent: [] };
        s.designQuiz.totalAsked += 1;
        if (right) s.designQuiz.totalCorrect += 1;
        s.designQuiz.recent.push({ correct: right, actual: c.id, said: componentQuiz.answered });
        if (s.designQuiz.recent.length > 50) s.designQuiz.recent.shift();
      }, "Ledger: component recall answer");
      actions.rerender();
    });
  });
  root.querySelector("#quiz-next")?.addEventListener("click", () => {
    nextComponentQuestion(state);
    actions.rerender();
  });
  wireModeSwitch(root, actions);
}

function modeSwitchHtml(active) {
  return `
    <div class="card">
      <div class="row gap-sm" role="tablist" aria-label="Which drill">
        <button type="button" class="btn ${active === "pattern" ? "btn-primary" : "btn-ghost"} btn-sm"
          data-quiz-mode="pattern" aria-pressed="${active === "pattern"}">Patterns</button>
        <button type="button" class="btn ${active === "component" ? "btn-primary" : "btn-ghost"} btn-sm"
          data-quiz-mode="component" aria-pressed="${active === "component"}">Components</button>
        <button type="button" class="btn ${active === "language" ? "btn-primary" : "btn-ghost"} btn-sm"
          data-quiz-mode="language" aria-pressed="${active === "language"}">Your language</button>
        <button type="button" class="btn ${active === "clarify" ? "btn-primary" : "btn-ghost"} btn-sm"
          data-quiz-mode="clarify" aria-pressed="${active === "clarify"}">Clarify</button>
      </div>
    </div>`;
}

function wireModeSwitch(root, actions) {
  root.querySelectorAll("[data-quiz-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      quizMode = btn.dataset.quizMode;
      actions.rerender();
    });
  });
  root.querySelectorAll("[data-goto-component]").forEach((btn) => {
    btn.addEventListener("click", () => actions.openComponent(btn.dataset.gotoComponent));
  });
}

let componentQuiz = { current: null, options: [], answered: null, recentIds: [] };

function nextComponentQuestion(state) {
  const component = pickComponentQuestion(state, componentQuiz.recentIds);
  componentQuiz.current = component;
  componentQuiz.answered = null;
  if (!component) return;
  componentQuiz.options = componentOptions(component);
  componentQuiz.recentIds = [component.id, ...componentQuiz.recentIds].slice(0, 6);
}

function renderPatternQuiz(root, store, actions) {
  const state = store.state;
  if (!quizState.current) nextQuizQuestion(state);

  const total = state.quiz.totalAsked;
  const correct = state.quiz.totalCorrect;

  if (!quizState.current) {
    root.innerHTML = `
      ${modeSwitchHtml("pattern")}
      <div class="card">
        <h2>Pattern-recognition drill</h2>
        ${emptyState("quiz", "Nothing to drill yet",
          "This drill shows a problem you've already solved and asks which pattern it used — the recall step that makes a pattern stick. It needs a few logged attempts to draw from.",
          { tab: "queue", label: "See what is ready for a refresher" })}
      </div>`;
    // Wired before returning. The switch to the component drill is on this
    // screen too, and on a fresh account this is the *only* screen — so an
    // early return here made it a button that did nothing, on the one page a
    // new user sees.
    wireModeSwitch(root, actions);
    return;
  }

  const p = quizState.current;
  root.innerHTML = `
    ${modeSwitchHtml("pattern")}
    <div class="card">
      <div class="row space-between" style="align-items:center">
        <h2>Pattern-recognition drill</h2>
        <span class="row gap-sm" style="align-items:center">${total ? ringSvg(correct / total, { size: 36, stroke: 4, label: pct(correct / total),
          description: `${correct} of ${total} pattern-recall questions correct` }) : ""}<span class="muted small">${correct}/${total} lifetime</span></span>
      </div>
      <p class="muted">If this popped up cold in an interview, what pattern would you reach for?</p>
      <div class="quiz-prompt">
        <div class="queue-name">${esc(p.name)}${p.number ? ` <span class="muted">#${p.number}</span>` : ""}</div>
        <span class="pill pill-muted">${esc(p.difficulty)}</span>
      </div>
      <div class="quiz-options">
        ${quizState.options.map((optId) => {
          let cls = "quiz-option";
          if (quizState.answered) {
            if (optId === p.patternId) cls += " correct";
            else if (optId === quizState.answered && optId !== p.patternId) cls += " incorrect";
          }
          return `<button type="button" class="${cls}" data-answer="${esc(optId)}" ${quizState.answered ? "disabled" : ""}><span class="pattern-icon">${patternIcon(optId, { size: 15 })}</span>${esc(patternName(state, optId))}</button>`;
        }).join("")}
      </div>
      ${quizState.answered ? `
        <p class="quiz-feedback">${quizState.answered === p.patternId ? "Correct." : `Actual approach: <strong>${esc(patternName(state, p.patternId))}</strong> — ${esc(p.approach)}`}</p>
        <button class="btn btn-primary" id="quiz-next">Next question</button>
      ` : ""}
    </div>
    ${confusionsHtml(state)}`;

  root.querySelectorAll("[data-answer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      quizState.answered = btn.dataset.answer;
      const isCorrect = quizState.answered === p.patternId;
      store.mutate((s) => {
        s.quiz.totalAsked += 1;
        if (isCorrect) s.quiz.totalCorrect += 1;
        // Which pattern you reached for instead is the whole signal, and it
        // used to be discarded the moment the answer was scored. A rate can
        // say recall is at 62%; only this can say that most of the misses are
        // one particular pair.
        s.quiz.recent.push({
          correct: isCorrect,
          actual: p.patternId,
          said: quizState.answered,
          problemId: p.id,
        });
        if (s.quiz.recent.length > QUIZ_MEMORY) s.quiz.recent.shift();
      }, "Ledger: quiz answer");
      actions.rerender();
    });
  });
  wireModeSwitch(root, actions);
  const nextBtn = root.querySelector("#quiz-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      nextQuizQuestion(state);
      actions.rerender();
    });
  }
}

/**
 * The pairs you keep mixing up.
 *
 * Shown under the drill rather than after each answer: the point is what to
 * study next, which is a question about the last fifty answers and not about
 * the one you just got wrong. Silent until there is something to say — an
 * empty "your confusions" heading implies you have none, when what you have
 * is not enough answers yet.
 */
function confusionsHtml(state) {
  const { pairs, ungraded } = quizConfusions(state);
  if (!pairs.length) return "";
  return `
    <div class="card">
      <h2>What you keep swapping</h2>
      <p class="muted small">Pairs you have mixed up more than once in your last
      ${QUIZ_MEMORY} answers. One mix-up is a slip; twice is worth reading about.</p>
      <ul class="confusion-list">
        ${pairs.map((c) => `
          <li>
            <span class="confusion-pair">
              <span class="pattern-icon">${patternIcon(c.actual, { size: 15 })}</span>
              ${esc(patternName(state, c.actual))}
              <span class="muted small">answered as</span>
              <span class="pattern-icon">${patternIcon(c.said, { size: 15 })}</span>
              ${esc(patternName(state, c.said))}
            </span>
            <span class="row gap-sm" style="align-items:center">
              <span class="muted small">${c.times}&times;</span>
              <button type="button" class="btn btn-ghost btn-xs" data-goto-topic="${esc(c.actual)}">Read it</button>
            </span>
          </li>`).join("")}
      </ul>
      ${ungraded ? `<p class="muted small">${ungraded} older answer${ungraded === 1 ? "" : "s"}
        ${ungraded === 1 ? "is" : "are"} counted in your score but recorded before the app kept
        which pattern you chose, so ${ungraded === 1 ? "it" : "they"} can't appear here.</p>` : ""}
    </div>`;
}

function nextQuizQuestion(state) {
  const p = pickQuizProblem(state, quizState.recentIds);
  quizState.current = p;
  quizState.answered = null;
  if (!p) return;
  quizState.options = quizOptions(state, p.patternId);
  quizState.recentIds = [p.id, ...quizState.recentIds].slice(0, 5);
}

// ---------- Warmup ----------
// A bounded (3-question) version of the same drill, framed as the on-ramp
// into a session rather than open-ended practice — "encourage 5 minutes of
// pattern review before you start."

const WARMUP_LENGTH = 3;
let warmupState = { count: 0, current: null, options: [], answered: null, recentIds: [] };

export function resetWarmup() {
  warmupState = { count: 0, current: null, options: [], answered: null, recentIds: [] };
}

export function renderWarmup(root, store, actions) {
  const state = store.state;
  if (warmupState.count === 0 && !warmupState.current) nextWarmupQuestion(state);

  if (warmupState.count >= WARMUP_LENGTH || (!warmupState.current && warmupState.count > 0)) {
    const rec = todaysRecommendation(state);
    root.innerHTML = `
      <div class="card">
        <h2>Warmed up</h2>
        <p class="muted">${rec.problem ? esc(rec.message) : "Patterns are loaded, and there's nothing due right now — good day to stop here."}</p>
        <div class="row gap">
          ${rec.problem ? `<button class="btn btn-primary" id="warmup-start">Start — ${esc(rec.problem.name)}</button>` : ""}
          <button class="btn btn-ghost" data-tab="dashboard">Back to dashboard</button>
        </div>
      </div>`;
    wireTabButtons(root, actions);
    const startBtn = root.querySelector("#warmup-start");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        startSession(rec.problem);
        resetWarmup();
        actions.switchTab("workspace");
      });
    }
    return;
  }

  if (!warmupState.current) {
    root.innerHTML = `
      <div class="card">
        ${emptyState("quiz", "No warmup available yet",
          "Warmup replays patterns from problems you've already attempted, to get your head in before a session. Log one first.",
          { tab: "queue", label: "See what is ready for a refresher" })}
        <button class="btn btn-ghost" data-tab="dashboard">Back to dashboard</button>
      </div>`;
    wireTabButtons(root, actions);
    return;
  }

  const p = warmupState.current;
  root.innerHTML = `
    <div class="card">
      <div class="row space-between"><h2>Pattern warmup</h2><span class="muted small">${warmupState.count + 1} of ${WARMUP_LENGTH}</span></div>
      <p class="muted">If this popped up cold, what pattern would you reach for?</p>
      <div class="quiz-prompt">
        <div class="queue-name">${esc(p.name)}${p.number ? ` <span class="muted">#${p.number}</span>` : ""}</div>
        <span class="pill pill-muted">${esc(p.difficulty)}</span>
      </div>
      <div class="quiz-options">
        ${warmupState.options.map((optId) => {
          let cls = "quiz-option";
          if (warmupState.answered) {
            if (optId === p.patternId) cls += " correct";
            else if (optId === warmupState.answered && optId !== p.patternId) cls += " incorrect";
          }
          return `<button type="button" class="${cls}" data-answer="${esc(optId)}" ${warmupState.answered ? "disabled" : ""}><span class="pattern-icon">${patternIcon(optId, { size: 15 })}</span>${esc(patternName(state, optId))}</button>`;
        }).join("")}
      </div>
      ${warmupState.answered ? `
        <p class="quiz-feedback">${warmupState.answered === p.patternId ? "Correct." : `It's <strong>${esc(patternName(state, p.patternId))}</strong>.`}</p>
        <button class="btn btn-primary" id="warmup-next">${warmupState.count + 1 >= WARMUP_LENGTH ? "Finish warmup" : "Next"}</button>
      ` : ""}
    </div>`;

  root.querySelectorAll("[data-answer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      warmupState.answered = btn.dataset.answer;
      const isCorrect = warmupState.answered === p.patternId;
      store.mutate((s) => {
        s.quiz.totalAsked += 1;
        if (isCorrect) s.quiz.totalCorrect += 1;
        s.quiz.recent.push({ correct: isCorrect });
        if (s.quiz.recent.length > 20) s.quiz.recent.shift();
      }, "Ledger: warmup answer");
      actions.rerender();
    });
  });
  const nextBtn = root.querySelector("#warmup-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      warmupState.count += 1;
      nextWarmupQuestion(state);
      actions.rerender();
    });
  }
}

function nextWarmupQuestion(state) {
  const p = pickQuizProblem(state, warmupState.recentIds);
  warmupState.current = p;
  warmupState.answered = null;
  if (!p) return;
  warmupState.options = quizOptions(state, p.patternId);
  warmupState.recentIds = [p.id, ...warmupState.recentIds].slice(0, 5);
}

// ---------- Your language ----------

/**
 * The fluency drill: write the idiom from memory, then see it.
 *
 * Typed rather than chosen from options, because recognising the right
 * priority_queue declaration among four is not the skill — producing it on a
 * blank line with the clock running is. The timer is shown and not scored:
 * it is there so "had to think" is an honest grade rather than a flattering one.
 */
let fluencyDrill = { card: null, attempt: "", revealed: false, startedAt: 0, recent: [], lang: null };
const FLUENCY_RECENT = 4;

function drillLanguage(state) {
  const chosen = prepOf(state).language;
  if (chosen && LANGUAGES[chosen]) return chosen;
  const last = allAttempts(state).filter((a) => a.codeLang && LANGUAGES[a.codeLang]).pop();
  return last?.codeLang || null;
}

function nextFluencyCard(state, lang) {
  fluencyDrill = {
    ...fluencyDrill, lang,
    card: pickFluencyCard(state, lang, fluencyDrill.recent),
    attempt: "", revealed: false, startedAt: Date.now(),
  };
}

function renderFluencyDrill(root, store, actions) {
  const state = store.state;
  const lang = drillLanguage(state);

  if (!lang) {
    root.innerHTML = `
      ${modeSwitchHtml("language")}
      <div class="card">
        <h2>Which language will you interview in?</h2>
        <p class="muted">This drills the idioms that come up in nearly every problem — a heap, a BFS
        queue, a grid, a lower bound — until writing them takes no thought. It needs to know which
        language to drill. You can change it under Settings.</p>
        <div class="row gap-sm" style="flex-wrap:wrap">
          ${Object.entries(LANGUAGES).map(([key, l]) => `
            <button type="button" class="btn btn-ghost" data-pick-lang="${key}">${esc(l.label)}</button>`).join("")}
        </div>
      </div>`;
    wireModeSwitch(root, actions);
    root.querySelectorAll("[data-pick-lang]").forEach((btn) => {
      btn.addEventListener("click", () => {
        store.mutate((s) => {
          s.settings.prep = { ...(s.settings.prep || {}), language: btn.dataset.pickLang };
        }, "Ledger: prep — language");
      });
    });
    return;
  }

  if (!fluencyDrill.card || fluencyDrill.lang !== lang) nextFluencyCard(state, lang);
  const { card, revealed } = fluencyDrill;
  const summary = fluencySummary(state, lang);
  const seconds = Math.round(((revealed ? fluencyDrill.revealedAt : Date.now()) - fluencyDrill.startedAt) / 1000);
  const trap = card.pitfalls?.[lang];

  root.innerHTML = `
    ${modeSwitchHtml("language")}
    <div class="card">
      <div class="row space-between" style="align-items:flex-start;gap:0.75rem;flex-wrap:wrap">
        <div>
          <p class="label">${esc(LANGUAGES[lang].label)} · ${esc(card.topic)}</p>
          <h2 class="fluency-prompt">${esc(card.prompt)}</h2>
        </div>
        <span class="muted small">${summary.fluent} of ${summary.total} without thinking</span>
      </div>

      <textarea class="textarea fluency-attempt" id="fluency-attempt" rows="6" spellcheck="false"
        autocapitalize="off" autocorrect="off" ${revealed ? "readonly" : ""}
        placeholder="Write it from memory. Cmd/Ctrl-Enter to check."
        aria-label="Your ${esc(LANGUAGES[lang].label)}">${esc(fluencyDrill.attempt)}</textarea>

      ${revealed ? `
        <div class="fluency-answer">
          <p class="label">The idiom <span class="muted small">· you took ${seconds}s</span></p>
          <pre class="fluency-code"><code>${esc(card.answers[lang])}</code></pre>
          ${trap ? `<p class="fluency-trap"><strong>The trap in ${esc(LANGUAGES[lang].label)}.</strong> ${esc(trap)}</p>` : ""}
        </div>
        <div class="row gap-sm fluency-grades" role="group" aria-label="How did that go">
          ${Object.values(GRADES).map((g) => `
            <button type="button" class="btn ${g.key === "instant" ? "btn-primary" : "btn-ghost"} btn-sm"
              data-fluency-grade="${g.key}">${esc(g.label)}</button>`).join("")}
        </div>
        <p class="muted small">Be honest about "had to think": a few seconds of hesitation on a
        heap declaration is a few seconds you do not have in a forty-five minute round.</p>`
      : `<div class="row gap-sm">
          <button type="button" class="btn btn-primary" id="fluency-reveal">Show the answer</button>
          <span class="muted small" id="fluency-clock">0s</span>
        </div>`}
    </div>`;

  wireModeSwitch(root, actions);

  const box = root.querySelector("#fluency-attempt");
  box?.addEventListener("input", () => { fluencyDrill.attempt = box.value; });
  const reveal = () => {
    fluencyDrill.attempt = box?.value || "";
    fluencyDrill.revealed = true;
    fluencyDrill.revealedAt = Date.now();
    actions.rerender();
  };
  if (!revealed) {
    requestAnimationFrame(() => box?.focus({ preventScroll: true }));
    box?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); reveal(); }
      // Tab indents rather than leaving the box: this is code.
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const at = box.selectionStart;
        box.setRangeText("  ", at, box.selectionEnd, "end");
        fluencyDrill.attempt = box.value;
      }
    });
    root.querySelector("#fluency-reveal")?.addEventListener("click", reveal);
    // A ticking readout, cleared when it leaves the page.
    const clock = root.querySelector("#fluency-clock");
    const tick = setInterval(() => {
      if (!clock.isConnected) { clearInterval(tick); return; }
      clock.textContent = `${Math.round((Date.now() - fluencyDrill.startedAt) / 1000)}s`;
    }, 500);
  }

  root.querySelectorAll("[data-fluency-grade]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const grade = btn.dataset.fluencyGrade;
      fluencyDrill.recent = [card.id, ...fluencyDrill.recent].slice(0, FLUENCY_RECENT);
      store.mutate((s) => recordFluency(s, lang, card.id, grade), `Ledger: fluency — ${card.id}`);
      nextFluencyCard(store.state, lang);
      actions.rerender();
    });
  });
}

// ---------- Clarify ----------

/**
 * A deliberately vague prompt: write the questions you would ask, then see
 * the ones that matter and what each answer changes.
 *
 * Written before revealed, for the same reason as the fluency drill: picking
 * the good questions out of a list is recognition, and the habit being built
 * is producing them unprompted in the first minute of a round. The tick after
 * the reveal is yours to be honest with — the drill cannot tell whether
 * "sorted?" and "is the input in order?" are the same question, and you can.
 */
let clarifyDrill = { prompt: null, written: "", revealed: false, ticked: new Set(), saved: false, recent: [] };
const CLARIFY_RECENT = 3;

function nextClarifyPrompt(state) {
  clarifyDrill = {
    ...clarifyDrill,
    prompt: pickClarifyPrompt(state, clarifyDrill.recent),
    written: "", revealed: false, ticked: new Set(), saved: false,
  };
}

function renderClarifyDrill(root, store, actions) {
  const state = store.state;
  if (!clarifyDrill.prompt) nextClarifyPrompt(state);
  const { prompt, revealed, saved } = clarifyDrill;
  const blind = blindKinds(state);
  const mine = clarifyDrill.written.split("\n").map((l) => l.trim()).filter(Boolean);

  root.innerHTML = `
    ${modeSwitchHtml("clarify")}
    ${blind.length ? `
    <div class="card clarify-habit">
      <p class="small"><strong>You tend not to ask about</strong>
        ${blind.map((b) => `<span class="pill pill-warn">${esc(b.label)} · ${b.asked} of ${b.of}</span>`).join(" ")}</p>
    </div>` : ""}

    <div class="card">
      <p class="label">The interviewer says</p>
      <h2 class="clarify-prompt">“${esc(prompt.prompt)}”</h2>
      ${revealed ? "" : `
      <p class="muted small">Before any code: what would you ask? One question per line. In a real round
      this is the first two or three minutes, and the interviewer is grading it.</p>
      <textarea class="textarea" id="clarify-written" rows="7" spellcheck="true"
        placeholder="Is the input sorted?&#10;What should I return if…">${esc(clarifyDrill.written)}</textarea>
      <div class="row gap-sm" style="margin-top:0.6rem">
        <button type="button" class="btn btn-primary" id="clarify-reveal">Show what matters</button>
        <span class="muted small">Cmd/Ctrl-Enter</span>
      </div>`}
    </div>

    ${revealed ? `
    <div class="clarify-compare">
      <div class="card">
        <h3>You asked</h3>
        ${mine.length ? `<ol class="tight-list">${mine.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>`
          : `<p class="muted">Nothing — which is what starting to code straight away looks like from the other side of the table.</p>`}
      </div>
      <div class="card">
        <h3>What matters here</h3>
        <p class="muted small">Tick the ones you asked, in any wording. Each says what its answer would
        have changed.</p>
        <ul class="checklist clarify-list">
          ${prompt.questions.map((q, i) => `<li><label>
            <input type="checkbox" data-clarify-q="${i}" ${clarifyDrill.ticked.has(i) ? "checked" : ""} ${saved ? "disabled" : ""} />
            <span><strong>${esc(q.q)}</strong> <span class="pill pill-muted">${esc(CLARIFY_KINDS[q.kind].label)}</span><br />
            <span class="muted small">${esc(q.changes)}</span></span>
          </label></li>`).join("")}
        </ul>
        <div class="row gap-sm" style="margin-top:0.7rem">
          ${saved
            ? `<button type="button" class="btn btn-primary" id="clarify-next">Next prompt</button>
               <span class="muted small">Asked ${clarifyDrill.ticked.size} of ${prompt.questions.length}.</span>`
            : `<button type="button" class="btn btn-primary" id="clarify-save">Save</button>`}
        </div>
      </div>
    </div>` : ""}`;

  wireModeSwitch(root, actions);

  const box = root.querySelector("#clarify-written");
  const reveal = () => {
    clarifyDrill.written = box?.value || "";
    clarifyDrill.revealed = true;
    actions.rerender();
  };
  if (box) {
    requestAnimationFrame(() => box.focus({ preventScroll: true }));
    box.addEventListener("input", () => { clarifyDrill.written = box.value; });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); reveal(); }
    });
  }
  root.querySelector("#clarify-reveal")?.addEventListener("click", reveal);

  root.querySelectorAll("[data-clarify-q]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = Number(cb.dataset.clarifyQ);
      if (cb.checked) clarifyDrill.ticked.add(i); else clarifyDrill.ticked.delete(i);
    });
  });
  root.querySelector("#clarify-save")?.addEventListener("click", () => {
    clarifyDrill.saved = true;
    clarifyDrill.recent = [prompt.id, ...clarifyDrill.recent].slice(0, CLARIFY_RECENT);
    store.mutate((st) => recordClarify(st, prompt.id, [...clarifyDrill.ticked]), `Ledger: clarify — ${prompt.id}`);
  });
  root.querySelector("#clarify-next")?.addEventListener("click", () => {
    nextClarifyPrompt(store.state);
    actions.rerender();
  });
}

