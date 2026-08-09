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
  CHASE_COMMIT_TICKS,
  SENTRY,
  SCAVENGER,
  createScavenger,
  createSentry,
  detects,
  stepScavenger,
  stepSentry,
} from '../../src/sim/enemies';

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

describe('rust-scavenger — criterion 5.2', () => {
  it('patrols between its bounds and turns at them, without drifting out', () => {
    const s = createScavenger({ x: 500, y: 0, patrolMin: 400, patrolMax: 700 });
    const xs: number[] = [];
    for (let i = 0; i < 2000; i += 1) {
      stepScavenger(s, { playerX: 99999, playerY: 0 });
      xs.push(s.x);
    }
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(400);
    expect(Math.max(...xs)).toBeLessThanOrEqual(700);
    // It genuinely traverses rather than sitting still.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200);
  });

  it('patrol and chase speeds are independently tunable, measured on travel', () => {
    const far = { playerX: 99999, playerY: 0 };
    const base = createScavenger({ x: 500, y: 0, patrolMin: 0, patrolMax: 100000 });
    const faster = createScavenger({
      x: 500,
      y: 0,
      patrolMin: 0,
      patrolMax: 100000,
      patrolSpeed: SCAVENGER.patrolSpeed * 2,
    });

    for (let i = 0; i < 60; i += 1) {
      stepScavenger(base, far);
      stepScavenger(faster, far);
    }
    expect(Math.abs(faster.x - 500)).toBeGreaterThan(Math.abs(base.x - 500));
  });

  /** Chase must be escapable — slower than the player's run, faster than the walk. */
  it('chases slower than a running player and faster than a walking one', () => {
    expect(SCAVENGER.chaseSpeed).toBeLessThan(12.0); // DEFAULT_TUNING.runMax
    expect(SCAVENGER.chaseSpeed).toBeGreaterThan(5.54); // DEFAULT_TUNING.walkMax
  });
});

describe('episode commitment — criterion 5.3, the flap test (Codex C9)', () => {
  /**
   * **The test that a structural read cannot replace — and that a careless version cannot fail.**
   *
   * The first version of this test parked the player *exactly* on `detectRadius` and asserted the
   * state changed at most once. It passed with the hysteresis deleted, because `withinRadius` is
   * `<=`: exactly on the boundary reads as detected on every tick, so nothing could ever flap and
   * the assertion measured nothing *(vault C2 — a gate that cannot go red is decoration; vault 5.5
   * — a result of exactly 0 means asking whether the branch ran)*. Mutation testing caught it.
   *
   * Two things had to change to make it real:
   *
   *  - The player **oscillates across** the boundary rather than sitting on it — 10 px inside on
   *    even ticks, 10 px outside on odd ones. That is the input a single threshold cannot survive.
   *  - The scavenger is **held in place** each tick. A chaser that closes the distance is
   *    self-stabilising: it walks inside its own radius and stops flapping for reasons that have
   *    nothing to do with hysteresis. Pinning it models the case that actually occurs in game — a
   *    scavenger that cannot reach the player, because the player is above it or across a gap.
   *
   * Verified to fail: replacing the asymmetric threshold in `detects` with a single
   * `detectRadius` takes this from 1 state change to ~20.
   */
  it('does not flap when the player oscillates across the detection boundary', () => {
    const s = createScavenger({ x: 500, y: 0, patrolMin: 400, patrolMax: 700 });
    const inside = 500 + SCAVENGER.detectRadius - 10;
    const outside = 500 + SCAVENGER.detectRadius + 10;

    const states: string[] = [];
    for (let i = 0; i < 600; i += 1) {
      s.x = 500; // pinned: isolate detection from the chase closing the distance
      stepScavenger(s, { playerX: i % 2 === 0 ? inside : outside, playerY: 0 });
      states.push(s.chasing ? 'chase' : 'patrol');
    }

    let changes = 0;
    for (let i = 1; i < states.length; i += 1) {
      if (states[i] !== states[i - 1]) changes += 1;
    }
    expect(changes).toBeLessThanOrEqual(1);
    // Non-vacuity: it must actually have entered a chase, or "never changed" is trivially true.
    expect(states.filter((s) => s === 'chase').length).toBeGreaterThan(500);
  });

  /**
   * Hysteresis, stated as the property it is: **leaving costs more than entering.**
   * Without this the boundary is a single value and the flap above is inevitable.
   */
  it('requires the player to retreat further than the trigger distance to break the chase', () => {
    expect(SCAVENGER.releaseRadius).toBeGreaterThan(SCAVENGER.detectRadius);
  });

  it('a chase commits for a minimum number of ticks even if the player vanishes instantly', () => {
    const s = createScavenger({ x: 500, y: 0, patrolMin: 400, patrolMax: 700 });
    stepScavenger(s, { playerX: 500, playerY: 0 }); // in range → chase
    expect(s.chasing).toBe(true);

    // Player teleports far away on the very next tick.
    for (let i = 0; i < CHASE_COMMIT_TICKS - 1; i += 1) {
      stepScavenger(s, { playerX: 99999, playerY: 0 });
      expect(s.chasing).toBe(true);
    }
    stepScavenger(s, { playerX: 99999, playerY: 0 });
    expect(s.chasing).toBe(false);
  });

  /**
   * One counter plus one flag *(5.1)*. Two counters admit a state that cannot be drawn:
   * "chasing and patrolling", or "neither". Asserted on the shape, since the whole point of the
   * rule is that the unrepresentable state must not be constructible.
   */
  it('carries one counter and one flag, so there is no unrepresentable state', () => {
    const s = createScavenger({ x: 500, y: 0, patrolMin: 400, patrolMax: 700 });
    const counters = Object.entries(s).filter(([k]) => k.endsWith('Counter'));
    expect(counters.length).toBe(1);
    expect(typeof s.chasing).toBe('boolean');
  });
});

describe('detects — the imported predicate, never restated (5.3)', () => {
  it('is the same judgement the live enemy makes', () => {
    const s = createScavenger({ x: 500, y: 0, patrolMin: 400, patrolMax: 700 });
    const inside = 500 + SCAVENGER.detectRadius - 1;
    const outside = 500 + SCAVENGER.detectRadius + 1;

    expect(detects(s, { playerX: inside, playerY: 0 })).toBe(true);
    expect(detects(s, { playerX: outside, playerY: 0 })).toBe(false);

    stepScavenger(s, { playerX: inside, playerY: 0 });
    expect(s.chasing).toBe(true);
  });
});
