/**
 * One character is ONE SIZE, whatever it is doing.
 *
 * ## The defect, reported twice by the user in two sessions
 *
 * > *"This is a K-1 animation now for stationary, but when you shoot, the animation becomes
 * > smaller."* — 2026-08-14, about `brass-sentry/fire`
 *
 * > *"The stationary character, when it dies, when they play the K/O animation, it becomes
 * > smaller."* — 2026-08-14, about `brass-sentry/death`
 *
 * Both are the same mistake, made twice, and the second was made **while fixing the first**.
 *
 * ## Why the obvious measurement is the wrong one
 *
 * A per-action scale is derived by matching the drawn figure to the slug's `renderHeightPx`. The
 * tempting landmark is the SILHOUETTE — the opaque bounding box — and for a walk cycle it is fine.
 *
 * It is wrong for anything with an **effect**. A sentry's clips carry a muzzle flash, a steam plume
 * and a debris spray; every one inflates the silhouette without making the machine any bigger. Scale
 * the silhouette to a target and the machine shrinks by exactly however much the effect added:
 *
 * | | tripod span | vs idle |
 * |---|---|---|
 * | `idle` | 205 px | — |
 * | `fire`, scaled by silhouette mean | 198 px | −3 % (barely visible) |
 * | `death`, scaled by its first frame's silhouette | **160 px** | **−22 % (obvious)** |
 *
 * ## The landmark that works
 *
 * **The tripod base.** It is the same physical object in all three sheets, it is at the bottom of
 * the frame, and no effect in any of these clips touches it — steam rises, debris falls outward, the
 * muzzle flash is at barrel height. Its span across the bottom rows is therefore a measurement of
 * the MACHINE rather than of the picture.
 *
 * Correcting `fire` and `death` to match idle's 205 px gave 0.44077135 and 0.44086021 — agreeing to
 * **0.02 %**, which is the real finding: both were shot from the same padded anchor, so one scale
 * was always right for both and two independently-derived numbers were never justified.
 *
 * ## What this file is, and what it is not
 *
 * It gates the PROPERTY — a character does not change size between its own animations — against the
 * shipped PNGs, so no future per-action scale can be derived from a silhouette and pass. It is not a
 * check that a scale equals a literal; that would go stale the moment art is re-shot, and would be
 * satisfied by a number nobody had looked at.
 *
 * ⚠️ It deliberately does NOT assert that a dying body has the same silhouette as a living one. A
 * wreck spreads: `rust-scavenger/death` throws debris **476 px** wide against a **200 px** body, and
 * that is the art doing what an explosion does at the correct scale. The landmark is chosen to be
 * blind to that on purpose.
 */

import { describe, expect, it } from 'vitest';

import { readPng } from '../../tools/gen/png.mjs';
import catalog from '../../public/assets/index.json';

/** Rows above the deepest opaque row that count as "the base". One tile at RENDER_SCALE / 4. */
const BASE_ROWS = 24;

/** How far a base may differ from its slug's reference before it reads as a different machine. */
const TOLERANCE = 0.1;

interface Row {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

/**
 * The width of the figure's footprint in frame `index` — its contact with the ground.
 *
 * Measured in the band above each frame's OWN deepest opaque row, so a pose that lifts off the floor
 * is measured at its own feet rather than against an absolute row that would catch empty space.
 */
function baseSpan(row: Row, index: number): number {
  const img = readPng(`public/assets/${row.url.replace(/^assets\//, '')}`);
  const alpha = (x: number, y: number): number => img.data[(y * img.width + x) * 4 + 3]!;
  const x0 = index * row.frameWidth;

  let deepest = -1;
  for (let y = row.frameHeight - 1; y >= 0 && deepest < 0; y -= 1) {
    for (let x = 0; x < row.frameWidth; x += 1) {
      if (alpha(x0 + x, y) > 8) {
        deepest = y;
        break;
      }
    }
  }
  if (deepest < 0) return 0;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = -1;
  for (let y = Math.max(0, deepest - (BASE_ROWS - 1)); y <= deepest; y += 1) {
    for (let x = 0; x < row.frameWidth; x += 1) {
      if (alpha(x0 + x, y) > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  return maxX < 0 ? 0 : maxX - minX + 1;
}

const rowFor = (key: string): Row | undefined =>
  catalog.sheets.find((sheet) => sheet.key === key) as Row | undefined;

/**
 * `brass-sentry` is the slug this gate exists for, and the only one whose every animation shows the
 * same rigid object from the same angle.
 *
 * The courier is deliberately absent: it is a person, and a person's footprint legitimately changes
 * between standing, running and lying down. The scavenger's is measured on its two locomotion loops
 * only, for the same reason — its death ends as a pile of scrap that has no legs at all.
 */
describe('a machine is the same machine in every animation it plays', () => {
  const reference = rowFor('brass-sentry-idle');

  it('the reference sheet exists — an absent one would make every ratio below NaN', () => {
    expect(reference).toBeDefined();
    expect(baseSpan(reference!, 0)).toBeGreaterThan(0);
  });

  it.each(['brass-sentry-fire', 'brass-sentry-death'])(
    '%s stands on the same tripod as the idle it interrupts',
    (key) => {
      const row = rowFor(key);
      expect(row, `${key} is not in the catalog`).toBeDefined();

      const want = baseSpan(reference!, 0);
      const got = baseSpan(row!, 0);
      const ratio = got / want;

      expect(
        Math.abs(ratio - 1),
        `${key} frame 0 has a ${got}px base against idle's ${want}px — ${((ratio - 1) * 100).toFixed(1)}%. ` +
          'The machine changes size when it plays this animation, which the user reported twice. ' +
          'Almost certainly a per-action scale derived from the SILHOUETTE: a muzzle flash, steam ' +
          'or debris inflates the bounding box without making the machine bigger, so matching that ' +
          'box to renderHeightPx shrinks the machine. Re-derive from this landmark instead — see ' +
          'character-bounds-brass-sentry.json.',
      ).toBeLessThan(TOLERANCE);
    },
  );

  /**
   * The gate must be able to SEE a wrong scale, not merely pass on a right one. `death` shipped at
   * 0.34408602 and measured 160 px against 205 — a ratio of 0.78, which is 2.2x the tolerance. A
   * gate that could not distinguish that from correct would be decoration.
   */
  it('is sensitive enough to have caught the defect it was written for', () => {
    const want = baseSpan(reference!, 0);
    const asShipped = Math.round((baseSpan(rowFor('brass-sentry-death')!, 0) * 0.34408602) / 0.44081578);
    expect(Math.abs(asShipped / want - 1)).toBeGreaterThan(TOLERANCE);
  });
});

/**
 * The scavenger is measured on HEIGHT, not on its base — and finding out why is worth recording.
 *
 * The first version of this file applied the tripod landmark to the scavenger too, and it failed by
 * **56 %**. Not a scale error: the sentry's tripod is a RIGID frame, and the scavenger's legs are
 * not. In `walk` frame 0 one foot is planted and the other is mid-swing (a 42 px footprint); in
 * `chase` frame 0 both legs are extended (143 px). Its footprint is a POSE, and comparing poses
 * across two different gaits measures the gait.
 *
 * Height is the landmark that survives for a legged body: a walking machine's standing height barely
 * moves between gaits, and `character-bounds-rust-scavenger.json` already derives the slug's scale
 * from exactly that quantity.
 *
 * **A landmark has to be chosen per body plan.** That is the general lesson, and it is why this file
 * does not try to gate `brass-courier` at all: a person legitimately changes both footprint and
 * height between standing, running and lying down.
 */
describe('the scavenger is the same body at both of its gaits', () => {
  const heightOf = (row: Row, index: number): number => {
    const img = readPng(`public/assets/${row.url.replace(/^assets\//, '')}`);
    const alpha = (x: number, y: number): number => img.data[(y * img.width + x) * 4 + 3]!;
    const x0 = index * row.frameWidth;
    let min = Number.POSITIVE_INFINITY;
    let max = -1;
    for (let y = 0; y < row.frameHeight; y += 1) {
      for (let x = 0; x < row.frameWidth; x += 1) {
        if (alpha(x0 + x, y) > 8) {
          if (y < min) min = y;
          if (y > max) max = y;
        }
      }
    }
    return max < 0 ? 0 : max - min + 1;
  };

  it('walk and chase stand the same height — the same machine at two speeds', () => {
    const walk = rowFor('rust-scavenger-walk');
    const chase = rowFor('rust-scavenger-chase');
    expect(walk).toBeDefined();
    expect(chase).toBeDefined();

    const ratio = heightOf(chase!, 0) / heightOf(walk!, 0);
    expect(
      Math.abs(ratio - 1),
      'the scavenger changes height between walking and chasing — the two sheets were packed at ' +
        'different scales',
    ).toBeLessThan(TOLERANCE);
  });

  /**
   * Frame 0 only: the machine is still intact and standing there. This is the assertion that says
   * the user's other report — *"when he dies, the animation of the kill becomes bigger"* — is the
   * EXPLOSION and not a scale error. The intact machine is the right size; what grows afterwards is
   * scrap, 476 px of it against a 200 px body, and that is the art doing what an explosion does.
   */
  it('the scavenger dies at the size it lived — the explosion is art, not a bad scale', () => {
    const walk = rowFor('rust-scavenger-walk')!;
    const death = rowFor('rust-scavenger-death')!;
    const ratio = heightOf(death, 0) / heightOf(walk, 0);
    expect(Math.abs(ratio - 1)).toBeLessThan(TOLERANCE);
  });

  it('...and the debris really does spread, so the note above is not describing nothing', () => {
    // Non-vacuity for the claim in the test above: if the death sheet did NOT spread, "the growth
    // is the explosion" would be an explanation for something that never happens.
    const death = rowFor('rust-scavenger-death')!;
    const img = readPng(`public/assets/${death.url.replace(/^assets\//, '')}`);
    const alpha = (x: number, y: number): number => img.data[(y * img.width + x) * 4 + 3]!;
    const widthAt = (index: number): number => {
      const x0 = index * death.frameWidth;
      let min = Number.POSITIVE_INFINITY;
      let max = -1;
      for (let y = 0; y < death.frameHeight; y += 1) {
        for (let x = 0; x < death.frameWidth; x += 1) {
          if (alpha(x0 + x, y) > 8) {
            if (x < min) min = x;
            if (x > max) max = x;
          }
        }
      }
      return max < 0 ? 0 : max - min + 1;
    };
    expect(widthAt(death.frameCount - 1)).toBeGreaterThan(widthAt(0) * 2);
  });
});
