// Paints the "which copy is this" badge in the header, and on the demo adds the way back to the real app.
//
// Where this fits: called once at boot by app.js, after channel.js has decided the channel. Kept out of app.js (a
// browser script no test can import) so the demo's labelling is tested like everything else.
//
// Why the demo gets a link: its data is made up and resets on reload, and a visitor who likes the demo needs one
// obvious step to the real, empty app. The link is `./`, not `../`: the demo page declares <base href="../">, so
// every relative address already starts at the app's root.

import { DEMO, STABLE } from "./channel.js";

/** Stable selector for the way back to the real app (data-testid="demo-exit-link"). */
const DEMO_EXIT_TESTID = "demo-exit-link";

const DEMO_EXIT_HREF = "./";
const DEMO_BADGE_TITLE = "A demo with made-up data. Nothing here touches your real log, and reloading resets it.";
const COPY_BADGE_TITLE = "A development copy, with its own data. Nothing here touches your real log.";
/** Says both halves of what a visitor must know: it is made up, and it does not persist. */
const DEMO_EXIT_TEXT = "Made-up data, resets on reload. Leave the demo";

/**
 * Shows the badge for any channel except the published one; does nothing there.
 *
 * @param {HTMLElement|null} badge the `#channel-badge` element, absent on pages that do not have one.
 * @param {string} channel one of the channel names in channel.js.
 * @param {Document} [doc] injectable so tests need no browser.
 * @param {HTMLElement} [root] the element that receives `data-channel` for the stylesheet.
 */
export function paintChannelBadge(badge, channel, doc = document, root = doc.documentElement) {
  if (!badge || channel === STABLE) return;
  badge.textContent = channel.toUpperCase();
  badge.title = channel === DEMO ? DEMO_BADGE_TITLE : COPY_BADGE_TITLE;
  badge.hidden = false;
  root.dataset.channel = channel;
  if (channel !== DEMO) return;
  const exit = doc.createElement("a");
  exit.className = "channel-exit small";
  exit.setAttribute("href", DEMO_EXIT_HREF);
  exit.setAttribute("data-testid", DEMO_EXIT_TESTID);
  exit.textContent = DEMO_EXIT_TEXT;
  badge.after(exit);
}
