// Mirror of scripts/featurize.py. Turns a raw problem statement into named
// features, each carrying the span of text it came from.
//
// Where this fits: pattern-model.js feeds these features to the linear model
// to predict patterns, and the Analyze view uses the spans to highlight which
// parts of the problem drove each prediction.
//
// IMPORTANT — train/serve skew: this file and scripts/featurize.py must produce
// identical output for identical input. They are deliberately written as
// mechanical translations of each other; scripts/test_conformance.py checks
// them against shared fixtures. Change one, change both, then run that test.
// A silent divergence would make the browser explain a model that was never
// trained on these features.

export const MAX_NGRAM = 3;

const HEADING_SOURCE =
  "^\\s*(input|output|constraints?|examples?|explanation|note|sample input|sample output)\\s*:?\\s*$";
const CONSTRAINT_HEADING_RE = /constraints?/i;
const EXAMPLE_HEADING_RE = /input|output|examples?|explanation|note|sample/i;
const TAG_RE = /<[^>]+>/g;
const PRE_RE = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
// Inline headings — a label with content following it on the same line.
const INLINE_EXAMPLE_SOURCE =
  "^[ \\t]*(examples?\\s*\\d*|inputs?|outputs?|explanation|sample\\s+(?:input|output)|note)\\s*:";

function headingRe() {
  return new RegExp(HEADING_SOURCE, "gim"); // fresh each time: lastIndex is stateful
}

// Entity decoding is done by hand rather than via a <textarea>, for two
// reasons: it must behave identically under Node so the conformance test can
// run there, and a DOM-based decoder would quietly resolve entities the Python
// side handles differently. Real statements use a small set — a survey of
// LeetCode HTML found only &quot;, &lt;, &nbsp; and &#39; — and numeric escapes
// are handled in full. &nbsp; maps to U+00A0 exactly as Python's
// html.unescape does, because strip() then collapses it to a space.
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  le: "≤", ge: "≥", ne: "≠", times: "×", minus: "−",
  hellip: "…", mdash: "—", ndash: "–", deg: "°",
  plusmn: "±", infin: "∞", rarr: "→", larr: "←",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  sup2: "²", sup3: "³", frac12: "½",
};

function unescapeEntities(s) {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    const named = NAMED_ENTITIES[body];
    return named === undefined ? match : named;
  });
}

function strip(fragment) {
  let txt = fragment.replace(TAG_RE, " ");
  txt = unescapeEntities(txt);
  txt = txt.replace(/ /g, " ");
  txt = txt.replace(/[ \t]+/g, " ");
  return txt.replace(/\n{3,}/g, "\n\n");
}

function htmlToText(raw) {
  const out = [];
  const preSpans = [];
  let cursor = 0;
  let length = 0;
  PRE_RE.lastIndex = 0;
  let m;
  while ((m = PRE_RE.exec(raw)) !== null) {
    const before = strip(raw.slice(cursor, m.index));
    out.push(before);
    length += before.length;
    const inner = strip(m[1]);
    out.push(inner);
    preSpans.push([length, length + inner.length]);
    length += inner.length;
    cursor = m.index + m[0].length;
  }
  out.push(strip(raw.slice(cursor)));
  return [out.join(""), preSpans];
}

/** Raw statement (LeetCode HTML or plain text) -> display text + region spans.
 * Every span offset downstream refers to the returned text, so stripping
 * happens exactly once, here. */
export function toPlain(raw) {
  let text, preSpans;
  if (raw.includes("<") && raw.includes(">")) {
    [text, preSpans] = htmlToText(raw);
  } else {
    text = raw.replace(/\r\n/g, "\n");
    preSpans = [];
  }
  return { text, regions: regionsFor(text, preSpans) };
}

function nextHeadingOrEnd(text, fromPos) {
  const re = headingRe();
  re.lastIndex = fromPos;
  const m = re.exec(text);
  return m ? m.index : text.length;
}

function regionsFor(text, preSpans) {
  const spans = preSpans.map(([s, e]) => ["example", s, e]);

  const re = headingRe();
  let m;
  while ((m = re.exec(text)) !== null) {
    const end = nextHeadingOrEnd(text, m.index + m[0].length);
    if (CONSTRAINT_HEADING_RE.test(m[1])) spans.push(["constraints", m.index, end]);
    else if (EXAMPLE_HEADING_RE.test(m[1])) spans.push(["example", m.index, end]);
    if (re.lastIndex === m.index) re.lastIndex++; // zero-length match guard
  }

  // Headings that carry content on the same line, so the line-anchored pattern
  // above never sees them — "<strong>Constraints:</strong>" once tags are
  // stripped, and "Example 1:" / "Input: nums = [1,2]" in a plain-text paste.
  // See the matching note in featurize.py.
  const inlineExample = new RegExp(INLINE_EXAMPLE_SOURCE, "gim");
  while ((m = inlineExample.exec(text)) !== null) {
    spans.push(["example", m.index, nextHeadingOrEnd(text, m.index + m[0].length)]);
    if (inlineExample.lastIndex === m.index) inlineExample.lastIndex++;
  }
  const inlineConstraint = /constraints?\s*:/gi;
  while ((m = inlineConstraint.exec(text)) !== null) {
    spans.push(["constraints", m.index, nextHeadingOrEnd(text, m.index + m[0].length)]);
  }

  return flatten(spans, text.length);
}

const PRIORITY = { statement: 0, example: 1, constraints: 2 };

function flatten(spans, length) {
  if (!length) return [];
  const owner = new Array(length).fill("statement");
  for (const [region, start, end] of spans) {
    for (let i = Math.max(0, start); i < Math.min(length, end); i++) {
      if (PRIORITY[region] >= PRIORITY[owner[i]]) owner[i] = region;
    }
  }
  const out = [];
  let cur = owner[0];
  let start = 0;
  for (let i = 1; i < length; i++) {
    if (owner[i] !== cur) {
      out.push([cur, start, i]);
      cur = owner[i];
      start = i;
    }
  }
  out.push([cur, start, length]);
  return out;
}

export function regionAt(regions, pos) {
  for (const [region, start, end] of regions) {
    if (pos >= start && pos < end) return region;
  }
  return "statement";
}

// Mirrors _TOKEN_RE in featurize.py — see the note there. Subscripted names
// reach us as "starti" from HTML and "start_i" from a plain-text paste; both
// must tokenize the same way or a pasted problem loses the very features the
// model learned.
const TOKEN_RE = /[a-zA-Z]+(?:_[a-zA-Z0-9]+)*|\d+/g;
const STOPWORDS = new Set(`
a an the and or of to in is are be been was were it its this that these those
for with as at by on from you your we our they their he she his her i if then
else so such can could will would should may might must do does did done have
has had not no nor but there here what which who whom when where why how all
any both each few more most other some only own same than too very s t just
`.trim().split(/\s+/));

/** Lowercased tokens with positions. Integers collapse to a magnitude token so
 * "10^5" and "100000" don't each claim their own vocabulary entry. */
export function tokenize(text, regions) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const raw = m[0];
    let tok;
    if (/^\d+$/.test(raw)) {
      tok = `<num${raw.length}>`;
    } else {
      tok = raw.toLowerCase().replace(/_/g, "");
      if (STOPWORDS.has(tok) || tok.length <= 1) continue;
    }
    tokens.push([tok, m.index, m.index + raw.length, regionAt(regions, m.index)]);
  }
  return tokens;
}

/** { feature: [[start, end, region], ...] } for 1..MAX_NGRAM grams. An n-gram
 * is only formed from tokens sharing a region, so a phrase never straddles the
 * boundary between the statement and a constraints list. */
export function ngramFeatures(tokens) {
  const feats = new Map();
  for (let n = 1; n <= MAX_NGRAM; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const window = tokens.slice(i, i + n);
      const region = window[0][3];
      if (window.some((t) => t[3] !== region)) continue;
      const name = "w:" + window.map((t) => t[0]).join(" ");
      if (!feats.has(name)) feats.set(name, []);
      feats.get(name).push([window[0][1], window[n - 1][2], region]);
    }
  }
  return feats;
}

// ---------- constraint parsing ----------

// Mirrors _NUM / _BOUND_RE in featurize.py. The number pattern deliberately
// forbids bare whitespace between digits: allowing it made "2000 \n 0 <= ..."
// parse as the single number 20000.
const NUM = "-?\\d+(?:\\.\\d+)?(?:\\s*(?:\\^|\\*\\*)\\s*\\d+|[eE]\\+?\\d+)?";
const BOUND_SOURCE =
  `(?:(?<lo>${NUM})\\s*(?:<=|≤|<)\\s*)?` +
  "(?<var>[A-Za-z_][A-Za-z0-9_]*(?:\\s*\\[\\s*[A-Za-z0-9_]+\\s*\\])?(?:\\s*\\.\\s*(?:length|size|len))?)" +
  `\\s*(?:<=|≤|<|==|=)\\s*(?<hi>${NUM})`;
const LEN_SUFFIX_RE = /\.\s*(length|size|len)\s*$/i;
const SIZE_WORD_RE = /(^|_)(n|m|k|q|len|length|size|count|total|num|rows?|cols?|columns?|nodes?|edges?|vertices)($|_)|num|count|len|size|total/i;

const SIZE_BUCKETS = [[20, "le20"], [100, "le100"], [1000, "le1e3"],
  [10000, "le1e4"], [100000, "le1e5"], [1000000, "le1e6"]];
const VALUE_BUCKETS = [[100, "le100"], [10000, "le1e4"], [1e9, "le1e9"]];

/** Size-like (how much input) vs value-like (how big an element). A size bound
 * drives the complexity class you can afford; a value bound hints at counting
 * sorts and bit tricks. An inner array's arity ("prerequisites[i].length == 2")
 * is neither, and is filed as a value so it can't masquerade as a tiny input. */
function boundKind(varName) {
  const hasIndex = varName.includes("[");
  const hasLen = LEN_SUFFIX_RE.test(varName);
  if (hasLen && !hasIndex) return "size";
  if (hasIndex) return "value";
  return SIZE_WORD_RE.test(varName) ? "size" : "value";
}

function parseNumber(raw) {
  const s = raw.replace(/\s+/g, "");
  let m = /^(-?\d+)(?:\^|\*\*)(\d+)$/.exec(s);
  if (m) {
    const exp = parseInt(m[2], 10);
    return exp <= 18 ? Math.pow(parseInt(m[1], 10), exp) : null;
  }
  m = /^(-?\d+(?:\.\d+)?)[eE]\+?(\d+)$/.exec(s);
  if (m) {
    const exp = parseInt(m[2], 10);
    return exp <= 18 ? Math.round(parseFloat(m[1]) * Math.pow(10, exp)) : null;
  }
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

function bucket(value, table, overflow) {
  for (const [limit, name] of table) if (value <= limit) return name;
  return overflow;
}

/** Features from the constraints region only. */
export function constraintFeatures(text, regions) {
  const feats = new Map();
  let maxSize = 0;
  let maxValue = 0;
  let sawNegative = false;
  let sizeSpan = null;
  let valueSpan = null;

  for (const [region, start, end] of regions) {
    if (region !== "constraints") continue;
    const chunk = text.slice(start, end);
    const re = new RegExp(BOUND_SOURCE, "g");
    let m;
    while ((m = re.exec(chunk)) !== null) {
      const hi = parseNumber(m.groups.hi);
      if (hi === null || hi <= 0) {
        if (hi !== null && hi < 0) sawNegative = true;
        continue;
      }
      if (m.groups.lo != null) {
        const lo = parseNumber(m.groups.lo);
        if (lo !== null && lo < 0) sawNegative = true;
      }
      const span = [start + m.index, start + m.index + m[0].length, "constraints"];
      if (boundKind(m.groups.var) === "size") {
        if (hi > maxSize) { maxSize = hi; sizeSpan = span; }
      } else if (hi > maxValue) {
        maxValue = hi; valueSpan = span;
      }
    }
  }

  const add = (name, span) => {
    if (!feats.has(name)) feats.set(name, []);
    feats.get(name).push(span);
  };
  if (maxSize) add(`c:size:${bucket(maxSize, SIZE_BUCKETS, "gt1e6")}`, sizeSpan);
  if (maxValue) add(`c:value:${bucket(maxValue, VALUE_BUCKETS, "gt1e9")}`, valueSpan);
  if (sawNegative) add("c:has_negative", [0, 0, "constraints"]);
  if (!maxSize && !maxValue) add("c:none", [0, 0, "constraints"]);
  return feats;
}

/** Full pipeline. Returns { text, regions, features } where features maps a
 * feature name to the list of [start, end, region] spans it occurred at. */
export function featurize(raw) {
  const { text, regions } = toPlain(raw);
  const tokens = tokenize(text, regions);
  const features = ngramFeatures(tokens);
  for (const [name, spans] of constraintFeatures(text, regions)) {
    if (!features.has(name)) features.set(name, []);
    features.get(name).push(...spans);
  }
  return { text, regions, features };
}
