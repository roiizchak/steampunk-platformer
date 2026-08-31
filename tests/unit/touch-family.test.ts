/**
 * **The first gate in the touch pipeline that compares two faces.**
 *
 * 🔴 Alpha band, ink reproduction, mark distinctness, per-stroke contrast — every one of them
 * measures a face against ITSELF. So a plate whose six buttons carry different bezels, different
 * brass or different patina passed the whole pipeline, and a single-cell re-shoot passed it more
 * easily still, because the model is asked in prose to keep the family and prose is not an
 * invariant. Codex round 15, finding 6; built before the whole-plate redesign by owner decision on
 * 2026-08-31, because a redesign is exactly when a family invariant pays.
 *
 * ⚠️ **The failing cases are BUILT, not asserted about.** A gate that has never been watched red is
 * decoration *(vault C2)*: each case below constructs a face that really is out of family and
 * asserts the exact sentence the builder would refuse it with.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_BODY_LUMA_SPREAD,
  MAX_WARMTH_SPREAD,
  faceFamily,
  familyFailures,
} from '../../tools/gen/touchFamily.mjs';
import { TOUCH_CUT_DIR } from '../../tools/gen/buildTouchAtlas.mjs';
import { decodePng, readBytes } from '../../tools/gen/png.mjs';
import { TOUCH_PLATE_CELLS } from '../../tools/gen/promptTouch.mjs';

type Rgba = { width: number; height: number; data: Uint8ClampedArray };

/** The six faces as they will be cut, which is what the builder hands the gate. */
function shippedCuts(): Map<string, Rgba> {
  return new Map(
    TOUCH_PLATE_CELLS.map((cell) => [
      cell.key,
      decodePng(readBytes(`${TOUCH_CUT_DIR}/${cell.key}.png`)) as Rgba,
    ]),
  );
}

/** A copy of `face` with every opaque pixel shifted by `(dr, dg, db)`. */
function reTone(face: Rgba, dr: number, dg: number, db: number): Rgba {
  const data = new Uint8ClampedArray(face.data);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 250) continue;
    data[i] = data[i]! + dr;
    data[i + 1] = data[i + 1]! + dg;
    data[i + 2] = data[i + 2]! + db;
  }
  return { width: face.width, height: face.height, data };
}

describe('the six touch faces are one family of buttons', () => {
  it('accepts the adopted set', () => {
    const failures = familyFailures(shippedCuts());
    expect(failures, `the shipped faces are not one family: ${failures.join('; ')}`).toEqual([]);
  });

  it('measures a disc as round and brass', () => {
    for (const [key, face] of shippedCuts()) {
      const m = faceFamily(face);
      // Not a bound — a sanity check that the statistic is reading the plate and not the mark.
      expect(m.roundness, `${key} does not read as a disc at all`).toBeLessThan(0.03);
      expect(m.bodyWarmth, `${key}'s body does not read as brass`).toBeGreaterThan(80);
    }
  });

  it('REFUSES a cell whose brass is a different brass', () => {
    const faces = shippedCuts();
    const [key] = [...faces.keys()];
    // Cool it past the spread bound and nothing else: same silhouette, same mark, same luminance
    // to within a few points. This is the drift a single-cell re-shoot produces and the one no
    // other gate can see.
    faces.set(key!, reTone(faces.get(key!)!, -MAX_WARMTH_SPREAD - 10, 0, MAX_WARMTH_SPREAD + 10));
    const failures = familyFailures(faces);
    expect(failures.join('; '), 'a re-toned cell was accepted into the family').toMatch(
      /body warmth spans/,
    );
  });

  it('REFUSES a cell that is a lighter button than the rest', () => {
    const faces = shippedCuts();
    const key = [...faces.keys()][2]!;
    const lift = MAX_BODY_LUMA_SPREAD + 12;
    faces.set(key, reTone(faces.get(key)!, lift, lift, lift));
    const failures = familyFailures(faces);
    expect(failures.join('; '), 'a lighter button was accepted into the family').toMatch(
      /body luminance spans/,
    );
  });

  it('REFUSES a button that is not a disc', () => {
    const faces = shippedCuts();
    const key = [...faces.keys()][1]!;
    const face = faces.get(key)!;
    // A square of the same brass: every pixel opaque, so the silhouette is the crop itself.
    const data = new Uint8ClampedArray(face.data);
    for (let i = 0; i < data.length; i += 4) data[i + 3] = 255;
    faces.set(key, { width: face.width, height: face.height, data });
    const failures = familyFailures(faces);
    expect(failures.join('; '), 'a square button was accepted as this plate’s bezel').toMatch(
      /from round|bezel shape spans/,
    );
  });

  it('REFUSES a set that agrees with itself but is not brass', () => {
    // 🔴 A spread bound alone passes six identically WRONG buttons. The absolute warmth floor is
    // what makes "one family" mean this family.
    const faces = new Map<string, Rgba>();
    for (const [key, face] of shippedCuts()) faces.set(key, reTone(face, -120, 0, 120));
    const failures = familyFailures(faces);
    expect(failures.join('; '), 'six identically non-brass buttons were accepted').toMatch(
      /that is not brass/,
    );
  });
});
