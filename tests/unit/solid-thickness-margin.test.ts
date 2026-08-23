import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../src/sim/playerTuning';
import { SCAVENGER } from '../../src/sim/enemies';

/**
 * # No shipped solid is thin enough to tunnel through (session inventory 1b.6)
 *
 * `docs/qa/phase-02-player.md:355` recorded that `resolveCollisions` can tunnel through a solid
 * narrower than one tick of travel, measured the margin at **~1.9×**, and closed it with *"revisit
 * if a thin hazard is ever authored."*
 *
 * ## Two things about that record are wrong, and both matter
 *
 * **1. The trigger is wrong.** The inventory says Phase 8's spike runs make it reachable. They do
 * not: hazards are **non-solid** and are already tested with a swept overlap. The body that can
 * tunnel is the one resolving against **solids**, so the question is the narrowest *solid*, not the
 * narrowest hazard.
 *
 * **2. The margin is wrong, and in the safe direction.** *"~1.9× against a 32 px tile at
 * maxFallSpeed 17"* are **pre-rescale** figures — Phase 4 moved the grid 32 → 96 and `RENDER_SCALE`
 * 2 → 6. Re-measured 2026-08-23 across all five shipped levels:
 *
 * | | value |
 * |---|---|
 * | shortest solid **height** shipped | **288 px** (`level-01` @ 0,1920 — 3840 × 288) |
 * | narrowest solid **width** shipped | **192 px** (`level-01` @ 3264,1632 — 192 × 288) |
 * | fastest vertical travel, `maxFallSpeed` | **51.6 px/tick** |
 * | fastest horizontal travel, `runMax` | **9 px/tick** |
 * | **worst-case margin** | **288 / 51.6 = 5.58×** |
 *
 * So it is comfortable today, and comfortably better than the number on file.
 *
 * ## Why this is an invariant and not a note
 *
 * *"Revisit if a thin hazard is ever authored"* is a promise to remember, and Phase 8 authored new
 * geometry without anyone revisiting — which is the whole reason this item is in the inventory. A
 * one-time measurement is **not a regression gate**: it says nothing about the sixth level.
 *
 * This asserts the relationship instead, over the shipped `.tmj` files, so the day someone authors a
 * 40 px ledge the suite says so **before** a playtest finds a player falling through the floor.
 *
 * ⚠️ **A red here is not fixed by lowering `MIN_MARGIN`.** It means either the level needs thicker
 * geometry, or the collision resolve needs to become swept — which is a real change to
 * `resolveCollisions` and is a different piece of work from this gate.
 */

/**
 * Every shipped level, raw.
 *
 * ⚠️ vitest caches `?raw` glob results, and this project has already had a landed `.tmj` mutation
 * report green because of it. Touch this file too when re-running after a level edit.
 */
const LEVELS = import.meta.glob('../../public/assets/levels/*.tmj', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

interface TiledObject {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: { name: string; value: unknown }[];
}

function solidsOf(raw: string): TiledObject[] {
  const map = JSON.parse(raw) as { layers: { objects?: TiledObject[] }[] };
  return map.layers
    .flatMap((layer) => layer.objects ?? [])
    .filter((o) => (o.properties ?? []).some((p) => p.name === 'solid' && p.value === true));
}

/**
 * How many times a solid must exceed one tick of travel.
 *
 * **2 is a floor with room under the shipped 5.58×, not a target.** A margin of exactly 1 means a
 * body can cross a solid in a single tick with no interior sample; 2 leaves a whole tick inside it
 * even at top speed, and still refuses geometry only half as thick as anything shipped.
 */
const MIN_MARGIN = 2;

describe('shipped solids are thicker than one tick of travel (inventory 1b.6)', () => {
  const files = Object.entries(LEVELS);

  it('reads all five shipped levels — an empty glob would make every check below vacuous', () => {
    expect(files.length).toBe(5);
  });

  it('the fastest per-tick travel is what this measures against, and it is vertical', () => {
    // Stated rather than assumed: the horizontal cap is a fraction of the fall speed, so the
    // vertical axis is the binding one and a margin computed off `runMax` would be five times too
    // generous.
    expect(DEFAULT_TUNING.maxFallSpeed).toBeGreaterThan(DEFAULT_TUNING.runMax);
    expect(DEFAULT_TUNING.maxFallSpeed).toBeGreaterThan(SCAVENGER.chaseSpeed);
  });

  for (const [path, raw] of files) {
    const name = path.split('/').pop() ?? path;

    it(`${name}: every solid is thicker than ${MIN_MARGIN} ticks of travel`, () => {
      const solids = solidsOf(raw);
      expect(solids.length, `${name} declares no solids at all`).toBeGreaterThan(0);

      for (const solid of solids) {
        const w = solid.width ?? 0;
        const h = solid.height ?? 0;
        expect(typeof solid.width, `${name}: a solid has a non-numeric width`).toBe('number');

        // Height against the fall speed, width against the run speed — each axis against the
        // fastest thing that crosses it.
        expect(
          h,
          `${name}: the solid at (${solid.x}, ${solid.y}) is ${w} x ${h}. Its HEIGHT is under ` +
            `${MIN_MARGIN} x maxFallSpeed (${DEFAULT_TUNING.maxFallSpeed} px/tick), so a falling ` +
            `body can cross it without a sample inside. Thicken the geometry or make ` +
            `resolveCollisions swept — do NOT lower MIN_MARGIN.`,
        ).toBeGreaterThanOrEqual(MIN_MARGIN * DEFAULT_TUNING.maxFallSpeed);

        expect(
          w,
          `${name}: the solid at (${solid.x}, ${solid.y}) is ${w} x ${h}. Its WIDTH is under ` +
            `${MIN_MARGIN} x runMax (${DEFAULT_TUNING.runMax} px/tick).`,
        ).toBeGreaterThanOrEqual(MIN_MARGIN * DEFAULT_TUNING.runMax);
      }
    });
  }

  it('records the actual worst-case margin, so a shrinking one is visible before it fails', () => {
    let worst = Number.POSITIVE_INFINITY;
    for (const [, raw] of files) {
      for (const solid of solidsOf(raw)) {
        worst = Math.min(worst, (solid.height ?? 0) / DEFAULT_TUNING.maxFallSpeed);
      }
    }
    // 5.58x as measured on 2026-08-23. Asserted as a floor rather than an equality: the point is to
    // notice erosion, and pinning it exactly would red on any level edit at all.
    expect(worst).toBeGreaterThan(5);
  });
});
