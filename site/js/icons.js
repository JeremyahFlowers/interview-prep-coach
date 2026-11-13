// A small hand-drawn icon set — stroke-based, one consistent visual
// language (20×20, rounded caps, currentColor) — so every section, page,
// and pattern has a stable, recognizable mark instead of relying on text
// alone. Not decoration: the goal is scanning speed — find the right chapter
// or the right pattern by shape before you've even read the label.

import { ownValue } from "./logic.js";

const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

function svg(inner, { size = 18 } = {}) {
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}" class="icon" aria-hidden="true">${inner}</svg>`;
}

// ---------- Navigation & chapters ----------
const NAV_ICONS = {
  home: `<path d="M3 9.5 10 3.5l7 6" ${S}/><path d="M4.5 8.5V16h11V8.5" ${S}/><path d="M8 16v-4.5h4V16" ${S}/>`,
  practice: `<circle cx="10" cy="10" r="6.5" ${S}/><circle cx="10" cy="10" r="3.4" ${S}/><circle cx="10" cy="10" r="0.6" fill="currentColor" stroke="none"/>`,
  learn: `<path d="M10 5.2C8.6 4.3 6.6 4 4 4v10.5c2.6 0 4.6.3 6 1.2" ${S}/><path d="M10 5.2C11.4 4.3 13.4 4 16 4v10.5c-2.6 0-4.6.3-6 1.2" ${S}/><path d="M10 5.2v10.5" ${S}/>`,
  track: `<path d="M3.5 15.5v-10" ${S}/><path d="M3.5 15.5h13" ${S}/><path d="M5.5 13l3-3.4 2.4 2 4.1-5.4" ${S}/>`,
  settings: `<circle cx="10" cy="10" r="2.6" ${S}/><path d="M10 3.5v2M10 14.5v2M3.5 10h2M14.5 10h2M5.6 5.6l1.4 1.4M13 13l1.4 1.4M14.4 5.6 13 7M7 13l-1.4 1.4" ${S}/>`,
  queue: `<path d="M4 5.5h12M4 10h12M4 14.5h7" ${S}/>`,
  whiteboard: `<rect x="3" y="4" width="14" height="9.5" rx="1.2" ${S}/><path d="M10 13.5V16M7 16.5h6" ${S}/><path d="M6 8.5l2.5 2 4.5-4" ${S}/>`,
  log: `<path d="M5.5 3.5h6l3 3v10a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" ${S}/><path d="M11 3.5V7h3" ${S}/><path d="M7 11h6M7 13.5h4" ${S}/>`,
  topics: `<path d="M4 4.5h9a2 2 0 0 1 2 2V16H6a2 2 0 0 1-2-2z" ${S}/><path d="M4 4.5v9.5" ${S}/><path d="M7 8h5M7 10.5h5" ${S}/>`,
  patterns: `<path d="M3.5 16V5.5" ${S}/><rect x="5.5" y="10" width="2.6" height="6" rx="0.4" ${S}/><rect x="9" y="6.5" width="2.6" height="9.5" rx="0.4" ${S}/><rect x="12.5" y="12.5" width="2.6" height="3.5" rx="0.4" ${S}/>`,
  quiz: `<circle cx="10" cy="10" r="7" ${S}/><path d="M7.8 8a2.2 2.2 0 1 1 3.3 1.9c-.9.5-1.1.9-1.1 1.8" ${S}/><circle cx="10" cy="14" r="0.15" fill="currentColor" stroke="currentColor" stroke-width="1.4"/>`,
  // Stacked cards in a tray: a shelf of problems waiting to be picked up.
  bank: `<rect x="3" y="7.5" width="14" height="8.5" rx="1.2" ${S}/><path d="M5.2 7.5V5.6a1 1 0 0 1 1-1h7.6a1 1 0 0 1 1 1v1.9" ${S}/><path d="M7.4 4.6V3.4a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1v1.2" ${S}/><path d="M3 11.2h4.1a1 1 0 0 1 1 1 1 1 0 0 0 1 1h1.8a1 1 0 0 0 1-1 1 1 0 0 1 1-1H17" ${S}/>`,
  search: `<circle cx="8.8" cy="8.8" r="5.1" ${S}/><path d="M12.6 12.6 16.8 16.8" ${S}/>`,
  // A rising line over an axis: trajectory, not volume.
  progress: `<path d="M3.5 16.5V4" ${S}/><path d="M3.5 16.5H17" ${S}/><path d="M5.8 13.4l3.1-3.4 2.5 2.1 4.2-5.2" ${S}/><circle cx="15.6" cy="6.9" r="1.2" fill="currentColor" stroke="none"/>`,
  // A magnifier over lines of text: reading a problem closely, not solving it.
  analyze: `<path d="M3.6 4.8h7.2M3.6 7.6h5.2M3.6 10.4h3.2" ${S}/><circle cx="12.3" cy="11.5" r="3.4" ${S}/><path d="M14.8 13.9 17 16.2" ${S}/>`,
  journal: `<path d="M5 3.8h8.5a1 1 0 0 1 1 1V16l-2.4-1.6L9.7 16l-2.4-1.6L5 16z" ${S}/><path d="M7.3 7h4.4M7.3 9.4h4.4" ${S}/>`,
  leetcode: `<path d="M8.6 4 4.3 8.4a1.3 1.3 0 0 0 0 1.8l4.6 4.7" ${S}/><path d="M6.6 10h9.1" ${S}/><path d="M12.4 6.4 16 10l-3.6 3.6" ${S}/>`,
  systemDesign: `<rect x="3.2" y="3.5" width="4.4" height="4.4" rx="0.8" ${S}/><rect x="12.4" y="3.5" width="4.4" height="4.4" rx="0.8" ${S}/><rect x="7.8" y="12" width="4.4" height="4.4" rx="0.8" ${S}/><path d="M5.4 7.9v2.4c0 1 .6 1.7 1.6 2.1l2.6 1M14.6 7.9v2.4c0 1-.6 1.7-1.6 2.1l-2.6 1" ${S}/>`,
};

export function navIcon(name, opts) {
  return svg(NAV_ICONS[name] || "", opts);
}

// ---------- Patterns ----------
// Abstract but not arbitrary — each shape gestures at the actual mechanism
// (converging arrows for two pointers, a window frame for sliding window,
// a decreasing stack of bars for monotonic stack) so the icon becomes a
// second, faster label once you've seen it a few times.
const PATTERN_ICONS = {
  "two-pointers": `<circle cx="4.5" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1.3" fill="currentColor" stroke="none"/><path d="M7.2 10H4M12.8 10H16" ${S}/><path d="M8 7.5 5.8 10 8 12.5M12 7.5l2.2 2.5L12 12.5" ${S}/>`,
  "sliding-window": `<path d="M2.5 5.5h15v9h-15z" ${S}/><path d="M6.5 5.5v9M12 5.5v9" ${S}/><rect x="6.5" y="5.5" width="5.5" height="9" fill="currentColor" fill-opacity="0.18" stroke="none"/>`,
  "arrays-hashing": `<rect x="3" y="3" width="6" height="6" rx="0.8" ${S}/><rect x="11" y="3" width="6" height="6" rx="0.8" ${S}/><rect x="3" y="11" width="6" height="6" rx="0.8" ${S}/><rect x="11" y="11" width="6" height="6" rx="0.8" fill="currentColor" fill-opacity="0.22" ${S}/>`,
  strings: `<path d="M4 6h8M4 10h12M4 14h6" ${S}/>`,
  "binary-search": `<circle cx="8.5" cy="8.5" r="5.3" ${S}/><path d="M8.5 3.2v10.6" ${S}/><path d="M13.6 13.6 17 17" ${S}/>`,
  "recursion-dp": `<rect x="3" y="12" width="4" height="4.5" rx="0.6" ${S}/><rect x="8" y="8" width="4" height="8.5" rx="0.6" ${S}/><rect x="13" y="4" width="4" height="12.5" rx="0.6" ${S}/>`,
  "bit-manipulation": `<rect x="2.5" y="6" width="4.2" height="8" rx="0.8" ${S}/><rect x="7.6" y="6" width="4.2" height="8" rx="0.8" fill="currentColor" fill-opacity="0.22" ${S}/><rect x="12.7" y="6" width="4.2" height="8" rx="0.8" ${S}/><text x="4.6" y="11.6" font-size="4" text-anchor="middle" fill="currentColor" stroke="none">1</text><text x="9.7" y="11.6" font-size="4" text-anchor="middle" fill="currentColor" stroke="none">0</text><text x="14.8" y="11.6" font-size="4" text-anchor="middle" fill="currentColor" stroke="none">1</text>`,
  "2d-matrix": `<rect x="3" y="3" width="14" height="14" rx="1" ${S}/><path d="M3 8.3h14M3 12.7h14M8.3 3v14M12.7 3v14" ${S}/>`,
  knapsack: `<path d="M7 6.5V5a3 3 0 0 1 6 0v1.5" ${S}/><path d="M4.8 6.5h10.4l-.9 9.5a1 1 0 0 1-1 .9H6.7a1 1 0 0 1-1-.9z" ${S}/>`,
  monotonic_stack: `<rect x="3" y="12.5" width="14" height="2.8" rx="0.5" ${S}/><rect x="4.5" y="9" width="11" height="2.8" rx="0.5" ${S}/><rect x="6" y="5.5" width="8" height="2.8" rx="0.5" fill="currentColor" fill-opacity="0.22" ${S}/>`,
  mst: `<circle cx="4.5" cy="5" r="1.6" ${S}/><circle cx="15.5" cy="5" r="1.6" ${S}/><circle cx="10" cy="10.5" r="1.6" ${S}/><circle cx="6" cy="16" r="1.6" ${S}/><path d="M5.9 6.1 8.6 9.4M13.1 6.1 11 9.4M8.6 12L7 14.6" ${S}/>`,
  quick_sort: `<rect x="3" y="12" width="3" height="4.5" ${S}/><rect x="8.5" y="7" width="3" height="9.5" ${S}/><rect x="14" y="3.5" width="3" height="13" ${S}/><path d="M3 3.5l2-1.7 2 1.7" ${S}/>`,
  topological_sort: `<circle cx="3.6" cy="10" r="1.7" ${S}/><circle cx="10" cy="10" r="1.7" ${S}/><circle cx="16.4" cy="10" r="1.7" ${S}/><path d="M5.5 10h2.6M11.8 10h2.6" ${S}/><path d="M7.3 9.2l.9.8-.9.8M13.7 9.2l.9.8-.9.8" ${S}/>`,
  trie: `<circle cx="10" cy="3.6" r="1.4" fill="currentColor" stroke="none"/><path d="M10 5v2.5M10 7.5 5.5 11M10 7.5 14.5 11" ${S}/><circle cx="5.5" cy="12.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12.5" r="1.4" fill="currentColor" stroke="none"/><path d="M5.5 14v2M14.5 14v2" ${S}/>`,
  "union-find": `<circle cx="7.5" cy="10" r="5" fill="currentColor" fill-opacity="0.16" ${S}/><circle cx="12.5" cy="10" r="5" fill="currentColor" fill-opacity="0.16" ${S}/>`,
  "linked-list": `<circle cx="3.6" cy="10" r="1.6" ${S}/><path d="M5.6 10h2.3" ${S}/><circle cx="9.9" cy="10" r="1.6" ${S}/><path d="M11.9 10h2.3" ${S}/><circle cx="16.2" cy="10" r="1.6" ${S}/>`,
  trees: `<circle cx="10" cy="4" r="1.5" ${S}/><path d="M10 5.5v2M10 7.5 5.5 12M10 7.5 14.5 12" ${S}/><circle cx="5.5" cy="13.5" r="1.5" ${S}/><circle cx="14.5" cy="13.5" r="1.5" ${S}/>`,
  "graphs-bfs-dfs": `<circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="4" ${S}/><circle cx="10" cy="10" r="7" ${S}/>`,
  backtracking: `<path d="M4 15c3-6 5-8 8-9" ${S}/><path d="M15.5 4.5 12 6l1.5 3.5" ${S}/><path d="M4 15h3.2" ${S}/>`,
  heap: `<circle cx="10" cy="4.5" r="1.6" fill="currentColor" fill-opacity="0.3" ${S}/><circle cx="5.5" cy="11" r="1.6" ${S}/><circle cx="14.5" cy="11" r="1.6" ${S}/><circle cx="3" cy="16.5" r="1.6" ${S}/><circle cx="8" cy="16.5" r="1.6" ${S}/><path d="M10 6.1 5.5 9.4M10 6.1l4.5 3.3M5.5 12.6 3 14.9M5.5 12.6 8 14.9" ${S}/>`,
  intervals: `<path d="M3 14.5h14" ${S}/><path d="M4.5 6.5h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-6z" ${S}/><path d="M9.5 6.5H15a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9.5" fill="currentColor" fill-opacity="0.18" ${S}/>`,
  "prefix-sum": `<path d="M3 15V8M7 15V5M11 15v-4M15 15V3" ${S}/><path d="M3 5.5h1.6M3 5.5v1.6" ${S}/>`,
  greedy: `<path d="M3 15.5h3v-3H9v-3h3v-3h3v-3" ${S}/><path d="M14.5 2.5 18 3l-.5 3.5" ${S}/>`,
};

export function patternIcon(patternId, opts) {
  return svg(ownValue(PATTERN_ICONS, patternId) || NAV_ICONS.patterns, opts);
}
