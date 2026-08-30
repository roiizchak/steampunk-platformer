/**
 * **The two-ink transform itself, driven on a synthetic face.**
 *
 * 🔴 It had no gate at all. `shipped-touch.test.ts` reads the **committed PNGs**, which is the right
 * thing for it to do *(vault 3.1)* and also means no edit to `buildTouchAtlas.mjs` can redden it:
 * deleting the `keylineMarks()` call left every shipped-byte assertion untouched, because the bytes
 * were already on disk. The PRD's claim that the tool logic was separately gated behaviourally was
 * false for this function. Codex round-9.
 *
 * So this drives `keylineMarks()` and `bakePlateAlpha()` on a face built here, where every input
 * pixel is known and the expected output can be stated rather than measured after the fact.
 *
 * ## What the transform owes
 *
 * 1. A dark engraving is **thickened** and given a **pale keyline** — `hud.ts`'s two-ink pair, so a
 *    reader takes whichever ink contrasts with what is behind it.
 * 2. Nothing outside the central mark region changes. The first version keylined every dark pixel
 *    anywhere in the face, including the outer rim, which inflated the opaque share on the half of
 *    the image the acceptance gate does not even look at.
 * 3. The brass keeps `PLATE_ALPHA / ART_ALPHA` of its alpha and the ink keeps all of it, so a face
 *    drawn at `ART_ALPHA` shows its plate at exactly `PLATE_ALPHA`.
 */

import { describe, expect, it } from 'vitest';

import { bakePlateAlpha, keylineMarks } from '../../tools/gen/touchInk.mjs';

const SIZE = 160;
const BRASS = [0xb0, 0x8a, 0x4a] as const;
const DARK = [0x08, 0x06, 0x05] as const;
const KEYLINE = [0xf7, 0xe3, 0xb8] as const;

interface Face {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * A brass disc carrying one dark blob, over a transparent field.
 *
 * 🔴 **The disc is deliberately SMALL — radius 0.28 of the face — so that the corners of the
 * central mark region fall OUTSIDE it.** With a full-width disc every pixel the keyline can reach is
 * already opaque, so the transparency guard is unreachable and the test asserting it cannot fail
 * (measured: M57 stayed green). A real face can be shaped this way, and the first fixture could not
 * tell the difference.
 *
 * @param radius as a fraction of the face's width.
 */
function syntheticFace(radius = 0.28): Face {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const centre = SIZE / 2;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const r = Math.hypot(x - centre + 0.5, y - centre + 0.5);
      if (r > SIZE * radius) continue; // outside the disc: keyed away
      const inBlob = Math.abs(x - centre) < 6 && Math.abs(y - centre) < 6;
      const ink = inBlob ? DARK : BRASS;
      data[i] = ink[0];
      data[i + 1] = ink[1];
      data[i + 2] = ink[2];
      data[i + 3] = 255;
    }
  }
  return { width: SIZE, height: SIZE, data };
}

/**
 * A face whose engraving REACHES the edge of its disc, inside the mark region.
 *
 * 🔴 The only shape in which the keyline can reach a transparent pixel at all, and therefore the
 * only shape in which the transparency guard is reachable. With a blob at the centre of a full disc
 * nothing transparent is ever within `KEYLINE_PX`, the guard is unreachable, and the test asserting
 * it passes whether the guard exists or not — measured, M57 stayed green through two fixtures.
 */
function faceWithMarkAtDiscEdge(): Face {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const centre = SIZE / 2;
  const radius = SIZE * 0.2;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      if (Math.hypot(x - centre + 0.5, y - centre + 0.5) > radius) continue;
      // A bar running the full width of the disc: its ends sit ON the boundary, so the keyline
      // grown around them lands on pixels that are outside the disc and therefore transparent.
      const ink = Math.abs(y - centre) < 4 ? DARK : BRASS;
      data[i] = ink[0];
      data[i + 1] = ink[1];
      data[i + 2] = ink[2];
      data[i + 3] = 255;
    }
  }
  return { width: SIZE, height: SIZE, data };
}

function at(face: Face, x: number, y: number): number[] {
  const i = (y * face.width + x) * 4;
  return [face.data[i]!, face.data[i + 1]!, face.data[i + 2]!, face.data[i + 3]!];
}

/** Is this pixel the keyline colour, whatever its alpha? */
function isKeyline(face: Face, x: number, y: number): boolean {
  const [r, g, b] = at(face, x, y);
  return r === KEYLINE[0] && g === KEYLINE[1] && b === KEYLINE[2];
}

describe('keylineMarks gives a dark engraving a second ink', () => {
  it('paints a pale keyline immediately outside the mark', () => {
    const out = keylineMarks(syntheticFace()) as Face;
    const centre = SIZE / 2;
    // The blob was 12 px wide; BOLD_PX 2 thickens it, KEYLINE_PX 3 rings that. Somewhere in the
    // band just outside the original blob there has to be keyline colour, and inside it none.
    let ring = 0;
    for (let d = 6; d < 6 + 2 + 3; d += 1) if (isKeyline(out, centre + d, centre)) ring += 1;
    expect(ring, 'the engraving got no pale companion at all').toBeGreaterThan(0);
    expect(isKeyline(out, centre, centre), 'the keyline was painted OVER the mark').toBe(false);
  });

  it('THICKENS the engraving, because a hairline does not survive the downscale', () => {
    // 🔴 A 160 px face is presented at 48 CSS px on the smallest viewport in scope, and a fractional
    // canvas scale smooths that resample. A 1 px feature averages into the plate — measured, the
    // marks read 1.63-2.85:1 that way, and `contrast-floor.test.ts` already refuses a 1 px stroke
    // as "an anti-aliasing artefact, not a contrast mechanism". So the dark ink is grown before it
    // is keylined, and this is what says so: without it M55 reddened nothing.
    const before = syntheticFace();
    const after = keylineMarks(before) as Face;
    const darkCount = (face: Face): number => {
      let n = 0;
      for (let i = 0; i < face.data.length; i += 4) {
        if (face.data[i + 3] === 0) continue;
        const luma = face.data[i]! * 0.299 + face.data[i + 1]! * 0.587 + face.data[i + 2]! * 0.114;
        if (luma < 32) n += 1;
      }
      return n;
    };
    const grown = darkCount(after);
    const original = darkCount(before);
    expect(original, 'the fixture has no engraving to thicken').toBeGreaterThan(0);
    // A 12 x 12 blob grown by 2 px is 16 x 16 — a little under 1.8x. Bound well inside that, and
    // above 1.0, which is what a missing `grow` scores.
    expect(
      grown / original,
      `the engraving grew ${(grown / original).toFixed(2)}x — a hairline, not a mark`,
    ).toBeGreaterThan(1.3);
  });

  it('leaves every pixel outside the central mark region alone', () => {
    // 🔴 The round-9 finding. Keylining every dark pixel anywhere repainted the outer rim too —
    // ornament on the half of the face the acceptance gate does not measure, while the mark it does
    // measure stayed thin. A dark blob out on the rim is the case that catches it.
    const before = syntheticFace(0.48);
    for (let d = -3; d <= 3; d += 1) {
      const i = ((Math.round(SIZE * 0.88) + d) * SIZE + SIZE / 2) * 4;
      before.data[i] = DARK[0];
      before.data[i + 1] = DARK[1];
      before.data[i + 2] = DARK[2];
    }
    const after = keylineMarks(before) as Face;
    const inset = Math.round((SIZE * 0.5) / 2);
    let changed = 0;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const outside = x < inset || x >= SIZE - inset || y < inset || y >= SIZE - inset;
        if (!outside) continue;
        if (at(before, x, y).join() !== at(after, x, y).join()) changed += 1;
      }
    }
    expect(changed, `${changed} pixels outside the mark region were repainted`).toBe(0);
  });

  it('does not paint over transparent pixels, so the button stays round', () => {
    // 🔴 The engraving here runs the full width of its disc, so the keyline grown around its ends
    // lands outside the disc. Without the guard those pixels are painted in and the button stops
    // being round. With a blob safely at the centre nothing transparent is ever in reach and the
    // assertion cannot fail, which is exactly how M57 stayed green through two earlier fixtures.
    const before = faceWithMarkAtDiscEdge();
    const after = keylineMarks(before) as Face;
    let filled = 0;
    for (let i = 3; i < before.data.length; i += 4) {
      if (before.data[i] === 0 && after.data[i] !== 0) filled += 1;
    }
    expect(filled, `${filled} transparent pixels were painted in`).toBe(0);
    expect(at(after, 0, 0)[3]).toBe(0);
  });
});

describe('bakePlateAlpha fades the brass and not the ink', () => {
  it('splits one flat face into a translucent plate and opaque ink', () => {
    const out = bakePlateAlpha(keylineMarks(syntheticFace())) as Face;
    const centre = SIZE / 2;
    expect(at(out, centre, centre)[3], 'the engraving faded with the plate').toBe(255);

    // A brass pixel inside the disc but away from the mark keeps `PLATE_ALPHA / ART_ALPHA` of 255.
    const brassAlpha = at(out, centre + 40, centre)[3]!;
    expect(brassAlpha, 'the brass was not faded at all').toBeLessThan(255);
    expect((brassAlpha / 255) * 0.85, 'the plate does not draw at PLATE_ALPHA').toBeCloseTo(0.55, 2);
  });

  it('leaves a fully transparent pixel transparent', () => {
    const out = bakePlateAlpha(syntheticFace()) as Face;
    expect(at(out, 0, 0)[3]).toBe(0);
  });
});
