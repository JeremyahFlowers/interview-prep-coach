// Keyboard shortcuts.
//
// Where this fits: app.js installs these once at startup and passes in the
// actions the rest of the app already uses, so nothing here knows how a view
// renders — it only names destinations.
//
// This is a tool opened every day, usually to do one specific thing, and
// getting to that thing took up to three clicks through a two-tier nav. The
// bindings follow the convention people already have from Gmail and GitHub:
// `g` then a letter to go somewhere, `?` for the list, Escape to back out.
//
// Three rules keep them from being a nuisance:
//
//  * Never fire while typing. Every view has text inputs, and a shortcut that
//    eats a keystroke mid-sentence is worse than no shortcut.
//  * Never shadow the browser. Anything with a modifier is left alone, so
//    Cmd-R, Cmd-L and friends behave normally.
//  * Never interrupt a session. The workspace is a timed, focused screen;
//    only Escape is live there, and it goes through the app's own exit
//    confirmation rather than discarding work.

const SEQUENCE_TIMEOUT_MS = 1200;

/** `g` then one of these. Grouped the way the nav is, so the letter matches
 * the chapter you can see. */
export const GO_TO = {
  h: { tab: "dashboard", label: "Home" },
  p: { tab: "practice", label: "Practice" },
  l: { tab: "learn", label: "Learn" },
  t: { tab: "track", label: "Track" },
  q: { tab: "queue", label: "Refreshers" },
  b: { tab: "bank", label: "Problem Bank" },
  a: { tab: "analyze", label: "Analyze a problem" },
  o: { tab: "topics", label: "Topics" },
  m: { tab: "patterns", label: "Pattern mastery" },
  z: { tab: "quiz", label: "Quiz" },
  r: { tab: "progress", label: "Progress" },
  j: { tab: "journal", label: "Journal" },
  s: { tab: "settings", label: "Settings" },
};

/** Single keys, active outside a session. */
export const DIRECT = {
  "?": "Show this list",
  "/": "Search problems and patterns",
  s: "Start the recommended session",
  Escape: "Close this list",
};

function isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * @param {object} deps
 * @param {(tab: string) => void} deps.switchTab
 * @param {() => boolean} deps.inSession   true while the timed workspace is up
 * @param {() => void}    deps.exitSession app's own confirm-then-leave path
 * @param {() => boolean} deps.startRecommended  returns false if nothing to start
 * @param {() => boolean} deps.isReady     false before state has loaded
 * @param {() => void}    deps.openSearch  opens the global search overlay
 * @param {() => boolean} deps.searchOpen  true while it is showing
 * @param {() => void}    deps.closeSearch dismisses it
 */
export function installShortcuts(deps) {
  let pendingGo = false;
  let pendingTimer = null;

  const clearPending = () => {
    pendingGo = false;
    clearTimeout(pendingTimer);
  };

  document.addEventListener("keydown", (event) => {
    // Let the browser keep its own chords.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Something on the page already acted on this key (the whiteboard's
    // Escape, say); a second meaning on top of the first is never wanted.
    if (event.defaultPrevented) return;

    if (event.key === "Escape") {
      if (deps.searchOpen()) { deps.closeSearch(); event.preventDefault(); return; }
      if (isHelpOpen()) { closeHelp(); event.preventDefault(); return; }
      if (deps.inSession()) { deps.exitSession(); event.preventDefault(); }
      clearPending();
      return;
    }

    // Typing wins over every remaining binding, including inside the help
    // dialog's own focusable content.
    if (isTypingTarget(event.target)) return;
    if (!deps.isReady()) return;

    // The shortcut list stays reachable everywhere, including mid-session — the
    // topbar advertises it on every screen, so it should answer on every screen.
    if (event.key === "?") {
      event.preventDefault();
      toggleHelp();
      return;
    }
    if (deps.inSession()) return; // otherwise the workspace stays undisturbed

    if (pendingGo) {
      const target = GO_TO[event.key.toLowerCase()];
      clearPending();
      if (target) {
        event.preventDefault();
        closeHelp();
        deps.switchTab(target.tab);
      }
      return;
    }

    switch (event.key) {
      case "g":
        pendingGo = true;
        pendingTimer = setTimeout(clearPending, SEQUENCE_TIMEOUT_MS);
        event.preventDefault();
        break;
      case "/":
        // Global search, which covers your problems, the catalog and the
        // patterns at once — more useful from any screen than focusing
        // whichever filter box the current page happens to have.
        event.preventDefault();
        deps.openSearch();
        break;
      case "s":
        if (deps.startRecommended()) event.preventDefault();
        break;
      default:
        break;
    }
  });
}

// ---------- the help dialog ----------

const HELP_ID = "shortcut-help";

function isHelpOpen() {
  return !!document.getElementById(HELP_ID);
}

export function toggleHelp() {
  if (isHelpOpen()) closeHelp();
  else openHelp();
}

function closeHelp() {
  const el = document.getElementById(HELP_ID);
  if (!el) return;
  const restore = el._restoreFocus;
  el.remove();
  if (restore && document.contains(restore)) restore.focus();
}

function keyRow(keys, description) {
  const rendered = keys.map((k) => `<kbd>${k}</kbd>`).join(" ");
  return `<div class="shortcut-row"><span class="shortcut-keys">${rendered}</span><span>${description}</span></div>`;
}

function openHelp() {
  const previouslyFocused = document.activeElement;
  const el = document.createElement("div");
  el.id = HELP_ID;
  el.className = "shortcut-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Keyboard shortcuts");
  el.innerHTML = `
    <div class="shortcut-panel">
      <div class="row space-between" style="align-items:center">
        <h2 style="margin:0">Keyboard shortcuts</h2>
        <button class="btn btn-ghost btn-sm" data-close>Close</button>
      </div>
      <p class="muted small">Shortcuts pause while you're typing, and while a session is running.</p>
      <h3 class="small-heading">Go to</h3>
      ${Object.entries(GO_TO).map(([key, { label }]) => keyRow(["g", key], label)).join("")}
      <h3 class="small-heading">Actions</h3>
      ${Object.entries(DIRECT).map(([key, label]) => keyRow([key === "Escape" ? "Esc" : key], label)).join("")}
    </div>`;
  el._restoreFocus = previouslyFocused;

  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.hasAttribute("data-close")) closeHelp();
  });
  document.body.appendChild(el);
  el.querySelector("[data-close]").focus();
}
