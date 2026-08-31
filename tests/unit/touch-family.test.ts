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
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MAX_BODY_LUMA_SPREAD,
  MAX_FACE_ROUNDNESS,
  MAX_WARMTH_SPREAD,
  MIN_FACE_WARMTH,
  faceFamily,
  familyFailures,
} from '../../tools/gen/touchFamily.mjs';
import { TOUCH_CUT_DIR, main } from '../../tools/gen/buildTouchAtlas.mjs';
import { decodePng, encodePng, readBytes } from '../../tools/gen/png.mjs';
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
 * A copy of `face` lit from the other side: the same pixels, redistributed by radius.
 *
 * 🔴 This is the case the three scalar statistics are blind to by construction. It leaves the
 * multiset of opaque pixels **exactly** as it was, so `bodyLuma` and `bodyWarmth` do not move at
 * all — only where the light sits changes. Codex round 17, finding 3.
 */
function invertRadialLighting(face: Rgba): Rgba {
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
  // Collect the opaque pixels with their radius, then write the brightest back at the LARGEST
  // radius instead of wherever they were. Same pixels, mirrored radial order.
  const px: { i: number; r: number }[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (data[i + 3]! < 250) continue;
      px.push({ i, r: Math.hypot(x - cx, y - cy) });
    }
  }
  const byRadius = [...px].sort((a, b) => a.r - b.r);
  const values = byRadius.map((p) => [data[p.i]!, data[p.i + 1]!, data[p.i + 2]!] as const);
  for (const [k, p] of byRadius.entries()) {
    const v = values[values.length - 1 - k]!;
    data[p.i] = v[0];
    data[p.i + 1] = v[1];
    data[p.i + 2] = v[2];
  }
  return { width: w, height: h, data };
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

  it('REFUSES a button lit from the wrong SIDE, with every band unchanged too', () => {
    const faces = shippedCuts();
    const key = [...faces.keys()][5]!;
    const before = faceFamily(faces.get(key)!);
    const turned = rotateHalfTurn(faces.get(key)!);
    const after = faceFamily(turned);

    // 🔴 The premise, stated as what actually matters: **the radial profile cannot catch this.**
    // A rotation maps every annulus to itself, so each band keeps the pixels it had; the worst
    // measured drift is 0.58 of a luminance point, against a band bound of 15. Asserting an exact
    // equality would be asserting the rounding, so the claim is the one the gate turns on.
    for (const [i, band] of after.bands.entries()) {
      if (Number.isNaN(band.luma) || Number.isNaN(before.bands[i]!.luma)) continue;
      expect(
        Math.abs(band.luma - before.bands[i]!.luma),
        `the premise failed: radius band ${i} moved enough for the radial profile to see it`,
      ).toBeLessThan(1);
    }
    expect(after.bodyLuma, 'the premise failed: body luminance moved').toBeCloseTo(
      before.bodyLuma,
      6,
    );

    faces.set(key, turned);
    const failures = familyFailures(faces);
    expect(
      failures.join('; '),
      'a button lit from the opposite side was accepted — the radial profile alone cannot see it',
    ).toMatch(/disagrees at angular sector/);
    // And the other half of the premise: the radial profile really did stay quiet, so this case
    // is proving the ANGULAR one and not riding on the repair it was written to outflank.
    expect(
      failures.filter((f) => f.includes('radius band')),
      'the radial profile also fired, so this case does not isolate the angular one',
    ).toEqual([]);
  });

  it('REFUSES a button lit from the wrong side, with every scalar unchanged', () => {
    const faces = shippedCuts();
    const key = [...faces.keys()][3]!;
    const before = faceFamily(faces.get(key)!);
    const relit = invertRadialLighting(faces.get(key)!);
    const after = faceFamily(relit);

    // 🔴 The premise first, or this proves nothing about spatial blindness. The scalars really are
    // identical — same pixels, moved — so a gate built only on them CANNOT see this.
    expect(after.bodyLuma, 'the premise failed: body luminance moved').toBeCloseTo(
      before.bodyLuma,
      6,
    );
    expect(after.bodyWarmth, 'the premise failed: body warmth moved').toBeCloseTo(
      before.bodyWarmth,
      6,
    );
    expect(after.roundness, 'the premise failed: the silhouette moved').toBeCloseTo(
      before.roundness,
      6,
    );

    faces.set(key, relit);
    const failures = familyFailures(faces);
    expect(
      failures.join('; '),
      'a button lit from the wrong side was accepted — the profile is not spatial after all',
    ).toMatch(/disagrees at radius band/);
  });
});

describe('the BUILDER refuses an out-of-family set', () => {
  /**
   * 🔴 The decision function had a gate and its production seam did not. Deleting the block in
   * `runBuild` left all the cases above red-capable while the builder adopted anything at all —
   * the same defect as a decision function with no consumer, one layer up. Codex round 17,
   * finding 1.
   */
  it('throws before writing anything, when a staged cut is out of family', () => {
    const root = mkdtempSync(join(tmpdir(), 'touch-family-'));
    const dirs = { outDir: join(root, 'ui'), cutDir: join(root, 'cut') };
    mkdirSync(dirs.outDir, { recursive: true });
    mkdirSync(dirs.cutDir, { recursive: true });

    const cuts = shippedCuts();
    const spoiled = [...cuts.keys()][4]!;
    for (const [key, face] of cuts) {
      const out =
        key === spoiled ? reTone(face, -120, 0, 120) : (face as { data: Uint8ClampedArray });
      writeFileSync(
        join(dirs.cutDir, `${key}.png`),
        key === spoiled
          ? encodePng((out as Rgba).width, (out as Rgba).height, (out as Rgba).data)
          : readBytes(`${TOUCH_CUT_DIR}/${key}.png`),
      );
    }

    // `ink` — the ORDINARY build, which is the path a bad committed cut would reach production by.
    expect(
      () => main([], dirs),
      'the builder adopted a set it can measure as out of family',
    ).toThrow(/not one family/);

    // 🔴 **"Before writing" is a claim about the FILESYSTEM, and throwing does not establish it.**
    // A builder that wrote three faces and then refused the fourth throws exactly this error and
    // leaves a half-written output directory — which for `ink` is the shipped art. The refusal has
    // to happen before the first byte, so the directory it writes into must still be empty. Found
    // by Codex mid-round-18.
    expect(
      readdirSync(dirs.outDir),
      'the builder wrote faces before refusing the set — a partial write of the shipped art',
    ).toEqual([]);
  });
});
