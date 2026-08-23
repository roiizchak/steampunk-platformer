/**
 * The art measurement gates, and the fixtures that prove each one can fail.
 *
 * Vault **4.21**: *"Self-test the gate on synthetic fixtures on every run, before it judges real
 * art — runnable with source art absent."* It caught a 4-pixel speck scoring as a whole second
 * figure. Codex plan review finding 3: an earlier draft self-tested the chroma gate only, leaving
 * dimension, alpha, motion, loop, bounds, grid and seam measurements unproven. `selfTest()` (in
 * `gatesSelfTest.mjs`) covers **every** gate here — criterion 4.26.
 *
 * ## Two rules these gates exist to obey
 *
 * **4.19 — enumerate the axes your metrics measure, then ask which axis the failure lives on.**
 * Every art metric in the prior project was vertical, so a purely-upward attack measured
 * beautifully while nothing crossed the gap. Each gate below names its axis in its doc comment;
 * where no metric can see the thing, the gate says so *(vault 9.3)* rather than shipping a number
 * that means nothing — the brass-cap rule and anatomy are both `play`-owned, not gated here.
 *
 * **4.18 — a box is a claim about a sprite, and INDETERMINATE is a real answer.** A sheet the metric
 * cannot call must say so rather than guess. But a run where EVERY sheet is indeterminate is not a
 * passing run (Codex finding 2 against criterion 4.10); `summarise()` enforces that.
 */

import { decodePng } from './png.mjs';
import { CHROMA, hasRealAlpha } from './chroma.mjs';

// The three statuses and `verdict` moved to the LEAF `gateVerdict.mjs` (inventory 5.25) so that
// `gatesBrassCap.mjs` can reach them without importing this module back. Re-exported here because
// nineteen files import them from this path and none of them needed to change.
import { FAIL, INDETERMINATE, PASS, verdict } from './gateVerdict.mjs';

export { PASS, FAIL, INDETERMINATE, verdict };

/** Paint a filled rectangle into an RGBA image. Fixture helper. */
export function fill(image, x0, y0, w, h, rgba) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const i = (y * image.width + x) * 4;
      image.data[i] = rgba[0];
      image.data[i + 1] = rgba[1];
      image.data[i + 2] = rgba[2];
      image.data[i + 3] = rgba[3];
    }
  }
  return image;
}


/* ------------------------------------------------------------------ *
 * 1. Dimensions — read from the FILE, never from the aspect label.
 * Axis: none; this is a fact about bytes. Vault 4.11 / 3.2.
 * ------------------------------------------------------------------ */

/**
 * `nano-banana-2` returned `2752 x 1536` at `16:9` — ratio 1.7917, not 1.7778 — and the job record
 * reported `width: null`. The label is not the measurement.
 */
export function gateDimensions(buffer, expected) {
  const png = decodePng(buffer);
  const value = { width: png.width, height: png.height, ratio: png.width / png.height };
  if (!expected) {
    return verdict(PASS, value, 'recorded; no expectation given');
  }
  if (png.width !== expected.width || png.height !== expected.height) {
    return verdict(
      FAIL,
      value,
      `expected ${expected.width}x${expected.height}, file is ${png.width}x${png.height}`,
    );
  }
  return verdict(PASS, value, 'matches the expected dimensions');
}

/* ------------------------------------------------------------------ *
 * 2. Alpha — read the CHANNEL's values. Vault 4.12.
 * ------------------------------------------------------------------ */

/**
 * Reports both questions separately, because conflating them is the vault-4.12 failure itself:
 * `channelPresent` is whether the file has an alpha channel at all, `realTransparency` is whether
 * any pixel actually uses it. Three identical-parameter portraits once came back RGBA/RGBA/RGB with
 * alpha 255 everywhere — the channel existed and meant nothing.
 */
export function gateAlpha(buffer) {
  const png = decodePng(buffer);
  const real = hasRealAlpha(png);
  const value = { channelPresent: png.sourceHadAlphaChannel, realTransparency: real };
  return verdict(
    PASS,
    value,
    real
      ? 'real transparency present — chroma keying may be unnecessary'
      : 'no transparent pixel found — chroma keying is required (the safe direction)',
  );
}

/* ------------------------------------------------------------------ *
 * 3. Motion floor — a held state must actually move. Vault 4.23.
 * Axis: per-pixel change between frames, both axes together.
 * ------------------------------------------------------------------ */

/** Mean absolute per-pixel difference between two RGBA frames, normalised to 0..1. */
export function frameDifference(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error('frameDifference: frames differ in size');
  }
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    sum +=
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]) +
      Math.abs(a.data[i + 3] - b.data[i + 3]);
  }
  return sum / (a.data.length * 255);
}

/**
 * Two held sheets once shipped at amplitude 0.05 and 0.06 because the minimum-motion check covered
 * only attacks. So held states get their OWN floor, and it applies to every looping clip.
 */
export const MOTION_FLOOR = 0.002;

export function gateMotionFloor(frames, floor = MOTION_FLOOR) {
  if (frames.length < 2) {
    return verdict(INDETERMINATE, null, 'fewer than two frames — nothing to compare');
  }
  let peak = 0;
  for (let i = 1; i < frames.length; i += 1) {
    peak = Math.max(peak, frameDifference(frames[0], frames[i]));
  }
  return peak >= floor
    ? verdict(PASS, peak, `peak motion ${peak.toFixed(5)} >= floor ${floor}`)
    : verdict(FAIL, peak, `peak motion ${peak.toFixed(5)} < floor ${floor} — the clip is frozen`);
}

/* ------------------------------------------------------------------ *
 * 4. Loop wrap — criterion 4.20. Vault 4.23.
 * ------------------------------------------------------------------ */

/**
 * `loop: true` is a CLAIM that the last frame can be followed by the first.
 *
 * Codex finding 2: a clip can carry `loop: true`, clear the motion floor, and still snap visibly at
 * the wrap. So the wrap is measured on its own terms — the last-to-first difference must be no
 * worse than the typical frame-to-frame step, with a little slack. A clip whose wrap is a bigger
 * jump than any interior step is not a loop.
 */
export function gateLoopWrap(frames, slack = 1.5) {
  if (frames.length < 3) {
    return verdict(INDETERMINATE, null, 'fewer than three frames — no interior step to compare');
  }
  const steps = [];
  for (let i = 1; i < frames.length; i += 1) {
    steps.push(frameDifference(frames[i - 1], frames[i]));
  }
  const wrap = frameDifference(frames[frames.length - 1], frames[0]);
  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted[Math.floor(steps.length / 2)];
  const largestStep = sorted[sorted.length - 1];

  /**
   * The budget is the median times `slack`, **or the largest step the clip already makes**,
   * whichever is larger.
   *
   * The gate asks one question: does the wrap read as a SNAP? A wrap no bigger than a step the
   * animation already contains cannot, by definition — the viewer has already seen a jump that
   * size and read it as motion.
   *
   * Without that clause the gate fails clips it should not. A ping-ponged idle plays `1..n` then
   * `n-1..2`, so its wrap is literally the drawn `2 -> 1` step; but mirroring also duplicates every
   * small interior step, which drags the median DOWN, and the real step then fails a budget derived
   * from the halved median. Measured on the shipped idle: wrap 0.01523 against a 0.01516 budget —
   * a 0.5 % miss on a step the artist drew, while the clip's own largest step was 0.02491.
   *
   * This makes the gate weaker in exactly one direction, and it is worth naming: a clip whose
   * frames are ALL wildly far apart now has a large budget. That case is already caught, by
   * `gateMotionFloor` from below and by the fact that such a clip has no coherent motion to read.
   */
  const budget = Math.max(median * slack, largestStep);
  const value = { wrap, medianStep: median, largestStep, budget };
  return wrap <= budget
    ? verdict(PASS, value, `wrap ${wrap.toFixed(5)} within ${budget.toFixed(5)}`)
    : verdict(FAIL, value, `wrap ${wrap.toFixed(5)} exceeds ${budget.toFixed(5)} — it snaps`);
}

/* ------------------------------------------------------------------ *
 * 5. Bounds by frame difference — vault 4.18 (blocker).
 * Axis: horizontal reach of MOVED pixels. Explicitly NOT opaque columns.
 * ------------------------------------------------------------------ */

/**
 * Difference each frame against frame 0 and take the y band of the furthest-forward moved pixels.
 *
 * The three traps the vault names, all avoided here:
 *  - **Furthest opaque COLUMN is the wrong metric** — a planted leg is the widest thing in a strike
 *    frame, so an opacity-based reach measures the leg. This uses CHANGED pixels only.
 *  - **A sheet the metric cannot call reports INDETERMINATE**, never a guess.
 *  - The number that matters is the **visible gap**, not skin contact — so the caller gets the band
 *    and the reach, not a boolean.
 */
export function gateReachBand(frames, threshold = 24) {
  if (frames.length < 2) {
    return verdict(INDETERMINATE, null, 'fewer than two frames — nothing moved to measure');
  }
  const base = frames[0];
  let best = null;

  for (let f = 1; f < frames.length; f += 1) {
    const frame = frames[f];
    let maxX = -1;
    let top = Infinity;
    let bottom = -Infinity;
    let moved = 0;
    for (let y = 0; y < base.height; y += 1) {
      for (let x = 0; x < base.width; x += 1) {
        const i = (y * base.width + x) * 4;
        const d =
          Math.abs(base.data[i] - frame.data[i]) +
          Math.abs(base.data[i + 1] - frame.data[i + 1]) +
          Math.abs(base.data[i + 2] - frame.data[i + 2]) +
          Math.abs(base.data[i + 3] - frame.data[i + 3]);
        if (d >= threshold) {
          moved += 1;
          if (x > maxX) {
            maxX = x;
            top = y;
            bottom = y;
          } else if (x === maxX) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
    }
    if (moved === 0) {
      continue;
    }
    if (!best || maxX > best.reachX) {
      best = { frame: f, reachX: maxX, top, bottom, movedPx: moved };
    }
  }

  if (!best) {
    return verdict(INDETERMINATE, null, 'no pixel changed by more than the threshold in any frame');
  }
  if (best.movedPx < CHROMA.MIN_COMPONENT_PX) {
    return verdict(
      INDETERMINATE,
      best,
      `only ${best.movedPx}px changed — below the ${CHROMA.MIN_COMPONENT_PX}px component floor, ` +
        `so the "furthest forward" pixel is as likely to be noise as a limb`,
    );
  }
  return verdict(PASS, best, `reach ${best.reachX}px, band y ${best.top}..${best.bottom}`);
}

/* ------------------------------------------------------------------ *
 * 6. Grid exactness — criterion 4.23, tileset.
 * ------------------------------------------------------------------ */

/** A tileset that is not an exact multiple of the cell size slices into a partial edge cell. */
export function gateGridExact(image, cell) {
  const value = { width: image.width, height: image.height, cell };
  if (!Number.isInteger(cell) || cell < 1) {
    return verdict(FAIL, value, `cell size must be a positive integer, got ${cell}`);
  }
  const xr = image.width % cell;
  const yr = image.height % cell;
  return xr === 0 && yr === 0
    ? verdict(PASS, { ...value, cols: image.width / cell, rows: image.height / cell }, 'exact')
    : verdict(FAIL, value, `remainder ${xr}x${yr}px — the last cell would be partial`);
}

/* ------------------------------------------------------------------ *
 * 7. Seam continuity — criterion 4.24, parallax.
 * Axis: horizontal only, and deliberately so — a vertical seam is not a thing here.
 * ------------------------------------------------------------------ */

/**
 * A parallax layer loops horizontally, so its last column must be able to precede its first.
 *
 * Compared against the typical INTERIOR column-to-column step rather than an absolute number,
 * because a busy layer and a smooth sky have very different natural step sizes and one constant
 * would either pass everything or fail everything.
 */
export function gateSeam(image, slack = 3) {
  if (image.width < 3) {
    return verdict(INDETERMINATE, null, 'image too narrow to have an interior step');
  }
  const column = (x) => {
    const out = new Uint8ClampedArray(image.height * 4);
    for (let y = 0; y < image.height; y += 1) {
      const i = (y * image.width + x) * 4;
      out[y * 4] = image.data[i];
      out[y * 4 + 1] = image.data[i + 1];
      out[y * 4 + 2] = image.data[i + 2];
      out[y * 4 + 3] = image.data[i + 3];
    }
    return { width: 1, height: image.height, data: out };
  };

  const steps = [];
  for (let x = 1; x < image.width; x += 1) {
    steps.push(frameDifference(column(x - 1), column(x)));
  }
  const wrap = frameDifference(column(image.width - 1), column(0));
  const median = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)];
  const budget = Math.max(median * slack, 1e-6);
  const value = { wrap, medianStep: median, budget };
  return wrap <= budget
    ? verdict(PASS, value, `seam ${wrap.toFixed(6)} within ${budget.toFixed(6)}`)
    : verdict(FAIL, value, `seam ${wrap.toFixed(6)} exceeds ${budget.toFixed(6)} — it will tear`);
}

/* ------------------------------------------------------------------ *
 * 8 & 9. Zone separation and brass cap — both STYLE.md §5. Moved to `gatesBrassCap.mjs` (400-line
 * limit); re-exported because `build-world.mjs` and `ground-tiles.test.ts` import all three by
 * name from `'./gates.mjs'`.
 * ------------------------------------------------------------------ */

export { regionStats, WARM, gateBrassCap } from './gatesBrassCap.mjs';

export const BLIND_SPOTS = Object.freeze([
  'the brass leading-edge rule is only PARTLY gated: gateBrassCap measures where the warm pixels ' +
    'sit inside one tile, but not whether the cap is continuous across adjoining tiles, and not ' +
    'whether it reads as an edge at true size — both stay play-owned',
  'anatomy: a third limb scores FAVOURABLY on silhouette metrics (vault 4.20)',
  'facing direction',
  'readability at true sprite size (vault 4.24 — look to find, count to decide)',
]);

/* ------------------------------------------------------------------ *
 * summarise + selfTest
 * ------------------------------------------------------------------ */

/**
 * Roll a set of verdicts into one, with the rule Codex finding 2 asked for:
 * **INDETERMINATE is a legitimate answer for a sheet, but not for a whole run.**
 */
export function summarise(results) {
  const entries = Object.entries(results);
  if (entries.length === 0) {
    return verdict(FAIL, null, 'no gates ran — an empty gate set is not a pass');
  }
  const failed = entries.filter(([, v]) => v.status === FAIL);
  const unknown = entries.filter(([, v]) => v.status === INDETERMINATE);
  if (failed.length > 0) {
    return verdict(FAIL, { failed: failed.map(([k]) => k) }, `${failed.length} gate(s) failed`);
  }
  if (unknown.length === entries.length) {
    return verdict(
      FAIL,
      { indeterminate: unknown.map(([k]) => k) },
      'every gate returned INDETERMINATE — a run that measured nothing is not a passing run',
    );
  }
  return verdict(
    PASS,
    { indeterminate: unknown.map(([k]) => k) },
    unknown.length > 0 ? `${unknown.length} gate(s) INDETERMINATE, recorded` : 'all gates passed',
  );
}

/**
 * `fill` is defined above and genuinely exported from this file; `selfTest` is NOT — it lives in
 * `gatesSelfTest.mjs`, which imports FROM here and is never imported back (the
 * `motion.mjs`/`motionCombat.mjs` TDZ risk). Import `selfTest` from `./gatesSelfTest.mjs` directly.
 * `WARM`/`gateBrassCap` DO get re-exported above despite the resulting cycle, because
 * `gatesBrassCap.mjs` never calls back into this module at load time — only inside function
 * bodies, which run long after both modules have finished loading.
 */

