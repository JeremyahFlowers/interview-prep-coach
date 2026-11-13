// Settings: the connection, the numbers that drive the schedule, and the
// state of your data.
//
// Where this fits: its own page, and the only one that writes to
// state.settings. It is also where the app is at its most honest — the sync
// footprint, the fault log and the import inspector all exist so that when
// something goes wrong you can see what, rather than being told to try again.

import {
  parseBoxIntervals, validateBoxIntervals, syncFootprint, formatBytes,
  dayTimerElapsedMs, dayTimerAdjustmentMin, adjustDayTimer,
  questionMinutes, planMinutes, questionPlan, READ_MINUTES, REFLECT_MINUTES, inspectImport,
  describeState, todayISO, exactDayOf, isRecord} from "./logic.js";
import { splitBudget, designShare, designAttempts } from "./design-logic.js";
import { APP_VERSION, RELEASED } from "./version.js";
import { migrateState } from "./seed.js";
import { resetWelcome } from "./welcome.js";
import { recentFaults, clearFaults, report, AppError, IMPORT_UNPARSEABLE, IMPORT_INVALID } from "./errors.js";
import { esc, toast, downloadState, confirmLoss } from "./ui.js";
import {
  STARTING_POINTS, TARGETS, LEVELS, INTENSITIES, DEFAULT_PREP,
  prepOf, prepStatus, dayPlan, applyIntensity, planStart, dailyBand, ignoredSavedDates,
} from "./prep.js";
import { LANGUAGES, fluencySummary } from "./fluency.js";
import { passedReadoutHtml } from "./after-interview.js";
import {
  DAYS, ITEM_KINDS, WEEK_TEMPLATES, MAX_ITEM_COUNT, clampItemCount, problemsInForce,
  designDaysPlaced, designDaysHint, fixedDesignOf, templateByKey, volumeFromInput, weekSettings, weekRepairs, repairTotal, ignoredStoredWeek,
  weekPlan, itemKind, itemCount, countThatFits, kindSwitchFits, hasItemAt, parseSlot,
  dayMinutes, dayIsCapped, dayIsFull, HOURS_PER_DAY, weeklyMinutes, isRestDay, dayKeyOf, problemsForBand, codingDays,
} from "./week.js";
import { storageKey } from "./channel.js";
import { STORAGE_MODE } from "./store.js";
import { githubFormHtml, readGithubForm } from "./setup-view.js";
import { setWeek } from "./week-history.js";
import { plannedWithTicks, sittingsWord, sittingsBreakdown, sittingPartLabel } from "./sittings.js";


// ---------- Settings ----------

/**
 * Anything that has gone wrong this session.
 *
 * Hidden when there is nothing to report, so it is never a worry on a healthy
 * install. It exists because the console is not reachable on a phone, and
 * "something went wrong" with no detail leaves nobody able to act.
 */
/**
 * How close the synced log is to the size GitHub will accept.
 *
 * Hidden until it matters. A storage meter on an otherwise healthy install is
 * an anxiety with nothing attached to it — but crossing the limit fails every
 * save at once, so the warning has to arrive while shedding weight is still a
 * choice.
 */
function footprintCardHtml(state) {
  const f = syncFootprint(state);
  if (!f.warn) return "";
  const pct = Math.round(f.fraction * 100);
  return `
    <div class="card ${f.over ? "banner banner-bad" : "banner banner-warn"}">
      <h2 style="margin-top:0">${f.over ? "Your log is too large to sync" : "Your log is getting large"}</h2>
      <p class="small">${esc(formatBytes(f.total))} of ${esc(formatBytes(f.limit))} used (${pct}%).
      ${f.over
        ? "Saves are failing until this comes down. Nothing is lost — it's all still on this device."
        : "Everything still saves normally; this is a heads-up while there's room to act."}</p>
      <ul class="footprint-list muted small">
        <li><strong>${esc(formatBytes(f.breakdown.attempts))}</strong> — your ${f.counts.attempts}
          logged attempts, everything they hold. Of that,
          ${esc(formatBytes(f.breakdown.code))} is saved code from ${f.counts.withCode} of them
          and ${esc(formatBytes(f.breakdown.notes))} is what you wrote.</li>
        <li><strong>${esc(formatBytes(f.breakdown.statements))}</strong> — problem statements,
          across ${f.counts.withStatement} problems.</li>
        <li><strong>${esc(formatBytes(f.breakdown.rest))}</strong> — everything else: the problems
          themselves, settings, your streak, mocks and the journal.</li>
      </ul>
      <p class="muted small">Attempts are what grows, and they grow forever — each one costs about
      the same whether or not you keep its code. Deleting a problem you have finished with takes its
      attempts and its statement with it, which is the largest single thing you can do. An attempt
      you don't need can go from that problem's history.</p>
    </div>`;
}

/** How long ago, in words. Coarse on purpose: the useful distinction is
 * "just now" against "before you shut the laptop", not the exact minute. */
function agoText(ms) {
  if (!ms) return "not yet this session";
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Sync state, and the controls for it.
 *
 * "Synced" in the header says the last attempt worked, not when — and there
 * was no way to pull a change made on another device short of reloading, or to
 * retry a failed push without making another change first.
 */
function syncCardHtml(store) {
  const unsaved = store.dirty;
  // Spelled out rather than left to a tooltip. If saving has actually stopped,
  // the one thing someone needs to know is whether to keep working — and a
  // title attribute is not where anyone looks for that.
  const stalled = store.status === "offline" || store.status === "error";
  return `
    <div class="card">
      <h2>Sync</h2>
      <p class="muted small">
        Last synced ${esc(agoText(store.lastSyncedAt))}.
        ${unsaved
          ? "You have changes that haven't reached GitHub yet."
          // Only claimed when a sync has actually succeeded. It read
          // "Everything here is on GitHub" beside a 401, which is the kind of
          // confident wrong answer that stops people trusting the rest.
          : store.lastSyncedAt ? "Everything here is on GitHub."
          : "Nothing has reached GitHub yet."}
        ${store.error ? `<br/><span class="budget-warn">${esc(store.error)}</span>` : ""}
      </p>
      ${stalled ? `<p class="banner banner-warn small" style="margin:0.5rem 0">
        <strong>Keep working — nothing is lost.</strong> Everything is saved on this device and will
        go to GitHub on its own once it can. Until then this is the only copy, so avoid clearing your
        browser data or switching devices.</p>` : ""}
      <div class="row gap-sm" style="margin-top:0.6rem;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="sync-pull" ${unsaved ? "disabled" : ""}
          title="${unsaved ? "Save your changes first" : "Fetch changes made on another device"}">Check for changes</button>
        <button class="btn btn-ghost btn-sm" id="sync-push" ${unsaved ? "" : "disabled"}
          title="${unsaved ? "Send your unsaved changes now" : "Nothing waiting to send"}">Save now</button>
      </div>
    </div>`;
}

function faultLogHtml() {
  const faults = recentFaults();
  if (!faults.length) return "";
  return `
    <div class="card">
      <h2>Recent problems</h2>
      <p class="muted small">${faults.length} this session. These are already handled — the app
      kept working — but they are worth reporting if something looks wrong.</p>
      <ul class="fault-list">
        ${faults.map((f) => `<li>${esc(f.at.slice(11, 19))} · ${esc(f.code)}${f.context ? ` · ${esc(f.context)}` : ""} — ${esc(f.message)}</li>`).join("")}
      </ul>
      <button class="btn btn-ghost btn-sm" id="clear-faults" style="margin-top:0.6rem">Clear</button>
    </div>`;
}

/**
 * How much of the day goes to system design.
 *
 * Off by default, including for every log that existed before this shipped.
 * The two halves belong in the same day — that is the whole premise — but
 * taking minutes from somebody who never asked for it is not how it gets there.
 *
 * Expressed as a share rather than a number of minutes so it survives changing
 * the daily budget: raise the day from 75 to 90 and the split moves with it,
 * rather than quietly becoming a different ratio.
 */
const DESIGN_PRESETS = [
  { share: 0, label: "Off", note: "Coding only." },
  { share: 0.2, label: "A fifth", note: "A design problem every few days." },
  { share: 0.4, label: "Two fifths", note: "45 coding / 30 design in a 75-minute day." },
  { share: 0.5, label: "Half and half", note: "For when the design round is the one you are worried about." },
];

function designCardHtml(state) {
  const split = splitBudget(state);
  const current = designShare(state);
  const worked = designAttempts(state).length;
  return `
    <div class="card">
      <h3>System design share</h3>
      <p class="muted small">System design is assessed in the same loop as coding and is worth
      preparing in the same loop. This decides how much of your daily budget goes to it — the
      minutes are split, not added, so the day stays the length you set.</p>
      <form id="design-share-form" class="form">
        <div class="choice-row">
          ${DESIGN_PRESETS.map((preset) => `
            <label class="field checkbox-field">
              <input type="radio" name="designShare" value="${preset.share}"
                ${Math.abs(current - preset.share) < 0.001 ? "checked" : ""} />
              <span><strong>${esc(preset.label)}</strong><br />
              <span class="muted small">${esc(preset.note)}</span></span>
            </label>`).join("")}
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Save</button>
      </form>
      <p class="muted small">${split.enabled
        ? `Today: ${split.codingMin} minutes coding, ${split.designMin} design.`
        : "Today: all of it is coding."}${worked ? ` ${worked} design attempt${worked === 1 ? "" : "s"} recorded.` : ""}</p>
    </div>`;
}

/**
 * Where the live relay is, if there is one.
 *
 * Optional, and the app is complete without it: with no relay, a drawing still
 * follows you between devices within a few seconds, because the durable copy in
 * your own repo is what makes that work. The relay only makes it immediate,
 * which matters when two screens are open at once — a tablet beside a laptop,
 * or an interviewer watching.
 *
 * Empty by default, deliberately. Pointing this at somebody else's server means
 * a session's strokes and code pass through it, and that should be a thing you
 * typed in rather than a default you inherited.
 */
function liveSyncCardHtml(state) {
  const url = state.settings?.relayUrl || "";
  return `
    <div class="card">
      <h3>Live sync</h3>
      <p class="muted small">Without this, a drawing follows you between devices in a few seconds,
      through your own repo. With it, a stroke appears on the other screen as you draw — which is
      what two screens at once needs, and what a mock interview with somebody watching needs.</p>
      <p class="muted small">It relays and stores nothing, and only ever carries the session in
      front of you: the problem, the drawing, the code. Never your log. Run your own with
      <code>node relay/server.mjs</code> — see <code>relay/README.md</code>.</p>
      <form id="relay-form" class="settings-form">
        <label class="field"><span class="label">Relay address</span>
          <input class="input" name="relayUrl" type="url" placeholder="https://your-relay.example.com"
                 value="${esc(url)}" style="max-width:22rem" /></label>
        <button class="btn btn-primary btn-sm" type="submit">Save</button>
      </form>
      <p class="muted small">${url
        ? "Sessions started from now on will use it. Leave it empty to turn live sync off."
        : "Off. Everything works; cross-device updates just take a few seconds instead of a moment."}</p>
    </div>`;
}

/**
 * How long one question gets, and how much of it is for planning.
 *
 * Two tables rather than one, because they answer different questions. The
 * total is how long you are giving yourself; the planning share is the
 * judgement call — too low trains you to type before you know the shape of the
 * answer, which is the commonest way a solvable problem goes wrong, and too
 * high leaves you with a good plan and no clock.
 *
 * Reading and reflecting are not settable. Reading is five minutes whether the
 * problem is easy or hard, and the reflection is the thing this app exists to
 * collect — making it adjustable would make it the first thing to be set to
 * zero.
 */
const TIMEBOX_DIFFICULTIES = ["Easy", "Medium", "Hard", "Unrated"];

function timeboxCardHtml(state) {
  const total = (d) => questionMinutes(state, d);
  const planning = (d) => planMinutes(state, d);
  return `
    <div class="card">
      <h3>Time per question</h3>
      <p class="muted small">A box for one problem, so a single medium can't absorb the whole day.
      Nothing stops when a phase ends — the session says where you are and what the phase is for,
      and going over is counted rather than hidden. ${READ_MINUTES} minutes for reading and
      ${REFLECT_MINUTES} for writing down what happened come off the top of every box.</p>
      <form id="timebox-form">
        <div class="table-wrap">
          <table class="table timebox-table">
            <thead><tr><th>Difficulty</th><th>Total</th><th>Of that, planning</th><th>Leaves for code</th></tr></thead>
            <tbody>
              ${TIMEBOX_DIFFICULTIES.map((d) => {
                const phases = questionPlan(state, d).phases;
                const code = phases.find((x) => x.key === "code");
                return `
                <tr>
                  <td>${esc(d)}</td>
                  <td><input class="input input-xs" type="number" min="1" max="240"
                        name="total-${esc(d)}" value="${total(d)}" aria-label="${esc(d)} total minutes" /></td>
                  <td><input class="input input-xs" type="number" min="1" max="240"
                        name="plan-${esc(d)}" value="${planning(d)}" aria-label="${esc(d)} planning minutes" /></td>
                  <td class="num muted">${code ? `${code.minutes} min` : "—"}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Save times</button>
      </form>
    </div>`;
}

/**
 * Today's clock, and the ability to correct it.
 *
 * It feeds the budget ring and the plant's health, and until now it could only
 * run or pause — leave it going over lunch and the day was spent, with no way
 * to say otherwise. A number you cannot correct is a number you stop trusting,
 * and then stop looking at, which costs more than the wrong forty minutes did.
 *
 * Here rather than on the widget, which the plant deliberately keeps to a
 * visual cue and one pause button, and rather than on the Dashboard, where a
 * budget card was tried and disliked. The correction belongs beside the number
 * it corrects.
 */
function clockCardHtml(state) {
  const used = Math.round(dayTimerElapsedMs(state) / 60000);
  const correction = Math.round(dayTimerAdjustmentMin(state));
  return `
    <div class="card">
      <h3>Today's clock</h3>
      <p class="muted small">What the day clock has counted so far. Correct it if it ran while you
      weren't working — the reading it measured is kept, and the correction is shown as one.</p>
      <div class="row gap-sm" style="align-items:baseline">
        <span class="stat-num">${used}</span><span class="stat-label">min today</span>
        <span class="row gap-sm" style="margin-left:auto">
          ${[-30, -15, -5, 5].map((d) => `<button type="button" class="btn btn-ghost btn-xs"
            data-adjust-clock="${d}">${d > 0 ? "+" : ""}${d}</button>`).join("")}
        </span>
      </div>
      ${correction
        ? `<p class="muted small">Includes a correction of ${correction > 0 ? "+" : ""}${correction}
           min. <button type="button" class="link-button" id="clear-clock-correction">Undo it</button></p>`
        : ""}
    </div>`;
}

/**
 * Where the log is when it is only on this device, and the way to GitHub.
 *
 * Says what the risk is before offering the fix, because the person who picked "start on this
 * device" did so to avoid setup and may not have registered that clearing browser data deletes the log.
 */
function storageCardHtml(store) {
  return `
    <div class="card" data-testid="storage-card">
      <h3>Storage</h3>
      ${store.status === "error" && store.error
        ? `<p class="banner banner-bad small" data-testid="storage-error">${esc(store.error)}</p>` : ""}
      <p class="muted">Your log is saved in this browser, on this device only. Clearing your browser
      data, or using a private window, deletes it — and nothing else holds a copy.</p>
      <div class="row gap-sm" style="margin-bottom:0.8rem">
        <button class="btn btn-primary" type="button" data-testid="export-now">Export now</button>
      </div>
      <details data-testid="back-up-to-github">
        <summary>Back up to GitHub</summary>
        <p class="muted small">Uploads this log to a private repo you own, and keeps it in step from
        then on. Nothing on this device is replaced.</p>
        ${githubFormHtml({ formId: "backup-form", submitLabel: "Upload my log to GitHub" })}
      </details>
    </div>`;
}

/** The GitHub connection, and the way back to keeping the log on this device. */
function githubCardHtml(cfg) {
  return `
    <div class="card">
      <h3>GitHub connection</h3>
      <p class="muted">${esc(cfg.owner)}/${esc(cfg.repo)} @ ${esc(cfg.branch)} — <code>${esc(cfg.path)}</code></p>
      <p class="muted small">Every change is written straight to that file, which is what lets the
      same log follow you between laptop and phone. Either button below only affects this
      device — nothing on GitHub is touched, and reconnecting brings it all back.</p>
      <div class="row gap-sm">
        <button class="btn btn-ghost" id="use-device-only" data-testid="use-device-only">Use this device only</button>
        <button class="btn btn-ghost" id="disconnect">Disconnect this device</button>
      </div>
      <p class="muted small" style="margin-top:0.5rem">"Use this device only" keeps your log here
      and stops syncing; "Disconnect" also removes the copy stored in this browser.</p>
    </div>`;
}

export function renderSettings(root, store, actions) {
  const state = store.state;
  const local = store.mode === STORAGE_MODE.LOCAL;
  const cfg = JSON.parse(localStorage.getItem(storageKey("ledger.config")) || "{}");

  root.innerHTML = `
    <!-- Anything wrong sits above the sections, unheaded, because it is a
         state of the app rather than something you came here to change.
         All three render nothing when there is nothing to say. -->
    ${local ? "" : syncCardHtml(store)}
    ${local ? "" : footprintCardHtml(store.state)}
    ${faultLogHtml()}

    <nav class="settings-jump" aria-label="Settings sections">
      <a href="#set-prep">What you're preparing for</a>
      <a href="#set-week">Your week</a>
      <a href="#set-practice">How practice works</a>
      <a href="#set-data">Your data</a>
      <a href="#set-app">This app</a>
    </nav>

${prepSectionHtml(state)}

    ${weekSectionHtml(state)}

    <section class="settings-section">
      <h2 id="set-practice" tabindex="-1">How practice works</h2>
      <p class="muted small">The two numbers the schedule is built out of. Changing either affects
      what comes up next; nothing already recorded is altered.</p>
<div class="card">
      <h3>Daily budget</h3>
      <p class="muted small">Set as a band under
        <a href="#set-prep">What you're preparing for</a>
      <a href="#set-week">Your week</a>, because a ceiling on its own implies that
        more is always better. Today's plan is filled up to the ceiling with whatever you find
        hardest and have not seen in longest; the rest waits in the refresher queue rather than
        being piled onto today.</p>
${timeboxCardHtml(store.state)}
${designCardHtml(store.state)}
${liveSyncCardHtml(store.state)}
${clockCardHtml(store.state)}
<div class="card">
      <h3>Review intervals</h3>
      <p class="muted small">How long each box waits before a problem comes round again. A clean
      solve moves up a box, a struggle holds, a failure drops back to the first. The defaults are
      a standard Leitner ladder; shorten them if things are fading before they come back, lengthen
      them if refreshers feel unnecessary.</p>
      <form id="intervals-form" class="settings-form">
        <label class="field"><span class="label">Days per box, in order</span>
          <input class="input" name="boxIntervalsDays" style="max-width:18rem"
            value="${esc(state.settings.boxIntervalsDays.join(", "))}" /></label>
        <button class="btn btn-primary btn-sm" type="submit">Save intervals</button>
      </form>
      <p class="muted small" style="margin-top:0.5rem">Currently ${state.settings.boxIntervalsDays.length}
      boxes: ${state.settings.boxIntervalsDays.map((d, i) => `box ${i} after ${d} day${d === 1 ? "" : "s"}`).join(", ")}.
      Changing these affects when problems next come up; nothing already recorded is altered.</p>
    </div>
    </section>

    <section class="settings-section">
      <h2 id="set-data" tabindex="-1">Your data</h2>
      <p class="muted small">Where the log lives, and how to get a copy of it.</p>
${local ? storageCardHtml(store) : githubCardHtml(cfg)}
<div class="card">
      <h3>Backup</h3>
      <p class="muted small">Your prep log lives ${local ? "in this browser" : "in your repo"}, so this is for
      moving it somewhere else or keeping a copy outside ${local ? "this browser" : "GitHub"}. The export is the whole state — problems,
      attempts, soul statements, streaks. Importing replaces everything currently here.</p>
      <div class="row gap">
        <button class="btn btn-ghost" id="export-json">Export JSON</button>
        <label class="btn btn-ghost file-btn">Import JSON<input type="file" id="import-json" accept="application/json" hidden /></label>
      </div>
    </div>
    </section>

    <section class="settings-section">
      <h2 id="set-app" tabindex="-1">This app</h2>
      <div class="card version-card">
        <div class="row space-between" style="align-items:baseline;flex-wrap:wrap;gap:0.5rem">
          <h3 style="margin:0">Ledger <span class="version-number">v${esc(APP_VERSION)}</span></h3>
          <span class="muted small">released ${esc(RELEASED)}</span>
        </div>
        <p class="muted small" style="margin:0.4rem 0 0">What changed in this version, and every one
        before it, is in <a href="./CHANGELOG.md"
        target="_blank" rel="noopener noreferrer">the changelog</a>.</p>
        <button class="btn btn-ghost btn-sm" id="replay-welcome" style="margin-top:0.6rem">What is this app for?</button>
      </div>
<div class="card">
      <h3>Theme</h3>
      <select class="select" id="theme-select" style="max-width:12rem">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
    </section>`;

  root.querySelector("#design-share-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = Number(new FormData(e.target).get("designShare"));
    const share = Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0;
    store.mutate((st) => { st.settings.designShare = share; }, "Ledger: set the design share");
    const split = splitBudget({ settings: { ...store.state.settings, designShare: share } });
    toast(share
      ? `${split.codingMin} minutes coding, ${split.designMin} design.`
      : "System design off — the whole day is coding.");
    actions.rerender();
  });

  root.querySelector("#relay-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = String(new FormData(e.target).get("relayUrl") || "").trim();
    if (raw) {
      // Checked here rather than left to fail silently at session start, where
      // the only symptom would be sync not happening for no stated reason.
      let parsed;
      try {
        parsed = new URL(raw);
      } catch (_) {
        toast("That isn't a web address. It should look like https://your-relay.example.com");
        return;
      }
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
        toast("Use https — an http relay would send your session in the clear.");
        return;
      }
    }
    store.mutate((st) => { st.settings.relayUrl = raw; }, "Ledger: set live sync relay");
    toast(raw ? "Live sync on for new sessions." : "Live sync off.");
    actions.rerender();
  });

  root.querySelector("#timebox-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const read = (prefix, d) => {
      const raw = Number(f.get(`${prefix}-${d}`));
      return Number.isFinite(raw) && raw >= 1 ? Math.min(240, Math.round(raw)) : null;
    };
    const totals = {};
    const plans = {};
    for (const d of TIMEBOX_DIFFICULTIES) {
      const t = read("total", d);
      const p = read("plan", d);
      if (t == null || p == null) {
        toast(`${d} needs a number of minutes, at least 1.`);
        return;
      }
      totals[d] = t;
      // Clamped against its own total rather than refused: planning longer than
      // the whole box is a typo, and the useful response is the largest thing
      // they could have meant.
      plans[d] = Math.min(p, Math.max(1, t - READ_MINUTES - REFLECT_MINUTES - 1));
    }
    store.mutate((st) => {
      st.settings.questionMinutes = totals;
      st.settings.planMinutes = plans;
    }, "Ledger: update time per question");
    const clamped = TIMEBOX_DIFFICULTIES.filter((d) => plans[d] !== read("plan", d));
    toast(clamped.length
      ? `Saved. Planning time trimmed for ${clamped.join(", ")} to leave room to code.`
      : "Saved.");
    actions.rerender();
  });

  root.querySelectorAll("[data-adjust-clock]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const asked = Number(btn.dataset.adjustClock);
      let applied = 0;
      store.mutate((s) => { applied = adjustDayTimer(s, asked); }, "Ledger: correct today's clock");
      // Says what happened rather than what was asked for: subtracting half an
      // hour from a ten-minute day removes ten minutes, because the rest of it
      // never happened.
      toast(applied === asked
        ? `${applied > 0 ? "Added" : "Removed"} ${Math.abs(Math.round(applied))} min.`
        : `Removed ${Math.abs(Math.round(applied))} min — that was all there was on the clock.`);
      actions.rerender();
    });
  });

  root.querySelector("#clear-clock-correction")?.addEventListener("click", () => {
    store.mutate((s) => { s.dayTimer.adjustmentMs = 0; }, "Ledger: undo clock correction");
    toast("Correction removed.");
    actions.rerender();
  });

  root.querySelector("#replay-welcome")?.addEventListener("click", () => {
    resetWelcome();
    actions.rerender();
  });

  root.querySelector("#sync-pull")?.addEventListener("click", async () => {
    try {
      await store.refreshFromRemote();
      toast("Up to date.");
    } catch (err) {
      report(new AppError(err.message || "Couldn't reach GitHub.", { code: err.code || "sync_pull", cause: err }),
        "checking for changes");
    }
  });
  root.querySelector("#sync-push")?.addEventListener("click", async () => {
    await store.flush("Ledger: manual save");
    toast(store.dirty ? "Still unsaved — see the message above." : "Saved to GitHub.");
  });

  root.querySelector("#clear-faults")?.addEventListener("click", () => {
    clearFaults();
    actions.rerender();
  });

  root.querySelector("#intervals-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = new FormData(e.target).get("boxIntervalsDays");
    const values = parseBoxIntervals(raw);
    const check = validateBoxIntervals(values);
    if (!check.ok) {
      // Refused with the reason, not silently ignored: a bad table here is
      // not a bad preference, it is a schedule that stops working.
      report(new AppError(check.errors.join(" "), { code: "bad_intervals" }), "saving your intervals");
      return;
    }
    store.mutate((s) => {
      s.settings.boxIntervalsDays = values;
      // Existing problems may now sit in a box the new table no longer has.
      for (const p of s.problems) p.box = Math.min(p.box || 0, values.length - 1);
    }, "Ledger: update review intervals");
    toast("Saved — this affects when problems next come up.");
  });

  wirePrepSection(root, store);
  wireWeekSection(root, store);

  root.querySelector("#use-device-only")?.addEventListener("click", () => {
    if (confirmLoss({
      action: "Keep your log on this device only?",
      lost: "the token, and syncing — changes stop going to GitHub",
      kept: "your whole log here, and everything already in your repo",
    })) {
      store.useThisDeviceOnly();
    }
  });

  root.querySelector("#backup-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await store.enableGitHub(readGithubForm(new FormData(e.target)));
    } catch (err) {
      report(err instanceof AppError ? err
        : new AppError(err.message || "Couldn't reach GitHub.", { code: err.code || "enable_github", cause: err }),
      "backing up to GitHub");
    }
  });

  root.querySelector('[data-testid="export-now"]')?.addEventListener("click", () => downloadState(state));

  root.querySelector("#disconnect")?.addEventListener("click", () => {
    if (confirmLoss({
      action: "Disconnect this device?",
      lost: "the token and the cached copy stored in this browser",
      kept: "everything in your repo — reconnect here and it all comes back",
    })) {
      store.disconnect();
    }
  });

  root.querySelector("#export-json").addEventListener("click", () => downloadState(state));

  root.querySelector("#import-json").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Reset the input so picking the same file twice fires change again —
    // otherwise a refused import cannot be retried after fixing the file.
    e.target.value = "";

    let imported;
    try {
      imported = JSON.parse(await file.text());
    } catch (err) {
      report(new AppError(`${file.name} isn't valid JSON, so nothing was changed.`,
        { code: IMPORT_UNPARSEABLE, cause: err }), "reading that file");
      return;
    }

    // Checked before anything is touched. This replaces the whole prep log,
    // and it used to accept any JSON that parsed — a truncated download or an
    // unrelated file silently destroyed every problem, attempt and note.
    const found = inspectImport(imported);
    if (!found.ok) {
      report(new AppError(`${file.name} doesn't look like a Ledger backup: ${found.errors.join(" ")} Nothing was changed.`,
        { code: IMPORT_INVALID }), "checking that file");
      return;
    }

    // Confirmed against what it holds and what it would replace, rather than
    // against the word "everything".
    const incoming = `${found.problems} problem${found.problems === 1 ? "" : "s"} and `
      + `${found.attempts} attempt${found.attempts === 1 ? "" : "s"}`
      + (found.appVersion ? `, last written by Ledger ${found.appVersion}` : "");
    if (!confirmLoss({
      action: `Replace your prep log with ${file.name}?`,
      lost: `${describeState(state)} — everything currently on this device`,
      kept: `nothing from before; the file's ${incoming} replaces all of it`,
    })) return;

    store.mutate((s) => {
      // Replaced, not merged. Object.assign left any key the file omitted in
      // place, producing a state half from each — a 2024 problem list beside
      // a 2026 streak.
      for (const key of Object.keys(s)) delete s[key];
      Object.assign(s, migrateState(imported));
    }, "Ledger: import state.json");
    toast(`Imported ${found.problems} problems and ${found.attempts} attempts.`);
  });

  const themeSelect = root.querySelector("#theme-select");
  themeSelect.value = localStorage.getItem(storageKey("ledger.theme")) || "system";
  themeSelect.addEventListener("change", () => {
    const v = themeSelect.value;
    localStorage.setItem(storageKey("ledger.theme"), v);
    document.documentElement.dataset.theme = v === "system" ? "" : v;
  });
}

/** Stable selectors for the notes below, named once so tests and styles do not repeat the strings. */
const TARGET_IGNORED_TESTID = "prep-target-date-ignored";
const START_IGNORED_TESTID = "prep-start-date-ignored";
/** The saved text is never echoed (it can be any JSON); the note only says the app cannot read it. */
const ignoredDateWording = (which) => `The saved ${which} is not a date the app can read, so it is treated as not set.
  Choosing an interview date above replaces it.`;

/**
 * A quiet note per saved date the app is treating as not set, or "" when none is. Explains a missing run-up without
 * repairing anything: the saved file is unchanged until a date is chosen. Removing the call in prepSectionHtml removes
 * the feature.
 */
function ignoredDateNotesHtml(state) {
  const ignored = ignoredSavedDates(state);
  const note = (testid, which) => `<p class="muted small" data-testid="${testid}">${ignoredDateWording(which)}</p>`;
  return (ignored.targetDate ? note(TARGET_IGNORED_TESTID, "interview date") : "")
    + (ignored.startedOn ? note(START_IGNORED_TESTID, "start date") : "");
}

/** True when "No date yet" would clear something: an interview date, or a saved start date the app cannot read. */
function hasDateToClear(state) {
  return Boolean(prepOf(state).targetDate) || ignoredSavedDates(state).startedOn;
}

/**
 * What you are preparing for, and what the app does differently because of it.
 *
 * Four answers, none of them required. They are saved as they change rather
 * than behind a Save button: these are choices, every one is reversible, and a
 * form that makes you confirm a radio button is a form nobody finishes.
 */
function prepSectionHtml(state) {
  const prep = prepOf(state);
  const status = prepStatus(state);
  const plan = dayPlan(state);
  const suggested = status.suggestedIntensity;

  const choice = (name, items, current, extra = (i) => "") => `
    <div class="choice-row" data-prep-field="${name}">
      ${items.map((i) => `
        <label class="field checkbox-field">
          <input type="radio" name="${name}" value="${esc(i.key)}" ${i.key === current ? "checked" : ""} />
          <span><strong>${esc(i.label)}</strong>${i.hint ? ` <span class="muted small">${esc(i.hint)}</span>` : ""}${extra(i)}<br />
          <span class="muted small">${esc(i.note)}</span></span>
        </label>`).join("")}
    </div>`;

  return `
    <section class="settings-section">
      <h2 id="set-prep" tabindex="-1">What you're preparing for</h2>
      <p class="muted small">All of it optional, and saved as you change it. Answer none of it and
      the app behaves exactly as it did before — these only exist because the same advice is wrong
      for somebody six months out and somebody interviewing on Friday.</p>

      <div class="card">
        <h3>The run-up</h3>
        <p class="muted small">A date turns the plan into a run-up with a shape: patterns one at a
        time early, interleaved in the middle, and randomised under a hard clock at the end. Without
        one everything stays interleaved, which is the sensible default and what the app already did.</p>
        <form id="prep-when" class="settings-form">
          <label class="field inline"><span class="label">Interview on</span>
            <input class="input" type="date" name="targetDate" value="${esc(prep.targetDate || "")}"
              style="max-width:11rem" /></label>
          ${hasDateToClear(state) ? `<button class="btn btn-ghost btn-sm" type="button" id="prep-clear-date">No date yet</button>` : ""}
        </form>${ignoredDateNotesHtml(state)}
        ${passedReadoutHtml(status.passed)}
        ${status.weeksOut != null ? `
          <p class="prep-readout">
            <strong>${status.weeksOut} week${status.weeksOut === 1 ? "" : "s"}</strong> out ·
            <span class="pill pill-muted">${esc(status.phase.label)}</span>
          </p>
          <p class="muted small">${esc(status.phase.detail)}</p>` : ""}

        <h4 class="small-heading">Where you're starting</h4>
        ${choice("startingPoint", STARTING_POINTS, prep.startingPoint)}
        ${status.tight ? `
          <p class="banner banner-warn prep-warn">A ${status.weeksOut}-week run-up from here is
          tight — ${esc(status.startingPoint.label.toLowerCase())} usually wants about
          ${status.startingPoint.weeksNeeded}. Worth knowing rather than worth changing: it is your
          date. It does mean the day has to be denser, which is what the suggestion below reflects.</p>` : ""}
      </div>

      <div class="card">
        <h3>What you're aiming at</h3>
        <p class="muted small">Not the company's name — what the loop assumes you already have. A
        top-tier loop treats fluency and clean first-draft code as the floor and spends its time on
        ambiguity; elsewhere, a correct answer is the bar.</p>
        ${choice("target", TARGETS, prep.target)}
        <h4 class="small-heading">Your language</h4>
        <p class="muted small">The one you will interview in. Sessions open in it, and the
        fluency drill under Learn → Quiz teaches it until the syntax takes no thought — the half
        of a top-tier loop that is assumed rather than tested.</p>
        <div class="choice-row" data-prep-field="language">
          ${Object.entries(LANGUAGES).map(([key, lang]) => `
            <label class="field checkbox-field">
              <input type="radio" name="language" value="${key}" ${prep.language === key ? "checked" : ""} />
              <span><strong>${esc(lang.label)}</strong><br />
              <span class="muted small">${esc(fluencyLine(state, key))}</span></span>
            </label>`).join("")}
        </div>

        <h4 class="small-heading">Level</h4>
        ${choice("level", LEVELS, prep.level, (i) =>
          i.designShare > 0 ? ` <span class="pill pill-muted">${Math.round(i.designShare * 100)}% design</span>` : "")}
      </div>

      <div class="card">
        <h3>How much a day</h3>
        <p class="muted small">A band rather than a number: a floor below which there was no room for
        the review, and a ceiling past which deliberate practice stops being deliberate. Two hours is
        the top of what most people sustain at this kind of work.</p>
        ${choice("intensity", INTENSITIES, prep.intensity, (i) =>
          i.key === suggested.key && !prep.intensity
            ? ` <span class="pill pill-good">suggested</span>`
            : i.key === suggested.key ? ` <span class="pill pill-muted">suggested</span>` : "")}
        ${prep.intensity ? `<button class="btn btn-ghost btn-sm" type="button" id="prep-follow">Follow the suggestion instead</button>` : ""}

        <form id="prep-band" class="settings-form" style="margin-top:0.8rem">
          <label class="field inline"><span class="label">Floor</span>
            <input class="input" type="number" name="dailyFloorMin" min="5" max="480"
              value="${plan.band.min}" style="max-width:5.5rem" /></label>
          <label class="field inline"><span class="label">Ceiling</span>
            <input class="input" type="number" name="dailyBudgetMin" min="10" max="480"
              value="${plan.band.max}" style="max-width:5.5rem" /></label>
          <button class="btn btn-primary btn-sm" type="submit">Save</button>
        </form>
        ${status.advice.level === "ok" ? "" : `
          <p class="banner ${status.advice.level === "bad" ? "banner-bad" : "banner-warn"} prep-warn">
            ${esc(status.advice.message)}</p>`}

        <h4 class="small-heading">A day this size</h4>
        <ol class="prep-blocks">
          ${plan.blocks.map((b) => `
            <li>
              <p class="prep-block-head"><strong>${esc(b.label)}</strong>
                <span class="muted small">${b.minutes} min</span></p>
              <ul class="tight-list">
                ${b.parts.map((part) => `<li><strong>${esc(part.label)}</strong>
                  <span class="muted small">${part.minutes}m — ${esc(part.prompt)}</span></li>`).join("")}
              </ul>
            </li>`).join("")}
        </ol>
        ${plan.blocks.length > 1 ? `<p class="muted small">${esc(plan.splitReason)}</p>` : ""}
      </div>
    </section>`;
}

/** How far the fluency drill has got in one language, in a line. */
function fluencyLine(state, lang) {
  const f = fluencySummary(state, lang);
  if (!f.seen) return `${f.total} idioms to drill`;
  return `${f.fluent} of ${f.total} without thinking`;
}

/** Saved on change: every one of these is a choice, and all of them reverse. */
function wirePrepSection(root, store) {
  const save = (fn, message) => store.mutate((s) => {
    s.settings.prep = { ...DEFAULT_PREP, ...(s.settings.prep || {}) };
    fn(s.settings.prep, s);
  }, message);

  root.querySelectorAll('[data-prep-field] input[type="radio"]').forEach((input) => {
    input.addEventListener("change", () => {
      const field = input.closest("[data-prep-field]").dataset.prepField;
      if (field === "intensity") {
        store.mutate((st) => applyIntensity(st.settings, input.value), "Ledger: prep — intensity");
        return;
      }
      save((prep) => { prep[field] = input.value; }, `Ledger: prep — ${field}`);
    });
  });

  root.querySelector('#prep-when input[name="targetDate"]')?.addEventListener("change", (e) => {
    const value = e.target.value || null;
    save((prep) => {
      prep.targetDate = value;
      // The phases divide the span between starting and the date, so a plan
      // with no start has nothing to divide. A saved start that is not a real
      // day reads as no start, so it is replaced rather than kept forever.
      if (value && !exactDayOf(prep.startedOn)) prep.startedOn = planStart();
      if (!value) prep.startedOn = null;
    }, "Ledger: prep — interview date");
  });

  root.querySelector("#prep-clear-date")?.addEventListener("click", () => {
    save((prep) => { prep.targetDate = null; prep.startedOn = null; }, "Ledger: prep — no date");
  });

  root.querySelector("#prep-follow")?.addEventListener("click", () => {
    save((prep) => { prep.intensity = null; }, "Ledger: prep — follow the suggestion");
  });

  root.querySelector("#prep-band")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const floor = Number(form.get("dailyFloorMin")) || 45;
    const ceiling = Number(form.get("dailyBudgetMin")) || 75;
    store.mutate((s) => {
      s.settings.dailyBudgetMin = Math.max(ceiling, floor);
      s.settings.dailyFloorMin = Math.min(floor, ceiling);
    }, "Ledger: update the day band");
    toast("Saved.");
  });
}

/** The stable selector for the note below, named once so tests and styles do not repeat the string. */
const REPAIRED_NOTE_TESTID = "week-repaired";
/** The stable selector for the note that a stored week was present but not used. */
const IGNORED_WEEK_TESTID = "week-ignored";
/** The stable selector for the note on a day that adds up to more than a day holds. */
const DAY_CAPPED_TESTID = "week-day-capped";
/** The note's wording. Plain, no judgement and no instruction; the hours come from the cap's own constant. */
const DAY_CAPPED_NOTE = `This day adds up to more than ${HOURS_PER_DAY} hours; it is counted as ${HOURS_PER_DAY}.`;
/** What the toast says when a count box stopped short of what was typed. Hours come from the cap's own constant. */
const COUNT_STOPPED_NOTE = `That would pass ${HOURS_PER_DAY} hours in a day, so it stopped at the most that fits.`;
/** What the toast says when a kind switch is refused because not even one of that kind fits the day. */
const KIND_NO_ROOM_NOTE = `There is no room for that in a day: it would pass ${HOURS_PER_DAY} hours.`;
/** Why "+ add" is off on a day that is exactly a day long, which has no note to point at. */
const DAY_FULL_TITLE = `This day already holds ${HOURS_PER_DAY} hours.`;
/** Selectors for the week summary line and for its bare count, so tests read the number without matching wording. */
const WEEK_SUMMARY_TESTID = "settings-week-summary";
const WEEK_SITTINGS_TESTID = "settings-week-sittings";
const WEEK_BREAKDOWN_TESTID = "settings-week-breakdown";
const DESIGN_DAYS_TESTID = "week-design-days";
const DESIGN_DAYS_HINT_TESTID = "week-design-days-hint";
/** How the design-days line calls a fixed session of each kind; one entry per kind a shape's `fixedDesign` can name. */
const FIXED_DESIGN_PHRASES = Object.freeze({ designMock: "a long design session" });
const dayLabelOf = (key) => DAYS.find((d) => d.key === key)?.label;
/** The clause naming a session the shape always places, or "" when it has none. Throws on a kind with no phrase. */
function fixedDesignClause(fixed) {
  if (!fixed) return "";
  const phrase = FIXED_DESIGN_PHRASES[fixed.kind];
  const day = dayLabelOf(fixed.day);
  if (!phrase || !day) throw new Error(`The design-days line cannot name a fixed ${fixed.kind} session on ${fixed.day}.`);
  return `, plus ${phrase} on ${day}`;
}
/** Leads the design-days line when the weekly box reads 0, so the line says what the box says. */
const DESIGN_DAYS_OFF_LEAD = "Design days are off. ";
/**
 * The muted line under the volume form: the shape's hint, with the session it always places named after the limit.
 * With the weekly box at 0 it says so first and keeps the ceiling and any fixed session, because that session is built
 * even at 0 and this line is the only place that explains it.
 */
const designDaysLine = (templateKey, value) => {
  const hint = designDaysHint(templateKey);
  const clause = fixedDesignClause(fixedDesignOf(templateKey));
  const line = clause ? hint.replace(/\.$/, `${clause}.`) : hint;
  return designDaysPlaced(templateKey, value) === 0 ? `${DESIGN_DAYS_OFF_LEAD}${line}` : line;
};
/** Fewest parts worth naming: one part is the total again, so it adds nothing. */
const MIN_PARTS_TO_SHOW = 2;

/**
 * What the total is made of, as a bracketed list of part labels, or "" when it has fewer than two parts. Removing the
 * call in weekSummaryHtml removes the feature; it reads the same week the total does, so the two cannot disagree.
 */
function weekBreakdownHtml(week) {
  const parts = sittingsBreakdown(week);
  if (parts.length < MIN_PARTS_TO_SHOW) return "";
  return ` <span data-testid="${WEEK_BREAKDOWN_TESTID}">(${parts.map(sittingPartLabel).join(", ")})</span>`;
}

/** The line under "The week": total sittings (count marked up alone for tests), what it is made of, hours planned, rest days. */
function weekSummaryHtml(week, totalMin, restDays) {
  const total = plannedWithTicks(week);
  return `<p class="muted small" data-testid="${WEEK_SUMMARY_TESTID}"><span data-testid="${WEEK_SITTINGS_TESTID}">${total}</span> ${sittingsWord(total)}${weekBreakdownHtml(week)} ·
          ${Math.round(totalMin / 60)}h ${totalMin % 60}m planned ·
          ${restDays} rest day${restDays === 1 ? "" : "s"}</p>`;
}

/**
 * A quiet note that reading the stored week left something out or changed it, or "" when nothing was.
 *
 * Plain on purpose: the plan on screen is already the repaired one, so this only says that it is, and that the saved
 * file still holds what it held. Calm wording, no blame, and no claim about why (a restore, a truncation or a hand
 * edit all look the same from here). Removing the call in weekSectionHtml removes the feature.
 */
function repairedNoteHtml(state) {
  const n = repairTotal(weekRepairs(state));
  if (n === 0) return "";
  return `<p class="muted small" data-testid="${REPAIRED_NOTE_TESTID}">${n} ${n === 1 ? "thing" : "things"} in your
    saved week ${n === 1 ? "was" : "were"} left out or changed to show it here. Your saved file is unchanged until you
    edit the week.</p>`;
}

/** The part of the ignored-week note that says what the saved week was; wording lives here so tests and the note agree. */
function ignoredWeekWhat(ignored) {
  if (ignored.entries === null) return "was not a list of days";
  return `had ${ignored.entries} ${ignored.entries === 1 ? "day" : "days"}, not ${DAYS.length}`;
}

/**
 * A quiet note that a saved week is present but was not used, or "" when it is used or absent.
 *
 * Says what the saved week looked like by its length only (its contents can be anything a damaged file holds), that the
 * page shows a week built from the shape instead, and that the saved file is unchanged until the person edits. Calm
 * wording, no blame and no claim about why. A recommendation the owner can reverse: removing the call in
 * weekSectionHtml removes the feature.
 */
function ignoredWeekNoteHtml(state) {
  const ignored = ignoredStoredWeek(state);
  if (!ignored) return "";
  return `<p class="muted small" data-testid="${IGNORED_WEEK_TESTID}">A saved week ${ignoredWeekWhat(ignored)}, so it was
    not used. The week below is built from the shape instead. Your saved file is unchanged until you edit the week.</p>`;
}

const dayNoteId = (day) => `week-day-note-${day.day}`;

/**
 * A quiet line saying a day is counted as a whole day though it asks for more, or "" when it is not. Removing the call in
 * weekSectionHtml removes the note; the disabled button is a separate, equally small piece (addButtonHtml).
 */
function dayFullNoteHtml(day) {
  if (!dayIsCapped(day)) return "";
  return `<p class="muted small" id="${dayNoteId(day)}" data-testid="${DAY_CAPPED_TESTID}">${DAY_CAPPED_NOTE}</p>`;
}

/**
 * The "+ add" button for a day. A full day gets it disabled, linked to the note when there is one and otherwise given a
 * title; attributes are written only when needed so a day with room is exactly the markup it always was.
 */
function addButtonHtml(day) {
  let off = "";
  if (dayIsFull(day)) off = dayIsCapped(day) ? ` disabled aria-describedby="${dayNoteId(day)}"` : ` disabled title="${DAY_FULL_TITLE}"`;
  return `<button type="button" class="link-button" data-week-add="${day.day}"${off}>+ add</button>`;
}

/**
 * The week: which days, and what each one is for.
 *
 * Pick a shape and a number of problems and the seven days fall out of it;
 * change any single day and the whole week is kept as edited from then on. The
 * editor is per day rather than a grid, because the question somebody actually
 * has is "what is Tuesday" and a grid makes them answer it by counting
 * columns.
 */
function weekSectionHtml(state) {
  const settings = weekSettings(state);
  const plan = weekPlan(state);
  const band = dailyBand(state);
  const suggestedProblems = problemsForBand(band, codingDays(plan) || 5);
  const totalMin = weeklyMinutes(plan);
  const today = dayKeyOf(todayISO());

  const countable = Object.values(ITEM_KINDS).filter((k) => k.key !== "rest");

  return `
    <section class="settings-section">
      <h2 id="set-week" tabindex="-1">Your week</h2>
      <p class="muted small">Set once. Everything else — what the dashboard asks for, what gets
      recommended, when it says you are done — reads from this. Problems rather than minutes,
      because eight problems a week is a commitment somebody keeps and "75 minutes a day" is one
      they break on the first Thursday they work late.</p>

      <div class="card">
        <h3>Shape</h3>
        <div class="choice-row" data-week-field="template">
          ${WEEK_TEMPLATES.map((t) => `
            <label class="field checkbox-field">
              <input type="radio" name="weekTemplate" value="${esc(t.key)}"
                ${t.key === settings.template && !plan.edited ? "checked" : ""} />
              <span><strong>${esc(t.label)}</strong><br />
              <span class="muted small">${esc(t.blurb)}</span></span>
            </label>`).join("")}
        </div>

        <form id="week-volume" class="settings-form" style="margin-top:0.8rem">
          <label class="field inline"><span class="label">Problems a week</span>
            <input class="input" type="number" name="problems" min="0" max="${MAX_ITEM_COUNT}"
              value="${problemsInForce(settings.problems)}" style="max-width:5.5rem" /></label>
          <label class="field inline"><span class="label">Design days a week</span>
            <input class="input" type="number" name="designPerWeek" min="0"
              max="${templateByKey(settings.template).maxDesignDays}" data-testid="${DESIGN_DAYS_TESTID}"
              value="${designDaysPlaced(settings.template, settings.design?.perWeek)}" style="max-width:5.5rem" /></label>
          <button class="btn btn-primary btn-sm" type="submit">Apply</button>
        </form>
        <p class="muted small" data-testid="${DESIGN_DAYS_HINT_TESTID}">${designDaysLine(settings.template, settings.design?.perWeek)}</p>
        <p class="muted small">Your band suggests about <strong>${suggestedProblems}</strong> a week
        at ${ITEM_KINDS.coding.minutesEach} minutes each including the review.
        ${plan.edited ? `This week has been edited by hand, so the shape above is not driving it —
          <button type="button" class="link-button" id="week-reset">rebuild it from a shape</button>.` : ""}</p>
      </div>

      <div class="card">
        <h3>The week</h3>
        ${weekSummaryHtml(plan, totalMin, plan.days.filter(isRestDay).length)}${repairedNoteHtml(state)}${ignoredWeekNoteHtml(state)}
        <ul class="week-grid">
          ${plan.days.map((d) => {
            const meta = DAYS.find((x) => x.key === d.day);
            const mins = dayMinutes(d);
            return `
            <li class="week-day${d.day === today ? " today" : ""}${isRestDay(d) ? " resting" : ""}"
                data-week-day="${d.day}">
              <p class="week-day-head">
                <strong>${esc(meta.label)}</strong>
                <span class="muted small">${isRestDay(d) ? "off" : `${mins}m`}</span>
              </p>${dayFullNoteHtml(d)}
              <ul class="week-items">
                ${d.items.map((item, i) => {
                  const kind = itemKind(item.kind);
                  return `<li>
                    <select class="select select-xs" data-week-item="${d.day}:${i}" aria-label="What ${esc(meta.label)} is for">
                      <option value="rest" ${item.kind === "rest" ? "selected" : ""}>Rest</option>
                      ${countable.map((k) => `<option value="${k.key}" ${item.kind === k.key ? "selected" : ""}>${esc(k.label)}</option>`).join("")}
                    </select>
                    ${kind?.countable ? `<input class="input input-xs" type="number" min="1" max="${MAX_ITEM_COUNT}"
                      value="${itemCount(item)}" data-week-count="${d.day}:${i}"
                      aria-label="How many" />` : ""}
                    ${d.items.length > 1 ? `<button type="button" class="link-button week-drop"
                      data-week-drop="${d.day}:${i}" aria-label="Remove">&times;</button>` : ""}
                  </li>`;
                }).join("")}
              </ul>
              ${isRestDay(d) ? "" : addButtonHtml(d)}
            </li>`;
          }).join("")}
        </ul>
      </div>
    </section>`;
}

function wireWeekSection(root, store) {
  /** The day as the plan currently has it, which is what a handler must judge against: the DOM may be stale. */
  const plannedDay = (day) => weekPlan(store.state).days.find((d) => d.day === day);

  /** Editing any day freezes the whole week, so a template change later cannot
   *  silently undo the edit. */
  const editWeek = (fn, message) => store.mutate((s) => {
    const plan = weekPlan(s);
    const days = plan.days.map((d) => ({ day: d.day, items: d.items.map((i) => ({ ...i })) }));
    fn(days);
    setWeek(s, { ...weekSettings(s), days });
  }, message);

  root.querySelector('[data-week-field="template"]')?.addEventListener("change", (e) => {
    const value = e.target.value;
    store.mutate((s) => {
      // Back to derived: picking a shape means wanting that shape.
      setWeek(s, { ...weekSettings(s), template: value, days: null });
    }, "Ledger: week — shape");
  });

  root.querySelector("#week-reset")?.addEventListener("click", () => {
    store.mutate((s) => { setWeek(s, { ...weekSettings(s), days: null }); },
      "Ledger: week — back to a shape");
  });

  root.querySelector("#week-volume")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    // The boxes' min and max are only hints to the browser, so the limits are enforced in volumeFromInput.
    const { problems, perWeek: typed } = volumeFromInput({
      problems: form.get("problems"), designPerWeek: form.get("designPerWeek"),
    });
    // Read before the write: the toast must judge the number against the shape the person was looking at.
    const { template } = weekSettings(store.state);
    const perWeek = designDaysPlaced(template, typed);
    store.mutate((s) => {
      const week = weekSettings(s);
      setWeek(s, {
        ...week, problems,
        // A hand-edited `design` that is a string or array would spread into numbered keys, so only an object is kept.
        design: { ...(isRecord(week.design) ? week.design : {}), perWeek },
        // Changing the volume is a request to reshape, not to patch.
        days: null,
      });
    }, "Ledger: week — volume");
    toast(typed > perWeek ? `Week rebuilt. ${designDaysHint(template)}` : "Week rebuilt.");
  });

  root.querySelectorAll("[data-week-item]").forEach((select) => {
    select.addEventListener("change", () => {
      const { day, index } = parseSlot(select.dataset.weekItem);
      // Judged against the plan, not the DOM, and before editWeek: store.mutate always saves, so a refusal inside it
      // would still rewrite an identical week.
      const planned = plannedDay(day);
      if (!hasItemAt(planned, index)) {
        // The item this select was drawn for is gone, so there is nothing to switch and nothing true to say. No write means
        // no re-render, so the control goes back to the option it was drawn with, without reading the store.
        select.value = [...select.options].find((o) => o.defaultSelected)?.value ?? "";
        return;
      }
      const next = kindSwitchFits(planned, index, select.value);
      if (next === null) {
        // No write means no re-render, so the select is put back by hand.
        select.value = planned.items[index].kind;
        toast(KIND_NO_ROOM_NOTE);
        return;
      }
      editWeek((days) => {
        const target = days.find((d) => d.day === day);
        target.items[index] = next;
        // Rest is exclusive: a day is off or it is not.
        if (next.kind === "rest") target.items = [{ kind: "rest" }];
        else target.items = target.items.filter((i) => i.kind !== "rest");
      }, `Ledger: week — ${day}`);
      // After the write because #toast lives outside the re-rendered view.
      if (next.kind !== "rest" && next.count < itemKind(next.kind).defaultCount) toast(COUNT_STOPPED_NOTE);
    });
  });

  root.querySelectorAll("[data-week-count]").forEach((input) => {
    input.addEventListener("change", () => {
      const { day, index } = parseSlot(input.dataset.weekCount);
      const target = plannedDay(day);
      if (!hasItemAt(target, index)) {
        // No item to count, so nothing to write and nothing true to say. No write means no re-render, so the box goes back
        // to the value it was drawn with, without reading the store.
        input.value = input.defaultValue;
        return;
      }
      const typed = clampItemCount(input.value);
      const stored = countThatFits(target, index, typed);
      const stoppedShort = stored !== typed;
      // Judged on commit, never while typing: "3" on the way to "30" is not a request. The toast comes after the write
      // because #toast lives outside the re-rendered view.
      if (stored === itemCount(target.items[index])) {
        // No write means no re-render, so the box is put back by hand; store.mutate always saves, even a no-op.
        input.value = stored;
        if (stoppedShort) toast(COUNT_STOPPED_NOTE);
        return;
      }
      editWeek((days) => {
        const item = days.find((d) => d.day === day).items[index];
        if (item) item.count = stored;
      }, `Ledger: week — ${day} count`);
      if (stoppedShort) toast(COUNT_STOPPED_NOTE);
    });
  });

  root.querySelectorAll("[data-week-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const planned = plannedDay(btn.dataset.weekAdd);
      // Checked against the plan, not the DOM, and before editWeek: store.mutate always saves, so a no-op inside it
      // would still rewrite an identical week. A missing day must be refused here too, because dayIsFull reads it as
      // "not full" and editWeek's lookup would then throw.
      if (!planned || dayIsFull(planned)) return;
      const { day } = planned;
      editWeek((days) => {
        const target = days.find((d) => d.day === day);
        target.items = target.items.filter((i) => i.kind !== "rest");
        target.items.push({ kind: "designStudy", count: 1 });
      }, `Ledger: week — ${day}`);
    });
  });

  root.querySelectorAll("[data-week-drop]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { day, index } = parseSlot(btn.dataset.weekDrop);
      // Judged against the plan before editWeek, as in the kind handler: a slot that names no item must not splice, because
      // splice(NaN, 1) removes the first item and splice(-1, 1) the last.
      if (!hasItemAt(plannedDay(day), index)) return;
      editWeek((days) => {
        const target = days.find((d) => d.day === day);
        target.items.splice(index, 1);
        if (!target.items.length) target.items = [{ kind: "rest" }];
      }, `Ledger: week — ${day}`);
    });
  });
}
