/**
 * The world can hurt you — criterion 5.15, end to end through `tick()`.
 *
 * `hazards.test.ts` proves the swept maths in isolation and `level-entities.test.ts` proves the
 * geometry reaches `LevelData`. Neither can see whether the tick loop actually CALLS any of it, and
 * that gap is the whole Phase 4 lesson: the spikes existed, were drawn, were in the file, and did
 * nothing. So every assertion here drives the real `tick()` with real input snapshots.
 *
 * ## The tunnelling case is the one that matters
 *
 * A point sample at `maxFallSpeed` 51.6 px/tick steps clean over a 40 px hazard. The test below
 * does not merely assert "hp dropped" — it records the player's feet on **every** tick and asserts
 * that not one of them was ever inside the hazard band, while the damage still landed. A swept test
 * that had silently degraded to a point test cannot pass both halves.
 */

import { describe, expect, it } from 'vitest';

import { HAZARD_DAMAGE } from '../../src/sim/hazards';
import { HURT_LOCK_TICKS, IFRAME_TICKS, PLAYER_MAX_HP } from '../../src/sim/combat';
import { KNOCKBACK_SPEED } from '../../src/sim/worldDamage';
import { SCAVENGER, SENTRY } from '../../src/sim/enemies';
import { createSnapshot } from '../../src/sim/input';
import { DEFAULT_TUNING, PLAYER_BOX } from '../../src/sim/player';
import { createWorld, tick } from '../../src/sim/tick';
import type { Rect, World } from '../../src/sim/types';

const SCALE = 6;
const HALF_WIDTH = (PLAYER_BOX.w / 2) * SCALE;

/** A wide floor, so nothing but the thing under test moves the player. */
const FLOOR: Rect[] = [{ x: 0, y: 960, w: 4000, h: 120 }];
const BOUNDS = { widthPx: 4000, heightPx: 1080 };

function worldWith(overrides: Partial<Parameters<typeof createWorld>[0]> = {}): World {
  return createWorld({
    seed: 1,
    scale: SCALE,
    solids: FLOOR,
    spawn: { x: 500, y: 960 },
    bounds: BOUNDS,
    ...overrides,
  });
}

const IDLE = createSnapshot();
const LEFT = { ...createSnapshot(), left: true };

describe('the three solid edges are wired into the tick, not merely defined', () => {
  it('a player walking left stops at the edge instead of integrating forever', () => {
    const world = worldWith({ spawn: { x: 200, y: 960 } });

    for (let i = 0; i < 200; i += 1) {
      tick(world, { ...LEFT });
    }

    expect(world.player.x).toBe(HALF_WIDTH);
    // The velocity too. A player pinned at the wall with a live negative vx fights every other
    // force and re-triggers the clamp every tick — right position, wrong physics underneath.
    expect(world.player.vx).toBe(0);
  });

  it('leaves a player in open ground completely alone', () => {
    const world = worldWith({ spawn: { x: 2000, y: 960 } });
    tick(world, { ...LEFT });
    expect(world.player.x).toBeLessThan(2000);
    expect(world.player.x).toBeGreaterThan(HALF_WIDTH);
  });
});

describe('the kill plane', () => {
  it('kills on the tick the feet pass the world floor, and not before', () => {
    // No solids at all: the player falls out of a world whose floor is `heightPx`.
    const world = worldWith({ solids: [], spawn: { x: 500, y: 0 } });

    let deathTick: number | null = null;
    let feetAtDeath = 0;
    for (let i = 0; i < 400 && deathTick === null; i += 1) {
      tick(world, { ...IDLE });
      if (world.player.state === 'death') {
        deathTick = world.tickCount;
        feetAtDeath = world.player.y;
      }
    }

    expect(deathTick).not.toBeNull();
    expect(world.player.hp).toBe(0);
    // The tick it CROSSED, not one after: the previous tick's feet were still inside the world.
    expect(feetAtDeath).toBeGreaterThan(BOUNDS.heightPx);
    expect(feetAtDeath - DEFAULT_TUNING.maxFallSpeed).toBeLessThanOrEqual(BOUNDS.heightPx);
  });

  it('does not fire for a player standing on a floor at the very bottom of the world', () => {
    const world = worldWith();
    for (let i = 0; i < 60; i += 1) {
      tick(world, { ...IDLE });
    }
    expect(world.player.hp).toBe(PLAYER_MAX_HP);
    expect(world.player.state).not.toBe('death');
  });
});

describe('hazards hurt through the tick loop (criterion 5.15)', () => {
  it('a player who walks into one takes damage and enters hurt', () => {
    const world = worldWith({ hazards: [{ x: 300, y: 900, w: 100, h: 100 }] });

    for (let i = 0; i < 60 && world.player.hp === PLAYER_MAX_HP; i += 1) {
      tick(world, { ...LEFT });
    }

    expect(world.player.hp).toBe(PLAYER_MAX_HP - HAZARD_DAMAGE);
    expect(world.player.state).toBe('hurt');
  });

  /**
   * The tunnelling case, through the real loop. See this file's header.
   */
  it('registers a hazard thinner than one tick of travel at max fall speed', () => {
    // The band is DERIVED from the real trajectory, not guessed. A hand-picked y is a coin flip:
    // the first version of this test put the hazard where a tick happened to land inside it, which
    // makes the whole point of the assertion evaporate without the test looking any different.
    const trace: number[] = [];
    const probe = worldWith({ solids: [], spawn: { x: 500, y: 0 } });
    for (let i = 0; i < 60; i += 1) {
      tick(probe, { ...IDLE });
      trace.push(probe.player.y);
    }
    const gapAt = trace.findIndex(
      (y, i) => i > 0 && y - trace[i - 1]! > 42 && y < BOUNDS.heightPx,
    );
    expect(gapAt, 'no tick step exceeded 42px — the fixture cannot express tunnelling').toBeGreaterThan(0);

    // Strictly between two consecutive sampled positions, so neither endpoint is inside it.
    const thin: Rect = { x: 0, y: trace[gapAt - 1]! + 1, w: 4000, h: 40 };
    expect(thin.y + thin.h).toBeLessThan(trace[gapAt]!);

    const world = worldWith({ solids: [], spawn: { x: 500, y: 0 }, hazards: [thin] });

    const sampledInside: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      tick(world, { ...IDLE });
      const feet = world.player.y;
      if (feet >= thin.y && feet <= thin.y + thin.h) {
        sampledInside.push(feet);
      }
      if (feet > thin.y + thin.h) {
        break;
      }
    }

    // Half one: no tick ever landed inside the band, so a point test had nothing to find.
    expect(sampledInside).toEqual([]);
    // Half two: it hurt anyway.
    expect(world.player.hp).toBe(PLAYER_MAX_HP - HAZARD_DAMAGE);
  });

  it('costs once per i-frame window, not once per tick standing in it', () => {
    const world = worldWith({ hazards: [{ x: 0, y: 900, w: 4000, h: 200 }] });

    // Standing still, inside the hazard from tick one, for less than one i-frame window.
    for (let i = 0; i < IFRAME_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }
    expect(world.player.hp).toBe(PLAYER_MAX_HP - HAZARD_DAMAGE);

    // Past the window, the next contact costs again — the window is a grace period, not immunity.
    // Exactly `IFRAME_TICKS` more, which spans the second hit and stops one tick short of a third:
    // the first version ran two ticks longer and caught three, which is a real property of the
    // cadence and not a bug, but it made the assertion say something it did not mean.
    for (let i = 0; i < IFRAME_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }
    expect(world.player.hp).toBe(PLAYER_MAX_HP - 2 * HAZARD_DAMAGE);
  });
});

describe('enemies are stepped by the tick', () => {
  const placements = [
    { slug: 'brass-sentry' as const, x: 3000, y: 960, patrolMin: 2950, patrolMax: 3050 },
    { slug: 'rust-scavenger' as const, x: 1500, y: 960, patrolMin: 1400, patrolMax: 1600 },
  ];

  it('createWorld builds one live entity per placement, by slug', () => {
    const world = worldWith({ enemies: placements });
    expect(world.enemies.sentries).toHaveLength(1);
    expect(world.enemies.scavengers).toHaveLength(1);
    expect(world.enemies.sentries[0]!.x).toBe(3000);
    expect(world.enemies.scavengers[0]!.patrolMax).toBe(1600);
  });

  it('the patroller actually moves — a world that never steps its enemies looks identical', () => {
    const world = worldWith({ enemies: placements });
    const startX = world.enemies.scavengers[0]!.x;

    for (let i = 0; i < 30; i += 1) {
      tick(world, { ...IDLE });
    }

    expect(world.enemies.scavengers[0]!.x).not.toBe(startX);
  });

  it('the sentry counts down its cooldown even with nobody in range', () => {
    const world = worldWith({ enemies: placements, spawn: { x: 100, y: 960 } });
    const sentry = world.enemies.sentries[0]!;
    // It starts READY (counter at the knob) so the first player into range is shot at rather than
    // granted a free cooldown — so "ready and staying ready" is the assertion out of range.
    expect(sentry.cooldownCounter).toBe(sentry.cooldown);

    for (let i = 0; i < 30; i += 1) {
      tick(world, { ...IDLE });
    }
    expect(sentry.cooldownCounter).toBe(sentry.cooldown);
  });
});

/**
 * The two ways an enemy hurts you.
 *
 * Both are asserted through `tick()` and both assert the NEGATIVE control as well as the positive
 * one — "the player standing in range lost hp" is also true of a world that damages everyone
 * everywhere, which is the shape a mis-scoped hazard check takes.
 */
describe('enemies damage the player', () => {
  it('the sentry fires only inside its radius, and the shot travels (criterion 5.1)', () => {
    const sentry = { slug: 'brass-sentry' as const, x: 3000, y: 960, patrolMin: 2990, patrolMax: 3010 };

    // Negative control FIRST: far outside the 640px radius, nothing is ever spawned.
    const far = worldWith({ enemies: [sentry], spawn: { x: 200, y: 960 } });
    for (let i = 0; i < 120; i += 1) {
      tick(far, { ...IDLE });
    }
    expect(far.projectiles).toEqual([]);
    expect(far.player.hp).toBe(PLAYER_MAX_HP);

    // Positive control: inside the radius, a shot exists and MOVES toward the player.
    const near = worldWith({ enemies: [sentry], spawn: { x: 2600, y: 960 } });
    tick(near, { ...IDLE });
    expect(near.projectiles).toHaveLength(1);
    const firstX = near.projectiles[0]!.x;
    tick(near, { ...IDLE });
    expect(near.projectiles[0]!.x).toBeLessThan(firstX); // aimed left, at the player
  });

  it('a shot that reaches the player costs hp and is consumed', () => {
    const world = worldWith({
      enemies: [{ slug: 'brass-sentry' as const, x: 3000, y: 960, patrolMin: 2990, patrolMax: 3010 }],
      spawn: { x: 2600, y: 960 },
    });

    for (let i = 0; i < 120 && world.player.hp === PLAYER_MAX_HP; i += 1) {
      tick(world, { ...IDLE });
    }

    expect(world.player.hp).toBe(PLAYER_MAX_HP - SENTRY.damage);
    // Consumed on impact. A shot that keeps flying re-hits the moment i-frames lapse, which reads
    // as one bullet doing damage twice.
    expect(world.projectiles).toHaveLength(0);
  });

  it('the scavenger costs hp on contact and nothing at a distance (criterion 5.10)', () => {
    const placement = {
      slug: 'rust-scavenger' as const,
      x: 700,
      y: 960,
      patrolMin: 600,
      patrolMax: 800,
    };

    const apart = worldWith({ enemies: [placement], spawn: { x: 3500, y: 960 } });
    for (let i = 0; i < 120; i += 1) {
      tick(apart, { ...IDLE });
    }
    expect(apart.player.hp).toBe(PLAYER_MAX_HP);

    const touching = worldWith({ enemies: [placement], spawn: { x: 700, y: 960 } });
    tick(touching, { ...IDLE });
    expect(touching.player.hp).toBe(PLAYER_MAX_HP - SCAVENGER.damage);
  });

  /**
   * Vault 5.8 — a damage comparison needs two DIFFERENT entities and a named invariant, not two
   * numbers that merely differ. The invariant: at equal exposure the scavenger's contact costs more
   * than one sentry shot, so contact is the thing you retreat from and the turret is the thing you
   * walk past.
   */
  it('the two enemies do different damage, and the contact one hurts more', () => {
    expect(SCAVENGER.damage).toBeGreaterThan(SENTRY.damage);
  });
});

/**
 * Knockback — the impulse Phase 5's scope named and Phase 5 never built.
 *
 * `tick.ts:245` and `combat.ts:15` placed step 4 before integration *specifically* so knockback
 * would reach the same tick's movement, and then nothing ever wrote `player.vx` on a hit. The seam
 * sat empty for a whole phase and no criterion asked.
 *
 * ## Every assertion here is DISPLACEMENT, never the sign of `vx`
 *
 * Damage lands at step 9b, so friction runs *before* integration on the following tick. Ground
 * friction is 3.69 against a 5.54 impulse, which leaves **1.85 px** — a knockback that satisfies
 * `expect(vx).toBeGreaterThan(0)` while moving the player about two pixels is the same failure
 * shape as vault 4.22: correct in the sim, invisible on screen. So these tests measure where the
 * body actually ended up (Codex plan review 8, finding 4).
 *
 * ## One test per damage source, because three tests can share one path
 *
 * Codex's finding 3 was that "covers all three sources" is easy to claim and easy to get wrong.
 * Projectile, contact and hazard each get their own named test below.
 */
describe('knockback (Phase 5 scope, step 9b)', () => {
  /** Park a scavenger on the player so contact lands on tick one, from a known side. */
  function contactWorld(enemyX: number, spawnX: number): World {
    return worldWith({
      enemies: [
        { slug: 'rust-scavenger' as const, x: enemyX, y: 960, patrolMin: enemyX, patrolMax: enemyX },
      ],
      spawn: { x: spawnX, y: 960 },
    });
  }

  it('a contact hit from the LEFT shoves the player right, measured as displacement', () => {
    const world = contactWorld(700, 706);
    const before = world.player.x;

    tick(world, { ...IDLE });
    expect(world.player.hp).toBe(PLAYER_MAX_HP - SCAVENGER.damage);
    for (let i = 0; i < HURT_LOCK_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }

    expect(world.player.x).toBeGreaterThan(before);
  });

  it('a contact hit from the RIGHT shoves the player left', () => {
    const world = contactWorld(700, 694);
    const before = world.player.x;

    tick(world, { ...IDLE });
    expect(world.player.hp).toBe(PLAYER_MAX_HP - SCAVENGER.damage);
    for (let i = 0; i < HURT_LOCK_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }

    expect(world.player.x).toBeLessThan(before);
  });

  /**
   * The grounded number is the one worth writing down: **1.85 px**, one tick of
   * `KNOCKBACK_SPEED - groundFriction` and then nothing. Pinned exactly, because the whole reason
   * this test exists is that a sign assertion would have called it a success.
   */
  it('grounded displacement is one tick of impulse minus ground friction, and that is all', () => {
    const world = contactWorld(700, 706);
    const before = world.player.x;

    tick(world, { ...IDLE });
    for (let i = 0; i < HURT_LOCK_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }

    const moved = world.player.x - before;
    expect(moved).toBeCloseTo(KNOCKBACK_SPEED - DEFAULT_TUNING.groundFriction, 5);
    // Two pixels. Recorded so nobody later reads "knockback ships" as "knockback is visible".
    expect(moved).toBeLessThan(2);
  });

  /**
   * Airborne is a different animal — air friction is 0.51 against ground's 3.69, so the impulse
   * survives the whole lock window instead of dying in tick one. The gap is what makes a single
   * "does knockback work" test meaningless.
   */
  it('airborne displacement is an order of magnitude larger than grounded', () => {
    // 🔴 The obvious fixture — take the grounded one and raise ONLY the player — silently tests
    // nothing: it lifts them clear of the scavenger, `overlapsScavenger` returns false, no contact
    // happens, and zero displacement reads as a clean refutation. Both entities are raised
    // together, 560 px above the floor, so contact still lands on tick one and the fall cannot
    // reach the ground inside the lock window.
    const world = worldWith({
      enemies: [
        { slug: 'rust-scavenger' as const, x: 700, y: 400, patrolMin: 700, patrolMax: 700 },
      ],
      spawn: { x: 706, y: 400 },
    });
    const before = world.player.x;

    tick(world, { ...IDLE });
    // The fixture reached the state it is meant to test — assert that, do not assume it.
    expect(world.player.hp).toBe(PLAYER_MAX_HP - SCAVENGER.damage);
    expect(world.player.grounded).toBe(false);

    for (let i = 0; i < HURT_LOCK_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }

    const moved = world.player.x - before;
    // Air friction 0.51 against ground's 3.69, so the impulse survives the whole window instead of
    // dying in tick one. The gap is why "does knockback work" is not one question.
    expect(moved).toBeGreaterThan(KNOCKBACK_SPEED - DEFAULT_TUNING.groundFriction);
  });

  it('a PROJECTILE hit shoves the player away from the shot', () => {
    const world = worldWith({
      enemies: [
        { slug: 'brass-sentry' as const, x: 3000, y: 960, patrolMin: 2990, patrolMax: 3010 },
      ],
      spawn: { x: 2600, y: 960 },
    });

    for (let i = 0; i < 120 && world.player.hp === PLAYER_MAX_HP; i += 1) {
      tick(world, { ...IDLE });
    }
    expect(world.player.hp).toBe(PLAYER_MAX_HP - SENTRY.damage);

    const atImpact = world.player.x;
    tick(world, { ...IDLE });
    // The sentry is to the RIGHT at x=3000, so the shove is leftward, away from it.
    expect(world.player.x).toBeLessThan(atImpact);
  });

  /**
   * Hazards are EXEMPT, and that is a decision rather than an omission — `hazardHit` returns the
   * swept rectangle, not an origin, so there is no "the hazard is over there" to shove away from.
   * The reasoning lives in `worldDamage.ts`; this test is what stops someone adding a direction
   * later without re-reading it.
   */
  it('a HAZARD hit costs hp and deliberately does not shove', () => {
    // Same geometry as the walk-into-a-hazard test above, which is known to actually connect.
    const world = worldWith({ hazards: [{ x: 300, y: 900, w: 100, h: 100 }] });

    for (let i = 0; i < 60 && world.player.hp === PLAYER_MAX_HP; i += 1) {
      tick(world, { ...LEFT });
    }
    expect(world.player.hp).toBe(PLAYER_MAX_HP - HAZARD_DAMAGE);

    // A shove would have REVERSED vx away from the hazard, to the right. Walking LEFT into it, vx
    // must still be negative on the impact tick — that is the assertion a knockback would break.
    expect(world.player.vx).toBeLessThan(0);

    // And it must keep travelling left afterwards rather than being pushed back out. Movement is
    // locked for HURT_LOCK_TICKS, so sample past the lock where input is honoured again.
    const atImpact = world.player.x;
    for (let i = 0; i < HURT_LOCK_TICKS + 2; i += 1) {
      tick(world, { ...LEFT });
    }
    expect(world.player.x).toBeLessThan(atImpact);
  });

  it('a LETHAL hit produces zero displacement — no shove on a corpse', () => {
    const world = contactWorld(700, 706);
    world.player.hp = SCAVENGER.damage;
    const before = world.player.x;

    tick(world, { ...IDLE });
    expect(world.player.hp).toBe(0);
    for (let i = 0; i < HURT_LOCK_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }

    expect(world.player.x).toBe(before);
  });

  /**
   * A hit REFUSED during i-frames must not shove either. `damagePlayer` returns a boolean because
   * refusal is a normal outcome, and dropping that half of the guard turns knockback into a free
   * repositioning tool: stand in a scavenger and get shoved every tick while taking damage once.
   */
  it('a hit refused during i-frames produces zero displacement', () => {
    const world = contactWorld(700, 706);

    tick(world, { ...IDLE });
    const hpAfterFirst = world.player.hp;
    expect(hpAfterFirst).toBe(PLAYER_MAX_HP - SCAVENGER.damage);

    // Let the shove settle, then measure only the ticks where contact is still happening but every
    // hit is being refused by the i-frame window.
    for (let i = 0; i < HURT_LOCK_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }
    const settled = world.player.x;

    for (let i = 0; i < IFRAME_TICKS - HURT_LOCK_TICKS - 2; i += 1) {
      tick(world, { ...IDLE });
    }

    expect(world.player.hp).toBe(hpAfterFirst);
    expect(world.player.x).toBe(settled);
  });
});

/**
 * The turret must be able to hit a player it is not level with.
 *
 * This exists because the first implementation fired on **x alone**, and `level-01` puts the sentry
 * on a ledge four tiles above the ground — so every shot sailed over a grounded player's head,
 * forever. Every test in the block above still passed: a projectile spawned, it moved, it was
 * aimed the right way along x. "Did a shot exist" is not "could it ever connect".
 */
describe('the sentry can hit a player it is not level with', () => {
  it('a shot from a ledge reaches a player standing on the ground below', () => {
    const world = worldWith({
      // Sentry feet 384px (4 tiles) above the floor the player stands on — the level-01 geometry.
      enemies: [{ slug: 'brass-sentry' as const, x: 1100, y: 576, patrolMin: 1090, patrolMax: 1110 }],
      spawn: { x: 900, y: 960 },
    });

    for (let i = 0; i < 200 && world.player.hp === PLAYER_MAX_HP; i += 1) {
      tick(world, { ...IDLE });
    }

    expect(world.player.hp).toBe(PLAYER_MAX_HP - SENTRY.damage);
  });

  it('the shot descends — a purely horizontal velocity is the defect, pinned', () => {
    const world = worldWith({
      enemies: [{ slug: 'brass-sentry' as const, x: 1100, y: 576, patrolMin: 1090, patrolMax: 1110 }],
      spawn: { x: 900, y: 960 },
    });
    tick(world, { ...IDLE });

    const shot = world.projectiles[0]!;
    expect(shot.vy).toBeGreaterThan(0); // downward, toward the player below
    expect(shot.vx).toBeLessThan(0); // leftward, toward the player behind
    // Speed is the knob, not an accident of the components.
    expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(SENTRY.projectileSpeed, 6);
  });
});
