// The system-design pages: the component library, one component's deep dive,
// the problem bank, and the interactive walkthrough of a reference answer.
//
// Where this fits: its own module for the same reason analyze-view.js is — a
// self-contained area with its own navigation state, importing the shared
// chrome rather than redeclaring it. It reads from design-logic.js and never
// touches the store except through the handful of mutations at the bottom.
//
// The walkthrough is the piece worth explaining. It reveals the reference
// architecture one stage at a time, and each stage says what it adds, why that
// pressure forced it, and which components it reached for. Showing the finished
// diagram would be faster and would teach almost nothing: the sequence is the
// argument, and reconstructing the argument is what the interview asks for.

import {
  COMPONENTS, CATEGORIES,
} from "./design-components.js";
import { DESIGN_PROBLEMS } from "./design-problems.js";
import { COMPONENT_DEPTH } from "./design-answers.js";
import {
  componentById, componentsFor, problemsUsing, designProblemById,
  componentStats, blindSpots, designAttempts, componentRecency,
  designPlan, splitBudget, dueDesignProblems,
} from "./design-logic.js";
import { esc, pct, fmtDate, toast } from "./ui.js";
import { emptyState, ringSvg } from "./chrome.js";

/** Which component or problem is open. Module-level slots, the same handoff
 *  convention showTopic and showProblem already use. */
const designNav = { componentId: null, problemId: null };

export function showComponent(id) { designNav.componentId = id; }
export function showDesignProblem(id) { designNav.problemId = id; }

/** How far into a walkthrough the reader is. Reset when a different problem
 *  opens, so a stage index never leaks between two of them. */
let walkStage = 0;
let walkProblemId = null;

/** Each follow-up with its answer folded beneath it, so the page can be used
 *  to practise rather than only to read. */
function followUpsHtml(component) {
  const answers = COMPONENT_DEPTH[component.id]?.answers || [];
  return `<div class="followup-list">${component.followUps.map((q, i) => answers[i]
    ? `<details class="followup"><summary>${esc(q)}</summary><p>${esc(answers[i])}</p></details>`
    : `<p class="followup-plain">${esc(q)}</p>`).join("")}</div>`;
}

const list = (items, cls = "tight-list") =>
  `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

// ---------- the component library ----------

export function renderComponents(root, store, actions) {
  const stats = componentStats(store.state);
  const byId = new Map(stats.map((s) => [s.component.id, s]));
  const worked = stats.filter((s) => s.seen > 0);
  const spots = blindSpots(store.state);

  const card = (component) => {
    const stat = byId.get(component.id);
    const recency = componentRecency(store.state, component.id);
    return `
      <button type="button" class="card index-card" data-open-component="${esc(component.id)}">
        <h3>${esc(component.name)}</h3>
        <p class="muted small">${esc(component.hook)}</p>
        <p class="index-card-stat">${stat.seen
          ? `${stat.recalled}/${stat.seen} reached for${recency.daysSince != null ? ` · ${recency.daysSince}d ago` : ""}`
          : `${stat.problemCount} problem${stat.problemCount === 1 ? "" : "s"} use it`}</p>
      </button>`;
  };

  root.innerHTML = `
    <div class="card">
      <h2>Components</h2>
      <p class="muted">The decisions a design interview turns on. There are not many of them, and
      their tradeoffs barely change — which is why the tenth problem teaches less new material than
      the first, and why these are worth learning as a set rather than one design at a time.</p>
      ${worked.length ? `<p class="muted small">You have reached for
        ${new Set(designAttempts(store.state).flatMap((a) => a.covered || [])).size}
        of ${COMPONENTS.length} unprompted.</p>` : ""}
    </div>

    ${spots.length ? `
    <div class="card">
      <h2>What you keep missing</h2>
      <p class="muted small">Components a reference answer used that you did not reach for, more
      than once. A specific thing to go and read rather than a rate to feel bad about.</p>
      <ul class="confusion-list">
        ${spots.slice(0, 6).map((s) => `
          <li>
            <span class="confusion-pair">${esc(s.component.name)}</span>
            <span class="row gap-sm" style="align-items:center">
              <span class="muted small">missed ${s.times}&times;</span>
              <button type="button" class="btn btn-ghost btn-xs"
                data-open-component="${esc(s.component.id)}">Read it</button>
            </span>
          </li>`).join("")}
      </ul>
    </div>` : ""}

    ${Object.entries(CATEGORIES).map(([key, label]) => {
      const inCategory = COMPONENTS.filter((c) => c.category === key);
      if (!inCategory.length) return "";
      return `
        <div class="card">
          <h2>${esc(label)}</h2>
          <div class="index-grid">${inCategory.map(card).join("")}</div>
        </div>`;
    }).join("")}`;

  wireComponentLinks(root, actions);
}

// ---------- one component ----------

export function renderComponentDetail(root, store, actions) {
  const component = componentById(designNav.componentId);
  if (!component) {
    actions.switchTab("components");
    return;
  }
  const stat = componentStats(store.state).find((s) => s.component.id === component.id);
  const users = problemsUsing(component.id);
  const recency = componentRecency(store.state, component.id);

  root.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" id="component-back">← Components</button>

    <div class="card">
      <div class="row space-between" style="align-items:flex-start;gap:0.75rem;flex-wrap:wrap">
        <div>
          <h2 style="margin:0">${esc(component.name)}</h2>
          <p class="muted small" style="margin:0.15rem 0 0">${esc(CATEGORIES[component.category])}</p>
        </div>
        ${stat.seen ? ringSvg(stat.recallRate ?? 0, { size: 44, stroke: 5,
          label: pct(stat.recallRate),
          description: `Reached for unprompted in ${stat.recalled} of ${stat.seen} attempts` }) : ""}
      </div>
      <p class="topic-hook">${esc(component.hook)}</p>
      <p><strong>More precisely.</strong> ${esc(component.concept)}</p>
      ${stat.seen ? `<p class="topic-record muted small">Reached for unprompted
        ${stat.recalled} of ${stat.seen} times${recency.daysSince != null
          ? ` · last met ${recency.daysSince} day${recency.daysSince === 1 ? "" : "s"} ago` : ""}.</p>` : ""}
    </div>

    <div class="card">
      <h2>Reach for it when</h2>
      ${list(component.useWhen)}
    </div>

    <div class="card">
      <h2>What it buys, and what it costs</h2>
      <div class="two-col">
        <div>
          <h3 class="small-heading">Gains</h3>
          ${list(component.tradeoffs.gains)}
        </div>
        <div>
          <h3 class="small-heading">Costs</h3>
          ${list(component.tradeoffs.costs)}
        </div>
      </div>
    </div>

    ${component.alternatives.length ? `
    <div class="card">
      <h2>What else you might have said</h2>
      <p class="muted small">Naming the alternative and why you did not choose it is most of what
      separates a considered answer from a remembered one.</p>
      <ul class="alt-list">
        ${component.alternatives.map((alt) => {
          const other = componentById(alt.id);
          return `<li>
            <button type="button" class="link-button" data-open-component="${esc(alt.id)}">${esc(other.name)}</button>
            <span class="muted small">— instead when ${esc(alt.insteadWhen)}</span>
          </li>`;
        }).join("")}
      </ul>
    </div>` : ""}

    <div class="card">
      <h2>Known limitations</h2>
      <p class="muted small">What it does badly, and how it fails. Volunteering one of these is how
      you show you have used the thing rather than read about it.</p>
      ${list(component.limits)}
    </div>

    <div class="card">
      <h2>Choosing it means planning for</h2>
      <p class="muted small">Every one of these is a follow-up you can pre-empt by saying it first.</p>
      ${list(component.planFor)}
    </div>

    <div class="card">
      <h2>What they ask next</h2>
      <p class="muted small">Answer each one out loud before you open it.</p>
      ${followUpsHtml(component)}
    </div>

    ${COMPONENT_DEPTH[component.id]?.numbers?.length ? `
    <div class="card">
      <h2>Numbers worth knowing</h2>
      <p class="muted small">Orders of magnitude for an estimate, not benchmarks — real figures
      depend on hardware and payload, and saying so is part of using them.</p>
      <dl class="numbers-list">
        ${COMPONENT_DEPTH[component.id].numbers.map(([figure, means]) =>
          `<dt>${esc(figure)}</dt><dd>${esc(means)}</dd>`).join("")}
      </dl>
    </div>` : ""}

    ${component.depth?.length ? `
    <div class="card">
      <h2>Going deeper</h2>
      <p class="muted small">For when the tradeoffs above are not enough and you want the real
      behaviour.</p>
      <ul class="depth-list">
        ${component.depth.map((d) => `<li>
          <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.label)} &#8599;</a>
          <span class="pill pill-muted">${esc(d.kind)}</span>
          <span class="muted small">${esc(d.level)}</span>
        </li>`).join("")}
      </ul>
    </div>` : ""}

    <div class="card">
      <h2>Where it shows up</h2>
      ${users.length ? `<ul class="week-list">
        ${users.map((p) => `<li>
          <button type="button" class="link-button" data-open-design="${esc(p.id)}">${esc(p.name)}</button>
          <span class="muted small">— ${esc(p.difficulty)}</span>
        </li>`).join("")}
      </ul>` : `<p class="muted small">No problem in the bank leans on this one yet.</p>`}
    </div>`;

  root.querySelector("#component-back").addEventListener("click", () => actions.switchTab("components"));
  wireComponentLinks(root, actions);
}

// ---------- the problem bank ----------

export function renderDesignBank(root, store, actions) {
  const state = store.state;
  const split = splitBudget(state);
  const records = new Map((state.designProblems || []).map((p) => [p.id, p]));
  const due = new Set(dueDesignProblems(state).map((p) => p.id));

  root.innerHTML = `
    <div class="card">
      <h2>System design problems</h2>
      <p class="muted">You draw your answer first, against the clock, and only then read the
      reference. Comparing the two is the exercise — reading it first is not.</p>
      ${split.enabled
        ? `<p class="muted small">${split.designMin} of your ${split.budgetMin} daily minutes are
           set aside for this.</p>`
        : `<p class="muted small">System design is currently off, so none of your daily budget is
           set aside for it. <button type="button" class="link-button" data-goto="settings">Turn it
           on in Settings</button> to have it planned into your day.</p>`}
    </div>

    <div class="card">
      <ul class="queue-list">
        ${DESIGN_PROBLEMS.map((p) => {
          const record = records.get(p.id);
          const attempts = record?.attempts?.length || 0;
          const last = attempts ? record.attempts[attempts - 1] : null;
          return `
            <li class="queue-item">
              <div>
                <div class="queue-name">
                  <button type="button" class="link-button" data-open-design="${esc(p.id)}">${esc(p.name)}</button>
                </div>
                <p class="muted small">${esc(p.prompt)}</p>
                <div class="row gap-sm" style="margin-top:0.35rem;flex-wrap:wrap">
                  <span class="pill pill-muted">${esc(p.difficulty)}</span>
                  ${p.tags.map((t) => `<span class="pill pill-muted">${esc(t)}</span>`).join("")}
                  ${attempts
                    ? `<span class="muted small">${attempts} attempt${attempts === 1 ? "" : "s"} · last ${esc(fmtDate(last.date))}</span>`
                    : `<span class="muted small">not attempted yet</span>`}
                  ${due.has(p.id) && attempts ? `<span class="pill pill-warn">ready again</span>` : ""}
                </div>
              </div>
              <button class="btn btn-primary btn-sm" data-start-design="${esc(p.id)}">Work it</button>
            </li>`;
        }).join("")}
      </ul>
    </div>`;

  wireComponentLinks(root, actions);
}

// ---------- one problem, and its walkthrough ----------

export function renderDesignProblem(root, store, actions) {
  const problem = designProblemById(designNav.problemId);
  if (!problem) {
    actions.switchTab("designBank");
    return;
  }
  if (walkProblemId !== problem.id) { walkProblemId = problem.id; walkStage = 0; }

  const record = (store.state.designProblems || []).find((p) => p.id === problem.id);
  const attempts = record?.attempts || [];
  const plan = designPlan(store.state, problem.difficulty);
  const revealed = walkStage > 0;

  root.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" id="design-back">← Problems</button>

    <div class="card">
      <h2 style="margin:0.35rem 0 0.2rem">${esc(problem.name)}</h2>
      <p class="muted small">${esc(problem.difficulty)} · ${plan.totalMin} min
        ${attempts.length ? `· ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}` : ""}</p>
      <p>${esc(problem.prompt)}</p>
      <div class="row gap-sm" style="margin-top:0.6rem;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-start-design="${esc(problem.id)}">Work it, stage by stage</button>
      </div>
    </div>

    <div class="card">
      <h2>Requirements</h2>
      <div class="two-col">
        <div>
          <h3 class="small-heading">Functional</h3>
          ${list(problem.requirements.functional)}
        </div>
        <div>
          <h3 class="small-heading">Non-functional</h3>
          <p class="muted small">These decide the architecture. Not asking for them is how this
          interview is lost in the first five minutes.</p>
          ${list(problem.requirements.nonFunctional)}
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Back of the envelope</h2>
      <p class="muted small">You are looking for the order of magnitude that decides the design,
      not a number that is right.</p>
      <h3 class="small-heading">Assume</h3>
      ${list(problem.estimate.assumptions)}
      <h3 class="small-heading">Therefore</h3>
      ${list(problem.estimate.derive)}
    </div>

    <div class="card" id="walkthrough">
      <div class="row space-between" style="align-items:flex-start;gap:0.75rem;flex-wrap:wrap">
        <div>
          <h2 style="margin:0">A reference answer</h2>
          <p class="muted small" style="margin:0.2rem 0 0">Built one pressure at a time. There is
          more than one right design — this is one of them, and the reasoning is the part worth
          taking.</p>
        </div>
        ${revealed ? `<span class="muted small">${walkStage} of ${problem.walkthrough.length}</span>` : ""}
      </div>

      ${revealed ? `
        <ol class="walk-stages">
          ${problem.walkthrough.slice(0, walkStage).map((stage, i) => `
            <li class="walk-stage ${i === walkStage - 1 ? "walk-stage-current" : ""}">
              <h3>${i + 1}. ${esc(stage.title)}</h3>
              <p>${esc(stage.says)}</p>
              <p class="muted small"><strong>Why.</strong> ${esc(stage.because)}</p>
              ${stage.watchFor ? `<p class="small walk-watch"><strong>Watch for.</strong> ${esc(stage.watchFor)}</p>` : ""}
              ${(stage.components || []).length ? `
                <div class="row gap-sm walk-components">
                  ${stage.components.map((id) => {
                    const c = componentById(id);
                    return c ? `<button type="button" class="pill pill-muted"
                      data-open-component="${esc(id)}">${esc(c.name)}</button>` : "";
                  }).join("")}
                </div>` : ""}
            </li>`).join("")}
        </ol>` : `
        <p class="muted">Draw your own answer before you open this. Reading it first turns an
        exercise into a lecture.</p>`}

      <div class="row gap-sm" style="margin-top:0.8rem;flex-wrap:wrap">
        ${walkStage < problem.walkthrough.length
          ? `<button class="btn ${revealed ? "btn-ghost" : "btn-primary"} btn-sm" id="walk-next">
               ${revealed ? "Next step" : "Reveal it, step by step"}</button>` : ""}
        ${revealed ? `<button class="btn btn-ghost btn-sm" id="walk-restart">Start over</button>` : ""}
        ${walkStage > 0 && walkStage < problem.walkthrough.length
          ? `<button class="btn btn-ghost btn-sm" id="walk-all">Show the rest</button>` : ""}
      </div>
    </div>

    ${walkStage >= problem.walkthrough.length ? `
    <div class="card">
      <h2>What a good answer covers</h2>
      <p class="muted small">Not what this answer said — what any good one does. Score yourself
      against it rather than against the diagram.</p>
      ${list(problem.rubric)}
    </div>

    <div class="card">
      <h2>What they ask next</h2>
      <p class="muted small">The deep-dive stage puts these to you one at a time, with an answer
      after each. Listed here without them, so reading the page is not reading the answers.</p>
      ${list((problem.deepDives || []).map((d) => d.q))}
    </div>

    <div class="card">
      <h2>Components this leans on</h2>
      <div class="index-grid">
        ${componentsFor(problem).map((c) => `
          <button type="button" class="card index-card" data-open-component="${esc(c.id)}">
            <h3>${esc(c.name)}</h3>
            <p class="muted small">${esc(c.hook)}</p>
          </button>`).join("")}
      </div>
    </div>` : ""}

    ${attempts.length ? `
    <div class="card">
      <h2>Your attempts</h2>
      <ul class="week-list">
        ${[...attempts].reverse().map((a) => `
          <li>
            <span class="muted small">${esc(fmtDate(a.date))}</span>
            <span>— covered ${(a.covered || []).length}, missed ${(a.missed || []).length}</span>
            ${a.notes ? `<blockquote>${esc(a.notes)}</blockquote>` : ""}
          </li>`).join("")}
      </ul>
    </div>` : ""}`;

  root.querySelector("#design-back").addEventListener("click", () => actions.switchTab("designBank"));
  root.querySelector("#walk-next")?.addEventListener("click", () => {
    walkStage = Math.min(walkStage + 1, problem.walkthrough.length);
    actions.rerender();
  });
  root.querySelector("#walk-all")?.addEventListener("click", () => {
    walkStage = problem.walkthrough.length;
    actions.rerender();
  });
  root.querySelector("#walk-restart")?.addEventListener("click", () => {
    walkStage = 0;
    actions.rerender();
  });
  wireComponentLinks(root, actions);
}

/** `data-open-component` and `data-open-design` appear on five of these pages,
 *  so they are bound once here rather than five times badly. */
function wireComponentLinks(root, actions) {
  root.querySelectorAll("[data-open-component]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showComponent(btn.dataset.openComponent);
      actions.switchTab("componentDetail");
    });
  });
  root.querySelectorAll("[data-open-design]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showDesignProblem(btn.dataset.openDesign);
      actions.switchTab("designProblem");
    });
  });
}

/** Reset the walkthrough so the next visit starts closed. Called when a design
 *  session begins: having just drawn your own answer, the reference should not
 *  already be open where you left it. */
export function resetWalkthrough() {
  walkStage = 0;
  walkProblemId = null;
}
