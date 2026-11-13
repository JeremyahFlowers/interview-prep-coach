// Worked examples for every pattern in Topics — real numbers, hand-traced
// and checked, not placeholder data. Each entry names a diagrams.js
// primitive (array/stack/grid/graph) plus the config that primitive expects.
// Kept separate from topics-content.js so the prose and the animations can
// be edited independently.

export const DIAGRAM_SPECS = {
  "two-pointers": [
    {
      kind: "array",
      title: "Container With Most Water — converging from both ends",
      array: [1, 8, 6, 2, 5, 4, 8, 3, 7],
      steps: [
        { pointers: { L: 0, R: 8 }, caption: "L=0 (h=1), R=8 (h=7). area = min(1,7) × 8 = 8. The shorter side is always the limiter — move it inward." },
        { pointers: { L: 1, R: 8 }, caption: "L=1 (h=8), R=8 (h=7). area = min(8,7) × 7 = 49 — new best. Right is now the shorter side." },
        { pointers: { L: 1, R: 7 }, caption: "L=1 (h=8), R=7 (h=3). area = 3 × 6 = 18. Worse than 49 — keep moving the shorter side." },
        { pointers: { L: 1, R: 6 }, caption: "L=1 (h=8), R=6 (h=8). area = 8 × 5 = 40. Closer, but still short of 49." },
        { pointers: { L: 1, R: 2 }, caption: "Pointers keep converging — nothing beats 49 again before they meet. Answer: 49." },
      ],
    },
    {
      kind: "array",
      title: "3Sum — fix one index, two-pointer the rest",
      array: [-4, -1, -1, 0, 1, 2],
      steps: [
        { pointers: { i: 1, L: 2, R: 5 }, highlight: [1], caption: "Fix i=1 (value −1). Need L+R = 1 to balance it. L=2 (−1), R=5 (2): sum=1 — match! Triplet (−1,−1,2)." },
        { pointers: { i: 1, L: 3, R: 4 }, highlight: [1], caption: "Move both pointers inward. L=3 (0), R=4 (1): sum=1 — another match! Triplet (−1,0,1)." },
        { pointers: { i: 1, L: 4, R: 3 }, highlight: [1], dim: [4, 5], caption: "L and R have crossed — done with i=1. Move on to the next fixed index." },
      ],
    },
  ],

  "sliding-window": [
    {
      kind: "array",
      title: "Longest Substring Without Repeating Characters",
      array: ["a", "b", "c", "a", "b", "c", "b", "b"],
      steps: [
        { pointers: { L: 0, R: 2 }, highlight: [0, 1, 2], caption: "Expand R while every character is new. Window \"abc\", length 3 — current best." },
        { pointers: { L: 0, R: 3 }, highlight: [0, 1, 2, 3], caption: "R=3 is 'a' — already in the window. Shrink from the left, past the earlier 'a'." },
        { pointers: { L: 1, R: 3 }, highlight: [1, 2, 3], caption: "L jumps to 1. Window \"bca\", length 3 — tied for best, not beaten yet." },
        { pointers: { L: 5, R: 7 }, highlight: [5, 6, 7], dim: [0, 1, 2, 3, 4], caption: "Every later repeat forces another jump the same way. Final answer: length 3 (\"abc\")." },
      ],
    },
    {
      kind: "array",
      title: "Minimum Window Substring — grow to valid, then shrink",
      array: ["a", "a", "b", "c"],
      steps: [
        { pointers: { L: 0, R: 3 }, highlight: [0, 1, 2, 3], caption: "Expand R until every required character (a, b, c) is in the window. Window \"aabc\" — formed." },
        { pointers: { L: 1, R: 3 }, highlight: [1, 2, 3], caption: "Still formed after dropping the extra leading 'a' — shrink again, and record this as the new best: length 3." },
        { pointers: { L: 2, R: 3 }, highlight: [2, 3], dim: [0, 1], caption: "Dropping the required 'a' breaks it — stop shrinking. R is already at the end. Minimum window: \"abc\", length 3." },
      ],
    },
  ],

  "arrays-hashing": [
    {
      kind: "array",
      title: "Group Anagrams — hash by sorted signature",
      array: ["eat", "tea", "tan", "ate", "nat", "bat"],
      steps: [
        { pointers: { i: 0 }, highlight: [0], caption: "\"eat\" → sorted key \"aet\". map = { aet: [eat] }" },
        { pointers: { i: 1 }, highlight: [0, 1], caption: "\"tea\" → sorted key \"aet\" too — same bucket. map = { aet: [eat, tea] }" },
        { pointers: { i: 2 }, highlight: [2], caption: "\"tan\" → sorted key \"ant\" — new bucket. map = { aet: […], ant: [tan] }" },
        { pointers: { i: 5 }, highlight: [0, 1, 3, 4, 2, 5], caption: "By the end: { aet: [eat,tea,ate], ant: [tan,nat], abt: [bat] } — three groups from one pass." },
      ],
    },
    {
      kind: "array",
      title: "Two Sum — trade a second pass for a lookup",
      array: [2, 7, 11, 15],
      steps: [
        { pointers: { i: 0 }, highlight: [0], caption: "Target 9. At 2, ask the question backwards: has 7 been seen? Nothing is stored yet — no. Remember that 2 lives at index 0." },
        { pointers: { i: 1 }, highlight: [0, 1], caption: "At 7, ask for 9−7 = 2. It's in the map, at index 0 — answer [0,1], found before reaching the rest of the array." },
        { pointers: { i: 1 }, highlight: [0, 1], dim: [2, 3], caption: "The nested loop asked \"do these two add up?\" n² times. Storing what you've already passed turns it into one question per element." },
      ],
    },
  ],

  strings: [
    {
      kind: "array",
      title: "Reverse Words in a String — tokenize, then prepend",
      array: ["the", "sky", "is", "blue"],
      steps: [
        { pointers: { i: 0 }, highlight: [0], caption: "Token \"the\" → output: \"the\"" },
        { pointers: { i: 1 }, highlight: [1], caption: "Token \"sky\" → prepend → output: \"sky the\"" },
        { pointers: { i: 2 }, highlight: [2], caption: "Token \"is\" → prepend → output: \"is sky the\"" },
        { pointers: { i: 3 }, highlight: [3], caption: "Token \"blue\" → prepend → output: \"blue is sky the\". Each token only ever moves once." },
      ],
    },
    {
      kind: "grid",
      title: "Longest Common Prefix — compare down the columns, not across the words",
      rows: 3, cols: 6,
      cellLabels: { cols: ["0", "1", "2", "3", "4", "5"] },
      steps: [
        { values: [["f", "l", "o", "w", "e", "r"], ["f", "l", "o", "w", "", ""], ["f", "l", "i", "g", "h", "t"]],
          caption: "Three words stacked. The prefix can't be longer than the shortest, and it has to agree at every position — so walk the columns." },
        { values: [["f", "l", "o", "w", "e", "r"], ["f", "l", "o", "w", "", ""], ["f", "l", "i", "g", "h", "t"]],
          active: [[0, 0], [1, 0], [2, 0]], caption: "Column 0: f, f, f — all agree. Keep going." },
        { values: [["f", "l", "o", "w", "e", "r"], ["f", "l", "o", "w", "", ""], ["f", "l", "i", "g", "h", "t"]],
          active: [[0, 1], [1, 1], [2, 1]], caption: "Column 1: l, l, l — still agree." },
        { values: [["f", "l", "o", "w", "e", "r"], ["f", "l", "o", "w", "", ""], ["f", "l", "i", "g", "h", "t"]],
          highlight: [[0, 2], [1, 2], [2, 2]], caption: "Column 2: o, o, i — one disagreement ends it. Nothing further can rescue the prefix." },
        { values: [["f", "l", "o", "w", "e", "r"], ["f", "l", "o", "w", "", ""], ["f", "l", "i", "g", "h", "t"]],
          active: [[0, 0], [0, 1]], caption: "Answer \"fl\". Stopping at the first mismatch means the work is bounded by the answer's length, not the total text." },
      ],
    },
  ],

  "binary-search": [
    {
      kind: "array",
      title: "Classic search — halving the space each step",
      array: [1, 3, 5, 7, 9, 11, 13],
      steps: [
        { pointers: { lo: 0, mid: 3, hi: 6 }, caption: "lo=0, hi=6, mid=3 → value 7. Target 9 is bigger, so it can't be on the left — discard that half." },
        { pointers: { lo: 4, mid: 5, hi: 6 }, dim: [0, 1, 2, 3], caption: "lo=4, hi=6, mid=5 → value 11. Target 9 is smaller — discard the right half." },
        { pointers: { lo: 4, mid: 4, hi: 4 }, dim: [0, 1, 2, 3, 5, 6], highlight: [4], caption: "lo=hi=mid=4 → value 9. Found — 7 elements searched in 2 comparisons." },
      ],
    },
    {
      kind: "array",
      // The second mental model, and the one people are missing when binary
      // search "doesn't apply": you aren't searching the array, you're
      // searching the answers, and the array is only how you test one.
      title: "Binary search on the answer — find the first value that works",
      array: ["✗", "✗", "✗", "✗", "✓", "✓", "✓", "✓"],
      steps: [
        { pointers: { lo: 0, hi: 7 }, caption: "Each box is a candidate answer, marked with whether it's good enough. The marks are never all computed — you test one at a time." },
        { pointers: { lo: 0, hi: 7, mid: 3 }, highlight: [3], caption: "Test the middle: index 3 fails. Everything left of it fails too, since the test only flips once. Discard that half." },
        { pointers: { lo: 4, hi: 7, mid: 5 }, highlight: [5], dim: [0, 1, 2, 3], caption: "Test 5: it works. So the first working answer is 5 or earlier — keep 5 as a candidate and search left." },
        { pointers: { lo: 4, hi: 5, mid: 4 }, highlight: [4], dim: [0, 1, 2, 3, 6, 7], caption: "Test 4: works. Search left again." },
        { pointers: { lo: 4, hi: 4 }, highlight: [4], dim: [0, 1, 2, 3, 5, 6, 7], caption: "Range is one wide. Answer: 4 — the first value that works. Four tests instead of eight, and the array was never sorted by value at all." },
      ],
    },
  ],

  "recursion-dp": [
    {
      kind: "grid",
      title: "Climbing Stairs — bottom-up table, each cell reused",
      rows: 1,
      cols: 6,
      cellLabels: { cols: ["dp[0]", "dp[1]", "dp[2]", "dp[3]", "dp[4]", "dp[5]"] },
      steps: [
        { values: [[1, 1, null, null, null, null]], active: [[0, 0], [0, 1]], caption: "Base cases: 1 way to be at step 0, 1 way to be at step 1." },
        { values: [[1, 1, 2, null, null, null]], active: [[0, 2]], highlight: [[0, 0], [0, 1]], caption: "dp[2] = dp[1] + dp[0] = 1+1 = 2 — reused, not recomputed." },
        { values: [[1, 1, 2, 3, null, null]], active: [[0, 3]], highlight: [[0, 1], [0, 2]], caption: "dp[3] = dp[2] + dp[1] = 2+1 = 3." },
        { values: [[1, 1, 2, 3, 5, 8]], active: [[0, 4], [0, 5]], caption: "Same reuse all the way up: dp[5] = dp[4] + dp[3] = 5+3 = 8 ways to climb 5 stairs." },
      ],
    },
    {
      kind: "graph",
      title: "Why memoization matters — the duplicate work in fib(4)",
      height: 170,
      nodes: [
        { id: "f4", label: "fib(4)", x: 160, y: 20 },
        { id: "f3", label: "fib(3)", x: 90, y: 75 },
        { id: "f2a", label: "fib(2)", x: 230, y: 75 },
        { id: "f2b", label: "fib(2)", x: 55, y: 135 },
        { id: "f1", label: "fib(1)", x: 125, y: 135 },
      ],
      edges: [{ from: "f4", to: "f3" }, { from: "f4", to: "f2a" }, { from: "f3", to: "f2b" }, { from: "f3", to: "f1" }],
      steps: [
        { activeNodes: ["f4"], caption: "fib(4) needs fib(3) and fib(2)." },
        { doneNodes: ["f4"], activeNodes: ["f3"], activeEdges: [["f4", "f3"]], caption: "Expand fib(3) first: it needs fib(2) and fib(1)." },
        { doneNodes: ["f4", "f3"], activeNodes: ["f2b", "f1"], activeEdges: [["f3", "f2b"], ["f3", "f1"]], caption: "fib(3) computes fib(2) and fib(1) from scratch." },
        { doneNodes: ["f4", "f3", "f2b", "f1"], activeNodes: ["f2a"], activeEdges: [["f4", "f2a"]], caption: "Now fib(4)'s other child, fib(2), runs — recomputing exactly what fib(3) just did. This exact bug is live in this repo's own minimum_cost_to_merge_sorted_list.cpp, unmemoized." },
      ],
    },
  ],

  "bit-manipulation": [
    {
      kind: "grid",
      title: "Single Number — XOR cancels every pair",
      rows: 1,
      cols: 4,
      cellLabels: { cols: ["bit3", "bit2", "bit1", "bit0"] },
      steps: [
        { values: [[0, 0, 0, 0]], caption: "xor = 0000 (0). Start scanning [4, 1, 2, 1, 2]." },
        { values: [[0, 1, 0, 0]], active: [[0, 1]], caption: "xor ^= 4 → 0100 (4)." },
        { values: [[0, 1, 0, 1]], active: [[0, 3]], caption: "xor ^= 1 → 0101 (5)." },
        { values: [[0, 1, 1, 1]], active: [[0, 2]], caption: "xor ^= 2 → 0111 (7)." },
        { values: [[0, 1, 1, 0]], active: [[0, 3]], caption: "xor ^= 1 → 0110 (6). The first 1 has now cancelled itself out." },
        { values: [[0, 1, 0, 0]], active: [[0, 2]], caption: "xor ^= 2 → 0100 (4). Both 2's and both 1's cancelled — only the single 4 survives." },
      ],
    },
    {
      kind: "grid",
      title: "Counting set bits — n & (n−1) erases the lowest one each time",
      rows: 2, cols: 4,
      cellLabels: { cols: ["8", "4", "2", "1"] },
      steps: [
        { values: [[1, 1, 0, 0], ["", "", "", ""]], active: [[0, 0], [0, 1]],
          caption: "n = 12, which is 1100. Two bits set — but counting them by shifting takes one step per bit position, set or not." },
        { values: [[1, 1, 0, 0], [1, 0, 1, 1]], highlight: [[1, 1]],
          caption: "n−1 is 1011. Subtracting one always flips the lowest set bit to 0 and turns everything below it to 1s." },
        { values: [[1, 0, 0, 0], ["", "", "", ""]], active: [[0, 0]],
          caption: "So n & (n−1) clears exactly that lowest set bit: 1100 & 1011 = 1000. Count 1." },
        { values: [[1, 0, 0, 0], [0, 1, 1, 1]], highlight: [[1, 0]],
          caption: "Repeat: 1000 & 0111 = 0000. Count 2, and n is empty." },
        { values: [[0, 0, 0, 0], ["", "", "", ""]],
          caption: "Answer 2 — in two iterations rather than four. The loop runs once per set bit, not once per bit position." },
      ],
    },
  ],

  "2d-matrix": [
    {
      kind: "grid",
      title: "Spiral traversal — walk, then shrink the boundary",
      rows: 3,
      cols: 3,
      steps: [
        { values: [[1, null, null], [null, null, null], [null, null, null]], active: [[0, 0]], caption: "Walk right along the top row." },
        { values: [[1, 2, 3], [null, null, null], [null, null, null]], active: [[0, 1], [0, 2]], caption: "1, 2, 3 — hit the right edge. Turn down." },
        { values: [[1, 2, 3], [null, null, 6], [null, null, 9]], active: [[1, 2], [2, 2]], caption: "6, 9 — walk down the right column. Hit the bottom. Turn left." },
        { values: [[1, 2, 3], [null, null, 6], [7, 8, 9]], active: [[2, 1], [2, 0]], caption: "8, 7 — walk left along the bottom. Hit the left edge. Turn up." },
        { values: [[1, 2, 3], [4, null, 6], [7, 8, 9]], active: [[1, 0]], caption: "4 — the boundary has shrunk down to just the center cell left." },
        { values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], active: [[1, 1]], caption: "5 — visited last. Full order: 1,2,3,6,9,8,7,4,5." },
      ],
    },
    {
      kind: "grid",
      title: "Rotate Image — transpose, then reverse each row",
      rows: 3, cols: 3,
      steps: [
        { values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
          caption: "Rotating 90° clockwise in place looks like it needs a second matrix. It doesn't — it's two simple passes." },
        { values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], active: [[0, 0], [1, 1], [2, 2]],
          caption: "First transpose: swap across the diagonal. The diagonal itself never moves, so only the cells above it need touching." },
        { values: [[1, 4, 7], [2, 5, 8], [3, 6, 9]],
          caption: "Transposed. Every row is now the old column — the right values, in the wrong left-to-right order." },
        { values: [[1, 4, 7], [2, 5, 8], [3, 6, 9]], highlight: [[0, 0], [0, 1], [0, 2]],
          caption: "Second pass: reverse each row. Row 0 becomes 7, 4, 1." },
        { values: [[7, 4, 1], [8, 5, 2], [9, 6, 3]],
          caption: "Rotated, with no extra matrix allocated. Reversing the columns instead of the rows rotates the other way." },
      ],
    },
  ],

  knapsack: [
    {
      kind: "grid",
      title: "0/1 Knapsack — include vs. exclude at every cell",
      rows: 4,
      cols: 6,
      cellLabels: { cols: ["cap 0", "cap 1", "cap 2", "cap 3", "cap 4", "cap 5"] },
      steps: [
        { values: [[0, 0, 0, 0, 0, 0], [null, null, null, null, null, null], [null, null, null, null, null, null], [null, null, null, null, null, null]], caption: "Row 0: no items available yet — every capacity holds value 0." },
        { values: [[0, 0, 0, 0, 0, 0], [0, 0, 3, 3, 3, 3], [null, null, null, null, null, null], [null, null, null, null, null, null]], active: [[1, 2]], caption: "Item A (weight 2, value 3): once capacity ≥ 2, it fits — value jumps to 3 and holds." },
        { values: [[0, 0, 0, 0, 0, 0], [0, 0, 3, 3, 3, 3], [0, 0, 3, 4, 4, 7], [null, null, null, null, null, null]], active: [[2, 5]], caption: "Item B (weight 3, value 4) added. At capacity 5: skip B → 3, or take B (leaves 2 for A's 3) → 7. Take it." },
        { values: [[0, 0, 0, 0, 0, 0], [0, 0, 3, 3, 3, 3], [0, 0, 3, 4, 4, 7], [0, 0, 3, 4, 5, 7]], active: [[3, 4], [3, 5]], caption: "Item C (weight 4, value 5): at cap 4, C alone (5) beats the old 4 — take it. At cap 5, C alone only scores 5 — worse than A+B's 7. Final answer: 7." },
      ],
    },
    {
      kind: "grid",
      title: "Coin Change — the unbounded twin, where items can repeat",
      rows: 1, cols: 7,
      cellLabels: { cols: ["0", "1", "2", "3", "4", "5", "6"] },
      steps: [
        { values: [[0, "", "", "", "", "", ""]], active: [[0, 0]],
          caption: "Coins 1, 3 and 4; make 6 with as few as possible. Each cell is the best answer for that amount. Zero needs no coins." },
        { values: [[0, 1, 2, "", "", "", ""]], active: [[0, 1], [0, 2]],
          caption: "1 takes one coin. 2 can only be 1+1, so two. Nothing else reaches these yet." },
        { values: [[0, 1, 2, 1, 1, "", ""]], active: [[0, 3], [0, 4]],
          caption: "3 and 4 are coins outright — one each. This is where the 1+1+1 answer gets beaten." },
        { values: [[0, 1, 2, 1, 1, 2, ""]], highlight: [[0, 1], [0, 4]], active: [[0, 5]],
          caption: "5 = best(4) + one coin of 1, or best(2) + a 3. Both give two, so two." },
        { values: [[0, 1, 2, 1, 1, 2, 2]], highlight: [[0, 3]], active: [[0, 6]],
          caption: "6 = best(3) + a 3 = 2 coins, better than best(5)+1 or best(2)+4. Answer 2 — and unlike 0/1, each coin stayed available after use." },
      ],
    },
  ],

  monotonic_stack: [
    {
      kind: "stack",
      title: "Next Greater Element — a stack that stays decreasing",
      array: [2, 1, 5, 6, 2, 3],
      steps: [
        { cursor: 0, stack: [], caption: "i=0 (2): stack is empty — push it." },
        { cursor: 0, stack: [2], caption: "Pushed. Stack (bottom→top): [2]." },
        { cursor: 1, stack: [2], caption: "i=1 (1): top (2) is bigger, so 1 resolves nothing yet — push it too." },
        { cursor: 1, stack: [2, 1], caption: "Stack: [2, 1] — still decreasing top to bottom." },
        { cursor: 2, stack: [], consumed: [0, 1], caption: "i=2 (5): 5 > top (1) — pop, 5 is 1's next-greater. 5 > new top (2) — pop again, 5 is 2's next-greater too. Push 5." },
        { cursor: 2, stack: [5], consumed: [0, 1], caption: "Stack: [5]." },
        { cursor: 3, stack: [], consumed: [0, 1, 2], caption: "i=3 (6): 6 > top (5) — pop, 6 is 5's next-greater. Push 6." },
        { cursor: 3, stack: [6], consumed: [0, 1, 2], caption: "Stack: [6]." },
        { cursor: 4, stack: [6, 2], consumed: [0, 1, 2], caption: "i=4 (2): smaller than top (6) — no pops, just push." },
        { cursor: 5, stack: [6], consumed: [0, 1, 2, 4], caption: "i=5 (3): 3 > top (2) — pop, 3 is 2's next-greater. 3 < new top (6) — stop, push 3." },
        { cursor: 5, stack: [6, 3], consumed: [0, 1, 2, 4], caption: "Final stack [6, 3]: neither ever finds a next-greater element. Result: [5,5,6,-1,3,-1]." },
      ],
    },
    {
      kind: "stack",
      title: "Largest Rectangle in Histogram — the stack remembers where a bar could start",
      array: [2, 1, 5, 6, 2, 3],
      steps: [
        { cursor: 0, stack: [2], caption: "Heights [2,1,5,6,2,3]. Push 2. While the stack only grows, every bar in it could still extend further right." },
        { cursor: 1, stack: [1], consumed: [0], caption: "i=1 (1) is shorter, so bar 2 can't extend past here. Pop it: height 2, width 1, area 2." },
        { cursor: 3, stack: [1, 5, 6], consumed: [0], caption: "5 then 6 are each taller than the top — push both. Stack heights [1,5,6], still increasing." },
        { cursor: 4, stack: [1, 5], consumed: [0, 3], caption: "i=4 (2) is shorter. Pop 6: it can't extend left past 5 or right past here, so width 1, area 6." },
        { cursor: 4, stack: [1, 2], consumed: [0, 2, 3], caption: "Still shorter than 5, so pop that too. 5 spans from just after the 1 to just before here — width 2, area 10. That's the answer." },
        { cursor: 5, stack: [1, 2, 3], consumed: [0, 2, 3], caption: "Finish the pass and drain what's left: areas 3, 8 and 6. None beat 10. Each bar is pushed and popped exactly once — linear, not quadratic." },
      ],
    },
  ],

  mst: [
    {
      kind: "graph",
      title: "Prim's — always take the cheapest edge out of the tree",
      nodes: [
        { id: "A", x: 40, y: 90 }, { id: "B", x: 130, y: 40 }, { id: "C", x: 130, y: 140 }, { id: "D", x: 250, y: 90 },
      ],
      edges: [
        { from: "A", to: "B", label: "1" }, { from: "A", to: "C", label: "4" },
        { from: "B", to: "C", label: "2" }, { from: "B", to: "D", label: "6" }, { from: "C", to: "D", label: "3" },
      ],
      steps: [
        { activeNodes: ["A"], caption: "Start anywhere — say A. Look at every edge leaving the growing tree." },
        { activeNodes: ["A", "B"], doneEdges: [["A", "B"]], caption: "Cheapest edge from A is A–B (1). Add B." },
        { activeNodes: ["A", "B", "C"], doneEdges: [["A", "B"], ["B", "C"]], caption: "Cheapest edge leaving {A,B} is B–C (2), not A–C (4). Add C." },
        { activeNodes: ["A", "B", "C", "D"], doneEdges: [["A", "B"], ["B", "C"], ["C", "D"]], caption: "Cheapest edge leaving {A,B,C} is C–D (3), beating B–D (6). Tree complete — total weight 6." },
      ],
    },
    {
      kind: "graph",
      title: "Kruskal's — sort every edge, take it unless it closes a loop",
      nodes: [
        { id: "A", x: 60, y: 45 }, { id: "B", x: 190, y: 45 },
        { id: "C", x: 125, y: 125 }, { id: "D", x: 265, y: 125 },
      ],
      edges: [
        { from: "A", to: "B", label: "1" }, { from: "B", to: "C", label: "2" },
        { from: "A", to: "C", label: "3" }, { from: "C", to: "D", label: "4" },
      ],
      height: 175,
      steps: [
        { caption: "Prim's grows one tree outward. Kruskal's ignores connectivity entirely at first: sort all edges by weight — 1, 2, 3, 4 — and consider them in that order." },
        { doneEdges: [["A", "B"]], doneNodes: ["A", "B"], activeEdges: [["A", "B"]],
          caption: "A–B at 1. A and B were in separate groups, so take it and merge them." },
        { doneEdges: [["A", "B"], ["B", "C"]], doneNodes: ["A", "B", "C"], activeEdges: [["B", "C"]],
          caption: "B–C at 2. C was on its own — take it. Now A, B and C are one group." },
        { doneEdges: [["A", "B"], ["B", "C"]], doneNodes: ["A", "B", "C"], activeEdges: [["A", "C"]],
          caption: "A–C at 3 would join a group to itself — a cycle, adding weight and no reachability. Skip it. This is the check union-find exists for." },
        { doneEdges: [["A", "B"], ["B", "C"], ["C", "D"]], doneNodes: ["A", "B", "C", "D"], activeEdges: [["C", "D"]],
          caption: "C–D at 4 joins the last node. Total weight 7, with three edges for four nodes — always exactly one fewer edge than nodes." },
      ],
    },
  ],

  quick_sort: [
    {
      kind: "array",
      title: "Sort Colors — three pointers, one pass",
      array: [2, 0, 2, 1, 1, 0],
      steps: [
        { values: [2, 0, 2, 1, 1, 0], pointers: { low: 0, mid: 0, high: 5 }, caption: "low=mid=0, high=5. nums[mid]=2 → swap with high, shrink high." },
        { values: [0, 0, 2, 1, 1, 2], pointers: { low: 0, mid: 0, high: 4 }, caption: "nums[mid]=0 now → swap with low (no-op here), advance both low and mid." },
        { values: [0, 0, 2, 1, 1, 2], pointers: { low: 1, mid: 1, high: 4 }, caption: "nums[mid]=0 again → advance low and mid." },
        { values: [0, 0, 2, 1, 1, 2], pointers: { low: 2, mid: 2, high: 4 }, caption: "nums[mid]=2 → swap with high, shrink high." },
        { values: [0, 0, 1, 1, 2, 2], pointers: { low: 2, mid: 2, high: 3 }, caption: "nums[mid]=1 → already in the middle zone, just advance mid." },
        { values: [0, 0, 1, 1, 2, 2], pointers: { low: 2, mid: 4, high: 3 }, caption: "mid has passed high — done. [0,0,1,1,2,2], sorted in one pass, three pointers, no extra space." },
      ],
    },
    {
      kind: "array",
      title: "Quickselect — partition toward the answer, ignore the other half",
      array: [3, 2, 1, 5, 6, 4],
      steps: [
        { caption: "Find the 2nd largest. Sorting gives it in O(n log n), but the other five positions are work you never needed." },
        { pointers: { pivot: 5 }, highlight: [5],
          caption: "Partition around 4: everything smaller goes left, larger right. 2nd largest sits at index 4 once ascending." },
        { pointers: { p: 3 }, highlight: [0, 1, 2, 3],
          caption: "After partitioning, 4 lands at index 3. That's below the target index of 4, so the answer is somewhere to the right — and the entire left side can be discarded, unsorted." },
        { pointers: { pivot: 5 }, highlight: [4, 5], dim: [0, 1, 2, 3],
          caption: "Only [5, 6] remains. Partition again around 5." },
        { pointers: { p: 4 }, highlight: [4], dim: [0, 1, 2, 3, 5],
          caption: "5 lands exactly at index 4 — the target. Answer 5, and the array was never fully sorted. Average O(n), because each pass discards a side instead of recursing into both." },
      ],
    },
  ],

  topological_sort: [
    {
      kind: "graph",
      title: "Kahn's algorithm — peel off in-degree-0 nodes",
      nodes: [
        { id: "A", x: 40, y: 90 }, { id: "B", x: 140, y: 40 }, { id: "C", x: 140, y: 140 }, { id: "D", x: 250, y: 90 },
      ],
      edges: [{ from: "A", to: "B" }, { from: "A", to: "C" }, { from: "B", to: "D" }, { from: "C", to: "D" }],
      steps: [
        { activeNodes: ["A"], caption: "In-degree 0 means no prerequisites — A can go first." },
        { doneNodes: ["A"], activeNodes: ["B", "C"], doneEdges: [["A", "B"], ["A", "C"]], caption: "Remove A, decrement B and C's in-degree to 0 — both unlock at once." },
        { doneNodes: ["A", "B"], activeNodes: ["C"], doneEdges: [["A", "B"], ["A", "C"], ["B", "D"]], caption: "Take B. D still needs C, so it's not ready yet." },
        { doneNodes: ["A", "B", "C"], activeNodes: ["D"], doneEdges: [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"]], caption: "Take C — D's last prerequisite is satisfied. D unlocks." },
        { doneNodes: ["A", "B", "C", "D"], caption: "Order: A, B, C, D. If any node never reached in-degree 0, that would mean a cycle — no valid order exists." },
      ],
    },
    {
      kind: "graph",
      title: "The DFS version — finish times, reversed",
      nodes: [
        { id: "A", x: 60, y: 40 }, { id: "B", x: 170, y: 40 },
        { id: "C", x: 60, y: 130 }, { id: "D", x: 250, y: 90 },
      ],
      edges: [
        { from: "A", to: "B" }, { from: "A", to: "C" },
        { from: "B", to: "D" }, { from: "C", to: "D" },
      ],
      height: 175,
      steps: [
        { activeNodes: ["A"],
          caption: "Same graph, opposite approach. Kahn's peels from the front; this one dives to the back and records what finishes." },
        { activeNodes: ["D"], doneNodes: [], activeEdges: [["A", "B"], ["B", "D"]],
          caption: "Descend A → B → D. D has no outgoing edges, so it finishes first — and whatever finishes first must come last." },
        { activeNodes: ["B"], doneNodes: ["D"],
          caption: "Back up to B, which now has nothing left to explore. It finishes second. Finish order so far: D, B." },
        { activeNodes: ["C"], doneNodes: ["D", "B"], activeEdges: [["A", "C"]],
          caption: "Back to A, then down to C. Its only edge leads to D, already visited — so C finishes third. Order: D, B, C." },
        { doneNodes: ["A", "B", "C", "D"],
          caption: "A finishes last: D, B, C, A. Reverse it for A, C, B, D — a valid ordering, because a node is only recorded once everything it depends on already has been." },
      ],
    },
  ],

  trie: [
    {
      kind: "graph",
      title: "Inserting cat, car, dog — shared prefixes cost nothing extra",
      height: 190,
      nodes: [
        { id: "root", label: "•", x: 160, y: 15 },
        { id: "c", label: "c", x: 90, y: 60 },
        { id: "d", label: "d", x: 230, y: 60 },
        { id: "ca", label: "a", x: 60, y: 105 },
        { id: "do", label: "o", x: 230, y: 105 },
        { id: "cat", label: "t•", x: 30, y: 150 },
        { id: "car", label: "r•", x: 90, y: 150 },
        { id: "dog", label: "g•", x: 230, y: 150 },
      ],
      edges: [
        { from: "root", to: "c" }, { from: "root", to: "d" }, { from: "c", to: "ca" },
        { from: "ca", to: "cat" }, { from: "ca", to: "car" }, { from: "d", to: "do" }, { from: "do", to: "dog" },
      ],
      steps: [
        { doneNodes: ["root"], caption: "Start at the root — the empty prefix." },
        { doneNodes: ["root", "c"], doneEdges: [["root", "c"]], caption: "Insert \"cat\": no child 'c' yet — create one." },
        { doneNodes: ["root", "c", "ca"], doneEdges: [["root", "c"], ["c", "ca"]], caption: "Continue \"cat\": create 'a' under 'c'." },
        { doneNodes: ["root", "c", "ca", "cat"], doneEdges: [["root", "c"], ["c", "ca"], ["ca", "cat"]], caption: "Create 't', mark it end-of-word — \"cat\" is now complete." },
        { doneNodes: ["root", "c", "ca", "cat", "car"], doneEdges: [["root", "c"], ["c", "ca"], ["ca", "cat"], ["ca", "car"]], caption: "Insert \"car\": root→c→a already exist — reuse them. Only create 'r'. Shared prefixes cost nothing extra." },
        { doneNodes: ["root", "c", "ca", "cat", "car", "d", "do", "dog"], doneEdges: [["root", "c"], ["c", "ca"], ["ca", "cat"], ["ca", "car"], ["root", "d"], ["d", "do"], ["do", "dog"]], caption: "Insert \"dog\": a totally new path, root→d→o→g." },
      ],
    },
    {
      kind: "graph",
      title: "Autocomplete — the prefix walk is the search",
      nodes: [
        { id: "root", x: 40, y: 85 },
        { id: "c", x: 110, y: 85 }, { id: "a", x: 175, y: 85 },
        { id: "t", x: 245, y: 45 }, { id: "r", x: 245, y: 125 },
      ],
      edges: [
        { from: "root", to: "c" }, { from: "c", to: "a" },
        { from: "a", to: "t" }, { from: "a", to: "r" },
      ],
      height: 170,
      steps: [
        { activeNodes: ["root"],
          caption: "Holding cat and car. Typing \"ca\" should offer both — in a plain list that means scanning every word and testing each one." },
        { activeNodes: ["c"], doneNodes: ["root"], activeEdges: [["root", "c"]],
          caption: "Follow \"c\". Every word not starting with c has already been eliminated, without being looked at." },
        { activeNodes: ["a"], doneNodes: ["root", "c"], activeEdges: [["c", "a"]],
          caption: "Follow \"a\". Two characters of walking has narrowed the whole dictionary to one subtree." },
        { activeNodes: ["t", "r"], doneNodes: ["root", "c", "a"], activeEdges: [["a", "t"], ["a", "r"]],
          caption: "Everything below this node shares the prefix by construction — so collect the subtree: cat and car." },
        { doneNodes: ["root", "c", "a", "t", "r"],
          caption: "The walk costs the length of the prefix, not the size of the dictionary. Adding ten thousand more words that don't start with \"ca\" changes nothing here." },
      ],
    },
  ],

  "union-find": [
    {
      kind: "graph",
      title: "Union operations merge components, not just pairs",
      nodes: [
        { id: "1", x: 40, y: 90 }, { id: "2", x: 110, y: 40 }, { id: "3", x: 180, y: 90 }, { id: "4", x: 110, y: 140 }, { id: "5", x: 260, y: 90 },
      ],
      edges: [{ from: "1", to: "2" }, { from: "3", to: "4" }, { from: "2", to: "3" }],
      steps: [
        { caption: "5 separate components to start: {1} {2} {3} {4} {5}." },
        { activeNodes: ["1", "2"], doneEdges: [["1", "2"]], caption: "union(1,2): different roots — merge. Now {1,2} {3} {4} {5}." },
        { activeNodes: ["3", "4"], doneEdges: [["1", "2"], ["3", "4"]], caption: "union(3,4): merge. Now {1,2} {3,4} {5}." },
        { activeNodes: ["2", "3"], doneEdges: [["1", "2"], ["3", "4"], ["2", "3"]], caption: "union(2,3): merges the two GROUPS in one operation. Now {1,2,3,4} {5}." },
        { doneEdges: [["1", "2"], ["3", "4"], ["2", "3"]], caption: "find(1) and find(4) now return the same root — connected, with no direct edge between them. Node 5 stays its own component." },
      ],
    },
    {
      kind: "graph",
      title: "Path compression — every lookup flattens the tree it walked",
      nodes: [
        { id: "1", x: 60, y: 140 }, { id: "2", x: 120, y: 100 },
        { id: "3", x: 180, y: 60 }, { id: "4", x: 250, y: 30 },
      ],
      edges: [
        { from: "1", to: "2" }, { from: "2", to: "3" }, { from: "3", to: "4" },
      ],
      height: 175,
      steps: [
        { activeNodes: ["1"], caption: "Unions done carelessly can leave a chain: 1 points to 2, 2 to 3, 3 to 4. Asking which set 1 belongs to means walking all of it." },
        { activeNodes: ["2", "3"], doneNodes: ["1"], activeEdges: [["1", "2"], ["2", "3"]], caption: "Walk up: 1 → 2 → 3. On a long chain this is the whole cost of the structure." },
        { activeNodes: ["4"], doneNodes: ["1", "2", "3"], activeEdges: [["3", "4"]], caption: "Reach 4, which points at itself — that's the root, and the answer." },
        { doneNodes: ["1", "2", "3", "4"], doneEdges: [["1", "2"], ["2", "3"], ["3", "4"]], caption: "Now the useful part: on the way back, point every node visited straight at 4. The walk paid for itself — the next lookup for any of them is one step." },
      ],
    },
  ],

  "linked-list": [
    {
      kind: "graph",
      title: "Reversing 1→2→3→4 — rewire, don't rebuild",
      height: 130,
      nodes: [
        { id: "n1", label: "1", x: 40, y: 70 }, { id: "n2", label: "2", x: 110, y: 70 },
        { id: "n3", label: "3", x: 180, y: 70 }, { id: "n4", label: "4", x: 250, y: 70 },
      ],
      edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4" }],
      steps: [
        { activeNodes: ["n1"], caption: "prev = None, curr = 1. This node will end up as the new tail, pointing to None." },
        { activeNodes: ["n1", "n2"], doneEdges: [["n1", "n2"]], caption: "Save curr.next (2) first, then point 1.next back to prev (None). Advance: prev=1, curr=2." },
        { activeNodes: ["n2", "n3"], doneEdges: [["n1", "n2"], ["n2", "n3"]], caption: "Point 2.next back to prev (1). Advance: prev=2, curr=3." },
        { activeNodes: ["n3", "n4"], doneEdges: [["n1", "n2"], ["n2", "n3"], ["n3", "n4"]], caption: "Point 3.next back to prev (2). Advance: prev=3, curr=4." },
        { doneNodes: ["n1", "n2", "n3", "n4"], doneEdges: [["n1", "n2"], ["n2", "n3"], ["n3", "n4"]], caption: "Point 4.next back to prev (3). curr becomes None — loop ends. List is now 4→3→2→1." },
      ],
    },
    {
      kind: "graph",
      title: "Cycle detection — two speeds, no extra memory",
      nodes: [
        { id: "1", x: 40, y: 40 }, { id: "2", x: 110, y: 40 },
        { id: "3", x: 180, y: 40 }, { id: "4", x: 250, y: 40 },
        { id: "5", x: 250, y: 110 },
      ],
      edges: [
        { from: "1", to: "2" }, { from: "2", to: "3" },
        { from: "3", to: "4" }, { from: "4", to: "5" }, { from: "5", to: "3" },
      ],
      height: 160,
      steps: [
        { activeNodes: ["1"], doneEdges: [["5", "3"]],
          caption: "5 points back to 3, so this list has no end to walk to. Storing visited nodes would find the loop, at the cost of memory proportional to the list." },
        { activeNodes: ["2", "3"], doneNodes: ["1"], activeEdges: [["1", "2"], ["2", "3"]],
          caption: "Instead send two pointers: slow moves one node, fast moves two. After step 1: slow at 2, fast at 3." },
        { activeNodes: ["3", "5"], doneNodes: ["1", "2"], activeEdges: [["3", "4"], ["4", "5"]],
          caption: "Step 2: slow at 3, fast at 5. Fast is pulling away — it would run off the end if there were one." },
        { activeNodes: ["4"], doneNodes: ["1", "2", "3", "5"], activeEdges: [["5", "3"]],
          caption: "Step 3: slow at 4, and fast wraps 5 → 3 → 4 and lands on it. They meet." },
        { doneNodes: ["1", "2", "3", "4", "5"],
          caption: "Inside a loop the gap closes by one each step, so a meeting is guaranteed. Two pointers, constant memory, no bookkeeping at all." },
      ],
    },
  ],

  trees: [
    {
      kind: "graph",
      title: "BFS level-order traversal",
      height: 170,
      nodes: [
        { id: "n1", label: "1", x: 140, y: 15 },
        { id: "n2", label: "2", x: 80, y: 60 }, { id: "n3", label: "3", x: 200, y: 60 },
        { id: "n4", label: "4", x: 50, y: 105 }, { id: "n5", label: "5", x: 110, y: 105 },
        { id: "n6", label: "6", x: 170, y: 105 }, { id: "n7", label: "7", x: 230, y: 105 },
      ],
      edges: [
        { from: "n1", to: "n2" }, { from: "n1", to: "n3" }, { from: "n2", to: "n4" },
        { from: "n2", to: "n5" }, { from: "n3", to: "n6" }, { from: "n3", to: "n7" },
      ],
      steps: [
        { activeNodes: ["n1"], caption: "Start at the root. Queue: [1]." },
        { doneNodes: ["n1"], activeNodes: ["n2", "n3"], doneEdges: [["n1", "n2"], ["n1", "n3"]], caption: "Visit 1, enqueue its children. Queue: [2, 3]." },
        { doneNodes: ["n1", "n2", "n3"], activeNodes: ["n4", "n5", "n6", "n7"], doneEdges: [["n1", "n2"], ["n1", "n3"], ["n2", "n4"], ["n2", "n5"], ["n3", "n6"], ["n3", "n7"]], caption: "Visit 2 then 3, enqueueing 4, 5, 6, 7 as we go. Queue: [4,5,6,7]." },
        { doneNodes: ["n1", "n2", "n3", "n4", "n5", "n6", "n7"], doneEdges: [["n1", "n2"], ["n1", "n3"], ["n2", "n4"], ["n2", "n5"], ["n3", "n6"], ["n3", "n7"]], caption: "Visit each in turn — queue empties. BFS order: 1,2,3,4,5,6,7 — exactly level by level." },
      ],
    },
    {
      kind: "graph",
      title: "In-order on a BST comes out sorted",
      nodes: [
        { id: "4", x: 160, y: 28 },
        { id: "2", x: 90, y: 82 }, { id: "6", x: 230, y: 82 },
        { id: "1", x: 52, y: 136 }, { id: "3", x: 126, y: 136 },
        { id: "5", x: 196, y: 136 }, { id: "7", x: 272, y: 136 },
      ],
      edges: [
        { from: "4", to: "2" }, { from: "4", to: "6" },
        { from: "2", to: "1" }, { from: "2", to: "3" },
        { from: "6", to: "5" }, { from: "6", to: "7" },
      ],
      height: 170,
      steps: [
        { activeNodes: ["1"], doneNodes: [], caption: "In-order is left, then self, then right. Go left as far as possible first — that lands on 1, the smallest." },
        { activeNodes: ["2"], doneNodes: ["1"], caption: "1 has no right child, so return to its parent and visit 2. Output so far: 1, 2." },
        { activeNodes: ["3"], doneNodes: ["1", "2"], caption: "Now 2's right subtree: 3. Output: 1, 2, 3 — the whole left subtree, in order." },
        { activeNodes: ["4"], doneNodes: ["1", "2", "3"], caption: "Left subtree finished, so visit the root. Output: 1, 2, 3, 4." },
        { activeNodes: ["5", "6", "7"], doneNodes: ["1", "2", "3", "4"], caption: "The right subtree repeats the same shape: 5, 6, 7. Final output 1…7 — sorted, without sorting anything." },
      ],
    },
  ],

  "graphs-bfs-dfs": [
    {
      kind: "grid",
      title: "Number of Islands — flood fill each connected blob",
      rows: 4,
      cols: 4,
      steps: [
        { values: [[1, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 1], [0, 0, 0, 0]], active: [[0, 0]], caption: "Scan for an unvisited '1'. Found one at (0,0) — start a DFS flood-fill. Islands so far: 1." },
        { values: [[1, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 1], [0, 0, 0, 0]], active: [[0, 0], [0, 1], [1, 0]], caption: "Flood fill spreads to every connected land cell: (0,1) and (1,0). All marked visited — this whole blob is one island." },
        { values: [[1, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 1], [0, 0, 0, 0]], active: [[2, 2], [2, 3]], highlight: [[0, 0], [0, 1], [1, 0]], caption: "Continue scanning — next unvisited '1' is at (2,2). New flood-fill, islands so far: 2. It spreads to (2,3)." },
        { values: [[1, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 1], [0, 0, 0, 0]], highlight: [[0, 0], [0, 1], [1, 0], [2, 2], [2, 3]], caption: "No unvisited land left. Total islands: 2 — the number of separate flood-fills it took, not the number of land cells." },
      ],
    },
    {
      kind: "graph",
      title: "BFS explores in rings — which is why it finds shortest paths",
      nodes: [
        { id: "A", x: 40, y: 90 },
        { id: "B", x: 118, y: 42 }, { id: "C", x: 118, y: 138 },
        { id: "D", x: 205, y: 90 }, { id: "E", x: 285, y: 90 },
      ],
      edges: [
        { from: "A", to: "B" }, { from: "A", to: "C" },
        { from: "B", to: "D" }, { from: "C", to: "D" }, { from: "D", to: "E" },
      ],
      height: 175,
      steps: [
        { activeNodes: ["A"], caption: "Start at A. Distance 0. The queue holds everything at the current distance and nothing further." },
        { activeNodes: ["B", "C"], doneNodes: ["A"], activeEdges: [["A", "B"], ["A", "C"]], caption: "Take everything one edge away before anything two edges away: B and C, both distance 1." },
        { activeNodes: ["D"], doneNodes: ["A", "B", "C"], activeEdges: [["B", "D"], ["C", "D"]], doneEdges: [["A", "B"], ["A", "C"]], caption: "D is reachable from both, but it's first reached at distance 2 — and that first arrival is the shortest, so it's never revisited." },
        { activeNodes: ["E"], doneNodes: ["A", "B", "C", "D"], activeEdges: [["D", "E"]], doneEdges: [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"]], caption: "E at distance 3. Because the rings are finished in order, the first time you see a node is always by a shortest route — no weights, no priority queue, no relaxation." },
      ],
    },
  ],

  backtracking: [
    {
      kind: "graph",
      title: "All subsets of [1, 2] — include or exclude, at every element",
      height: 170,
      nodes: [
        { id: "root", label: "{}", x: 140, y: 15 },
        { id: "in1", label: "{1}", x: 70, y: 60 }, { id: "ex1", label: "{}", x: 210, y: 60 },
        { id: "in1in2", label: "{1,2}", x: 40, y: 105 }, { id: "in1ex2", label: "{1}", x: 100, y: 105 },
        { id: "ex1in2", label: "{2}", x: 180, y: 105 }, { id: "ex1ex2", label: "{}", x: 240, y: 105 },
      ],
      edges: [
        { from: "root", to: "in1" }, { from: "root", to: "ex1" },
        { from: "in1", to: "in1in2" }, { from: "in1", to: "in1ex2" },
        { from: "ex1", to: "ex1in2" }, { from: "ex1", to: "ex1ex2" },
      ],
      steps: [
        { activeNodes: ["root"], caption: "Start with an empty subset. At each element, choose: include it, or don't." },
        { doneNodes: ["root"], activeNodes: ["in1", "ex1"], doneEdges: [["root", "in1"], ["root", "ex1"]], caption: "Element 1: branch into 'include 1' and 'exclude 1'." },
        { doneNodes: ["root", "in1", "ex1"], activeNodes: ["in1in2", "in1ex2", "ex1in2", "ex1ex2"], doneEdges: [["root", "in1"], ["root", "ex1"], ["in1", "in1in2"], ["in1", "in1ex2"], ["ex1", "ex1in2"], ["ex1", "ex1ex2"]], caption: "Element 2: each branch splits again the same way. Four leaves = four complete subsets: {1,2}, {1}, {2}, {}." },
      ],
    },
    {
      kind: "grid",
      title: "4-Queens — the undo is the whole technique",
      rows: 4, cols: 4,
      cellLabels: { cols: ["a", "b", "c", "d"] },
      steps: [
        { active: [[0, 0]], caption: "Place a queen in row 0, leftmost column. One row at a time, so rows can never clash." },
        { active: [[0, 0], [1, 2]], highlight: [[1, 0], [1, 1]], caption: "Row 1: column a shares a file, column b shares a diagonal. First legal square is c." },
        { active: [[0, 0], [1, 2]], highlight: [[2, 0], [2, 1], [2, 2], [2, 3]], caption: "Row 2: every square is attacked — a and c by file, b and d by diagonal from c. Dead end." },
        { active: [[0, 0], [1, 3]], caption: "This is the backtrack: undo row 1 and try the next square instead of starting over. Everything above row 1 is kept." },
        { active: [[0, 0], [1, 3], [2, 1]], highlight: [[3, 0], [3, 1], [3, 2], [3, 3]], caption: "Row 2 takes b. But now row 3 is fully attacked too — so the whole branch beginning with a queen on a1 has no solution." },
        { active: [[0, 1], [1, 3], [2, 0], [3, 2]], caption: "Undo all the way and start row 0 at b. That branch works: b1, d2, a3, c4 — no shared row, file or diagonal. Search, fail, undo, continue." },
      ],
    },
  ],

  heap: [
    {
      kind: "stack",
      title: "Kth Largest (k=3) — keep only the top 3 seen so far",
      array: [3, 1, 5, 12, 2, 11],
      steps: [
        { cursor: 0, stack: [], caption: "k=3. Scan begins; keep a pool of the 3 largest seen so far." },
        { cursor: 0, stack: [3], caption: "3: pool has room — add it. Pool: {3}." },
        { cursor: 1, stack: [3, 1], caption: "1: still room — add it. Pool: {3, 1}." },
        { cursor: 2, stack: [3, 1, 5], caption: "5: pool now full at size 3: {3, 1, 5}." },
        { cursor: 3, stack: [3, 5, 12], caption: "12: bigger than the pool's smallest (1) — evict 1, add 12. Pool: {3, 5, 12}." },
        { cursor: 4, stack: [3, 5, 12], caption: "2: smaller than the pool's smallest (3) — can't be in the top 3. Skip it." },
        { cursor: 5, stack: [5, 12, 11], caption: "11: bigger than the pool's smallest (3) — evict 3, add 11. Pool: {5, 12, 11}." },
        { cursor: 5, stack: [5, 12, 11], caption: "Scan done. The pool's smallest member, 5, IS the answer — the 3rd largest overall." },
      ],
    },
    {
      kind: "grid",
      title: "Running median — two heaps facing each other",
      rows: 2, cols: 4,
      cellLabels: { cols: ["", "", "", ""] },
      steps: [
        { values: [[5, "", "", ""], ["", "", "", ""]], active: [[0, 0]], caption: "Top row is the smaller half (a max-heap, biggest at hand); bottom row is the larger half (a min-heap). First value 5 — median 5." },
        { values: [[5, "", "", ""], [15, "", "", ""]], active: [[0, 0], [1, 0]], caption: "15 is bigger than 5, so it belongs to the larger half. Even split — median is the average of the two facing values: 10." },
        { values: [[5, 1, "", ""], [15, "", "", ""]], active: [[0, 0]], caption: "1 joins the smaller half. That half is now bigger, so the median is simply its largest: 5." },
        { values: [[3, 1, "", ""], [5, 15, "", ""]], active: [[0, 0], [1, 0]], caption: "3 joins the smaller half, making it two ahead — so its largest, 5, moves across. Balanced again: median (3+5)/2 = 4." },
        { values: [[3, 1, "", ""], [5, 15, "", ""]], highlight: [[0, 0], [1, 0]], caption: "The median is always at the boundary, so it's O(1) to read and O(log n) to insert. Sorting the stream each time would be O(n log n) per value." },
      ],
    },
  ],

  intervals: [
    {
      kind: "array",
      title: "Merge Intervals — sweep once, sorted by start",
      array: ["[1,3]", "[2,6]", "[8,10]", "[15,18]"],
      steps: [
        { pointers: { i: 0 }, highlight: [0], caption: "Sorted by start. Begin with [1,3] as the current merged interval." },
        { pointers: { i: 1 }, highlight: [0, 1], caption: "[2,6] starts (2) before the current interval ends (3) — overlap! Merge into [1,6]." },
        { pointers: { i: 2 }, highlight: [2], dim: [0, 1], caption: "[8,10] starts (8) after [1,6] ends — no overlap. [1,6] is final. [8,10] becomes the new current interval." },
        { pointers: { i: 3 }, highlight: [3], dim: [0, 1, 2], caption: "[15,18] starts after [8,10] ends — no overlap either. Result: [1,6], [8,10], [15,18]." },
      ],
    },
    {
      kind: "array",
      title: "Insert Interval — three phases, no re-sorting",
      array: ["[1,3]", "[6,9]", "new [2,5]"],
      steps: [
        { pointers: { i: 2 }, highlight: [2], caption: "The list is already sorted and non-overlapping. Inserting [2,5] can't break that — it only has to be spliced into the right place." },
        { pointers: { i: 0 }, highlight: [0, 2], caption: "[1,3] ends at 3, which is past the new interval's start of 2 — they touch. Absorb it: the new interval becomes [1,5]." },
        { pointers: { i: 1 }, highlight: [1], dim: [0, 2], caption: "[6,9] starts at 6, after 5 — no overlap, and since the list is sorted, nothing later can overlap either. Stop checking." },
        { pointers: { i: 1 }, highlight: [0, 1], caption: "Result [1,5], [6,9]. Everything before the overlap is copied, the overlapping run collapses into one, everything after is copied — one pass." },
      ],
    },
  ],

  "prefix-sum": [
    {
      kind: "grid",
      title: "Build once, query in O(1) forever after",
      rows: 1,
      cols: 6,
      cellLabels: { cols: ["p[0]", "p[1]", "p[2]", "p[3]", "p[4]", "p[5]"] },
      steps: [
        { values: [[0, null, null, null, null, null]], active: [[0, 0]], caption: "prefix[0] = 0 — the sum of nothing, before the array even starts." },
        { values: [[0, 2, 6, 7, 12, null]], active: [[0, 4]], caption: "Each prefix[i] = prefix[i-1] + nums[i-1]. Built up to prefix[4] = 12 — the sum of the first 4 numbers." },
        { values: [[0, 2, 6, 7, 12, 15]], active: [[0, 5]], caption: "prefix[5] = 15 — the full array sum. Prefix array done, in one pass." },
        { values: [[0, 2, 6, 7, 12, 15]], highlight: [[0, 1], [0, 4]], caption: "Sum of indices 1..3 (values 4,1,5)? Just prefix[4] − prefix[1] = 12 − 2 = 10. No loop needed." },
      ],
    },
    {
      kind: "array",
      title: "Subarray Sum Equals K — prefix sums in a hash map",
      array: [3, 4, 7, 2, -3, 1, 4, 2],
      steps: [
        { pointers: { i: 0 }, highlight: [0], caption: "Target k=7. Running prefix = 3. Asking \"does a prefix of 3−7 = −4 exist?\" — no. Store prefix 3." },
        { pointers: { i: 1 }, highlight: [0, 1], caption: "Prefix = 7. Looking for 7−7 = 0, the empty prefix, which we seeded. Found — subarray [3,4] sums to 7. Count 1." },
        { pointers: { i: 2 }, highlight: [2], caption: "Prefix = 14. Looking for 7 — seen at index 1. The stretch since then is [7]. Count 2." },
        { pointers: { i: 5 }, highlight: [2, 3, 4, 5], caption: "Prefix = 14 again. Looking for 7 — still there. The stretch [7,2,−3,1] also sums to 7. Count 3." },
        { pointers: { i: 7 }, highlight: [5, 6, 7], caption: "Prefix = 20. Looking for 13 — seen at index 4. Subarray [1,4,2]. Count 4, in one pass, with negatives in the array." },
      ],
    },
  ],

  greedy: [
    {
      kind: "array",
      title: "Jump Game — track the farthest reachable index",
      array: [2, 3, 1, 1, 4],
      steps: [
        { pointers: { i: 0 }, highlight: [0], caption: "i=0, value 2: can reach up to index 0+2=2. Farthest reachable: 2." },
        { pointers: { i: 1 }, highlight: [0, 1], caption: "i=1, value 3: can reach up to 1+3=4 — that's the last index! Farthest: 4." },
        { pointers: { i: 2 }, highlight: [0, 1, 2], caption: "i=2: this cell only offers +1, but farthest is already 4 — no need to reconsider earlier choices." },
        { pointers: { i: 4 }, highlight: [0, 1, 2, 3, 4], caption: "By the time i reaches 4, farthest has stayed ≥ 4 the whole way — reachable. Greedy never looked back." },
      ],
    },
    {
      kind: "array",
      title: "Scheduling — sort by finish time, never by length or start",
      array: ["[1,2]", "[2,4]", "[3,5]", "[5,7]"],
      steps: [
        { caption: "Four meetings, fit as many as possible without overlap. Sorted by when they finish, not when they start." },
        { pointers: { pick: 0 }, highlight: [0],
          caption: "Take [1,2]. Finishing earliest leaves the most room behind it — that's the entire argument for this order." },
        { pointers: { pick: 1 }, highlight: [0, 1],
          caption: "[2,4] starts exactly when the last one ended — no overlap, so take it. Now busy until 4." },
        { pointers: { pick: 2 }, highlight: [0, 1], dim: [2],
          caption: "[3,5] starts at 3, before 4. Taking it would mean dropping something already chosen, so skip." },
        { pointers: { pick: 3 }, highlight: [0, 1, 3], dim: [2],
          caption: "[5,7] starts after 4 — take it. Three meetings, decided in one pass with no backtracking and no comparison of alternatives." },
      ],
    },
  ],
};
