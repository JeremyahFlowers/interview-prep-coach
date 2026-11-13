// The Analyze view: paste an unfamiliar problem, see which patterns it looks
// like and — more importantly — why.
//
// Where this fits: its own page under Learn. It closes the loop between not
// recognizing a problem and practicing the pattern it belongs to, by handing
// off straight into the topic page or a logged session.
//
// It lives outside views.js because that file is already the largest in the
// project and this is a self-contained feature with its own state machine.
// Shared chrome helpers are imported rather than re-declared.
//
// A deliberate presentation decision: the ranked probability list leads, not a
// single verdict. The model's ordering is reliable (mean AUC 0.89) well past
// the point where a clean yes/no cut is, so the UI shows the ranking always and
// treats "confident" as a badge a pattern earns, with its measured precision
// shown next to it. Where nothing stands out, it says so.

import { esc, toast, showTopic, pct, patternName } from "./ui.js";

import { analyze, explain, readableFeature, BOUND_IMPLICATIONS } from "./pattern-model.js";
import { problemsForPattern, problemFromCatalog, savedSlugs } from "./catalog.js";
import { patternIcon } from "./icons.js";
import { uid, todayISO, STATUS_ACTIVE, normalizeStatement, modelScorecard, SCORECARD_MIN } from "./logic.js";

const HIGHLIGHT_LEVELS = 4;        // intensity buckets for supporting evidence
const TOP_PREDICTIONS_SHOWN = 8;
const CATALOG_SUGGESTIONS = 8;
// Below this the strongest pattern isn't worth leading with; the view says
// nothing stands out rather than implying a match.
const WEAK_TOP_PROBABILITY = 0.35;

const state = {
  raw: "",
  result: null,
  selected: null,   // which pattern's explanation is on screen
  status: "idle",   // idle | working | done | error
  error: "",
  suggestions: [],
};

/** Reset between visits so a stale analysis never shows under a fresh mount. */
function resetAnalyze() {
  Object.assign(state, { raw: "", result: null, selected: null, status: "idle", error: "", suggestions: [] });
}

export function renderAnalyze(root, store, actions) {
  setPatternNames(store.state.patterns);
  root.innerHTML = `
    <div class="card">
      <h2>What pattern is this?</h2>
      <p class="muted">Paste a problem you don't recognize — statement, examples and constraints.
      You'll get the patterns it resembles, and the exact words and bounds that led there.
      Nothing is uploaded; this runs entirely in your browser.</p>
      <textarea class="textarea" id="analyze-input" data-testid="analyze-input" rows="10"
        placeholder="Paste the full problem here, including the Constraints section — the input bounds are often the strongest clue.">${esc(state.raw)}</textarea>
      <div class="row gap-sm" style="margin-top:0.75rem">
        <button class="btn btn-primary" id="analyze-run" data-testid="analyze-run" ${state.status === "working" ? "disabled" : ""}>
          ${state.status === "working" ? "Analyzing…" : "Analyze"}</button>
        <button class="btn btn-ghost" id="analyze-clear" data-testid="analyze-clear">Clear</button>
      </div>
      ${state.error ? `<p class="banner banner-bad" style="margin-top:0.75rem">${esc(state.error)}</p>` : ""}
    </div>
    <div id="analyze-results">${state.result ? resultsHtml(store) : ""}</div>
    ${scorecardHtml(store.state)}`;

  const input = root.querySelector("#analyze-input");
  root.querySelector("#analyze-run").addEventListener("click", async () => {
    state.raw = input.value.trim();
    if (!state.raw) {
      toast("Paste a problem statement first.");
      return;
    }
    await runAnalysis(root, store, actions);
  });
  root.querySelector("#analyze-clear").addEventListener("click", () => {
    resetAnalyze();
    actions.rerender();
  });

  if (state.result) wireResults(root, store, actions);
  wireScorecard(root, actions);
}

// ---------- How it has done on your problems ----------
//
// The model ships with numbers from a held-out split of a public corpus. Those
// say how it does on problems in general; they say nothing about how it does
// on the ones you actually paste in, which is the only question that decides
// whether you should trust it tomorrow morning.
//
// Called agreement rather than accuracy, deliberately and visibly. You choose
// the pattern on the same form that just showed you the prediction, so a match
// is either the model being right or you being anchored, and there is no way
// to tell which from here. A disagreement carries no such doubt — you read its
// answer and picked something else — so those are named individually and the
// matches are only ever reported as a rate.

function scorecardHtml(state) {
  const card = modelScorecard(state);
  if (card.n === 0) {
    return `
      <div class="card">
        <h2>How it has done on your problems</h2>
        <p class="muted">Nothing to report yet. Analysing a problem and then tracking it
        records what the model said, so this can start answering whether it was any use to you.</p>
      </div>`;
  }

  const body = card.enough
    ? `<div class="stat-row">
         <div class="stat"><span class="stat-num">${pct(card.top1Rate)}</span>
           <span class="stat-label">first guess</span></div>
         <div class="stat"><span class="stat-num">${pct(card.top3Rate)}</span>
           <span class="stat-label">in its top three</span></div>
       </div>
       <p class="muted small">How often its ranking held the pattern you settled on, across
       ${card.n} problems you analysed and then tracked.</p>`
    : `<p class="muted">${card.n} problem${card.n === 1 ? "" : "s"} so far — ${card.needed} more
       before a percentage here would mean anything. A rate over ${card.n} is noise with a
       decimal point on it.</p>`;

  return `
    <div class="card">
      <h2>How it has done on your problems</h2>
      ${body}
      <p class="muted small scorecard-caveat">Read this as agreement, not accuracy. You pick the
      pattern on the same form that just showed you the guess, so a match might be the model being
      right or you being swayed by it. The disagreements below are the honest half: you saw its
      answer and chose differently.</p>
      ${card.disagreements.length ? `
        <h3 class="scorecard-heading">Where you overruled it</h3>
        <ul class="scorecard-list">
          ${card.disagreements.slice(0, SCORECARD_MIN).map((d) => `
            <li>
              <button type="button" class="link-button" data-open-problem="${esc(d.problemId)}">${esc(d.problemName)}</button>
              <span class="muted small">— it said ${esc(patternName(state, d.said))}
              (${Math.round(d.saidProbability * 100)}%), you recorded
              ${esc(patternName(state, d.actual))}</span>
            </li>`).join("")}
        </ul>
        ${card.disagreements.length > SCORECARD_MIN
          ? `<p class="muted small">and ${card.disagreements.length - SCORECARD_MIN} more.</p>` : ""}`
        : `<p class="muted small">You have agreed with its first guess every time so far.</p>`}
    </div>`;
}

function wireScorecard(root, actions) {
  root.querySelectorAll(".scorecard-list [data-open-problem]").forEach((btn) => {
    btn.addEventListener("click", () => actions.openProblem(btn.dataset.openProblem));
  });
}

async function runAnalysis(root, store, actions) {
  state.status = "working";
  state.error = "";
  actions.rerender();
  try {
    state.result = await analyze(state.raw);
    state.selected = state.result.predictions[0]?.pattern || null;
    state.suggestions = await suggestionsFor(state.selected, store);
    state.status = "done";
  } catch (err) {
    state.status = "error";
    state.result = null;
    state.error = `Couldn't run the pattern model: ${err.message}`;
  }
  actions.rerender();
}

async function suggestionsFor(patternId, store) {
  if (!patternId) return [];
  try {
    const owned = savedSlugs(store.state.problems);
    return await problemsForPattern(patternId, { limit: CATALOG_SUGGESTIONS, exclude: owned });
  } catch (_) {
    return []; // the catalog is a bonus; a missing one shouldn't break the analysis
  }
}

// ---------- results ----------

function resultsHtml(store) {
  const r = state.result;
  const top = r.predictions[0];
  const weak = !top || top.probability < WEAK_TOP_PROBABILITY;
  const ex = state.selected ? explain(r, state.selected) : null;

  return `
    ${weak || r.noneApply ? verdictHtml(r, weak) : ""}
    ${constraintsHtml(r, ex)}
    <div class="card">
      <h2>Pattern match</h2>
      <p class="muted small">Ranked by probability. Click one to see the evidence behind it.</p>
      <ul class="pred-list">
        ${r.predictions.slice(0, TOP_PREDICTIONS_SHOWN).map((p) => predictionRowHtml(p)).join("")}
      </ul>
      ${unavailableHtml(r)}
    </div>
    ${ex ? evidenceHtml(r, ex) : ""}
    ${ex ? highlightHtml(r, ex) : ""}
    ${ex ? trackPastedHtml(store) : ""}
    ${ex ? practiceHtml(store) : ""}`;
}

function verdictHtml(r, weak) {
  return `
    <div class="card banner banner-warn">
      <h3 style="margin-top:0">No pattern really stands out</h3>
      <p class="small">The strongest match is only ${Math.round((r.predictions[0]?.probability || 0) * 100)}%.
      That's a real answer, not a failure — the model was trained with problems that belong to none of
      these patterns, so it can tell you when something is outside them. It may be a maths, geometry,
      simulation or ad-hoc problem, or a pattern this model can't predict yet.</p>
    </div>`;
}

/**
 * What the stated input bounds allow, shown on its own rather than inside one
 * pattern's explanation.
 *
 * The bounds are a fact about the problem and what they permit is general
 * algorithmic reasoning — "n is at most 14, so exponential work is affordable"
 * is true no matter which pattern you clicked. It was previously rendered from
 * the selected pattern's weights, so it vanished whenever that pattern happened
 * not to use the feature: an assignment problem capped at n <= 14 showed no
 * reading at all, even though the cap was the entire tell.
 */
function constraintsHtml(r, ex) {
  const parsed = [...r.features.keys()].filter((f) => f.startsWith("c:size:") || f.startsWith("c:value:"));
  if (!parsed.length) {
    return `
      <div class="card">
        <h2>Stated limits</h2>
        <p class="muted small">No input bounds were found. Constraints are often the strongest clue
        about which approach is intended — if the original problem has a Constraints section, paste
        it too.</p>
      </div>`;
  }
  const contributionFor = (feature) => (ex?.constraints || []).find((c) => c.feature === feature);
  return `
    <div class="card">
      <h2>What the limits imply</h2>
      <p class="muted small">Read straight off the constraints you pasted, independent of any
      prediction — this is the sizing argument an interviewer expects you to make out loud.</p>
      <ul class="implication-list">
        ${parsed.map((f) => {
          const bucket = f.split(":")[2];
          const implication = f.startsWith("c:size:") ? BOUND_IMPLICATIONS[bucket] : null;
          const c = contributionFor(f);
          return `<li><strong>${esc(readableFeature(f))}</strong>${implication ? ` — ${esc(implication)}` : ""}
            ${c && ex ? `<span class="muted small">(${c.contribution >= 0 ? "+" : ""}${c.contribution.toFixed(3)} toward ${esc(patternLabel(ex.pattern))})</span>` : ""}</li>`;
        }).join("")}
      </ul>
    </div>`;
}

function predictionRowHtml(p) {
  const pctValue = Math.round(p.probability * 100);
  const selected = p.pattern === state.selected;
  const weak = !p.reliability.precision || p.reliability.precision < 0.65;
  return `
    <li>
      <button type="button" class="pred-row ${selected ? "selected" : ""}" data-pick="${esc(p.pattern)}" data-testid="analyze-prediction">
        <span class="pattern-icon">${patternIcon(p.pattern, { size: 15 })}</span>
        <span class="pred-name">${esc(patternLabel(p.pattern))}</span>
        <span class="pred-bar"><span class="pred-fill ${p.confident ? "confident" : p.likely ? "likely" : ""}"
          style="width:${pctValue}%"></span></span>
        <span class="pred-pct">${pctValue}%</span>
        ${p.confident ? `<span class="pill pill-good" title="Above this pattern's tuned decision threshold — right ${Math.round((p.reliability.precision || 0) * 100)}% of the time on held-out problems">confident</span>` : ""}
        ${p.likely ? `<span class="pill pill-warn" title="Above this pattern's lower bar — right ${Math.round((p.reliability.likelyPrecision || 0) * 100)}% of the time on held-out problems">likely</span>` : ""}
        ${weak ? `<span class="pill pill-muted" title="This pattern's precision on held-out problems is below 65% — treat it as a hint">weak signal</span>` : ""}
      </button>
    </li>`;
}

function unavailableHtml(r) {
  const ids = Object.keys(r.unavailable || {});
  if (!ids.length) return "";
  return `
    <p class="muted small" style="margin-top:0.75rem">
      ${r.coverage.predictable} of ${r.coverage.total} patterns can be predicted.
      Not enough labelled training examples exist yet for
      ${ids.map((id) => esc(patternLabel(id))).join(", ")} — those still have problems in the
      catalog and a Topics page, they just can't be spotted in unseen text.</p>`;
}

// ---------- evidence ----------

function evidenceHtml(r, ex) {
  const label = patternLabel(ex.pattern);
  const regions = ["statement", "example", "constraints"];
  const magnitudes = regions.map((k) => Math.abs(ex.byRegion[k] || 0));
  const scale = Math.max(...magnitudes, 0.0001);


  return `
    <div class="card">
      <h2>Why ${esc(label)}</h2>
      <p class="muted small">Every number here is exact. This model scores a problem by adding up
      one weight per phrase, so a phrase's contribution <em>is</em> its weight — not an estimate of it.</p>

      <h3 class="small-heading">Where the evidence came from</h3>
      <ul class="region-bars">
        ${regions.map((k) => {
          const v = ex.byRegion[k] || 0;
          const width = Math.round((Math.abs(v) / scale) * 100);
          return `<li>
            <span class="region-name">${k}</span>
            <span class="region-bar"><span class="region-fill ${v < 0 ? "against" : ""}" style="width:${width}%"></span></span>
            <span class="region-val">${v >= 0 ? "+" : ""}${v.toFixed(2)}</span>
          </li>`;
        }).join("")}
      </ul>

      <div class="two-col" style="margin-top:1rem">
        <div>
          <h3 class="small-heading">Points toward ${esc(label)}</h3>
          ${evidenceListHtml(ex.supporting, "for")}
        </div>
        <div>
          <h3 class="small-heading">Points away</h3>
          ${ex.opposing.length ? evidenceListHtml(ex.opposing, "against") : `<p class="muted small">Nothing in this problem argues against it.</p>`}
        </div>
      </div>

      ${counterfactualHtml(ex)}

      <p class="muted small" style="margin-top:1rem">
        Reliability on held-out problems: ${Math.round(ex.reliability.precision * 100)}% precision,
        ${Math.round(ex.reliability.recall * 100)}% recall, AUC ${ex.reliability.auc},
        trained on ${ex.reliability.trainedOn} examples.</p>
    </div>`;
}

function evidenceListHtml(items, direction) {
  return `<ul class="evidence-list">
    ${items.map((c) => `
      <li>
        <span class="evidence-term ${direction}">${esc(c.label)}</span>
        <span class="evidence-weight">${c.contribution >= 0 ? "+" : ""}${c.contribution.toFixed(3)}</span>
        ${c.occurrences > 1 ? `<span class="muted small">x${c.occurrences}</span>` : ""}
      </li>`).join("")}
  </ul>`;
}

function counterfactualHtml(ex) {
  const cf = ex.counterfactual;
  if (!cf.flipped) {
    return `<p class="muted small" style="margin-top:1rem">Removing even the strongest
      ${cf.removed.length} phrases doesn't change the call — the evidence is spread across the
      whole problem rather than resting on one giveaway.</p>`;
  }
  return `
    <div class="counterfactual">
      <h3 class="small-heading">What would change its mind</h3>
      <p class="small">Take away ${cf.removed.map((t) => `<code>${esc(t)}</code>`).join(", ")}
      and this stops looking like ${esc(patternLabel(ex.pattern))}${cf.becomes
        ? ` — it becomes <strong>${esc(patternLabel(cf.becomes.pattern))}</strong>
           (${Math.round(cf.becomes.probability * 100)}%)` : ""}.</p>
    </div>`;
}

// ---------- highlighted text ----------

function highlightHtml(r, ex) {
  return `
    <div class="card">
      <h2>In the problem itself</h2>
      <p class="muted small">Shaded by how much each phrase pushed toward
        <strong>${esc(patternLabel(ex.pattern))}</strong>. Darker means it mattered more.</p>
      <div class="hl-legend">
        <span class="muted small">weaker</span>
        ${[1, 2, 3, 4].map((l) => `<span class="hl hl-${l}">&nbsp;&nbsp;</span>`).join("")}
        <span class="muted small">stronger</span>
      </div>
      <div class="analyze-text">${markedUp(r.text, ex.spanWeights)}</div>
    </div>`;
}

/** Accumulate each supporting span's contribution across the characters it
 * covers, then emit runs of equal intensity. Overlapping n-grams stack, so the
 * core of a strong phrase reads darker than its edges — which is honest: those
 * characters really are carrying more of the score. */
function markedUp(text, spanWeights) {
  if (!text) return "";
  const weight = new Float64Array(text.length);
  for (const s of spanWeights) {
    if (s.contribution <= 0 || s.end <= s.start) continue;
    for (let i = s.start; i < s.end && i < weight.length; i++) weight[i] += s.contribution;
  }
  let max = 0;
  for (const w of weight) if (w > max) max = w;

  const level = (i) => (max <= 0 || weight[i] <= 0)
    ? 0
    : Math.min(HIGHLIGHT_LEVELS, Math.ceil((weight[i] / max) * HIGHLIGHT_LEVELS));

  const out = [];
  let runStart = 0;
  let runLevel = level(0);
  for (let i = 1; i <= text.length; i++) {
    const current = i < text.length ? level(i) : -1;
    if (current !== runLevel) {
      const chunk = esc(text.slice(runStart, i));
      out.push(runLevel > 0 ? `<mark class="hl hl-${runLevel}">${chunk}</mark>` : chunk);
      runStart = i;
      runLevel = current;
    }
  }
  return out.join("");
}

// ---------- practice handoff ----------

/**
 * Keep the problem that was actually pasted.
 *
 * The suggestions below are other problems that exercise the same pattern —
 * useful, but not this one. The problem in the box is the one you didn't
 * recognise, which makes it the one most worth tracking, and until now it was
 * the only thing on this page you couldn't keep.
 *
 * It carries its statement (the text is right there) and the ranking, so the
 * workspace opens with the problem already written down and the session can
 * be compared against what you thought going in.
 */
function trackPastedHtml(store) {
  const guessedName = firstLineAsTitle(state.raw);
  const already = store.state.problems.find((p) => p.statement && p.statement === normalizeStatement(state.raw).text);
  if (already) {
    return `
      <div class="card">
        <h2>This one's yours</h2>
        <p class="muted small">You're already tracking this as
          <button type="button" class="link-button" data-open-problem="${esc(already.id)}">${esc(already.name)}</button>.</p>
      </div>`;
  }
  return `
    <div class="card">
      <h2>Keep this problem</h2>
      <p class="muted small">Track the problem you pasted, not just the pattern. It keeps the text
      you pasted as its statement and remembers this ranking, so the workspace opens with the
      problem already in front of you.</p>
      <form id="track-pasted" class="form">
        <div class="two-col">
          <label class="field"><span class="label">Name</span>
            <input class="input" name="name" value="${esc(guessedName)}" placeholder="What's it called?" /></label>
          <label class="field"><span class="label">LeetCode #</span>
            <input class="input" type="number" name="number" placeholder="optional" /></label>
        </div>
        <label class="field"><span class="label">Pattern</span>
          <select class="select" name="patternId">
            ${store.state.patterns.map((pat) => `<option value="${esc(pat.id)}" ${pat.id === state.selected ? "selected" : ""}>${esc(pat.name)}</option>`).join("")}
          </select></label>
        <button class="btn btn-primary btn-sm" type="submit">Track it</button>
      </form>
    </div>`;
}

/**
 * A usable default name from the pasted text.
 *
 * Separate from the form markup because the heuristic is the whole thing:
 * people paste a title line, or they paste straight into the statement, and
 * guessing wrong is fine as long as the field is editable — guessing
 * something absurd is not.
 */
function firstLineAsTitle(raw) {
  const first = String(raw || "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "";
  // A statement's opening sentence is not a title. A title is short and has
  // no sentence punctuation.
  if (first.length > 60 || /[.:;]$/.test(first)) return "";
  return first.replace(/^\d+\s*[.)-]\s*/, "").slice(0, 60);
}

function practiceHtml(store) {
  const pattern = state.selected;
  const label = patternLabel(pattern);
  // Derived on every render rather than marked on the button at click time.
  // Adding one mutates the store, which re-renders this whole view and discards
  // any DOM the click handler had just touched — so "added" has to be something
  // the markup can work out for itself, or it disappears the instant it's set.
  //
  // state.suggestions is the list captured at analysis time and is deliberately
  // not re-filtered against this: a problem you just added should stay put and
  // show as added, not vanish out from under the cursor.
  const owned = savedSlugs(store.state.problems);
  return `
    <div class="card">
      <h2>Practice this shape</h2>
      <p class="muted small">Recognizing the pattern is step one. These are catalog problems that
      exercise ${esc(label)} — add one and it joins the normal spaced-repetition
      rotation.</p>
      <div class="row gap-sm" style="margin-bottom:0.75rem">
        <button class="btn btn-ghost btn-sm" id="open-topic" data-testid="analyze-open-topic">Read the ${esc(label)} page</button>
      </div>
      ${state.suggestions.length === 0
        ? `<p class="empty">No catalog problems found for this pattern.</p>`
        : `<ul class="queue-list">
            ${state.suggestions.map((p) => `
              <li class="queue-item">
                <div>
                  <div class="row gap-sm">
                    <span class="pill pill-muted">${esc(p.difficulty || "—")}</span>
                    ${p.number ? `<span class="pill pill-muted">#${p.number}</span>` : ""}
                  </div>
                  <div class="queue-name">${esc(p.title)}</div>
                </div>
                <div class="row gap-sm">
                  <a class="btn btn-ghost btn-sm" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open</a>
                  ${owned.has(p.slug)
                    ? `<span class="pill pill-good" data-testid="analyze-added">in your queue</span>`
                    : `<button class="btn btn-ghost btn-sm" data-add="${esc(p.slug)}" data-testid="analyze-add-problem">Add to queue</button>`}
                </div>
              </li>`).join("")}
          </ul>`}
    </div>`;
}

function wireResults(root, store, actions) {
  root.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.selected = btn.dataset.pick;
      state.suggestions = await suggestionsFor(state.selected, store);
      actions.rerender();
    });
  });

  const topicBtn = root.querySelector("#open-topic");
  if (topicBtn) {
    topicBtn.addEventListener("click", () => {
      showTopic(state.selected);
      actions.switchTab("topicDetail");
    });
  }

  const trackForm = root.querySelector("#track-pasted");
  if (trackForm) {
    trackForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(trackForm);
      const name = (f.get("name") || "").trim();
      if (!name) {
        toast("Give it a name first — that's how you'll find it again.");
        trackForm.querySelector('[name="name"]').focus();
        return;
      }
      const { text: statement } = normalizeStatement(state.raw);
      const analysis = state.result ? {
        at: todayISO(),
        // Only the top few: the full ranking is 23 numbers, and this lives in
        // a state file with a size limit. Three is enough to remember what
        // you thought and how sure the model was.
        predictions: state.result.predictions.slice(0, 3)
          .map((p) => ({ pattern: p.pattern, probability: Math.round(p.probability * 100) / 100 })),
      } : null;

      const id = uid();
      store.mutate((s) => {
        s.problems.push({
          id,
          name,
          number: f.get("number") ? Number(f.get("number")) : null,
          difficulty: "Unrated",
          patternId: f.get("patternId"),
          approach: "", filePath: "", url: "", notes: "",
          status: STATUS_ACTIVE,
          box: 0,
          nextReviewDate: todayISO(),
          attempts: [],
          statement,
          analysis,
        });
      }, `Ledger: track ${name} from an analysis`);
      toast(`Tracking ${name} — its statement came with it.`);
      actions.rerender();
    });
  }

  root.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const problem = state.suggestions.find((p) => p.slug === btn.dataset.add);
      if (!problem) return;
      // addToQueue re-renders, replacing this button with the "in your queue"
      // pill, so there is nothing to update on the node we were clicked from.
      addToQueue(store, problem, state.selected);
      toast(`${problem.title} added — it will come round for a refresher.`);
    });
  });
}

/** Adds a catalog problem to the user's own tracked list, due immediately, so
 * it shows up in the next session plan like anything else they've logged. */
function addToQueue(store, problem, patternId) {
  // Deliberately carries nothing across. These are *suggestions* — other
  // problems that exercise the same pattern — not the problem that was
  // pasted, so attaching the pasted statement here would show the wrong
  // problem's text in the workspace. Caught in testing: pasting "Longest
  // Substring Without Repeating Characters" attached it to "Substring with
  // Concatenation of All Words". The pasted problem gets its own handoff,
  // in trackPastedProblem below.
  store.mutate((s) => {
    // Same test the markup uses to decide between the button and the pill. Two
    // different notions of "already have this" would let the button offer an
    // add that silently does nothing, or mark something as added that isn't.
    if (savedSlugs(s.problems).has(problem.slug)) return;
    // Added straight into the rotation, not the bank: you just analyzed this
    // problem, so it's something you want in front of you now. The bank is for
    // material you're stockpiling for later.
    s.problems.push(problemFromCatalog(problem, {
      id: uid(),
      status: STATUS_ACTIVE,
      patternId,
      nextReviewDate: todayISO(),
    }));
  }, `Ledger: add ${problem.title} from catalog`);
}

/** Display name for a pattern id.
 *
 * Read from the loaded state rather than a local table: the names live in
 * seed.js, and a second hardcoded copy here would silently drift from it the
 * first time a pattern was renamed. setPatternNames() is called on every
 * render so this stays a lookup rather than threading the store through every
 * html helper. */
let patternNames = {};
function setPatternNames(patterns) {
  patternNames = Object.fromEntries(patterns.map((p) => [p.id, p.name]));
}
function patternLabel(id) {
  return patternNames[id] || id;
}

