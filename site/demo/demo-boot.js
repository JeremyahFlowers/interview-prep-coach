// Entry point for the demo: the page loads this as a module before js/app.js, so the fake GitHub and the seeded keys
// exist by the time the app starts. All logic lives in install-demo.js, which tests import without side effects.

import { installDemo } from "./install-demo.js";

/** Reading `localStorage` itself throws when a browser blocks storage; the stub still needs to fake GitHub then. */
function browserStorage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

// Readable from a console, so a check can see exactly what the app wrote.
window.__demoFiles = installDemo({ window, storage: browserStorage() }).files;
