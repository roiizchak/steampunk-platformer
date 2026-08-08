/**
 * Every art gate self-tests on fixtures before it judges real art — criterion 4.26, vault **4.21**.
 *
 * Codex plan review finding 3: an earlier draft delivered `chroma-gate.test.ts` only, and criterion
 * 4.5 narrowed fixture self-testing to the chroma gate. That left dimension, alpha, motion, loop,
 * bounds, grid and seam measurements running without ever proving their instruments can fail — and
 * vault 4.21's own evidence is a 4-pixel speck scoring as a whole second figure, i.e. exactly an
 * instrument that could not fail.
 *
 * The suite runs **with no source art present**, which is 4.21's other requirement: every fixture
 * is constructed in memory. That is also what lets it run on a fresh clone where `_generated/` is
 * gitignored, and under `npm run test:sim-isolated` with Phaser uninstalled.
 *
 * `selfTest()` lives beside the gates rather than here so the BUILD runs it too, not only CI. This
 * file asserts that it ran and that each case genuinely discriminates.
 */

import { describe, expect, it } from 'vitest';
import {
  BLIND_SPOTS,
  FAIL,
  INDETERMINATE,
  PASS,
  fill,
  frameDifference,
  gateAlpha,
  gateDimensions,
  gateGridExact,
  gateLoopWrap,
  gateMotionFloor,
  gateReachBand,
  gateSeam,
  regionStats,
  selfTest,
  summarise,
} from '../../tools/gen/gates.mjs';
import { blank, decodePng, encodePng } from '../../tools/gen/png.mjs';

const solid = (w: number, h: number, rgba: [number, number, number, number]) =>
  encodePng(w, h, blank(w, h, rgba).data);

describe('the gate self-test (criterion 4.26, vault 4.21)', () => {
  const results = selfTest();

  it('covers every gate this module exposes', () => {
    expect(results.map((r) => r.gate).sort()).toEqual([
      'alpha',
      'brass-cap',
      'chroma-tolerance',
      'dimensions',
      'grid-exact',
      'loop-wrap',
      'loop-wrap-largest-step',
      'motion-floor',
      'reach-band',
      'reach-ignores-static',
      'seam',
      'speck-area',
      'summarise',
    ]);
  });

  it.each(selfTest())('$gate self-test passes — $detail', ({ ok }) => {
    expect(ok).toBe(true);
  });

  it('runs with no file on disk, so a fresh clone can run it (vault 4.21)', () => {
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('PNG codec round-trip — the foundation every other gate reads through', () => {
  it('round-trips RGBA byte for byte', () => {
    const image = fill(blank(9, 5, [1, 2, 3, 255]), 2, 1, 4, 3, [200, 100, 50, 128]);
    const decoded = decodePng(encodePng(9, 5, image.data));
    expect(decoded.width).toBe(9);
    expect(decoded.height).toBe(5);
    expect(Array.from(decoded.data)).toEqual(Array.from(image.data));
  });

  it('encodes deterministically, which is what makes vault 4.15 checkable', () => {
    const image = fill(blank(16, 16, [0, 0, 0, 0]), 3, 3, 6, 6, [10, 220, 30, 255]);
    const a = encodePng(16, 16, image.data);
    const b = encodePng(16, 16, image.data);
    // Compared as plain arrays, not via `Buffer`, which would need @types/node — a dependency the
    // Global Constraints freeze. Phase 1 hit this twice and solved it without adding it.
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('refuses what it does not handle rather than returning a blank image (vault 4.16)', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/signature|PNG/);
    expect(() => encodePng(0, 4, new Uint8ClampedArray(0))).toThrow(/dimensions/);
    expect(() => encodePng(4, 4, new Uint8ClampedArray(4))).toThrow(/RGBA/);
  });
});

describe('dimensions are read from the file, never the label (vault 4.11)', () => {
  it('reports the real size and ratio', () => {
    const v = gateDimensions(solid(2752, 4, [0, 0, 0, 255]));
    expect(v.value.width).toBe(2752);
    expect(v.value.ratio).toBeCloseTo(688, 5);
  });

  it('fails a mismatch — the gate is not decorative', () => {
    expect(gateDimensions(solid(4, 4, [0, 0, 0, 255]), { width: 8, height: 8 }).status).toBe(FAIL);
  });
});

describe('alpha is read from the channel VALUES (vault 4.12)', () => {
  it('an RGBA file with alpha 255 everywhere reports NO real transparency', () => {
    const v = gateAlpha(solid(8, 8, [10, 20, 30, 255]));
    // This is the whole point: the channel is present and it means nothing.
    expect(v.value.channelPresent).toBe(true);
    expect(v.value.realTransparency).toBe(false);
  });

  it('a genuinely transparent pixel is detected', () => {
    const image = fill(blank(8, 8, [10, 20, 30, 255]), 0, 0, 1, 1, [0, 0, 0, 0]);
    expect(gateAlpha(encodePng(8, 8, image.data)).value.realTransparency).toBe(true);
  });
});

describe('motion floor and loop wrap are separate questions (vault 4.23, criterion 4.20)', () => {
  const frame = (v: number) => fill(blank(16, 16, [0, 0, 0, 255]), 0, 0, 16, 16, [v, v, v, 255]);

  it('a clip can clear the motion floor and STILL snap at the wrap', () => {
    const ramp = [frame(0), frame(80), frame(160), frame(240)];
    expect(gateMotionFloor(ramp).status).toBe(PASS);
    expect(gateLoopWrap(ramp).status).toBe(FAIL);
  });

  it('a frozen held state fails the floor', () => {
    expect(gateMotionFloor([frame(0), frame(0), frame(0)]).status).toBe(FAIL);
  });

  it('too few frames is INDETERMINATE, not a pass', () => {
    expect(gateMotionFloor([frame(0)]).status).toBe(INDETERMINATE);
    expect(gateLoopWrap([frame(0), frame(9)]).status).toBe(INDETERMINATE);
  });

  it('frameDifference refuses mismatched sizes rather than comparing garbage', () => {
    expect(() => frameDifference(blank(4, 4), blank(5, 4))).toThrow(/differ in size/);
  });
});

describe('reach is measured from MOVED pixels, not opaque columns (vault 4.18)', () => {
  const base = () => blank(64, 64, [0, 0, 0, 255]);

  it('a planted static limb at the far edge does not become the reach', () => {
    const withLeg = base();
    fill(withLeg, 63, 0, 1, 64, [90, 90, 90, 255]);
    const moved = fill(
      { width: 64, height: 64, data: new Uint8ClampedArray(withLeg.data) },
      30,
      20,
      20,
      20,
      [255, 255, 255, 255],
    );
    const v = gateReachBand([withLeg, moved]);
    expect(v.status).toBe(PASS);
    expect(v.value?.reachX).toBe(49); // the arm, not the column at 63
  });

  it('a change too small to be a limb is INDETERMINATE, never a guess', () => {
    const twitch = fill(
      { width: 64, height: 64, data: new Uint8ClampedArray(base().data) },
      62,
      62,
      2,
      2,
      [255, 255, 255, 255],
    );
    expect(gateReachBand([base(), twitch]).status).toBe(INDETERMINATE);
  });
});

describe('grid and seam gates (criteria 4.23, 4.24)', () => {
  it('an exact multiple of the cell passes; a remainder fails', () => {
    expect(gateGridExact(blank(96, 64), 32).status).toBe(PASS);
    expect(gateGridExact(blank(96, 64), 32).value.cols).toBe(3);
    expect(gateGridExact(blank(100, 64), 32).status).toBe(FAIL);
  });

  it('a horizontal ramp tears at the wrap and a mirrored strip does not', () => {
    const ramp = blank(32, 8, [0, 0, 0, 255]);
    const mirrored = blank(32, 8, [0, 0, 0, 255]);
    for (let x = 0; x < 32; x += 1) {
      const g = Math.round((x / 31) * 255);
      const m = Math.round((1 - Math.abs(x - 15.5) / 15.5) * 255);
      fill(ramp, x, 0, 1, 8, [g, g, g, 255]);
      fill(mirrored, x, 0, 1, 8, [m, m, m, 255]);
    }
    expect(gateSeam(ramp).status).toBe(FAIL);
    expect(gateSeam(mirrored).status).toBe(PASS);
  });
});

describe('region stats exclude what they are told to (STYLE.md §7 step 3)', () => {
  it('sampling a sub-region ignores the rest — this is how the HUD is kept out', () => {
    const image = blank(20, 10, [10, 10, 10, 255]);
    fill(image, 0, 0, 5, 10, [255, 0, 0, 255]); // a "HUD" block, saturated
    const whole = regionStats(image);
    const excludingHud = regionStats(image, { x: 5, w: 15 });
    expect(excludingHud.saturation).toBeLessThan(whole.saturation);
    expect(excludingHud.pixels).toBe(150);
  });
});

describe('summarise (Codex finding 2 against criterion 4.10)', () => {
  const v = (status: 'PASS' | 'FAIL' | 'INDETERMINATE') => ({ status, value: null, reason: '' });

  it('an all-INDETERMINATE run FAILS — measuring nothing is not passing', () => {
    expect(summarise({ a: v(INDETERMINATE), b: v(INDETERMINATE) }).status).toBe(FAIL);
  });

  it('but a single INDETERMINATE beside a real pass is allowed, and is recorded', () => {
    const s = summarise({ a: v(PASS), b: v(INDETERMINATE) });
    expect(s.status).toBe(PASS);
    expect(s.value).toMatchObject({ indeterminate: ['b'] });
  });

  it('an empty gate set fails — zero expectations satisfy themselves', () => {
    expect(summarise({}).status).toBe(FAIL);
  });

  it('any FAIL dominates', () => {
    expect(summarise({ a: v(PASS), b: v(FAIL) }).status).toBe(FAIL);
  });
});

describe('the gates state their blind spots rather than implying coverage (vault 9.3)', () => {
  it('names the brass-cap rule and anatomy as unmeasured', () => {
    const joined = BLIND_SPOTS.join(' ');
    expect(joined).toMatch(/brass/i);
    expect(joined).toMatch(/anatomy|limb/i);
    expect(BLIND_SPOTS.length).toBeGreaterThan(0);
  });
});
