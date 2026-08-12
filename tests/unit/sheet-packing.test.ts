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
import bounds from '../../public/assets/config/character-bounds.json';

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

/** Vertical centre of mass of one packed cell, in strip coordinates. */
function centroidYOf(strip: RgbaImage, index: number, frameWidth: number): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < strip.height; y += 1) {
    for (let x = index * frameWidth; x < (index + 1) * frameWidth; x += 1) {
      if (strip.data[(y * strip.width + x) * 4 + 3] >= 8) {
        sum += y;
        n += 1;
      }
    }
  }
  if (n === 0) throw new Error(`centroidYOf: frame ${index} is empty`);
  return sum / n;
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

  /**
   * The `centroid` anchor, on a figure built to defeat the feet anchor.
   *
   * Frame 1 is the same body drawn at the same height but with its legs "tucked" — the block is
   * shorter and its bottom is higher, exactly the shape an airborne pose has. Feet-anchoring reads
   * that as a big lift and shoves the whole body upward; centroid-anchoring sees that the centre of
   * mass barely moved and leaves it where it is. That difference is the whole argument for the
   * jump/fall anchor, so it is asserted rather than described.
   */
  it('the centroid anchor aligns the DRAWN centres of mass; the feet anchor does not', () => {
    /**
     * Frame 1 has the same head line but its legs tucked up, so it is 8 px shorter — the shape an
     * airborne pose actually has. Feet-anchoring lifts it by that whole 8 px and its body rides 4 px
     * high; centroid-anchoring lifts it 4 and the two centres of mass land on the same row.
     *
     * This assertion is on the PIXELS, not on `liftPx`, and that is deliberate: the first version of
     * this test compared lift numbers computed by the same expression it was checking, and it
     * happily passed a formula that left the packed figures 110 px apart on the real art.
     */
    const tucked = [
      cellWithFigure(20, 40, 10, 33), // extended: rows 10..33, 24 tall
      cellWithFigure(20, 40, 10, 25), // legs tucked: same top, 16 tall
    ];
    const o = { scale: 1, frameWidth: 40, frameHeight: 60, baselineY: 60 };

    const byFeet = packStrip(tucked, { ...o, anchor: 'feet' });
    const byCentroid = packStrip(tucked, { ...o, anchor: 'centroid' });
    expect(byFeet.frames.map((f) => f.liftPx)).toEqual([0, 8]);
    expect(byCentroid.frames.map((f) => f.liftPx)).toEqual([0, 4]);

    const centres = (s: RgbaImage) => [0, 1].map((i) => centroidYOf(s, i, 40));
    const [cA, cB] = centres(byCentroid.strip);
    expect(cB - cA).toBe(0);
    const [fA, fB] = centres(byFeet.strip);
    expect(Math.abs(fB - fA)).toBeGreaterThan(0); // ...and the two anchors genuinely disagree
  });

  it('normalises signed centroid lifts so the lowest-drawn frame rests on the line', () => {
    // Centroid lifts are signed, so without normalisation a frame lands under the cell floor and the
    // vertical guard throws. Normalising keeps every inter-frame relationship and only chooses where
    // the set as a whole rests. Two equal-height figures at different heights need no correction at
    // all relative to each other, which is the degenerate case worth pinning.
    const cells2 = [
      cellWithFigure(20, 40, 8, 27), // 20 tall
      cellWithFigure(20, 40, 14, 33), // 20 tall, drawn 6 lower
    ];
    const { strip, frames } = packStrip(cells2, {
      scale: 1,
      frameWidth: 40,
      frameHeight: 60,
      baselineY: 60,
      anchor: 'centroid',
    });
    expect(frames.map((f) => f.liftPx)).toEqual([0, 0]);
    expect(Math.min(...frames.map((f) => f.liftPx))).toBe(0);
    expect(centroidYOf(strip, 1, 40) - centroidYOf(strip, 0, 40)).toBe(0);
  });

  it('refuses an anchor it does not implement rather than silently defaulting', () => {
    expect(() =>
      packStrip(cells, { ...opts, anchor: 'hips' as unknown as 'feet' }),
    ).toThrow(/unknown vertical anchor/i);
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
  const FRAME_WIDTH = bounds.frameWidth;
  const actions = Object.keys(liftProfile.animations) as (keyof typeof liftProfile.animations)[];
  const liftsOf = (a: string) =>
    liftProfile.animations[a as keyof typeof liftProfile.animations].frames.map((f) => f.liftPx);
  const maxLift = (a: string) => Math.max(...liftsOf(a));
  const minLift = (a: string) => Math.min(...liftsOf(a));


  it('covers every animation, so the gate cannot pass by measuring nothing', () => {
    // `attack` joined last (session 7): merged in after the six that already shipped, so it lands
    // at the end of insertion order rather than sorted with the rest.
    expect(actions).toEqual(['idle', 'walk', 'run', 'jump', 'fall', 'hurt', 'attack']);
  });

  it.each(actions)('%s: liftPx is re-derivable from the recorded source coordinates', (action) => {
    /**
     * Re-derived here rather than trusted — and deliberately WITHOUT calling `frameLifts`, so the
     * packer's arithmetic is checked against an independent statement of the same rule rather than
     * against itself. The manifest records both landmarks for every frame, so either anchor can be
     * reconstructed from what is committed.
     */
    const anim = liftProfile.animations[action];
    expect(anim.frames.length).toBeGreaterThan(0);
    expect(['feet', 'centroid']).toContain(anim.anchor);

    const deepest = Math.max(...anim.frames.map((f) => f.sourceMaxY));
    const rounded = anim.frames.map((f) =>
      Math.round(
        anim.anchor === 'feet'
          ? (deepest - f.sourceMaxY) * liftProfile.scale
          : // the centroid's offset INSIDE the figure, less the height the figure is placed by
            (f.sourceCentroidY - f.sourceMinY) * liftProfile.scale - f.drawnHeight,
      ),
    );
    const expected = rounded.map((v) => v - Math.min(...rounded));

    expect(anim.frames.map((f) => f.liftPx)).toEqual(expected);
    // Normalised, so the lowest-drawn frame rests on the contact line. If EVERY lift were zero the
    // pixel comparison below would hold vacuously against a per-frame-anchored strip.
    expect(Math.min(...anim.frames.map((f) => f.liftPx))).toBe(0);
  });

  it.each(actions)('%s: the drawn gap below the feet matches the manifest exactly', (action) => {
    const anim = liftProfile.animations[action];
    const strip = readPng(`${SHEETS}/${action}.png`);
    expect(strip.width).toBe(FRAME_WIDTH * anim.frames.length);
    const measured = anim.frames.map((f) => gapBelowFeet(strip, f.index, FRAME_WIDTH));
    expect(measured).toEqual(anim.frames.map((f) => f.liftPx));
  });

  it('each animation uses the anchor its config declares', () => {
    // The anchor is a decision, not an accident, so the manifest records it and this pins the two
    // together. `centroid` on a grounded animation would silently unmoor it from the floor.
    //
    // Scoped to `actions` (what actually SHIPPED, i.e. `liftProfile.animations`' own keys) rather
    // than every key `bounds.animations` declares — `death` has a config declaration (session 7)
    // but no packed sheet yet, so it would otherwise make `declared` and `used` disagree on a key
    // that is legitimately absent from one of them for a reason this test does not cover.
    const declared = Object.fromEntries(
      actions.map((a) => [a, bounds.animations[a as keyof typeof bounds.animations].verticalAnchor]),
    );
    const used = Object.fromEntries(actions.map((a) => [a, liftProfile.animations[a].anchor]));
    expect(used).toEqual(declared);
    expect(declared).toEqual({
      idle: 'feet',
      walk: 'feet',
      run: 'feet',
      jump: 'centroid',
      fall: 'centroid',
      // Session 6. A struck courier recoils but stays on its feet — the recoil peaks around 20% and
      // the boots never leave the floor, so `feet`, like the other grounded animations. `centroid`
      // here would unmoor it from the ground for the 18 ticks it is drawn.
      hurt: 'feet',
      // Session 7: the swing stays upright throughout (2.1% frame-to-frame height spread) — grounded,
      // like every other combat action so far.
      attack: 'feet',
    });
  });

  it('grounded animations keep the lift the model drew (4.20)', () => {
    // These are feet-anchored, so the lift IS the flight phase and the lifting boot. A regression
    // to per-frame anchoring flattens every one of them to 0.
    expect(maxLift('run')).toBeGreaterThanOrEqual(10); // a real flight phase
    expect(maxLift('walk')).toBeGreaterThanOrEqual(3); // the trailing boot
    expect(maxLift('idle')).toBeLessThanOrEqual(2); // ...and a planted stance stays planted
  });

  /**
   * `idle` is EXPECTED to be flat, and that is a hole this test closes rather than ignores.
   *
   * Criterion 4.20 reads "the deepest frame reaches the final cell row, and at least one other
   * frame does not". On the shipped art every one of idle's twelve frames measures a lift of 0, so
   * the second half is literally false for it — correctly, because the courier breathes without
   * lifting a boot and the model drew exactly that.
   *
   * The consequence is the part worth testing: **a regression to per-frame anchoring is
   * indistinguishable from correct behaviour inside `idle`**, because both produce a flat sheet.
   * So 4.20's discriminating half is asserted per animation, on the four animations whose art does
   * leave the ground, and idle's flatness is asserted as a deliberate expectation instead of being
   * quietly exempt.
   *
   * Raised by the `voltagent-qa-sec:qa-expert` gate owner, brief 1, finding 5. Nothing previously
   * asserted a non-zero lift on `jump` or `fall` at all — they happened to be right.
   */
  it('every animation that leaves the ground has a frame that does not touch the floor (4.20)', () => {
    for (const action of ['walk', 'run', 'jump', 'fall'] as const) {
      expect(maxLift(action), `${action} packed flat — the per-sheet baseline is gone`).toBeGreaterThan(0);
    }
    // ...and the deepest frame of every animation, idle included, still reaches the final row.
    for (const action of ['idle', 'walk', 'run', 'jump', 'fall', 'hurt'] as const) {
      expect(minLift(action), `${action} never reaches its cell floor`).toBe(0);
    }
    // idle is flat BY DESIGN, stated so a future reader does not "fix" it into a bob.
    expect(maxLift('idle')).toBe(0);
  });

  it('airborne animations hold the body still — measured on the DRAWN pixels', () => {
    /**
     * The property centroid anchoring exists to produce, asserted where it is actually visible.
     *
     * A first version of this bounded `liftPx` instead and had to be thrown away: under the
     * `centroid` anchor `liftPx` is the CORRECTION applied, not the residual left behind, so
     * bounding it bounds how much unwanted translation the clip contained — a fact about the model's
     * obedience, not about the sheet. It duly went red when a better clip that happened to drift
     * more was packed correctly. Vault **4.19** again: name the axis your metric measures.
     *
     * What matters is the OUTPUT: the sim's `stepVertical` supplies altitude, so the drawn figure's
     * centre of mass must sit at the same height in every frame. Feet-anchoring the same sheets
     * scattered it by 40-70 px, which is the hitch mid-jump and mid-fall.
     */
    for (const action of ['jump', 'fall'] as const) {
      const anim = liftProfile.animations[action];
      expect(anim.anchor).toBe('centroid');
      const strip = readPng(`${SHEETS}/${action}.png`);
      const centres = anim.frames.map((f) => centroidYOf(strip, f.index, FRAME_WIDTH));
      const spread = Math.max(...centres) - Math.min(...centres);
      expect(spread).toBeLessThanOrEqual(2); // rounding only
    }
  });

  it('...and the grounded ones deliberately do NOT hold it still (C2: this can go red)', () => {
    // The anti-vacuity partner. If the assertion above passed for every sheet it would be measuring
    // nothing — a feet-anchored locomotion cycle must move its centre of mass, because that IS the
    // bob and the flight phase.
    const strip = readPng(`${SHEETS}/run.png`);
    const centres = liftProfile.animations.run.frames.map((f) =>
      centroidYOf(strip, f.index, FRAME_WIDTH),
    );
    expect(Math.max(...centres) - Math.min(...centres)).toBeGreaterThan(2);
  });
});
