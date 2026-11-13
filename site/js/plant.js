// A hand-drawn, procedurally-composed plant — not a sprite sheet, not a
// library. Two independent axes render into one illustration: `stage`
// (cumulative, never regresses — how much has ever been grown) picks the
// silhouette; `vitality` (volatile, reflects the last two weeks) picks the
// palette, the droop of the stem, whether buds are open flowers or closed
// fists, and whether a couple of leaves have let go and fallen to the soil.
// Motion lives in CSS (see styles.css's .plant-* keyframes) so the same
// markup animates for free — this module only ever returns a string of SVG.

const PALETTE = {
  thriving: {
    stem: "#4caf6d", leaf: "#4caf6d", leafHi: "#7fd99a",
    petals: ["#ff9a5a", "#ffd166", "#f76e8b", "#c792ea"], center: "#fff3b0",
    bud: "#6fbf7f", droop: 0, sway: "3.2s", fallen: 0, openBloom: true,
  },
  steady: {
    stem: "#6b9e5c", leaf: "#6b9e5c", leafHi: "#8fbf82",
    petals: ["#e2935f", "#e8c15f"], center: "#f3e3a8",
    bud: "#7ba36c", droop: 0.12, sway: "4.2s", fallen: 0, openBloom: true,
  },
  stressed: {
    stem: "#9c9450", leaf: "#968f4c", leafHi: "#b3ab6a",
    petals: ["#c9b25a"], center: "#e8d98a",
    bud: "#a89a5c", droop: 0.32, sway: "5.4s", fallen: 1, openBloom: false,
  },
  wilting: {
    stem: "#8a7350", leaf: "#7d6a4a", leafHi: "#93805c",
    petals: [], center: "#8a7350",
    bud: "#7d6a4a", droop: 0.6, sway: "7s", fallen: 3, openBloom: false,
  },
};

const BASE = { x: 100, y: 181 }; // soil surface, stem origin

function potAndSoil() {
  return `
    <ellipse cx="100" cy="230" rx="34" ry="6" fill="#000" opacity="0.15"/>
    <path d="M62,182 L72,230 Q100,237 128,230 L138,182 Z" fill="#c1613f"/>
    <path d="M62,182 L138,182 L134,196 L66,196 Z" fill="#a84f34"/>
    <ellipse cx="100" cy="182" rx="38" ry="8" fill="#d97a54"/>
    <ellipse cx="100" cy="181" rx="33" ry="6" fill="#4a3728"/>`;
}

/** One stem, curving toward `lean` (px at the tip) and drooping over the
 * last third when `droop` > 0 — the single knob that makes a stem read as
 * upright-and-healthy vs. flopped-over-and-tired. Returns the path `d` and
 * the tip point so leaves/flowers can be placed relative to it. */
function stem(tipY, droop, lean = 6) {
  const midY = (BASE.y + tipY) / 2;
  const tipX = BASE.x + lean + droop * 26;
  const tipYD = tipY + droop * 22;
  const d = `M${BASE.x},${BASE.y} Q${BASE.x + lean * 0.6},${midY} ${tipX},${tipYD}`;
  return { d, tip: { x: tipX, y: tipYD } };
}

function leaf(x, y, angle, scale, palette) {
  return `
    <g transform="translate(${x},${y}) rotate(${angle})">
      <path d="M0,0 Q${9 * scale},${-5 * scale} ${18 * scale},0 Q${9 * scale},${5 * scale} 0,0 Z" fill="${palette.leaf}"/>
      <path d="M0,0 Q${9 * scale},0 ${17 * scale},0" stroke="${palette.leafHi}" stroke-width="${0.8 * scale}" fill="none" opacity="0.7"/>
    </g>`;
}

function leafPair(x, y, baseAngle, scale, palette, droop) {
  const drop = droop * 35;
  return leaf(x, y, baseAngle - 20 + drop, scale, palette) + leaf(x, y, 180 - baseAngle + 20 - drop, scale, palette);
}

function bloom(x, y, scale, palette, open) {
  if (!open || palette.petals.length === 0) {
    return `<g transform="translate(${x},${y})"><path d="M0,0 Q${3 * scale},${-6 * scale} 0,${-11 * scale} Q${-3 * scale},${-6 * scale} 0,0 Z" fill="${palette.bud}"/></g>`;
  }
  let petals = "";
  for (let i = 0; i < 5; i++) {
    const color = palette.petals[i % palette.petals.length];
    petals += `<g transform="rotate(${i * 72})"><ellipse cx="0" cy="${-5 * scale}" rx="${3 * scale}" ry="${5.5 * scale}" fill="${color}"/></g>`;
  }
  return `<g transform="translate(${x},${y})">${petals}<circle r="${2 * scale}" fill="${palette.center}"/></g>`;
}

function fallenLeaves(count, palette) {
  const spots = [[70, 220, -30], [128, 224, 40], [82, 227, 10]];
  let out = "";
  for (let i = 0; i < Math.min(count, spots.length); i++) {
    const [x, y, a] = spots[i];
    // Named, because a dropped leaf is the drawing's one statement about
    // health that isn't a colour, and nothing outside this file could see it.
    out += `<g class="plant-fallen">${leaf(x, y, a, 0.7, palette)}</g>`;
  }
  return out;
}

const STAGE_DRAWERS = {
  seed(p) {
    return `<ellipse cx="100" cy="175" rx="9" ry="6.5" fill="${p.stem}"/><path d="M94,175 Q100,164 106,175" stroke="${p.leafHi}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  },
  sprout(p) {
    const s = stem(146, p.droop, 4);
    return `<path d="${s.d}" stroke="${p.stem}" stroke-width="4.2" fill="none" stroke-linecap="round"/>
      ${leafPair(s.tip.x, s.tip.y, 28, 1.6, p, p.droop)}`;
  },
  seedling(p) {
    const s = stem(120, p.droop, 6);
    return `<path d="${s.d}" stroke="${p.stem}" stroke-width="4.8" fill="none" stroke-linecap="round"/>
      ${leafPair(BASE.x + 7, 155, 24, 1.4, p, p.droop)}
      ${leafPair(s.tip.x, s.tip.y, 28, 1.5, p, p.droop)}`;
  },
  young(p) {
    const s = stem(92, p.droop, 9);
    return `<path d="${s.d}" stroke="${p.stem}" stroke-width="5.4" fill="none" stroke-linecap="round"/>
      ${leafPair(BASE.x + 5, 152, 24, 1.4, p, p.droop)}
      ${leafPair(BASE.x + 10, 122, 27, 1.45, p, p.droop)}
      ${leafPair(s.tip.x, s.tip.y, 28, 1.45, p, p.droop)}`;
  },
  budding(p) {
    const s = stem(66, p.droop, 11);
    return `<path d="${s.d}" stroke="${p.stem}" stroke-width="5.8" fill="none" stroke-linecap="round"/>
      ${leafPair(BASE.x + 4, 150, 24, 1.45, p, p.droop)}
      ${leafPair(BASE.x + 11, 120, 27, 1.5, p, p.droop)}
      ${leafPair(BASE.x + 16, 92, 29, 1.5, p, p.droop)}
      ${bloom(s.tip.x, s.tip.y, 1.5, p, false)}
      ${bloom(BASE.x + 24, 84, 1.1, p, false)}`;
  },
  flowering(p) {
    const s = stem(50, p.droop, 13);
    return `<path d="${s.d}" stroke="${p.stem}" stroke-width="6.2" fill="none" stroke-linecap="round"/>
      ${leafPair(BASE.x + 4, 148, 24, 1.5, p, p.droop)}
      ${leafPair(BASE.x + 12, 116, 27, 1.55, p, p.droop)}
      ${leafPair(BASE.x + 19, 86, 29, 1.55, p, p.droop)}
      ${bloom(s.tip.x, s.tip.y, 1.7, p, p.openBloom)}
      ${bloom(BASE.x + 28, 78, 1.3, p, p.openBloom)}
      ${bloom(BASE.x - 18, 100, 1.15, p, p.openBloom)}`;
  },
  tree(p) {
    const trunk = `M${BASE.x},${BASE.y} Q${BASE.x + 4},150 ${BASE.x + 2 + p.droop * 14},${125 + p.droop * 10}`;
    const canopyCx = BASE.x + 2 + p.droop * 20, canopyCy = 96 + p.droop * 14;
    let canopy = "";
    const puffs = [[0, 0, 34], [-26, 10, 24], [26, 8, 26], [-10, -18, 22], [16, -16, 24]];
    for (const [dx, dy, r] of puffs) {
      canopy += `<circle cx="${canopyCx + dx}" cy="${canopyCy + dy}" r="${r}" fill="${p.leaf}"/>`;
    }
    let fruit = "";
    if (p.openBloom) {
      const spots = [[-18, -6], [14, -20], [-4, 14], [22, 4], [-30, 4]];
      for (const [dx, dy] of spots) fruit += bloom(canopyCx + dx, canopyCy + dy, 0.7, p, true);
    }
    return `<path d="${trunk}" stroke="${p.stem}" stroke-width="9" fill="none" stroke-linecap="round"/>
      <circle cx="${canopyCx}" cy="${canopyCy}" r="34" fill="${p.leafHi}" opacity="0.35"/>
      ${canopy}${fruit}`;
  },
};

export function plantSvg(stageKey, vitality, { size = 220, decorative = false } = {}) {
  // Resolved once, and everything downstream uses the resolved name. The
  // palette fell back and the class name did not, so an unrecognised vitality
  // drew a steady plant inside `plant-vitality-nonsense` — which matches no
  // rule, so the widget's frame lost its colour while the plant looked fine.
  const tone = PALETTE[vitality] ? vitality : "steady";
  const p = PALETTE[tone];
  const draw = STAGE_DRAWERS[stageKey] || STAGE_DRAWERS.seed;
  const body = draw(p);
  const fallen = p.fallen > 0 && stageKey !== "seed" ? fallenLeaves(p.fallen, p) : "";
  return `
<svg viewBox="0 0 200 240" width="${size}" height="${size * 1.2}" class="plant-illustration plant-vitality-${tone}"
  ${decorative
    // Genuinely removed from the tree rather than given an empty name. An
    // <svg role="img"> with aria-label="" is still announced — as an image
    // with no description, which is worse than not being announced at all.
    // Every decorative use sits beside text that already says this.
    ? 'aria-hidden="true" focusable="false"'
    : `role="img" aria-label="Practice plant, ${stageKey}, ${tone}"`}>
  <g class="plant-sway" style="--plant-sway-duration:${p.sway}; transform-origin: 100px 182px;">
    ${body}
    ${fallen}
  </g>
  ${potAndSoil()}
</svg>`;
}
