// Draggable pane splitters for the session workspace.
//
// Where this fits: the workspace lays its panes out as a CSS grid whose column
// widths are fractions of the row. This module owns those fractions — the
// arithmetic of moving one, the clamping that stops a pane collapsing to
// nothing, and the persistence so a layout you set once survives the next
// session.
//
// Why it's a module and not a few lines in the view: the workspace has a hard
// rule that nothing may re-render while CodeMirror and the whiteboard are
// mounted, because rebuilding the markup destroys them and loses whatever was
// typed or drawn. So resizing has to work by writing styles onto live nodes,
// never by re-rendering — and that is exactly the kind of imperative DOM code
// that is easiest to get subtly wrong and hardest to test. The arithmetic is
// therefore pulled out as pure functions that can be pinned directly, and the
// DOM layer below them stays thin enough to read in one go.

import { storageKey } from "./channel.js";

/** Smallest a pane may be dragged to, as a fraction of the row. Below roughly
 * this, a code pane is too narrow to read a line of code in and the drag stops
 * feeling like resizing and starts feeling like closing. */
export const MIN_PANE = 0.12;

const STORE_KEY = storageKey("ledger.workspace.panes");

/**
 * Move one splitter, taking the space from the pane on one side and giving it
 * to the pane on the other.
 *
 * Only the two panes either side of the splitter change, which is what makes a
 * drag feel local: panes further along stay exactly where the user put them
 * rather than all shuffling at once.
 *
 * Returns a new array; the input is not modified. If the pair has too little
 * room between them to honour `min` on both sides, the sizes come back
 * unchanged rather than forcing one pane below the minimum.
 */
export function resizePanes(sizes, index, delta, min = MIN_PANE) {
  if (index < 0 || index + 1 >= sizes.length) return [...sizes];
  const pair = sizes[index] + sizes[index + 1];
  if (pair < min * 2) return [...sizes];
  const next = [...sizes];
  next[index] = clamp(sizes[index] + delta, min, pair - min);
  next[index + 1] = pair - next[index];
  return next;
}

/**
 * Re-spread sizes over a changed set of visible panes.
 *
 * Showing or hiding the whiteboard changes how many panes share the row. The
 * panes that stay keep their proportions relative to each other, so toggling
 * the board off and back on returns the layout to roughly where it was instead
 * of resetting it to even columns and discarding a deliberate arrangement.
 */
export function redistribute(sizes, visible, fallback) {
  // A hidden pane is stored at zero, so a pane coming back has no width to
  // carry over and has to be given its default share — otherwise showing the
  // whiteboard again would add a column of nothing.
  const shown = visible.map((v, i) => {
    if (!v) return 0;
    return sizes[i] > 0 ? sizes[i] : fallback[i];
  });
  const total = shown.reduce((s, v) => s + v, 0);
  if (total <= 0) {
    // Nothing carried over, so fall back to the defaults for whatever is
    // visible rather than dividing by zero.
    const fallbackTotal = visible.reduce((s, v, i) => s + (v ? fallback[i] : 0), 0) || 1;
    return visible.map((v, i) => (v ? fallback[i] / fallbackTotal : 0));
  }
  return shown.map((v) => v / total);
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/** Grid track list for a row of panes, with a splitter between each visible
 * pair. Hidden panes contribute no track at all — a zero-width column would
 * still show its border and its splitter. */
export function gridTemplate(sizes, visible, splitterPx = 8) {
  const parts = [];
  visible.forEach((isVisible, i) => {
    if (!isVisible) return;
    if (parts.length) parts.push(`${splitterPx}px`);
    parts.push(`${(sizes[i] * 100).toFixed(3)}%`);
  });
  return parts.join(" ");
}

export function loadSizes(fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!Array.isArray(raw) || raw.length !== fallback.length) return [...fallback];
    if (!raw.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) return [...fallback];
    return raw;
  } catch (_) {
    return [...fallback];
  }
}

function saveSizes(sizes) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(sizes));
  } catch (_) {
    // A layout preference is not worth failing a session over.
  }
}

/**
 * Wire a row of panes and the splitters between them.
 *
 * `apply(sizes)` is called on every change so the caller can write the grid
 * template and let anything mounted inside the panes know it has been resized.
 * Returns a teardown function; the workspace calls it when the session ends so
 * a stale pointer listener can't outlive the DOM it was dragging.
 */
export function installSplitters({ container, getSizes, setSizes, apply, min = MIN_PANE }) {
  const cleanups = [];

  container.querySelectorAll("[data-splitter]").forEach((handle) => {
    const index = Number(handle.dataset.splitter);

    const onPointerDown = (event) => {
      event.preventDefault();
      const rowWidth = container.getBoundingClientRect().width || 1;
      const startX = event.clientX;
      const startSizes = getSizes();
      // Capture keeps the drag alive when the pointer outruns the handle,
      // which it always does — without it the splitter stops the moment the
      // cursor crosses into the editor.
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("dragging");

      const onMove = (move) => {
        const delta = (move.clientX - startX) / rowWidth;
        const next = resizePanes(startSizes, index, delta, min);
        setSizes(next);
        apply(next);
      };
      const onUp = () => {
        handle.classList.remove("dragging");
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        saveSizes(getSizes());
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    };

    // A splitter that only responds to a drag is unreachable without a mouse,
    // so the arrow keys move it too.
    const onKeyDown = (event) => {
      const step = event.key === "ArrowLeft" ? -0.02 : event.key === "ArrowRight" ? 0.02 : 0;
      if (!step) return;
      event.preventDefault();
      const next = resizePanes(getSizes(), index, step, min);
      setSizes(next);
      apply(next);
      saveSizes(next);
    };

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("keydown", onKeyDown);
    cleanups.push(() => {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("keydown", onKeyDown);
    });
  });

  return () => cleanups.forEach((fn) => fn());
}
