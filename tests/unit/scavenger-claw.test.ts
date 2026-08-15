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
