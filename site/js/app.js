import { store, STORAGE_MODE } from "./store.js";
import * as views from "./views.js";
import { renderSetup, renderConflict, renderUnreadableLocal } from "./setup-view.js";
import { renderFirstRun } from "./first-run-view.js";
import { statusChip } from "./status-chip.js";
import { renderQuiz, renderWarmup } from "./drill-view.js";
import { renderSettings } from "./settings-view.js";
import { renderProblemDetail, renderDayDetail, showProblem } from "./detail-view.js";
import {
  renderDesignBank, renderComponents, renderComponentDetail, renderDesignProblem,
  showComponent, showDesignProblem,
} from "./design-view.js";
import { designAttempts } from "./design-logic.js";
import {
  renderDesignSession, renderDesignCompare, startDesignSession,
  hasActiveDesignSession, discardDesignSession, currentDesignProblemName,
} from "./design-session.js";
import { renderLongSession } from "./long-session-view.js";
import { renderPairMock } from "./pair-mock-view.js";
import { COMPONENTS } from "./design-components.js";

/** Read once for the nav's index card, which runs on every render. */
const COMPONENT_COUNT = COMPONENTS.length;
import {
  plantWidgetHtml, updatePlantWidget, wireNavigationTargets, wireListRows, updateDayRing,
} from "./chrome.js";
import { toast, showTopic } from "./ui.js";
import {
  startSession, discardSession, hasActiveSession, restoreSession, checkpointSession,
  renderWorkspace, renderReflect, renderSessionSummary,
} from "./session-view.js";
import {
  computePlantState, dueProblems, allAttempts, patternStats, systemDesignUnlock,
  backlogProblems, progressSummary, startDayTimer, stopDayTimer,
} from "./logic.js";

import { navIcon } from "./icons.js";
import { renderAnalyze } from "./analyze-view.js";
import { renderBank } from "./bank-view.js";
import { installShortcuts, toggleHelp } from "./shortcuts.js";
import { renderProgress } from "./progress-view.js";
import { installSearch, openSearch, closeSearch, isSearchOpen } from "./search.js";
import { todaysRecommendation } from "./recommendation.js";
import { APP_VERSION } from "./version.js";
import { installErrorHandling, report, guard } from "./errors.js";
import { hasSeenWelcome, markWelcomeSeen, renderWelcome } from "./welcome.js";
import { storageKey, IS_NON_STABLE, CHANNEL } from "./channel.js";
import { paintChannelBadge } from "./channel-badge.js";
import { SUPPORT, paintSupportLink } from "./support-link.js";

const ACTIVE_TAB_KEY = storageKey("ledger.activeTab");

// The nav reads like a table of contents, not a junk drawer: Home is the
// cover page; everything else lives in one of a few named chapters, each
// with its own index card explaining what's inside and when to reach for
// it. Landing on a chapter's own tab shows that index by default — a
// specific page inside it is always one more click, never the first click.
const STANDALONE = {
  dashboard: { label: "Home", icon: "home", render: views.renderDashboard },
  settings: { label: "Settings", icon: "settings", render: renderSettings },
};

const SECTIONS = {
  practice: {
    label: "Practice",
    icon: "practice",
    blurb: "Ways to get reps in outside the guided Dashboard flow.",
    pages: [
      { id: "queue", label: "Refreshers", icon: "queue", render: views.renderQueue, blurb: "Everything you haven't looked at in a while, not just what fits today's time budget.", stat: (state) => { const n = dueProblems(state).length; return n ? `${n} ready for a refresher` : "Nothing has gone stale"; } },
      { id: "bank", label: "Problem Bank", icon: "bank", render: renderBank, blurb: "Browse ~2,500 pattern-labelled problems and stock up. Saved problems just wait in your bank until you want them.", stat: (state) => { const n = backlogProblems(state).length; return n ? `${n} waiting in your bank` : "Nothing saved yet"; } },
      { id: "whiteboard", label: "Whiteboard", icon: "whiteboard", render: views.renderWhiteboard, blurb: "A freeform scratchpad for sketching outside an active session.", stat: (state) => `${state.whiteboards.length} board${state.whiteboards.length === 1 ? "" : "s"} saved` },
      { id: "log", label: "Log Manually", icon: "log", render: views.renderLog, blurb: "Record something you already solved elsewhere — LeetCode, paper, a real interview.", stat: (state) => `${state.problems.length} problems logged` },
    ],
  },
  learn: {
    label: "Learn",
    icon: "learn",
    blurb: "Build understanding, not just volume.",
    pages: [
      { id: "topics", label: "Topics", icon: "topics", render: views.renderTopics, blurb: "One dedicated page per pattern — plain-language hook, concept, invariant, pitfalls, animated worked examples.", stat: (state) => `${state.patterns.length} patterns to explore` },
      { id: "patterns", label: "Patterns", icon: "patterns", render: views.renderPatterns, blurb: "Your mastery table, weakest first — what the next two weeks should focus on.", stat: (state) => { const ranked = patternStats(state).filter((s) => s.attempts > 0).sort((a, b) => (a.solvedCleanRate ?? 1) - (b.solvedCleanRate ?? 1)); return ranked.length ? `Weakest: ${ranked[0].pattern.name}` : "No attempts logged yet"; } },
      { id: "quiz", label: "Quiz", icon: "quiz", render: renderQuiz, blurb: "Open-ended pattern-recall drilling, the same mechanic used in every Reflect step.", stat: (state) => state.quiz.totalAsked ? `${Math.round((state.quiz.totalCorrect / state.quiz.totalAsked) * 100)}% lifetime accuracy` : "No questions answered yet" },
      { id: "analyze", label: "Analyze", icon: "analyze", render: renderAnalyze, blurb: "Paste a problem you don't recognize and see which patterns it resembles — and exactly which words and bounds say so.", stat: () => "Runs in your browser" },
    ],
  },
  design: {
    label: "System Design",
    icon: "systemDesign",
    blurb: "The other half of the same interview loop, prepared in the same day.",
    pages: [
      { id: "designBank", label: "Problems", icon: "bank", render: renderDesignBank,
        blurb: "Draw your own answer against the clock, then compare it with a reference built one pressure at a time.",
        stat: (state) => { const done = (state.designProblems || []).filter((p) => (p.attempts || []).length).length;
          return done ? `${done} of ${(state.designProblems || []).length} attempted` : "None attempted yet"; } },
      { id: "components", label: "Components", icon: "topics", render: renderComponents,
        blurb: "The decisions a design interview turns on — what each buys, what it costs, and what they ask next.",
        stat: (state) => { const reached = new Set(designAttempts(state).flatMap((a) => a.covered || [])).size;
          return reached ? `${reached} of ${COMPONENT_COUNT} reached for` : `${COMPONENT_COUNT} to learn`; } },
    ],
  },
  track: {
    label: "Track",
    icon: "track",
    blurb: "Where the record of your work lives.",
    pages: [
      { id: "progress", label: "Progress", icon: "progress", render: renderProgress, blurb: "Whether you're actually improving — clean solves and time-to-insight over the last two months, and which patterns moved.", stat: (state) => { const s = progressSummary(state); return s.hasEnoughData ? (s.cleanRateDelta > 0.03 ? "Trending up" : s.cleanRateDelta < -0.03 ? "Trending down" : "Holding steady") : "Needs more data"; } },
      { id: "journal", label: "Journal", icon: "journal", render: views.renderJournal, blurb: "Every soul statement and mock interview, plus freeform weekly retros.", stat: (state) => `${allAttempts(state).filter((a) => a.soulStatement).length} soul statements` },
      { id: "leetcode", label: "LeetCode", icon: "leetcode", render: views.renderLeetCode, blurb: "Solved counts, activity, and recent submissions from your real profile.", stat: (state, store) => store.leetcode?.data?.solvedByDifficulty ? `${store.leetcode.data.solvedByDifficulty.All ?? 0} solved on LeetCode` : "Not synced yet" },
    ],
  },
};

const PAGE_TO_SECTION = {};
for (const [sectionId, section] of Object.entries(SECTIONS)) {
  for (const page of section.pages) PAGE_TO_SECTION[page.id] = sectionId;
}
// The per-pattern Topics detail page isn't a registered page (there's one
// per pattern, decided at runtime) — it belongs to Learn for nav-highlight
// purposes, and app.js dispatches its render directly (see renderAll).
PAGE_TO_SECTION.topicDetail = "learn";
// Same arrangement for a single problem's history: reachable from anywhere a
// problem is listed, and it belongs under Practice for nav-highlight purposes.
PAGE_TO_SECTION.problemDetail = "practice";
// A single day's practice, opened from the activity heatmap.
PAGE_TO_SECTION.dayDetail = "track";
// One component, and one design problem with its walkthrough — reachable from
// anywhere either is named, and belonging to the design section for
// nav-highlight purposes.
PAGE_TO_SECTION.componentDetail = "design";
PAGE_TO_SECTION.designProblem = "design";

// Entered only via a Dashboard/Workspace button, never from the tab bar —
// rendering one of these swaps the full nav for a minimal exit bar so the
// session stays the focus.
const SESSION_TABS = {
  workspace: { render: renderWorkspace, label: "Session" },
  designSession: { render: renderDesignSession, label: "Design session" },
  designCompare: { render: renderDesignCompare, label: "Compare" },
  reflect: { render: renderReflect, label: "Reflect" },
  warmup: { render: renderWarmup, label: "Warmup" },
  sessionSummary: { render: renderSessionSummary, label: "Session complete" },
};

let activeTab = localStorage.getItem(ACTIVE_TAB_KEY) || "dashboard";

const nav = document.getElementById("tab-nav");
const root = document.getElementById("view-root");
const statusEl = document.getElementById("sync-status");
const announcer = document.getElementById("view-announcer");

// Said once at boot, and it stays said. A development build is a different app
// with different data, and every minute spent not knowing which one is on
// screen is a minute of conclusions drawn about the wrong thing.
paintChannelBadge(document.getElementById("channel-badge"), CHANNEL);

// Before the first render, so the link is there on the first-run screen too, on every channel.
paintSupportLink(document.getElementById(SUPPORT.footerId));

/** Human-readable name of whatever is on screen, for the live region. */
function currentViewName() {
  if (SESSION_TABS[activeTab]) return SESSION_TABS[activeTab].label;
  if (STANDALONE[activeTab]) return STANDALONE[activeTab].label;
  if (SECTIONS[activeTab]) return `${SECTIONS[activeTab].label} overview`;
  if (activeTab === "topicDetail") return "Pattern detail";
  if (activeTab === "componentDetail") return "A component";
  if (activeTab === "designProblem") return "A design problem";
  if (activeTab === "problemDetail") return "Problem history";
  if (activeTab === "dayDetail") return "That day's practice";
  if (activeTab === "longSession") return "Today's long session";
  if (activeTab === "pairMock") return "Two-mediums mock";
  const owner = PAGE_TO_SECTION[activeTab];
  const page = owner && SECTIONS[owner].pages.find((p) => p.id === activeTab);
  return page ? `${SECTIONS[owner].label}, ${page.label}` : "Ledger";
}

let lastAnnounced = null;
let viewChanged = false;
function announceView() {
  const name = currentViewName();
  if (name === lastAnnounced) return; // re-renders are not navigations
  lastAnnounced = name;
  if (announcer) announcer.textContent = name;
  // Recorded here and acted on after the render: focusing an element whose
  // contents are about to be replaced hands a screen reader the old page.
  viewChanged = true;
}

/**
 * Put the cursor at the top of the view you just navigated to.
 *
 * The live region announced the new page and nothing moved focus there, so
 * after `g q` the cursor was still on a nav button that the re-render had
 * replaced — which drops focus to <body>, and the next Tab starts from the top
 * of the document. Every navigation cost a keyboard user a walk back through
 * the header, the search box and both tiers of nav. `#view-root` has carried
 * `tabindex="-1"` for exactly this since it was written and was never focused.
 *
 * Guarded three ways, because focus is the one thing more annoying to get
 * wrong than to leave alone:
 *
 *  * Only on a real navigation. `announceView` already returns early when the
 *    view name is unchanged, so a sync landing or the day clock ticking cannot
 *    yank the cursor out of a half-typed field.
 *  * Never over a typing cursor. A view can re-render while a form is open,
 *    and stealing focus mid-sentence is worse than not moving it at all.
 *  * `preventScroll`, because the render has already put the page where it
 *    belongs and focusing must not fight it.
 */
/**
 * A section to scroll to once the view it is on has rendered.
 *
 * Kept for a moment rather than applied once, because navigating is rarely
 * one render: the store settles, a sync lands, and each re-render replaces the
 * page's HTML. For an instant the document is empty and the scroll clamps to
 * zero, so a jump applied before the last of those renders is undone by it.
 */
let pendingJump = null;
const JUMP_HOLD_MS = 1500;

function applyPendingJump() {
  if (!pendingJump) return;
  if (Date.now() > pendingJump.until) { pendingJump = null; return; }
  document.getElementById(pendingJump.id)?.scrollIntoView({ block: "start" });
}

function moveFocusToView() {
  if (!viewChanged || !root) return;
  viewChanged = false;
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
  if (active && active.isContentEditable) return;
  root.focus({ preventScroll: true });
}

const actions = {
  switchTab(id, { jump = null } = {}) {
    activeTab = id;
    localStorage.setItem(ACTIVE_TAB_KEY, id);
    pendingJump = jump ? { id: jump, until: Date.now() + JUMP_HOLD_MS } : null;
    renderAll();
  },
  rerender() {
    renderAll();
  },
  openTopic(patternId) {
    showTopic(patternId);
    actions.switchTab("topicDetail");
  },
  openProblem(problemId) {
    showProblem(problemId);
    actions.switchTab("problemDetail");
  },
};

function exitSession() {
  if (hasActiveSession()) {
    discardSession(actions);   // asks, and switches tabs itself if answered yes
    return;
  }
  if (hasActiveDesignSession()) {
    discardDesignSession(actions);
    return;
  }
  actions.switchTab("dashboard");
}

function navLabel(icon, label) {
  return `<span class="nav-icon-label">${navIcon(icon, { size: 16 })}<span>${label}</span></span>`;
}

function renderNav() {
  const show = store.state != null;
  nav.hidden = !show;
  if (!show) return;

  if (SESSION_TABS[activeTab]) {
    nav.innerHTML = `
      <div class="nav-row">
        <button class="tab session-exit" id="nav-exit">✕ Exit</button>
        <span class="session-nav-label">${SESSION_TABS[activeTab].label}</span>
      </div>`;
    nav.querySelector("#nav-exit").addEventListener("click", exitSession);
    return;
  }

  const currentSectionId = SECTIONS[activeTab] ? activeTab : PAGE_TO_SECTION[activeTab] || null;

  const primaryItems = [
    { id: "dashboard", ...STANDALONE.dashboard },
    ...Object.entries(SECTIONS).map(([id, s]) => ({ id, ...s })),
    { id: "settings", ...STANDALONE.settings },
  ];
  // aria-current marks the active entry for assistive technology; the "active"
  // class only conveys it visually.
  const current = (isActive) => (isActive ? ' aria-current="page"' : "");
  let html = `<div class="nav-row nav-row-primary">${primaryItems.map((t) => {
    const isActive = t.id === activeTab || t.id === currentSectionId;
    return `
    <button class="tab ${isActive ? "active" : ""}"${current(isActive)} data-tab="${t.id}">${navLabel(t.icon, t.label)}</button>`;
  }).join("")}</div>`;

  if (currentSectionId) {
    const section = SECTIONS[currentSectionId];
    html += `<div class="nav-row nav-row-secondary">
      <span class="nav-chapter-label">${section.label}:</span>
      <button class="tab tab-sub ${activeTab === currentSectionId ? "active" : ""}"${current(activeTab === currentSectionId)} data-tab="${currentSectionId}">Overview</button>
      ${section.pages.map((p) => `<button class="tab tab-sub ${activeTab === p.id ? "active" : ""}"${current(activeTab === p.id)} data-tab="${p.id}">${navLabel(p.icon, p.label)}</button>`).join("")}
    </div>`;
  }

  nav.innerHTML = html;
  nav.querySelectorAll("button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => actions.switchTab(btn.dataset.tab));
  });
}

/** A section's own tab shows this by default — a table of contents for that
 * chapter, each entry explaining what it's for and when to reach for it,
 * rather than dropping straight into whichever page happened to be first. */
function renderSectionIndex(root, section, actions) {
  root.innerHTML = `
    <div class="card index-intro"><h2>${section.label}</h2><p class="muted">${section.blurb}</p></div>
    <div class="index-grid">
      ${section.pages.map((p) => `
        <button type="button" class="card index-card" data-tab="${p.id}">
          <div class="row gap-sm" style="align-items:center"><span class="topic-index-icon">${navIcon(p.icon, { size: 20 })}</span><h3 style="margin:0">${p.label}</h3></div>
          <p class="muted small">${p.blurb}</p>
          ${p.stat && store.state ? `<span class="index-card-stat">${p.stat(store.state, store)}</span>` : ""}
        </button>`).join("")}
    </div>`;
  root.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => actions.switchTab(btn.dataset.tab));
  });
}

function renderStatus() {
  // Said once, the first time a render happens after a recovery. A silent
  // save is indistinguishable from nothing having been at stake, and this is
  // the user's only way to learn that the hour they worked on a train was
  // sitting in one browser and has now been uploaded.
  if (store.recovered) {
    store.recovered = false;
    toast("Work you did offline has been uploaded.");
  }

  const chip = statusChip(store.status, store.error, store.mode);
  statusEl.textContent = chip.text;
  statusEl.className = chip.cls;
  statusEl.title = chip.title;
  statusEl.setAttribute("role", "status");
  statusEl.setAttribute("aria-label", chip.label);
}

const PLANT_STAGE_ORDER = ["seed", "sprout", "seedling", "young", "budding", "flowering", "tree"];
const PLANT_STAGE_KEY = storageKey("ledger.plant.lastStage");

// The plant lives in the topbar too, not just the Dashboard, on purpose —
// visible on every screen, the same way well-being should be a constant
// backdrop to studying rather than something you check in on separately.
// Was also drawing a small plant in the header. That went when the plant got a
// standing place on every page — two copies of the same thing on one screen,
// and the header one was too small to read a change in anyway. What it was
// *also* doing, and what stays, is noticing the moment a stage is earned.
function trackPlantGrowth() {
  if (!store.state) return;
  const plant = computePlantState(store.state);
  const lastStage = localStorage.getItem(PLANT_STAGE_KEY);
  if (lastStage && PLANT_STAGE_ORDER.indexOf(plant.stage) > PLANT_STAGE_ORDER.indexOf(lastStage)) {
    toast(`Your plant grew into a ${plant.stageLabel}.`);
    celebrateGrowth();
  }
  localStorage.setItem(PLANT_STAGE_KEY, plant.stage);
  applyGrowthAnimation();
}
/**
 * Mark the moment the plant advances a stage.
 *
 * Growing a stage takes days of consistent practice and is the one reward here
 * that volume can't buy, so it shouldn't pass with only a toast that vanishes
 * in two seconds. Both plants that can be on screen — the standing one and the
 * Dashboard card — get a brief grow animation.
 *
 * It's tracked as a deadline rather than applied once, because store.init()
 * emits several times while state loads and every renderAll rebuilds this
 * markup: a class added once was being thrown away by the next render before
 * it ever painted. While the window is open, each render re-applies it.
 */
const GROWTH_ANIMATION_MS = 1100;
let growthCelebrationUntil = 0;

function applyGrowthAnimation() {
  if (Date.now() > growthCelebrationUntil) return;
  for (const el of document.querySelectorAll(".plant-widget-art svg, .plant-card > svg")) {
    el.classList.add("plant-growing");
  }
}

function celebrateGrowth() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  growthCelebrationUntil = Date.now() + GROWTH_ANIMATION_MS;
}

// How much width a page should get. Absent from this map means the default
// tier, which suits a page of mixed cards. See the --page-max block in
// styles.css for why this is per-page rather than one width for everything.
const PAGE_WIDTH = {
  workspace: "page-full",     // an IDE: statement, editor and board side by side
  designSession: "page-full", // the same: a board that owns the viewport
  designCompare: "page-read", // your answer beside the reference, read carefully
  problemDetail: "page-read", // a history to read, not a dashboard
  dayDetail: "page-read",
  longSession: "page-read",   // one step at a time, read and acted on
  pairMock: "page-read",
  componentDetail: "page-read",
  designProblem: "page-read",
  dashboard: "page-wide",     // a grid of cards, and the more of them visible the better
  bank: "page-wide",          // ~2,500 rows to scan
  queue: "page-wide",         // a long list of rows, same as the bank
  analyze: "page-wide",       // highlighted text beside its explanation
  patterns: "page-wide",      // the nine-column mastery table
  progress: "page-wide",      // charts read better wide than tall
  leetcode: "page-wide",
  topicDetail: "page-read",   // prose and worked examples
  topics: "page-read",
  journal: "page-read",
  reflect: "page-read",       // a form you think carefully about, not a dashboard
};

function applyPageWidth() {
  root.classList.remove("page-full", "page-wide", "page-read");
  const tier = PAGE_WIDTH[activeTab];
  if (tier) root.classList.add(tier);
}

// Home gives the plant a whole card of its own, so the floating one would just
// be a second copy of the same thing on the same screen. The two session views
// are excluded for the opposite reason: they own the viewport, so the panel
// lands on the whiteboard canvas rather than beside it, and a readout that
// covers the surface you are drawing on is worse than no readout. Both carry
// the day budget in their own bar instead.
const PLANT_WIDGET_HIDDEN_ON = new Set(["dashboard", "workspace", "designSession"]);

// The widget is inert apart from this one control, so the click is bound here
// on the container rather than on a button that gets replaced.
function toggleDayClock() {
  store.mutate((s) => {
    if (s.dayTimer?.running) stopDayTimer(s);
    else startDayTimer(s);
  }, "Ledger: day clock");
}

// Built once per view change, then updated in place every tick. Rebuilding it
// on the tick restarted the CSS transition from scratch each second, which is
// what made the plant step rather than grow.
function renderPlantWidget() {
  const host = document.getElementById("plant-widget");
  if (!host || !store.state) return;
  // The ticking clock calls this every second, so the check has to live here
  // rather than at the point the welcome screen is drawn — otherwise the
  // interval un-hides the plant a second after onboarding hides it.
  const show = !PLANT_WIDGET_HIDDEN_ON.has(activeTab) && hasSeenWelcome();
  host.hidden = !show;
  if (!show) return;
  if (!host.querySelector(".plant-widget-inner")) {
    host.innerHTML = plantWidgetHtml(store.state);
    // Bound once, on the host, which outlives every rebuild of its contents.
    host.addEventListener("click", (event) => {
      if (event.target.closest(".plant-widget-toggle")) toggleDayClock();
    });
  }
  updatePlantWidget(host, store.state);
}

// One interval for the whole app rather than one per view. The plant has to
// keep moving while the user is doing something else entirely — that's the
// point of it — and a per-render timer would leave stragglers ticking against
// markup that had already been replaced.
let clockTick = null;
function startClocks() {
  clearInterval(clockTick);
  clockTick = setInterval(guard(() => {
    // Nothing to draw until the state has loaded, and the first seconds of a
    // cold start are exactly when it hasn't.
    if (!store.state) return;
    renderPlantWidget();
    updateDayRing(document.getElementById("dash-day"), store.state);
  }, "updating the day clock"), 1000);
}

// The workspace sizes itself against the viewport, so it needs to know how
// much of it the header and nav have taken. Measured rather than hardcoded
// because the nav wraps to a second row at narrow widths and the number is
// different on every device.
function trackChromeHeight() {
  const topbar = document.querySelector(".topbar");
  const publish = () => {
    const height = topbar.offsetHeight + (nav.hidden ? 0 : nav.offsetHeight);
    document.documentElement.style.setProperty("--chrome-height", `${height}px`);
  };
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(publish);
    observer.observe(topbar);
    observer.observe(nav);
  }
  window.addEventListener("resize", publish);
  publish();
}

function renderAll() {
  renderNav();
  renderStatus();
  trackPlantGrowth();
  announceView();
  applyPageWidth();

  if (store.status === "unconfigured") {
    if (showGithubForm) {
      // Back from the GitHub form returns to the first-run screen, not to a storage choice.
      renderSetup(root, store, "github", () => { showGithubForm = false; renderAll(); });
      return;
    }
    renderFirstRun(root, store, {
      onGithub: () => { showGithubForm = true; renderAll(); },
      // Before the store renders Home, or the welcome would stand between the form and the plan.
      onAccepted: markWelcomeSeen,
    });
    return;
  }
  if ((store.status === "loading") && !store.state) {
    root.innerHTML = `<p class="muted">Loading your prep log from GitHub…</p>`;
    return;
  }
  if (store.status === "error" && !store.state && store.blocked && store.mode === STORAGE_MODE.LOCAL) {
    renderUnreadableLocal(root, store);
    return;
  }
  if (store.status === "error" && !store.state) {
    root.innerHTML = `<div class="card banner banner-bad"><p>Couldn't reach GitHub and no cached copy exists on this device yet.</p><p class="muted small">${store.error || ""}</p></div>`;
    return;
  }
  if (store.status === "conflict") {
    renderConflict(root, store, renderAll);
    return;
  }

  // Shown once, after the connection works and before anything else. A
  // dashboard full of unexplained machinery is a poor first impression for an
  // app whose whole argument is about *how* to practise.
  if (!hasSeenWelcome()) {
    // The chrome is part of what needs explaining, so none of it is on screen
    // while the explanation is. A plant and a countdown in the corner of the
    // page that is telling you what a plant and a countdown are for is the
    // exact confusion this is meant to clear up.
    nav.hidden = true;
    document.querySelector(".topbar-search").hidden = true;
    renderWelcome(root, {
      step: welcomeStep,
      onStep: (next) => { welcomeStep = next; renderAll(); },
      onDone: () => {
        markWelcomeSeen();
        document.querySelector(".topbar-search").hidden = false;
        renderAll();
      },
    });
    return;
  }
  document.querySelector(".topbar-search").hidden = false;

  resumeInterruptedSession();
  renderView();
  // Navigation buttons are markup any view can emit, so they're bound here
  // rather than in each view that happens to have one.
  wireNavigationTargets(root, actions);
  views.wireProblemLinks(root, actions);
  views.wireHeatmapDays(root, actions);
  // Every `.queue-list` on the page, wherever it came from: the refresher
  // queue, today's plan, a topic's practice ladder, the mock list. The bank
  // keeps its own because Enter there has to save the problem first. Bound
  // here for the same reason the navigation buttons are — a list is markup any
  // view can emit, and it should not need each one to remember.
  root.querySelectorAll(".queue-list").forEach((list) => wireListRows(list));
  // `data-start-design` appears on the bank and on a problem's own page, and
  // will appear on the dashboard — bound here for the same reason every other
  // cross-view control is.
  root.querySelectorAll("[data-start-design]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (hasActiveDesignSession()) { actions.switchTab("designSession"); return; }
      if (startDesignSession(btn.dataset.startDesign)) actions.switchTab("designSession");
    });
  });
  moveFocusToView();
  applyPendingJump();
  renderPlantWidget();
  applyGrowthAnimation();
}

// A throw inside one view used to empty <main> and stop there, which looks
// exactly like a broken app and says nothing. The failure is now shown and the
// rest of the chrome — nav, search, the plant — keeps working, so there is
// always a way out of a broken page.
// store.init() is async, so the first render can run before there is any state
// to resolve a checkpointed problem against. This therefore runs on the first
// render that *has* state, not at boot, and only once.
let welcomeStep = 0;
/** Whether the first screen is showing the GitHub form instead of the first-run questions. */
let showGithubForm = false;
let resumeChecked = false;
function resumeInterruptedSession() {
  if (resumeChecked || !store.state) return;
  resumeChecked = true;
  if (hasActiveSession()) return;          // nothing was interrupted
  if (!restoreSession(store.state)) return;
  // The session is back either way, but where you were is respected. Forcing
  // the workspace meant navigating to Settings mid-session and reloading
  // yanked you into the problem — the app overriding a deliberate choice
  // because it knew better. If you left the workspace, the Dashboard offers
  // the session back instead.
  if (SESSION_TABS[activeTab]) toast("Picked up where you left off.");
}

function renderView() {
  try {
    return renderViewInner();
  } catch (err) {
    report(err, `showing ${currentViewName()}`);
    root.innerHTML = `<div class="card banner banner-bad">
      <p><strong>This page couldn't be shown.</strong></p>
      <p class="muted small">Everything you've saved is fine. Try another page from the
      menu above, and see Settings if it keeps happening.</p>
    </div>`;
    return undefined;
  }
}

function renderViewInner() {
  if (SESSION_TABS[activeTab]) return SESSION_TABS[activeTab].render(root, store, actions);
  if (activeTab === "topicDetail") return views.renderTopicDetail(root, store, actions);
  if (activeTab === "problemDetail") return renderProblemDetail(root, store, actions);
  if (activeTab === "dayDetail") return renderDayDetail(root, store, actions);
  if (activeTab === "componentDetail") return renderComponentDetail(root, store, actions);
  if (activeTab === "designProblem") return renderDesignProblem(root, store, actions);
  if (activeTab === "longSession") return renderLongSession(root, store, actions);
  if (activeTab === "pairMock") return renderPairMock(root, store, actions);
  if (STANDALONE[activeTab]) return STANDALONE[activeTab].render(root, store, actions);
  if (SECTIONS[activeTab]) return renderSectionIndex(root, SECTIONS[activeTab], actions);

  const owner = PAGE_TO_SECTION[activeTab];
  const page = owner && SECTIONS[owner].pages.find((p) => p.id === activeTab);
  if (page) return page.render(root, store, actions);

  return STANDALONE.dashboard.render(root, store, actions); // unknown/stale tab id
}

/** `s` from anywhere outside a session starts whatever the Dashboard is
 * recommending — the one action this app exists for shouldn't need navigating
 * to first. Returns false when there's genuinely nothing to start, so the
 * keypress falls through instead of appearing to do nothing. */
function startRecommendedSession() {
  if (!store.state || hasActiveSession()) return false;
  const rec = todaysRecommendation(store.state);
  if (!rec || !rec.problem) return false;
  startSession(rec.problem);
  actions.switchTab("workspace");
  toast(`Started: ${rec.problem.name}`);
  return true;
}

document.getElementById("shortcut-hint")?.addEventListener("click", toggleHelp);

installSearch({
  store,
  actions: {
    openTopic: actions.openTopic,
    openProblem: actions.openProblem,
    startProblem(problem) {
      if (hasActiveSession()) { actions.switchTab("workspace"); return; }
      startSession(problem);
      actions.switchTab("workspace");
    },
    openJournal() {
      actions.switchTab("journal");
    },
    openComponent(id) {
      showComponent(id);
      actions.switchTab("componentDetail");
    },
    openDesignProblem(id) {
      showDesignProblem(id);
      actions.switchTab("designProblem");
    },
  },
});

installShortcuts({
  switchTab: actions.switchTab,
  openSearch,
  searchOpen: isSearchOpen,
  closeSearch,
  inSession: hasActiveSession,
  exitSession,
  startRecommended: startRecommendedSession,
  isReady: () => store.state != null,
});

const savedTheme = localStorage.getItem(storageKey("ledger.theme"));
if (savedTheme && savedTheme !== "system") document.documentElement.dataset.theme = savedTheme;

installErrorHandling();
store.onChange(renderAll);
store.init();
renderAll();
trackChromeHeight();
startClocks();

// Coming back online is the best possible moment to retry a failed save, and
// far better than waiting out a backoff that started while there was no
// connection at all.
window.addEventListener("online", () => store.retryNow("Ledger: save after reconnecting"));

// A tab being hidden is the last reliable moment before a phone evicts it —
// pagehide alone is not enough on iOS, which often never fires it.
for (const event of ["visibilitychange", "pagehide"]) {
  window.addEventListener(event, () => {
    if (document.visibilityState === "hidden" || event === "pagehide") checkpointSession();
  });
}

// Stable only. A development copy that installs a caching service worker is a
// development copy that serves you yesterday's code while you are trying to
// find out whether today's works — and the dev build is deliberately published
// without one, so registering would 404 anyway.
if (!IS_NON_STABLE && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // The version in the URL is what makes a release reach people: it changes
    // the worker's script URL, so the browser treats it as a new worker and
    // installs it, and the worker names its cache after it. See js/version.js.
    navigator.serviceWorker.register(`./sw.js?v=${APP_VERSION}`).catch(() => {
      /* offline shell caching is a nicety, not a requirement */
    });
  });
}
