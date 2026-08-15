/**
 * Hazards and enemy spawns as LEVEL DATA — the second half of criterion 5.15.
 *
 * `hazards.test.ts` proves the swept contact maths. This file proves the geometry it is handed is
 * real: that the shipped `level-01` actually carries a hazard over the spikes it draws, that both
 * enemies are authored into the file rather than hardcoded in a scene, and that the four ways a
 * designer can author them wrongly are refused by the boot gate rather than by the eye.
 *
 * ## Why the spike check is written the way it is
 *
 * Phase 4 shipped a level with a spike run at cols 24–27 that was *drawn* and did nothing — art and
 * collision disagreeing, which is the failure class the Element Editor exists to chase. The obvious
 * test ("there is a hazard at x 2304") re-types the number out of the file and cannot see that
 * disagreement at all: move the spikes in Tiled and it stays green.
 *
 * So the assertion is **exclusivity**: the set of tile gids drawn inside the hazard rectangles and
 * the set drawn outside them must not intersect. Spikes drawn without a hazard rect put the spike
 * gid on both sides; a hazard rect dropped over plain floor puts the floor gid on both sides.
 * Neither number is written down here — both sets are measured from the shipped bytes *(vault 3.2)*.
 */

import { describe, expect, it } from 'vitest';

import { describeLevelProblem, isHazardObject, isSolidObject, parseLevel } from '../../src/game/tilemap';
import { ENEMY_SLUGS } from '../../src/sim/enemies';

const SHIPPED = import.meta.glob('../../public/assets/levels/*.tmj', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BAD_LEVELS = import.meta.glob('../fixtures/bad-levels/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const RAW_01 = SHIPPED['../../public/assets/levels/level-01.tmj']!;
const MAP_01 = JSON.parse(RAW_01) as {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: { type: string; data?: number[]; objects?: unknown[] }[];
};
const LEVEL_01 = parseLevel('level-01', JSON.parse(RAW_01) as unknown);

describe('hazards are read from a property, never from a name (vault 3.3)', () => {
  it('isHazardObject answers only to `hazard: true`', () => {
    expect(isHazardObject({ properties: [{ name: 'hazard', value: true }] })).toBe(true);
    expect(isHazardObject({ properties: [{ name: 'hazard', value: false }] })).toBe(false);
    expect(isHazardObject({ properties: [{ name: 'solid', value: true }] })).toBe(false);
    expect(isHazardObject({ name: 'hazard', properties: [] })).toBe(false);
    expect(isHazardObject({})).toBe(false);
    expect(isHazardObject(null)).toBe(false);
  });

  /**
   * A hazard must not be counted as collision. If it were, the spikes would become a ledge the
   * player stands on top of — visibly wrong, but only after the art lands, and it would also let a
   * level ship with NO real collision while passing the "has collision" gate.
   */
  it('a level whose only collision objects are hazards is still refused', () => {
    const hazardsOnly = JSON.parse(RAW_01) as typeof MAP_01;
    const layer = hazardsOnly.layers.find((l) => l.type === 'objectgroup')!;
    layer.objects = (layer.objects ?? []).map((object) =>
      isSolidObject(object)
        ? { ...(object as object), properties: [{ name: 'hazard', type: 'bool', value: true }] }
        : object,
    );
    expect(describeLevelProblem(hazardsOnly)).toMatch(/no object carries the `solid` property/);
  });

  it('the shipped solids and hazards are disjoint sets', () => {
    const overlapping = LEVEL_01.solids.filter((solid) =>
      LEVEL_01.hazards.some((h) => h.x === solid.x && h.y === solid.y && h.w === solid.w && h.h === solid.h),
    );
    expect(overlapping).toEqual([]);
  });
});

describe('the shipped spikes actually hurt (criterion 5.15, debt: Phase 4 world edges)', () => {
  it('level-01 carries at least one hazard', () => {
    expect(LEVEL_01.hazards.length).toBeGreaterThan(0);
  });

  /**
   * Art-versus-hazard agreement, measured rather than typed. See this file's header.
   */
  it('no tile gid is drawn both inside and outside a hazard rectangle', () => {
    const tiles = MAP_01.layers.find((layer) => layer.type === 'tilelayer')!.data!;
    const inside = new Set<number>();
    const outside = new Set<number>();

    tiles.forEach((gid, index) => {
      if (gid === 0) {
        return; // Tiled's empty cell — it is drawn nowhere and belongs to neither set.
      }
      const x = (index % MAP_01.width) * MAP_01.tilewidth;
      const y = Math.floor(index / MAP_01.width) * MAP_01.tileheight;
      const covered = LEVEL_01.hazards.some(
        (h) => x < h.x + h.w && x + MAP_01.tilewidth > h.x && y < h.y + h.h && y + MAP_01.tileheight > h.y,
      );
      (covered ? inside : outside).add(gid);
    });

    // Non-vacuity first: an empty `inside` would make the disjointness below trivially true, which
    // is exactly what a hazard rect authored over empty sky would produce.
    expect(inside.size).toBeGreaterThan(0);
    expect([...inside].filter((gid) => outside.has(gid))).toEqual([]);
  });
});

describe('both enemies are authored into the level file', () => {
  it('spawns one of every known slug, and nothing else', () => {
    const slugs = LEVEL_01.enemies.map((enemy) => enemy.slug);
    expect([...slugs].sort()).toEqual([...ENEMY_SLUGS].sort());
  });

  it('a rectangle declares the beat: x is its centre, y its feet, patrol its horizontal span', () => {
    for (const enemy of LEVEL_01.enemies) {
      expect(enemy.patrolMax).toBeGreaterThan(enemy.patrolMin);
      expect(enemy.x).toBe((enemy.patrolMin + enemy.patrolMax) / 2);
    }
  });

  /**
   * Both ends of the beat, not just the centre — a patroller whose span overhangs its platform
   * walks on air at one end, which the centre alone cannot see.
   */
  it('every enemy has ground under both ends of its patrol', () => {
    const standsOn = (x: number, y: number) =>
      LEVEL_01.solids.some((s) => s.y + s.h >= y && x > s.x && x < s.x + s.w);

    for (const enemy of LEVEL_01.enemies) {
      expect(standsOn(enemy.patrolMin, enemy.y), `${enemy.slug} patrolMin`).toBe(true);
      expect(standsOn(enemy.patrolMax, enemy.y), `${enemy.slug} patrolMax`).toBe(true);
    }
  });
});

/**
 * The four new committed fixtures, each asserted against its OWN reason.
 *
 * `tilemap-data.test.ts` already sweeps every fixture for "rejected, with a distinct reason". That
 * sweep cannot tell WHICH rule fired, and a rule that rejects for the wrong reason is not a gate —
 * mutation M20 survived a loose `/solid/i` assertion in exactly that way *(vault C2)*.
 */
describe('REJECTS hazards and enemies authored wrongly', () => {
  const cases: [string, RegExp][] = [
    ['hazard-zero-size', /hazard #0 has a non-positive size/],
    ['enemy-unknown-slug', /unknown slug `brass-gorilla`/],
    ['enemy-not-a-rect', /must be a rectangle/],
    ['enemy-over-a-pit', /no solid beneath/],
    // 23 enemies, one over MAX_LEVEL_ENEMIES. Every one stands on a continuous floor so BOTH
    // patrol edges have ground beneath them — without that it would fail on `hasGroundBelow`,
    // which fires earlier, and prove nothing about the cap.
    ['too-many-enemies', /23 enemies, over the 22/],
  ];

  it.each(cases)('%s', (name, reason) => {
    const raw = BAD_LEVELS[`../fixtures/bad-levels/${name}.fixture`];
    expect(raw, `fixture ${name} is missing`).toBeTypeOf('string');
    expect(describeLevelProblem(JSON.parse(raw!))).toMatch(reason);
  });
});
