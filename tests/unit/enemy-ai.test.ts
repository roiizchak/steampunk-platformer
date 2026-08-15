/**
 * Enemy behaviour — episodes, not per-tick decisions.
 *
 * Vault **5.1** (blocker): *a per-tick probability is not a behaviour — commit to episodes; one
 * counter plus one flag, because two counters admit the unrepresentable state.* And the render-side
 * consequence in the same note: *Phaser restarts a looping animation on every state change, which is
 * how a walk cycle never left frame 0.*
 *
 * The Phase 5 Codex plan review (C9) sharpened this: **determinism alone is not commitment.** A
 * fully deterministic enemy whose *detection* is recomputed every tick still flaps when the player
 * stands exactly on the boundary — and a state that changes every tick restarts the animation every
 * tick, which is the frame-0 bug arriving through the AI instead of through `play()`. So the gate
 * for criterion 5.3 is a flap test, not a structural read of the code.
 */

import { describe, expect, it } from 'vitest';

import {
  ENEMY_DEAD_ZONE,
  SENTRY,
  SCAVENGER,
  createSentry,
  stepSentry,
} from '../../src/sim/enemies';
import { TILE_SIZE } from '../../src/game/constants';
import { sentryRenderDesc } from '../../src/render/enemyView';

/** The sentry sits at x=1000; the player is placed relative to it. */
function sentryAt(x: number) {
  return createSentry({ x, y: 0 });
}

describe('brass-sentry — criterion 5.1', () => {
  it('fires inside its radius — the positive control, not just the refusal', () => {
    const sentry = sentryAt(1000);
    let shots = 0;
    for (let i = 0; i < SENTRY.cooldown * 3; i += 1) {
      if (stepSentry(sentry, { playerX: 1000 + SENTRY.radius - 1, playerY: 0 }).fired) {
        shots += 1;
      }
    }
    expect(shots).toBeGreaterThan(0);
  });

  it('never fires outside its radius, however long it waits', () => {
    const sentry = sentryAt(1000);
    let shots = 0;
    for (let i = 0; i < SENTRY.cooldown * 5; i += 1) {
      if (stepSentry(sentry, { playerX: 1000 + SENTRY.radius + 1, playerY: 0 }).fired) {
        shots += 1;
      }
    }
    expect(shots).toBe(0);
  });

  /**
   * The radius is a tunable knob and moving it must move the behaviour — **measured, not displayed**
   * *(A6, and Codex C4: a displayed number can move while the live entity reads a stale value)*.
   * A player who is out of range at the default radius must come into range at a larger one.
   */
  it('the radius knob changes what the live sentry does', () => {
    const playerX = 1000 + SENTRY.radius + 50;
    const tight = createSentry({ x: 1000, y: 0 });
    const wide = createSentry({ x: 1000, y: 0, radius: SENTRY.radius + 100 });

    let tightShots = 0;
    let wideShots = 0;
    for (let i = 0; i < SENTRY.cooldown * 3; i += 1) {
      if (stepSentry(tight, { playerX, playerY: 0 }).fired) tightShots += 1;
      if (stepSentry(wide, { playerX, playerY: 0 }).fired) wideShots += 1;
    }

    expect(tightShots).toBe(0);
    expect(wideShots).toBeGreaterThan(0);
  });

  /** Firing is an episode on a fixed cooldown, not a roll: the gaps between shots are identical. */
  it('fires on a fixed cadence — an episode, never a per-tick roll', () => {
    const sentry = sentryAt(1000);
    const shotTicks: number[] = [];
    for (let i = 0; i < SENTRY.cooldown * 4; i += 1) {
      if (stepSentry(sentry, { playerX: 1000, playerY: 0 }).fired) shotTicks.push(i);
    }
    expect(shotTicks.length).toBeGreaterThanOrEqual(3);

    const gaps = shotTicks.slice(1).map((t, i) => t - shotTicks[i]);
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBe(SENTRY.cooldown);
  });
});

describe('brass-sentry facing — the 2026-08-13 playtest defect (no facing at all)', () => {
  it('faces -1 (left) when the player is to its left', () => {
    const sentry = sentryAt(1000);
    stepSentry(sentry, { playerX: 500, playerY: 0 });
    expect(sentry.facing).toBe(-1);
  });

  it('faces +1 (right) when the player is to its right', () => {
    const sentry = sentryAt(1000);
    stepSentry(sentry, { playerX: 1500, playerY: 0 });
    expect(sentry.facing).toBe(1);
  });

  it('HOLDS its last facing when it loses sight, rather than snapping back', () => {
    const sentry = sentryAt(1000);
    stepSentry(sentry, { playerX: 500, playerY: 0 }); // in range, to the left
    expect(sentry.facing).toBe(-1);

    // Now far outside the radius, on the RIGHT — a re-derive-from-position bug would flip to +1.
    stepSentry(sentry, { playerX: 1000 + SENTRY.radius + 500, playerY: 0 });
    expect(sentry.facing).toBe(-1);
  });

  it('the render descriptor flipX follows facing, not a hardcoded value', () => {
    const left = sentryAt(1000);
    stepSentry(left, { playerX: 500, playerY: 0 });
    expect(sentryRenderDesc(left, 6).flipX).toBe(true);

    const right = sentryAt(1000);
    stepSentry(right, { playerX: 1500, playerY: 0 });
    expect(sentryRenderDesc(right, 6).flipX).toBe(false);
  });

  /**
   * 🔴 **The 60 Hz strobe — gate finding B5, fixed 2026-08-14 (D5).**
   *
   * `facing` was re-derived on EVERY tick the player was visible, with no dead zone, so a player
   * oscillating around `sentry.x` — a jump apex over a turret is the ordinary case — flipped it at
   * the tick rate. Nothing could see it: `setFlipX` does not restart an animation, so no frame-index
   * gate notices, and the field's own docstring claimed it used the scavenger's rule, which is what
   * a reviewer checks against instead of the code.
   *
   * The fix is the scavenger's `deadZone`, mirrored: inside it, HOLD. That is the same anti-flap
   * shape as the out-of-radius hold directly above, and now genuinely the same rule as the
   * scavenger's rather than merely claiming to be.
   *
   * Asserted as "does not change across N ticks", not "is correct once" — a single-tick assertion
   * cannot see a strobe, which is the whole reason this survived.
   */
  it('does not strobe when the player oscillates across its centre', () => {
    const sentry = sentryAt(1000);
    stepSentry(sentry, { playerX: 400, playerY: 0 }); // commit to the left, outside the dead zone
    expect(sentry.facing).toBe(-1);

    // A player straddling `sentry.x` inside the dead zone, alternating sides every tick.
    for (let i = 0; i < 40; i += 1) {
      const offset = i % 2 === 0 ? 30 : -30;
      stepSentry(sentry, { playerX: 1000 + offset, playerY: 0 });
      expect(sentry.facing, `flipped on tick ${i} — the strobe is back`).toBe(-1);
    }
  });

  it('still commits once the player is genuinely to one side', () => {
    const sentry = sentryAt(1000);
    stepSentry(sentry, { playerX: 400, playerY: 0 });
    expect(sentry.facing).toBe(-1);

    // Outside the dead zone on the right — the hold must not become a freeze.
    stepSentry(sentry, { playerX: 1000 + ENEMY_DEAD_ZONE + 1, playerY: 0 });
    expect(sentry.facing, 'a dead zone that never releases is a turret that never turns').toBe(1);
  });

  /**
   * The docstring claimed parity with the scavenger for months while the code had none. Assert the
   * shared SOURCE, not that two numbers happen to be equal — `SCAVENGER.contactCooldown` and
   * `IFRAME_TICKS` agreed at 45 by coincidence for a whole phase, and that is what one definition
   * with two consumers is for *(vault 5.3)*.
   */
  it('uses the same dead zone as the scavenger, from one definition', () => {
    expect(SENTRY.deadZone).toBe(ENEMY_DEAD_ZONE);
    expect(SCAVENGER.deadZone).toBe(ENEMY_DEAD_ZONE);
    expect(ENEMY_DEAD_ZONE).toBe(TILE_SIZE);
  });
});

describe('sentry fire guard — A2, enemySentry.ts:95', () => {
  /**
   * `stepSentry` has TWO `windowOpen` checks: one gates the counter increment, the other gates
   * firing. Deleting the fire guard makes every sighted tick fire (`cooldownCounter` resets to 0
   * the instant it is seen, with nothing stopping the reset from happening every tick) — this test
   * is what catches that; the cadence test above happens to catch it too, but this one states the
   * property directly: fire on entry, then never again until a full cooldown has elapsed.
   */
  it('fires the tick the player enters radius, then exactly every SENTRY.cooldown ticks — not every tick', () => {
    const sentry = sentryAt(1000);
    const enterTick = 5;
    const shotTicks: number[] = [];
    for (let i = 0; i < SENTRY.cooldown * 3; i += 1) {
      const inRange = i >= enterTick;
      const playerX = inRange ? 1000 : 1000 + SENTRY.radius + 100;
      if (stepSentry(sentry, { playerX, playerY: 0 }).fired) {
        shotTicks.push(i);
      }
    }
    expect(shotTicks[0]).toBe(enterTick);
    expect(shotTicks.length).toBeGreaterThanOrEqual(2);
    const gaps = shotTicks.slice(1).map((t, i) => t - shotTicks[i]);
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBe(SENTRY.cooldown);
  });
});

