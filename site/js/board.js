// What is on a whiteboard, and where — with no canvas in sight.
//
// Where this fits: pure geometry and data, below whiteboard.js, which draws it,
// and beside session-log.js, which syncs it. Split out when the board grew past
// freehand strokes: hit-testing, elementBounds and coordinate maths are exactly
// the kind of thing that is miserable to debug through a canvas and trivial to
// test on its own.
//
// Three decisions shape everything here.
//
// **Coordinates are logical, not pixels.** The original board stored points in
// device pixels of whatever canvas drew them, which is fine until the same
// drawing opens somewhere else: a diagram made on a retina tablet rendered at
// half scale on a laptop, and a pane dragged narrower squashed everything in
// it. Elements are stored in a space that is BOARD_WIDTH units across, and the
// canvas maps that to its own size on the way in and out. Nothing stored knows
// how big any screen is, or where the view happens to be panned to.
//
// **Everything is an element.** A freehand stroke, an arrow, a paragraph and an
// array diagram are the same kind of thing with different `kind`s, so undo,
// selection, moving, resizing, deletion, serialization and sync each have one
// implementation rather than one per tool.
//
// **Everything is a box.** Every element reports elementBounds, and resizing is
// one operation — map the points from the old box into the new one — rather
// than a rule per shape. Text became a box for this reason: as a bare anchor
// point it could not be resized, wrapped, or clicked accurately, and it was the
// only element that needed its own everything.

/** The logical width of the board. Height is whatever the pane's aspect gives,
 *  in the same units, so proportions survive a resize and a different screen. */
export const BOARD_WIDTH = 1000;

/** Elements, and how many points define each. */
export const ELEMENT_KINDS = {
  pen: { points: "many", label: "Pen" },
  line: { points: 2, label: "Line" },
  arrow: { points: 2, label: "Arrow" },
  rect: { points: 2, label: "Box" },
  ellipse: { points: 2, label: "Circle" },
  // Two points, not one: a text element is the box its words wrap inside, which
  // is what makes it resizable and accurately clickable like everything else.
  text: { points: 2, label: "Text" },
  // An array or a grid: the single most-drawn thing in a coding interview, and
  // the most tedious to produce freehand under time pressure.
  cells: { points: 2, label: "Array" },
};

/** How close a click has to be to count as hitting something, in board units. */
export const HIT_SLOP = 10;

/** Nothing may be resized smaller than this, in board units. A zero-width box
 *  cannot be grabbed again, so it would be a way to lose work by accident. */
export const MIN_SIZE = 6;

/** Default type size, in board units, for a new text element. */
export const DEFAULT_FONT_SIZE = 22;

/** Line spacing, as a multiple of the font size. Shared with the DOM editor
 *  that overlays the canvas while you type, which is the only way the caret
 *  can sit exactly where the drawn glyph will. */
export const LINE_HEIGHT = 1.3;

export function makeElement(kind, {
  id, color, width = 3, points = [], text = "", cols = 8, rows = 1,
  fontSize = DEFAULT_FONT_SIZE,
} = {}) {
  return {
    id, kind, color, width, points,
    ...(kind === "text" ? { text, fontSize } : {}),
    ...(kind === "cells" ? { cols, rows } : {}),
  };
}

/** A view that has not been panned or zoomed. */
const IDENTITY_VIEW = Object.freeze({ scale: 1, x: 0, y: 0 });

/** How far in and out the board may be zoomed. Past these it stops being a
 *  drawing surface: too far out to aim, or too far in to find anything. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Screen pixels to board units.
 *
 * The scale comes from width alone, so x and y share it and nothing is
 * stretched. `view` is the pan and zoom: pan is stored in board units, so a
 * viewport means the same thing whatever size the pane happens to be.
 */
export function toBoard(point, rectWidth, view = IDENTITY_VIEW) {
  const unit = (rectWidth || 1) / BOARD_WIDTH;
  const k = unit * (view.scale || 1);
  return { x: point.x / k + (view.x || 0), y: point.y / k + (view.y || 0) };
}

export function toScreen(point, rectWidth, view = IDENTITY_VIEW) {
  const unit = (rectWidth || 1) / BOARD_WIDTH;
  const k = unit * (view.scale || 1);
  return { x: (point.x - (view.x || 0)) * k, y: (point.y - (view.y || 0)) * k };
}

/**
 * Zoom about a point on screen, keeping whatever is under it under it.
 *
 * The alternative — zooming about the centre — means every zoom is followed by
 * a pan to get back to what you were looking at, which is most of why a board
 * feels unwieldy.
 */
export function zoomAt(view, screenPoint, factor, rectWidth) {
  const scale = clamp((view.scale || 1) * factor, MIN_ZOOM, MAX_ZOOM);
  if (scale === view.scale) return view;
  const before = toBoard(screenPoint, rectWidth, view);
  const after = toBoard(screenPoint, rectWidth, { ...view, scale });
  return { scale, x: (view.x || 0) + (before.x - after.x), y: (view.y || 0) + (before.y - after.y) };
}

/** Pan by a distance measured in screen pixels. */
export function panBy(view, dxPx, dyPx, rectWidth) {
  const unit = (rectWidth || 1) / BOARD_WIDTH;
  const k = unit * (view.scale || 1);
  return { ...view, x: (view.x || 0) - dxPx / k, y: (view.y || 0) - dyPx / k };
}

// ---------- boxes ----------

/** A box with positive width and height, whichever corners it was given. */
export function normalizeBounds(b) {
  return {
    x: Math.min(b.x, b.x + b.w),
    y: Math.min(b.y, b.y + b.h),
    w: Math.abs(b.w),
    h: Math.abs(b.h),
  };
}

/** The box an element occupies, for hit-testing, resizing and drawing a
 *  selection. Every kind answers this, which is what lets one resize
 *  implementation serve all of them. */
export function elementBounds(el) {
  const pts = el.points || [];
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The box around everything — for zoom-to-fit, and for a multiple selection. */
export function boundsOf(elements) {
  const boxes = elements.map(elementBounds).filter(Boolean);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x, y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

// ---------- resize handles ----------

/** The eight grips, clockwise from the top left. */
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Which grips an element offers.
 *
 * Text is the exception, and deliberately: its height is whatever its words
 * need once they have wrapped, so a grip that sets the height would be a
 * control whose effect is immediately overwritten. Its corners scale the type
 * and its sides set the wrap width, which between them are the two things
 * anyone actually wants to do to a paragraph. */
export function handlesFor(el) {
  return el?.kind === "text" ? ["nw", "ne", "se", "sw", "e", "w"] : HANDLES;
}

/** Where each grip sits on a box. */
export function handlePositions(bounds, el = null) {
  const { x, y, w, h } = bounds;
  const all = {
    nw: { x, y }, n: { x: x + w / 2, y }, ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 }, se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h }, sw: { x, y: y + h }, w: { x, y: y + h / 2 },
  };
  return handlesFor(el).map((id) => ({ id, ...all[id] }));
}

/** The grip under a point, or null. `slop` is in board units, so the caller
 *  scales it by the zoom to keep the grab area a constant size on screen. */
export function handleAt(bounds, point, slop = HIT_SLOP, el = null) {
  for (const h of handlePositions(bounds, el)) {
    if (Math.abs(point.x - h.x) <= slop && Math.abs(point.y - h.y) <= slop) return h.id;
  }
  return null;
}

/**
 * The box that results from dragging one grip to a point.
 *
 * Stateless on purpose: it takes the box as it was when the drag *started* and
 * the pointer's position now, so every move recomputes from the same origin.
 * An incremental version accumulates its own rounding, and drags the shape
 * away under a pointer that has not moved.
 */
export function resizeBounds(start, handle, point, { keepAspect = false } = {}) {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;

  if (handle.includes("n")) top = point.y;
  if (handle.includes("s")) bottom = point.y;
  if (handle.includes("w")) left = point.x;
  if (handle.includes("e")) right = point.x;

  // Corners only: a side grip has one free axis and nothing to hold in ratio.
  const isCorner = handle.length === 2;
  if (keepAspect && isCorner && start.w > 0 && start.h > 0) {
    const ratio = start.h / start.w;
    const w = Math.abs(right - left);
    const h = Math.abs(bottom - top);
    // Follow whichever axis the pointer moved further along, so the shape
    // tracks the hand rather than snapping between two interpretations.
    if (w * ratio > h) {
      const signed = (w * ratio) * Math.sign(bottom - top || 1);
      if (handle.includes("n")) top = bottom - signed; else bottom = top + signed;
    } else {
      const signed = (h / ratio) * Math.sign(right - left || 1);
      if (handle.includes("w")) left = right - signed; else right = left + signed;
    }
  }

  const box = normalizeBounds({ x: left, y: top, w: right - left, h: bottom - top });
  // A grip that has been dragged through the opposite edge gives a flat box.
  // Flat is unrecoverable — there is nothing left to grab — so it stops here.
  // A line is exempt on the axis it has no extent along to begin with.
  return {
    x: box.x, y: box.y,
    w: start.w === 0 ? 0 : Math.max(MIN_SIZE, box.w),
    h: start.h === 0 ? 0 : Math.max(MIN_SIZE, box.h),
  };
}

/**
 * The same element, with its points mapped from one box into another.
 *
 * One function for every kind, which is the whole reason elementBounds exists.
 * An axis the element has no extent along — a horizontal line's height — is
 * translated rather than scaled, because the alternative is a division by zero
 * and a shape full of NaN that never draws again.
 */
export function scaleElement(el, from, to) {
  const kx = from.w === 0 ? 1 : to.w / from.w;
  const ky = from.h === 0 ? 1 : to.h / from.h;
  const points = (el.points || []).map((p) => ({
    x: to.x + (p.x - from.x) * kx,
    y: to.y + (p.y - from.y) * ky,
  }));
  const next = { ...el, points };
  // Type scales with its box, so a corner drag on a paragraph enlarges the
  // words rather than reflowing the same size into a bigger frame. A side grip
  // leaves the size alone, which is how the wrap width gets changed on its own.
  if (el.kind === "text" && kx !== 1 && ky !== 1) {
    next.fontSize = Math.max(4, (el.fontSize || DEFAULT_FONT_SIZE) * Math.min(kx, ky));
  }
  return next;
}

// ---------- text ----------

/**
 * Break a string into the lines it will occupy inside a given width.
 *
 * `measure` is supplied by the caller — the canvas knows its own font metrics
 * and this file has no canvas. Keeping it a parameter is also what makes
 * wrapping testable: a monospace stub is exact, so the tests pin the algorithm
 * rather than the font.
 *
 * Explicit newlines are kept. A single word longer than the box is broken
 * across lines rather than allowed to run out of it, because a box you cannot
 * read the end of is worse than a broken word.
 */
export function wrapText(text, maxWidth, measure) {
  const out = [];
  for (const paragraph of String(text ?? "").split("\n")) {
    if (paragraph === "") { out.push(""); continue; }
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth || !line) {
        // A word that does not fit even alone is broken by character.
        if (!line && measure(candidate) > maxWidth) {
          let chunk = "";
          for (const ch of candidate) {
            if (chunk && measure(chunk + ch) > maxWidth) { out.push(chunk); chunk = ch; }
            else chunk += ch;
          }
          line = chunk;
          continue;
        }
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** How tall a wrapped paragraph is, in board units. */
export function textHeight(lineCount, fontSize) {
  return Math.max(1, lineCount) * fontSize * LINE_HEIGHT;
}

/**
 * A text element resized to exactly contain its own words.
 *
 * Height is always derived rather than stored: a box that is taller than its
 * contents has dead space you can click but not see, and one that is shorter
 * hides the last line. Width is left alone — that is the wrap width, and it is
 * the thing the side grips and the drag that created the box are setting.
 */
export function fitTextBox(el, measure) {
  const b = elementBounds(el);
  if (!b) return el;
  const size = el.fontSize || DEFAULT_FONT_SIZE;
  const lines = wrapText(el.text, Math.max(MIN_SIZE, b.w), measure);
  const h = textHeight(lines.length, size);
  return { ...el, points: [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + h }] };
}

// ---------- reading boards written by older versions ----------

/**
 * Bring one stored element up to the current shape.
 *
 * Text used to be a single anchor point with its size taken from the stroke
 * width, which is what made it impossible to resize, wrap or click accurately.
 * Boards drawn that way are in people's repos and in their session logs, so
 * they are converted on the way in rather than being allowed to render as an
 * element with half its geometry missing.
 */
export function migrateElement(el) {
  if (!el || typeof el !== "object" || !Array.isArray(el.points)) return null;
  if (el.kind !== "text") return el;

  const fontSize = el.fontSize || (el.width || 3) * 6;
  if (el.points.length >= 2) return { ...el, fontSize };

  const anchor = el.points[0];
  if (!anchor) return null;
  // The old anchor was a baseline, so the box that replaces it sits above the
  // point the way the drawn glyphs did. Width is estimated from the string,
  // which is what the old bounds did too — it only has to be close enough to
  // grab, and the first edit re-fits it exactly.
  const w = Math.max(40, String(el.text || "").length * fontSize * 0.62);
  const h = fontSize * LINE_HEIGHT;
  return {
    ...el, fontSize,
    points: [{ x: anchor.x, y: anchor.y - h * 0.8 }, { x: anchor.x + w, y: anchor.y + h * 0.2 }],
  };
}

/** Every element of a stored board, brought up to date and stripped of
 *  anything that is not an element at all. */
export function migrateBoard(saved) {
  if (!Array.isArray(saved)) return [];
  return saved.map(migrateElement).filter(Boolean);
}

// ---------- labels and connectors ----------
//
// A design diagram is boxes with names joined by arrows that mean something.
// Before this, a name was a separate text element laid over a box, and an
// arrow was two loose points: move the box and its name stayed behind, and its
// arrows pointed at where it used to be. Redrawing every arrow after every
// rearrangement is most of why the board was slower than a sheet of paper.
//
// So a box, a circle, an arrow or a line can carry a `label`, drawn inside it
// (or on the arrow's midpoint), and an arrow or line can be attached by either
// end to a shape: `start: { id }`, `end: { id }`. An attached end is not stored
// so much as derived — routeConnector() puts it on the shape's edge, aimed at
// the other end — so moving, resizing, undoing and syncing a shape all carry
// its arrows with it without the arrows needing their own history.

/** Kinds that can be joined by an arrow or line. */
export const CONNECTOR_KINDS = new Set(["arrow", "line"]);
/** Kinds an arrow can be attached to. */
const BINDABLE_KINDS = new Set(["rect", "ellipse", "text", "cells"]);
/** Kinds that can carry a label of their own. */
export const LABEL_KINDS = new Set(["rect", "ellipse", "arrow", "line"]);
/** A label's type size, in board units, unless the element sets its own. */
export const LABEL_FONT_SIZE = 18;
/** How near a shape an arrow's end has to land to attach to it, in board units. */
const BIND_SLOP = 16;
/** Space between an attached arrowhead and the shape's outline, so the head
 *  reads as pointing at the box rather than being swallowed by its stroke. */
export const CONNECTOR_GAP = 6;

const hasLabel = (el) => typeof el.label === "string" && el.label.trim() !== "";

/** The centre of an element's box. */
export function centerOf(el) {
  const b = elementBounds(el);
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
}

/**
 * Where a line from a shape's centre towards a point leaves the shape, pushed
 * out by `gap`. Ellipses use the ellipse; everything else its box.
 */
export function edgePoint(shape, toward, gap = CONNECTOR_GAP) {
  const b = elementBounds(shape);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  let t;
  if (shape.kind === "ellipse") {
    const rx = b.w / 2 + gap;
    const ry = b.h / 2 + gap;
    t = 1 / Math.hypot(dx / rx, dy / ry);
  } else {
    const hw = b.w / 2 + gap;
    const hh = b.h / 2 + gap;
    t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  }
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** The topmost shape an arrow end at this point would attach to, or null. */
export function bindableAt(elements, point, { excludeId = null, slop = BIND_SLOP } = {}) {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.id === excludeId || !BINDABLE_KINDS.has(el.kind)) continue;
    const b = elementBounds(el);
    if (b && point.x >= b.x - slop && point.x <= b.x + b.w + slop
      && point.y >= b.y - slop && point.y <= b.y + b.h + slop) return el;
  }
  return null;
}

/**
 * A connector with its attached ends put back on their shapes.
 *
 * Each attached end sits on its shape's edge, aimed at the other end's shape
 * centre (or at the other end itself, when that one is free). An attachment to
 * a shape that no longer exists is ignored, and the stored point stands — so an
 * arrow whose box was deleted stays where it was rather than vanishing, and
 * re-attaches if the deletion is undone.
 */
export function routeConnector(conn, byId) {
  if (!CONNECTOR_KINDS.has(conn.kind) || (conn.points || []).length < 2) return conn;
  const s = conn.start ? byId.get(conn.start.id) : null;
  const e = conn.end ? byId.get(conn.end.id) : null;
  if (!s && !e) return conn;
  if (s && e && s.id === e.id) return conn;     // a loop onto itself has no direction
  let [a, b] = [conn.points[0], conn.points[conn.points.length - 1]];
  const aimA = e ? centerOf(e) : b;
  const aimB = s ? centerOf(s) : a;
  if (s) a = edgePoint(s, aimA);
  if (e) b = edgePoint(e, aimB);
  return { ...conn, points: [a, b] };
}

/**
 * Attach a connector's ends to whatever shapes they now touch, and route it.
 *
 * Called when an arrow is drawn, and again when one is dragged or reshaped on
 * its own: an end dropped on a box attaches to it, an end pulled off a box
 * comes free. Ends are judged by the stored points, which is why a free end is
 * never stolen by a shape it merely passes near on the way.
 */
export function bindConnector(conn, elements, slop = BIND_SLOP) {
  if (!CONNECTOR_KINDS.has(conn.kind) || (conn.points || []).length < 2) return conn;
  const a = conn.points[0];
  const b = conn.points[conn.points.length - 1];
  const s = bindableAt(elements, a, { excludeId: conn.id, slop });
  const e = bindableAt(elements, b, { excludeId: conn.id, slop });
  const { start: _s, end: _e, ...rest } = conn;
  const next = {
    ...rest,
    ...(s ? { start: { id: s.id } } : {}),
    ...(e && (!s || e.id !== s.id) ? { end: { id: e.id } } : {}),
  };
  return routeConnector(next, new Map(elements.map((el) => [el.id, el])));
}

/**
 * The connectors attached to any of `ids`, re-routed against `elements` —
 * by default only those whose position actually changed.
 *
 * The one place "a shape moved, so its arrows follow" is decided — after a
 * drag, a resize, an undo, a nudge or a change that arrived from another device.
 * `onlyMoved: false` returns every attached connector: a drag has already
 * moved its arrows live, so at the end nothing looks changed, and yet the
 * other device has still to be told where they went.
 */
export function followersOf(elements, ids, { onlyMoved = true } = {}) {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const out = [];
  for (const el of elements) {
    if (!CONNECTOR_KINDS.has(el.kind)) continue;
    if (!ids.has(el.start?.id) && !ids.has(el.end?.id)) continue;
    const routed = routeConnector(el, byId);
    if (!onlyMoved || !samePoints(routed.points, el.points)) out.push(routed);
  }
  return out;
}

const samePoints = (a, b) => a.length === b.length
  && a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-6 && Math.abs(p.y - b[i].y) < 1e-6);

/** Where a label is centred: in the middle of a shape, halfway along a connector. */
export function labelAnchor(el) {
  const pts = el.points || [];
  if (CONNECTOR_KINDS.has(el.kind) && pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return centerOf(el);
}

/** The width a label may wrap to: the shape less some padding, or a fixed
 *  measure along a connector, which has no width of its own. */
export function labelWidth(el) {
  if (CONNECTOR_KINDS.has(el.kind)) return 160;
  const b = elementBounds(el);
  return Math.max(MIN_SIZE, (b ? b.w : 0) - 16);
}

/** The topmost box or circle whose inside contains a point — for double-click
 *  and the text tool, which name the shape you click in rather than stacking a
 *  loose label over it. */
export function containerAt(elements, point) {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.kind !== "rect" && el.kind !== "ellipse") continue;
    const b = elementBounds(el);
    if (b && point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return el;
  }
  return null;
}

// ---------- hit-testing ----------

const near = (a, b, slop) => Math.abs(a - b) <= slop;

/** Distance from a point to a segment — the workhorse of hit-testing a stroke. */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Is this point on this element?
 *
 * Outlines are hit on their edge rather than their fill, deliberately. A box
 * drawn round a diagram would otherwise swallow every click inside it, and the
 * thing you meant to grab is almost always the thing you can see.
 */
export function hitsElement(el, point, slop = HIT_SLOP) {
  const pts = el.points || [];
  if (!pts.length) return false;

  switch (el.kind) {
    case "pen":
    case "line":
    case "arrow": {
      for (let i = 1; i < pts.length; i++) {
        if (distanceToSegment(point, pts[i - 1], pts[i]) <= slop) return true;
      }
      return pts.length === 1 && Math.hypot(point.x - pts[0].x, point.y - pts[0].y) <= slop;
    }
    // A paragraph is a solid thing you point at, not an outline whose edge has
    // to be found. Everything else below is hit on its stroke.
    case "text": {
      const b = elementBounds(el);
      return point.x >= b.x - slop && point.x <= b.x + b.w + slop
        && point.y >= b.y - slop && point.y <= b.y + b.h + slop;
    }
    case "rect":
    case "cells": {
      const b = elementBounds(el);
      const insideX = point.x >= b.x - slop && point.x <= b.x + b.w + slop;
      const insideY = point.y >= b.y - slop && point.y <= b.y + b.h + slop;
      if (!insideX || !insideY) return false;
      // On the edge, not in the middle — unless it has a name. A named box is a
      // thing in the diagram, grabbed anywhere; an unnamed one is usually a
      // frame drawn round other things, which its middle must not swallow.
      return near(point.x, b.x, slop) || near(point.x, b.x + b.w, slop)
        || near(point.y, b.y, slop) || near(point.y, b.y + b.h, slop)
        || el.kind === "cells"    // a grid's interior lines make it all edge
        || hasLabel(el);
    }
    case "ellipse": {
      const b = elementBounds(el);
      const rx = b.w / 2;
      const ry = b.h / 2;
      if (rx <= 0 || ry <= 0) return false;
      const nx = (point.x - (b.x + rx)) / rx;
      const ny = (point.y - (b.y + ry)) / ry;
      const d = Math.hypot(nx, ny);
      const edge = slop / Math.min(rx, ry);
      return Math.abs(d - 1) <= edge || (hasLabel(el) && d <= 1);
    }
    default:
      return false;
  }
}

/** The topmost element under a point — last drawn wins, which is what you see. */
export function elementAt(elements, point, slop = HIT_SLOP) {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitsElement(elements[i], point, slop)) return elements[i];
  }
  return null;
}

export function movedBy(el, dx, dy) {
  return { ...el, points: (el.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

/**
 * Straighten a two-point shape to the nearest axis or diagonal.
 *
 * Held with shift, and applied to arrows by default at a tight angle. A wobbly
 * hand-drawn arrow between two boxes reads as a mistake; the whole reason to
 * have an arrow tool rather than freehand is that it comes out straight.
 */
export function snapToAngle(from, to, { angles = 8 } = {}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return to;
  const step = (Math.PI * 2) / angles;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
}

/**
 * The lines of an array or grid, given its two corners.
 *
 * Returned as geometry rather than drawn here, so the same definition serves
 * the canvas, a hit-test and any future export. Cells are equal width, which is
 * what an array diagram wants — an index is not wider because its number is.
 */
export function cellLines(el) {
  const b = elementBounds(el);
  const cols = Math.max(1, el.cols || 1);
  const rows = Math.max(1, el.rows || 1);
  const lines = [];
  for (let c = 0; c <= cols; c++) {
    const x = b.x + (b.w * c) / cols;
    lines.push([{ x, y: b.y }, { x, y: b.y + b.h }]);
  }
  for (let r = 0; r <= rows; r++) {
    const y = b.y + (b.h * r) / rows;
    lines.push([{ x: b.x, y }, { x: b.x + b.w, y }]);
  }
  return lines;
}

/** Where each cell's index label goes, for an array drawn as a single row. */
export function cellLabels(el) {
  const b = elementBounds(el);
  const cols = Math.max(1, el.cols || 1);
  const rows = Math.max(1, el.rows || 1);
  if (rows !== 1) return [];
  const out = [];
  for (let c = 0; c < cols; c++) {
    out.push({ index: c, x: b.x + (b.w * (c + 0.5)) / cols, y: b.y + b.h + el.width * 4 });
  }
  return out;
}

/**
 * An undo stack of reversible steps.
 *
 * Here rather than inside the canvas because the bug it had was pure logic and
 * a canvas made it invisible: undo pushed the inverse of the inverse, so redo
 * re-applied the *undo* — putting a deleted box back and then adding a second
 * copy of it. Nothing about that needed a drawing surface to go wrong, and
 * nothing about it needs one to be checked.
 *
 * `recording` is the whole mechanism. A reversal calls the same add/remove
 * functions an ordinary action does, so without suppressing it each undo would
 * record itself as a new step and the stack would never empty.
 */
export function createHistory() {
  const past = [];
  const future = [];
  let recording = true;

  const run = (fn) => {
    recording = false;
    try { fn(); } finally { recording = true; }
  };

  return {
    /** Remember a step. Ignored while undoing or redoing. */
    record(entry) {
      if (!recording) return;
      past.push(entry);
      // A new action makes the redo stack meaningless: you cannot replay a
      // future that no longer follows from here.
      future.length = 0;
    },
    undo() {
      const entry = past.pop();
      if (!entry) return false;
      run(entry.undo);
      future.push(entry);
      return true;
    },
    redo() {
      const entry = future.pop();
      if (!entry) return false;
      run(entry.redo);
      past.push(entry);
      return true;
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}
