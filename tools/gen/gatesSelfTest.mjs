/**
 * The self-test for `gates.mjs` — split out of that file to keep it under the 400-line limit.
 *
 * Vault **4.21**: *"Self-test the gate on synthetic fixtures on every run, before it judges real
 * art — runnable with source art absent."* Fixtures are built in memory here, never read from
 * disk, so this runs on a fresh clone and under `npm run test:sim-isolated` with Phaser
 * uninstalled.
 *
 * **This module imports FROM `gates.mjs` and nothing imports back**, deliberately. The first cut of
 * this split had `gates.mjs` re-export `selfTest` and `fill` from here, which made the two mutually
 * dependent — safe only for as long as this file happened to declare no top-level `const`, one edit
 * away from a TDZ crash, and the same fragility already recorded for `motion.mjs`/`motionCombat.mjs`.
 * `fill` therefore lives in `gates.mjs` beside the gates that use it; `selfTest` is imported from
 * here directly by `tests/unit/art-gates.test.ts`. Raised by the `voltagent-qa-sec:code-reviewer`
 * gate owner, session 7.
 */

import { blank, encodePng } from './png.mjs';
import { components, keyOut, removeSpecks } from './chroma.mjs';
import {
  FAIL,
  INDETERMINATE,
  PASS,
  gateAlpha,
  gateBrassCap,
  gateDimensions,
  gateGridExact,
  gateLoopWrap,
  gateMotionFloor,
  gateReachBand,
  gateSeam,
  fill,
  summarise,
  verdict,
} from './gates.mjs';


/**
 * Every gate, run against a synthetic fixture built to FAIL it, and one built to pass.
 *
 * Runs with no source art present — that is the point of vault 4.21, and it is why the fixtures are
 * constructed in memory here rather than read from disk. Returns a list of `{gate, ok, detail}`.
 */
export function selfTest() {
  const results = [];
  const check = (gate, ok, detail) => results.push({ gate, ok, detail });

  // --- dimensions: a 4x2 image is not 8x8.
  const png4x2 = encodeFixture(4, 2, [255, 0, 0, 255]);
  check(
    'dimensions',
    gateDimensions(png4x2, { width: 8, height: 8 }).status === FAIL &&
      gateDimensions(png4x2, { width: 4, height: 2 }).status === PASS,
    'fails on a size mismatch, passes on a match',
  );

  // --- alpha: an opaque image must NOT report real transparency, whatever its colour type.
  const opaque = gateAlpha(encodeFixture(4, 4, [10, 20, 30, 255]));
  const transparent = gateAlpha(encodeFixture(4, 4, [10, 20, 30, 0]));
  check(
    'alpha',
    opaque.value.realTransparency === false &&
      opaque.value.channelPresent === true &&
      transparent.value.realTransparency === true,
    'reads the channel VALUES — an RGBA file with alpha 255 everywhere reports no transparency',
  );

  // --- chroma: pure-ish green keys out; a near-miss green also keys out (never equality).
  const keyed = keyOut(fill(blank(4, 4, [0, 0, 0, 255]), 0, 0, 4, 4, [252, 1, 252, 255]), {
    key: [255, 0, 255],
  });
  const keyedExact = keyOut(fill(blank(4, 4, [0, 0, 0, 255]), 0, 0, 4, 4, [255, 0, 255, 255]), {
    key: [255, 0, 255],
  });
  check(
    'chroma-tolerance',
    keyed.data[3] === 0 && keyedExact.data[3] === 0,
    'keys by L1 distance with tolerance — (252,1,252) is removed, not only exact (255,0,255)',
  );

  // --- specks: a 4px blob is a speck; a 32x32 block is not. Judged by AREA, not alpha > 0.
  const speckSrc = blank(64, 64, [0, 0, 0, 0]);
  fill(speckSrc, 0, 0, 32, 32, [200, 200, 200, 255]); // 1024px figure
  fill(speckSrc, 60, 60, 2, 2, [200, 200, 200, 255]); // 4px speck
  const despeckled = removeSpecks(speckSrc);
  const remaining = components(despeckled).sizes.filter((s) => s > 0);
  check(
    'speck-area',
    remaining.length === 1 && remaining[0] === 1024 && despeckled.data[(61 * 64 + 61) * 4 + 3] === 0,
    'a 4px speck is erased and a 1024px figure survives — an alpha>0 test would keep both',
  );

  // --- motion floor: identical frames fail, a moved block passes.
  const still = blank(16, 16, [0, 0, 0, 255]);
  const movedFrame = fill(blank(16, 16, [0, 0, 0, 255]), 4, 4, 8, 8, [255, 255, 255, 255]);
  check(
    'motion-floor',
    gateMotionFloor([still, cloneOf(still)]).status === FAIL &&
      gateMotionFloor([still, movedFrame]).status === PASS,
    'a frozen clip fails and a moving one passes',
  );

  // --- loop wrap: a ramp that jumps back at the end snaps; a symmetric there-and-back does not.
  const ramp = [0, 1, 2, 3].map((k) => fill(blank(16, 16, [0, 0, 0, 255]), 0, 0, 16, 16,
    [k * 60, k * 60, k * 60, 255]));
  const pingpong = [0, 1, 2, 1].map((k) => fill(blank(16, 16, [0, 0, 0, 255]), 0, 0, 16, 16,
    [k * 60, k * 60, k * 60, 255]));
  check(
    'loop-wrap',
    gateLoopWrap(ramp).status === FAIL && gateLoopWrap(pingpong).status === PASS,
    'a clip that jumps back at the wrap fails; one that returns smoothly passes',
  );

  // --- the largest-step clause, pinned in both directions.
  //
  // A clip with one big interior move and a wrap the SAME size must pass — the viewer has already
  // seen a jump that size and read it as motion. The same clip with a wrap larger than anything it
  // contains must still fail, or widening the budget would have made the gate decorative.
  const shade = (k) => fill(blank(16, 16, [0, 0, 0, 255]), 0, 0, 16, 16, [k, k, k, 255]);
  //           steps: 10, 10, 120        wrap back to 0 is 140 -> larger than any step
  const bigStepBadWrap = [0, 10, 20, 140].map(shade);
  //           steps: 10, 10, 120        wrap 3 -> 0 is 120, exactly the largest step
  const bigStepGoodWrap = [0, 10, 20, 140].map(shade).concat([shade(20)]);
  check(
    'loop-wrap-largest-step',
    gateLoopWrap(bigStepBadWrap).status === FAIL && gateLoopWrap(bigStepGoodWrap).status === PASS,
    'a wrap no larger than a step the clip already makes is not a snap; a larger one still is',
  );

  // --- reach band: a moved arm is measured; a 4px twitch is INDETERMINATE, never a guess.
  const base = blank(64, 64, [0, 0, 0, 255]);
  const armOut = fill(cloneOf(base), 40, 20, 20, 20, [255, 255, 255, 255]);
  const twitch = fill(cloneOf(base), 62, 62, 2, 2, [255, 255, 255, 255]);
  const reach = gateReachBand([base, armOut]);
  check(
    'reach-band',
    reach.status === PASS && reach.value.reachX === 59 &&
      gateReachBand([base, twitch]).status === INDETERMINATE,
    'measures the moved pixels, and says INDETERMINATE rather than guessing from a 4px change',
  );

  // --- reach band must NOT be fooled by a planted leg: an opaque column wider than the moved arm.
  const withLeg = fill(cloneOf(base), 0, 0, 64, 64, [0, 0, 0, 255]);
  fill(withLeg, 63, 0, 1, 64, [90, 90, 90, 255]); // static column at the far right, in BOTH frames
  const legBase = cloneOf(withLeg);
  const legMoved = fill(cloneOf(withLeg), 30, 20, 20, 20, [255, 255, 255, 255]);
  const legReach = gateReachBand([legBase, legMoved]);
  check(
    'reach-ignores-static',
    legReach.status === PASS && legReach.value.reachX === 49,
    'a static column at x=63 does not become the reach — only CHANGED pixels count (vault 4.18)',
  );

  // --- grid exactness.
  check(
    'grid-exact',
    gateGridExact(blank(96, 64), 32).status === PASS &&
      gateGridExact(blank(100, 64), 32).status === FAIL,
    '96x64 slices exactly at 32px; 100x64 leaves a partial cell',
  );

  // --- seam: a horizontal gradient tears at the wrap; a mirrored one does not.
  const gradient = blank(32, 8, [0, 0, 0, 255]);
  const mirrored = blank(32, 8, [0, 0, 0, 255]);
  for (let x = 0; x < 32; x += 1) {
    const g = Math.round((x / 31) * 255);
    const m = Math.round((1 - Math.abs(x - 15.5) / 15.5) * 255);
    fill(gradient, x, 0, 1, 8, [g, g, g, 255]);
    fill(mirrored, x, 0, 1, 8, [m, m, m, 255]);
  }
  check(
    'seam',
    gateSeam(gradient).status === FAIL && gateSeam(mirrored).status === PASS,
    'a ramp tears at the wrap; a mirrored strip loops',
  );

  // --- brass cap: the fixture set is the defect that shipped.
  //
  // Three 32x32 tiles on the same grey body: one with the warm band on its top edge, one with the
  // SAME AMOUNT of warm across its middle, and one with none at all. The middle-bar tile is the
  // one Phase 4 actually drew on every ground row, and a metric that only counts warm pixels
  // cannot tell it from the capped one — they are identical on that axis. This fixture fails if
  // the gate ever stops measuring vertical position.
  const grey = () => fill(blank(32, 32, [0, 0, 0, 0]), 0, 0, 32, 32, [70, 66, 62, 255]);
  const cappedTile = fill(grey(), 0, 0, 32, 4, [190, 150, 70, 255]);
  const midBarTile = fill(grey(), 0, 14, 32, 4, [190, 150, 70, 255]);
  const plainTile = grey();
  check(
    'brass-cap',
    gateBrassCap(cappedTile, 'capped').status === PASS &&
      gateBrassCap(midBarTile, 'capped').status === FAIL &&
      gateBrassCap(plainTile, 'capped').status === FAIL &&
      gateBrassCap(plainTile, 'plain').status === PASS &&
      gateBrassCap(midBarTile, 'plain').status === FAIL &&
      gateBrassCap(blank(32, 32, [0, 0, 0, 0]), 'capped').status === INDETERMINATE,
    'a top edge passes, the SAME warmth across the middle fails, and an empty tile is INDETERMINATE',
  );

  // --- summarise: all-INDETERMINATE is not a pass.
  check(
    'summarise',
    summarise({ a: verdict(INDETERMINATE, null, '') }).status === FAIL &&
      summarise({ a: verdict(PASS, 1, ''), b: verdict(INDETERMINATE, null, '') }).status === PASS &&
      summarise({}).status === FAIL,
    'every-gate-INDETERMINATE fails, a mixed run passes, an empty run fails',
  );

  return results;
}

function cloneOf(image) {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

/** Build a solid-colour PNG buffer without touching the filesystem (vault 4.21). */
function encodeFixture(width, height, rgba) {
  const img = blank(width, height, rgba);
  return encodePng(width, height, img.data);
}
