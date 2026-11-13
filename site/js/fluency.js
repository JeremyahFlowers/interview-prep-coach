// Your language, until the syntax takes no thought.
//
// Where this fits: beside the pattern drill, and read by it. The pattern drill
// asks "which technique is this?"; this asks "can you write the line that
// technique needs, right now, without looking it up?" — which is the half a
// top-tier loop assumes you already have. Meta's bar is two mediums in
// forty-five minutes, and there is no room in that for remembering whether
// Java's priority queue is a min-heap.
//
// The cards are the idioms that come up in almost every problem, not the
// language's whole surface: a frequency map, a heap, a BFS queue, a grid, a
// lower bound. Each carries a correct answer in every editor language and the
// specific way that language gets it wrong — the shared-row grid, the O(n)
// shift(), the max-heap that is a min-heap. The pitfall is the point: most
// people can write these; the drill is for writing them *correctly* at speed.
//
// Everything here is data plus two small functions. No DOM, no storage.

import { todayISO, daysBetween } from "./logic.js";

/** The editor's languages, and what the drill calls them. Kept in step with
 *  CODE_MODES in codemirror-loader.js by a test, not by hand. */
export const LANGUAGES = {
  python: { label: "Python" },
  java: { label: "Java" },
  cpp: { label: "C++" },
  javascript: { label: "JavaScript" },
};

export const FLUENCY_CARDS = [
  {
    id: "freq-map", topic: "Hash maps",
    prompt: "Count how many times each character appears in a string s.",
    answers: {
      python: `from collections import Counter\ncount = Counter(s)`,
      java: `Map<Character, Integer> count = new HashMap<>();\nfor (char c : s.toCharArray()) count.merge(c, 1, Integer::sum);`,
      cpp: `unordered_map<char, int> count;\nfor (char c : s) count[c]++;`,
      javascript: `const count = new Map();\nfor (const c of s) count.set(c, (count.get(c) ?? 0) + 1);`,
    },
    pitfalls: {
      cpp: "count[c] on a key that is not there inserts it with 0. Fine for counting; wrong for checking membership — use count.count(c) or find().",
      java: "getOrDefault then put is the long way round; merge does it in one call.",
      javascript: "A plain object works too, but its keys are always strings, and a key like \"__proto__\" is not a key. Map has neither problem.",
    },
  },
  {
    id: "sort-pairs", topic: "Sorting",
    prompt: "Sort a list of pairs [a, b] by b ascending, breaking ties by a descending.",
    answers: {
      python: `pairs.sort(key=lambda p: (p[1], -p[0]))`,
      java: `Arrays.sort(pairs, (x, y) -> x[1] != y[1]\n    ? Integer.compare(x[1], y[1])\n    : Integer.compare(y[0], x[0]));`,
      cpp: `sort(pairs.begin(), pairs.end(), [](const auto& x, const auto& y) {\n  return x[1] != y[1] ? x[1] < y[1] : x[0] > y[0];\n});`,
      javascript: `pairs.sort((x, y) => x[1] - y[1] || y[0] - x[0]);`,
    },
    pitfalls: {
      javascript: "With no comparator, sort compares as strings: [10, 9, 1].sort() is [1, 10, 9].",
      java: "x[1] - y[1] as a comparator overflows for large or negative values. Integer.compare cannot.",
      python: "Negating for descending only works on numbers. For strings, sort twice — stable sort, secondary key first.",
      cpp: "The comparator must be a strict weak ordering: <, never <=. <= is undefined behaviour and can crash.",
    },
  },
  {
    id: "min-heap", topic: "Heaps",
    prompt: "A min-heap of (distance, node): push one, then pop the smallest.",
    answers: {
      python: `import heapq\nheap = []\nheapq.heappush(heap, (dist, node))\nd, u = heapq.heappop(heap)`,
      java: `PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0]));\nheap.offer(new int[] {dist, node});\nint[] top = heap.poll();`,
      cpp: `priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> heap;\nheap.push({dist, node});\nauto [d, u] = heap.top();\nheap.pop();`,
      javascript: `// No built-in heap. Say so, then write one:\nclass MinHeap {\n  constructor() { this.a = []; }\n  get size() { return this.a.length; }\n  push(x) {\n    const a = this.a; a.push(x);\n    for (let i = a.length - 1; i > 0;) {\n      const p = (i - 1) >> 1;\n      if (a[p][0] <= a[i][0]) break;\n      [a[p], a[i]] = [a[i], a[p]]; i = p;\n    }\n  }\n  pop() {\n    const a = this.a, top = a[0], last = a.pop();\n    if (a.length) {\n      a[0] = last;\n      for (let i = 0; ;) {\n        const l = 2 * i + 1, r = l + 1; let m = i;\n        if (l < a.length && a[l][0] < a[m][0]) m = l;\n        if (r < a.length && a[r][0] < a[m][0]) m = r;\n        if (m === i) break;\n        [a[m], a[i]] = [a[i], a[m]]; i = m;\n      }\n    }\n    return top;\n  }\n}`,
    },
    pitfalls: {
      cpp: "priority_queue is a MAX-heap by default. greater<> is what makes it a min-heap, and forgetting it turns Dijkstra into something that terminates with the wrong answer.",
      python: "heapq is min-only. For a max-heap push -x and negate on the way out.",
      java: "PriorityQueue with no comparator is a min-heap; Collections.reverseOrder() for max. Iterating it does not give sorted order — only poll() does.",
      javascript: "Sorting an array after every insert is O(n log n) per push. Fine for tiny inputs if you name the cost; not what a heap problem is asking.",
    },
  },
  {
    id: "bfs-queue", topic: "Queues",
    prompt: "The queue for a BFS: start with one node, then take from the front until it is empty.",
    answers: {
      python: `from collections import deque\nq = deque([start])\nwhile q:\n    u = q.popleft()`,
      java: `Deque<Integer> q = new ArrayDeque<>();\nq.offer(start);\nwhile (!q.isEmpty()) {\n  int u = q.poll();\n}`,
      cpp: `queue<int> q;\nq.push(start);\nwhile (!q.empty()) {\n  int u = q.front();\n  q.pop();\n}`,
      javascript: `const q = [start];\nfor (let head = 0; head < q.length; head++) {\n  const u = q[head];\n  // push onto q as you discover neighbours\n}`,
    },
    pitfalls: {
      python: "list.pop(0) is O(n). A BFS built on it is quadratic, and on a large grid that is a timeout.",
      javascript: "shift() is O(n) for the same reason. A moving head index keeps it O(1).",
      cpp: "pop() returns nothing. Read front() first, then pop().",
      java: "Stack and LinkedList both work and both are the old way; ArrayDeque is faster and is what an interviewer expects.",
    },
  },
  {
    id: "grid", topic: "Grids",
    prompt: "An m × n grid of false, for tracking what you have visited.",
    answers: {
      python: `seen = [[False] * n for _ in range(m)]`,
      java: `boolean[][] seen = new boolean[m][n];`,
      cpp: `vector<vector<bool>> seen(m, vector<bool>(n, false));`,
      javascript: `const seen = Array.from({ length: m }, () => new Array(n).fill(false));`,
    },
    pitfalls: {
      python: "[[False] * n] * m is one row repeated m times. Marking one cell marks the whole column.",
      javascript: "new Array(m).fill(new Array(n).fill(false)) has the same bug: one row object, m references to it.",
      cpp: "vector<bool> is a bit-packed special case: fine here, but &seen[r][c] is not a bool*.",
    },
  },
  {
    id: "neighbours", topic: "Grids",
    prompt: "Visit the four neighbours of (r, c) that are inside an m × n grid.",
    answers: {
      python: `for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):\n    nr, nc = r + dr, c + dc\n    if 0 <= nr < m and 0 <= nc < n:\n        ...`,
      java: `int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};\nfor (int[] d : dirs) {\n  int nr = r + d[0], nc = c + d[1];\n  if (nr >= 0 && nr < m && nc >= 0 && nc < n) { ... }\n}`,
      cpp: `const int dr[] = {1, -1, 0, 0}, dc[] = {0, 0, 1, -1};\nfor (int k = 0; k < 4; k++) {\n  int nr = r + dr[k], nc = c + dc[k];\n  if (nr >= 0 && nr < m && nc >= 0 && nc < n) { ... }\n}`,
      javascript: `for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {\n  const nr = r + dr, nc = c + dc;\n  if (nr >= 0 && nr < m && nc >= 0 && nc < n) { ... }\n}`,
    },
    pitfalls: {
      python: "grid[-1] is the last row, not an error. Drop the lower-bound check and it does not crash — it quietly wraps around.",
      javascript: "grid[-1] is undefined and grid[-1][0] throws. Check bounds before indexing, not after.",
    },
  },
  {
    id: "lower-bound", topic: "Binary search",
    prompt: "In a sorted array a, the first index i with a[i] >= target (a.length if there is none).",
    answers: {
      python: `from bisect import bisect_left\ni = bisect_left(a, target)`,
      java: `int lo = 0, hi = a.length;\nwhile (lo < hi) {\n  int mid = lo + (hi - lo) / 2;\n  if (a[mid] < target) lo = mid + 1;\n  else hi = mid;\n}\n// lo is the answer`,
      cpp: `int i = lower_bound(a.begin(), a.end(), target) - a.begin();`,
      javascript: `let lo = 0, hi = a.length;\nwhile (lo < hi) {\n  const mid = (lo + hi) >> 1;\n  if (a[mid] < target) lo = mid + 1;\n  else hi = mid;\n}\n// lo is the answer`,
    },
    pitfalls: {
      java: "Arrays.binarySearch returns *an* index when there are duplicates, not the first, and a negative insertion point when absent. Write the loop.",
      cpp: "lower_bound is >=, upper_bound is >. Mixing them up is off by one on every duplicate.",
      python: "bisect_left is >=, bisect_right is >. Same trap, same names as C++.",
    },
  },
  {
    id: "map-entries", topic: "Hash maps",
    prompt: "Loop over a map, with the key and the value both in hand.",
    answers: {
      python: `for key, value in counts.items():\n    ...`,
      java: `for (Map.Entry<String, Integer> e : counts.entrySet()) {\n  String key = e.getKey();\n  int value = e.getValue();\n}`,
      cpp: `for (const auto& [key, value] : counts) {\n  ...\n}`,
      javascript: `for (const [key, value] of counts) {   // a Map\n  ...\n}\n// a plain object: Object.entries(obj)`,
    },
    pitfalls: {
      java: "Removing from the map inside this loop throws ConcurrentModificationException. Use the iterator's remove(), or removeIf on entrySet().",
      cpp: "Without the &, every pair is copied. With const auto& it is not.",
      javascript: "for...in on an object also walks inherited keys and gives every key as a string. for...of on a Map does neither.",
    },
  },
  {
    id: "build-string", topic: "Strings",
    prompt: "Build one string out of many pieces in a loop.",
    answers: {
      python: `parts = []\nfor x in items:\n    parts.append(str(x))\nresult = "".join(parts)`,
      java: `StringBuilder sb = new StringBuilder();\nfor (int x : items) sb.append(x);\nString result = sb.toString();`,
      cpp: `string result;\nfor (int x : items) result += to_string(x);`,
      javascript: `const result = items.join("");`,
    },
    pitfalls: {
      java: "s += x in a loop copies the whole string every time: O(n²). Strings are immutable; StringBuilder is not.",
      python: "+= on a str is often optimised and never guaranteed. join is the idiom an interviewer is listening for.",
      cpp: "+= on std::string is amortised O(1) — this one is fine. result = result + x is not.",
    },
  },
  {
    id: "infinity", topic: "Numbers",
    prompt: "A starting value for \"smallest so far\" that anything will beat.",
    answers: {
      python: `best = float("inf")`,
      java: `int best = Integer.MAX_VALUE;   // Long.MAX_VALUE for long`,
      cpp: `int best = INT_MAX;   // <climits>, or numeric_limits<int>::max()`,
      javascript: `let best = Infinity;`,
    },
    pitfalls: {
      java: "Integer.MAX_VALUE + 1 is Integer.MIN_VALUE. Never add to the sentinel — best + cost overflows and suddenly looks like the best answer.",
      cpp: "Same overflow, and it is undefined behaviour rather than a wrap. A common dodge is 1e9 as \"infinity\", which leaves room to add.",
    },
  },
  {
    id: "adjacency", topic: "Graphs",
    prompt: "An undirected adjacency list for nodes 0..n-1 from an edge list [[u, v], ...].",
    answers: {
      python: `graph = [[] for _ in range(n)]\nfor u, v in edges:\n    graph[u].append(v)\n    graph[v].append(u)`,
      java: `List<List<Integer>> graph = new ArrayList<>();\nfor (int i = 0; i < n; i++) graph.add(new ArrayList<>());\nfor (int[] e : edges) {\n  graph.get(e[0]).add(e[1]);\n  graph.get(e[1]).add(e[0]);\n}`,
      cpp: `vector<vector<int>> graph(n);\nfor (auto& e : edges) {\n  graph[e[0]].push_back(e[1]);\n  graph[e[1]].push_back(e[0]);\n}`,
      javascript: `const graph = Array.from({ length: n }, () => []);\nfor (const [u, v] of edges) {\n  graph[u].push(v);\n  graph[v].push(u);\n}`,
    },
    pitfalls: {
      python: "defaultdict(list) works but never lists a node with no edges, so looping over graph misses isolated nodes. Loop range(n).",
      java: "new ArrayList<>(Collections.nCopies(n, new ArrayList<>())) is n references to one list.",
    },
  },
  {
    id: "anagram-key", topic: "Strings",
    prompt: "A key that is the same for any two strings that are anagrams of each other.",
    answers: {
      python: `key = "".join(sorted(s))`,
      java: `char[] cs = s.toCharArray();\nArrays.sort(cs);\nString key = new String(cs);`,
      cpp: `string key = s;\nsort(key.begin(), key.end());`,
      javascript: `const key = [...s].sort().join("");`,
    },
    pitfalls: {
      java: "cs.toString() is the array's identity, not its letters — every key is different. new String(cs).",
      python: "sorted(s) is a list, and a list cannot be a dict key. Join it, or use tuple(sorted(s)).",
      javascript: "[...s] splits by code point; s.split(\"\") splits UTF-16 units and breaks emoji. Irrelevant for a–z, worth knowing.",
    },
  },
  {
    id: "prefix-sums", topic: "Arrays",
    prompt: "Prefix sums of nums, so that the sum of nums[i..j) is one subtraction.",
    answers: {
      python: `prefix = [0]\nfor x in nums:\n    prefix.append(prefix[-1] + x)\n# sum(nums[i:j]) == prefix[j] - prefix[i]`,
      java: `long[] prefix = new long[n + 1];\nfor (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];`,
      cpp: `vector<long long> prefix(n + 1, 0);\nfor (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];`,
      javascript: `const prefix = [0];\nfor (const x of nums) prefix.push(prefix[prefix.length - 1] + x);`,
    },
    pitfalls: {
      java: "An int[] of sums overflows long before the inputs look big. long.",
      cpp: "Same: long long, and prefix[i] + nums[i] still overflows if prefix is int.",
      python: "The leading 0 is the whole trick. Without it every range starting at 0 is a special case.",
    },
  },
  {
    id: "negative-mod", topic: "Numbers",
    prompt: "What are -7 / 2 and -7 % 2, and how do you get an index into a circular array of size n that is never negative?",
    answers: {
      python: `-7 // 2   # -4: floors\n-7 % 2    # 1: takes the divisor's sign\ni % n     # already in 0..n-1 for n > 0`,
      java: `-7 / 2    // -3: truncates toward zero\n-7 % 2    // -1: takes the dividend's sign\n((i % n) + n) % n`,
      cpp: `-7 / 2    // -3: truncates toward zero\n-7 % 2    // -1: takes the dividend's sign\n((i % n) + n) % n`,
      javascript: `Math.trunc(-7 / 2)   // -3 — plain / is floating point\n-7 % 2               // -1\n((i % n) + n) % n`,
    },
    pitfalls: {
      java: "This is where \"works in Python, wrong in Java\" comes from: a circular buffer indexed with i % n reads a[-1] and throws.",
      python: "Python is the odd one out, so a solution ported from Python to anything else breaks exactly here.",
      javascript: "-7 / 2 is -3.5. Integer division needs Math.trunc, or Math.floor if you want Python's behaviour.",
    },
  },
  {
    id: "char-index", topic: "Strings",
    prompt: "Turn a lowercase letter c into 0..25, and turn an index back into its letter.",
    answers: {
      python: `i = ord(c) - ord("a")\nch = chr(i + ord("a"))`,
      java: `int i = c - 'a';\nchar ch = (char) ('a' + i);`,
      cpp: `int i = c - 'a';\nchar ch = 'a' + i;`,
      javascript: `const i = c.charCodeAt(0) - 97;\nconst ch = String.fromCharCode(97 + i);`,
    },
    pitfalls: {
      javascript: "Strings have no arithmetic: \"c\" - \"a\" is NaN, not 2.",
      java: "'a' + i is an int. Without the cast you append 99 to your StringBuilder instead of 'c'.",
    },
  },
  {
    id: "copy-list", topic: "Arrays",
    prompt: "Record the current path in backtracking: add a copy of path to results, not the path itself.",
    answers: {
      python: `results.append(path[:])   # or list(path)`,
      java: `results.add(new ArrayList<>(path));`,
      cpp: `results.push_back(path);   // copies — vectors are values`,
      javascript: `results.push([...path]);`,
    },
    pitfalls: {
      python: "results.append(path) stores the same list every time. When you backtrack it empties, and so does every result.",
      java: "results.add(path) has the same bug; every entry is the one list, which ends empty.",
      javascript: "Same aliasing: push(path) records a reference, not a snapshot.",
      cpp: "The opposite trap: vectors copy on assignment and on pass-by-value. void dfs(vector<int> path) copies at every call — take const vector<int>&.",
    },
  },
];

/** The card with this id, or null; `recordFluency` uses it to drop a press on a card that no longer exists. */
const cardById = (id) => FLUENCY_CARDS.find((c) => c.id === id) || null;

/** Per-language, because being fluent in Python says nothing about Java. */
const keyOf = (lang, id) => `${lang}:${id}`;

/** How a card went, graded by the person who just typed it. */
export const GRADES = {
  instant: { key: "instant", label: "Without thinking" },
  slow: { key: "slow", label: "Had to think" },
  missed: { key: "missed", label: "Got it wrong" },
};

/** How long "had to think" waits before coming back, against "got it wrong",
 *  which comes back today, and "without thinking", which waits longest. */
const REST_DAYS = { instant: 7, slow: 2, missed: 0 };

/**
 * The next card to drill.
 *
 * Never-seen first, because a gap you do not know about is the worst kind.
 * Then whatever you got wrong, then whatever made you think and has rested
 * long enough, then the one seen longest ago. `recent` keeps the last few out
 * so a wrong answer is not asked again before the answer has faded from view —
 * asking it immediately tests whether you can read, not whether you know.
 */
export function pickFluencyCard(state, lang, recent = [], today = todayISO()) {
  const log = state?.fluency || {};
  const pool = FLUENCY_CARDS.filter((c) => c.answers[lang] && !recent.includes(c.id));
  const cards = pool.length ? pool : FLUENCY_CARDS.filter((c) => c.answers[lang]);
  if (!cards.length) return null;

  const score = (card) => {
    const rec = log[keyOf(lang, card.id)];
    if (!rec) return [0, 0];
    const age = rec.at ? daysBetween(rec.at, today) : 999;
    const due = age >= (REST_DAYS[rec.grade] ?? 0);
    const tier = rec.grade === "missed" ? 1 : due && rec.grade === "slow" ? 2 : due ? 3 : 4;
    return [tier, -age];
  };
  return [...cards].sort((a, b) => {
    const [ta, aa] = score(a);
    const [tb, ab] = score(b);
    return ta - tb || aa - ab;
  })[0];
}

/** Record a grade. Mutates `state`; for use inside store.mutate. */
export function recordFluency(state, lang, id, grade, today = todayISO()) {
  if (!GRADES[grade] || !cardById(id) || !LANGUAGES[lang]) return;
  const log = { ...(state.fluency || {}) };
  const prev = log[keyOf(lang, id)] || { n: 0, misses: 0 };
  log[keyOf(lang, id)] = {
    grade, at: today,
    n: prev.n + 1,
    misses: prev.misses + (grade === "missed" ? 1 : 0),
  };
  state.fluency = log;
}

/** How fluent you are in one language: how many cards are at "without
 *  thinking", out of how many exist. */
export function fluencySummary(state, lang) {
  const log = state?.fluency || {};
  const cards = FLUENCY_CARDS.filter((c) => c.answers[lang]);
  const graded = cards.map((c) => log[keyOf(lang, c.id)]).filter(Boolean);
  return {
    total: cards.length,
    seen: graded.length,
    fluent: graded.filter((r) => r.grade === "instant").length,
    shaky: graded.filter((r) => r.grade !== "instant").length,
  };
}
