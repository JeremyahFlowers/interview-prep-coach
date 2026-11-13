// The questions to ask before writing a line.
//
// Where this fits: a drill beside the pattern, component and fluency drills,
// read by the quiz page. It holds the prompts, the questions that matter for
// each, and the arithmetic of which kinds of question you habitually skip.
//
// Why it exists. Some interviewers — Google's are known for it — give a
// deliberately vague prompt and grade the questions as much as the code. "Find
// two numbers that add up to the target" hides five decisions: is the list
// sorted, numbers or indices, one pair or all, what if there is none, can an
// element pair with itself. Each changes the solution, and a candidate who
// starts coding without asking has chosen answers without noticing.
//
// So every question here carries what its answer *changes*. A list of
// questions to memorise is a checklist; a question paired with the design
// decision it settles is the habit being built. And they are grouped into
// kinds, because the useful feedback is not "you missed question four" but
// "you never ask about duplicates".

import { dayOf, todayISO, isRecord } from "./logic.js";

/** The kinds of question, which is what the drill actually tracks. */
export const CLARIFY_KINDS = {
  size: { label: "Input size", blurb: "How big — and does it fit in memory?" },
  range: { label: "Value range", blurb: "Negatives, zero, overflow, inclusive or exclusive." },
  duplicates: { label: "Duplicates", blurb: "Can things repeat, and does a repeat count?" },
  empty: { label: "Empty and tiny", blurb: "Nothing, one thing, no answer." },
  structure: { label: "Shape of the input", blurb: "Sorted? Given how? Can I change it?" },
  output: { label: "What to return", blurb: "Values or indices, one or all, which on a tie." },
  rules: { label: "The rules", blurb: "What moves, costs or operations are allowed." },
  scale: { label: "How it is used", blurb: "Once or constantly, exact or approximate." },
  text: { label: "Text", blurb: "Case, punctuation, which character set." },
};

const CLARIFY_PROMPTS = [
  {
    id: "two-sum", prompt: "Given a list of numbers and a target, find two numbers that add up to the target.",
    questions: [
      { kind: "structure", q: "Is the list sorted?", changes: "Sorted means two pointers in O(1) extra space. Unsorted means a hash map in O(n) space, or sorting first and losing the original positions." },
      { kind: "output", q: "Do you want the numbers, or their indices?", changes: "Indices rule out sorting unless you carry them through the sort." },
      { kind: "output", q: "Could there be several pairs — any one, or all of them?", changes: "All pairs is a different problem, with repeated pairs to de-duplicate." },
      { kind: "empty", q: "What if no pair adds up?", changes: "A sentinel, an empty result or an exception — decided before the return statement, not after." },
      { kind: "duplicates", q: "Can the same element be used twice?", changes: "Checking for the complement before inserting the current number is exactly this rule." },
      { kind: "range", q: "Can the numbers be negative, and can a sum overflow?", changes: "Negatives break any early exit that assumes sums only grow; overflow needs a wider type in Java or C++." },
      { kind: "size", q: "Roughly how long is the list?", changes: "A dozen: brute force is honestly fine, said out loud. Millions: it has to be linear." },
    ],
  },
  {
    id: "common-words", prompt: "Return the most common words in a document.",
    questions: [
      { kind: "output", q: "The single most common, or the top k?", changes: "Top k is a heap of size k or a bucket sort; one is a single pass for the maximum." },
      { kind: "output", q: "How are ties broken?", changes: "A tie-break is a secondary sort key, which changes the heap's comparator." },
      { kind: "text", q: "Is it case-sensitive, and what counts as a word — punctuation, hyphens, apostrophes?", changes: "The tokeniser is half the solution, and \"Don't\" and \"dont\" must land in the same bucket or not on purpose." },
      { kind: "size", q: "Does the document fit in memory?", changes: "If not, counts go to disk in chunks, or you trade exactness for a streaming sketch." },
      { kind: "scale", q: "Is it one document once, or a stream you query repeatedly?", changes: "Repeated queries over a changing stream want a maintained structure, not a recount each time." },
      { kind: "rules", q: "Should words like \"the\" and \"a\" be excluded?", changes: "A stop list is trivial to add and changes every answer — it has to be asked, not assumed." },
    ],
  },
  {
    id: "meeting-rooms", prompt: "Given some meetings, figure out how many rooms we need.",
    questions: [
      { kind: "range", q: "Can a meeting ending at 10 share a room with one starting at 10?", changes: "It is < against <= in one comparison, and the most common off-by-one in this problem." },
      { kind: "structure", q: "Are the meetings sorted by start time?", changes: "Sorted saves the O(n log n) sort; the heap is still needed." },
      { kind: "empty", q: "Can a meeting have zero or negative length?", changes: "Zero-length meetings need no room, or one, depending on the answer above." },
      { kind: "size", q: "How many meetings, and over what range of times?", changes: "A small bounded range allows a sweep over an array instead of sorting." },
      { kind: "output", q: "Just the number of rooms, or which meeting goes in which room?", changes: "An assignment needs the heap to carry room ids, not just end times." },
      { kind: "empty", q: "And no meetings at all?", changes: "Zero rooms — and a heap that is never touched, which is worth checking you handle." },
    ],
  },
  {
    id: "no-repeats", prompt: "Find the longest part of a string with no repeated characters.",
    questions: [
      { kind: "output", q: "Contiguous substring, or any subsequence?", changes: "Contiguous is a sliding window. A subsequence of distinct characters is just the number of distinct characters." },
      { kind: "text", q: "Which characters — lowercase letters, ASCII, any Unicode?", changes: "A 26-slot array against a hash map, and Unicode brings surrogate pairs that split in two." },
      { kind: "text", q: "Is it case-sensitive?", changes: "Whether 'A' and 'a' repeat each other decides what the window's map is keyed on." },
      { kind: "output", q: "The length, or the substring itself?", changes: "The substring needs the window's start kept at the best point, not just a running maximum." },
      { kind: "output", q: "If two are equally long, which one?", changes: "First or last is a < against <= when updating the best." },
      { kind: "empty", q: "What about an empty string?", changes: "Zero, and a window that never opens." },
    ],
  },
  {
    id: "maze", prompt: "Find the shortest way through a maze.",
    questions: [
      { kind: "structure", q: "How is the maze given — a grid of characters, a graph, something else?", changes: "A grid gives you neighbours by arithmetic; a graph needs an adjacency list built first." },
      { kind: "rules", q: "Which moves are allowed — four directions, eight, jumps?", changes: "It is the neighbour list, and diagonal moves change what \"shortest\" means." },
      { kind: "rules", q: "Does every step cost the same?", changes: "Equal costs: BFS. Different costs: Dijkstra. Negative costs: Bellman-Ford. The whole algorithm turns on this." },
      { kind: "output", q: "The length of the path, or the path itself?", changes: "The path needs parent pointers kept during the search." },
      { kind: "empty", q: "What if there is no way through?", changes: "A sentinel like -1, decided up front — and a start that is itself a wall." },
      { kind: "structure", q: "May I mark visited cells in the grid itself?", changes: "Saves a visited array, and destroys the input. Ask; don't assume." },
      { kind: "size", q: "How big can the grid be?", changes: "Large grids make recursion depth a real risk for a DFS, which is one more reason BFS." },
    ],
  },
  {
    id: "dedupe", prompt: "Remove the duplicates from this list.",
    questions: [
      { kind: "structure", q: "Does the original order have to be kept?", changes: "A set loses order in some languages; order-preserving is a seen-set and one pass." },
      { kind: "structure", q: "In place, or may I return a new list?", changes: "In place on a sorted array is the two-pointer trick. In place on an unsorted one needs O(n²) or extra memory." },
      { kind: "structure", q: "Is it sorted?", changes: "Sorted means duplicates are adjacent, and no extra memory is needed at all." },
      { kind: "output", q: "Which copy survives — the first or the last?", changes: "It changes which one you skip, and it matters as soon as the elements carry data." },
      { kind: "duplicates", q: "What makes two elements the same — exact equality, case-insensitive, same id?", changes: "It is the key of the set, and for objects it is the whole question." },
      { kind: "size", q: "How large is it?", changes: "If it does not fit in memory, this becomes an external sort." },
    ],
  },
  {
    id: "last-minute", prompt: "Tell me how many requests we got in the last minute.",
    questions: [
      { kind: "scale", q: "Asked once, or constantly as requests keep arriving?", changes: "Constantly makes it a data-structure design: a queue of timestamps, or counts in buckets." },
      { kind: "scale", q: "Exact, or is approximate fine?", changes: "Approximate allows sixty one-second buckets in constant memory." },
      { kind: "structure", q: "Do the timestamps arrive in order?", changes: "In order, old ones fall off the front of a queue. Out of order, you need buckets or a sorted structure." },
      { kind: "size", q: "How many requests a second at the peak?", changes: "Thousands a second rules out keeping one entry per request." },
      { kind: "rules", q: "One server, or many?", changes: "Many means the counts have to be combined, and their clocks will disagree." },
      { kind: "empty", q: "And with no requests at all?", changes: "Zero, from a structure that must not fall over when it is empty." },
    ],
  },
  {
    id: "kth-largest", prompt: "Find the kth biggest number.",
    questions: [
      { kind: "range", q: "Is k counted from 1, and can it be larger than the list?", changes: "Off by one everywhere if it is from 0, and an error path if it can exceed the length." },
      { kind: "duplicates", q: "Do repeats count separately — is the 2nd largest of [5, 5, 3] 5 or 3?", changes: "It decides whether you de-duplicate first." },
      { kind: "scale", q: "One question, or many on a list that keeps growing?", changes: "One: quickselect or a size-k heap. A stream: keep the heap and answer from its top." },
      { kind: "structure", q: "May I reorder the array?", changes: "Quickselect works in place and reorders it; if that is not allowed, a heap or a copy." },
      { kind: "size", q: "How long is the list, and what range are the values in?", changes: "A small value range allows counting instead of comparing." },
      { kind: "empty", q: "What about an empty list?", changes: "No kth anything — decided before, not discovered at, the index error." },
    ],
  },
  {
    id: "palindrome", prompt: "Check whether a sentence is a palindrome.",
    questions: [
      { kind: "text", q: "Should spaces and punctuation be ignored?", changes: "\"A man, a plan...\" is only a palindrome if they are, and skipping them is the two-pointer loop's inner while." },
      { kind: "text", q: "Is it case-insensitive?", changes: "Lower-case as you compare, rather than building a lower-cased copy." },
      { kind: "text", q: "Which characters count as letters — ASCII only, or accented and non-Latin ones too?", changes: "isalnum means different things in different languages, and in Unicode." },
      { kind: "empty", q: "Is an empty string a palindrome?", changes: "Most definitions say yes. Saying it out loud is the point." },
      { kind: "size", q: "Could it be long enough that copying it matters?", changes: "Two pointers over the original avoid building a cleaned copy at all." },
    ],
  },
  {
    id: "task-order", prompt: "Given tasks and their dependencies, give me an order to run them in.",
    questions: [
      { kind: "rules", q: "Can the dependencies form a cycle — and what should happen if they do?", changes: "Kahn's algorithm detects it for free; the question is what to return when it does." },
      { kind: "output", q: "Any valid order, or a particular one — the alphabetically first, say?", changes: "A particular order swaps the queue for a heap." },
      { kind: "structure", q: "Is every task listed, or only the ones with dependencies?", changes: "Tasks with no edges are the easiest to drop by accident." },
      { kind: "output", q: "An order, or how many rounds it takes if independent tasks run in parallel?", changes: "Rounds is a level-by-level BFS rather than a single queue." },
      { kind: "duplicates", q: "Can the same dependency be listed twice?", changes: "A repeated edge counted twice in the in-degree leaves a task that never becomes ready." },
      { kind: "size", q: "How many tasks and dependencies?", changes: "Large graphs make a recursive DFS a stack-depth risk." },
    ],
  },
];

/** The saved rounds, whatever shape came back. The log is read from GitHub, the
 *  cache or an import and nothing upstream checks it, so one bad entry must not
 *  take the drill and the week view down with it. */
const roundsOf = (state) => {
  const log = state?.clarify?.log;
  return Array.isArray(log) ? log.filter(isRecord) : [];
};

const listOrEmpty = (v) => (Array.isArray(v) ? v : []);

const promptById = (id) => CLARIFY_PROMPTS.find((p) => p.id === id) || null;

/** How many past rounds are kept. Enough to see a habit, small enough to cost
 *  nothing on a save. */
const CLARIFY_MEMORY = 60;

/** The next prompt: never seen first, then the one seen longest ago, with the
 *  last few held back so the answers are not still on the screen in memory. */
export function pickClarifyPrompt(state, recent = []) {
  const log = roundsOf(state);
  const lastSeen = new Map();
  log.forEach((r, i) => lastSeen.set(r.id, i));
  const pool = CLARIFY_PROMPTS.filter((p) => !recent.includes(p.id));
  const cards = pool.length ? pool : CLARIFY_PROMPTS;
  return [...cards].sort((a, b) => (lastSeen.get(a.id) ?? -1) - (lastSeen.get(b.id) ?? -1))[0];
}

/** Record which questions were asked. Mutates `state`; for store.mutate.
 *  An unreadable clock records nothing: a guessed or junk date would corrupt `clarifyToday` for good. */
export function recordClarify(state, promptId, askedIndexes, rawToday = todayISO()) {
  const prompt = promptById(promptId);
  const today = dayOf(rawToday);
  if (!prompt || today === null) return;
  const asked = [...new Set(listOrEmpty(askedIndexes))]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < prompt.questions.length)
    .sort((a, b) => a - b);
  const log = [...roundsOf(state), { id: promptId, date: today, asked }];
  state.clarify = { log: log.slice(-CLARIFY_MEMORY) };
}

/**
 * How often each kind of question gets asked, across everything recorded.
 *
 * Read from the prompt definitions at the time of asking, so a round is
 * judged against the questions that existed when it was played.
 */
function clarifyStats(state) {
  const tally = Object.fromEntries(Object.keys(CLARIFY_KINDS).map((k) => [k, { asked: 0, of: 0 }]));
  for (const round of roundsOf(state)) {
    const prompt = promptById(round.id);
    if (!prompt) continue;
    const asked = new Set(listOrEmpty(round.asked));
    prompt.questions.forEach((q, i) => {
      tally[q.kind].of += 1;
      if (asked.has(i)) tally[q.kind].asked += 1;
    });
  }
  return Object.entries(tally).map(([kind, t]) => ({
    kind, ...CLARIFY_KINDS[kind], asked: t.asked, of: t.of,
    rate: t.of ? t.asked / t.of : null,
  }));
}

/** Kinds you skip, once there is enough to say so. Three chances is the least
 *  that turns "missed it" into "tends to miss it". */
const HABIT_MIN = 3;
const HABIT_RATE = 0.5;

export function blindKinds(state) {
  return clarifyStats(state)
    .filter((s) => s.of >= HABIT_MIN && s.rate < HABIT_RATE)
    .sort((a, b) => a.rate - b.rate);
}

/** Rounds played today — for the week's progress. */
export const clarifyToday = (state, rawToday = todayISO()) => {
  const today = dayOf(rawToday);
  if (today === null) return 0; // a round with a damaged date must not match "no day"
  return roundsOf(state).filter((r) => r.date === today).length;
};
