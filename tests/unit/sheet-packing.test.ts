/**
 * `packStrip`'s VERTICAL alignment — criteria 4.19, 4.20, 4.21.
 *
 * ## What this suite exists to stop happening again
 *
 * `packStrip` used to pin **every frame's own** lowest opaque pixel to the cell's last row. For a
 * planted idle that is right. For anything with a flight phase it is not merely lossy, it is
 * *inverted*: at the frames where both boots are clear of the ground the whole body is dragged DOWN
 * so the lowest boot reaches the baseline, so the legs pump while the torso sinks. Measured on the
 * shipped art, in game pixels: `run` sank 15, `jump` 67, and `fall` 98 — a full tile of concertina.
 *
 * The source clips are camera-locked and their prompts forbid translation *(`motion.mjs`)*, so what
 * the model drew is **pose, not travel**. Preserving it therefore cannot double-count against the
 * sim's own `stepVertical`. That was the open design question in the Phase 4 handoff and this is
 * where it is settled.
 *
 * The rule now: **one baseline per SHEET, not per frame.** The deepest frame — the contact, the
 * most-extended pose — lands on the last row, and every other frame sits exactly its measured,
 * scaled lift above it.
 *
 * ## Why these are synthetic fixtures and not the shipped PNGs
 *
 * Codex plan review, blocker 2: a packed PNG cannot reveal its own pre-pack source lift, so a test
 * that reads the shipped strip and derives what it *should* contain is tautological — it would pass
 * against per-frame anchoring too. The real art is guarded separately by the committed lift-profile
 * manifest, which is an INDEPENDENT oracle. Here every pixel is constructed in memory, which is
 * also what lets this run on a fresh clone where `_generated/` is gitignored *(vault 4.21)*.
 *
 * Assertions are **exact**, never within a tolerance. The lift is an integer by construction, so a
 * ±1 slack would hide precisely the `round`/`floor` off-by-one most likely to appear here.
 */

import { describe, expect, it } from 'vitest';
import { assertSingleRowLayout, packStrip } from '../../tools/gen/sheets.mjs';
import { readPng } from '../../tools/gen/png.mjs';
import type { RgbaImage } from '../../tools/gen/png.d.mts';
import liftProfile from '../../public/assets/config/lift-profile.json';

/** A cell of `w x h` holding one solid opaque block spanning rows `top..bottom` inclusive. */
function cellWithFigure(w: number, h: number, top: number, bottom: number, x0 = 4, x1 = 11): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * w + x) * 4;
      data[i] = 200;
      data[i + 1] = 120;
      data[i + 2] = 60;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** Rows of fully transparent pixels between the figure's lowest opaque row and the cell's bottom. */
function gapBelowFeet(strip: RgbaImage, index: number, frameWidth: number): number {
  for (let y = strip.height - 1; y >= 0; y -= 1) {
    for (let x = index * frameWidth; x < (index + 1) * frameWidth; x += 1) {
      if (strip.data[(y * strip.width + x) * 4 + 3] >= 8) return strip.height - 1 - y;
    }
  }
  throw new Error(`gapBelowFeet: frame ${index} is empty`);
}

describe('packStrip vertical alignment — one baseline per sheet', () => {
  // scale 0.5, so a 10 px source lift is a 5 px packed lift with no rounding ambiguity.
  const scale = 0.5;
  const frameWidth = 40;
  const frameHeight = 40;
  const opts = { scale, frameWidth, frameHeight, baselineY: frameHeight };

  /** Frames 0 and 2 are planted; frame 1 is drawn 10 source px higher. All three are 16 px tall. */
  const cells = [
    cellWithFigure(20, 30, 10, 25),
    cellWithFigure(20, 30, 0, 15),
    cellWithFigure(20, 30, 10, 25),
  ];

  it('lands the DEEPEST frame on the final row (4.20)', () => {
    const { strip } = packStrip(cells, opts);
    expect(gapBelowFeet(strip, 0, frameWidth)).toBe(0);
    expect(gapBelowFeet(strip, 2, frameWidth)).toBe(0);
  });

  it('preserves the measured inter-frame lift exactly, and does not re-zero it (4.19)', () => {
    const { strip, frames } = packStrip(cells, opts);
    // 10 source px above the contact frame, at scale 0.5, is 5 packed px. Exactly.
    expect(gapBelowFeet(strip, 1, frameWidth)).toBe(5);
    expect(frames.map((f) => f.liftPx)).toEqual([0, 5, 0]);
  });

  it('reports a lift profile that is not uniformly zero — the inverted-bob signature (4.20)', () => {
    const { frames } = packStrip(cells, opts);
    expect(Math.min(...frames.map((f) => f.liftPx))).toBe(0);
    expect(Math.max(...frames.map((f) => f.liftPx))).toBeGreaterThan(0);
  });

  it('leaves a planted animation flat — every frame on the final row', () => {
    const planted = [
      cellWithFigure(20, 30, 10, 25),
      cellWithFigure(20, 30, 10, 25),
      cellWithFigure(20, 30, 10, 25),
    ];
    const { frames } = packStrip(planted, opts);
    expect(frames.map((f) => f.liftPx)).toEqual([0, 0, 0]);
  });

  /**
   * The rounding itself, pinned — and this case was added because the suite failed to catch it.
   *
   * The fixture above uses a 10 px source lift at scale 0.5, which is 5.0 exactly, so `round`,
   * `floor` and `ceil` all agree and a mutation swapping them survived every assertion. A gate that
   * cannot go red is decoration *(C2)*, and "the numbers happened to be integers" is the quietest
   * way to build one.
   *
   * At scale 0.4 the two lifts below land on 1.2 and 1.6. `floor` gives [0,1,1], `ceil` [0,2,2];
   * only `round` gives [0,1,2]. One case either side of the halfway point is what it takes.
   */
  it('rounds the lift to nearest — not floor, not ceil', () => {
    const fractional = [
      cellWithFigure(20, 60, 40, 55), // contact: maxY 55
      cellWithFigure(20, 60, 37, 52), // 3 source px up -> 1.2 -> 1
      cellWithFigure(20, 60, 36, 51), // 4 source px up -> 1.6 -> 2
    ];
    const o = { scale: 0.4, frameWidth: 40, frameHeight: 40, baselineY: 40 };
    const { strip, frames } = packStrip(fractional, o);
    expect(frames.map((f) => f.liftPx)).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((i) => gapBelowFeet(strip, i, 40))).toEqual([0, 1, 2]);
  });

  it('THROWS when the lift pushes a frame out of the top of the cell (4.21)', () => {
    // Both figures are 36 source px tall, so 18 packed px. Frame 1 was drawn 60 source px higher,
    // a 30 px lift. 18 + 30 = 48 does not fit a 40 px cell, and it overflows the TOP by 8. The old
    // code silently `continue`d past those rows and shipped a decapitated sprite, which still looks
    // like a sprite — and the lift is what makes this reachable, since a frame's placement is no
    // longer bounded by its own height.
    const tall = [cellWithFigure(20, 100, 60, 95), cellWithFigure(20, 100, 0, 35)];
    expect(() => packStrip(tall, opts)).toThrow(/clipped by the .*cell vertically|overflows the/i);
  });

  it('still throws on a blank frame rather than packing an empty cell (vault 4.16)', () => {
    const blankCell: RgbaImage = { width: 20, height: 30, data: new Uint8ClampedArray(20 * 30 * 4) };
    expect(() => packStrip([cells[0], blankCell], opts)).toThrow(/no opaque pixels/);
  });
});

describe('assertSingleRowLayout — the assumption the sheet baseline rests on', () => {
  /**
   * Codex plan review, finding 6. Comparing `maxY` across cells is only meaningful because every
   * cell was cut from ONE shared row band, which is true for the `N x 1` clip strips `build-clips`
   * emits. It is not enforced anywhere: `detectFrames` can return several row bands, and the
   * caller drops each rectangle's original `y`. Two frames from different rows would then have
   * `maxY` values measured from different origins, and the lift would be nonsense — silently.
   */
  it('accepts a single row of frames', () => {
    expect(() =>
      assertSingleRowLayout([
        { x: 0, y: 4, w: 10, h: 20 },
        { x: 20, y: 4, w: 10, h: 20 },
      ]),
    ).not.toThrow();
  });

  it('THROWS on a multi-row grid, rather than packing incomparable coordinates', () => {
    expect(() =>
      assertSingleRowLayout([
        { x: 0, y: 4, w: 10, h: 20 },
        { x: 0, y: 40, w: 10, h: 20 },
      ]),
    ).toThrow(/single row|one row/i);
  });
});

/**
 * The SHIPPED art, against the committed lift-profile manifest — criteria 4.19 and 4.20.
 *
 * This is the gate that would have caught the defect. The manifest carries the SOURCE coordinates
 * each frame was measured at, recorded before packing and committed because `_generated/` is
 * gitignored; the strips are the packed output. Two independent things, compared:
 *
 * 1. the manifest's own arithmetic is re-derived here rather than trusted, and
 * 2. the PNG's real gap below the feet must equal it, EXACTLY.
 *
 * Under the old per-frame anchoring every measured gap is 0 while the manifest still records the
 * real lift, so the regression is caught by construction rather than by a threshold.
 */
describe('shipped strips carry the source lift profile (4.19, 4.20)', () => {
  const SHEETS = 'public/assets/characters/brass-courier/sheets';
  const FRAME_WIDTH = 288;
  const actions = Object.keys(liftProfile.animations);

  it('covers every animation, so the gate cannot pass by measuring nothing', () => {
    expect(actions).toEqual(['idle', 'walk', 'run', 'jump', 'fall']);
  });

  it.each(actions)('%s: liftPx is the honest round((deepest - sourceMaxY) * scale)', (action) => {
    const anim = liftProfile.animations[action as keyof typeof liftProfile.animations];
    expect(anim.frames.length).toBeGreaterThan(0);
    for (const f of anim.frames) {
      expect(typeof f.liftPx).toBe('number');
      expect(f.liftPx).toBe(Math.round((anim.deepestSourceY - f.sourceMaxY) * liftProfile.scale));
    }
    // The contact frame defines the line, so exactly one lift must be zero — and if EVERY lift were
    // zero the comparison below would hold vacuously against a per-frame-anchored strip.
    expect(Math.min(...anim.frames.map((f) => f.liftPx))).toBe(0);
  });

  it.each(actions)('%s: the drawn gap below the feet matches the manifest exactly', (action) => {
    const anim = liftProfile.animations[action as keyof typeof liftProfile.animations];
    const strip = readPng(`${SHEETS}/${action}.png`);
    expect(strip.width).toBe(FRAME_WIDTH * anim.frames.length);
    const measured = anim.frames.map((f) => gapBelowFeet(strip, f.index, FRAME_WIDTH));
    expect(measured).toEqual(anim.frames.map((f) => f.liftPx));
  });

  it('run, jump and fall actually leave the ground — the inverted-bob signature (4.20)', () => {
    // Ranges, not just "not all zero": these are the three the old packer flattened, and their
    // magnitudes are the whole reason this suite exists. A regression to per-frame anchoring makes
    // every one of them 0.
    const maxLift = (a: string) =>
      Math.max(
        ...liftProfile.animations[a as keyof typeof liftProfile.animations].frames.map(
          (f) => f.liftPx,
        ),
      );
    expect(maxLift('run')).toBeGreaterThanOrEqual(10);
    expect(maxLift('jump')).toBeGreaterThanOrEqual(30);
    expect(maxLift('fall')).toBeGreaterThanOrEqual(30);
    // ...while a planted stance stays planted. Idle must NOT acquire a bob.
    expect(maxLift('idle')).toBeLessThanOrEqual(2);
  });
});
