// The only piece of the app that talks to GitHub or localStorage. Views call
// store.mutate() to change data and store.onChange() to know when to re-render;
// nothing else touches persistence directly.
import { GitHubStore } from "./github-client.js";
import { storageKey } from "./channel.js";
import { buildSeedState, migrateState } from "./seed.js";
import { syncFootprint, formatBytes, compareStates, inspectImport, isRecord } from "./logic.js";
import { AppError, LOCAL_ONLY, INVALID_CONFIG, IMPORT_INVALID } from "./errors.js";

/** Where the log is kept. `null` (neither) means the person has not chosen yet. */
export const STORAGE_MODE = Object.freeze({ LOCAL: "local", GITHUB: "github" });

const CONFIG_KEY = storageKey("ledger.config");
// The one place the chosen mode is written. A complete GitHub config with no
// stored mode reads as "github", so everyone who set the app up before local
// mode existed keeps working with no migration and no prompt.
const MODE_KEY = storageKey("ledger.mode");
// Shared by both modes on purpose: a GitHub user's cached copy is already a
// valid local log, so switching modes needs no copying.
const CACHE_KEY = storageKey("ledger.cache.state");
// Whether the cached copy holds changes that never reached GitHub.
//
// `dirty` lives in memory, so closing the tab forgot it. That made the whole
// offline story a lie: work on a train, the save fails, the work goes to the
// cache, you close the tab — and on the next open init() fetched the remote,
// adopted it, and overwrote the cache with it. The cached copy was read only
// when the fetch *failed*. An hour of practice, discarded without a word, by
// the app working correctly.
const PENDING_KEY = storageKey("ledger.cache.unsynced");
const SAVE_DEBOUNCE_MS = 1200;

// Retry schedule for a save that failed for a reason that might pass —
// offline, a flaky connection, GitHub having a moment. Backs off so a long
// outage doesn't mean a request every second for an hour, and stops rather
// than retrying forever, because a failure that survives four minutes is not
// going to be fixed by a fifth attempt.
//
// Why this exists: a failed save left the work in localStorage and the status
// at "offline" until the next mutation happened to trigger a flush. Close the
// tab in between and the only copy of that session was on that device.
const RETRY_DELAYS_MS = [5000, 15000, 45000, 120000];

// Failures that will not be fixed by waiting. Retrying a bad token or a log
// that is too large just produces the same error on a timer.
const PERMANENT_FAILURES = new Set(["conflict", "too_large", "no_workflow_scope"]);

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch (_) {
    return {};
  }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

function isCompleteConfig(cfg) {
  return !!(cfg && cfg.owner && cfg.repo && cfg.token && cfg.path);
}

/** The stored choice, or null for anything unrecognised so a bad value reads as "not chosen". */
function loadStoredMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return Object.values(STORAGE_MODE).includes(stored) ? stored : null;
  } catch (_) {
    return null;
  }
}

/** Shown when the only copy of the log could not be written. Names Export because that is the one
 * action that still works when storage does not. */
const LOCAL_WRITE_FAILED = "Your work is not being saved on this device — the browser refused the "
  + "write, so closing this tab would lose it. Use Export now in Settings to keep a copy.";

const LOCAL_CACHE_UNREADABLE = "The log saved in this browser can't be read, so it has been left "
  + "exactly as it is. If you have a backup, use Import to replace it.";

/** The refusal for a feature that needs a repo when there is none. */
function noRepo(what) {
  return new AppError(`${what} needs a GitHub repo. This device is saving on its own, so it is skipped.`,
    { code: LOCAL_ONLY });
}

class Store {
  constructor() {
    this.state = null;
    this.status = "unconfigured"; // unconfigured | loading | local | synced | saving | offline | conflict | error
    this.error = null;
    this.listeners = new Set();
    this.saveTimer = null;
    this.dirty = false;
    this.gh = null;
    this.leetcode = null; // { status: 'idle'|'loading'|'ready'|'error', data, error }
    // When the last successful exchange with GitHub happened. Shown in
    // Settings: "Synced" alone says the last attempt worked, not whether it
    // was a minute ago or before you shut the laptop on Friday.
    this.lastSyncedAt = null;
    this.retryTimer = null;
    this.retryAttempt = 0;
    // Set when a reopen found work that had never reached GitHub. Read once
    // by the UI, which says so, and cleared.
    this.recovered = false;
    // Set when the remote file could not be parsed. Blocks saving, because a
    // save would overwrite the damaged file that is the only evidence left.
    this.blocked = false;
    // Whether the last local-mode write failed, so a later success knows it is clearing that error
    // and not some unrelated one.
    this._localWriteFailed = false;
  }

  /**
   * Where the log lives: "local", "github", or null before a choice.
   *
   * Derived from storage each time rather than held in memory, like isConfigured(), so it cannot
   * disagree with what a reload would see.
   */
  get mode() {
    const stored = loadStoredMode();
    if (stored === STORAGE_MODE.LOCAL) return stored;
    return isCompleteConfig(loadConfig()) ? STORAGE_MODE.GITHUB : null;
  }

  /** Choose this-device-only storage. Touches no network and keeps any cached log. */
  useLocal() {
    localStorage.setItem(MODE_KEY, STORAGE_MODE.LOCAL);
    this.gh = null;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    this.listeners.forEach((fn) => fn());
  }

  isConfigured() {
    const cfg = loadConfig();
    return !!(cfg.owner && cfg.repo && cfg.token && cfg.path);
  }

  configure(cfg) {
    saveConfig(cfg);
    this.gh = new GitHubStore(cfg);
  }

  /**
   * Move a local log to GitHub without ever replacing it with a seed.
   *
   * The remote is read before anything is stored, so a wrong token or a repo that cannot be reached
   * leaves this device exactly as it was and the error reaches the caller. Once it is read, the
   * attempts decide: a remote with nothing this device lacks is adopted, a device with nothing the
   * remote lacks is uploaded, and both sides having work goes to the conflict screen — the same rule
   * as _recoverPendingWork, so there is one idea of "who is ahead".
   */
  async enableGitHub(rawCfg) {
    // Trimmed here as well as in the form: a token with a stray space is stored and then fails as "bad
    // credentials", which reads as a wrong token rather than a paste error.
    const cfg = rawCfg && typeof rawCfg === "object"
      ? Object.fromEntries(Object.entries(rawCfg).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]))
      : rawCfg;
    if (!isCompleteConfig(cfg)) {
      throw new AppError("Fill in the username, repository, data file path and token to connect GitHub.",
        { code: INVALID_CONFIG });
    }
    if (!this.state) {
      throw new AppError("There is no log on this device to back up yet.", { code: INVALID_CONFIG });
    }
    const gh = new GitHubStore(cfg);
    const { exists, state: remote } = await gh.fetchState();
    if (exists) this._checkRemote(remote);

    const local = this.state;
    const diff = exists ? compareStates(local, migrateState(remote)) : null;
    this._adoptGitHub(cfg, gh);

    if (diff && diff.attemptsOnlyHere === 0) {
      // The repo has everything this device has, so it is the log to keep.
      this.state = migrateState(remote);
      this.dirty = false;
      this._cacheLocally();
      this.status = "synced";
      this.lastSyncedAt = Date.now();
      this.error = null;
      this._emit();
      return;
    }

    this.state = local;
    this.dirty = true;
    this._cacheLocally();
    if (diff && diff.attemptsOnlyThere > 0) {
      this.status = "conflict";
      this.error = "This device has work that never reached GitHub, and GitHub has work "
        + "this device hasn't seen. Nothing is lost yet — pick which to keep.";
      this._emit();
      return;
    }
    this.status = "saving";
    this._emit();
    await this.flush("Ledger: upload local log");
  }

  /** Record that GitHub is now where the log lives. */
  _adoptGitHub(cfg, gh) {
    saveConfig(cfg);
    localStorage.setItem(MODE_KEY, STORAGE_MODE.GITHUB);
    this.gh = gh;
    this._localWriteFailed = false;
    this.blocked = false;
  }

  /**
   * Stop syncing and keep working from the log on this device.
   *
   * Unlike disconnect(), which clears the cache and so suits "hand this browser back", this keeps
   * the log: the person is choosing where it lives, not discarding it.
   */
  useThisDeviceOnly() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this._cancelRetry();
    clearConfig();
    localStorage.setItem(MODE_KEY, STORAGE_MODE.LOCAL);
    this.gh = null;
    this.leetcode = null;
    this.dirty = false;
    this._localWriteFailed = false;
    if (!this.state) {
      // No log was ever loaded (e.g. offline on first load). Writing now would replace a good
      // cache with "null", so load what is saved, or seed, the way a fresh local start does.
      this._initLocal();
      return;
    }
    this._writeLocalCache();
    if (!this._localWriteFailed) {
      this.status = STORAGE_MODE.LOCAL;
      this.error = null;
    }
    this._emit();
  }

  /**
   * Replace an unreadable local log with a backup the person chose.
   *
   * Only for the blocked case: Settings' Import needs a loaded log to replace, and here there is
   * none, so without this the error's own advice ("use Import") would have nowhere to be followed.
   */
  importIntoBlockedLocal(candidate) {
    if (!this.blocked || this.mode !== STORAGE_MODE.LOCAL) {
      throw new AppError("There is nothing unreadable on this device to replace.", { code: INVALID_CONFIG });
    }
    const found = inspectImport(candidate);
    if (!found.ok) {
      throw new AppError(`That file doesn't look like a Ledger backup: ${found.errors.join(" ")}`,
        { code: IMPORT_INVALID });
    }
    this.state = migrateState(candidate);
    this.blocked = false;
    this.status = STORAGE_MODE.LOCAL;
    this.error = null;
    this._writeLocalCache();
    this._emit();
  }

  disconnect() {
    clearConfig();
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(PENDING_KEY);
    this.gh = null;
    this.state = null;
    this.status = "unconfigured";
    this._emit();
  }

  async init() {
    const mode = this.mode;
    if (mode === STORAGE_MODE.LOCAL) {
      this._initLocal();
      return;
    }
    if (mode === null) {
      this.status = "unconfigured";
      this._emit();
      return;
    }
    const cfg = loadConfig();
    this.gh = new GitHubStore(cfg);
    this.status = "loading";
    this._emit();
    try {
      const { exists, state } = await this.gh.fetchState();
      if (exists) this._checkRemote(state);
      if (!exists) {
        // A log that never reached the repo is uploaded, not replaced by a seed. This is the branch
        // a local log takes on its way to GitHub; the pending flag is what says the cache is real.
        const cached = this._hasPendingWork() ? this._readCache() : null;
        this.state = cached ? migrateState(cached) : buildSeedState();
        await this.gh.saveState(this.state, cached
          ? "Ledger: upload local log"
          : "Ledger: initialize prep-data/state.json");
        this.dirty = false;
        this._cacheLocally();
      } else if (this._hasPendingWork() && this._readCache()) {
        this._recoverPendingWork(migrateState(state));
        return;                       // _recoverPendingWork emits and flushes
      } else {
        this.state = migrateState(state);
        this._cacheLocally();
      }
      this.status = "synced";
      this.lastSyncedAt = Date.now();
      this.error = null;
    } catch (err) {
      const cached = this._readCache();
      if (cached) this.state = migrateState(cached);
      // A file that can't be read is not the same failure as a network that
      // can't be reached, and must not be treated as one: "offline" means
      // keep working, we'll save later, and saving later would write over
      // whatever is actually in that file — which may be the only copy of
      // something recoverable. So this one blocks saving until a person has
      // looked.
      if (err.code === "unreadable_remote") {
        this.status = "error";
        this.blocked = true;
      } else {
        this.status = cached ? "offline" : "error";
      }
      this.error = err.message || String(err);
    }
    this._emit();
    this.loadLeetCodeStats(); // independent of whether the main state load succeeded
  }

  /**
   * Load the log saved in this browser; no network is involved.
   *
   * A cache that fails inspectImport is neither loaded nor overwritten: it is the only copy, and
   * whatever is wrong with it is the evidence for fixing it.
   */
  _initLocal() {
    this.gh = null;
    this.blocked = false;
    let raw = null;
    try {
      raw = localStorage.getItem(CACHE_KEY);
    } catch (_) { /* storage unavailable: treated as empty, and the first write reports it */ }

    if (!raw) {
      this.state = buildSeedState();
      this._writeLocalCache();
      this.status = this._localWriteFailed ? "error" : "local";
      this.error = this._localWriteFailed ? LOCAL_WRITE_FAILED : null;
      this._emit();
      return;
    }

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (_) { /* falls through to the unreadable branch */ }
    if (!inspectImport(parsed).ok) {
      this.state = null;
      this.blocked = true;
      this.status = "error";
      this.error = LOCAL_CACHE_UNREADABLE;
      this._emit();
      return;
    }
    this.state = migrateState(parsed);
    this.status = "local";
    this.error = null;
    this._emit();
  }

  /** Write the log to this browser and say whether it took. */
  _writeCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this.state));
      // Written together, so the flag can never outlive or lag the copy it
      // describes.
      localStorage.setItem(PENDING_KEY, this.dirty ? "1" : "");
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Local mode's write: here the cache is the only copy, so a failure is surfaced and a later
   * success clears it. */
  _writeLocalCache() {
    if (this._writeCache()) {
      if (this._localWriteFailed) {
        this._localWriteFailed = false;
        this.status = STORAGE_MODE.LOCAL;
        this.error = null;
      }
      return;
    }
    this._localWriteFailed = true;
    this.status = "error";
    this.error = LOCAL_WRITE_FAILED;
  }

  _cacheLocally() {
    // Storage full or unavailable: in github mode sync still works, just without the offline
    // fallback, so the failure is not worth interrupting anyone for.
    this._writeCache();
  }

  /**
   * Check a state fetched from GitHub before letting it near the renderer.
   *
   * The import path has validated a chosen file since it was written, and the
   * sync path — the one that runs every single time the app opens — trusted
   * whatever came back. migrateState only backfills missing keys, so a
   * truncated write, a hand edit or a bad merge went straight into the views
   * and the first thing the user saw was a blank page.
   *
   * Throws rather than returning a flag, so no caller can adopt it by
   * forgetting to check.
   */
  _checkRemote(state) {
    const found = inspectImport(state);
    if (found.ok) {
      this.blocked = false;
      return state;
    }
    const err = new Error(
      `The log in your repo can't be read: ${found.errors.join(" ")} `
      + `Nothing here has been changed — open ${loadConfig().path} in your repo to see what's in it.`);
    err.code = "unreadable_remote";
    throw err;
  }

  /** Did this browser close with work that never reached GitHub? */
  _hasPendingWork() {
    try {
      return localStorage.getItem(PENDING_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  /**
   * Reconcile a cache that closed with unsaved changes against the remote.
   *
   * Two outcomes, and which one depends on whether the *remote* has attempts
   * this device has never seen:
   *
   *  - It doesn't. This device is simply ahead, so its copy is adopted and
   *    pushed. Nothing is lost and nothing needs deciding.
   *  - It does. Both sides have real work, which is the conflict screen's
   *    entire job — it can fetch both and say what each choice discards.
   *
   * The comparison is over attempts, which means an unsynced journal note on
   * one side and a newer one on the other will be resolved in this device's
   * favour without asking. That is deliberate: attempts are the substantive
   * record, and routing every ordinary offline edit through a conflict screen
   * would train people to click past it, which is how the real conflicts get
   * lost too.
   */
  _recoverPendingWork(remote) {
    const cached = migrateState(this._readCache());
    const diff = compareStates(cached, remote);

    this.state = cached;
    if (diff.attemptsOnlyThere > 0 && diff.attemptsOnlyHere > 0) {
      this.status = "conflict";
      this.error = "This device has work that never reached GitHub, and GitHub has work "
        + "this device hasn't seen. Nothing is lost yet — pick which to keep.";
      this.dirty = true;
      this._cacheLocally();
      this._emit();
      this.loadLeetCodeStats();
      return;
    }

    // Strictly ahead: push it, and say so rather than letting a silent save
    // be the only evidence that anything was at stake.
    this.dirty = true;
    this._cacheLocally();
    this.recovered = true;
    this._emit();
    this.flush("Ledger: upload work saved while offline");
    this.loadLeetCodeStats();
  }

  _readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // A cache that parses but is not an object (a tampered or half-written
      // entry) must read as "no cache": the callers treat any truthy value as
      // a state, and migrateState refuses the rest with a throw inside a catch.
      return isRecord(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  /** Apply a synchronous mutation to state, re-render immediately, and
   * schedule a debounced save to GitHub (local mode stops after the cache write). */
  mutate(fn, message) {
    fn(this.state);
    if (this.mode === STORAGE_MODE.LOCAL) {
      // Nothing to sync, so nothing is "unsaved" beyond the write that just happened.
      this.dirty = false;
      this._writeLocalCache();
      this._emit();
      return;
    }
    this.dirty = true;
    this._cacheLocally();
    this._emit();
    clearTimeout(this.saveTimer);
    // A new change restarts the backoff: it is a fresh attempt at fresh work,
    // not a continuation of whatever was failing before.
    this.retryAttempt = 0;
    this.saveTimer = setTimeout(() => this.flush(message), SAVE_DEBOUNCE_MS);
  }

  async flush(message) {
    if (!this.dirty || !this.gh) return;

    // Set when the file in the repo could not be parsed. Saving would replace
    // it, and whatever is wrong with it is the only remaining evidence of
    // what it held.
    if (this.blocked) {
      this.status = "error";
      this._emit();
      return;
    }

    // Checked here rather than left to the API. Crossing the limit fails the
    // save and every save after it, and a raw "422 too large" gives no way to
    // work out what to do about it. The work stays in localStorage either way;
    // the difference is whether the user is told something they can act on.
    const footprint = syncFootprint(this.state);
    if (footprint.over) {
      this._cancelRetry();      // retrying cannot make the file smaller
      this.status = "error";
      this.error = `Your prep log is ${formatBytes(footprint.total)}, past GitHub's `
        + `${formatBytes(footprint.limit)} limit for a single file, so it can't be saved. `
        + `See Settings for what's taking the room.`;
      this._emit();
      return;
    }

    this.status = "saving";
    this._emit();
    try {
      await this.gh.saveState(this.state, message);
      this.dirty = false;
      this.status = "synced";
      this.lastSyncedAt = Date.now();
      this.error = null;
      this._cancelRetry();
    } catch (err) {
      this.status = err.code === "conflict" ? "conflict" : "offline";
      this.error = err.message || String(err);
      if (!PERMANENT_FAILURES.has(err.code)) this._scheduleRetry(message);
    }
    this._emit();
  }

  /** Queue another attempt, backing off, until the schedule runs out. */
  _scheduleRetry(message) {
    clearTimeout(this.retryTimer);
    const delay = RETRY_DELAYS_MS[this.retryAttempt];
    if (delay === undefined) {
      // Out of attempts. Null rather than a stale id, so "is a retry pending"
      // is answerable by looking.
      this.retryTimer = null;
      return;
    }
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      // Still worth trying? A later mutate may have already saved it, and a
      // conflict needs the user rather than another attempt.
      if (this.dirty && this.status !== "conflict") this.flush(message);
    }, delay);
  }

  _cancelRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryAttempt = 0;
  }

  /** Try again now, as the browser reports the network back. The backoff is
   * reset first: coming back online is new information, not another failure. */
  retryNow(message = "Ledger: retry save") {
    this._cancelRetry();
    if (this.dirty) this.flush(message);
  }

  /**
   * Read the server's version without touching local state.
   *
   * Used by the conflict screen to say what each option would discard. It
   * deliberately doesn't adopt the result or refresh the stored sha — looking
   * must not change which resolution the user then gets.
   */
  async peekRemoteState() {
    if (!this.gh) throw new Error("Not connected.");
    const { exists, state } = await this.gh.fetchState();
    return exists ? state : null;
  }

  async resolveConflictKeepMine() {
    try {
      await this.gh.fetchState(); // refresh sha, discard the fetched body — ours wins
      this.dirty = true;
      await this.flush("Ledger: resolve sync conflict, keep local changes");
    } catch (err) {
      this.status = "error";
      this.error = err.message || String(err);
      this._emit();
    }
  }

  async resolveConflictTakeTheirs() {
    try {
      const { state } = await this.gh.fetchState();
      this.state = migrateState(this._checkRemote(state));
      this.dirty = false;
      this._cacheLocally();
      this.status = "synced";
      this.lastSyncedAt = Date.now();
      this.error = null;
    } catch (err) {
      this.status = "error";
      this.error = err.message || String(err);
    }
    this._emit();
  }

  /** Best-effort load of the read-only prep-data/leetcode-stats.json a
   * GitHub Action writes daily. Never blocks the main state load and never
   * throws — a missing or stale file just means the LeetCode tab shows its
   * empty state instead of breaking the rest of the app. */
  async loadLeetCodeStats() {
    if (!this.gh) return;
    this.leetcode = { status: "loading", data: null, error: null };
    this._emit();
    try {
      const data = await this.gh.fetchPublicFile("prep-data/leetcode-stats.json");
      this.leetcode = data
        ? { status: "ready", data, error: null }
        : { status: "empty", data: null, error: null };
    } catch (err) {
      this.leetcode = { status: "error", data: null, error: err.message || String(err) };
    }
    this._emit();
  }

  /**
   * Reads a problem statement the LeetCode sync Action fetched, or null.
   *
   * Statements live as one file per problem rather than inside state.json,
   * which has to stay under the Contents API's 1 MB limit — see
   * scripts/fetch_leetcode_statements.py in the data repo. Never throws: a
   * statement that hasn't been fetched yet just means the workspace offers its
   * paste box, which is a normal state and not an error.
   */
  async fetchStatement(slug) {
    if (!this.gh || !slug) return null;
    try {
      const record = await this.gh.fetchPublicFile(`prep-data/statements/${slug}.json`);
      return record?.statement || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Re-read the remote and adopt it.
   *
   * The only way to pick up a change made on another device was to reload the
   * page, and there was no way to retry after a failed push without making
   * another change first. Refuses while there are unsaved local changes rather
   * than choosing for the user which side to keep — that decision belongs to
   * the conflict screen, which can show what each option discards.
   */
  async refreshFromRemote() {
    if (!this.gh) throw new Error("Not connected.");
    if (this.dirty) {
      const err = new Error("You have unsaved changes — they'd be lost. Let them sync first.");
      err.code = "dirty";
      throw err;
    }
    this.status = "loading";
    this._emit();
    try {
      const { exists, state } = await this.gh.fetchState();
      if (exists && state) this.state = migrateState(this._checkRemote(state));
      this.status = "synced";
      this.lastSyncedAt = Date.now();
      this.error = null;
      this._cacheLocally();
    } catch (err) {
      this.status = "offline";
      this.error = err.message || String(err);
      throw err;
    } finally {
      this._emit();
    }
  }

  /** The workflow file in the data repo that fetches problem statements. */
  static STATEMENTS_WORKFLOW = "leetcode-sync.yml";

  /** Ask the data repo to fetch statements now rather than on its schedule. */
  async requestStatements() {
    if (!this.gh) throw noRepo("Fetching statements");
    return this.gh.dispatchWorkflow(Store.STATEMENTS_WORKFLOW);
  }

  /** Saves a PNG (as a data URL) as a brand-new file in the repo — used by
   * the whiteboard. Binary assets are stored outside state.json so the main
   * sync document stays small; only a path reference lives in state. */
  async saveWhiteboardImage(path, dataUrl, message) {
    if (!this.gh) throw noRepo("Saving a drawing to a repo");
    const base64 = dataUrl.split(",")[1];
    await this.gh.createBinaryFile(path, base64, message);
  }
}

export const store = new Store();
