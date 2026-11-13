// The app's version, and the only place it is written down.
//
// Everything else derives from here. app.js registers the service worker as
// `./sw.js?v=<APP_VERSION>`, and the worker reads that back out of its own URL
// to name its cache — so a release automatically invalidates the old cache and,
// because the worker's script URL itself changes, the browser is guaranteed to
// treat it as a new worker and install it. Before this, the cache version was a
// second number in sw.js that had to be remembered separately, and forgetting
// it meant shipping a release that nobody's browser would pick up.
//
// Versioning is semver, read for an app rather than a library:
//   major  the shape of the thing changed — a workflow works differently than
//          it did, or stored data needs migrating.
//   minor  new capability, nothing existing works differently.
//   patch  fixes and polish only.
//
// When bumping: update APP_VERSION and RELEASED, and add the matching section
// to CHANGELOG.md. A test fails if the changelog has no entry for the current
// version, so a release cannot ship undocumented.

export const APP_VERSION = "2.39.1";

/** ISO date of this version, shown next to it in Settings. */
export const RELEASED = "2026-11-13";
