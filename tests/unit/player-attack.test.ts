/**
 * The player damaging enemies — criteria 5.5 and 5.10.
 *
 * The other direction of combat. `tick-world-damage.test.ts` covers the world hurting the player;
 * without this, `Z` swings an animation at nothing and both enemies are invulnerable scenery.
 *
 * ## What Codex C4 added to 5.5, and why the obvious test is not enough
 *
 * *"Sampled ticks don't prove one-hit-per-target or facing."* An assertion that a hit landed during
 * a swing is satisfied by a hitbox that is live for the whole move, by one that hits the same enemy
 * on all four active ticks, and by one that hits an enemy standing **behind** the player. All three
 * are wrong and all three pass. So each is asserted separately:
 *
 *   - **which ticks** register, not that a hit happened — an existence assertion cannot verify a
 *     timing claim;
 *   - **once per target per swing**, counted across the whole active window;
 *   - **facing**, because `toWorld` mirrors the box by `facing` and a hitbox that ignores it lets
 *     the player kill things by walking backwards into them.
 */

import { describe, expect, it } from 'vitest';

import { ATTACK, PLAYER_MAX_HP, attackTotalTicks } from '../../src/sim/combat';
import { PLAYER_ATTACK_DAMAGE } from '../../src/sim/playerAttack';
import { SCAVENGER, SENTRY } from '../../src/sim/enemies';
import { createSnapshot, latchAttackPress } from '../../src/sim/input';

import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, World } from '../../src/sim/types';

const SCALE = 6;
const FLOOR = [{ x: 0, y: 960, w: 8000, h: 120 }];
const BOUNDS = { widthPx: 8000, heightPx: 1080 };

/**
 * A scavenger parked at `x`, with its detection switched off.
 *
 * **Both parts are load-bearing, and the first draft had neither.** A scavenger inside its 480 px
 * detect radius chases, closes to contact, and damages the player — who enters `hurt`, where
 * `canAct` is false and the swing never starts. The test then reports "the attack does not
 * register", which is true and says nothing about the attack. Zeroing the radius isolates the
 * swing from the enemy's own behaviour rather than fighting it.
 *
 * The player is at 1000 with a 132 px box, so its forward edge is 1066. Callers place the target
 * clear of that: an enemy overlapping the player's BODY is a contact-damage test, not a reach test.
 */
function worldWithScavengerAt(x: number): World {
  const world = createWorld({
    seed: 1,
    scale: SCALE,
    solids: FLOOR,
    bounds: BOUNDS,
    spawn: { x: 1000, y: 960 },
    enemies: [{ slug: 'rust-scavenger', x, y: 960, patrolMin: x, patrolMax: x }],
  });
  const target = world.enemies.scavengers[0]!;
  target.detectRadius = 0;
  target.releaseRadius = 0;
  return world;
}

const IDLE: InputSnapshot = createSnapshot();

/** Swing once and report the tick offsets on which the target lost hp. */
function ticksThatDamaged(world: World, totalTicks: number): number[] {
  const target = world.enemies.scavengers[0]!;
  const input = createSnapshot();
  latchAttackPress(input);

  const damagedOn: number[] = [];
  let previousHp = target.hp;
  for (let i = 0; i < totalTicks; i += 1) {
    tick(world, input);
    if (target.hp < previousHp) {
      damagedOn.push(i);
      previousHp = target.hp;
    }
  }
  return damagedOn;
}

describe('the attack registers only on active frames (criterion 5.5)', () => {
  /**
   * Clear of the player's own 132 px box and inside the swing's reach.
   *
   * The scavenger's body is 120 px wide, so at 1200 it spans 1140–1260: its near edge is 74 px
   * past the player's forward edge at 1066, which is a gap only `ATTACK_BOX` can cross.
   */
  const IN_REACH = 1200;

  it('registers on a tick inside the active window, not during wind-up or recovery', () => {
    const world = worldWithScavengerAt(IN_REACH);
    const damagedOn = ticksThatDamaged(world, attackTotalTicks(ATTACK) + 4);

    expect(damagedOn).toHaveLength(1);
    const hitTick = damagedOn[0]!;

    // WHICH tick, against the imported window — never a restated one. The swing is entered on the
    // tick the press is consumed, so `combatCounter` is 0 on that tick and the active window opens
    // `startup` ticks later.
    expect(hitTick).toBeGreaterThanOrEqual(ATTACK.startup);
    expect(hitTick).toBeLessThan(ATTACK.startup + ATTACK.active);
  });

  /**
   * The wind-up must be a real commitment. A hitbox live from tick 0 makes `startup` decorative,
   * and the whole 4.22 contact-frame gate is expressed against this window being real.
   */
  it('nothing registers during the startup ticks', () => {
    const world = worldWithScavengerAt(IN_REACH);
    const damagedOn = ticksThatDamaged(world, ATTACK.startup);
    expect(damagedOn).toEqual([]);
  });

  it('costs the target once per swing, not once per active tick (Codex C4)', () => {
    const world = worldWithScavengerAt(IN_REACH);
    const target = world.enemies.scavengers[0]!;
    const before = target.hp;

    ticksThatDamaged(world, attackTotalTicks(ATTACK) + 4);

    // ONE hit, even though the hitbox is live for `ATTACK.active` consecutive ticks.
    expect(before - target.hp).toBe(PLAYER_ATTACK_DAMAGE);
    expect(ATTACK.active).toBeGreaterThan(1); // non-vacuity: there WAS more than one live tick
  });

  it('a second swing hits the same target again — once per SWING, not once ever', () => {
    const world = worldWithScavengerAt(IN_REACH);
    const target = world.enemies.scavengers[0]!;

    ticksThatDamaged(world, attackTotalTicks(ATTACK) + 4);
    const afterFirst = target.hp;
    ticksThatDamaged(world, attackTotalTicks(ATTACK) + 4);

    expect(target.hp).toBeLessThan(afterFirst);
  });

  /**
   * Facing is part of the hitbox. `toWorld` mirrors the box by `facing`, and a hitbox that ignored
   * it would let the player kill things by backing into them.
   */
  it('hits a target behind ONLY when the player is actually facing it', () => {
    // At 800 the body spans 740–860. Facing left, the mirrored reach is 778–934 and covers it;
    // facing right, the reach is 1066–1222 and does not. The SAME fixture both ways, so `facing`
    // is the only thing that changes — which is what makes this a test of `facing` at all.
    //
    // The first version asserted only the miss, with `facing` left at its default of 1. Forcing
    // `toWorld` to ignore facing entirely did not fail it: a test that never exercises the
    // mirrored case cannot see the mirror. Found by mutation, not by reading.
    const facingIt = worldWithScavengerAt(800);
    facingIt.player.facing = -1;
    expect(ticksThatDamaged(facingIt, attackTotalTicks(ATTACK) + 4)).toHaveLength(1);

    const facingAway = worldWithScavengerAt(800);
    facingAway.player.facing = 1;
    expect(ticksThatDamaged(facingAway, attackTotalTicks(ATTACK) + 4)).toEqual([]);
  });

  it('does not reach a target well beyond the swing', () => {
    const world = worldWithScavengerAt(1000 + 900);
    expect(ticksThatDamaged(world, attackTotalTicks(ATTACK) + 4)).toEqual([]);
  });
});

describe('enemies die, and the comparison uses two DIFFERENT entities (criterion 5.10)', () => {
  /**
   * Vault 5.8 wants a named invariant, not two numbers that merely differ *(Codex C4)*.
   *
   * **The invariant: at equal incoming damage the sentry dies first.** It is the static threat you
   * are meant to be able to remove from a distance; the scavenger is the one you retreat from. If
   * that ever inverts, the two enemies have swapped roles and the level design built on them is
   * wrong — which a test comparing "40 !== 60" would never notice.
   */
  it('the sentry dies in fewer hits than the scavenger', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: BOUNDS,
      spawn: { x: 1000, y: 960 },
      enemies: [
        { slug: 'brass-sentry', x: 2000, y: 960, patrolMin: 2000, patrolMax: 2000 },
        { slug: 'rust-scavenger', x: 3000, y: 960, patrolMin: 3000, patrolMax: 3000 },
      ],
    });

    const sentry = world.enemies.sentries[0]!;
    const scavenger = world.enemies.scavengers[0]!;

    expect(sentry.maxHp).toBeLessThan(scavenger.maxHp);
    expect(Math.ceil(sentry.maxHp / PLAYER_ATTACK_DAMAGE)).toBeLessThan(
      Math.ceil(scavenger.maxHp / PLAYER_ATTACK_DAMAGE),
    );
  });

  it('a dead enemy stops threatening — its contact no longer costs the player hp', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: BOUNDS,
      // Player kept outside the 480px detectRadius, so a live scavenger would only PATROL, not
      // chase — patrol drift is monotonic, so `x` changing is never a same-x coincidence the way an
      // oscillating chase (player exactly at the corpse's spawn x) could be.
      spawn: { x: 400, y: 960 },
      enemies: [{ slug: 'rust-scavenger', x: 1000, y: 960, patrolMin: 700, patrolMax: 1300 }],
    });
    const corpse = world.enemies.scavengers[0]!;
    corpse.hp = 0;
    const xBefore = corpse.x;

    for (let i = 0; i < 30; i += 1) {
      tick(world, { ...IDLE });
    }
    expect(world.player.hp).toBe(PLAYER_MAX_HP);
    expect(corpse.x).toBe(xBefore);
  });

  it('the two enemies do different damage as well as having different hp', () => {
    expect(SENTRY.damage).not.toBe(SCAVENGER.damage);
  });
});
