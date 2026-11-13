// The problem bank: browse ~2,500 pattern-labelled problems and stock up on
// practice material.
//
// Where this fits: its own page under Practice. The catalog was previously
// reachable only as a handoff at the end of an Analyze run, which made it
// invisible unless you happened to paste something.
//
// The important design rule here is that saving is cheap and scheduling is
// not. Everything saved from this page lands in the *bank* (backlog), never in
// the refresher list: nothing you stockpile is ever counted against you.
// Saving 300 problems is meant to feel like stocking a shelf, not like falling
// 300 reviews behind — a problem only enters spaced repetition once you
// actually work it. See STATUS_BACKLOG in logic.js.

import { esc, toast, offerUndo } from "./ui.js";
import { ownValue, isRecord } from "./logic.js";
import { startSession } from "./session-view.js";
import { wireListRows } from "./chrome.js";
import {
  loadCatalog, PATTERN_CONFIDENCE, MAX_BANK_SIZE, problemFromCatalog, problemUrl, slugify,
  savedSlugs,
} from "./catalog.js";
import { patternIcon } from "./icons.js";
import { uid, backlogProblems, STATUS_BACKLOG, difficultyRank } from "./logic.js";

const PAGE_SIZE = 40;
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

/**
 * How the list can be ordered.
 *
 * One table drives both the <select> and the comparator, so a new option
 * cannot appear in the menu without an ordering behind it. "Best match for
 * this pattern" is the useful default once a pattern filter is on: catalog
 * order is arbitrary, and the top of an arbitrary list is a poor place to
 * start.
 */
export const SORTS = {
  number:     { label: "Problem number",  compare: (a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) },
  difficulty: { label: "Easiest first",   compare: (a, b) => difficultyRank(a.difficulty) - difficultyRank(b.difficulty) || (a.number ?? 1e9) - (b.number ?? 1e9) },
  hardest:    { label: "Hardest first",   compare: (a, b) => difficultyRank(b.difficulty) - difficultyRank(a.difficulty) || (a.number ?? 1e9) - (b.number ?? 1e9) },
  confidence: { label: "Best match for the pattern", compare: null }, // needs the pattern; see sortMatches
  title:      { label: "Title A-Z",       compare: (a, b) => a.title.localeCompare(b.title) },
};

/**
 * A problem's tagged confidence (0-1) for a pattern.
 *
 * Reads own keys only: a pattern id such as "constructor" would otherwise resolve to an inherited Object member and be
 * treated as a confidence. Anything that is not a finite number reads as 0 so damaged data cannot put NaN into a sort.
 */
export function patternConfidence(problem, patternId) {
  const value = ownValue(problem?.patterns, patternId);
  return Number.isFinite(value) ? value : 0;
}

/** Whether a problem passes the pattern filter; no pattern chosen filters nothing. */
export function matchesPattern(problem, patternId) {
  return !patternId || patternConfidence(problem, patternId) >= PATTERN_CONFIDENCE;
}

/**
 * Order a filtered list.
 *
 * Exported and pure so the ordering can be pinned without a catalog or a DOM.
 * "Best match" is only meaningful with a pattern selected — without one it
 * falls back to problem number rather than pretending to rank by a confidence
 * that isn't there.
 */
export function sortMatches(rows, sortKey, patternId) {
  const list = [...rows];
  if (sortKey === "confidence") {
    if (!patternId) return list.sort(SORTS.number.compare);
    return list.sort((a, b) => patternConfidence(b, patternId) - patternConfidence(a, patternId)
      || (a.number ?? 1e9) - (b.number ?? 1e9));
  }
  const compare = SORTS[sortKey]?.compare || SORTS.number.compare;
  return list.sort(compare);
}

/**
 * One problem from a filtered list, chosen at random.
 *
 * Deciding what to work on is its own tax, and scanning 2,500 rows to avoid
 * making that decision is worse than the decision. `pick` is injected so the
 * choice can be tested.
 */
export function pickOne(rows, pick = Math.random) {
  if (!rows.length) return null;
  return rows[Math.floor(pick() * rows.length)] || rows[0];
}
// A cap on one bulk action. Large enough to be worth the button, small enough
// that a stray click is easy to undo by hand.
const BULK_LIMIT = 50;

const state = {
  status: "idle",     // idle | loading | ready | error
  error: "",
  catalog: null,
  mode: "browse",     // browse the catalog | mine: what's already saved
  pattern: "",
  difficulty: "",
  search: "",
  hideSaved: true,
  sort: "number",
  shown: PAGE_SIZE,
  // Slugs saved during this visit. "Hide saved" is about not re-reading a list
  // you've already worked through, so it applies to what was saved before you
  // got here — pulling out the row you just clicked makes the list reflow under
  // the cursor and the next Save button slide into the spot you're about to
  // click again. These stay, showing "saved", until a filter change rebuilds
  // the list on purpose.
  justSaved: new Set(),
};

export async function renderBank(root, store, actions) {
  if (state.status === "idle") {
    state.status = "loading";
    loadCatalog()
      .then((c) => { state.catalog = c; state.status = "ready"; })
      .catch((err) => { state.status = "error"; state.error = err.message; })
      .finally(() => actions.rerender());
  }

  if (state.status === "loading") {
    // The catalog is around a megabyte, so this is a real wait on a slow
    // connection. The chrome that will still be there afterwards is drawn now,
    // with placeholder rows in place of the list, so the page settles into
    // itself rather than being replaced by a different layout when it lands.
    root.innerHTML = `
      ${modeTabsHtml(backlogProblems(store.state).length)}
      <div class="card">
        <h2>Problem bank</h2>
        <p class="muted">Loading ~2,500 pattern-labelled problems…</p>
        <div class="skeleton skeleton-line" style="width:70%"></div>
        <div class="skeleton skeleton-line" style="width:45%"></div>
      </div>
      <div class="card" aria-hidden="true">
        ${Array.from({ length: 6 }, () => `
          <div class="skeleton-row">
            <div><div class="skeleton skeleton-line" style="width:5rem"></div>
                 <div class="skeleton skeleton-line" style="width:14rem"></div></div>
            <div class="skeleton skeleton-line" style="width:4rem"></div>
          </div>`).join("")}
      </div>`;
    return;
  }
  if (state.status === "error") {
    root.innerHTML = `
      <div class="card banner banner-bad">
        <p><strong>Couldn't load the problem bank.</strong></p>
        <p class="small">${esc(state.error)}</p>
        <p class="muted small">Everything else still works — the bank is a separate file the app
        fetches, so this doesn't affect your own problems or your review schedule.</p>
        <button class="btn btn-ghost btn-sm" id="bank-retry">Try again</button>
      </div>`;
    root.querySelector("#bank-retry").addEventListener("click", () => {
      state.status = "idle";
      state.error = "";
      actions.rerender();
    });
    return;
  }

  const saved = savedSlugs(store.state.problems);
  const bank = backlogProblems(store.state);
  const bankCount = bank.length;

  if (state.mode === "mine") {
    renderMine(root, store, actions, bank);
    return;
  }

  const matches = sortMatches(filtered(store.state, saved), state.sort, state.pattern);
  const page = matches.slice(0, state.shown);
  const roomLeft = MAX_BANK_SIZE - bankCount;

  root.innerHTML = `
    ${modeTabsHtml(bankCount)}
    <div class="card">
      <h2>Problem bank</h2>
      <p class="muted">${state.catalog.count.toLocaleString()} problems, each labelled with the patterns it
      exercises. Save as many as you like — the bank just holds them, and never asks anything of you.
      One joins the refresher rotation the first time you actually work it.</p>
      ${roomLeft <= 0 ? `<p class="banner banner-warn small">Your bank is full at ${MAX_BANK_SIZE}. That is
      already far more than a realistic backlog — work through some, or remove a few from
      <strong>My bank</strong>, before adding more. The cap exists because your whole prep log syncs as
      a single file, and an unbounded bank would eventually outgrow what GitHub will serve.</p>` : ""}
      <div class="bank-filters">
        <label class="field"><span class="label">Pattern</span>
          <select class="select" id="bank-pattern" data-testid="bank-filter-pattern">
            <option value="">All patterns</option>
            ${store.state.patterns.map((p) => `<option value="${esc(p.id)}" ${state.pattern === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
          </select></label>
        <label class="field"><span class="label">Difficulty</span>
          <select class="select" id="bank-difficulty" data-testid="bank-filter-difficulty">
            <option value="">Any</option>
            ${DIFFICULTIES.map((d) => `<option value="${d}" ${state.difficulty === d ? "selected" : ""}>${d}</option>`).join("")}
          </select></label>
        <label class="field"><span class="label">Search</span>
          <input class="input" id="bank-search" data-testid="bank-filter-search" type="search" placeholder="title or number" value="${esc(state.search)}" /></label>
        <label class="field"><span class="label">Order</span>
          <select class="select" id="bank-sort" data-testid="bank-sort">
            ${Object.entries(SORTS).map(([k, v]) =>
              `<option value="${k}" ${state.sort === k ? "selected" : ""}>${esc(v.label)}</option>`).join("")}
          </select></label>
      </div>
      <label class="field checkbox-field">
        <input type="checkbox" id="bank-hide-saved" data-testid="bank-filter-hide-saved" ${state.hideSaved ? "checked" : ""} /> Hide problems I've already saved
      </label>
      <div class="row space-between" style="margin-top:0.75rem;flex-wrap:wrap;gap:0.5rem">
        <span class="muted small">${matches.length.toLocaleString()} match${matches.length === 1 ? "" : "es"} ·
          ${bankCount} of ${MAX_BANK_SIZE} bank slots used${roomLeft <= 0 ? " — bank full" : ""}</span>
        <span class="row gap-sm" style="flex-wrap:wrap">
          ${matches.length ? `<button class="btn btn-ghost btn-sm" id="bank-surprise" data-testid="bank-surprise">Pick one for me</button>` : ""}
          ${matches.length && roomLeft > 0 ? `<button class="btn btn-ghost btn-sm" id="bank-bulk" data-testid="bank-bulk-save">Save first ${Math.min(BULK_LIMIT, matches.length, roomLeft)} to bank</button>` : ""}
        </span>
      </div>
    </div>

    ${matches.length === 0 ? `<div class="card"><p class="empty">Nothing matches those filters.</p></div>` : `
      <div class="card">
        <ul class="queue-list" id="bank-list">
          ${page.map((p) => rowHtml(p, saved)).join("")}
        </ul>
        ${state.shown < matches.length ? `
          <button class="btn btn-ghost" id="bank-more" data-testid="bank-show-more" style="margin-top:0.75rem">
            Show ${Math.min(PAGE_SIZE, matches.length - state.shown)} more (${(matches.length - state.shown).toLocaleString()} left)
          </button>` : ""}
      </div>`}`;

  wire(root, store, actions, matches, saved, page);
}

function modeTabsHtml(bankCount) {
  return `
    <div class="card index-intro">
      <div class="row gap-sm">
        <button class="btn btn-sm ${state.mode === "browse" ? "btn-primary" : "btn-ghost"}" data-mode="browse" data-testid="bank-mode-browse">Browse catalog</button>
        <button class="btn btn-sm ${state.mode === "mine" ? "btn-primary" : "btn-ghost"}" data-mode="mine" data-testid="bank-mode-mine">My bank (${bankCount})</button>
      </div>
    </div>`;
}

/** What's actually saved and waiting — the half that makes the bank useful
 * rather than just browsable. Grouped by pattern so picking work for a weak
 * area is one glance rather than a scroll. */
function renderMine(root, store, actions, bank) {
  const byPattern = new Map();
  for (const p of bank) {
    if (!byPattern.has(p.patternId)) byPattern.set(p.patternId, []);
    byPattern.get(p.patternId).push(p);
  }
  const patternName = (id) => store.state.patterns.find((x) => x.id === id)?.name || id;
  const groups = [...byPattern.entries()].sort((a, b) => b[1].length - a[1].length);

  root.innerHTML = `
    ${modeTabsHtml(bank.length)}
    ${bank.length === 0 ? `
      <div class="card"><p class="empty">Your bank is empty. Browse the catalog and save whatever
      looks worth practicing — nothing you save starts asking for attention until you work it.</p></div>` : `
      <div class="card">
        <h2>Waiting in your bank</h2>
        <p class="muted small">${bank.length} problem${bank.length === 1 ? "" : "s"} saved and unscheduled.
        Starting one logs it like any other session and puts it into the review rotation.</p>
      </div>
      ${groups.map(([patternId, problems]) => `
        <div class="card">
          <div class="row gap-sm" style="align-items:center">
            <span class="pattern-icon">${patternIcon(patternId, { size: 15 })}</span>
            <h3 style="margin:0">${esc(patternName(patternId))}</h3>
            <span class="pill pill-muted">${problems.length}</span>
          </div>
          <ul class="queue-list">
            ${problems.slice(0, 25).map((p) => `
              <li class="queue-item">
                <div>
                  <div class="row gap-sm"><span class="pill pill-muted">${esc(p.difficulty)}</span></div>
                  <div class="queue-name">${p.number ? `<span class="muted">#${p.number}</span> ` : ""}${esc(p.name)}</div>
                </div>
                <div class="row gap-sm">
                  ${problemUrl(p) ? `<a class="btn btn-ghost btn-sm" href="${esc(problemUrl(p))}" target="_blank" rel="noopener noreferrer">Open</a>` : ""}
                  <button class="btn btn-primary btn-sm" data-start="${esc(p.id)}" data-testid="bank-start">Start</button>
                  <button class="btn btn-ghost btn-sm" data-remove="${esc(p.id)}" data-testid="bank-remove" title="Remove from bank">Remove</button>
                </div>
              </li>`).join("")}
          </ul>
          ${problems.length > 25 ? `<p class="muted small">…and ${problems.length - 25} more in this pattern.</p>` : ""}
        </div>`).join("")}`}`;

  root.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => { switchMode(btn.dataset.mode, actions); });
  });
  root.querySelectorAll("[data-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const problem = store.state.problems.find((p) => p.id === btn.dataset.start);
      if (!problem) return;
      startSession(problem);
      actions.switchTab("workspace");
    });
  });
  root.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.remove;
      const problem = store.state.problems.find((p) => p.id === id);
      if (!problem) return;
      // Only ever removes an untouched bank entry, so there's no attempt
      // history to lose and nothing to confirm — but a button that declines
      // without a word is indistinguishable from one that is broken.
      if (problem.attempts.length) {
        toast(`${problem.name} has practice history, so it stays in your rotation.`);
        return;
      }
      store.mutate((s) => { s.problems = s.problems.filter((p) => p.id !== id); }, "Ledger: remove problem from bank");
      // Offered rather than confirmed: an undo asks nothing up front and is
      // still there once you have noticed, which is when people actually
      // realise they clicked the wrong row.
      offerUndo(store, `Removed ${problem.name} from your bank.`, (s) => {
        if (!s.problems.some((p) => p.id === problem.id)) s.problems.push(problem);
      }, `Ledger: restore ${problem.name} to the bank`);
    });
  });
}

function rowHtml(problem, saved) {
  const isSaved = saved.has(problem.slug);
  // Same rule as the filter, so a row never shows a pill for a pattern the filter would reject; a row with no usable
  // `patterns` map shows none rather than failing the whole list.
  const patterns = Object.keys(isRecord(problem.patterns) ? problem.patterns : {})
    .filter((id) => patternConfidence(problem, id) >= PATTERN_CONFIDENCE)
    .slice(0, 3);
  return `
    <li class="queue-item">
      <div>
        <div class="row gap-sm" style="flex-wrap:wrap">
          <span class="pill pill-muted">${esc(problem.difficulty || "—")}</span>
          ${patterns.map((id) => `<span class="pill pill-muted"><span class="pill-icon">${patternIcon(id, { size: 13 })}</span>${esc(id.replace(/[-_]/g, " "))}</span>`).join("")}
        </div>
        <div class="queue-name">${problem.number ? `<span class="muted">#${problem.number}</span> ` : ""}${esc(problem.title)}</div>
      </div>
      <div class="row gap-sm">
        <a class="btn btn-ghost btn-sm" href="${esc(problem.url)}" target="_blank" rel="noopener noreferrer">Open</a>
        ${isSaved
          ? `<span class="pill pill-good">saved</span>`
          : `<button class="btn btn-ghost btn-sm" data-save="${esc(problem.slug)}" data-testid="bank-save">Save</button>`}
        <!-- Browsing and wanting to work something now was a three-step detour:
             save it, switch to My bank, find it again, start. This does all of
             that in one click. -->
        <button class="btn btn-primary btn-sm" data-start-catalog="${esc(problem.slug)}"
                data-testid="bank-browse-start">Start</button>
      </div>
    </li>`;
}

/** The shared row keyboard, with the bank's own idea of what Enter means: a
 *  catalog problem has to be saved into your list before a session can be
 *  logged against it, which the shared default knows nothing about. */
function wireListKeyboard(root, store, actions, page) {
  wireListRows(root.querySelector("#bank-list"), {
    onActivate: (row, i) => {
      const entry = page[i];
      if (entry) startCatalogProblem(entry, store, actions);
    },
  });
}

/**
 * Begin a session on a catalog problem, saving it first if it is new.
 *
 * A problem has to exist in the user's own list before a session can be logged
 * against it, so saving is part of starting rather than a step they have to
 * know to do first. Shared by the per-row Start button and "Pick one for me",
 * which would otherwise be two copies of the same four-step dance.
 */
function startCatalogProblem(entry, store, actions) {
  const slug = entry.slug;
  const find = () => store.state.problems.find((p) => (p.catalogSlug || slugify(p.name)) === slug);
  if (!find()) {
    state.justSaved.add(slug);
    saveToBank(store, [entry]);
  }
  const problem = find();
  if (!problem) return;
  startSession(problem);
  actions.switchTab("workspace");
}

/** Both the browse and "my bank" screens render the same mode switch, so the
 * handler lives here rather than being wired twice. */
function switchMode(mode, actions) {
  state.mode = mode;
  state.justSaved.clear();
  actions.rerender();
}

function filtered(appState, saved) {
  const q = state.search.trim().toLowerCase();
  return state.catalog.problems.filter((p) => {
    if (!matchesPattern(p, state.pattern)) return false;
    if (state.difficulty && p.difficulty !== state.difficulty) return false;
    if (state.hideSaved && saved.has(p.slug) && !state.justSaved.has(p.slug)) return false;
    if (!q) return true;
    return p.title.toLowerCase().includes(q) || String(p.number ?? "").includes(q);
  });
}

function wire(root, store, actions, matches, saved, page) {
  root.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => { switchMode(btn.dataset.mode, actions); });
  });

  const onFilterChange = (key) => (e) => {
    state[key] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    state.shown = PAGE_SIZE;
    // Changing a filter is asking for the list to be rebuilt, so the
    // just-saved exemption has served its purpose and shouldn't leak into the
    // next set of results.
    state.justSaved.clear();
    actions.rerender();
  };
  root.querySelector("#bank-pattern").addEventListener("change", onFilterChange("pattern"));
  root.querySelector("#bank-difficulty").addEventListener("change", onFilterChange("difficulty"));
  root.querySelector("#bank-hide-saved").addEventListener("change", onFilterChange("hideSaved"));
  root.querySelector("#bank-sort").addEventListener("change", onFilterChange("sort"));

  root.querySelector("#bank-surprise")?.addEventListener("click", () => {
    const chosen = pickOne(matches);
    if (!chosen) return;
    // Starting it outright rather than scrolling to it: the point of asking
    // for one is to stop deciding, and a highlighted row is another decision.
    startCatalogProblem(chosen, store, actions);
  });

  // Typing shouldn't re-render the whole list on every keystroke, and it must
  // not steal focus back to the top of the page.
  const search = root.querySelector("#bank-search");
  let timer = null;
  search.addEventListener("input", (e) => {
    clearTimeout(timer);
    const value = e.target.value;
    timer = setTimeout(() => {
      state.search = value;
      state.shown = PAGE_SIZE;
      state.justSaved.clear();
      actions.rerender();
      const box = document.querySelector("#bank-search");
      if (box) {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      }
    }, 250);
  });

  const more = root.querySelector("#bank-more");
  if (more) {
    more.addEventListener("click", () => {
      state.shown += PAGE_SIZE;
      actions.rerender();
    });
  }

  root.querySelectorAll("[data-save]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const problem = state.catalog.problems.find((p) => p.slug === btn.dataset.save);
      if (!problem) return;
      // Recorded before the save, because saveToBank re-renders synchronously
      // and filtered() reads this on the way through.
      //
      // No DOM poking afterwards either: rowHtml already draws the "saved"
      // pill from state, and the button we were clicked from is detached by
      // the time this handler returns.
      state.justSaved.add(problem.slug);
      saveToBank(store, [problem]);
    });
  });

  wireListKeyboard(root, store, actions, page);

  root.querySelectorAll("[data-start-catalog]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = state.catalog.problems.find((p) => p.slug === btn.dataset.startCatalog);
      if (entry) startCatalogProblem(entry, store, actions);
    });
  });

  const bulk = root.querySelector("#bank-bulk");
  if (bulk) {
    bulk.addEventListener("click", () => {
      const room = MAX_BANK_SIZE - backlogProblems(store.state).length;
      const batch = matches.filter((p) => !saved.has(p.slug)).slice(0, Math.min(BULK_LIMIT, room));
      if (!batch.length) {
        toast("Everything matching is already saved.");
        return;
      }
      saveToBank(store, batch);
      toast(`Saved ${batch.length} problems to your bank. Nothing changes until you start one — whenever you feel like it.`);
      actions.rerender();
    });
  }
}

/**
 * Save catalog problems into the user's own list, as backlog.
 *
 * One mutate() for the whole batch rather than one per problem: each call
 * re-renders and schedules a debounced push to GitHub, so saving 50 problems
 * individually would mean 50 renders and a burst of writes.
 */
function saveToBank(store, problems) {
  store.mutate((s) => {
    const existing = new Set(s.problems.map((p) => p.catalogSlug || slugify(p.name)));
    let room = MAX_BANK_SIZE - s.problems.filter((p) => p.status === STATUS_BACKLOG).length;
    for (const problem of problems) {
      if (room <= 0) break;
      if (existing.has(problem.slug)) continue;
      existing.add(problem.slug);
      room--;
      s.problems.push(problemFromCatalog(problem, {
        id: uid(),
        status: STATUS_BACKLOG,
        nextReviewDate: null, // unscheduled until it's actually worked
      }));
    }
  }, `Ledger: save ${problems.length} problem${problems.length === 1 ? "" : "s"} to bank`);
}

