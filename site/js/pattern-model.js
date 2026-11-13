// Runs the pattern classifier in the browser and explains what it did.
//
// Where this fits: the Analyze view calls analyze() with pasted problem text
// and renders the result — ranked pattern probabilities, highlighted spans, a
// per-region evidence breakdown, and counterfactuals.
//
// The model is linear, which is the whole reason the explanations are worth
// showing: a score is sum(weight[f] * value[f]) + intercept, so a feature's
// contribution IS weight x value. Nothing here approximates the model's
// reasoning — it reports the arithmetic the prediction is made of. That also
// makes counterfactuals exact: zero a feature out, add up the rest, and you
// have the genuine "what would it say without this phrase".

import { featurize } from "./featurize.js";

/** A model that could not be loaded or evaluated. Typed so the Analyze view can
 * explain the failure instead of surfacing a raw stack trace. */
export class PatternModelError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name = "PatternModelError";
    this.status = status;
    this.cause = cause;
  }
}

const MODEL_URL = "./model/pattern-model.json";

// How many evidence items explain() returns when the caller doesn't say. Not
// exported: no view reads it, and the old comment claiming otherwise was wrong.
const TOP_EVIDENCE = 12;
const COUNTERFACTUAL_MAX = 6;

let modelPromise = null;

/**
 * Fetch and index the artifact, memoized for the session.
 *
 * `refresh` discards the memo and refetches — the model is retrained by a
 * scheduled workflow, so a session left open can otherwise keep scoring
 * against a superseded artifact with no way to pick up the new one.
 */
export function loadPatternModel({ refresh = false } = {}) {
  if (refresh) modelPromise = null;
  if (!modelPromise) {
    modelPromise = fetch(MODEL_URL)
      .then((res) => {
        if (!res.ok) throw new PatternModelError("The pattern model couldn't be loaded.", { status: res.status });
        return res.json();
      })
      .then(index)
      .catch((err) => {
        modelPromise = null; // let a later attempt retry rather than caching the failure
        throw err instanceof PatternModelError
          ? err
          : new PatternModelError("The pattern model couldn't be loaded.", { cause: err });
      });
  }
  return modelPromise;
}

function index(raw) {
  const featureIndex = new Map();
  raw.vocab.forEach((name, i) => featureIndex.set(name, i));

  const patterns = new Map();
  for (const [id, p] of Object.entries(raw.patterns)) {
    const weights = new Map();
    p.indices.forEach((vocabIdx, k) => weights.set(vocabIdx, p.weights[k]));
    patterns.set(id, { ...p, weights });
  }
  return { ...raw, featureIndex, patterns };
}

function sigmoid(z) {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

/** Mirrors build_matrix() in scripts/train_model.py: tf = 1 + log(count),
 * x = tf * idf, then L2-normalize. Any change here is a change there. */
function vectorize(model, features) {
  const vec = new Map();
  let sumSquares = 0;
  for (const [name, spans] of features) {
    const i = model.featureIndex.get(name);
    if (i === undefined) continue; // out-of-vocabulary: the model has no opinion
    const value = (1 + Math.log(spans.length)) * model.idf[i];
    vec.set(i, value);
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares) || 1;
  for (const [i, v] of vec) vec.set(i, v / norm);
  return vec;
}

function scorePattern(entry, vec) {
  let score = entry.intercept;
  for (const [i, value] of vec) {
    const w = entry.weights.get(i);
    if (w !== undefined) score += w * value;
  }
  return score;
}

/**
 * Analyze a raw problem statement.
 *
 * Returns the display text, its region cover, every pattern ranked by
 * probability, and — for the top prediction — the evidence behind it.
 */
export async function analyze(rawText) {
  const model = await loadPatternModel();
  const { text, regions, features } = featurize(rawText);
  const vec = vectorize(model, features);

  const predictions = [];
  for (const [id, entry] of model.patterns) {
    const score = scorePattern(entry, vec);
    const probability = sigmoid(score);
    // Two tiers, because one operating point was doing two jobs. A 65%
    // precision floor at a ~2% base rate is demanding, and the price was
    // recall: greedy fired on 6.7% of true cases and binary search on 0.6%,
    // despite the model ranking both far better than that. The lower tier is
    // still right more often than not, and always carries its measured
    // precision so it is never taken on trust. See LIKELY_PRECISION in
    // scripts/train_model.py.
    const confident = probability >= entry.threshold;
    const likely = !confident
      && entry.likelyThreshold != null
      && probability >= entry.likelyThreshold;
    predictions.push({
      pattern: id,
      probability,
      score,
      threshold: entry.threshold,
      confident,
      likely,
      reliability: { auc: entry.auc, precision: entry.precision, recall: entry.recall,
        trainedOn: entry.positives,
        likelyPrecision: entry.likelyPrecision ?? null,
        likelyRecall: entry.likelyRecall ?? null },
    });
  }
  predictions.sort((a, b) => b.probability - a.probability);

  const matched = predictions.filter((p) => p.confident);
  return {
    text,
    regions,
    features,
    vec,
    model,
    predictions,
    matched,
    // Nothing cleared its own threshold. The corpus deliberately includes
    // problems that are none of our patterns, so this is a real answer, not a
    // failure — and far more useful than the best of 23 bad guesses.
    noneApply: matched.length === 0,
    unavailable: model.unavailable || {},
    coverage: { predictable: model.patterns.size,
      total: model.patterns.size + Object.keys(model.unavailable || {}).length },
  };
}

/**
 * Why did the model say what it said about one pattern?
 *
 * Every number here is exact: `contribution` is weight x value, the same
 * quantity that was summed to produce the score.
 */
export function explain(result, patternId, { top = TOP_EVIDENCE } = {}) {
  const entry = result.model.patterns.get(patternId);
  if (!entry) return null;

  const contributions = [];
  const byRegion = { statement: 0, example: 0, constraints: 0 };
  const spanWeights = [];

  for (const [name, spans] of result.features) {
    const i = result.model.featureIndex.get(name);
    if (i === undefined) continue;
    const w = entry.weights.get(i);
    if (w === undefined) continue;
    const value = result.vec.get(i);
    const contribution = w * value;
    if (!contribution) continue;

    contributions.push({ feature: name, label: readableFeature(name), contribution,
      weight: w, value, occurrences: spans.length, spans });

    // A phrase can appear in more than one region; split its contribution
    // evenly across its occurrences so regions are credited proportionally.
    const per = contribution / spans.length;
    for (const [start, end, region] of spans) {
      byRegion[region] = (byRegion[region] || 0) + per;
      if (end > start) spanWeights.push({ start, end, region, contribution: per, feature: name });
    }
  }

  contributions.sort((a, b) => b.contribution - a.contribution);
  const supporting = contributions.filter((c) => c.contribution > 0).slice(0, top);
  const opposing = contributions.filter((c) => c.contribution < 0)
    .sort((a, b) => a.contribution - b.contribution).slice(0, top);

  // Constraint features are pulled out regardless of rank. They rarely crack
  // the top dozen by raw weight — phrases from the statement dominate — but
  // "n is up to 10^5, so this has to be about O(n log n)" is the reasoning an
  // interview actually wants, and it was invisible while these were competing
  // with n-grams for a spot in the list.
  const constraints = contributions
    .filter((c) => c.feature.startsWith("c:size:") || c.feature.startsWith("c:value:"))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    pattern: patternId,
    intercept: entry.intercept,
    supporting,
    opposing,
    constraints,
    byRegion,
    spanWeights,
    counterfactual: counterfactual(result, patternId, supporting),
    reliability: { auc: entry.auc, precision: entry.precision, recall: entry.recall,
      trainedOn: entry.positives },
  };
}

/**
 * The smallest set of top phrases whose removal drops this pattern below its
 * own decision threshold, plus whatever the model would say instead.
 *
 * Exact rather than estimated — the features are simply removed and every
 * pattern is rescored.
 */
function counterfactual(result, patternId, supporting) {
  const entry = result.model.patterns.get(patternId);
  const removed = [];
  const vec = new Map(result.vec);

  for (const item of supporting.slice(0, COUNTERFACTUAL_MAX)) {
    const i = result.model.featureIndex.get(item.feature);
    vec.delete(i);
    removed.push(item.label);
    if (sigmoid(scorePattern(entry, vec)) < entry.threshold) {
      let best = null;
      for (const [id, other] of result.model.patterns) {
        if (id === patternId) continue;
        const p = sigmoid(scorePattern(other, vec));
        if (!best || p > best.probability) best = { pattern: id, probability: p };
      }
      return { removed, becomes: best, flipped: true };
    }
  }
  return { removed, becomes: null, flipped: false };
}

/** "w:contiguous subarray" -> "contiguous subarray"; constraint features get a
 * plain-language name, since "c:size:le20" means nothing to a reader. */
export function readableFeature(name) {
  if (name.startsWith("w:")) return name.slice(2);
  if (name === "c:none") return "no stated constraints";
  if (name === "c:has_negative") return "values can be negative";
  const size = /^c:size:(.+)$/.exec(name);
  if (size) return `input size ${BOUND_LABELS[size[1]] || size[1]}`;
  const value = /^c:value:(.+)$/.exec(name);
  if (value) return `element values ${BOUND_LABELS[value[1]] || value[1]}`;
  return name;
}

const BOUND_LABELS = {
  le20: "up to 20", le100: "up to 100", le1e3: "up to 1,000",
  le1e4: "up to 10,000", le1e5: "up to 100,000", le1e6: "up to 1,000,000",
  gt1e6: "above 1,000,000", le1e9: "up to 10⁹", gt1e9: "above 10⁹",
};

/** Plain-language note on what a constraint implies about complexity — the
 * reasoning an interviewer expects you to do out loud. */
export const BOUND_IMPLICATIONS = {
  le20: "small enough for exponential work — bitmask or backtracking is on the table",
  le100: "O(n³) is affordable",
  le1e3: "O(n²) is affordable",
  le1e4: "O(n²) is borderline; prefer O(n log n)",
  le1e5: "needs about O(n log n) — sorting, binary search, heap",
  le1e6: "needs roughly linear work",
  gt1e6: "linear or logarithmic only — the input can't be touched twice",
};
