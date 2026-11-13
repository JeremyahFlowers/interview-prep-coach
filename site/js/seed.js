// The starting state, built fresh on first connect from a starter set of
// well-known problems. Every problem starts due immediately (box 0) so
// day one already has a real review queue instead of an empty app.
import {
  todayISO, newDayTimer, DEFAULT_QUESTION_MINUTES, DEFAULT_PLAN_MINUTES, STATUS_ACTIVE, isRecord, exactDayOf, MAX_BOX_INTERVAL_DAYS,
} from "./logic.js";
import { DEFAULT_DESIGN_MINUTES } from "./design-logic.js";
import { DEFAULT_PREP } from "./prep.js";
import {
  seedWeekHistory, upgradeWeekHistory, upgradeWeekHistoryForRounds, upgradeWeekHistoryForTicks,
} from "./week-history.js";
import { HAND_TICKED_KINDS, tickCredit } from "./week.js";
import { DESIGN_PROBLEMS } from "./design-problems.js";
import { APP_VERSION } from "./version.js";
import { AppError } from "./errors.js";

const PATTERNS = [
  ["two-pointers", "Two Pointers", "Converging or fixed-offset pointers over a sorted or linear structure."],
  ["sliding-window", "Sliding Window", "Variable- or fixed-size window scanned across a string or array."],
  ["arrays-hashing", "Arrays & Hashing", "Hash maps and sets for fast lookup over arrays and strings."],
  ["strings", "Strings", "String manipulation that isn't primarily two-pointer or window-based."],
  ["binary-search", "Binary Search", "Search over a monotonic function or sorted structure."],
  ["recursion-dp", "Recursion / DP", "Recursive search and dynamic programming."],
  ["bit-manipulation", "Bit Manipulation", "Bitwise tricks: masks, shifts, and counting."],
  ["2d-matrix", "2D Matrix", "Traversal and in-place transformation of 2D grids."],
  ["knapsack", "Knapsack", "0/1 and unbounded knapsack — subset/partition DP."],
  ["monotonic_stack", "Monotonic Stack", "Stack or deque kept in sorted order to answer next-greater / sliding-extreme queries."],
  ["mst", "Minimum Spanning Tree", "Prim's and Kruskal's algorithms."],
  ["quick_sort", "Partitioning / Quicksort", "Partition-based sorting and selection."],
  ["topological_sort", "Topological Sort", "Ordering a DAG via Kahn's algorithm or DFS."],
  ["trie", "Trie", "Prefix tree for fast string-prefix operations."],
  ["union-find", "Union-Find", "Disjoint-set union for connectivity queries."],
  ["linked-list", "Linked List", "Pointer rewiring — reversal, fast/slow traversal, merging."],
  ["trees", "Trees", "Binary tree traversal — DFS pre/in/post-order, BFS level-order, BST properties."],
  ["graphs-bfs-dfs", "Graph Traversal", "General BFS/DFS over graphs — islands, connected components, shortest unweighted path."],
  ["backtracking", "Backtracking", "Depth-first search over a decision tree, undoing choices that don't pan out."],
  ["heap", "Heap / Priority Queue", "Top-K, k-way merge, running median — cheap access to the current min or max."],
  ["intervals", "Intervals", "Sort by start, then sweep — merge, insert, and scheduling problems."],
  ["prefix-sum", "Prefix Sum", "Precompute running totals so range queries become a subtraction."],
  ["greedy", "Greedy", "Locally optimal choices, never revisited — valid only when that's provably safe."],
].map(([id, name, description]) => ({ id, name, description }));

export { PATTERNS };

const PROBLEMS = [
  ["3sum", "3Sum", 15, "Medium", "two-pointers", "Sort, then fix one index and two-pointer the rest; skip duplicates.", "two-pointers/3_sum.cpp"],
  ["container-with-most-water", "Container With Most Water", 11, "Medium", "two-pointers", "Pointers from both ends, move the shorter line inward.", "two-pointers/container_with_most_water.cpp"],
  ["longest-substring-without-repeating-characters", "Longest Substring Without Repeating Characters", 3, "Medium", "sliding-window", "Variable window with a 26-slot frequency array.", "sliding-window/longest_substring_without_repeating_characters.cpp"],
  ["permutation-in-string", "Permutation in String", 567, "Medium", "sliding-window", "Fixed-size window, compare frequency vectors.", "sliding-window/permutation_in_string.cpp"],
  ["find-all-anagrams-in-a-string", "Find All Anagrams in a String", 438, "Medium", "sliding-window", "Fixed-size window, compare frequency vectors, collect all matches.", "sliding-window/find_all_anagrams_in_string.cpp"],
  ["minimum-window-substring", "Minimum Window Substring", 76, "Hard", "sliding-window", "Variable window with formed/required distinct-character tracking.", "sliding-window/minimum_window_substring.cpp"],
  ["group-anagrams", "Group Anagrams", 49, "Medium", "arrays-hashing", "Hash map keyed by the sorted form of each string.", "arrays-hashing/group_anagrams.cpp"],
  ["longest-consecutive-sequence", "Longest Consecutive Sequence", 128, "Medium", "arrays-hashing", "Hash set; only start counting a streak from its lower bound.", "arrays-hashing/longest_consecutive_sequence.cpp"],
  ["product-of-array-except-self", "Product of Array Except Self", 238, "Medium", "arrays-hashing", "Prefix products forward, suffix product folded in on a second pass.", "arrays-hashing/product_array_except_itself.cpp"],
  ["reverse-words-in-a-string", "Reverse Words in a String", 151, "Medium", "strings", "Tokenize with stringstream, prepend each word.", "strings/reverse_words_in_string.cpp"],
  ["missing-element-in-sorted-array", "Missing Element in Sorted Array", 1060, "Medium", "binary-search", "Binary search on a count-of-missing-numbers-so-far function.", "binary-search/missing_element_in_sorted_array.cpp", "LeetCode Premium"],
  ["minimum-cost-to-merge-sorted-lists", "Minimum Cost to Merge Sorted Lists", null, "Unrated", "recursion-dp", "Brute-force recursive best-pair search — exponential, unmemoized. Known gap: DP intent was never implemented.", "recursion-dp/minimum_cost_to_merge_sorted_list.cpp"],
  ["rotate-image", "Rotate Image", 48, "Medium", "2d-matrix", "Transpose the matrix, then reverse each row in place.", "2d-matrix/rotate_matrix.cpp"],
  ["spiral-matrix", "Spiral Matrix", 54, "Medium", "2d-matrix", "Track four shrinking boundaries and walk them in order: right, down, left, up.", "2d-matrix/spiral_matrix.cpp"],
  ["partition-equal-subset-sum", "Partition Equal Subset Sum", 416, "Medium", "knapsack", "Subset-sum DP over half the total.", "knapsack/partition_equal_subset_sum.cpp"],
  ["knapsack-reference", "0/1 Knapsack (reference)", null, "Unrated", "knapsack", "Reference implementation — bottom-up, top-down memo, and brute-force variants side by side.", "knapsack/traditional_knapsack.cpp"],
  ["largest-rectangle-in-histogram", "Largest Rectangle in Histogram", 84, "Hard", "monotonic_stack", "Monotonic increasing stack of bar indices; pop and compute width when a shorter bar arrives.", "monotonic_stack/largest_rectangle_in_histogram.cpp"],
  ["sliding-window-maximum", "Sliding Window Maximum", 239, "Hard", "monotonic_stack", "Monotonic decreasing deque of indices; front is always the current window max.", "monotonic_stack/largest_sliding_window.cpp"],
  ["min-cost-to-connect-all-points", "Min Cost to Connect All Points", 1584, "Medium", "mst", "Prim's algorithm from an arbitrary start, growing the MST with a min-heap of edge costs.", "mst/min_cost_to_connect_all_points.cpp"],
  ["sort-colors", "Sort Colors", 75, "Medium", "quick_sort", "Dutch national flag — three pointers (low/mid/high) partition in one pass.", "quick_sort/quick_sort.cpp"],
  ["course-schedule-ii", "Course Schedule II", 210, "Medium", "topological_sort", "Kahn's algorithm — topological sort via in-degree queue; empty queue before all nodes visited means a cycle.", "topological_sort/course_schedule_II.cpp"],
  ["implement-trie", "Implement Trie (Prefix Tree)", 208, "Medium", "trie", "Children map per node plus an end-of-word flag.", "trie/implement_trie.cpp"],
  ["number-of-provinces", "Number of Provinces", 547, "Medium", "union-find", "Union-find over the adjacency matrix; count remaining distinct roots.", "union-find/number_of_provinces.cpp"],
].map(([id, name, number, difficulty, patternId, approach, filePath, notes]) => ({
  id, name, number, difficulty, patternId, approach, filePath, notes: notes || "",
}));

/** The fields of a problem nobody has attempted: due today, in the first box. Read per call so a tab
 *  left open across midnight does not date a new state yesterday. */
const unattempted = () => ({ box: 0, nextReviewDate: todayISO(), attempts: [] });

/** The defaults for the saved records the app reads without checking. They live here once so
 *  `buildSeedState` and `repairSavedShapes` cannot drift apart. Functions, not objects: each
 *  caller gets its own copy to mutate. */
const DEFAULT_SYSTEM_DESIGN_UNLOCK = { minMocks: 10, minSolvedCleanRate: 0.7 };
const DEFAULT_DAILY_BUDGET_MIN = 75;
const DEFAULT_DAILY_FLOOR_MIN = 45;
const DEFAULT_BOX_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35];
const DEFAULT_ESTIMATE_MIN_BY_DIFFICULTY = { Easy: 20, Medium: 30, Hard: 45, Unrated: 30 };
const newStreak = () => ({ current: 0, longest: 0, lastActiveDate: null });
const newQuizLog = () => ({ totalAsked: 0, totalCorrect: 0, recent: [] });
const newSystemDesign = () => ({ manualUnlock: false, sessions: [] });

/** A deep copy of a list of plain records (strings, numbers, null, nested arrays and objects).
 *  The app's own logic mutates a state, so handing out the module constants would make a second
 *  state inherit the first one's edits. */
const copyRecords = (list) => structuredClone(list);

export function buildSeedState() {
  return {
    meta: { schemaVersion: 2, createdAt: new Date().toISOString() },
    settings: {
      dailyBudgetMin: DEFAULT_DAILY_BUDGET_MIN,
      boxIntervalsDays: [...DEFAULT_BOX_INTERVALS_DAYS],
      estimateMinByDifficulty: { ...DEFAULT_ESTIMATE_MIN_BY_DIFFICULTY },
      // How long one question gets, and how much of that is for planning
      // before writing code. See questionPlan() in logic.js.
      questionMinutes: { ...DEFAULT_QUESTION_MINUTES },
      planMinutes: { ...DEFAULT_PLAN_MINUTES },
      // How long one design problem gets, and what share of the day goes to
      // design at all. The share starts at zero: system design is part of the
      // same practice day, but turning it on has to be a decision, or it
      // silently takes minutes from somebody who never asked for it.
      designMinutes: { ...DEFAULT_DESIGN_MINUTES },
      designShare: 0,
      // The other end of the band. The budget above has always been a ceiling;
      // this is the floor below which a day did not really happen, because
      // there was no room for the review and the review is what teaches.
      dailyFloorMin: DEFAULT_DAILY_FLOOR_MIN,
      // What you are preparing for. Every field is optional — with none of
      // them answered the app behaves exactly as it did before this existed.
      prep: { ...DEFAULT_PREP },
      // No `week` here on purpose: its absence is how the app knows nobody has
      // set one up, and until somebody does the dashboard behaves as it always
      // did. A default week would put rest days on weekends for people who
      // never chose them, and quietly stop recommending anything on Saturday.
      systemDesignUnlockThreshold: { ...DEFAULT_SYSTEM_DESIGN_UNLOCK },
    },
    patterns: copyRecords(PATTERNS),
    problems: PROBLEMS.map((p) => ({ ...p, ...unattempted() })),
    mocks: [],
    journal: [],
    // Design problems are problems: same boxes, same intervals, same schedule
    // as the coding side, with a different practice format. Seeded from the
    // bank so the first visit is not an empty page.
    designProblems: seedDesignProblems(),
    systemDesign: newSystemDesign(),
    streak: newStreak(),
    resources: {}, // { [patternId]: [{ id, title, url, addedAt }] } — user-curated video/article links
    whiteboards: [], // [{ id, date, problemId, path, caption }] — index of saved drawings (images live as separate repo files)
    quiz: newQuizLog(), // last 50 answers: {correct, actual, said, problemId}
    designQuiz: newQuizLog(), // the same, for components
    dayTimer: newDayTimer(),
  };
}

/** Backfills fields added after a state.json was first created, without
 * touching anything that already exists. Safe to call on every load. */
/** The bank as trackable problems, in the shape the scheduler already
 *  understands. Content lives in design-problems.js; this is only the record
 *  of what you have done with each one. */
function seedDesignProblems() {
  return DESIGN_PROBLEMS.map((p) => ({
    id: p.id, name: p.name, difficulty: p.difficulty,
    status: STATUS_ACTIVE, ...unattempted(),
  }));
}

/** The records in a list that should hold only records. A null or a bare
 *  string in a hand-edited list carries no data and would make every later
 *  `p.id` throw, so it is dropped rather than repaired. */
const recordsOnly = (list) => (Array.isArray(list) ? list.filter(isRecord) : []);

/**
 * An attempt with `mistakeTags` made a list of strings: strings are kept exactly as saved, anything else is dropped
 * (a number is not a tag the form could have written, so printing it would invent a mistake). A non-record attempt, or one
 * with no `mistakeTags` key, is returned as it is; the readers already treat both as empty.
 */
const withTextTags = (attempt) => {
  // An absent key stays absent: every reader treats it as "no tags", and adding it would change every healthy older file.
  if (!isRecord(attempt) || !("mistakeTags" in attempt)) return attempt;
  const tags = Array.isArray(attempt.mistakeTags) ? attempt.mistakeTags.filter((t) => typeof t === "string") : [];
  return { ...attempt, mistakeTags: tags };
};

/**
 * A repair for a saved record: a non-record is replaced by the seed default, and each key the
 * default names is kept only if it has the default's type. Keys the default does not name
 * (`streak.graceDays`, say) are left exactly as saved.
 */
const repairRecord = (make) => (value) => {
  const defaults = make();
  const record = isRecord(value) ? value : {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const saved = record[key];
    if (Array.isArray(fallback)) record[key] = recordsOnly(saved);
    // A null default is a date-like slot (`lastActiveDate`): readers call string methods on it.
    else if (fallback === null) record[key] = typeof saved === "string" ? saved : null;
    else if (typeof saved !== typeof fallback || (typeof saved === "number" && !Number.isFinite(saved))) record[key] = fallback;
  }
  return record;
};

/** The log is `{ log: [records] }` or nothing; any other shape is replaced by an empty log. */
const repairClarify = (value) => {
  const record = isRecord(value) ? value : {};
  record.log = recordsOnly(record.log);
  return record;
};

const repairResources = (value) => (isRecord(value) ? value : {});

/**
 * Every saved top-level field the readers use without checking, with the repair that gives it its
 * container shape. One row per field, so a new saved field is a row and not another `if`.
 * `optional` rows are left absent when absent: the seed does not create them and their readers
 * already treat "absent" as "empty", so adding them would change every healthy older file.
 */
const SAVED_SHAPES = [
  { field: "mocks", repair: recordsOnly },
  { field: "journal", repair: recordsOnly },
  { field: "whiteboards", repair: recordsOnly },
  { field: "pairMocks", repair: recordsOnly, optional: true },
  { field: "streak", repair: repairRecord(newStreak) },
  { field: "quiz", repair: repairRecord(newQuizLog) },
  { field: "designQuiz", repair: repairRecord(newQuizLog) },
  { field: "resources", repair: repairResources },
  { field: "systemDesign", repair: repairRecord(newSystemDesign) },
  { field: "clarify", repair: repairClarify, optional: true },
];

const isPositiveNumber = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
// The ceiling is the Settings form's own: a finite 1e15 passes a type check but overflows `Date`,
// which wrote "NaN-NaN-NaN" as a review date.
const isIntervalList = (v) => Array.isArray(v) && v.length > 0
  && v.every((d) => typeof d === "number" && Number.isFinite(d) && d >= 0 && d <= MAX_BOX_INTERVAL_DAYS);

/** Keeps the entries of a saved estimate record that are usable minutes (and any extra keys), and
 *  fills the difficulties it lacks from the seed. A non-record is replaced whole. */
const mergeEstimates = (saved) => {
  const estimates = isRecord(saved) ? { ...saved } : {};
  for (const [difficulty, minutes] of Object.entries(DEFAULT_ESTIMATE_MIN_BY_DIFFICULTY)) {
    if (!isPositiveNumber(estimates[difficulty])) estimates[difficulty] = minutes;
  }
  return estimates;
};

/**
 * The settings keys a reader dereferences without a guard (`planToday`, `applyOutcome`,
 * `recomputeSchedule`, two views). One row per key, so a new required setting is a row. A row either
 * says whether a saved value can be kept (`valid`) and what replaces it (`fallback`), or carries its
 * own `repair` when keep-or-replace is too coarse. `fallback` sees the settings so far, because the
 * seed floor must not exceed a smaller saved budget. Only type and finiteness are checked, plus the form's
 * ceiling on a box interval: a hand-set number such as a 5-minute budget is the owner's number.
 */
const REQUIRED_SETTINGS = [
  { key: "dailyBudgetMin", valid: isPositiveNumber, fallback: () => DEFAULT_DAILY_BUDGET_MIN },
  { key: "dailyFloorMin", valid: isPositiveNumber, fallback: (settings) => Math.min(DEFAULT_DAILY_FLOOR_MIN, settings.dailyBudgetMin) },
  { key: "boxIntervalsDays", valid: isIntervalList, fallback: () => [...DEFAULT_BOX_INTERVALS_DAYS] },
  { key: "estimateMinByDifficulty", repair: mergeEstimates },
];

const hasUnlockNumbers = (t) => isRecord(t) && Number.isFinite(t.minMocks) && Number.isFinite(t.minSolvedCleanRate);

/**
 * Gives every saved list and record the container shape its readers assume, keeping well-formed
 * records as they are. Runs on whatever a load hands back, so one hand-edited field cannot take a
 * screen down later. Idempotent; mutates and returns `state`. Repairs containers only, with one
 * exception: each attempt's `mistakeTags` is made a list of strings, because four readers (two
 * screens, a summary and the stats) would otherwise each need their own guard (TODO 172).
 */
function repairSavedShapes(state) {
  for (const { field, repair, optional } of SAVED_SHAPES) {
    if (optional && !(field in state)) continue;
    state[field] = repair(state[field]);
  }
  for (const problem of recordsOnly(state.problems)) {
    if (Array.isArray(problem.attempts)) problem.attempts = problem.attempts.map(withTextTags);
  }
  if (!isRecord(state.settings)) state.settings = {};
  if (!hasUnlockNumbers(state.settings.systemDesignUnlockThreshold)) {
    state.settings.systemDesignUnlockThreshold = { ...DEFAULT_SYSTEM_DESIGN_UNLOCK };
  }
  for (const { key, valid, fallback, repair } of REQUIRED_SETTINGS) {
    const saved = state.settings[key];
    if (repair) state.settings[key] = repair(saved);
    else if (!valid(saved)) state.settings[key] = fallback(state.settings);
  }
  return state;
}

/**
 * The schema-8 step: give `tickLog` the ticks `dayChecks` still holds.
 *
 * Only the last two weeks of ticks survive there, so the record starts partial
 * on purpose; inventing older ticks would be inventing data. A day already in
 * `tickLog` is left as it is. Idempotent. A `tickLog` that is not an object is
 * replaced, since nothing in it can be trusted.
 */
export function seedTickLog(state) {
  const log = isRecord(state.tickLog) ? state.tickLog : {};
  for (const [date, ticks] of Object.entries(isRecord(state.dayChecks) ? state.dayChecks : {})) {
    if (exactDayOf(date) === null || !isRecord(ticks) || date in log) continue;
    const credits = Object.fromEntries(HAND_TICKED_KINDS.filter((kind) => ticks[kind] === true)
      .map((kind) => [kind, tickCredit(state, kind, date)]));
    if (Object.keys(credits).length) log[date] = credits;
  }
  state.tickLog = log;
}

export function migrateState(state) {
  // This runs on whatever GitHub, the cache or an import hands back. A file that
  // is not an object is not a state to repair; failing loudly beats returning a
  // seed, which would quietly replace a person's log on the import path.
  if (!isRecord(state)) {
    throw new AppError("This file is not a saved Ledger state.", { code: "bad_state" });
  }
  repairSavedShapes(state);
  // Backfilled rather than only defaulted at read time, so the Settings table
  // has something to show and a saved value is distinguishable from an absent
  // one.
  //
  // `settings` itself is made a record by repairSavedShapes: this function runs
  // on whatever GitHub returns, and the first line to reach into it found a
  // file without one.
  if (!state.settings.questionMinutes) state.settings.questionMinutes = { ...DEFAULT_QUESTION_MINUTES };
  if (!state.settings.planMinutes) state.settings.planMinutes = { ...DEFAULT_PLAN_MINUTES };
  if (!state.settings.designMinutes) state.settings.designMinutes = { ...DEFAULT_DESIGN_MINUTES };
  // Off for anyone who had a log before design existed. Opting in is a
  // setting, not a surprise.
  if (typeof state.settings.designShare !== "number") state.settings.designShare = 0;

  // The bank grows: a release that adds a problem should add it to every
  // existing log, merged by id so nothing already attempted is touched.
  state.designProblems = recordsOnly(state.designProblems);
  const haveDesign = new Set(state.designProblems.map((p) => p.id));
  for (const p of DESIGN_PROBLEMS) {
    if (haveDesign.has(p.id)) continue;
    state.designProblems.push({
      id: p.id, name: p.name, difficulty: p.difficulty,
      status: STATUS_ACTIVE, ...unattempted(),
    });
  }
  // Deliberately not backfilled with today's date: newDayTimer() stamps the
  // day it was made, and logic.js treats a timer from another date as an empty
  // day, so an absent one and a stale one behave identically.
  if (!state.dayTimer) state.dayTimer = newDayTimer();
  if (!isRecord(state.meta)) state.meta = { schemaVersion: 2, createdAt: new Date().toISOString() };
  // Which release last opened this file. Separate from schemaVersion, which
  // says what shape the data is in: this says which build produced it, so when
  // something looks wrong in a synced state there's a way to tell what wrote
  // it without guessing from the commit history.
  state.meta.appVersion = APP_VERSION;
  // Backfill any patterns added after this state.json was first created —
  // merge by id so nothing already there (and no progress against it) is
  // touched, just append what's missing.
  state.patterns = recordsOnly(state.patterns);
  const known = new Set(state.patterns.map((p) => p.id));
  for (const p of PATTERNS) {
    if (!known.has(p.id)) state.patterns.push({ ...p });
  }
  // Problems saved before the bank existed were all deliberately chosen, so
  // they stay in the review rotation. Only problems added from the bank after
  // this point start as backlog. See STATUS_ACTIVE/STATUS_BACKLOG in logic.js.
  state.problems = recordsOnly(state.problems);
  for (const p of state.problems) {
    if (!p.status) p.status = "active";
  }
  // Schema 5 added settings.weekHistory. A configured week with no record gets
  // a `from: null` seed (plus one for this Monday): the true start is not
  // recoverable, so adherence keeps judging earlier weeks as it always did and
  // labels them assumed.
  seedWeekHistory(state);
  // Schema 6 made design problems count toward a week. A record written
  // before that gets one new entry from this Monday; older entries stay as
  // written and are judged the old way.
  upgradeWeekHistory(state);
  // Schema 7 made a planned two-mediums round count as two sittings. A plan
  // that holds one gets an entry from this Monday that says so.
  upgradeWeekHistoryForRounds(state);
  // Schema 8 made a ticked design topic count. Ticks still held in dayChecks
  // seed the durable record, and the plan history gets an entry that says
  // ticks are tracked from this Monday.
  seedTickLog(state);
  upgradeWeekHistoryForTicks(state);
  state.meta.schemaVersion = Math.max(state.meta.schemaVersion || 1, 8);
  return state;
}
