// Which copy of the app this is, and what it is allowed to touch.
//
// Where this fits: below everything, imported by anything that stores or
// displays. It has no dependencies on purpose — a mistake here would be a
// mistake about which data the app is writing to, and that is not a thing to
// resolve through three other modules.
//
// Why this exists. There was one copy of Ledger, deployed straight to the URL
// that is actually practised on, sharing one data file and one set of
// browser keys. So testing a change meant testing against real practice data,
// and a development build opened on the same machine read the same cached
// state — which is exactly how test data ends up in front of someone who is
// trying to use the thing.
//
// Three rules, and the order matters:
//
//  1. The channel comes from where the page is served, never from a build step
//     or a flag. There is no build step in this project and a flag is
//     something you forget to set.
//  2. Every stored key is namespaced by channel, so the two cannot see each
//     other's data even in the same browser. This includes the token: a dev
//     build must not silently inherit write access to the real log.
//  3. A non-stable channel says so on screen, always, unmissably. The failure
//     this exists to prevent is not knowing which one you are looking at.

/** The published, stable copy. Its data is somebody's real practice history. */
export const STABLE = "stable";

/** A copy for trying changes. Different data file, different browser keys. */
export const DEV = "dev";

/**
 * The made-up-data copy that the static build serves under `demo/`. It is its
 * own channel, not `dev`: `dev` is what localhost means and carries a
 * developer's warning, and a visitor's real log lives on this same origin, so
 * the demo must be unable to read or overwrite it.
 */
export const DEMO = "demo";

/**
 * Which channel this page is.
 *
 * Derived from the URL, which is the one thing that cannot be wrong: the
 * stable site is served from the repository root and the development copy from
 * a `/dev/` path underneath it. Localhost is always dev, because a local
 * server is by definition somewhere changes are being tried — that default is
 * the whole point, and it is the case that went wrong before this file
 * existed.
 */
export function channelOf(location = globalThis.location) {
  const host = location?.hostname || "";
  const path = location?.pathname || "";
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local")) {
    return DEV;
  }
  // A path segment, not a substring: a stable deployment at /ledger-dev-notes/
  // is not a dev channel.
  const segments = path.split("/");
  if (segments.includes("dev")) return DEV;
  if (segments.includes("demo")) return DEMO;
  return STABLE;
}

export const CHANNEL = channelOf();
export const IS_DEV = CHANNEL === DEV;
/** Any copy that is not the published one: it badges itself and installs no service worker. */
export const IS_NON_STABLE = CHANNEL !== STABLE;

/**
 * Namespace a browser storage key to this channel.
 *
 * Stable keeps the unprefixed names it has always used, so nobody's existing
 * settings, cached log or session are orphaned by this change. Dev gets its
 * own, which is the entire mechanism: same browser, same origin, no shared
 * state, no possibility of a test writing over a real log.
 */
export function storageKey(name, channel = CHANNEL) {
  return channel === STABLE ? name : `${name}.${channel}`;
}

/**
 * The default data path for a channel.
 *
 * Only a default — the setup form still shows it and it can be changed, since
 * someone may genuinely want two stable logs. What matters is that the
 * dev build never *starts* by pointing at the real one.
 */
export function defaultDataPath(channel = CHANNEL) {
  return channel === STABLE ? "prep-data/state.json" : "prep-data/state.dev.json";
}
