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

  /**
   * 🔴 **This was decoration until 2026-08-18, and the replacement is the point.**
   *
   * It read `h.x === solid.x && h.y === solid.y && h.w === solid.w && h.h === solid.h` — EXACT
   * rectangle equality — on `level-01` ALONE. A hazard half-inside a solid, which is the shape a
   * real authoring slip takes on a 96 px grid, matched nothing and passed. So did anything at all in
   * levels 02–05.
   *
   * It became load-bearing when the low-ground spike runs went in: those put hazards flush against
   * solids all over the five shipped levels, so "flush" and "overlapping" are now one tile apart in
   * the data and a gate that cannot tell them apart is worse than none. A hazard sunk into the floor
   * draws spikes that are half-buried and hurts a player standing on solid ground.
   *
   * Strict inequalities, so **touching is not overlapping** — every ground spike rests exactly on
   * the floor's top edge by construction, and that is correct, not a violation.
   */
  it('no shipped hazard overlaps a solid, in ANY level — partially or wholly', () => {
    const found: string[] = [];
    for (const [id, level] of SHIPPED_LEVELS) {
      for (const h of level.hazards) {
        for (const s of level.solids) {
          if (h.x < s.x + s.w && h.x + h.w > s.x && h.y < s.y + s.h && h.y + h.h > s.y) {
            found.push(
              `${id}: hazard (${h.x}, ${h.y}) ${h.w}x${h.h} overlaps solid (${s.x}, ${s.y}) ${s.w}x${s.h}`,
            );
          }
        }
      }
    }
    expect(found, found.join(' | ')).toEqual([]);
  });

  /**
   * 🔴 The red proof, because the assertion above is an emptiness check and those pass for free.
   *
   * A hazard sunk ONE PIXEL into the floor — the smallest real version of the defect, and exactly
   * what the old exact-equality form could not see.
   */
  it('...and that sweep goes red on a hazard sunk one pixel into the floor', () => {
    const floor = LEVEL_01.solids[0]!;
    const sunk = { x: floor.x + 96, y: floor.y - 95, w: 96, h: 96 };
    const overlaps =
      sunk.x < floor.x + floor.w &&
      sunk.x + sunk.w > floor.x &&
      sunk.y < floor.y + floor.h &&
      sunk.y + sunk.h > floor.y;
    expect(overlaps, 'the sweep above cannot see a one-pixel sinking, so it proves nothing').toBe(true);

    // ...and the shipped spikes, which REST on the floor rather than sinking into it, do not.
    const resting = { x: floor.x + 96, y: floor.y - 96, w: 96, h: 96 };
    expect(
      resting.y < floor.y + floor.h && resting.y + resting.h > floor.y,
      'a spike resting exactly on the floor must NOT read as an overlap, or every level is red',
    ).toBe(false);
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
 * Every committed bad fixture that has a rule of its own, asserted against its OWN reason.
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
    // 🔴 The two holes in that same check, session inventory item 1.1, 2026-08-23.
    //
    // The check was `gx > solid.x && gx < solid.x + solid.width && …` — STRICT inequalities, against
    // ONE rect at a time, testing the authored POINT.
    //
    // `gear-on-a-tile-seam` is the first hole and it is not an edge case: on a 96 px grid a seam
    // between two abutting floor rects is the DEFAULT authoring outcome. A gear at exactly
    // `solid.x + solid.width` satisfies neither rect — `1920 < 1920` is false for the left one and
    // `1920 > 1920` is false for the right one — so it passes the gate, sits inside collision
    // geometry, and can never be picked up. With the gear cap, that is an uncompletable level.
    //
    // `gear-body-in-a-solid` is the second: the gear's centre is 20 px ABOVE the floor's top edge,
    // outside every rect, while its real 72 × 72 body reaches 16 px into it.
    //
    // The two are deliberately separate rows because ONE of them cannot prove the fix. Making the
    // comparison inclusive closes the seam and leaves the body hole wide open; the seam fixture
    // would go green and the defect would ship. Dropping `RENDER_SCALE` from the body maths shrinks
    // the box 6× — 72 px to 12 — and turns the body row red while the seam row stays green.
    ['gear-on-a-tile-seam', /body is inside the solid at/],
    ['gear-body-in-a-solid', /body is inside the solid at/],
    // 🔴 The three PLACEMENT fixtures, added 2026-08-18 with the rule they prove.
    //
    // They were committed without a row here, and the gate owner's first brief caught it: the
    // directory sweep in `tilemap-data.test.ts` proves only "rejected, distinctly from every OTHER
    // fixture", which is satisfied by three rules firing in the wrong order as long as their
    // messages differ. `bad-levels/README.md` says so in the project's own words, and the fix was
    // to extend this array rather than to argue the sweep was enough.
    //
    // Each regex names the rule AND the object type, so swapping the hazard and gear branches of
    // `describePlacementProblem` goes red here while the sweep stays green.
    ['enemy-standing-in-a-hazard', /walks its beat through the hazard at \(200, 200\) 32x32/],
    // 🔴 The FOURTH placement fixture, added by Codex implementation review 2, finding 1.
    //
    // Identical to the one above with a single number changed — the hazard's `y`, 200 → 255 — so
    // that it overlaps only the **bottom pixel** of the sentry's body (feet 256, body 64…256).
    // `FOOT_TOLERANCE_PX` used to be subtracted from the box used for hazards and gears as well as
    // solids, which put the box's sole at 254 and let this one pass: a spike one pixel under the
    // creature, invisible to the gate and reading on screen as exactly the reported bug.
    //
    // Reverting `swept`/`sweptFeetClear` in `tiledPlacement.ts` to one shortened box turns this row
    // red and leaves every other row in this array green — which is the whole point of committing it
    // rather than asserting the tolerance's value *(vault C2)*.
    ['hazard-under-an-enemy-sole', /walks its beat through the hazard at \(200, 255\) 32x32/],
    ['gear-inside-an-enemy', /walks its beat through the gear body at \(224, 154\) 72x72/],
    ['enemy-beat-into-a-wall', /walks its beat into the solid at \(300, 64\) 32x192/],
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
