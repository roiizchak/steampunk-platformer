/**
 * `packStrip`'s clipping error must sweep EVERY frame before throwing, not stop at the first.
 *
 * ## What this stops happening again
 *
 * `packStrip` used to throw inside the per-frame loop, on the FIRST clipped frame it reached — so
 * its error reported that frame's own requirement and never looked at the rest of the sheet. That
 * is how `docs/HANDOFF.md` §12b came to record `rust-scavenger/death` as needing 358px, frame 4's
 * figure, when a full sweep shows frame 7 needs 510px — the sheet's true maximum. The verdict (any
 * clipped frame still fails the build) does not change; what changes is that the error now
 * evaluates every frame and reports the true maximum, naming every clipped frame.
 *
 * Both axes shared the same defect (`sheets.mjs:378-384` horizontal, `:399-405` vertical at the
 * time this was written) so both are exercised here.
 */

import { describe, expect, it } from 'vitest';
import { packStrip } from '../../tools/gen/sheets.mjs';
import type { RgbaImage } from '../../tools/gen/png.d.mts';

/** A cell of `w x h` holding one solid opaque block spanning columns `x0..x1`, rows `top..bottom`. */
function cellWithFigure(w: number, h: number, top: number, bottom: number, x0: number, x1: number): RgbaImage {
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

describe('packStrip clipping errors report the SWEPT maximum, not the first hit', () => {
  it('horizontal: names every clipped frame and the true widest requirement', () => {
    // frameWidth 40. Frame 0 is a 44px-wide centred block (needs 45px, a small overflow). Frame 1
    // is 30px wide and fits. Frame 2 is a 60px-wide centred block (needs 61px) — the widest, and
    // the LAST frame the sweep reaches, so the old first-throw code never saw it.
    const cells = [
      cellWithFigure(80, 40, 10, 30, 0, 43),
      cellWithFigure(80, 40, 10, 30, 0, 29),
      cellWithFigure(80, 40, 10, 30, 0, 59),
    ];
    const opts = { scale: 1, frameWidth: 40, frameHeight: 200, baselineY: 200 };

    let error: Error | undefined;
    try {
      packStrip(cells, opts);
    } catch (e) {
      error = e as Error;
    }
    expect(error, 'expected packStrip to throw on the clipped sheet').toBeDefined();

    // The old single-frame-throw message stopped at frame 0 and never mentioned frame 2 or its
    // 61px requirement — this is exactly what the mutation loop must catch red.
    expect(error!.message).toMatch(/frame 0/);
    expect(error!.message).toMatch(/frame 2/);
    expect(error!.message).toContain('61');
    // Still keeps the standing guidance sentence.
    expect(error!.message).toMatch(/do NOT rescale this animation to fit \(vault 4\.14\)/);
  });

  it('vertical: names every clipped frame and the true tallest requirement', () => {
    // frameHeight 40. Every figure is 36 source px tall (18 packed at scale 0.5).
    // Frame 0 is the contact frame (deepest, lift 0, fits by construction).
    // Frame 1 is lifted 24px — clips (needs 18+24=42), and is the FIRST clipped frame the old
    // first-throw code would reach.
    // Frame 2 is lifted only 10px — fits.
    // Frame 3 is lifted 52px — clips harder (needs 18+52=70), the sheet's true maximum, and the
    // LAST frame, so the old code — which throws on frame 1 — never evaluates it.
    const scale = 0.5;
    const cells = [
      cellWithFigure(20, 200, 160, 195, 4, 11), // contact frame, maxY 195
      cellWithFigure(20, 200, 112, 147, 4, 11), // lift 24 -> clips, needs 42
      cellWithFigure(20, 200, 140, 175, 4, 11), // lift 10 -> fits
      cellWithFigure(20, 200, 56, 91, 4, 11), // lift 52 -> clips, needs 70 (the true max)
    ];
    const opts = { scale, frameWidth: 40, frameHeight: 40, baselineY: 40 };

    let error: Error | undefined;
    try {
      packStrip(cells, opts);
    } catch (e) {
      error = e as Error;
    }
    expect(error, 'expected packStrip to throw on the vertically clipped sheet').toBeDefined();
    // The old single-frame-throw message stopped at frame 1 and never mentioned frame 3 or its
    // 70px requirement.
    expect(error!.message).toMatch(/frame 1/);
    expect(error!.message).toMatch(/frame 3/);
    expect(error!.message).toContain('70');
    expect(error!.message).toMatch(/do NOT rescale this animation to fit \(vault 4\.14\)/);
  });
});
