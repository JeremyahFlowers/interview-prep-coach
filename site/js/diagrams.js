// A small animated-diagram engine — not static pictures. Every diagram is a
// scripted sequence of frames (real example data, not abstract placeholders)
// with a caption per frame; pointers and highlights animate smoothly between
// frames via CSS transitions rather than jump-cutting, and the viewer drives
// the pace themselves (play/pause/step/reset), since the point is to let a
// concept land, not to autoplay past it.
//
// Four primitives cover every pattern in Topics: arrayDiagram (two pointers,
// sliding window, binary search, partitioning), stackDiagram (monotonic
// stack), gridDiagram (2D matrix walks, DP tables, bit grids), and
// graphDiagram (trees, tries, graphs — MST, topological sort, union-find).

const STEP_MS = 1600;

function el(tag, attrs = {}, ns = false) {
  const node = ns ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  return node;
}

/** Shared chrome: caption, progress dots, play/pause/step/reset. Every
 * primitive calls this once, gets back a canvas host to draw its SVG into
 * once, and a way to be notified when the frame index changes. */
function createPlayer(container, { title, steps }) {
  container.innerHTML = "";
  const wrap = el("div", { class: "diagram" });
  if (title) wrap.appendChild(el("p", { class: "diagram-title", text: title }));
  const canvasHost = el("div", { class: "diagram-canvas" });
  const caption = el("p", { class: "diagram-caption" });
  const controls = el("div", { class: "diagram-controls" });
  const resetBtn = el("button", { type: "button", class: "diagram-btn", "aria-label": "Restart", text: "⟲" });
  const playBtn = el("button", { type: "button", class: "diagram-btn diagram-btn-play", text: "▶" });
  const stepBtn = el("button", { type: "button", class: "diagram-btn", text: "Step" });
  const dots = el("div", { class: "diagram-dots" });
  for (let i = 0; i < steps.length; i++) dots.appendChild(el("span", { class: "diagram-dot" }));
  controls.append(resetBtn, playBtn, stepBtn, dots);
  wrap.append(canvasHost, caption, controls);
  container.appendChild(wrap);

  let index = 0;
  let playing = false;
  let timer = null;
  const listeners = [];

  function render() {
    caption.textContent = steps[index].caption;
    dots.querySelectorAll(".diagram-dot").forEach((d, i) => d.classList.toggle("active", i === index));
    listeners.forEach((fn) => fn(steps[index], index));
  }

  function stop() {
    playing = false;
    playBtn.textContent = "▶";
    clearInterval(timer);
  }

  function advance() {
    if (index >= steps.length - 1) {
      stop();
      return;
    }
    index++;
    render();
  }

  resetBtn.addEventListener("click", () => {
    stop();
    index = 0;
    render();
  });
  stepBtn.addEventListener("click", () => {
    stop();
    advance();
  });
  playBtn.addEventListener("click", () => {
    if (playing) {
      stop();
      return;
    }
    if (index >= steps.length - 1) index = 0;
    playing = true;
    playBtn.textContent = "⏸";
    timer = setInterval(advance, STEP_MS);
    render();
  });

  render();
  return {
    canvasHost,
    onFrame(fn) {
      listeners.push(fn);
      fn(steps[index], index);
    },
    destroy() {
      clearInterval(timer);
    },
  };
}

// ---------- Array with pointers ----------
// Two pointers, sliding window, binary search, partitioning — anything
// that's fundamentally "indices moving across a row of values."

export function arrayDiagram(container, { title, array, steps, pointerColors = {} }) {
  const player = createPlayer(container, { title, steps });
  const BOX = 38, GAP = 6, H = 92;
  const width = array.length * (BOX + GAP) - GAP;
  const svg = el("svg", { viewBox: `0 0 ${width} ${H}`, width: "100%", height: H, class: "diagram-svg" }, true);

  const boxes = array.map((v, i) => {
    const x = i * (BOX + GAP);
    const g = el("g", { transform: `translate(${x},28)` }, true);
    const rect = el("rect", { width: BOX, height: BOX, rx: 7, class: "diagram-box", "data-idx": i }, true);
    const text = el("text", { x: BOX / 2, y: BOX / 2 + 5, "text-anchor": "middle", class: "diagram-box-text", text: v }, true);
    g.append(rect, text);
    svg.appendChild(g);
    return { rect, text, x };
  });

  const pointerLayer = el("g", {}, true);
  svg.appendChild(pointerLayer);
  const pointerEls = {};

  function ensurePointer(name) {
    if (pointerEls[name]) return pointerEls[name];
    const color = pointerColors[name] || "var(--accent)";
    const g = el("g", { class: "diagram-pointer" }, true);
    g.appendChild(el("path", { d: "M0,0 L7,-9 L-7,-9 Z", fill: color }, true));
    g.appendChild(el("text", { x: 0, y: -13, "text-anchor": "middle", fill: color, class: "diagram-pointer-label", text: name }, true));
    pointerLayer.appendChild(g);
    pointerEls[name] = g;
    return g;
  }

  player.canvasHost.appendChild(svg);
  player.onFrame((frame) => {
    const highlight = new Set(frame.highlight || []);
    const active = new Set(Object.values(frame.pointers || {}));
    boxes.forEach((b, i) => {
      b.rect.classList.toggle("diagram-box-highlight", highlight.has(i));
      b.rect.classList.toggle("diagram-box-active", active.has(i));
      b.rect.classList.toggle("diagram-box-dim", frame.dim && frame.dim.includes(i));
      if (frame.values) b.text.textContent = frame.values[i];
    });
    const names = Object.keys(frame.pointers || {});
    Object.keys(pointerEls).forEach((n) => {
      if (!names.includes(n)) pointerEls[n].style.opacity = "0";
    });
    for (const name of names) {
      const g = ensurePointer(name);
      const idx = frame.pointers[name];
      g.style.opacity = "1";
      g.setAttribute("transform", `translate(${idx * (BOX + GAP) + BOX / 2}, 28)`);
    }
  });
  return player;
}

// ---------- Stack ----------
// Monotonic stack: a source row scanned left-to-right above a live stack
// that grows/shrinks below it.

export function stackDiagram(container, { title, array, steps }) {
  const player = createPlayer(container, { title, steps });
  const BOX = 36, GAP = 6, H = 190;
  const width = Math.max(array.length * (BOX + GAP) - GAP, 200);
  const svg = el("svg", { viewBox: `0 0 ${width} ${H}`, width: "100%", height: H, class: "diagram-svg" }, true);

  const source = array.map((v, i) => {
    const x = i * (BOX + GAP);
    const g = el("g", { transform: `translate(${x},4)` }, true);
    g.append(
      el("rect", { width: BOX, height: BOX, rx: 6, class: "diagram-box diagram-box-source" }, true),
      el("text", { x: BOX / 2, y: BOX / 2 + 5, "text-anchor": "middle", class: "diagram-box-text", text: v }, true)
    );
    svg.appendChild(g);
    return g;
  });
  const cursor = el("g", { class: "diagram-pointer" }, true);
  cursor.appendChild(el("path", { d: "M0,0 L7,-9 L-7,-9 Z", fill: "var(--accent)" }, true));
  svg.appendChild(cursor);

  const stackLayer = el("g", {}, true);
  svg.appendChild(stackLayer);

  player.canvasHost.appendChild(svg);
  player.onFrame((frame) => {
    cursor.style.opacity = frame.cursor == null ? "0" : "1";
    if (frame.cursor != null) cursor.setAttribute("transform", `translate(${frame.cursor * (BOX + GAP) + BOX / 2}, 4)`);
    source.forEach((g, i) => g.querySelector("rect").classList.toggle("diagram-box-dim", !!(frame.consumed && frame.consumed.includes(i))));

    stackLayer.innerHTML = "";
    (frame.stack || []).forEach((v, level) => {
      const y = H - 34 - level * (BOX + 4);
      const g = el("g", { transform: `translate(4,${y})`, class: "diagram-stack-item" }, true);
      g.append(
        el("rect", { width: BOX + 10, height: BOX, rx: 6, class: "diagram-box diagram-box-active" }, true),
        el("text", { x: (BOX + 10) / 2, y: BOX / 2 + 5, "text-anchor": "middle", class: "diagram-box-text", text: v }, true)
      );
      stackLayer.appendChild(g);
    });
  });
  return player;
}

// ---------- Grid ----------
// 2D matrix walks, DP tables, bit grids — an R x C grid of cells, each
// optionally labeled, with per-frame highlight/active/value updates.

export function gridDiagram(container, { title, rows, cols, steps, cellLabels }) {
  const player = createPlayer(container, { title, steps });
  const CELL = 34, GAP = 4;
  const width = cols * (CELL + GAP) - GAP;
  const height = rows * (CELL + GAP) - GAP + (cellLabels ? 16 : 0);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height: Math.min(height, 220), class: "diagram-svg" }, true);

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * (CELL + GAP);
      const y = r * (CELL + GAP) + (cellLabels ? 16 : 0);
      const g = el("g", { transform: `translate(${x},${y})` }, true);
      const rect = el("rect", { width: CELL, height: CELL, rx: 5, class: "diagram-box" }, true);
      const text = el("text", { x: CELL / 2, y: CELL / 2 + 5, "text-anchor": "middle", class: "diagram-box-text diagram-box-text-sm", text: "" }, true);
      g.append(rect, text);
      svg.appendChild(g);
      cells.push({ rect, text, r, c });
    }
  }
  if (cellLabels?.cols) {
    cellLabels.cols.forEach((label, c) => {
      svg.appendChild(el("text", { x: c * (CELL + GAP) + CELL / 2, y: 11, "text-anchor": "middle", class: "diagram-axis-label", text: label }, true));
    });
  }

  player.canvasHost.appendChild(svg);
  player.onFrame((frame) => {
    const key = (r, c) => `${r},${c}`;
    const highlight = new Set((frame.highlight || []).map(([r, c]) => key(r, c)));
    const active = new Set((frame.active || []).map(([r, c]) => key(r, c)));
    cells.forEach((cell) => {
      cell.rect.classList.toggle("diagram-box-highlight", highlight.has(key(cell.r, cell.c)));
      cell.rect.classList.toggle("diagram-box-active", active.has(key(cell.r, cell.c)));
      const v = frame.values?.[cell.r]?.[cell.c];
      cell.text.textContent = v == null ? "" : v;
    });
  });
  return player;
}

// ---------- Graph / tree ----------
// Fixed node positions (you hand-place them, since a force layout would just
// jitter for an 4-8 node teaching example), edges as lines, per-frame
// active/included state on both.

export function graphDiagram(container, { title, nodes, edges, steps, height = 180 }) {
  const player = createPlayer(container, { title, steps });
  const width = 320;
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, class: "diagram-svg" }, true);

  const edgeEls = {};
  for (const e of edges) {
    const a = nodes.find((n) => n.id === e.from);
    const b = nodes.find((n) => n.id === e.to);
    const line = el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "diagram-edge" }, true);
    svg.appendChild(line);
    edgeEls[`${e.from}-${e.to}`] = line;
    edgeEls[`${e.to}-${e.from}`] = line;
    if (e.label) {
      svg.appendChild(el("text", { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 4, class: "diagram-edge-label", "text-anchor": "middle", text: e.label }, true));
    }
  }
  const nodeEls = {};
  for (const n of nodes) {
    const g = el("g", { transform: `translate(${n.x},${n.y})` }, true);
    const circle = el("circle", { r: 15, class: "diagram-node" }, true);
    const text = el("text", { y: 5, "text-anchor": "middle", class: "diagram-node-text", text: n.label ?? n.id }, true);
    g.append(circle, text);
    svg.appendChild(g);
    nodeEls[n.id] = circle;
  }

  player.canvasHost.appendChild(svg);
  player.onFrame((frame) => {
    Object.values(nodeEls).forEach((c) => c.classList.remove("diagram-node-active", "diagram-node-done"));
    Object.values(edgeEls).forEach((l) => l.classList.remove("diagram-edge-active", "diagram-edge-done"));
    (frame.activeNodes || []).forEach((id) => nodeEls[id]?.classList.add("diagram-node-active"));
    (frame.doneNodes || []).forEach((id) => nodeEls[id]?.classList.add("diagram-node-done"));
    (frame.activeEdges || []).forEach(([a, b]) => edgeEls[`${a}-${b}`]?.classList.add("diagram-edge-active"));
    (frame.doneEdges || []).forEach(([a, b]) => edgeEls[`${a}-${b}`]?.classList.add("diagram-edge-done"));
  });
  return player;
}
