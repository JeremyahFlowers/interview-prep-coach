// The one demo stub: seeds a made-up practice log and answers GitHub from memory.
//
// Where this fits: shipped in demo/, loaded by demo-boot.js before js/app.js. Both the local triage server and the
// static "try it" demo use it, so the two cannot drift. The app is untouched: store.js still believes it is syncing
// with GitHub, which is why no demo branch exists anywhere in js/.
//
// Constraints: every key it writes goes through storageKey, so it only ever touches the keys of a non-stable channel
// and can never overwrite a visitor's real log on the same origin. Dates are computed when the page loads, relative
// to the visitor's today, never to the day the site was built.

import { storageKey, defaultDataPath, CHANNEL, STABLE } from "../js/channel.js";
import * as logic from "../js/logic.js";
import { demoState } from "./demo-state.js";

/** The fixed days between the demo's "today" and its interview date. */
export const DEMO_DAYS_TO_INTERVIEW = 56;
const GITHUB_API = "https://api.github.com";
const FAKE_TOKEN = "not-a-real-token";
const FAKE_REPO = "demo";

/** A made-up persona: a senior engineer eight weeks out, aiming at a strong engineering org, practising 45–75
 *  minutes a day, six problems a week with design on two weekdays and a long Saturday session. Chosen to exercise
 *  every card on Home, not to describe anyone. */
export function buildDemoLog() {
  const s = demoState();
  const today = logic.todayISO();
  s.settings.prep = {
    targetDate: logic.addDaysISO(today, DEMO_DAYS_TO_INTERVIEW), startingPoint: "rusty", target: "strong",
    level: "senior", intensity: "steady", startedOn: today,
  };
  s.settings.dailyFloorMin = 45;
  s.settings.dailyBudgetMin = 75;
  s.settings.week = {
    template: "weekdaysPlusDesign", problems: 6,
    design: { perWeek: 2, kind: "designStudy" }, days: null,
  };
  s.settings.designShare = 0.3;
  return s;
}

/** Spreading every byte into one call overflows the stack on a log of a few hundred KB, so encode in slices. */
const BASE64_SLICE = 0x8000;
const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_SLICE));
  }
  return btoa(binary);
};
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Seed the demo channel's browser keys and replace `window.fetch` with an in-memory GitHub.
 * Non-GitHub requests pass through to the real fetch.
 *
 * Refuses to run on the stable channel: there the keys are a visitor's real ones.
 *
 * @param {{ window: { fetch: Function }, storage: Storage, channel?: string }} env  Injected so tests need no browser.
 * @returns {{ files: Record<string, string> }} The fake repository, readable to see what the app wrote.
 */
export function installDemo({ window, storage, channel = CHANNEL }) {
  if (channel === STABLE) throw new Error("The demo stub must not run on the stable channel.");
  const path = defaultDataPath(channel);
  const files = { [path]: JSON.stringify(buildDemoLog()) };
  let revision = 0;
  const realFetch = window.fetch;

  window.fetch = async (input, opts = {}) => {
    const url = String(input && input.url ? input.url : input);
    if (!url.startsWith(GITHUB_API)) return realFetch(input, opts);
    const match = url.match(/\/contents\/([^?]+)/);
    const target = match ? decodeURIComponent(match[1]) : "";
    const method = opts.method || "GET";
    if (method === "GET") {
      // hasOwn, not `in`: a data path called "constructor" must not find an inherited member.
      if (!Object.hasOwn(files, target)) return json({}, 404);
      return json({ sha: `sha${revision}`, content: toBase64(files[target]), encoding: "base64" });
    }
    if (method === "PUT") {
      let content;
      try {
        content = fromBase64(JSON.parse(opts.body).content);
      } catch {
        return json({ message: "Invalid request body" }, 400);
      }
      files[target] = content;
      revision += 1;
      return json({ content: { sha: `sha${revision}` } });
    }
    return json({}, 404);
  };

  try {
    storage.setItem(storageKey("ledger.config", channel), JSON.stringify({
      owner: FAKE_REPO, repo: FAKE_REPO, token: FAKE_TOKEN, path, branch: "main" }));
    storage.setItem(storageKey("ledger.welcomed", channel), "1");
  } catch {
    // Storage blocked: the app falls back to its own first-run screen, which is an honest outcome.
  }
  return { files };
}
