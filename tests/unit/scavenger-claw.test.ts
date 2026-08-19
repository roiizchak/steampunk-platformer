/**
 * Criterion 5.5 and 5.16, for the scavenger's claw specifically — split from
 * `tick-world-damage.test.ts` on 2026-08-15 when the new coverage took that file to 479 lines.
 *
 * The seam is the criterion boundary, not a line count: `tick-world-damage.test.ts` is *the world
 * damaging the player* — hazards, the kill plane, projectiles, i-frames — and this is **one
 * creature's strike window**, which is a timing contract. Deliberately not a `-helpers` module that
 * one file imports, which `file-size.test.ts` names as the way to game this gate.
 */

import { describe, expect, it } from 'vitest';

import { PLAYER_MAX_HP } from '../../src/sim/combat';
import {
  SCAVENGER,
  SCAVENGER_ATTACK,
  SCAVENGER_ATTACK_TICKS,
  attackIsLive,
  createScavenger,
} from '../../src/sim/enemies';
import { createSnapshot } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';
import { attackInProgress, releaseAggro, scavengerFooting, stepScavenger } from '../../src/sim/enemies';
import { RENDER_SCALE } from '../../src/game/constants';
import type { World } from '../../src/sim/types';

const IDLE = createSnapshot();

/** The same shape `tick-world-damage.test.ts` uses: flat ground, one enemy, a placed spawn. */
function worldWith(opts: {
  enemies: { slug: 'rust-scavenger'; x: number; y: number; patrolMin: number; patrolMax: number }[];
  spawn: { x: number; y: number };
}): World {
  return createWorld({
    seed: 1,
    scale: 6,
    solids: [{ x: 0, y: 960, w: 9000, h: 120 }],
    bounds: { widthPx: 9000, heightPx: 1080 },
    spawn: opts.spawn,
    enemies: opts.enemies,
  });
}

/**
 * 🔴 **The scavenger's claw window, walked tick by tick — added 2026-08-15.**
 *
 * The criterion 5.5 adversarial brief found that nothing walked `attackIsLive` the way
 * `combat.test.ts` walks the player's `hitWindowOpen`, and that the closest coverage stops the
 * moment damage lands, so it never re-checks the RECOVERY phase. It named the masking exactly: the
 * first hit opens i-frames, and `IFRAME_TICKS > HURT_TICKS`, so a boundary that stayed live one tick
 * into recovery would deal no *second* hit and no test would see it.
 *
 * The proof it was needed arrived the same day. `SCAVENGER_ATTACK.startup` moved **14 → 18** to fix a
 * real G5 failure — a four-tick shift of the only window in which this creature can hurt anything —
 * and **not one test in the suite went red.**
 *
 * ⚠️ **These tests do not catch that retune either, and saying otherwise would be the overclaim this
 * gate keeps finding.** They derive their expectations FROM `SCAVENGER_ATTACK`, so the window and the
 * assertion move together by construction. What they catch is the other half, and it is the half
 * that was actually undefended: **`attackIsLive` drifting away from the window it claims to
 * implement** — a hand-rolled boundary, an off-by-one at either end, or a claw that outlives its
 * strike into recovery.
 *
 * The VALUE is pinned elsewhere, deliberately, by two gates that do go red on it: the mirror lock in
 * `catalog-timings.test.ts` (the tools' hand-typed copies) and the shipped-bytes G5 case in
 * `sheet-gates.test.ts` (the art). Verified by mutation — reverting `startup` to 14 turns exactly
 * those two red, by name, and leaves everything here green. That division is the design: this file
 * asks whether the predicate obeys the window, those ask whether the window is the right number.
 */
describe('the scavenger claw is live on exactly its active ticks, and nowhere else', () => {
  it('walks every tick of the whole 36-tick swing against attackIsLive', () => {
    const s = createScavenger({ x: 0, y: 0, patrolMin: -100, patrolMax: 100 });
    s.hp = 60;

    const live: number[] = [];
    for (let counter = 0; counter <= SCAVENGER_ATTACK_TICKS; counter += 1) {
      s.attackCounter = counter;
      if (attackIsLive(s)) live.push(counter);
    }

    // Named endpoints, not a length. A window of the right SIZE in the wrong PLACE is the defect
    // G5 caught in the art, and a count would have passed through it unchanged.
    const open = SCAVENGER_ATTACK.startup;
    const close = SCAVENGER_ATTACK.startup + SCAVENGER_ATTACK.active;
    expect(live).toEqual(Array.from({ length: SCAVENGER_ATTACK.active }, (_, i) => open + i));
    expect(live[0], 'the claw goes live before its startup completes').toBe(open);
    expect(live[live.length - 1], 'the last live tick is not the one before close').toBe(close - 1);

    // The two boundary ticks, stated separately so an off-by-one names which end moved.
    s.attackCounter = open - 1;
    expect(attackIsLive(s), 'live on the final STARTUP tick — the windup can hurt you').toBe(false);
    s.attackCounter = close;
    expect(attackIsLive(s), 'live on the first RECOVERY tick — the claw outlives its strike').toBe(false);
  });

  it('deals damage exactly ONCE across a whole swing, recovery included', () => {
    /**
     * The gap the brief named: existing coverage stopped at the first hit. Stepping through the
     * rest of the swing is what would catch a boundary that stayed live into recovery — and because
     * i-frames would swallow a second hit anyway, this asserts the HP after the FULL swing rather
     * than looking for a second drop.
     */
    const placement = {
      slug: 'rust-scavenger' as const,
      x: 700,
      y: 960,
      patrolMin: 600,
      patrolMax: 800,
    };
    const world = worldWith({ enemies: [placement], spawn: { x: 700, y: 960 } });

    for (let i = 0; i < SCAVENGER_ATTACK_TICKS + 1; i += 1) {
      tick(world, { ...IDLE });
    }

    expect(
      world.player.hp,
      'one complete swing cost more (or less) than one hit of SCAVENGER.damage',
    ).toBe(PLAYER_MAX_HP - SCAVENGER.damage);
  });

  /**
   * 🔴 **Criterion 5.16's damage clause, made non-vacuous — added 2026-08-15.**
   *
   * The criterion 5.16 gate owner found the existing fixture placed the scavenger at patrol
   * `700–1300` against a spawn at `x: 400` with `attackRange: 144` — **it could never have reached
   * the player even alive**, so deleting BOTH death guards (`worldDamage.ts`'s `hp <= 0` skip and
   * `attackIsLive`'s own) left it green. It proved nothing.
   *
   * This arms a DEAD scavenger's counter to the middle of its active window, standing on the player.
   * Alive, that is a guaranteed hit — the test above proves it. Dead, it must cost nothing.
   */
  it('a DEAD scavenger armed mid-strike on top of the player deals nothing (criterion 5.16)', () => {
    const placement = {
      slug: 'rust-scavenger' as const,
      x: 700,
      y: 960,
      patrolMin: 600,
      patrolMax: 800,
    };
    const world = worldWith({ enemies: [placement], spawn: { x: 700, y: 960 } });
    const scavenger = world.enemies.scavengers[0]!;

    scavenger.hp = 0;
    scavenger.attackCounter = SCAVENGER_ATTACK.startup + 1;

    // Non-vacuity: the same arming on a LIVE scavenger must hurt, or this fixture is unreachable
    // geometry again and the assertion below is measuring nothing.
    const control = worldWith({ enemies: [placement], spawn: { x: 700, y: 960 } });
    control.enemies.scavengers[0]!.attackCounter = SCAVENGER_ATTACK.startup + 1;
    tick(control, { ...IDLE });
    expect(
      control.player.hp,
      'the CONTROL took no damage — the fixture cannot reach the player, so the dead case proves nothing',
    ).toBeLessThan(PLAYER_MAX_HP);

    for (let i = 0; i < SCAVENGER_ATTACK_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }
    expect(world.player.hp, 'a dead scavenger damaged the player').toBe(PLAYER_MAX_HP);
  });
});

/**
 * 🔴 **The attack TRIGGER, which had no direct regression until Codex 5.14 blocker 3.**
 *
 * Three defects were fixed in `stepScavenger`'s swing block and **nothing challenged any of them**:
 * every claw test either assigns `attackCounter` by hand or parks the player at the creature's own
 * coordinates, so restoring the original one-dimensional, ungated trigger would have left the whole
 * suite green. The fix had a docstring and no test — which is the same shape as the three "pinned by
 * a test" claims this gate already found to be pinned by nothing.
 *
 * Each case below is written so that exactly one of the three reverts turns it red:
 *
 * | revert | which case fails |
 * |---|---|
 * | `withinRadius(...)` back to `Math.abs(dx) <= attackRange` | the overhead player |
 * | drop the `chasing &&` conjunct | the undetected player |
 * | move the block back above the detection block | the same-tick acquisition case |
 */
describe('the swing only fires at a player it has actually seen and can actually reach', () => {
  const AT = (x: number, y: number) => ({ playerX: x, playerY: y });
  // Through the factory, so the body's width and height have ONE definition (vault 5.3).
  const EVERYWHERE = scavengerFooting([{ x: -100000, y: 200, w: 200000, h: 100 }], RENDER_SCALE);

  function swingsIn(scav: ReturnType<typeof createScavenger>, at: { playerX: number; playerY: number }, ticks: number): number {
    let swings = 0;
    for (let i = 0; i < ticks; i += 1) {
      const before = scav.attackCounter;
      stepScavenger(scav, at, EVERYWHERE);
      if (scav.attackCounter === 0 && before !== 0) swings += 1;
    }
    return swings;
  }

  it('does NOT swing at a player directly overhead and out of reach', () => {
    // dx = 0, dy = 900. The old 1-D trigger read `|dx| <= 144` as TRUE and swung forever at the
    // ceiling — measured at 3 swings per 200 ticks, with the patrol frozen because a swing plants
    // the feet. `detectRadius` 480 also does not reach 900, so this is out of both.
    const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
    expect(swingsIn(s, AT(0, -900), 200)).toBe(0);
    expect(s.chasing, 'a player 900px up is outside detectRadius 480').toBe(false);
  });

  it('does NOT swing at an unseen player standing right on top of it', () => {
    // Within reach but never detected: `detectRadius: 0` is the documented AI off-switch. The
    // ungated trigger swung anyway, and `worldDamage` gates on the claw rather than on aggro, so it
    // dealt real damage with its perception disabled.
    const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000, detectRadius: 0 });
    expect(swingsIn(s, AT(0, 0), 200)).toBe(0);
  });

  it('DOES swing on the tick it acquires a reachable player — ordering, not just gating', () => {
    // The gating fix is only safe because detection runs FIRST. If the swing block moved back above
    // it, `chasing` would still be false on the acquisition tick and this drops to 0 swings: the
    // creature would stand and stare for a tick before reacting. Proves the fix did not trade one
    // defect for a subtler one.
    const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
    expect(s.chasing).toBe(false);
    stepScavenger(s, AT(100, 0), EVERYWHERE);
    expect(s.chasing, 'a player 100px away is inside detectRadius 480').toBe(true);
    expect(s.attackCounter, 'it saw the player and did not swing on the same tick').toBe(0);
  });

  it('swings at a reachable player OFF the horizontal axis, which is what 2-D buys', () => {
    // dx 100, dy 100 -> distance 141.4 < attackRange 144. The 1-D predicate would also pass this
    // one, so it is not the discriminator; it is here so the overhead case above cannot be
    // satisfied by a trigger that has simply stopped working.
    const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
    expect(swingsIn(s, AT(100, -100), 200)).toBeGreaterThan(0);
  });

  it('does NOT swing at a player just outside the 2-D radius but inside its x-projection', () => {
    // dx 140, dy 60 -> distance 152.3 > 144, but |dx| 140 <= 144. THE discriminating case: the old
    // predicate swings here and the new one must not.
    const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
    expect(swingsIn(s, AT(140, -60), 200)).toBe(0);
  });
});

/**
 * Phase 5 finding **R5**, carried into Phase 6 and closed here.
 *
 * `releaseAggro` cleared `chasing` and `chaseCounter` and left `attackCounter` untouched, so a
 * scavenger caught mid-swing when the player died carried the live strike window straight through
 * the respawn. The Phase 5 log recorded it as harmless *because the respawn point happens to be far
 * away* — which is a property of `level-01`'s geometry, not of the code, and the next level is under
 * no obligation to preserve it.
 *
 * `attackCounter` SATURATES to mean "idle, ready" — `createScavenger` starts it at `attackCooldown`
 * for exactly that reason — so releasing aggro restores it to saturated, not to 0. Zero would mean
 * "a swing just began", which is the opposite of the intent.
 */
describe('R5 — releasing aggro also ends any swing in progress', () => {
  const AT_R5 = (x: number, y: number) => ({ playerX: x, playerY: y });
  const GROUND_R5 = scavengerFooting([{ x: -100000, y: 200, w: 200000, h: 100 }], RENDER_SCALE);

  it('a scavenger mid-swing is no longer mid-swing once aggro is released', () => {
    const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });

    // Drive it into a swing: adjacent player, stepped until the window opens.
    let started = false;
    for (let i = 0; i < 200 && !started; i += 1) {
      stepScavenger(s, AT_R5(100, 0), GROUND_R5);
      started = attackInProgress(s);
    }
    expect(started, 'the scavenger never began a swing, so there is nothing to release').toBe(true);
    expect(attackInProgress(s)).toBe(true);

    // The player dies; the world releases every scavenger's aggro.
    releaseAggro(s);

    expect(s.chasing, 'aggro was not released').toBe(false);
    expect(
      attackInProgress(s),
      'the scavenger is STILL mid-swing after aggro was released — the strike window survives the ' +
        'player respawning, and can land on a player who was somewhere else when it started',
    ).toBe(false);
    // The END of the swing window, not the end of the COOLDOWN. Saturating to `attackCooldown`
    // would refund the whole cooldown and re-arm the scavenger instantly on the player's death —
    // a balance change pointing the wrong way, caught by both code-reviewer briefs.
    expect(s.attackCounter, 'the swing window should be closed, not the cooldown refunded').toBe(
      SCAVENGER_ATTACK_TICKS,
    );
    expect(
      s.attackCounter,
      'releasing aggro refunded the cooldown — the scavenger can swing again immediately',
    ).toBeLessThan(s.attackCooldown);
  });
});
