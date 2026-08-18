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

import { MAX_LEVEL_ENEMIES } from '../../src/game/constants';
import { describeLevelProblem, isHazardObject, isSolidObject, parseLevel, type LevelData } from '../../src/game/tilemap';
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

/** Every shipped level, parsed. Phase 8: the enemy-roster assertions sweep all of them. */
const SHIPPED_LEVELS: [string, LevelData][] = Object.keys(SHIPPED).map((path) => {
  const id = path.slice(path.lastIndexOf('/') + 1).replace(/\.tmj$/, '');
  return [id, parseLevel(id, JSON.parse(SHIPPED[path]!) as unknown)];
});

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

/**
 * 🔴 Widened in Phase 8 from `level-01` to **every shipped level**, and that is not tidiness.
 *
 * `level-hazards.test.ts` proves a spike run hurts by *walking into it*, which can only ever be an
 * EXISTENTIAL claim — it counts how many hazards a plain walk reached and asserts the count is above
 * zero. Every level this phase authored puts spikes on an elevated summit that no plain walk reaches,
 * so those runs were never individually verified and a `hazard` property stripped from one of them
 * left the suite green. Found by the Phase 8 code-reviewer gate owner.
 *
 * This is the UNIVERSAL half, and the two together are what close it: every spike cell drawn anywhere
 * in any level must be covered by a hazard rect, or its gid appears both inside and outside and this
 * goes red — reachable on foot or not.
 */
const SHIPPED_MAPS = Object.entries(SHIPPED).map(([path, raw]) => {
  const id = path.split('/').pop()!.replace(/\.tmj$/, '');
  return [id, JSON.parse(raw) as typeof MAP_01, parseLevel(id, JSON.parse(raw))] as const;
});

describe.each(SHIPPED_MAPS)(
  '%s — the shipped spikes actually hurt (criterion 5.15, debt: Phase 4 world edges)',
  (id, map, level) => {
    it('carries at least one hazard', () => {
      expect(level.hazards.length, `${id} ships no hazards`).toBeGreaterThan(0);
    });

    /**
     * Art-versus-hazard agreement, measured rather than typed. See this file's header.
     */
    it('no tile gid is drawn both inside and outside a hazard rectangle', () => {
      const tiles = map.layers.find((layer) => layer.type === 'tilelayer')!.data!;
      const inside = new Set<number>();
      const outside = new Set<number>();

      tiles.forEach((gid, index) => {
        if (gid === 0) {
          return; // Tiled's empty cell — it is drawn nowhere and belongs to neither set.
        }
        const x = (index % map.width) * map.tilewidth;
        const y = Math.floor(index / map.width) * map.tileheight;
        const covered = level.hazards.some(
          (h) => x < h.x + h.w && x + map.tilewidth > h.x && y < h.y + h.h && y + map.tileheight > h.y,
        );
        (covered ? inside : outside).add(gid);
      });

      // Non-vacuity first: an empty `inside` would make the disjointness below trivially true, which
      // is exactly what a hazard rect authored over empty sky would produce.
      expect(inside.size, `${id}: no tile is drawn inside any hazard rect`).toBeGreaterThan(0);
      expect([...inside].filter((gid) => outside.has(gid)), `${id}: a gid is drawn on both sides`).toEqual([]);
    });
  },
);

describe('the enemies are authored into the level files', () => {
  /**
   * 🔴 Rewritten in Phase 8. It read `expect(slugs.sort()).toEqual(ENEMY_SLUGS.sort())` against
   * `level-01` alone — exactly one of each type, per level. That is a constraint no five-level
   * difficulty ramp can satisfy: the ramp's enemy count is one of the metrics that must rise.
   *
   * What it was actually protecting is worth keeping, and it is not "one of each": **an enemy type
   * that exists in code but is authored into no level has never been played.** That is a per-project
   * property, so it is asserted as the UNION across every shipped level. The dropped half — that no
   * level names an unknown slug — is not lost either; `describeEnemyProblem` refuses one in
   * production, which is a stronger place for it than a test.
   */
  it.each(SHIPPED_LEVELS)('%s names only known slugs, at least one, and no more than the cap', (id, level) => {
    expect(level.enemies.length, `${id} ships no enemies`).toBeGreaterThan(0);
    expect(level.enemies.length, `${id} exceeds MAX_LEVEL_ENEMIES`).toBeLessThanOrEqual(MAX_LEVEL_ENEMIES);
    for (const enemy of level.enemies) {
      expect(ENEMY_SLUGS, `${id} names an unknown slug`).toContain(enemy.slug);
    }
  });

  it('every enemy type in the code is authored into at least one shipped level', () => {
    // 🔴 The non-vacuity is `ENEMY_SLUGS.length > 1`: with a single slug the union below is satisfied
    // by any level at all, and the gate would pass while a second type shipped in nothing.
    expect(ENEMY_SLUGS.length, 'one slug makes the union assertion vacuous').toBeGreaterThan(1);
    const union = new Set(SHIPPED_LEVELS.flatMap(([, level]) => level.enemies.map((e) => e.slug)));
    expect([...union].sort()).toEqual([...ENEMY_SLUGS].sort());
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
    ['gear-not-a-point', /must be a POINT/],
    // Added after the code-reviewer gate owner noticed gears were the only entity with no
    // placement check at all: enemies get ground under both patrol ends, the spawn gets ground
    // beneath it, and a gear could sit outside the map and simply never be collectable.
    ['gear-outside-map', /outside the map/],
    // 🔴 "Not buried in a solid" used to be asserted only against `level-01`, further down this
    // file — so it protected the one level that ships and no other. Moved into
    // `describeGearProblem`, where every level passes through it, and gated by a fixture built
    // from the shipped level with ONE gear's y moved from 1872 to 2016: inside the floor solid at
    // y 1920, height 192. Nothing else in the file differs.
    ['gear-inside-solid', /is inside the solid at/],
  ];

  it.each(cases)('%s', (name, reason) => {
    const raw = BAD_LEVELS[`../fixtures/bad-levels/${name}.fixture`];
    expect(raw, `fixture ${name} is missing`).toBeTypeOf('string');
    expect(describeLevelProblem(JSON.parse(raw!))).toMatch(reason);
  });
});

/**
 * Gears as level data — criterion 6.1's other half.
 *
 * Measured off the shipped bytes, never re-typed from `make-greybox-level.mjs`. A test that
 * restated the authored coordinates would pass just as happily against a level where every gear had
 * been placed inside the floor: it would be comparing the generator to itself, which is the root
 * rule's whole complaint.
 */
describe('gears in the shipped level', () => {
  const level = parseLevel('level-01', MAP_01);

  it('the shipped level actually carries gears', () => {
    expect(Array.isArray(level.gears)).toBe(true);
    expect(level.gears.length).toBeGreaterThan(0);
  });

  it('every gear has a finite position inside the map', () => {
    for (const [index, gear] of level.gears.entries()) {
      expect(typeof gear.x, `gear #${index} x`).toBe('number');
      expect(typeof gear.y, `gear #${index} y`).toBe('number');
      expect(Number.isFinite(gear.x) && Number.isFinite(gear.y)).toBe(true);
      expect(gear.x).toBeGreaterThan(0);
      expect(gear.x).toBeLessThan(level.widthPx);
      expect(gear.y).toBeGreaterThan(0);
      expect(gear.y).toBeLessThan(level.heightPx);
    }
  });

  it('no gear is buried inside a solid — one you can never reach is one that is not there', () => {
    for (const [index, gear] of level.gears.entries()) {
      const buried = level.solids.some(
        (s) => gear.x >= s.x && gear.x <= s.x + s.w && gear.y >= s.y && gear.y <= s.y + s.h,
      );
      expect(buried, `gear #${index} at (${gear.x}, ${gear.y}) is inside a solid`).toBe(false);
    }
  });

  it('no two gears occupy the same point', () => {
    const seen = new Set(level.gears.map((g) => `${g.x},${g.y}`));
    expect(seen.size).toBe(level.gears.length);
  });
});
