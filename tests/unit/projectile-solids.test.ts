import { describe, expect, it } from 'vitest';
import { fireProjectile, projectileHit, stepProjectiles } from '../../src/sim/projectiles';
import { createWorld, tick } from '../../src/sim/tick';
import { createSnapshot } from '../../src/sim/input';
import type { Rect } from '../../src/sim/types';

/**
 * # A sentry bolt stops at a wall (session inventory 1.2)
 *
 * `projectiles.ts` conceded it in its own header: *"No gravity, no collision against solids. A shot
 * that stops at a wall would be a better game and a worse first version."* Deprioritised every
 * session since Phase 5.
 *
 * ## Two things the inventory says about this are wrong
 *
 * **1. It does not need a tick-contract insert.** The inventory says *"decide where it slots into
 * the 14-step contract before writing anything."* Projectile flight is **already step 4a** —
 * `tick.ts:15` lists it, and `enemyTurn.ts` calls `stepProjectiles` inside `stepEnemies`. Nothing is
 * renumbered and no letter is added.
 *
 * **2. "The ordering decision is the real work"** is right about there being one, and wrong about
 * what it is. It is not *where in the tick*; it is **time of impact along one segment**:
 *
 * - a player standing **in front of** the wall must still be hit;
 * - a player standing **behind** it must not.
 *
 * Both are decided inside a single tick's motion, and the boolean `segmentHitsRect` cannot express
 * either — which is why filtering "any projectile that touched any wall" would have erased a hit
 * that happened first. *(Codex plan review X2.)*
 *
 * ## The resolution: CLIP the segment, do not cull the bolt
 *
 * On the tick it strikes, the bolt's segment is shortened to the impact point and it is marked
 * spent. Step 9b's swept test then reads a segment that ends at the wall, so:
 *
 * - a player between the sentry and the wall is inside that segment → hit, exactly as before;
 * - a player past the wall is outside it → not hit;
 *
 * and the spent bolt is dropped on the next tick. Deleting it at 4a instead would have been the
 * simpler code and the wrong game: it would silently cancel a hit the player had already earned.
 *
 * ## The mutation this file names
 *
 * `segmentHitTime` returning a constant `1` — i.e. "the impact is always at the far end" — which is
 * the shape a boolean-only sweep degenerates to and the one that erases the in-front-of-the-wall
 * hit.
 */

const WALL: Rect = { x: 500, y: -1000, w: 100, h: 4000 };
const BOUNDS = { widthPx: 5000, heightPx: 3000 };

/**
 * A bolt fired rightward from x=0 at y=0.
 *
 * The single-tick cases use 800 px/tick so ONE step carries it clear past the wall at 500..600 —
 * at the shipped speed it would take several ticks and the clip could be an artefact of stepping
 * rather than of the sweep. The multi-tick case below deliberately uses a slow one to check that.
 */
function boltAtSpeed(speed: number) {
  return fireProjectile(0, 0, 1000, 0, speed, 9);
}

/** One player-sized box centred at `x`, on the bolt's line. */
function playerBoxAt(x: number): Rect {
  return { x: x - 60, y: -100, w: 120, h: 200 };
}

describe('a bolt stops at a solid (inventory 1.2)', () => {
  it('the premise: with no solids it flies straight through where the wall would be', () => {
    // Without this, every assertion below could pass on a bolt that never moved.
    let shots = [boltAtSpeed(800)];
    shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, []);
    expect(shots.length).toBe(1);
    expect(shots[0]!.x, 'the bolt did not travel, so nothing here tests a wall').toBeGreaterThan(
      WALL.x + WALL.w,
    );
  });

  it('stops AT the wall face rather than passing through it', () => {
    let shots = [boltAtSpeed(800)];
    shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, [WALL]);

    expect(shots.length, 'the bolt was deleted on the tick it struck').toBe(1);
    const bolt = shots[0]!;
    expect(typeof bolt.x).toBe('number');
    expect(bolt.x, 'the bolt is inside or past the wall').toBeLessThanOrEqual(WALL.x);
    // And it really did travel to the face, rather than stopping early for some other reason.
    expect(bolt.x).toBeGreaterThan(WALL.x - 1);
  });

  it('is gone on the FOLLOWING tick — spent, not immortal', () => {
    let shots = [boltAtSpeed(800)];
    shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, [WALL]);
    expect(shots.length).toBe(1);
    shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, [WALL]);
    expect(shots.length, 'a struck bolt survived into the next tick').toBe(0);
  });

  it('a player IN FRONT of the wall is still hit on the tick the bolt strikes', () => {
    // The ordering case, and the one a cull-at-4a implementation gets wrong. The player is at 300,
    // the wall at 500: the bolt reaches the player first and the hit is already earned.
    let shots = [boltAtSpeed(800)];
    shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, [WALL]);

    expect(
      projectileHit(shots, playerBoxAt(300)),
      'the wall cancelled a hit that happened before it — the bolt was culled instead of clipped',
    ).not.toBeNull();
  });

  it('a player BEHIND the wall is NOT hit', () => {
    // The whole point of the feature. Before this, the bolt swept straight through to 800.
    let shots = [boltAtSpeed(800)];
    shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, [WALL]);

    expect(
      projectileHit(shots, playerBoxAt(800)),
      'the bolt hit a player standing behind a wall',
    ).toBeNull();
  });

  it('stops at the NEAREST wall when two are in the way', () => {
    // A "first solid in the list" implementation passes every test above and fails this one whenever
    // the level happens to declare the far wall first.
    const far: Rect = { x: 900, y: -1000, w: 100, h: 4000 };
    let shots = [boltAtSpeed(2000)];
    shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, [far, WALL]);
    expect(shots[0]!.x).toBeLessThanOrEqual(WALL.x);
  });

  it('crosses a gap between two solids untouched', () => {
    // The counter-fixture: a fix that stops every bolt at every tick would satisfy the two
    // wall assertions above and make the sentry decorative again.
    const above: Rect = { x: 400, y: -2000, w: 100, h: 500 };
    const below: Rect = { x: 400, y: 1500, w: 100, h: 500 };
    let shots = [boltAtSpeed(800)];
    shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, [above, below]);
    expect(shots[0]!.x, 'a bolt stopped at a wall that was nowhere near its path').toBeGreaterThan(
      600,
    );
  });

  it('a slow bolt takes several ticks and only stops on the tick it arrives', () => {
    // Multi-tick flight, so the clip cannot be an artefact of one giant step.
    let shots = [boltAtSpeed(60)];
    const positions: number[] = [];
    for (let i = 0; i < 12 && shots.length > 0; i += 1) {
      shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, [WALL]);
      if (shots.length > 0) positions.push(shots[0]!.x);
    }
    expect(positions.length, 'the bolt vanished immediately').toBeGreaterThan(3);
    for (const x of positions) {
      expect(x).toBeLessThanOrEqual(WALL.x);
    }
    expect(positions[positions.length - 1]).toBeGreaterThan(WALL.x - 1);
  });

  it('still leaves the world when it misses everything — the cull path is intact', () => {
    let shots = [boltAtSpeed(800)];
    for (let i = 0; i < 40 && shots.length > 0; i += 1) {
      shots = stepProjectiles(shots, BOUNDS.widthPx, BOUNDS.heightPx, []);
    }
    expect(shots.length, 'a bolt that hit nothing never left the world').toBe(0);
  });
});

/**
 * The draw-path half, and it was **not** optional.
 *
 * With the nine tests above green, dropping `world.solids` from `stepProjectiles`'s call in
 * `enemyTurn.ts` left the whole suite at **`PASS (2239) FAIL (0)`** — the feature disconnected, every
 * gate happy. That is CLAUDE.md §2's defect verbatim: *"a decision function with no consumer is the
 * same defect as a burst of zero particles — it satisfies every assertion about itself and draws
 * nothing."*
 *
 * So this drives a bolt through the **real** `tick()`, where the solids come from the world rather
 * than from an argument a test supplied.
 */
describe('the wall stop is actually WIRED into the tick (CLAUDE.md §2)', () => {
  const SCALE = 6;
  const FLOOR: Rect[] = [
    { x: -2000, y: 2000, w: 20000, h: 400 },
    // The wall the bolt must stop at, tall enough that a bolt on the player's line meets it.
    { x: 1600, y: 0, w: 200, h: 2000 },
  ];

  function worldWithBolt() {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: { widthPx: 20000, heightPx: 4000 },
      spawn: { x: 400, y: 2000 },
    });
    // Fired from beyond the wall, back toward the player, fast enough to reach it in a few ticks.
    world.projectiles.push(fireProjectile(2600, 1900, 400, 1900, 120, 9));
    return world;
  }

  it('the premise: the bolt is in flight and the wall is between it and the player', () => {
    const world = worldWithBolt();
    expect(world.projectiles.length).toBe(1);
    expect(world.solids.length, 'the world has no solids, so nothing here tests a wall').toBe(2);
    expect(world.player.x).toBeLessThan(1600);
  });

  it('a bolt fired from beyond a wall never reaches the player', () => {
    const world = worldWithBolt();
    const hpBefore = world.player.hp;

    for (let i = 0; i < 60; i += 1) {
      tick(world, createSnapshot());
    }

    expect(
      world.player.hp,
      'the bolt passed through a wall and hit the player — `world.solids` is not reaching ' +
        '`stepProjectiles`, so the clip is dead code',
    ).toBe(hpBefore);
  });

  it('and the same bolt DOES hit when the wall is taken away', () => {
    // The counter-fixture. Without it, "the player was not hit" would pass on a bolt that was never
    // fired, aimed wrong, or culled at the world edge — three ways to be green for no reason.
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: [{ x: -2000, y: 2000, w: 20000, h: 400 }],
      bounds: { widthPx: 20000, heightPx: 4000 },
      spawn: { x: 400, y: 2000 },
    });
    world.projectiles.push(fireProjectile(2600, 1900, 400, 1900, 120, 9));
    const hpBefore = world.player.hp;

    for (let i = 0; i < 60; i += 1) {
      tick(world, createSnapshot());
    }

    expect(world.player.hp, 'the bolt never reached the player even with no wall').toBeLessThan(
      hpBefore,
    );
  });
});
