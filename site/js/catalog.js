// The problem catalog: ~2,500 LeetCode problems indexed by the patterns they
// exercise, so "find me more problems shaped like this one" is a lookup rather
// than a search.
//
// Where this fits: the Analyze view uses it to turn a prediction into practice,
// and the Review Queue uses it to suggest fresh volume on a weak pattern.
//
// The entries are metadata only — title, number, difficulty, tags, URL. No
// problem statements: the catalog says a problem exists and what shape it is,
// and links out to LeetCode for the text itself. Pattern weights come from each
// problem's own LeetCode topic tags, so these are labels rather than
// predictions, and are exact wherever LeetCode tagged the problem.
import { ownValue } from "./logic.js";

const CATALOG_URL = "./data/catalog.json";

/**
 * A fetch that failed in a way the UI should explain rather than swallow.
 *
 * Typed so callers can tell "the server said no" apart from a programming
 * error, and so a message shown to the user is never a bare stack trace.
 */
export class CatalogError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name = "CatalogError";
    this.status = status;
    this.cause = cause;
  }
}

/**
 * A problem title reduced to the slug LeetCode would use.
 *
 * Shared because both the bank and the Analyze view need to recognize a
 * catalog problem the user already tracks, and they were deriving it
 * independently — two copies of one rule is one rule that can drift.
 */
export function slugify(name) {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Slugs for everything the user already has, however it was added. */
export function savedSlugs(problems) {
  const out = new Set();
  for (const p of problems) {
    if (p.catalogSlug) out.add(p.catalogSlug);
    out.add(slugify(p.name));
  }
  return out;
}

// Match taxonomy.POSITIVE_THRESHOLD in scripts/taxonomy.py: below this a tag is
// a hint, not a claim, and shouldn't be presented as "this is that pattern".
export const PATTERN_CONFIDENCE = 0.5;

/**
 * Problems that teach a pattern LeetCode has no tag for, by slug.
 *
 * The weights above come from LeetCode's own topic tags, and three of the
 * patterns this app teaches are not tags there: knapsack is filed under
 * "Dynamic Programming", minimum spanning trees mostly under "Union Find", and
 * partition-based sorting under "Sorting". So the catalog had one knapsack
 * problem, two MST problems and eight for quicksort — a topic page you could
 * read with almost nothing on it to practise. These are the standard problems
 * for each, chosen by hand and counted as full-strength matches.
 */
const CURATED = {
  knapsack: [
    // 0/1: each item once.
    "partition-equal-subset-sum", "target-sum", "last-stone-weight-ii", "ones-and-zeroes",
    "profitable-schemes", "tallest-billboard", "number-of-ways-to-earn-points",
    // Unbounded: each item as often as you like.
    "coin-change", "coin-change-ii", "combination-sum-iv", "perfect-squares",
  ],
  mst: [
    "min-cost-to-connect-all-points",
    "find-critical-and-pseudo-critical-edges-in-minimum-spanning-tree",
    // A spanning tree for two travellers at once.
    "remove-max-number-of-edges-to-keep-graph-fully-traversable",
    // Edges taken in weight order with a union-find: Kruskal's loop.
    "number-of-good-paths", "minimize-the-maximum-edge-weight-of-graph",
    // Minimax paths: Kruskal's order — cheapest edge first until connected —
    // is the whole solution, which is the MST idea used rather than recited.
    "checking-existence-of-edge-length-limited-paths", "path-with-minimum-effort", "swim-in-rising-water",
  ],
  quick_sort: [
    // Partitioning itself: the pivot step, and its three-way form.
    "sort-an-array", "sort-colors",
  ],
};
const CURATED_SETS = Object.fromEntries(Object.entries(CURATED).map(([k, v]) => [k, new Set(v)]));

/** How strongly a catalog entry exercises a pattern, counting the curated lists. */
export function patternWeight(entry, patternId) {
  const tagged = ownValue(entry.patterns, patternId) || 0;
  return ownValue(CURATED_SETS, patternId)?.has(entry.slug) ? Math.max(tagged, 1) : tagged;
}

let catalogPromise = null;

/**
 * Load the catalog, memoized for the session.
 *
 * `refresh` discards the memo and refetches. A cache with no way to invalidate
 * it is a design gap rather than merely an inconvenience: the catalog is
 * rebuilt by a workflow, so a long-lived tab can otherwise hold a stale copy
 * indefinitely, and nothing could ever re-read it without a full page reload.
 */
export function loadCatalog({ refresh = false } = {}) {
  if (refresh) catalogPromise = null;
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL)
      .then((res) => {
        if (!res.ok) throw new CatalogError("The problem catalog couldn't be loaded.", { status: res.status });
        return res.json();
      })
      .catch((err) => {
        catalogPromise = null; // let a later attempt retry rather than caching the failure
        throw err instanceof CatalogError
          ? err
          : new CatalogError("The problem catalog couldn't be loaded.", { cause: err });
      });
  }
  return catalogPromise;
}

/**
 * Problems that genuinely exercise a pattern, hardest-signal first.
 *
 * `exclude` takes slugs already in the user's own problem list so the app never
 * recommends something they're already tracking.
 */
export async function problemsForPattern(patternId, {
  difficulty = null, limit = 12, exclude = new Set(),
} = {}) {
  const catalog = await loadCatalog();
  return catalog.problems
    .filter((p) => patternWeight(p, patternId) >= PATTERN_CONFIDENCE)
    .filter((p) => !difficulty || p.difficulty === difficulty)
    .filter((p) => !exclude.has(p.slug))
    .sort((a, b) => (patternWeight(b, patternId) - patternWeight(a, patternId))
      || (a.number ?? 1e9) - (b.number ?? 1e9))
    .slice(0, limit);
}

// The whole state document is pushed to GitHub on every save, and the Contents
// API stops serving files over 1 MB — past that, sync breaks outright. A bank
// entry is therefore kept to the minimum that describes an unstarted problem:
// no url (it is derivable from the slug), and none of the empty strings and
// arrays a worked problem accumulates. At ~495 bytes per entry the full catalog
// would have produced a ~1.2 MB state file; the slim shape plus MAX_BANK_SIZE
// keeps it around 200 KB.
export const MAX_BANK_SIZE = 500;

/**
 * Where to go and read this problem, or null if we can't say.
 *
 * Tried in order: a stored url, the catalog slug, then the title. The last one
 * works because LeetCode's own slugs follow exactly the convention slugify()
 * implements — "3Sum" is /problems/3sum, "Implement Trie (Prefix Tree)" is
 * /problems/implement-trie-prefix-tree — and it is gated on the problem having
 * a LeetCode number, so hand-written entries like "0/1 Knapsack (reference)"
 * get no link rather than a link to a page that doesn't exist. A wrong link is
 * worse than none; an absent one is at least honest.
 */
export function problemUrl(problem) {
  if (problem.url) return problem.url;
  if (problem.catalogSlug) return `https://leetcode.com/problems/${problem.catalogSlug}/`;
  if (problem.number && problem.name) return `https://leetcode.com/problems/${slugify(problem.name)}/`;
  return null;
}

/**
 * Convert a catalog entry into a problem record for the user's own list.
 *
 * Shared by the bank and the Analyze view so the stored shape is defined once.
 * Fields absent here are genuinely absent, not empty: esc() renders null as ""
 * and the seeded problems carry no per-problem resources or whiteboards either,
 * so nothing downstream needs them to exist.
 */
export function problemFromCatalog(entry, { id, status, patternId = null, nextReviewDate = null, ...extra }) {
  const ranked = Object.entries(entry.patterns).sort((a, b) => b[1] - a[1]);
  return {
    id,
    name: entry.title,
    number: entry.number,
    difficulty: entry.difficulty || "Unrated",
    patternId: patternId || (ranked.length ? ranked[0][0] : "arrays-hashing"),
    catalogSlug: entry.slug,
    status,
    box: 0,
    nextReviewDate,
    attempts: [],
    // Anything else the caller wants to carry across — Analyze attaches the
    // text you pasted and the ranking it produced. Spread last but after the
    // fixed fields above, so a caller cannot accidentally overwrite the
    // identity of the problem it is creating.
    ...extra,
    id,
    catalogSlug: entry.slug,
  };
}
