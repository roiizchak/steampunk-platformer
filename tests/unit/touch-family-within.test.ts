/**
 * **What a cell that keeps only counts and means cannot see inside itself.**
 *
 * 🔴 The joint polar grid closed rearrangement BETWEEN cells. It said nothing about three other
 * directions, and Codex round 20 named all three:
 *
 * - **finding 2** — the grid starts at `OUTER_R0`, so a patina or bezel drift confined to the middle
 *   of a face is invisible to all 24 cells, and the whole-face scalars dilute it against a much
 *   larger outer area. `OUTER_R0` is a geometric line, not a semantic one;
 * - **finding 3** — a cell holding `n`, a mean and a mean is a function of its own histogram, and a
 *   permutation of its pixels leaves that histogram identical to the last decimal. A smooth bevel
 *   and the same brass shuffled are the same cell;
 * - **finding 6** — `MIN_CELL_PX` at 100 against an adopted minimum of 483 is a catastrophe guard.
 *   A face could lose four fifths of a cell's interior behind an intact edge and keep its count, its
 *   colour means and its roundness.
 *
 * ⚠️ **Each case below is BUILT from the shipped brass and watched red**, per *(vault C2)*. The
 * bounds they cross were fixed at the owner-approved `2.5x` of the measured within-family worst
 * **before** any of these mutations existed — see `touch-family-policy.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { OUTER_R0, familyFailures } from '../../tools/gen/touchFamily.mjs';
import { TOUCH_CUT_DIR } from '../../tools/gen/buildTouchAtlas.mjs';
import { decodePng, readBytes } from '../../tools/gen/png.mjs';
import { TOUCH_PLATE_CELLS } from '../../tools/gen/promptTouch.mjs';

type Rgba = { width: number; height: number; data: Uint8ClampedArray };

function shippedCuts(): Map<string, Rgba> {
  return new Map(
    TOUCH_PLATE_CELLS.map((cell) => [
      cell.key,
      decodePng(readBytes(`${TOUCH_CUT_DIR}/${cell.key}.png`)) as Rgba,
    ]),
  );
}

/** The centroid of the opaque body and the radius of its furthest pixel — the gate's own frame. */
function frame(face: Rgba) {
  const { width: w, height: h, data } = face;
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
  return { cx, cy, maxR };
}

/** Every opaque pixel of `face`, with its normalised radius and its angular sector. */
function* body(face: Rgba) {
  const { width: w, height: h, data } = face;
  const { cx, cy, maxR } = frame(face);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (data[i + 3]! < 250) continue;
      const dx = x - cx;
      const dy = y - cy;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += 2 * Math.PI;
      yield { i, r: Math.hypot(dx, dy) / maxR, sector: Math.floor((angle / (2 * Math.PI)) * 8) };
    }
  }
}

describe('a face is out of family for what happens INSIDE it, not only between its cells', () => {
  it('REFUSES a patina drift confined to the CORE, which the grid does not reach', () => {
    // 🔴 Every one of the 24 cells is untouched here — the mutation stops at `OUTER_R0` — and the
    // brightest-40 % whole-face scalars move only a little, because the core is the smaller area.
    // Codex round 20, finding 2.
    const faces = shippedCuts();
    const face = faces.get('touch-jump')!;
    const data = new Uint8ClampedArray(face.data);
    let touched = 0;
    for (const { i, r } of body(face)) {
      if (r >= OUTER_R0) continue;
      data[i] = data[i]! - 55;
      data[i + 2] = data[i + 2]! + 30;
      touched += 1;
    }
    expect(touched).toBeGreaterThan(1000);
    faces.set('touch-jump', { width: face.width, height: face.height, data });

    const bad = familyFailures(faces);
    expect(bad.join('; ')).toMatch(/touch-jump's core (lighting|patina)/);
  });

  it('REFUSES a PERMUTATION inside one cell, which every histogram survives exactly', () => {
    // 🔴 `n`, the mean luma and the mean warmth are unchanged to the last bit — the same pixels are
    // still there. So is the standard deviation, which is why the statistic is a NEIGHBOUR step and
    // not a spread. Codex round 20, finding 3.
    const faces = shippedCuts();
    const face = faces.get('touch-left')!;
    const data = new Uint8ClampedArray(face.data);
    // ONE cell — ring 1 of sector 3 — so this is a within-cell permutation and not a rearrangement
    // between cells, which the joint grid already refuses.
    //
    // ⚠️ **Which cell is not arbitrary, and the reason is a real limit.** Permuting each of the 24
    // cells in turn crosses the bound in **19** of them. Grain is a contrast-proportional statistic,
    // so the cells it is weakest in are the ones whose brass is flattest — five of them here. That
    // is recorded rather than fixed by moving the bound, which was set at the approved 2.5x before
    // any of these mutations existed.
    //
    // ⚠️ The cell also changed with the art: on the pale set this was ring 1 sector 3, and the
    // redesign's scrollwork moved the contrast around the face. The bound did not move.
    const pixels = [...body(face)].filter(
      (p) => p.r >= OUTER_R0 && p.r < OUTER_R0 + (1 - OUTER_R0) / 3 && p.sector === 4,
    );
    expect(pixels.length).toBeGreaterThan(400);

    // A fixed shuffle: no clock, no Math.random — the fixture must be the same every run.
    const order = pixels.map((_, k) => k);
    for (let k = order.length - 1; k > 0; k -= 1) {
      const j = (k * 7919 + 104729) % (k + 1);
      [order[k], order[j]] = [order[j]!, order[k]!];
    }
    const before = pixels.map((p) => face.data.slice(p.i, p.i + 4));
    pixels.forEach((p, k) => data.set(before[order[k]!]!, p.i));

    const sum = (d: Uint8ClampedArray) =>
      pixels.reduce((a, p) => a + d[p.i]! + d[p.i + 1]! + d[p.i + 2]!, 0);
    expect(sum(data), 'the permutation changed the cell total, so it is not a permutation').toBe(
      sum(face.data),
    );
    faces.set('touch-left', { width: face.width, height: face.height, data });

    const bad = familyFailures(faces);
    expect(bad.join('; ')).toMatch(/texture at ring 0 sector 4: touch-left/);
    // And ONLY that cell — the mutation is confined to it, so a hit anywhere else would mean the
    // statistic is reading something other than what was moved.
    expect(bad.filter((line) => line.includes('texture at'))).toHaveLength(1);
  });

  it('REFUSES a cell HOLLOWED OUT behind an intact edge, which MIN_CELL_PX permits', () => {
    // 🔴 The adopted minimum cell holds 483 px and production's floor is 100, so four fifths of a
    // cell's interior can go while the count, the colour means and the silhouette all hold.
    // Codex round 20, finding 6.
    const faces = shippedCuts();
    const face = faces.get('touch-right')!;
    const data = new Uint8ClampedArray(face.data);
    let removed = 0;
    let kept = 0;
    for (const { i, r, sector } of body(face)) {
      if (r < OUTER_R0 || r > 0.9 || sector !== 5) continue;
      if (removed % 5 === 4) {
        kept += 1;
      } else {
        data[i + 3] = 0;
      }
      removed += 1;
    }
    expect(removed - kept).toBeGreaterThan(300);
    faces.set('touch-right', { width: face.width, height: face.height, data });

    expect(familyFailures(faces).join('; ')).toMatch(/touch-right fills ring/);
  });
});
