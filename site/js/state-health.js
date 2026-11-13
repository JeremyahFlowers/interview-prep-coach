// The health of the synced document itself: how big it is, whether a file
// someone hands us is really one of ours, and what two versions of it differ
// by.
//
// Where this fits: below the domain. Nothing here knows what a box or a
// pattern is — it deals with the log as a document that has to survive being
// written to GitHub, read back, and occasionally replaced wholesale.
//
// Split out of logic.js, which had reached 1,254 lines holding scheduling, the
// plant, planning, stats, the day clock, mock phases and quiz weighting
// alongside all of this. It was becoming what views.js had been.

import { allAttempts } from "./logic.js";

// ---------- Sync payload size ----------
//
// The whole log syncs as one file through the GitHub Contents API, which
// refuses anything over 1 MB. That is a cliff, not a slope: the save that
// crosses it fails, and so does every save after it, with a raw API error.
//
// It was comfortable while a problem cost ~640 bytes. Analyze now writes
// pasted statements into state at 1-3 KB each, which is the first thing here
// that grows without bound, so the distance to the wall is worth measuring
// before it is worth explaining.

/** GitHub's hard limit on a file written through the Contents API. */
export const SYNC_LIMIT_BYTES = 1024 * 1024;

/** Start saying something at this fraction of the limit — far enough out that
 * shedding weight is still a choice rather than an emergency. */
export const SYNC_WARN_FRACTION = 0.7;

/**
 * Measure the synced document and say what is taking the room.
 *
 * Sizes are of the JSON actually sent, not of the objects in memory, because
 * that is what the limit applies to. Reported per category so the advice can
 * be specific: "your statements are 400 KB" is actionable, "your data is
 * large" is not.
 */
export function syncFootprint(state) {
  const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
  const bytes = (value) => {
    const json = JSON.stringify(value ?? null);
    return encoder ? encoder.encode(json).length : json.length;
  };

  const total = bytes(state);
  const problems = state?.problems || [];
  const allAttempts = problems.flatMap((p) => p.attempts || []);

  const statements = problems.reduce((n, p) => n + (p.statement ? bytes(p.statement) : 0), 0);
  const code = allAttempts.reduce((n, a) => n + (a.code ? bytes(a.code) : 0), 0);
  // The whole attempt records, code included. This is the one that actually
  // dominates: measured on a realistic log at the limit, attempts are 76% of
  // the file. The card used to name statements and code as "the two that grow
  // without limit", which sent people to trim 11% and 21% while the thing
  // underneath them went unmentioned.
  const attempts = bytes(allAttempts);
  const notes = allAttempts.reduce((n, a) => n + (a.soulStatement ? bytes(a.soulStatement) : 0), 0);

  return {
    total,
    limit: SYNC_LIMIT_BYTES,
    fraction: total / SYNC_LIMIT_BYTES,
    warn: total >= SYNC_LIMIT_BYTES * SYNC_WARN_FRACTION,
    over: total >= SYNC_LIMIT_BYTES,
    breakdown: {
      attempts,
      statements,
      // Kept alongside because they are the parts of an attempt a person can
      // recognise and decide about; they are inside `attempts`, not beside it,
      // which is why the card labels them as such rather than adding up.
      code,
      notes,
      rest: Math.max(0, total - attempts - statements),
    },
    counts: {
      problems: problems.length,
      withStatement: problems.filter((p) => p.statement).length,
      attempts: allAttempts.length,
      withCode: allAttempts.filter((a) => a.code).length,
    },
  };
}

/** Human size, for a sentence rather than a table. */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ---------- Validating an imported state file ----------
//
// Import replaces the entire prep log, and it used to accept anything that
// parsed as JSON: a truncated download, an unrelated file, or a hand-edited
// one with a wrong shape silently destroyed every problem, attempt and note.
// CLAUDE.md requires validating at the boundary, and a file the user picked
// off their disk is exactly that boundary.
//
// The checks are deliberately shallow — enough to be confident this is a
// Ledger state file and to say what is in it, not a schema validator. A file
// that passes is then run through migrateState like any other.

/** Fields an import must have before it is allowed to replace anything. */
const REQUIRED_ARRAYS = ["problems", "patterns"];

/**
 * Describe a parsed import, and say whether it is safe to apply.
 *
 * Returns counts as well as problems, so the user can be shown what they are
 * about to overwrite and what with, rather than being asked to confirm a
 * change they cannot see.
 */
export function inspectImport(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, errors: ["It isn't a Ledger log at all."], problems: 0, attempts: 0 };
  }

  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(candidate[key])) errors.push(`Missing its "${key}" list.`);
  }

  const problems = Array.isArray(candidate.problems) ? candidate.problems : [];
  // One malformed problem means the file was produced by something other than
  // this app, and applying the rest would leave a half-broken log.
  const malformed = problems.filter((p) => !p || typeof p !== "object" || !p.id || !p.name).length;
  if (malformed) errors.push(`${malformed} of ${problems.length} problems are missing an id or a name.`);

  const badAttempts = problems.filter(
    (p) => p && p.attempts !== undefined && !Array.isArray(p.attempts)).length;
  if (badAttempts) errors.push(`${badAttempts} problems have an unreadable attempt history.`);

  if (candidate.settings && typeof candidate.settings !== "object") {
    errors.push("Its settings are unreadable.");
  }

  const attempts = problems.reduce(
    (n, p) => n + (Array.isArray(p?.attempts) ? p.attempts.length : 0), 0);

  return {
    ok: errors.length === 0,
    errors,
    problems: problems.length,
    attempts,
    mocks: Array.isArray(candidate.mocks) ? candidate.mocks.length : 0,
    journal: Array.isArray(candidate.journal) ? candidate.journal.length : 0,
    appVersion: candidate.meta?.appVersion || null,
    createdAt: candidate.meta?.createdAt || null,
  };
}

/** One-line summary of what a state holds, for the import confirmation. */
export function describeState(state) {
  const problems = state?.problems?.length || 0;
  const attempts = (state?.problems || []).reduce(
    (n, p) => n + (Array.isArray(p?.attempts) ? p.attempts.length : 0), 0);
  return `${problems} problem${problems === 1 ? "" : "s"}, ${attempts} attempt${attempts === 1 ? "" : "s"}`;
}

// ---------- Comparing two versions of the log ----------

/**
 * What differs between this device's state and the one on the server.
 *
 * A sync conflict asks you to discard one side or the other, and until now it
 * asked blind — "keep mine" or "take theirs" with no indication of what either
 * one throws away. Attempts carry stable ids, so the two sides can be compared
 * exactly rather than guessed at, and the answer is usually reassuring: most
 * conflicts are one device a few minutes stale, not a fork with real work on
 * both sides.
 *
 * Counts attempts rather than problems because attempts are the irreplaceable
 * part — a problem can be re-added in seconds, a logged rep with its timings
 * and soul statement cannot be reconstructed.
 */
export function compareStates(mine, theirs) {
  const summarize = (state) => {
    if (!state) return null;
    const attempts = allAttempts(state);
    return {
      problems: state.problems.length,
      attempts: attempts.length,
      soulStatements: attempts.filter((a) => a.soulStatement).length,
      lastActivity: attempts.length ? attempts[attempts.length - 1].date : null,
    };
  };

  const idsOf = (state) => new Set(state ? allAttempts(state).map((a) => a.id) : []);
  const mineIds = idsOf(mine);
  const theirIds = idsOf(theirs);

  const onlyMine = [...mineIds].filter((id) => !theirIds.has(id)).length;
  const onlyTheirs = [...theirIds].filter((id) => !mineIds.has(id)).length;

  return {
    mine: summarize(mine),
    theirs: summarize(theirs),
    attemptsOnlyHere: onlyMine,
    attemptsOnlyThere: onlyTheirs,
    // The reassuring case worth naming explicitly: one side is simply ahead,
    // so choosing it loses nothing at all.
    identical: onlyMine === 0 && onlyTheirs === 0,
    safeChoice: onlyMine === 0 && onlyTheirs > 0 ? "theirs"
      : onlyTheirs === 0 && onlyMine > 0 ? "mine"
      : null,
  };
}
