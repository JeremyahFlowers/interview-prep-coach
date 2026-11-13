// What the person watching sees.
//
// A separate page from the app, and that is the point rather than an accident.
// It never imports store.js, so it has no GitHub config, no token and no way to
// read a practice log even if something here were wrong. What can be seen is
// what arrives on the relay from one session — the problem, the drawing, the
// code — and prior attempts, soul statements and older code have nowhere to
// leak from because on this side they do not exist.
//
// See docs/realtime-architecture.md §5. The most valuable thing here is not the
// live drawing. It is that the five verbalization behaviours stop being ticked
// by the person being assessed, about themselves, after the fact, and become
// something an observer recorded while it was happening.

import { createLiveChannel } from "./live-channel.js";
import { reduce, mergeLogs, makeEvent, deviceId } from "./session-log.js";
import { createWhiteboard } from "./whiteboard.js";
import { MOCK_CHECKLIST } from "./rubric.js";

const root = document.getElementById("iv-root");
const clockEl = document.getElementById("iv-clock");
const phaseEl = document.getElementById("iv-phase");
const statusEl = document.getElementById("iv-status");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Where to join, from the link.
 *
 * `#<relay>|<session>` — both in the fragment on purpose. A fragment is never
 * sent to a server, so the room id does not end up in anyone's access log, and
 * a link pasted into a chat does not hand the room to whatever scans it.
 */
function joinFrom(hash) {
  const raw = decodeURIComponent((hash || "").replace(/^#/, ""));
  const [relayUrl, sessionId] = raw.split("|");
  return relayUrl && sessionId ? { relayUrl, sessionId } : null;
}

let log = [];
let channel = null;
let board = null;
let rubricState = {};
let rating = null;
let seq = 0;

const join = joinFrom(location.hash);
const device = deviceId(localStorage, "ledger.device.interview");

function emit(kind, payload) {
  if (!channel) return;
  const event = makeEvent({ sessionId: join.sessionId, deviceId: device, seq: seq++, kind, payload });
  log = mergeLogs(log, [event]);
  channel.publish(event);
  return event;
}

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = `status status-${cls}`;
  statusEl.title = cls === "good"
    ? "Connected. What you see is what they are drawing."
    : "Not connected. Nothing is lost on their side — their work is saved to their own repo either way.";
}

// ---------- the page ----------

function shell() {
  root.innerHTML = `
    <div class="card iv-problem">
      <h2 id="iv-title">Waiting for the session…</h2>
      <p class="muted small" id="iv-meta"></p>
      <div id="iv-statement" class="ws-statement"></div>
    </div>

    <div class="iv-panes">
      <section class="card iv-pane">
        <h3>Whiteboard</h3>
        <div id="iv-board" class="whiteboard-thumb-host iv-board"></div>
      </section>
      <section class="card iv-pane">
        <h3>Code</h3>
        <pre class="code-view-pre" id="iv-code"><span class="muted">Nothing typed yet.</span></pre>
      </section>
    </div>

    <div class="card">
      <h3>What you saw</h3>
      <p class="muted small">Tick these as they happen. They are the part of an interview that only
      exists because somebody was watching — until now they were filled in afterwards by the person
      being assessed, about themselves.</p>
      <ul class="checklist" id="iv-rubric">
        ${MOCK_CHECKLIST.map((item, i) => `<li><label>
          <input type="checkbox" data-observed="${i}" /><span>${esc(item)}</span></label></li>`).join("")}
      </ul>
      <label class="field inline" style="margin-top:0.6rem"><span class="label">Communication, 1–5</span>
        <input class="input input-xs" type="number" min="1" max="5" id="iv-rating" /></label>
      <form id="iv-note-form" class="settings-form" style="margin-top:0.8rem">
        <label class="field" style="flex:1"><span class="label">Say something now</span>
          <input class="input" id="iv-note" placeholder="They jumped to code before stating the invariant" /></label>
        <button class="btn btn-primary btn-sm" type="submit">Send</button>
      </form>
      <p class="muted small">A note appears on their screen while they are working. Everything you
      tick is saved with their attempt when they finish.</p>
      <ul class="week-notes" id="iv-sent"></ul>
    </div>`;

  board = createWhiteboard(document.getElementById("iv-board"), { readOnly: true });

  root.querySelectorAll("[data-observed]").forEach((box) => {
    box.addEventListener("change", () => {
      rubricState = { ...rubricState, [box.dataset.observed]: box.checked };
      emit("rubric", { observed: { [box.dataset.observed]: box.checked } });
    });
  });
  document.getElementById("iv-rating").addEventListener("change", (e) => {
    const value = Number(e.target.value);
    if (!Number.isFinite(value) || value < 1 || value > 5) return;
    rating = value;
    emit("rubric", { rating: value });
  });
  document.getElementById("iv-note-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("iv-note");
    const text = input.value.trim();
    if (!text) return;
    emit("note", { text });
    input.value = "";
    const sent = document.getElementById("iv-sent");
    const li = document.createElement("li");
    li.innerHTML = `<blockquote></blockquote><span class="muted small">sent</span>`;
    li.querySelector("blockquote").textContent = text;
    sent.prepend(li);
  });
}

function render() {
  const state = reduce(log);

  document.getElementById("iv-title").textContent = state.problemName || "Waiting for the session…";
  const bits = [state.difficulty, state.plan ? `${state.plan.totalMin} min box` : null].filter(Boolean);
  const meta = document.getElementById("iv-meta");
  meta.textContent = bits.join(" · ");
  if (state.url) {
    const a = document.createElement("a");
    a.href = state.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = " Open the problem ↗";
    meta.appendChild(a);
  }

  const statement = document.getElementById("iv-statement");
  statement.textContent = state.statement || "";
  statement.hidden = !state.statement;

  if (board && !board.isDrawing()) board.restore(state.strokes);

  const code = document.getElementById("iv-code");
  if (state.code) code.textContent = state.code;

  tick(state);
}

/** The clock is computed here from the events rather than sent: start and pause
 *  are instants, so both screens show the same number without anything being
 *  broadcast four times a second. */
function tick(state) {
  if (!state || state.startedAt == null || !state.plan) return;
  const elapsedMin = (Date.now() - state.startedAt) / 60000;
  const remaining = state.plan.totalMin - elapsedMin;
  const over = remaining < 0;
  const abs = Math.abs(remaining);
  clockEl.textContent = `${over ? "+" : ""}${String(Math.floor(abs)).padStart(2, "0")}:`
    + String(Math.floor((abs % 1) * 60)).padStart(2, "0");
  clockEl.classList.toggle("clock-overrun", over);

  // A coding session sends `phases`, a design session sends `stages`. The
  // watcher does not care which it is looking at, and should not have to know
  // before it can put a label on the screen.
  const steps = state.plan.phases || state.plan.stages || [];
  const phase = steps.find((p) => elapsedMin < p.endMin) || steps[steps.length - 1];
  if (phase) {
    phaseEl.innerHTML = "";
    const label = document.createElement("span");
    label.className = "mock-phase-label";
    label.textContent = phase.label;
    phaseEl.appendChild(label);
  }
}

// ---------- connect ----------

if (!join) {
  root.innerHTML = `
    <div class="card">
      <h2>Nothing to watch</h2>
      <p class="muted">This page needs a link from the person practising. In their session, the
      Whiteboard toolbar has a <strong>Share</strong> button that produces one.</p>
      <p class="muted small">The link carries the relay address and the room, and nothing else —
      no account, no log, no way back into anybody's data.</p>
    </div>`;
  setStatus("Not connected", "warn");
} else {
  shell();
  setStatus("Connecting", "warn");
  channel = createLiveChannel({ relayUrl: join.relayUrl, sessionId: join.sessionId, deviceId: device });
  channel.subscribe((event) => {
    log = mergeLogs(log, [event]);
    render();
  });
  channel.start();

  // Said once on arrival. The relay stores nothing, so joining ten minutes in
  // would otherwise show an empty board with no way to know it was wrong; this
  // asks whoever is already there to send the state.
  const hello = () => emit("hello", { role: "interviewer" });
  hello();
  // Again shortly after, in case the stream was not open yet when the first one
  // went — a POST that nobody is listening to is delivered to nobody.
  setTimeout(hello, 1200);

  setInterval(() => {
    setStatus(channel.status === "connected" ? "Watching" : "Reconnecting",
      channel.status === "connected" ? "good" : "warn");
    tick(reduce(log));
  }, 1000);

  window.addEventListener("beforeunload", () => channel.stop());
}
