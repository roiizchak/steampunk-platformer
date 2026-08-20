/**
 * Hit-stop — Phase 9's per-body freeze, asserted against the tick contract rather than around it.
 *
 * On a confirmed melee hit both bodies stop for an integer number of ticks while the rest of the
 * world keeps running. That is two claims, and only the second is easy to test: "the world keeps
 * ticking" is visible in `tickCount`, while "this body is frozen" is invisible in any fixture whose
 * body was not moving in the first place — see `hitstop-fixtures.ts` for how both fixtures here
 * carry real motion into the blow, and why they have to.
 *
 * This file is **the freeze**: its lengths, both endpoints, both directions, what keeps running
 * beside it, and the two damage sources that deliberately arm nothing. Its sibling
 * `hitstop-interactions.test.ts` is **the interactions** — step 4b's frozen counters, the swing
 * identity and the knockback exemption — which is where every dangerous defect in this feature
 * actually lives. Split at that seam when this file crossed the 400-line rule, not at a line count.
 *
 * Expectations are derived from the live knobs and bracketed at BOTH endpoints *(vault 2.8)* —
 * offset `N` frozen, offset `N + 1` moving — the shape `coyote-time.test.ts` uses for the same
 * reason.
 */

import { describe, expect, it } from 'vitest';

import { PLAYER_MAX_HP } from '../../src/sim/combat';
import { HITSTOP_TICKS, freezePair, frozen } from '../../src/sim/hitstop';
import { PLAYER_ATTACK_DAMAGE } from '../../src/sim/playerAttack';
import { HAZARD_DAMAGE } from '../../src/sim/hazards';
import { fireProjectile } from '../../src/sim/projectiles';
import { createSnapshot } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';
import { BOUNDS, FLOOR, IDLE, SCALE, clawedWhileIdle, strikeWhileRunning } from './hitstop-fixtures';

describe('the freeze lengths themselves', () => {
  it('pins the three literals, so a retune is a visible edit and not a silent one', () => {
    expect(HITSTOP_TICKS.light).toBe(4);
    expect(HITSTOP_TICKS.lethal).toBe(9);
    expect(HITSTOP_TICKS.playerHurt).toBe(6);
  });

  it('is a deadline, not a counter: N ticks are frozen and the (N+1)th is not', () => {
    const a = { hitstopUntil: -1, lastHitTick: -1 };
    const b = { hitstopUntil: -1, lastHitTick: -1 };
    freezePair(a, b, 'light', 100);
    for (const body of [a, b]) {
      expect(body.hitstopUntil).toBe(100 + HITSTOP_TICKS.light);
      expect(body.lastHitTick).toBe(100);
      expect(frozen(body, 100 + HITSTOP_TICKS.light)).toBe(true);
      expect(frozen(body, 100 + HITSTOP_TICKS.light + 1)).toBe(false);
    }
  });

  it('re-arming with a SHORTER class does not cut a longer freeze short', () => {
    const a = { hitstopUntil: -1, lastHitTick: -1 };
    const b = { hitstopUntil: -1, lastHitTick: -1 };
    freezePair(a, b, 'lethal', 100);
    // Three ticks into a 9-tick freeze, a light hit lands. `100 + 4` is BEFORE `100 + 9`.
    freezePair(a, b, 'light', 103);
    expect(a.hitstopUntil, 'a light hit shortened a lethal freeze').toBe(100 + HITSTOP_TICKS.lethal);
    expect(a.lastHitTick, 'the impact class was rewritten by the shorter hit').toBe(100);
    expect(b.hitstopUntil).toBe(100 + HITSTOP_TICKS.lethal);

    // And a LONGER class arriving later does extend it — without this the guard could be `never`.
    freezePair(a, b, 'lethal', 105);
    expect(a.hitstopUntil).toBe(105 + HITSTOP_TICKS.lethal);
  });
});

describe('the player→enemy freeze, driven at a run', () => {
  it('freezes both bodies for exactly HITSTOP_TICKS.light, starting the tick after the hit', () => {
    const { world, input, target, hitTick } = strikeWhileRunning();
    const player = world.player;

    expect(Math.abs(player.vx), 'fixture is vacuous unless the player is moving').toBeGreaterThan(0);
    const x0 = player.x;
    const vx0 = player.vx;
    const enemyX0 = target.x;

    for (let n = 1; n <= HITSTOP_TICKS.light; n += 1) {
      tick(world, input);
      expect(world.tickCount, 'the world stopped ticking with the bodies').toBe(hitTick + 1 + n);
      expect(player.x, `the player moved on frozen tick ${n}`).toBe(x0);
      expect(player.vx, `velocity was decayed on frozen tick ${n}`).toBe(vx0);
      expect(target.x, `the struck enemy moved on frozen tick ${n}`).toBe(enemyX0);
    }

    tick(world, input);
    expect(player.x, 'the player never resumed after the window closed').not.toBe(x0);
    expect(target.x, 'the enemy never resumed — or it was never patrolling, and the loop above proved nothing').not.toBe(enemyX0);
  });

  it('holds velocity rather than zeroing it: the body resumes with what it had', () => {
    const { world, input, hitTick } = strikeWhileRunning();
    const vx0 = world.player.vx;
    expect(vx0).toBeGreaterThan(0);
    for (let n = 1; n <= HITSTOP_TICKS.light; n += 1) {
      tick(world, input);
    }
    expect(world.player.vx, 'the freeze zeroed the impulse instead of holding it').toBe(vx0);
    expect(world.tickCount).toBe(hitTick + 1 + HITSTOP_TICKS.light);
  });

  it('a lethal blow freezes for HITSTOP_TICKS.lethal, and a survivable one for light', () => {
    const light = strikeWhileRunning();
    expect(light.target.hp, 'the target died, so this is not the light case').toBeGreaterThan(0);
    expect(light.target.hitstopUntil).toBe(light.hitTick + HITSTOP_TICKS.light);
    expect(light.world.player.hitstopUntil).toBe(light.hitTick + HITSTOP_TICKS.light);

    const kill = strikeWhileRunning({ targetHp: PLAYER_ATTACK_DAMAGE });
    expect(kill.target.hp, 'the blow was not lethal, so this measures the light class again').toBe(0);
    expect(kill.target.hitstopUntil).toBe(kill.hitTick + HITSTOP_TICKS.lethal);
    expect(kill.world.player.hitstopUntil).toBe(kill.hitTick + HITSTOP_TICKS.lethal);

    // Both endpoints, walked — a length assertion on the field alone cannot see an ungated step 8.
    const x0 = kill.world.player.x;
    for (let n = 1; n <= HITSTOP_TICKS.lethal; n += 1) {
      tick(kill.world, kill.input);
      expect(kill.world.player.x, `the killer moved on frozen tick ${n}`).toBe(x0);
    }
    tick(kill.world, kill.input);
    expect(kill.world.player.x, 'the killer never resumed').not.toBe(x0);
  });
});

describe('the rest of the world keeps ticking while two bodies do not', () => {
  it('tickCount rises, the seeded roll changes, another enemy walks and a bolt flies', () => {
    const { world, input, target, hitTick } = strikeWhileRunning({ extra: [{ x: 900, span: 400 }] });
    const bystander = world.enemies.scavengers[1]!;
    expect(bystander).not.toBe(target);

    // A bolt already in flight, aimed at nothing — `stepProjectiles` is a world-level array update
    // and must not stop because a sentry (or anything else) is frozen.
    // `stepProjectiles` rebuilds the array each tick, so the bolt is re-read rather than held.
    world.projectiles.push(fireProjectile(500, 500, 500, 20000, 12, 5));

    let previousRoll = world.tickRoll;
    for (let n = 1; n <= HITSTOP_TICKS.light; n += 1) {
      const bystanderX = bystander.x;
      const boltY = world.projectiles[0]!.y;
      tick(world, input);
      expect(world.tickCount).toBe(hitTick + 1 + n);
      expect(world.tickRoll, 'the seeded stream stopped advancing (vault 2.3)').not.toBe(previousRoll);
      expect(bystander.x, 'an unhit enemy froze too').not.toBe(bystanderX);
      expect(world.projectiles[0]!.y, 'a bolt in flight stopped with the bodies').not.toBe(boltY);
      previousRoll = world.tickRoll;
    }
  });
});

describe('the enemy→player freeze', () => {
  it('freezes the player for HITSTOP_TICKS.playerHurt and the clawing scavenger with it', () => {
    const { world, scavenger, hitTick } = clawedWhileIdle();
    const player = world.player;

    // The knockback impulse landed at the same 9b — that is the motion this freeze has to hold.
    expect(Math.abs(player.vx), 'no impulse landed, so a frozen body is indistinguishable').toBeGreaterThan(0);
    const x0 = player.x;
    const vx0 = player.vx;
    const clawCounter = scavenger.attackCounter;

    for (let n = 1; n <= HITSTOP_TICKS.playerHurt; n += 1) {
      tick(world, { ...IDLE });
      expect(world.tickCount).toBe(hitTick + 1 + n);
      expect(player.x, `the player moved on frozen tick ${n}`).toBe(x0);
      expect(player.vx, `the impulse decayed on frozen tick ${n}`).toBe(vx0);
      expect(scavenger.attackCounter, `the clawing scavenger's own step ran on frozen tick ${n}`).toBe(clawCounter);
    }

    tick(world, { ...IDLE });
    expect(player.x, 'the player never resumed').not.toBe(x0);
    expect(scavenger.attackCounter, "the scavenger's swing never resumed").toBe(clawCounter + 1);
  });

});

describe('damage with no attacker body freezes nothing', () => {
  it('a hazard hurts without arming a freeze', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: BOUNDS,
      spawn: { x: 1000, y: 960 },
      hazards: [{ x: 1200, y: 900, w: 400, h: 120 }],
    });
    const input = createSnapshot();
    input.right = true;
    for (let i = 0; i < 400 && world.player.hp === PLAYER_MAX_HP; i += 1) {
      tick(world, input);
    }
    expect(world.player.hp, 'the hazard never landed').toBe(PLAYER_MAX_HP - HAZARD_DAMAGE);
    expect(world.player.hitstopUntil, 'a hazard armed a freeze').toBe(-1);
    expect(frozen(world.player, world.tickCount)).toBe(false);
  });

  it('a projectile hurts without arming a freeze', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: BOUNDS,
      spawn: { x: 1000, y: 960 },
    });
    const chestY = world.player.y - 120;
    world.projectiles.push(fireProjectile(1600, chestY, 1000, chestY, 12, 9));

    for (let i = 0; i < 400 && world.player.hp === PLAYER_MAX_HP; i += 1) {
      tick(world, { ...IDLE });
    }
    expect(world.player.hp, 'the bolt never landed').toBe(PLAYER_MAX_HP - 9);
    expect(world.player.hitstopUntil, 'a projectile armed a freeze').toBe(-1);
  });
});
