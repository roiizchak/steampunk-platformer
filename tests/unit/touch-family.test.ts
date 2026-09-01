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
 *
 * 🔴 **And this file used to enforce bounds of its own.** Two "sanity checks" required roundness
 * under `0.03` and warmth over `80` while production permits `0.06` and `40`, so a redesigned
 * family legal to the builder would have false-redded the suite — an unapproved policy smuggled in
 * as a check that its own comment called "not a bound". Codex round 17, finding 2. Every threshold
 * here is now imported from the module that enforces it.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_BODY_LUMA_SPREAD,
  MAX_FACE_ROUNDNESS,
  MAX_WARMTH_SPREAD,
  MIN_FACE_WARMTH,
  OUTER_R0,
  OUTER_RINGS,
  OUTER_SECTORS,
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


/**
 * A copy of `face` with its brass rotated half a turn about the centroid, mark and all.
 *
 * 🔴 The case the RADIAL profile is blind to by construction. Every annulus keeps exactly the
 * pixels it had — rotation maps a circle to itself — so `bands` does not move at all, and neither
 * does any scalar. Only where the light comes FROM changes. Found by Codex mid-round-18, on the
 * profile added one round earlier to close the mirror-image hole.
 */
function rotateHalfTurn(face: Rgba): Rgba {
  const { width: w, height: h } = face;
  const src = face.data;
  const data = new Uint8ClampedArray(src.length);
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (src[(y * w + x) * 4 + 3]! < 250) continue;
      n += 1;
      sx += x;
      sy += y;
    }
  }
  const cx = Math.round(sx / n);
  const cy = Math.round(sy / n);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const from = (y * w + x) * 4;
      const rx = 2 * cx - x;
      const ry = 2 * cy - y;
      const to = rx < 0 || ry < 0 || rx >= w || ry >= h ? from : (ry * w + rx) * 4;
      for (let c = 0; c < 4; c += 1) data[to + c] = src[from + c]!;
    }
  }
  return { width: w, height: h, data };
}

/** A copy of `face` with one radius band darkened below any plausible mark threshold. */
function darkenBand(face: Rgba, band: number, bands = 8): Rgba {
  const { width: w, height: h } = face;
  const data = new Uint8ClampedArray(face.data);
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3]! < 250) continue;
      n += 1;
      sx += x;
      sy += y;
    }
  }
  const cx = sx / n;
  const cy = sy / n;
  let maxR = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3]! < 250) continue;
      const r = Math.hypot(x - cx, y - cy);
      if (r > maxR) maxR = r;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (data[i + 3]! < 250) continue;
      const b = Math.min(bands - 1, Math.floor((Math.hypot(x - cx, y - cy) / maxR) * bands));
      if (b !== band) continue;
      data[i] = 20;
      data[i + 1] = 15;
      data[i + 2] = 6;
    }
  }
  return { width: w, height: h, data };
}

/** The joint grid's shape, read from the module so the tests cannot drift from production. */
const RINGS = OUTER_RINGS;
const SECTORS = OUTER_SECTORS;

/** The RADIAL marginal — what the round-17 profile compared, collapsed out of the joint grid. */
function ringMean(m: { cells: { n: number; luma: number }[] }, ring: number): number {
  let n = 0;
  let sum = 0;
  for (let s = 0; s < SECTORS; s += 1) {
    const c = m.cells[ring * SECTORS + s]!;
    if (c.n === 0) continue;
    n += c.n;
    sum += c.luma * c.n;
  }
  return n > 0 ? sum / n : NaN;
}

/**
 * Mirror the inner ring left-to-right, and the outer ring left-to-right as well.
 *
 * Each ring keeps its own pixels, so the radial marginal is untouched; the two mirrorings move
 * opposite amounts through each sector, so the angular marginal very nearly cancels. Only the JOINT
 * cells move — which is the whole argument for measuring them jointly.
 */
function crossSwap(face: Rgba): Rgba {
  const { width: w, height: h } = face;
  const src = face.data;
  const data = new Uint8ClampedArray(src);
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (src[(y * w + x) * 4 + 3]! < 250) continue;
      n += 1;
      sx += x;
      sy += y;
    }
  }
  const cx = Math.round(sx / n);
  const cy = Math.round(sy / n);
  let maxR = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (src[(y * w + x) * 4 + 3]! < 250) continue;
      const r = Math.hypot(x - cx, y - cy);
      if (r > maxR) maxR = r;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const from = (y * w + x) * 4;
      if (src[from + 3]! < 250) continue;
      const r = Math.hypot(x - cx, y - cy) / maxR;
      if (r < OUTER_R0) continue;
      const ring = Math.min(RINGS - 1, Math.floor(((r - OUTER_R0) / (1 - OUTER_R0)) * RINGS));
      if (ring === 1) continue;
      const mx = 2 * cx - x;
      if (mx < 0 || mx >= w) continue;
      const to = (y * w + mx) * 4;
      if (src[to + 3]! < 250) continue;
      for (let c = 0; c < 3; c += 1) data[to + c] = src[from + c]!;
    }
  }
  return { width: w, height: h, data };
}

describe('the six touch faces are one family of buttons', () => {
  it('accepts the adopted set', () => {
    const failures = familyFailures(shippedCuts());
    expect(failures, `the shipped faces are not one family: ${failures.join('; ')}`).toEqual([]);
  });

  it('clears the builder&apos;s own absolute rules, face by face', () => {
    // The production constants, imported — never a stricter number written out here.
    for (const [key, face] of shippedCuts()) {
      const m = faceFamily(face);
      expect(m.roundness, `${key} is not a disc by the builder's own rule`).toBeLessThan(
        MAX_FACE_ROUNDNESS,
      );
      expect(m.bodyWarmth, `${key} is not brass by the builder's own rule`).toBeGreaterThan(
        MIN_FACE_WARMTH,
      );
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
      /body warmth spans|patina disagrees/,
    );
  });

  it('REFUSES a cell that is a lighter button than the rest', () => {
    const faces = shippedCuts();
    const key = [...faces.keys()][2]!;
    const lift = MAX_BODY_LUMA_SPREAD + 12;
    faces.set(key, reTone(faces.get(key)!, lift, lift, lift));
    const failures = familyFailures(faces);
    expect(failures.join('; '), 'a lighter button was accepted into the family').toMatch(
      /body luminance spans|lighting disagrees/,
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

  it('REFUSES a face that darkens part of its bezel', () => {
    // 🔴 The evasion three versions of this gate allowed. A slice used to be dropped when a face
    // fell under a retained-pixel minimum after a per-face MARK THRESHOLD, so darkening an annulus
    // past that threshold DELETED the slice that disagreed — while the brightest-40 % scalars, which
    // read the top of the distribution, barely moved. Codex round 18 finding 3, round 19 finding 2.
    //
    // There is no threshold and no eligibility rule now. The grid is fixed geometry over EVERY
    // opaque pixel, so darkening any of them moves its own cell's mean and nothing can be voted out
    // of the comparison.
    const faces = shippedCuts();
    const key = [...faces.keys()][2]!;
    faces.set(key, darkenBand(faces.get(key)!, 6));
    const failures = familyFailures(faces);
    expect(
      failures.join('; '),
      'a face darkened part of its bezel and the gate deleted the evidence',
      // ⚠️ Lighting OR texture, and not because either will do. Darkening one angular band changes
      // the mean of the cells it covers and the neighbour step at the band's own edges, so which
      // statistic speaks first is a property of the art rather than of the damage: on the pale set
      // it was lighting, on the redesign it is texture. Both are the grid refusing the same face for
      // the same reason, and pinning one of them would pin the brass rather than the rule.
    ).toMatch(/(lighting|texture) at ring \d sector \d/);
  });

  it('REFUSES a button lit from the wrong SIDE — a half turn, which every ANNULUS survives', () => {
    const faces = shippedCuts();
    const key = [...faces.keys()][5]!;
    const before = faceFamily(faces.get(key)!);
    const turned = rotateHalfTurn(faces.get(key)!);
    const after = faceFamily(turned);

    // 🔴 The premise, and it is about the statistic this REPLACED. A rotation maps every annulus to
    // itself, so a radial profile — the round-17 repair — sees nothing at all. Measured here from
    // the joint grid by collapsing it back to its radial marginal, which is exactly what that
    // version compared.
    for (let ring = 0; ring < RINGS; ring += 1) {
      expect(
        Math.abs(ringMean(after, ring) - ringMean(before, ring)),
        `the premise failed: radius ring ${ring} moved enough for a radial profile to see it`,
      ).toBeLessThan(1);
    }

    faces.set(key, turned);
    const failures = familyFailures(faces);
    expect(
      failures.join('; '),
      'a button lit from the opposite side was accepted — a radial profile alone cannot see it',
    ).toMatch(/at ring \d sector \d/);
  });

  it('REFUSES a CROSS-SWAP that the radial marginal survives exactly', () => {
    // 🔴 Codex round 19, finding 3, and the reason the grid is JOINT rather than two profiles side
    // by side. Every RING keeps its own pixels, so the radial marginal is preserved to under two
    // luminance points, and the joint grid fires anyway.
    //
    // ⚠️ **The angular marginal is NOT preserved by this construction, and the honest claim is
    // therefore narrower than the finding asked for.** On real art the mirrored exchange moves
    // sector 4 by 28.4, over the superseded angular bound of 18, so this case shows the grid beating
    // the RADIAL marginal and not both at once. Constructing a rearrangement of photographed brass
    // that preserves both marginals exactly was not achieved and is recorded as not achieved.
    //
    // What does not need a test: the grid **refines** both marginals — each marginal is a
    // weighted average of the grid's own cells — so anything either marginal can see, the grid can
    // see. Only the STRICT direction needs evidence, and the half-turn case above supplies it for
    // the radial marginal.
    const faces = shippedCuts();
    const key = [...faces.keys()][1]!;
    const before = faceFamily(faces.get(key)!);
    const swapped = crossSwap(faces.get(key)!);
    const after = faceFamily(swapped);

    // Both premises, asserted rather than assumed: neither marginal moves enough for the statistic
    // this replaced to have fired.
    for (let ring = 0; ring < RINGS; ring += 1) {
      expect(
        Math.abs(ringMean(after, ring) - ringMean(before, ring)),
        `the premise failed: the radial marginal moved at ring ${ring}`,
      ).toBeLessThan(2);
    }

    faces.set(key, swapped);
    const failures = familyFailures(faces);
    expect(
      failures.join('; '),
      'a cross-swap was accepted — the grid is behaving as two marginals, not as a joint statistic',
    ).toMatch(/at ring \d sector \d/);
  });

  it('REFUSES a face that does not fill its own bezel', () => {
    // The `MIN_CELL_PX` floor, which is a family property and NOT a way to drop a cell: the region
    // is fixed, so a face with a bite out of it fails rather than shrinking the comparison.
    const faces = shippedCuts();
    const key = [...faces.keys()][4]!;
    const face = faces.get(key)!;
    const data = new Uint8ClampedArray(face.data);
    // Clear the right-hand third: several outer cells lose almost all of their area.
    for (let y = 0; y < face.height; y += 1) {
      for (let x = Math.floor(face.width * 0.67); x < face.width; x += 1) {
        data[(y * face.width + x) * 4 + 3] = 0;
      }
    }
    faces.set(key, { width: face.width, height: face.height, data });
    const failures = familyFailures(faces);
    expect(
      failures.join('; '),
      'a face missing a third of its bezel was accepted',
    ).toMatch(/does not fill the shape the others do|from round/);
  });
});
