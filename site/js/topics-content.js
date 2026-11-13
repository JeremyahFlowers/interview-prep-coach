// Curriculum content for the Topics tab: one deep-dive page per pattern.
// Written as genuine technique explanations (not fetched or fabricated from
// anywhere) — the "practice ladder" for each is built at render time from
// your own logged problems in views.js, not hardcoded here, so it stays
// accurate as you log more.
//
// Every entry leads with `hook`: one plain-language sentence, a concrete
// image before any jargon — the on-ramp for "explain it simply first."
// `concept` is the same idea stated precisely, for once the hook has landed.
export const TOPICS = {
  "two-pointers": {
    hook: "Two fingers on the page, moving toward each other until they meet in the middle.",
    concept:
      "Two indices move through a linear structure — usually sorted — converging toward each other or advancing at different rates, replacing what would otherwise be a nested loop.",
    recognize: ["sorted array", "pair or triplet sums to a target", "palindrome check", "merge two sorted structures"],
    invariant: "Everything the pointers have already passed satisfies a property you can rely on without re-checking it.",
    pitfalls: [
      "Forgetting to skip duplicates when the problem wants unique results (classic 3Sum bug).",
      "Advancing both pointers when the comparison says only one should move.",
      "Off-by-one on the stopping condition — l < r vs l <= r changes whether the middle element is revisited.",
    ],
  },
  "sliding-window": {
    hook: "A picture frame you slide across a row of numbers, only ever looking at what's inside it.",
    concept:
      "Maintain a window [left, right] over an array or string. Expand right to explore, contract left to restore a violated constraint, and track a running aggregate incrementally instead of recomputing it per window.",
    recognize: ["substring / subarray", "contiguous", "at most K / exactly K distinct", "longest or shortest satisfying a condition"],
    invariant: "The window always satisfies — or is actively being brought back to satisfy — the constraint, and the aggregate exactly reflects the window's current contents.",
    pitfalls: [
      "Using `if` to shrink when the window is variable-size and needs a `while`.",
      "Updating the aggregate on expand but forgetting to undo it on contract.",
      "Off-by-one on window length: it's right - left + 1, not right - left.",
    ],
  },
  "arrays-hashing": {
    hook: "A sticky-note wall — write down what you've already seen so you can check for it instantly later.",
    concept:
      "Trade space for near-O(1) lookup: a hash set to remember what's been seen, or a hash map keyed by a derived signature (sorted string, frequency vector) to group related items.",
    recognize: ["have I seen this before", "count occurrences", "group by some derived key", "does the complement exist"],
    invariant: "The map always reflects exactly what's been processed so far — nothing more, nothing less.",
    pitfalls: [
      "Mutating the array while also using it to build a hash key.",
      "Using a mutable object as a map key without first converting it to a canonical string.",
      "Rebuilding the whole map every iteration instead of updating it incrementally.",
    ],
  },
  strings: {
    hook: "Treat text as just another array of characters you can scan, split, and rebuild.",
    concept:
      "Manipulation that's really about the shape of text — tokenizing, building output character by character, reversing in place — rather than a search pattern from the categories above.",
    recognize: ["parsing with delimiters", "in-place transformation", "character classification", "the hard part is edge cases, not the algorithm"],
    invariant: "You always know exactly where the current token starts and ends.",
    pitfalls: [
      "Off-by-one on substring bounds.",
      "Not handling empty strings or whitespace-only input.",
      "Naive concatenation in a loop going quadratic in languages where strings are immutable.",
    ],
  },
  "binary-search": {
    hook: "Guess the middle, and let 'too high' or 'too low' throw away half the remaining guesses every time.",
    concept:
      "Halve the search space using a monotonic predicate — 'is this value good enough' — even when the input doesn't look sorted at first glance.",
    recognize: ["sorted", "minimize the maximum / maximize the minimum", "a boundary between a false region and a true region", "answer needs to be O(log n)"],
    invariant: "lo and hi always bracket a range that contains the answer, and the predicate flips exactly once inside it.",
    pitfalls: [
      "Infinite loops when mid doesn't actually shrink the range on every iteration.",
      "Mixing up lo <= hi (searching for an exact index) with lo < hi (searching for a boundary).",
      "mid = (lo + hi) / 2 overflowing — use lo + (hi - lo) / 2 in fixed-width integer languages.",
    ],
  },
  "recursion-dp": {
    hook: "Solve the small version of the problem, remember the answer, and reuse it instead of solving it again.",
    concept:
      "Break a problem into overlapping subproblems and solve each exactly once — top-down with memoization, or bottom-up with an iterative table.",
    recognize: ["count the ways to...", "minimum/maximum cost to reach...", "can you partition/reach a target", "optimal substructure with overlapping subproblems"],
    invariant: "Once a memo or table entry is written, it's the final correct answer for that state — never partially correct.",
    pitfalls: [
      "Recomputing without memoizing — this repo's own minimum_cost_to_merge_sorted_lists.cpp is a live example of exactly this bug.",
      "A base case that's slightly wrong, which silently corrupts every state built on top of it.",
      "A state definition missing a dimension that actually matters (e.g. 'used item i or not').",
    ],
  },
  "bit-manipulation": {
    hook: "Flip switches instead of numbers — each bit is a little on/off light you can read and change directly.",
    concept:
      "Use bitwise operators to pack and unpack information, toggle or check individual bits, and exploit properties like XOR's self-cancellation.",
    recognize: ["without extra space", "a single number among duplicates", "power of two", "count set bits"],
    invariant: "You always know exactly what each bit position in your encoding represents.",
    pitfalls: [
      "Sign-extension surprises from right-shifting a negative number.",
      "Off-by-one on bit index — confirm whether you're 0-indexing from the LSB.",
      "Operator precedence: bitwise operators bind looser than comparisons in C-family languages, so `a & b == c` isn't what it looks like.",
    ],
  },
  "2d-matrix": {
    hook: "Walk the edges of a shrinking rectangle, like peeling a picture frame layer by layer.",
    concept:
      "Traversal or in-place transformation of a grid, usually via shrinking boundaries (top/bottom/left/right) or a direction vector with a 'turn when blocked' rule.",
    recognize: ["rotate", "spiral order", "search a row/column-sorted grid", "in-place transformation"],
    invariant: "Shrinking boundaries never cross, and a direction vector plus a turn rule fully describes the walk.",
    pitfalls: [
      "Transposing then reversing the wrong axis (rows vs columns).",
      "Off-by-one on boundary comparisons — <= vs < at the edges.",
      "Overwriting a cell before reading the value you still needed from it.",
    ],
  },
  knapsack: {
    hook: "You've got a backpack with limited space — for every item, decide: take it, or leave it?",
    concept:
      "Choice DP over items and a capacity/target dimension: 0/1 (include or exclude each item once) or unbounded (include any number of times).",
    recognize: ["subset sums to X", "partition into two equal halves", "minimum coins to make change", "maximum value under a weight limit"],
    invariant: "dp[i][cap] means 'best achievable using the first i items within capacity cap' — never referencing items not yet decided.",
    pitfalls: [
      "Iterating the capacity loop the wrong direction: backward for 0/1 (forward double-counts an item), forward for unbounded.",
      "Off-by-one between capacity and array index.",
      "Forgetting the dp[0][*] base case, which corrupts everything built on top of it.",
    ],
  },
  monotonic_stack: {
    hook: "A stack of dominoes, each one shorter than the last — anything that breaks that order gets knocked off.",
    concept:
      "Keep a stack (or deque) in strict sorted order by evicting anything that violates it before pushing — the eviction moment reveals 'next greater/smaller' relationships in O(n) total.",
    recognize: ["next greater or smaller element", "largest rectangle in a histogram", "sliding window maximum/minimum"],
    invariant: "The stack/deque is always strictly increasing or strictly decreasing (pick one, stay consistent) — an eviction IS the answer for the evicted element.",
    pitfalls: [
      "Storing values instead of indices when you need the index or width later.",
      "Reaching for a plain stack when the window is fixed-size — that needs a deque with eviction from both ends.",
      "Off-by-one on the width calculation after popping.",
    ],
  },
  mst: {
    hook: "Connect every dot using the cheapest possible wires, one wire at a time.",
    concept:
      "Build a spanning tree of minimum total edge weight: Prim's grows outward from a start node with a min-heap of frontier edges; Kruskal's sorts all edges and union-finds the cheapest ones that don't form a cycle.",
    recognize: ["connect all points/nodes with minimum total cost"],
    invariant: "The growing tree never contains a cycle, and every edge added was the cheapest available at that moment.",
    pitfalls: [
      "Skipping path compression / union by rank in Kruskal's — still correct, just slow on adversarial input.",
      "Forgetting Prim's needs a visited set, or you'll re-add a node that's already in the tree.",
      "Not being able to justify Prim's vs Kruskal's out loud (dense graphs usually favor Prim's, sparse favor Kruskal's).",
    ],
  },
  quick_sort: {
    hook: "Pick a middle value, throw everything smaller to one side and bigger to the other, then repeat on each side.",
    concept:
      "Partition-based sorting or selection: pick a pivot, rearrange so smaller elements land left and larger land right, then recurse on the side you actually need (quickselect) or both (full sort).",
    recognize: ["kth largest/smallest", "sort in-place", "three-way partition (Dutch national flag)"],
    invariant: "Everything left of the partition boundary is provably, permanently on the correct side — you never revisit it.",
    pitfalls: [
      "A partition scheme that doesn't shrink the range on all-equal input, causing an infinite loop.",
      "Worst-case O(n²) on already-sorted input with a naive first-or-last-element pivot.",
      "Off-by-one swapping the pivot into its final resting position.",
    ],
  },
  topological_sort: {
    hook: "Figure out a valid order to run chores when some chores depend on others being done first.",
    concept:
      "Order the nodes of a DAG so every edge points from earlier to later — Kahn's algorithm repeatedly removes in-degree-0 nodes, or DFS postorder reversed.",
    recognize: ["course prerequisites", "build order", "any valid ordering respecting dependencies"],
    invariant: "A node is only emitted once every one of its prerequisites has already been emitted.",
    pitfalls: [
      "Not detecting a cycle — in Kahn's, emitting fewer nodes than exist in the graph means a cycle, and that's often the actual question being asked.",
      "The DFS version needs a three-color (unvisited/in-progress/done) scheme to catch back-edges, not just a visited boolean.",
    ],
  },
  trie: {
    hook: "A word-guessing tree where every letter you type walks you one branch deeper.",
    concept:
      "A tree where each root-to-node path spells out a prefix, giving prefix search, autocomplete, and exact-word lookup in O(word length) regardless of dictionary size.",
    recognize: ["prefix", "autocomplete", "many queries against one fixed dictionary of words"],
    invariant: "Every node's children fully represent every string sharing its path as a prefix; an explicit end-of-word flag marks complete words.",
    pitfalls: [
      "Forgetting the end-of-word flag and confusing 'prefix exists' with 'word exists' — one word can be a prefix of another.",
      "Hardcoding a 26-slot child array when the alphabet isn't strictly lowercase a-z.",
    ],
  },
  "union-find": {
    hook: "Groups of friends — when two groups meet each other, they merge into one bigger group.",
    concept:
      "A disjoint-set structure answering 'are these connected' and 'merge these two groups' in near-O(1) amortized, using path compression and union by rank/size.",
    recognize: ["connected components", "detect a cycle in an undirected graph", "accounts merge / provinces / islands via union operations"],
    invariant: "find(x) always returns the same representative for everything in x's component; path compression changes lookup speed, never correctness.",
    pitfalls: [
      "Skipping path compression or union by rank — still correct, just degrades toward O(n) per call on adversarial input.",
      "Off-by-one when nodes are 1-indexed but the backing array is 0-indexed.",
    ],
  },
  "linked-list": {
    hook: "A treasure hunt where each clue only tells you where to find the next clue.",
    concept:
      "A chain of nodes linked by `next` pointers. Most techniques rewire pointers in place (often with a dummy head) or run two pointers at different speeds through the same chain.",
    recognize: ["reverse a linked list", "detect / find the start of a cycle", "merge two sorted lists", "find the middle node in one pass"],
    invariant: "At every step, the part of the list you've already rewired is a valid (if partial) list — you never lose the rest of the chain because you save `next` before overwriting it.",
    pitfalls: [
      "Overwriting a node's `next` before saving a reference to it — the classic way to lose the rest of the list.",
      "Skipping a dummy head, which turns 'the new head might be a different node' into an annoying special case instead of a non-issue.",
      "Off-by-one with fast/slow pointers when finding the middle — lands one node early or late depending on even/odd length and the loop condition.",
    ],
  },
  trees: {
    hook: "A family tree — you can walk it top-down, or ask 'who are my kids' at every stop.",
    concept:
      "A hierarchical structure where each node has up to two children. Most techniques are a choice of traversal order (pre/in/post-order DFS, or level-by-level BFS) plus what you do at each visit.",
    recognize: ["binary tree / BST", "level order", "lowest common ancestor", "symmetric / balanced / same tree", "serialize or construct from a traversal"],
    invariant: "A recursive traversal's correctness for the whole tree only depends on it being correct for a node given already-correct answers from its children — never on looking above a node to process it.",
    pitfalls: [
      "Confusing preorder/inorder/postorder — the difference is only WHEN you visit the node relative to its children, and it changes what each is useful for (inorder on a BST = sorted order).",
      "Forgetting the null-child base case, which is what actually stops the recursion.",
      "Reaching for DFS when the problem is really asking for level-by-level structure (BFS), or vice versa.",
    ],
  },
  "graphs-bfs-dfs": {
    hook: "Explore a maze — either go as deep as you can before backing up, or check every neighbor before going further.",
    concept:
      "Explore a graph node by node, marking each visited exactly once — DFS dives depth-first via recursion or an explicit stack, BFS spreads outward level by level via a queue. The same idea as tree traversal, generalized to structures that can have cycles and multiple paths to a node.",
    recognize: ["number of islands / connected components", "clone a graph", "shortest path in an unweighted graph", "does a path exist between A and B", "flood fill"],
    invariant: "A node is only ever processed once — the visited set is what turns a graph (which can have cycles) into something as safe to walk as a tree.",
    pitfalls: [
      "Forgetting the visited set entirely — infinite loop on any cycle.",
      "Marking a node visited when it's DEQUEUED instead of when it's ENQUEUED in BFS — lets it enter the queue multiple times before being processed.",
      "Using DFS to find a shortest path — DFS finds *a* path, not the shortest one; that needs BFS (unweighted) or Dijkstra (weighted).",
    ],
  },
  backtracking: {
    hook: "Try a choice; if it leads nowhere, undo it and try the next one — like solving a maze with a pencil and an eraser.",
    concept:
      "Build a candidate solution one choice at a time, and the instant it's provably invalid (or complete), stop extending it and undo the last choice — depth-first search over a tree of decisions, with pruning.",
    recognize: ["all permutations / subsets / combinations", "N-Queens or Sudoku-style placement", "generate all valid X", "word search on a grid"],
    invariant: "Undoing a choice always returns the shared candidate state to exactly what it was before that choice was made — sibling branches depend on that cleanup.",
    pitfalls: [
      "Forgetting to undo the choice after recursing — the classic bug, since the shared-state trick only works if you clean up.",
      "Not pruning early enough — technically correct but explores far more of the decision tree than necessary.",
      "Copying the candidate at the wrong time (too early captures an incomplete answer; too late means every 'saved' answer is actually the same mutated reference).",
    ],
  },
  heap: {
    hook: "A line where the smallest (or biggest) person is always at the front, no matter who joins later.",
    concept:
      "A binary tree kept in an array where every parent is ≤ (min-heap) or ≥ (max-heap) its children — not fully sorted, just enough order to make 'give me the smallest/largest' an O(log n) operation instead of O(n).",
    recognize: ["top K / kth largest", "merge K sorted lists", "running median", "K closest points"],
    invariant: "The root is always the min (or max) of everything currently in the heap — nothing else needs to be in order.",
    pitfalls: [
      "Reaching for a full sort when only the top K matters — a heap of size K is O(n log K) against a full sort's O(n log n); for K ≪ n that's real.",
      "Using a max-heap for a 'k smallest' problem or vice versa — the heap type should match what you want to evict cheaply, often the opposite of what you keep.",
      "Forgetting a heap gives O(1) peek but O(log n) to remove — popping n times is O(n log n), not O(n).",
    ],
  },
  intervals: {
    hook: "Lay a bunch of time blocks on a calendar and squish the overlapping ones together.",
    concept:
      "Sort intervals by start time, then sweep left to right, comparing each interval only against the one immediately before it — sorting turns an O(n²) all-pairs comparison into a single O(n) pass.",
    recognize: ["merge overlapping intervals", "insert interval", "meeting rooms / can attend all", "minimum number of rooms"],
    invariant: "After sorting by start, if the current interval doesn't overlap the last merged one, it can never overlap anything merged before that either — only the most recent merged interval ever matters.",
    pitfalls: [
      "Forgetting to sort first — the 'only compare to the previous one' trick depends entirely on start-sorted order.",
      "Off-by-one on the overlap test — whether touching endpoints (end == next start) counts as overlap depends on the problem's closed-vs-half-open convention.",
      "Merging into a new list while iterating the same list being modified.",
    ],
  },
  "prefix-sum": {
    hook: "Keep a running total as you go, so you never have to re-add the same numbers twice.",
    concept:
      "Precompute running totals once so any subarray sum becomes a single subtraction (prefix[j] − prefix[i]) instead of re-summing a range on every query.",
    recognize: ["subarray sum equals K", "range sum query, multiple queries", "equilibrium / pivot index"],
    invariant: "prefix[i] always equals the exact sum of everything before index i — computed once, reused for every query after.",
    pitfalls: [
      "Off-by-one on whether prefix[i] includes index i or stops just before it — pick one convention and hold it for the whole solution.",
      "Recomputing a range sum with a loop when the entire point of prefix sums is to make that O(1).",
      "For 'subarray sum equals K' specifically: forgetting to seed the hash map with {0: 1} — that's what makes a subarray starting at index 0 countable.",
    ],
  },
  greedy: {
    hook: "Grab the best-looking option right now and never look back — works only when that's actually safe to do.",
    concept:
      "At each step, make whichever choice looks best right now, without reconsidering it later — valid only when a locally optimal choice is provably never worse than any alternative for the global answer. That proof is the actual hard part, not the code.",
    recognize: ["jump game / minimum jumps", "gas station", "activity selection / non-overlapping intervals", "assign cookies / two-pointer greedy matching"],
    invariant: "Once a greedy choice is made, it's never revisited — if that's not actually safe for this problem, greedy is the wrong tool, not just an unlucky bug.",
    pitfalls: [
      "Assuming greedy works without checking — it's correct surprisingly rarely; the real interview signal is explaining WHY the local choice is safe, not just writing the loop.",
      "Confusing greedy with DP — if a locally-best choice can be invalidated by a later decision, that's a DP problem wearing a greedy disguise.",
      "Not sorting first when the strategy depends on processing items in a specific order (very common — e.g. by end time for interval scheduling).",
    ],
  },
};
