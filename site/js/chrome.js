// The furniture every view is built out of.
//
// Where this fits: below the views and above nothing. These are the pieces the
// pages share — the plant card, the activity heatmap, the empty state, the
// rings and sparklines, the persistent plant widget and the handful of wiring
// helpers that turn `data-` attributes into navigation. None of them know
// which page they are on.
//
// Split out of views.js, which had reached 2,534 lines and sixteen unrelated
// renderers — the exact state logic.js was in before cycle 3 split it. The
// line that decided what came here: if two pages would both want it, it is
// furniture; if only one page could ever use it, it stays with that page.

import {
  todayISO, addDaysISO, activityByDate, PLANT_STAGES, budgetProgress, budgetPressure,
  refresherStatus, computePlantState, progressSummary,
} from "./logic.js";
import { plantSvg } from "./plant.js";
import { navIcon } from "./icons.js";
import { esc, pct, toast, OUTCOME_GLYPH } from "./ui.js";
import { report, AppError, DRAWINGS_NEED_REPO_NOTE } from "./errors.js";

/**
 * The diagram renderer and its worked examples, fetched on first use.
 *
 * Together they're the heaviest thing in the bundle — about 70 KB of the 394 KB
 * the app loads — and they are needed on exactly one screen. Loading them
 * eagerly meant everyone paid for them to open the Dashboard and start a
 * session. Memoized, so moving between topic pages fetches nothing.
 */
let diagramModules = null;
export function loadDiagramModules() {
  if (!diagramModules) {
    diagramModules = Promise.all([
      import("./diagrams.js"),
      import("./diagram-data.js"),
    ]).then(([renderers, data]) => ({
      mounters: {
        array: renderers.arrayDiagram,
        stack: renderers.stackDiagram,
        grid: renderers.gridDiagram,
        graph: renderers.graphDiagram,
      },
      specs: data.DIAGRAM_SPECS,
    })).catch((err) => {
      diagramModules = null; // a failed load shouldn't be permanent
      throw err;
    });
  }
  return diagramModules;
}

const VITALITY_LABEL = { thriving: "Thriving", steady: "Steady", stressed: "Stressed", wilting: "Wilting" };

export function plantCardHtml(plant) {
  const { signals } = plant;
  const issues = [];
  if (signals.overdueCount > 0) issues.push(`${signals.overdueCount} problem${signals.overdueCount === 1 ? "" : "s"} you haven't come back to in a while`);
  if (signals.overloaded) issues.push(`Today's volume is past a healthy single sitting`);
  if (signals.daysSinceActive >= 3) issues.push(`${signals.daysSinceActive} days since last practice`);
  return `
    <div class="card plant-card">
      ${plantSvg(plant.stage, plant.vitality, { size: 130 })}
      <div class="plant-info">
        <div class="plant-stage-row">
          <span class="plant-stage-name">${esc(plant.stageLabel)}</span>
          <span class="plant-vitality-label ${plant.vitality}">${VITALITY_LABEL[plant.vitality]}</span>
        </div>
        <p class="muted small">${plant.nextStageLabel ? `${plant.daysToNextStage} more practice day${plant.daysToNextStage === 1 ? "" : "s"} to ${esc(plant.nextStageLabel)}` : "Fully grown"} · ${plant.totalDaysPracticed} days practiced, ever</p>
        <!-- What actually moved the verdict, largest first, with the number
             each one contributed. These are the arithmetic rather than a
             story about it — the same faithfulness rule the pattern model's
             explanations follow. A plant that says "stressed" and leaves you
             to guess which of six inputs did it is a judgment you cannot
             argue with or act on. -->
        <details class="plant-why">
          <summary class="muted small">Why ${esc(VITALITY_LABEL[plant.vitality].toLowerCase())}?</summary>
          <ul class="plant-contributions">
            <li><span>Everyone starts here</span><span class="contrib-delta">50</span></li>
            ${(plant.contributions || []).map((c) => `
              <li>
                <span>${esc(c.label)}</span>
                <span class="contrib-delta ${c.delta > 0 ? "up" : "down"}">${c.delta > 0 ? "+" : ""}${c.delta}</span>
              </li>`).join("")}
            <li class="contrib-total"><span>Health</span><span class="contrib-delta">${plant.health}</span></li>
          </ul>
        </details>
        <ul class="plant-signals">
          <li>${signals.activeDaysInWindow}/${signals.windowDays} days active in the last two weeks</li>
          <li>${signals.recallRate != null ? `${pct(signals.recallRate)} pattern-recall accuracy recently` : "Answer a few pattern-recall questions to start tracking this"}</li>
          ${issues.map((i) => `<li>${esc(i)}</li>`).join("")}
        </ul>
        ${growthPathHtml(plant)}
      </div>
    </div>`;
}

/**
 * The whole growth path, with where you are marked.
 *
 * Stages are reached by practising on distinct days, which means the later ones
 * are months away — and a reward you can't see isn't motivating. Showing the
 * road makes the slow axis legible, and it's the honest one: stage is the only
 * thing here that a single heavy weekend cannot move.
 */
function growthPathHtml(plant) {
  const reachedIndex = PLANT_STAGES.findIndex((s) => s.key === plant.stage);
  return `
    <ol class="growth-path" aria-label="Growth stages, currently ${esc(plant.stageLabel)}">
      ${PLANT_STAGES.map((stage, i) => {
        const state = i < reachedIndex ? "past" : i === reachedIndex ? "current" : "future";
        return `
        <li class="growth-step ${state}" title="${esc(stage.label)}${state === "future" ? ` — ${stage.min} practice days` : ""}">
          ${plantSvg(stage.key, state === "future" ? "stressed" : plant.vitality, { size: 26, decorative: true })}
          <span class="growth-step-label">${esc(stage.label)}</span>
        </li>`;
      }).join("")}
    </ol>`;
}

// Cross-tab handoff: "Log a rep" buttons elsewhere set this, renderLog reads
// and clears it. A single module-level slot is enough for a single-user app.
//
// Named `prefill` rather than `nav`, which is what app.js calls the actual nav
// element — and which made `nav.prefillProblemId` read like navigation state
// when it is one form's opening values.
export const prefill = { problemId: null, name: null, url: null };


/* Was overdueLabel, and said things like "12d overdue". See the refresher
   block in logic.js for why it doesn't any more. */
const TONE_PILL = { new: "pill-muted", fresh: "pill-muted", ready: "pill-muted", fading: "pill-warn" };

export function recencyPill(problem) {
  const { tone, text } = refresherStatus(problem);
  return `<span class="pill ${TONE_PILL[tone]}">${esc(text)}</span>`;
}
/** GitHub-style activity heatmap. `counts` maps "YYYY-MM-DD" -> a number;
 * `unixDayCounts`, if given, is LeetCode's format (unix-day-in-seconds keys)
 * instead, so the same renderer works for both Ledger's own activity and the
 * LeetCode submission calendar. */
export function heatmapSvg(counts, { weeks = 20 } = {}) {
  const cell = 11, gap = 3;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = weeks * 7;
  const start = new Date(today);
  start.setDate(start.getDate() - days + 1);
  // align start to a Sunday so weeks form clean columns
  start.setDate(start.getDate() - start.getDay());
  const max = Math.max(1, ...Object.values(counts));
  let rects = "";
  let d = new Date(start);
  let col = 0;
  while (d <= today) {
    for (let row = 0; row < 7; row++) {
      if (d > today) break;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const n = counts[iso] || 0;
      const alpha = n === 0 ? 0 : 0.25 + 0.75 * Math.min(1, n / max);
      // Days with something in them are clickable; empty ones are not, because
      // a cell that opens "you did nothing" is a dead end dressed as a link.
      rects += `<rect x="${col * (cell + gap)}" y="${row * (cell + gap)}" width="${cell}" height="${cell}" rx="2"
        fill="var(--accent)" fill-opacity="${n === 0 ? 0.08 : alpha.toFixed(2)}"
        ${n > 0 ? `class="heat-cell" data-heat-day="${iso}" tabindex="0" role="button"
          aria-label="${iso}, ${n} attempt${n === 1 ? "" : "s"} — open"` : ""}><title>${iso}: ${n}</title></rect>`;
      d.setDate(d.getDate() + 1);
    }
    col++;
  }
  const width = col * (cell + gap);
  const height = 7 * (cell + gap);
  // role="img" with one summary, because the alternative is a screen reader
  // reading out every cell — a 20-week heatmap is 140 of them, almost all
  // "0 on a date you did nothing", which is worse than no chart at all.
  const activeDays = Object.values(counts).filter((n) => n > 0).length;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const label = activeDays
    ? `Activity heatmap: ${total} across ${activeDays} active day${activeDays === 1 ? "" : "s"} in the last ${weeks} weeks.`
    : `Activity heatmap: nothing recorded in the last ${weeks} weeks.`;
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMinYMin meet" class="heatmap" role="img" aria-label="${esc(label)}">${rects}</svg>`;
}

/** Converts LeetCode's unix-day-seconds submissionCalendar keys into
 * YYYY-MM-DD so heatmapSvg can treat it the same as Ledger's own data. */
export function leetcodeCalendarToDateCounts(calendar) {
  const out = {};
  for (const [unixSec, count] of Object.entries(calendar || {})) {
    const d = new Date(Number(unixSec) * 1000);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    out[iso] = (out[iso] || 0) + count;
  }
  return out;
}

/**
 * An empty section that says what goes here and how to fill it.
 *
 * "Nothing saved yet" is true and useless — it tells you a place is empty
 * without telling you what would put something in it, which on a first run is
 * most of the app. Every empty state gets a line explaining what the thing is
 * for and, where there's an obvious next step, a button that takes it.
 *
 * `action` is `{ tab, label }`; wireNavigationTargets() binds it.
 */
export function emptyState(icon, headline, explanation, action = null) {
  return `
    <div class="empty-state">
      <span class="empty-state-icon">${navIcon(icon, { size: 22 })}</span>
      <p class="empty-state-headline">${esc(headline)}</p>
      <p class="muted small">${esc(explanation)}</p>
      ${actionHtml(action)}
    </div>`;
}

/**
 * The one control that ends this empty state.
 *
 * Two kinds, because there are two kinds of empty. Some are ended somewhere
 * else — no mock interviews, start one from the queue — and take `{ tab }`.
 * Others are ended by something already on the same screen: the journal's
 * "no notes yet" sits directly under the form that adds one, and sending
 * someone to another tab would be absurd. Those take `{ focus }`, a selector
 * for the field to scroll to and put the cursor in.
 *
 * Before this the helper only knew how to navigate, so the four empty states
 * whose answer was on their own page simply had no button — which read as
 * "nothing here" rather than "here is how to start".
 */
function actionHtml(action) {
  if (!action) return "";
  const attr = action.tab
    ? `data-goto="${esc(action.tab)}"`
    : `data-goto-focus="${esc(action.focus)}"`;
  return `<button class="btn btn-ghost btn-sm" ${attr}>${esc(action.label)}</button>`;
}

/**
 * Binds every `data-goto="<tab>"` control in the rendered view.
 *
 * Called once centrally from app.js after each render, so any view can emit a
 * navigation button as plain markup and it simply works — no per-view wiring,
 * and no second mechanism to remember. Safe on a view with none.
 */
export function wireNavigationTargets(root, actions) {
  // `data-goto-topic` opens a pattern's topic page. Three views emit one — the
  // dashboard's stuck recommendation, a problem's detail header, the quiz's
  // confusion list — and each had wired its own, so a fourth would have had to
  // know to.
  root.querySelectorAll("[data-goto-topic]").forEach((btn) => {
    btn.addEventListener("click", () => actions.openTopic(btn.dataset.gotoTopic));
  });
  root.querySelectorAll("[data-goto-focus]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = root.querySelector(btn.dataset.gotoFocus);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    });
  });
  root.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => actions.switchTab(btn.dataset.goto));
  });
}

/** Makes every `[data-tab]` button in `root` switch to its tab. Lives here, not in a view, because two views
 *  need it and views.js already imports drill-view.js. */
export function wireTabButtons(root, actions) {
  root.querySelectorAll("[data-tab]").forEach((btn) => {
    // A section of the page, not just the page: "set it up" landing at the
    // top of Settings, above the sync card, would be a link that makes you
    // hunt for the thing it promised.
    btn.addEventListener("click", () => actions.switchTab(btn.dataset.tab, { jump: btn.dataset.jump || null }));
  });
}

/**
 * One sentence on the dashboard connecting today's work to the trajectory.
 *
 * The streak card answers "did I show up"; without this, nothing on the page
 * answers "is any of it working" — you had to go looking for that, which means
 * mostly not seeing it. Silent until there's genuinely a trend, because a
 * number invented from two attempts would be worse than no number.
 */
export function trendLineHtml(state) {
  const summary = progressSummary(state);
  if (!summary.hasEnoughData || summary.cleanRateDelta == null) return "";

  const points = Math.round(summary.cleanRateDelta * 100);
  const faster = summary.insightDelta != null && summary.insightDelta <= -1
    ? `, and you're reaching the approach ${Math.abs(summary.insightDelta).toFixed(0)} min faster`
    : "";
  const direction = Math.abs(points) < 3 ? "steady" : points > 0 ? "up" : "down";
  const phrase = direction === "steady"
    ? "Clean-solve rate holding steady"
    : `Clean-solve rate ${direction} ${Math.abs(points)} pts`;

  return `
    <p class="trend-line ${direction}" style="margin:0.6rem 0 0">
      <span class="trend-arrow" aria-hidden="true">${direction === "up" ? "&#8599;" : direction === "down" ? "&#8600;" : "&#8594;"}</span>
      ${esc(phrase)}${esc(faster)} over ${summary.activeWeeks} active week${summary.activeWeeks === 1 ? "" : "s"}.
      <button type="button" class="link-button" data-goto="progress">See progress</button>
    </p>`;
}

export function sparklineSvg(points, { width = 80, height = 22 } = {}) {
  if (!points.length) return "";
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((v, i) => `${(i * step).toFixed(1)},${(height - v * height).toFixed(1)}`).join(" ");
  // Purely illustrative — it always sits beside the same figure in text, so
  // announcing it a second time as a shape adds nothing.
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="sparkline" aria-hidden="true"><polyline points="${coords}" /></svg>`;
}

/** A small circular progress ring — the recurring visual for "how much of
 * X" (budget used, mastery, unlock progress, accuracy) so those numbers
 * read as a shape before they read as digits. */
export function ringSvg(fraction, { size = 44, stroke = 5, color = "var(--accent)", label = "", description = "" } = {}) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction ?? 0));
  return `
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="ring"
         role="img" aria-label="${esc(description || `${Math.round(f * 100)}% complete`)}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - f)}"
        transform="rotate(-90 ${c} ${c})"/>
      ${label ? `<text x="${c}" y="${c + 4}" text-anchor="middle" class="ring-label" style="font-size:${label.length >= 4 ? size / 4.2 : size / 3.4}px">${esc(label)}</text>` : ""}
    </svg>`;
}

/** Ring geometry for Home's day clock, kept with the markup so the update
 *  below can find the arc it drew. */
const DAY_RING = { size: 40, stroke: 4 };

/**
 * Home's day clock: time actually used today, counting down live.
 *
 * This used to be "N/75 min of work lined up", the estimates of the problems
 * queued for today. Finishing one took it off the queue, so the number fell by
 * the estimate, all at once, however long the problem had really taken — which
 * read as the app subtracting the wrong time. This is the clock instead:
 * minutes spent, as they are spent. What is lined up is a sentence in Today's
 * plan, where it belongs.
 */
export function dayRingHtml(state, now = Date.now()) {
  const b = budgetProgress(state, now);
  return `
    <div class="row gap-sm day-ring" id="dash-day" style="align-items:center">
      ${ringSvg(b.fraction, { ...DAY_RING, description: `${Math.round(b.usedMin)} of ${b.budgetMin} minutes used today` })}
      <span class="stat-label"><span class="day-ring-left">${dayRingText(b)}</span><br/>of today's ${b.budgetMin} min</span>
    </div>`;
}

const dayRingText = (b) => (b.over ? `+${fmtCountdown(b.overMin)} over` : `${fmtCountdown(b.remainingMin)} left`);

/** Move Home's day clock on, in place, once a tick. */
export function updateDayRing(host, state, now = Date.now()) {
  if (!host || !state) return;
  const b = budgetProgress(state, now);
  const left = host.querySelector(".day-ring-left");
  const text = dayRingText(b);
  if (left && left.textContent !== text) left.textContent = text;
  const arc = host.querySelectorAll("circle")[1];
  if (arc) {
    const circ = 2 * Math.PI * ((DAY_RING.size - DAY_RING.stroke) / 2);
    arc.setAttribute("stroke-dashoffset", String(circ * (1 - Math.max(0, Math.min(1, b.fraction)))));
  }
  host.classList.toggle("budget-over", b.overrun);
  host.classList.toggle("budget-warn", b.over && !b.overrun);
}

/**
 * The plant as a standing presence on every page except Home.
 *
 * The point is that the one signal telling you whether today is going well or
 * has gone too far should be visible *while* you work, not on a page you'd
 * have to leave your session to visit. Home already gives it a whole card, so
 * it's left alone there.
 *
 * Inert apart from one control. The panel takes no pointer events at all, so
 * it can't be tapped out of a session by accident; the pause button inside it
 * takes them back, because pausing is the one thing you need to be able to do
 * to the day's clock from wherever you happen to be, and it doesn't navigate
 * anywhere.
 */
export function plantWidgetHtml(state, now = Date.now()) {
  const plant = computePlantState(state);
  const vitality = widgetVitality(state, now);
  return `
    <div class="plant-widget-inner" data-vitality="${vitality}">
      <div class="plant-widget-art">${plantSvg(plant.stage, vitality, { size: 96, decorative: true })}</div>
      <!-- The button shares the clock's row rather than sitting under it.
           Stacked, the readout took half the panel's height and left the
           plant filling barely a third of the box it lives in. -->
      <div class="plant-widget-readout">
        <span class="plant-widget-trend" aria-hidden="true"></span>
        <span class="plant-widget-clock"></span>
        <button type="button" class="plant-widget-toggle" id="plant-widget-toggle"></button>
      </div>
      <span class="plant-widget-note"></span>
    </div>`;
}

function widgetVitality(state, now) {
  const b = budgetProgress(state, now);
  return b.overrun ? "wilting" : computePlantState(state).vitality;
}

/**
 * Per-tick update for the standing plant.
 *
 * Deliberately not a re-render. Replacing the markup every second gave the
 * element no chance to transition — each new node simply appeared at its
 * final size — which is what made the plant look like it was stepping rather
 * than growing. Writing the changed values onto the node that is already
 * there lets the CSS transition do its job.
 *
 * The SVG is the one exception: vitality picks a colour palette baked into the
 * shapes, so it has to be rebuilt — but only on the rare tick where vitality
 * actually changed, not on every one.
 */
export function updatePlantWidget(host, state, now = Date.now()) {
  const inner = host.querySelector(".plant-widget-inner");
  if (!inner) return;

  const b = budgetProgress(state, now);
  const plant = computePlantState(state);
  const vitality = widgetVitality(state, now);

  if (inner.dataset.vitality !== vitality) {
    inner.dataset.vitality = vitality;
    inner.querySelector(".plant-widget-art").innerHTML =
      plantSvg(plant.stage, vitality, { size: 96, decorative: true });
  }

  inner.style.setProperty("--pressure", budgetPressure(state, now).toFixed(3));

  const clock = inner.querySelector(".plant-widget-clock");
  const clockText = b.over ? `+${fmtCountdown(b.overMin)}` : fmtCountdown(b.remainingMin);
  if (clock.textContent !== clockText) clock.textContent = clockText;
  clock.className = `plant-widget-clock ${b.overrun ? "budget-over" : b.over ? "budget-warn" : ""}`;

  const note = inner.querySelector(".plant-widget-note");
  const noteText = b.over ? "past today's budget" : `of ${b.budgetMin} min`;
  if (note.textContent !== noteText) note.textContent = noteText;

  // Which way the plant is going right now, said outright. The scale change is
  // slow by design and easy to miss if you aren't watching for it; an arrow is
  // readable in the instant you glance over, which is the only time anyone
  // looks at this.
  const trend = inner.querySelector(".plant-widget-trend");
  if (trend) {
    const dir = b.over ? "down" : b.running ? "up" : "flat";
    if (trend.dataset.dir !== dir) {
      trend.dataset.dir = dir;
      trend.textContent = dir === "down" ? "▼" : dir === "up" ? "▲" : "–";
    }
  }

  const toggle = inner.querySelector(".plant-widget-toggle");
  if (toggle) {
    toggle.dataset.running = String(b.running);
    // The face of it is a glyph, so the button's name has to carry both what
    // it does and what the number beside it means.
    toggle.setAttribute("aria-label",
      `${b.running ? "Pause" : "Start"} day clock. ${Math.round(b.usedMin)} of ${b.budgetMin} minutes used today.`);
    toggle.title = b.running ? "Pause the day clock" : "Start the day clock";
  }
}

/**
 * Write the day budget into a session bar's readout.
 *
 * Both session views need it and neither can show the floating panel: they own
 * the viewport, so the panel lands on the board rather than beside it. The
 * wording lives here, next to the panel's own, so the two cannot drift into
 * saying the same number two different ways.
 */
export function updateDayBudget(el, state, now = Date.now()) {
  if (!el || !state) return;
  const b = budgetProgress(state, now);
  const text = b.over
    ? `${Math.round(b.overMin)} min past today's ${b.budgetMin}`
    : `${Math.round(b.remainingMin)} min left of today's ${b.budgetMin}`;
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle("budget-over", b.overrun);
  el.classList.toggle("budget-warn", b.over && !b.overrun);
}

function fmtMins(minutes) {
  const m = Math.max(0, Math.round(minutes));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}m`;
}

/** Remaining time at second resolution, for while the clock is running.
 * Rounded to the minute it sat unchanged for a full minute at a time, which
 * doesn't read as a countdown so much as a number that might be stuck. */
function fmtCountdown(minutes) {
  const total = Math.max(0, Math.round(minutes * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}


/** A small colored glyph standing in for an outcome — lets a list of past
 * attempts be scanned by shape/color before reading a single word. */
export function outcomeIcon(outcome) {
  const g = OUTCOME_GLYPH[outcome];
  if (!g) return "";
  return `<span class="outcome-icon ${g.cls}" title="${esc(g.title)}">${g.symbol}</span>`;
}

/** A compact 7-day habit strip — today on the right, filled dots for days
 * with any logged activity. Cheap, glanceable "did I actually show up this
 * week" that a streak number alone doesn't convey. */
export function weekStripSvg(state) {
  const activity = activityByDate(state);
  const today = todayISO();
  const cell = 12, gap = 4;
  let rects = "";
  let activeCount = 0;
  for (let i = 6; i >= 0; i--) {
    const d = addDaysISO(today, -i);
    const on = !!activity[d];
    if (on) activeCount += 1;
    const x = (6 - i) * (cell + gap);
    rects += `<rect x="${x}" y="0" width="${cell}" height="${cell}" rx="3" fill="${on ? "var(--accent)" : "var(--surface-alt)"}"><title>${d}${on ? " — practiced" : ""}</title></rect>`;
  }
  const width = 7 * (cell + gap) - gap;
  return `<svg viewBox="0 0 ${width} ${cell}" width="${width}" height="${cell}" class="week-strip" role="img"
    aria-label="Practised on ${activeCount} of the last 7 days.">${rects}</svg>`;
}

/** Shows a saved whiteboard under its row, fetched on demand.
 * Furniture rather than a page: the Whiteboard page and a problem's detail
 * page both list boards, and a drawing is a heavy thing to load for a list
 * nobody may expand. */
export function wireBoardViewers(root, store, boards) {
  root.querySelectorAll("[data-view-board]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const board = boards.find((b) => b.id === btn.dataset.viewBoard);
      if (!board) return;
      const host = root.querySelector(`#wb-thumb-${CSS.escape(board.id)}`);
      if (!host) return;
      if (host.childElementCount) {
        host.replaceChildren();
        return;
      }
      if (!store.gh) {
        toast(DRAWINGS_NEED_REPO_NOTE);
        return;
      }
      btn.disabled = true;
      try {
        const base64 = await store.gh.fetchBinaryFile(board.path);
        const img = document.createElement("img");
        img.src = `data:image/png;base64,${base64}`;
        img.alt = board.caption || "Whiteboard drawing";
        host.replaceChildren(img);
      } catch (err) {
        report(new AppError("That drawing couldn't be loaded from your repo.",
          { code: "board_fetch", cause: err }), "opening a whiteboard");
      }
      btn.disabled = false;
    });
  });
}

/**
 * Arrow-key movement through a list of rows, with Enter to act on one.
 *
 * Written for the problem bank, where the filters were reachable from the
 * keyboard and the 2,500-row list beneath them was not — the wrong way round,
 * since the filters are three controls and the list is everything. Then left
 * there, so the refresher queue, the dashboard's plan and a topic's practice
 * ladder stayed mouse-only while the one list that already worked kept its own
 * private copy of the behaviour.
 *
 * Three decisions that are easy to get wrong:
 *
 *  * Bound on the list, not the document, so it cannot swallow an arrow key
 *    meant for the search box or for scrolling the page.
 *  * Rows are made focusable and the browser's own focus ring does the
 *    highlighting. A hand-rolled "active row" class is a second source of
 *    truth about where you are, and it drifts.
 *  * Enter is ignored unless the row itself has focus. Inside a row the
 *    buttons are real buttons and Enter is already theirs.
 *
 * `onActivate` is optional. Without it, Enter clicks the row's primary
 * control, found in the markup rather than named by every caller.
 */
export function wireListRows(list, { rowSelector = ".queue-item", onActivate = null } = {}) {
  if (!list) return;
  const rows = [...list.querySelectorAll(rowSelector)];
  if (!rows.length) return;

  rows.forEach((row, i) => {
    row.tabIndex = 0;
    row.dataset.rowIndex = String(i);
  });

  const primaryControl = (row) =>
    row.querySelector("[data-start-problem], [data-open-problem], button, a");

  list.addEventListener("keydown", (event) => {
    const row = event.target.closest(rowSelector);
    if (!row) return;
    const i = Number(row.dataset.rowIndex);

    const moveTo = (index) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, index))];
      if (next && next !== row) next.focus();
    };

    if (event.key === "ArrowDown") { event.preventDefault(); moveTo(i + 1); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); moveTo(i - 1); return; }
    // A long list is the reason this exists; getting to the end of one should
    // not mean holding a key down.
    if (event.key === "Home") { event.preventDefault(); moveTo(0); return; }
    if (event.key === "End") { event.preventDefault(); moveTo(rows.length - 1); return; }

    if (event.key === "Enter") {
      if (event.target !== row) return;
      event.preventDefault();
      if (onActivate) onActivate(row, i);
      else primaryControl(row)?.click();
    }
  });
}
