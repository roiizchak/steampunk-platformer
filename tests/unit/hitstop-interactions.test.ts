/**
 * Hit-stop's INTERACTIONS with the combat state machine — the half of Phase 9 that can actually be
 * got wrong quietly.
 *
 * Split from `hitstop.test.ts` at the 400-line rule, and the seam is a subject rather than a count.
 * That file asks *does the body stop, and for how long*. This one asks the harder question:
 * **what happens to everything that was already counting.**
 *
 * Every dangerous defect in this feature is an *interaction*. A hit-stop fixture with no combat
 * state passes; a combat fixture with no freeze passes; the product is broken. So each of the three
 * things step 4b advances — `iFrameCounter`, `combatCounter` and the combat-state expiry test — is
 * walked here against a freeze in flight and asserted at **the tick its transition lands on**, never
 * merely "eventually". Two more regressions sit beside them because both were caused by freezing
 * those counters: the swing identity that stopped being unique, and the friction exemption that
 * stopped being findable.
 */

import { describe, expect, it } from 'vitest';

import { ATTACK, HURT_LOCK_TICKS, IFRAME_TICKS, PLAYER_MAX_HP, invulnerable, movementLocked } from '../../src/sim/combat';
import { HITSTOP_TICKS, freezePair } from '../../src/sim/hitstop';
import { PLAYER_ATTACK_DAMAGE, applyPlayerAttack } from '../../src/sim/playerAttack';
import { SCAVENGER, SCAVENGER_ATTACK } from '../../src/sim/enemies';
import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';
import type { World } from '../../src/sim/types';
import { BOUNDS, FLOOR, IDLE, SCALE, clawedWhileIdle, strikeWhileRunning } from './hitstop-fixtures';

describe("step 4b's counters freeze; the input edge does not", () => {
  it('combatCounter holds across the freeze, so the swing keeps all three ATTACK phases', () => {
    const { world, input, hitTick } = strikeWhileRunning();
    const player = world.player;
    expect(player.state).toBe('attack');
    const counterAtHit = player.combatCounter;
    // Non-vacuity: the hit landed inside the ACTIVE window, which is the only place it can.
    expect(counterAtHit).toBeGreaterThanOrEqual(ATTACK.startup);
    expect(counterAtHit).toBeLessThan(ATTACK.startup + ATTACK.active);

    for (let n = 1; n <= HITSTOP_TICKS.light; n += 1) {
      tick(world, input);
      expect(player.combatCounter, `combatCounter advanced on frozen tick ${n}`).toBe(counterAtHit);
    }
    tick(world, input);
    expect(player.combatCounter, 'the counter never resumed').toBe(counterAtHit + 1);

    // The swing's END lands exactly HITSTOP_TICKS.light late — the recovery ticks the freeze would
    // otherwise have eaten. `attackTotalTicks` is 20; the counter is reset when the state expires.
    const endsAt = hitTick + (ATTACK.startup + ATTACK.active + ATTACK.recovery - counterAtHit) + HITSTOP_TICKS.light;
    while (world.tickCount <= endsAt) {
      expect(player.state, `the swing ended before tick ${endsAt}`).toBe('attack');
      tick(world, input);
    }
    expect(player.state, 'the swing outlived its window by more than the freeze').not.toBe('attack');
  });

  it('HURT_LOCK_TICKS is extended by exactly the freeze, not consumed by it', () => {
    const { world, hitTick } = clawedWhileIdle();
    const player = world.player;
    expect(player.state).toBe('hurt');

    // `hitTick + 1` is the first tick that has not run yet, so the sum reads as written: the hit,
    // then the freeze, then the knob. Between ticks the counter is one behind what step 5 of the
    // next tick will see — 4b advances it first — which is why the observation point is the tick
    // AFTER the last locked one, and why an unfrozen run releases at `hitTick + 1 + HURT_LOCK_TICKS`.
    const releasesAt = hitTick + 1 + HITSTOP_TICKS.playerHurt + HURT_LOCK_TICKS;
    while (world.tickCount < releasesAt) {
      expect(movementLocked(player), `movement released early at tick ${world.tickCount}`).toBe(true);
      tick(world, { ...IDLE });
    }
    expect(movementLocked(player), `still locked at tick ${releasesAt}`).toBe(false);
  });

  it('IFRAME_TICKS is extended by exactly the freeze', () => {
    const { world, hitTick } = clawedWhileIdle();
    const player = world.player;
    expect(invulnerable(player)).toBe(true);

    // Same shape as the lock above, against a different knob: hit, freeze, then the whole window.
    const lapsesAt = hitTick + 1 + HITSTOP_TICKS.playerHurt + IFRAME_TICKS;
    while (world.tickCount < lapsesAt) {
      expect(invulnerable(player), `i-frames lapsed early at tick ${world.tickCount}`).toBe(true);
      tick(world, { ...IDLE });
    }
    expect(invulnerable(player), `still invulnerable at tick ${lapsesAt}`).toBe(false);
  });

  it('one swing costs one target one hit, however long the freeze holds the hitbox live', () => {
    const { world, input, target } = strikeWhileRunning();
    const startHp = target.maxHp;
    // Run out the whole swing plus its freeze. The hitbox stays live for the frozen ticks, so a
    // swing identity derived from `tickCount - combatCounter` would re-strike on every one of them.
    for (let i = 0; i < ATTACK.startup + ATTACK.active + ATTACK.recovery + HITSTOP_TICKS.lethal; i += 1) {
      tick(world, input);
    }
    expect(target.hp, 'the freeze turned one swing into a damage multiplier').toBe(
      startHp - PLAYER_ATTACK_DAMAGE,
    );
  });
});

describe('the regressions freezing those counters caused', () => {
  it('knockback survives the freeze undecayed — the knockbackSettling regression', () => {
    const { world, hitTick } = clawedWhileIdle();
    const player = world.player;
    const impulse = player.vx;
    expect(Math.abs(impulse)).toBeGreaterThan(0);

    for (let n = 1; n <= HITSTOP_TICKS.playerHurt; n += 1) {
      tick(world, { ...IDLE });
    }
    // The release tick: step 5 runs for the first time since the hit, and the friction exemption
    // must still be available — it can no longer be found by `combatCounter === 1`, which the
    // freeze skipped straight past.
    const xBefore = player.x;
    tick(world, { ...IDLE });
    expect(world.tickCount).toBe(hitTick + 2 + HITSTOP_TICKS.playerHurt);
    expect(player.x - xBefore, 'friction ate the impulse before it ever moved the player').toBeCloseTo(impulse, 6);
  });

  /**
   * The sentinel collision, made loud. `swingStartTick` and `lastHitSwing` both use `-1`, so a
   * hand-built `state = 'attack'` fixture that forgets the identity matches every untouched enemy
   * and the swing passes silently through all of them — reporting green while asserting nothing.
   * `tick-damage-order.test.ts` was exactly that fixture, and nothing told it.
   */
  it('throws when a fixture sets state = attack without a swing identity', () => {
    const world = createWorld({ seed: 1, scale: SCALE, solids: FLOOR, bounds: BOUNDS });
    world.player.state = 'attack';
    world.player.combatCounter = ATTACK.startup;
    expect(world.player.swingStartTick, 'a fresh world must carry the sentinel').toBe(-1);
    expect(() => applyPlayerAttack(world)).toThrow(/swingStartTick/);

    // And it does NOT throw once the identity is set — without this the throw could be unconditional.
    world.player.swingStartTick = world.tickCount;
    expect(() => applyPlayerAttack(world)).not.toThrow();
  });

  it('a FROZEN scavenger deals no damage, even armed mid-strike on top of the player', () => {

    const placement = {
      slug: 'rust-scavenger' as const,
      x: 700,
      y: 960,
      patrolMin: 600,
      patrolMax: 800,
    };
    const build = (): World =>
      createWorld({
        seed: 1,
        scale: SCALE,
        solids: FLOOR,
        bounds: BOUNDS,
        spawn: { x: 700, y: 960 },
        enemies: [placement],
      });

    // Control: the same arming, unfrozen, must hurt — or the fixture proves nothing.
    const control = build();
    control.enemies.scavengers[0]!.attackCounter = SCAVENGER_ATTACK.startup + 1;
    tick(control, { ...IDLE });
    expect(control.player.hp, 'the CONTROL took no damage; the geometry is unreachable').toBe(
      PLAYER_MAX_HP - SCAVENGER.damage,
    );

    const world = build();
    const scavenger = world.enemies.scavengers[0]!;
    scavenger.attackCounter = SCAVENGER_ATTACK.startup + 1;
    scavenger.hitstopUntil = world.tickCount + HITSTOP_TICKS.light;
    scavenger.lastHitTick = world.tickCount;
    tick(world, { ...IDLE });
    expect(world.player.hp, 'a frozen scavenger clawed through its own hit-stop').toBe(PLAYER_MAX_HP);
  });
});

/**
 * Step 13's two forgiveness windows are counters that were already counting, so they belong here
 * with `iFrameCounter` and `combatCounter` rather than beside the freeze itself.
 *
 * Step 13's own rule, quoted from `tick.ts`: *"A window does not spend a tick on which step 8 could
 * not yet see the fact that tick established."* **A frozen tick is a tick on which step 7 did not
 * run at all**, so neither window may spend one — the identical forgiveness leak the freeze already
 * refuses for i-frames and swing recovery, on windows small enough that a 9-tick `lethal` freeze
 * saturates both.
 *
 * Each test carries a `light` (4) CONTROL that passes either way. Without it a red would only prove
 * the assertion fires, not that it discriminates: 4 is under both knobs, so a light freeze cannot
 * saturate either window and both versions of step 13 agree about it.
 */
describe('the freeze does not spend the jump buffer or the coyote window', () => {
  /** Press jump the tick after a hit lands and report the tick the jump actually fires on. */
  function jumpAfterFreeze(lethal: boolean): { hitTick: number; firedAt: number | null; duringFreeze: number[] } {
    const struck = lethal ? strikeWhileRunning({ targetHp: PLAYER_ATTACK_DAMAGE }) : strikeWhileRunning();
    const { world, input, hitTick } = struck;
    const freeze = lethal ? HITSTOP_TICKS.lethal : HITSTOP_TICKS.light;
    expect(struck.target.hp === 0, 'the wrong impact class landed').toBe(lethal);
    expect(world.player.grounded, 'an airborne fixture cannot test the BUFFER').toBe(true);

    latchJumpPress(input);
    let firedAt: number | null = null;
    const duringFreeze: number[] = [];
    for (let i = 0; i < freeze + 8; i += 1) {
      const at = world.tickCount;
      if (tick(world, input).jumped) {
        if (firedAt === null) firedAt = at;
        if (at <= hitTick + freeze) duringFreeze.push(at);
      }
    }
    return { hitTick, firedAt, duringFreeze };
  }

  it('a buffered press survives a lethal freeze and fires on the release tick', () => {
    // The press is consumed at step 2 of `hitTick + 1`, the first frozen tick, and the release tick
    // is the first one on which step 7 runs again.
    const lethal = jumpAfterFreeze(true);
    expect(lethal.duringFreeze, 'a jump fired out of a frozen body — step 7 escaped the gate').toEqual([]);
    expect(lethal.firedAt, 'the freeze ate the buffered press').toBe(
      lethal.hitTick + HITSTOP_TICKS.lethal + 1,
    );

    // The control. `HITSTOP_TICKS.light` is 4 against `jumpBufferTicks` 8, so the window cannot
    // saturate inside it and this case fires whether or not step 13 is gated.
    const light = jumpAfterFreeze(false);
    expect(light.duringFreeze).toEqual([]);
    expect(light.firedAt).toBe(light.hitTick + HITSTOP_TICKS.light + 1);
  });

  /**
   * Coyote, the mirror case — `coyoteTicks` is 7, so a 9-tick freeze saturates it too.
   *
   * The freeze is armed through `freezePair` by hand rather than by a landed blow. Contriving a
   * LETHAL hit to resolve on the exact tick the player's feet leave a ledge is fixture gymnastics
   * that would test the fixture, not the window; the field it writes is the one field `freezePair`
   * writes, and the buffer test above already drives the real 9b path end to end.
   */
  function coyoteAfterFreeze(ticks: number): { leftAt: number; armedAt: number; firedAt: number | null } {
    const world = createWorld({
      seed: 1,
      scale: 1,
      // A ledge with the floor far below, so the sweep cannot land mid-test — `coyote-time.test.ts`
      // learned that the hard way when gravity was retuned under it.
      solids: [
        { x: 0, y: 780, w: 700, h: 32 },
        { x: 0, y: 4000, w: 8000, h: 120 },
      ],
    });
    const input = createSnapshot();
    for (let i = 0; i < 10; i += 1) tick(world, input);
    expect(world.player.grounded, 'the fixture never settled on the ledge').toBe(true);

    input.right = true;
    let leftAt = -1;
    for (let i = 0; i < 600 && leftAt < 0; i += 1) {
      const at = world.tickCount;
      if (tick(world, input).leftGround) leftAt = at;
    }
    expect(leftAt, 'the player never walked off the ledge').toBeGreaterThan(0);

    const armedAt = world.tickCount;
    freezePair(world.player, { hitstopUntil: -1, lastHitTick: -1 }, ticks === HITSTOP_TICKS.lethal ? 'lethal' : 'light', armedAt);
    latchJumpPress(input);

    let firedAt: number | null = null;
    for (let i = 0; i < ticks + 8 && firedAt === null; i += 1) {
      const at = world.tickCount;
      if (tick(world, input).jumped) firedAt = at;
    }
    return { leftAt, armedAt, firedAt };
  }

  it('a coyote window survives a lethal freeze and is still open on the release tick', () => {
    const lethal = coyoteAfterFreeze(HITSTOP_TICKS.lethal);
    expect(lethal.firedAt, 'the freeze closed the coyote window').toBe(
      lethal.armedAt + HITSTOP_TICKS.lethal + 1,
    );

    // The control: 4 is under `coyoteTicks` 7, so this fires either way.
    const light = coyoteAfterFreeze(HITSTOP_TICKS.light);
    expect(light.firedAt).toBe(light.armedAt + HITSTOP_TICKS.light + 1);
  });
});
