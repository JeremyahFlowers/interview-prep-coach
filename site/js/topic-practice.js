// Practising a pattern from its topic page, from the whole catalog.
//
// Where it fits: renderTopicDetail (views.js) draws a pattern's page and hands
// this module an empty host. This fills it with catalog problems for the
// pattern that are not already in your list, easiest first, each one a click
// from a timed session.
//
// Why it exists: the page's "practice ladder" listed only problems you had
// already logged, so nine of the twenty-three patterns had a page you could
// read and nothing you could do from it — while the catalog has hundreds of
// problems for every one of them.
//
// Loaded on demand: the catalog is a few hundred kilobytes and is needed only
// once a topic page is open.

import { problemsForPattern, problemFromCatalog, savedSlugs, problemUrl } from "./catalog.js";
import { uid, STATUS_BACKLOG } from "./logic.js";
import { esc, toast } from "./ui.js";
import { startSession } from "./session-view.js";

/** How many of each difficulty to offer — a short ladder, not a list to scroll. */
export const LADDER_PER_DIFFICULTY = { Easy: 3, Medium: 4, Hard: 2 };
const DIFFICULTIES = Object.keys(LADDER_PER_DIFFICULTY);

/**
 * The rungs for one pattern: up to a few per difficulty, easiest first, none
 * you already track. Exported for the test; `find` is problemsForPattern.
 */
export async function ladderFor(patternId, owned, find = problemsForPattern) {
  const rungs = await Promise.all(DIFFICULTIES.map((difficulty) =>
    find(patternId, { difficulty, limit: LADDER_PER_DIFFICULTY[difficulty], exclude: owned })));
  return rungs.flat();
}

/**
 * Add a catalog problem to your list, if it is not there already, and return
 * the stored record.
 *
 * Added to the bank rather than the rotation: saving a session against it is
 * what schedules it (activateProblem), and a session discarded half a minute
 * in should not leave a review appointment behind.
 */
export function adoptCatalogProblem(store, entry, patternId) {
  const existing = store.state.problems.find((p) => p.catalogSlug === entry.slug);
  if (existing) return existing;
  const id = uid();
  store.mutate((s) => {
    if (savedSlugs(s.problems).has(entry.slug)) return;
    s.problems.push(problemFromCatalog(entry, { id, status: STATUS_BACKLOG, patternId }));
  }, `Ledger: add ${entry.title} from catalog`);
  return store.state.problems.find((p) => p.id === id || p.catalogSlug === entry.slug) || null;
}

const rowHtml = (entry) => `
  <li class="queue-item catalog-rung">
    <div class="catalog-rung-name">
      <strong>${esc(entry.title)}</strong>
      <span class="pill pill-muted">${esc(entry.difficulty || "Unrated")}</span>
      ${entry.number ? `<span class="muted small">#${entry.number}</span>` : ""}
    </div>
    <div class="row gap-sm">
      <a class="btn btn-ghost btn-xs" href="${esc(problemUrl({ catalogSlug: entry.slug }))}"
         target="_blank" rel="noopener noreferrer">Read &#8599;</a>
      <button type="button" class="btn btn-ghost btn-xs" data-rung-save="${esc(entry.slug)}">Save for later</button>
      <button type="button" class="btn btn-primary btn-xs" data-rung-start="${esc(entry.slug)}">Start</button>
    </div>
  </li>`;

/**
 * Fill `host` with the pattern's catalog ladder and wire it.
 *
 * `isCurrent` says whether the page is still the one that asked: the catalog
 * may arrive after you have moved on, and writing into a detached page is
 * wasted work at best.
 */
export async function renderCatalogLadder(host, store, actions, patternId, { isCurrent = () => true } = {}) {
  let rungs;
  try {
    rungs = await ladderFor(patternId, savedSlugs(store.state.problems));
  } catch (_) {
    if (isCurrent()) host.innerHTML = `<p class="muted small">The problem catalog couldn't be loaded, so
      there is nothing new to offer right now. Your own problems above are unaffected.</p>`;
    return;
  }
  if (!isCurrent()) return;
  if (!rungs.length) {
    host.innerHTML = `<p class="muted small">Every catalog problem for this pattern is already in your list.</p>`;
    return;
  }
  host.innerHTML = `
    <p class="muted small">New to you, easiest first. Start one and it joins your schedule when you save it.</p>
    <ul class="queue-list">${rungs.map(rowHtml).join("")}</ul>`;

  const bySlug = new Map(rungs.map((r) => [r.slug, r]));
  host.querySelectorAll("[data-rung-start]").forEach((b) => b.addEventListener("click", () => {
    const problem = adoptCatalogProblem(store, bySlug.get(b.dataset.rungStart), patternId);
    if (!problem) return;
    startSession(problem);
    actions.switchTab("workspace");
  }));
  host.querySelectorAll("[data-rung-save]").forEach((b) => b.addEventListener("click", () => {
    const entry = bySlug.get(b.dataset.rungSave);
    if (!adoptCatalogProblem(store, entry, patternId)) return;
    toast(`${entry.title} is in your bank.`);
  }));
}
