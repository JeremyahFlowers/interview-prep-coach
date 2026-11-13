// Global search: one place to reach anything by name.
//
// Where this fits: opened with `/` from anywhere, or the topbar button. It
// searches three things at once because they're three ways of asking the same
// question — the problems you're tracking, the ~2,500 in the catalog, and the
// patterns themselves.
//
// The ordering is the whole design. A title you typed exactly should not sit
// below a catalog problem that happens to contain the word, and something you
// are actively practising should outrank something you have never opened. So
// results are scored by how well the text matches *and* by how close the thing
// already is to you, and the two are combined rather than one sorting the
// other.

import { esc, NO_DAY } from "./ui.js";
import { loadCatalog, PATTERN_CONFIDENCE, slugify, problemUrl } from "./catalog.js";
import { patternIcon, navIcon } from "./icons.js";
import { COMPONENTS } from "./design-components.js";
import { DESIGN_PROBLEMS } from "./design-problems.js";
import { isBacklog, dayOf } from "./logic.js";

// Enough per kind that the ranking still interleaves fairly, but the list is
// paged rather than shown all at once — see PAGE_SIZE.
const MAX_PER_GROUP = 24;
const MIN_QUERY = 2;
// How many results are on screen at a time. Paging rather than rendering every
// match keeps arrow-key navigation moving through a fixed, small number of
// rows however many things matched.
const PAGE_SIZE = 8;

let deps = null;          // { store, actions }
let catalog = null;       // lazily loaded, then kept
let activeIndex = 0;      // within the current page
let page = 0;
let results = [];
let lastQuery = "";

export function installSearch(dependencies) {
  deps = dependencies;
  const input = document.getElementById("search-input");
  if (!input) return;

  // No debounce. Scoring the whole catalog is well under a millisecond now
  // that it doesn't compile a regex per candidate, and a delay between typing
  // and seeing results is exactly what made this feel sluggish.
  input.addEventListener("input", () => runSearch(input.value));
  input.addEventListener("keydown", onKeyDown);
  input.addEventListener("focus", () => { if (results.length) showPanel(); });

  // Clicking away closes the results but leaves the query, so coming back to
  // the bar resumes where you were rather than starting over.
  document.addEventListener("mousedown", (event) => {
    if (!event.target.closest(".topbar-search")) hidePanel();
  });

  if (!catalog) {
    loadCatalog()
      .then((c) => { catalog = c; if (isSearchOpen()) runSearch(input.value); })
      .catch(() => { /* your own problems and the patterns still search */ });
  }
}

function panel() {
  return document.getElementById("search-panel");
}

function showPanel() {
  const el = panel();
  if (!el) return;
  el.hidden = false;
  document.getElementById("search-input")?.setAttribute("aria-expanded", "true");
}

function hidePanel() {
  const el = panel();
  if (!el) return;
  el.hidden = true;
  document.getElementById("search-input")?.setAttribute("aria-expanded", "false");
}

export function isSearchOpen() {
  return !panel()?.hidden;
}

export function closeSearch() {
  hidePanel();
}

/** Focus the search bar. The `/` shortcut and the topbar both land here. */
export function openSearch() {
  const input = document.getElementById("search-input");
  if (!input) return;
  input.focus();
  input.select();
  if (results.length) showPanel();
}

function pageCount() {
  return Math.max(1, Math.ceil(results.length / PAGE_SIZE));
}

function pageItems() {
  return results.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
}

function turnPage(delta) {
  const next = page + delta;
  if (next < 0 || next >= pageCount()) return false;
  page = next;
  // Entering a page from above lands on its first row, from below on its last,
  // so holding an arrow key reads as one continuous list rather than jumping
  // back to the top at every page boundary.
  activeIndex = delta > 0 ? 0 : pageItems().length - 1;
  paint(lastQuery);
  return true;
}

function onKeyDown(event) {
  if (event.key === "Escape") { event.preventDefault(); hidePanel(); return; }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!results.length) return;
    const down = event.key === "ArrowDown";
    const onPage = pageItems().length;
    const next = activeIndex + (down ? 1 : -1);
    // Running off either end of a page turns it; only wrap around the whole
    // result set when there is nowhere further to go.
    if (next >= onPage || next < 0) {
      if (turnPage(down ? 1 : -1)) return;
      activeIndex = down ? 0 : onPage - 1;
      page = down ? 0 : pageCount() - 1;
      paint(lastQuery);
      return;
    }
    activeIndex = next;
    paintActive();
    return;
  }

  if (event.key === "PageDown" || (event.key === "ArrowRight" && event.metaKey)) {
    event.preventDefault(); turnPage(1); return;
  }
  if (event.key === "PageUp" || (event.key === "ArrowLeft" && event.metaKey)) {
    event.preventDefault(); turnPage(-1); return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const hit = pageItems()[activeIndex];
    if (hit) choose(hit);
  }
}

/**
 * Score a candidate against the query. Exported because the ranking is the
 * substance of this module — everything else is presentation — and it is worth
 * pinning independently of a DOM.
 *
 * Returns null for no match so callers can filter in one pass. Higher is
 * better; the bands are deliberately far apart so a weaker kind of match never
 * outranks a stronger one on the strength of a tie-breaker.
 */
export function score(text, query) {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  if (!needle) return 1;
  if (haystack === needle) return 1000;
  if (haystack.startsWith(needle)) return 500;

  // Everything below used to be a regex built per candidate, which meant
  // compiling a pattern ~2,500 times per keystroke — the entire reason typing
  // felt choppy. indexOf answers the same question, and the word-boundary test
  // is just "what character precedes the hit", so no pattern is needed at all.
  // Dropping the regex also drops the escaping it required, and with it the
  // possibility of a query like "*.+?" being read as syntax.
  const at = haystack.indexOf(needle);
  if (at === -1) return null;
  // A word-start match ("two" in "Add Two Numbers") reads as intentional in a
  // way that a match inside a word does not.
  return at === 0 || !isWordChar(haystack[at - 1]) ? 250 : 100;
}

function isWordChar(ch) {
  return (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "_";
}

/**
 * Everything the query matches, ranked, grouped, and capped per kind.
 *
 * Pure, and exported for that reason: this is where the decisions about what
 * is findable and what outranks what actually live, and until it was split out
 * of runSearch none of them could be tested — the only way to ask "is a weekly
 * retro findable" was to open a browser and type.
 */
export function collectResults(state, catalog, rawQuery) {
  const query = (rawQuery || "").trim();
  const results = [];
  if (!query || !state) return results;

  // Patterns first: they're few, and "what was sliding window again" is a
  // question this app should answer instantly.
  for (const pattern of state.patterns) {
    const s = score(pattern.name, query);
    if (s == null) continue;
    results.push({ kind: "pattern", score: s + 40, id: pattern.id, title: pattern.name,
      subtitle: pattern.description });
  }

  // Your own problems outrank the catalog — you've already chosen these.
  for (const problem of state.problems) {
    const s = score(`${problem.name} ${problem.number ?? ""}`, query);
    if (s == null) continue;
    results.push({
      kind: "mine", score: s + 25, id: problem.id, title: problem.name,
      subtitle: `${problem.difficulty}${isBacklog(problem) ? " · in your bank" : " · in your review rotation"}`,
      problem,
    });
  }

  // Everything you wrote, wherever you wrote it. Ranked below your problems
  // but above the catalog: a sentence you wrote is more yours than a problem
  // you have never opened.
  //
  // Soul statements were made findable first, because they are what the app
  // works hardest to collect. Weekly retros were left out and are arguably the
  // harder thing to find again — a soul statement is one line attached to a
  // problem you can navigate to, and a retro is loose prose in a list that
  // only grows.
  if (query.length >= MIN_QUERY) {
    for (const problem of state.problems) {
      for (const attempt of problem.attempts || []) {
        const note = attempt.soulStatement;
        if (!note) continue;
        const s = score(note, query);
        if (s == null) continue;
        results.push({
          kind: "note", score: s + 15, id: attempt.id, title: note,
          subtitle: `${problem.name} · ${dayOf(attempt.date) ?? NO_DAY}`,
          source: "attempt", problem,
        });
      }
    }

    for (const entry of state.journal || []) {
      if (!entry.text) continue;
      const s = score(entry.text, query);
      if (s == null) continue;
      results.push({
        kind: "note", score: s + 15, id: entry.id, title: entry.text,
        subtitle: `${(entry.type || "note").replace(/-/g, " ")} · ${dayOf(entry.date) ?? NO_DAY}`,
        source: "journal",
      });
    }
  }

  // The design half is searchable from the same bar, because "what was a
  // consistent hash again" is the same question as "what was sliding window
  // again" and should not need a different place to ask it.
  for (const component of COMPONENTS) {
    const s = score(component.name, query);
    if (s == null) continue;
    results.push({ kind: "component", score: s + 35, id: component.id,
      title: component.name, subtitle: component.hook });
  }

  for (const problem of DESIGN_PROBLEMS) {
    const s = score(problem.name, query);
    if (s == null) continue;
    results.push({ kind: "design", score: s + 20, id: problem.id,
      title: problem.name, subtitle: `${problem.difficulty} · system design` });
  }

  if (catalog && query.length >= MIN_QUERY) {
    const owned = new Set(state.problems.map((p) => p.catalogSlug || slugify(p.name)));
    for (const entry of catalog.problems) {
      if (owned.has(entry.slug)) continue; // already shown as one of yours
      const s = score(`${entry.title} ${entry.number ?? ""}`, query);
      if (s == null) continue;
      results.push({ kind: "catalog", score: s, id: entry.slug, title: entry.title,
        subtitle: `${entry.difficulty} · ${topPatternOf(entry)}`, entry });
    }
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return groupByKind(capPerGroup(results));
}

function runSearch(rawQuery) {
  const query = rawQuery.trim();
  const state = deps?.store?.state;
  if (!state) return;
  lastQuery = query;

  // An empty bar shows nothing rather than everything: a panel that springs
  // open under the header the moment you click it is in the way, not helpful.
  if (!query) {
    results = [];
    hidePanel();
    return;
  }

  results = collectResults(state, catalog, query);
  activeIndex = 0;
  page = 0;
  paint(query);
  showPanel();
}

function topPatternOf(entry) {
  const top = Object.entries(entry.patterns)
    .filter(([, w]) => w >= PATTERN_CONFIDENCE)
    .sort((a, b) => b[1] - a[1])[0];
  return top ? top[0].replace(/[-_]/g, " ") : "unlabelled";
}

/** Keep every kind represented — an exact catalog match shouldn't be buried
 * under six of your own near-misses, and vice versa. */
function capPerGroup(list) {
  const counts = { pattern: 0, component: 0, mine: 0, design: 0, note: 0, catalog: 0 };
  return list.filter((r) => ++counts[r.kind] <= MAX_PER_GROUP);
}

/**
 * Gather each kind into one contiguous run, keeping the score order inside it.
 *
 * Sorting purely by score interleaves the kinds, because the per-kind
 * proximity bonuses mean a weaker pattern can outrank a stronger catalog hit
 * and then fall below one of your own problems. The list stayed correctly
 * ranked but grew a second "Pattern" heading further down, which reads as a
 * bug rather than as ranking.
 *
 * Kinds are ordered by their best hit, so whichever kind holds the strongest
 * match still leads.
 */
export function groupByKind(list) {
  const order = [];
  const buckets = new Map();
  for (const r of list) {
    if (!buckets.has(r.kind)) { buckets.set(r.kind, []); order.push(r.kind); }
    buckets.get(r.kind).push(r);
  }
  return order.flatMap((kind) => buckets.get(kind));
}

const KIND_LABEL = {
  pattern: "Pattern", component: "Component", mine: "Your problems",
  design: "System design", note: "Things you wrote", catalog: "Catalog",
};
const KIND_ICON = {
  pattern: "topics", component: "systemDesign", mine: "queue",
  design: "systemDesign", note: "journal", catalog: "bank",
};

function paint(query) {
  const host = panel();
  if (!host) return;

  if (!results.length) {
    host.innerHTML = `<p class="search-empty muted small">${query.length < MIN_QUERY
      ? "Type at least two characters to search the catalog."
      : `Nothing matches “${esc(query)}”.`}</p>`;
    return;
  }

  const items = pageItems();
  const from = page * PAGE_SIZE;
  let lastKind = null;

  const rows = items.map((r, i) => {
    // The group header repeats at the top of a page when that page opens
    // mid-group, so a row is never left unlabelled just because its heading
    // was on the page before.
    const header = r.kind !== lastKind
      ? `<p class="search-group">${navIcon(KIND_ICON[r.kind], { size: 13 })} ${KIND_LABEL[r.kind]}</p>` : "";
    lastKind = r.kind;
    const icon = r.kind === "pattern"
      ? `<span class="pattern-icon">${patternIcon(r.id, { size: 15 })}</span>` : "";
    return `${header}
      <button type="button" class="search-hit ${i === activeIndex ? "active" : ""}"
              role="option" aria-selected="${i === activeIndex}" data-index="${i}">
        ${icon}
        <span class="search-hit-text">
          <span class="search-hit-title">${esc(r.title)}</span>
          <span class="muted small">${esc(r.subtitle)}</span>
        </span>
      </button>`;
  }).join("");

  const pages = pageCount();
  host.innerHTML = `
    <div id="search-results" class="search-results" role="listbox">${rows}</div>
    <div class="search-footer muted small">
      <span>${from + 1}&ndash;${from + items.length} of ${results.length}</span>
      ${pages > 1 ? `
      <span class="search-pager">
        <button type="button" class="btn btn-ghost btn-xs" data-page="-1" ${page === 0 ? "disabled" : ""}
                aria-label="Previous results">&lsaquo;</button>
        <span>${page + 1}/${pages}</span>
        <button type="button" class="btn btn-ghost btn-xs" data-page="1" ${page + 1 >= pages ? "disabled" : ""}
                aria-label="More results">&rsaquo;</button>
      </span>` : ""}
      <span class="search-keys"><kbd>&uarr;</kbd><kbd>&darr;</kbd> move <kbd>&crarr;</kbd> open <kbd>esc</kbd> close</span>
    </div>`;

  // One listener on the container rather than one per row: the rows are
  // replaced on every keystroke, and re-binding each of them was work done
  // over and over for no reason.
  host.querySelector("#search-results").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-index]");
    if (btn) choose(pageItems()[Number(btn.dataset.index)]);
  });
  host.querySelectorAll("[data-page]").forEach((btn) => {
    // mousedown, not click: the input loses focus first on a click, and the
    // outside-click handler would close the panel before the page turned.
    btn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      turnPage(Number(btn.dataset.page));
    });
  });
}

function paintActive() {
  const host = document.getElementById("search-results");
  if (!host) return;
  host.querySelectorAll(".search-hit").forEach((el, i) => {
    const active = i === activeIndex;
    el.classList.toggle("active", active);
    el.setAttribute("aria-selected", String(active));
    if (active) el.scrollIntoView({ block: "nearest" });
  });
}

function choose(hit) {
  if (!hit) return;
  hidePanel();
  if (hit.kind === "pattern") {
    deps.actions.openTopic(hit.id);
    return;
  }
  if (hit.kind === "mine") {
    deps.actions.startProblem(hit.problem);
    return;
  }
  if (hit.kind === "component") {
    deps.actions.openComponent(hit.id);
    return;
  }
  if (hit.kind === "design") {
    deps.actions.openDesignProblem(hit.id);
    return;
  }
  if (hit.kind === "note") {
    // A note's own page is wherever it sits in context: a soul statement
    // beside the attempt that produced it, a retro among the others.
    if (hit.source === "journal") deps.actions.openJournal();
    else deps.actions.openProblem(hit.problem.id);
    return;
  }
  // A catalog problem isn't yours yet, so the useful move is to read it.
  const url = problemUrl({ catalogSlug: hit.entry.slug, name: hit.entry.title, number: hit.entry.number });
  if (url) window.open(url, "_blank", "noopener");
}
