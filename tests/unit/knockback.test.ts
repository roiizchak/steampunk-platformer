/**
 * Knockback — the impulse Phase 5's scope named and Phase 5 never built.
 *
 * Split out of `tick-world-damage.test.ts` when adding these tests pushed that file to 528 lines,
 * past the 400-line rule (criterion 5.12). The seam is the natural one: everything here drives the
 * same real `tick()` as its parent, but asks one question — where did the body end up after a hit.
 */

import { describe, expect, it } from 'vitest';

import { HAZARD_DAMAGE } from '../../src/sim/hazards';
import { HURT_LOCK_TICKS, IFRAME_TICKS, PLAYER_MAX_HP } from '../../src/sim/combat';
import { SCAVENGER, SENTRY } from '../../src/sim/enemies';
import { createSnapshot } from '../../src/sim/input';
import { DEFAULT_TUNING } from '../../src/sim/player';
import { KNOCKBACK_SPEED } from '../../src/sim/worldDamage';
import { createWorld, tick } from '../../src/sim/tick';
import type { Rect, World } from '../../src/sim/types';

const SCALE = 6;
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
   * The grounded shove, bled down by ground friction until it dies.
   *
   * `knockbackSettling` (`combat.ts`) exempts the ONE tick immediately after the hit from ground
   * friction, so the full `KNOCKBACK_SPEED` impulse survives to move the player that tick; every
   * later tick decelerates by `groundFriction` until the velocity reaches zero.
   *
   * ## 🔴 It used to say "and that is all" after TWO ticks. Session 10 made that false.
   *
   * The shipped numbers were `KNOCKBACK_SPEED` 5.54 against `groundFriction` 3.69, which dies after
   * exactly two ticks: `5.54 + 1.85 = 7.39 px`. Session 10 retuned locomotion from the art's
   * measured foot travel, scaling every horizontal knob by `0.625` — including `groundFriction`,
   * down to 2.30625 — while the user's decision **pinned `KNOCKBACK_SPEED` at 5.54** so a combat
   * number would not move because the walk cycle was re-timed.
   *
   * Pinning the impulse while the decelerating force shrank makes the shove **travel further**:
   * a third tick now contributes, and displacement rises to **9.70 px, up from 7.39**.
   *
   * > **That is worth stating plainly: "pin the constant" did NOT preserve the feel.** Felt
   * > knockback is displacement, and displacement is impulse ÷ friction — so holding one input
   * > fixed while the other moved changed the output by +31 %. The alternative (deriving
   * > `KNOCKBACK_SPEED` backwards from a 7.39 px target) was rejected as brittle: the sum is
   * > discontinuous in the number of surviving ticks, so a small knob edit would jump it.
   *
   * The expectation is therefore **derived from the knobs**, not retyped: it sums the real
   * decelerating series and so stays true through the next retune, which is exactly what the
   * hardcoded two-tick formula failed to do.
   */
  it('grounded displacement is one un-friction-ed tick plus the whole decelerating tail', () => {
    const world = contactWorld(700, 706);
    const before = world.player.x;

    tick(world, { ...IDLE });
    for (let i = 0; i < HURT_LOCK_TICKS; i += 1) {
      tick(world, { ...IDLE });
    }

    const moved = world.player.x - before;

    // The exempt tick, then every tick that still has velocity left after friction.
    let expected = KNOCKBACK_SPEED;
    for (let k = 1; ; k += 1) {
      const v = KNOCKBACK_SPEED - k * DEFAULT_TUNING.groundFriction;
      if (v <= 0) break;
      expected += v;
    }
    expect(moved).toBeCloseTo(expected, 5);

    // 9.70 px at the session-10 tune, 7.39 px before it, 1.85 px before the friction exemption.
    // Kept as absolute bounds so "knockback ships" can never again be read as "knockback is
    // visible" — a sign assertion called the invisible 1.85 px a success.
    expect(moved).toBeGreaterThan(9);
    expect(moved).toBeLessThan(10);
  });

  /**
   * The friction exemption is ONE tick, not a permanent state — the second tick after a hit must
   * decelerate normally, or `knockbackSettling` has silently become `movementLocked`'s twin instead
   * of the single tick its own docstring claims.
   */
  it('friction resumes on the SECOND tick after the hit, not just the first', () => {
    const world = contactWorld(700, 706);

    tick(world, { ...IDLE }); // hit lands at 9b, vx set, position unmoved this tick
    const atImpact = world.player.x;

    tick(world, { ...IDLE }); // settling tick: exempt, full impulse moves the player
    const afterSettlingTick = world.player.x;
    expect(afterSettlingTick - atImpact).toBeCloseTo(KNOCKBACK_SPEED, 5);

    tick(world, { ...IDLE }); // second tick: friction resumes
    const afterSecondTick = world.player.x;
    expect(afterSecondTick - afterSettlingTick).toBeCloseTo(
      KNOCKBACK_SPEED - DEFAULT_TUNING.groundFriction,
      5,
    );
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
    /**
     * Air friction is a fraction of ground friction, so the impulse survives the whole hurt window
     * instead of dying in a few ticks: **28.46 px** at the session-10 tune, up from 25.59 px, up
     * from 20.05 px before the friction exemption existed.
     *
     * It decomposes exactly, which is how the figure is checked rather than trusted — the settling
     * tick at the full `KNOCKBACK_SPEED`, then one tick per remaining lock tick bleeding at
     * `airFriction`. Two agents once reported different pre-fix numbers and only one of them added
     * up, so this is summed from the knobs rather than retyped.
     *
     * The gap against the grounded figure is the point: "does knockback work" is not one question,
     * and a fixture that only ever tested one surface would answer the easy half.
     */
    let expected = KNOCKBACK_SPEED;
    for (let k = 1; k < HURT_LOCK_TICKS; k += 1) {
      const v = KNOCKBACK_SPEED - k * DEFAULT_TUNING.airFriction;
      if (v <= 0) break;
      expected += v;
    }
    expect(moved).toBeCloseTo(expected, 5);
    expect(moved).toBeGreaterThan(25);
    expect(moved).toBeLessThan(30);
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
  /**
   * FIX 2 (QA gate, session 8): `knockbackSettling` used to key on `state === 'hurt' &&
   * combatCounter === 1` alone, with no test that an impulse actually landed — measured against the
   * real sim as `vxBefore: -12, vxAfterOneTick: -12` (unchanged) where `wouldBeWithFriction: -8.31`.
   * Hazards are deliberately exempt from the SHOVE (`worldDamage.ts`), but that must not also buy
   * them the friction exemption. This is the test that would have caught the defect.
   */
  it('a HAZARD hit does NOT get the friction exemption — vx decays by groundFriction the tick after', () => {
    const world = worldWith({ hazards: [{ x: 300, y: 900, w: 100, h: 100 }] });

    let vxAtImpact: number | null = null;
    for (let i = 0; i < 60 && world.player.hp === PLAYER_MAX_HP; i += 1) {
      tick(world, { ...LEFT });
    }
    expect(world.player.hp).toBe(PLAYER_MAX_HP - HAZARD_DAMAGE);
    expect(world.player.state).toBe('hurt');
    vxAtImpact = world.player.vx;

    tick(world, { ...LEFT }); // the tick immediately after the hit — friction must apply
    expect(world.player.vx).toBeCloseTo(vxAtImpact + DEFAULT_TUNING.groundFriction, 5);
  });

  it('a fresh world starts with no knockback impulse pending', () => {
    const world = worldWith();
    expect(world.player.knockbackPending).toBe(false);
  });

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
