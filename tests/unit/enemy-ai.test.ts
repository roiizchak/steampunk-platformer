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
import { stepEnemies } from '../../src/sim/enemyTurn';
import { createWorld } from '../../src/sim/tick';
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

describe('rust-scavenger — W2, chase dead zone and patrol-bound clamp', () => {
  it('does not flip facing when the player is unreachable straight up and barely off-axis', () => {
    const s = createScavenger({ x: 500, y: 960, patrolMin: 400, patrolMax: 700 });
    stepScavenger(s, { playerX: 504, playerY: 660 });
    expect(s.chasing).toBe(true);

    const facings: Array<1 | -1> = [];
    for (let i = 0; i < 40; i += 1) {
      stepScavenger(s, { playerX: 504, playerY: 660 });
      facings.push(s.facing);
    }
    let flips = 0;
    for (let i = 1; i < facings.length; i += 1) {
      if (facings[i] !== facings[i - 1]) flips += 1;
    }
    expect(flips).toBe(0);
  });

  it('does not move while the player sits at the same x, inside the dead zone', () => {
    const s = createScavenger({ x: 500, y: 960, patrolMin: 400, patrolMax: 700 });
    stepScavenger(s, { playerX: 500, playerY: 960 });
    expect(s.chasing).toBe(true);

    // Assert EVERY tick, not just the last — an even tick count would land back home by
    // oscillation coincidence even with the bug present, exactly the parity trap that produced a
    // false green in W1.
    const xBefore = s.x;
    for (let i = 0; i < 41; i += 1) {
      stepScavenger(s, { playerX: 500, playerY: 960 });
      expect(s.x).toBe(xBefore);
    }
  });

  it('boundary probe: 95px offset holds, 97px offset moves and turns', () => {
    const hold = createScavenger({ x: 500, y: 960, patrolMin: 0, patrolMax: 100000 });
    stepScavenger(hold, { playerX: 500 + hold.deadZone - 1, playerY: 960 });
    expect(hold.chasing).toBe(true);
    const holdX = hold.x;
    const holdFacing = hold.facing;
    stepScavenger(hold, { playerX: 500 + hold.deadZone - 1, playerY: 960 });
    expect(hold.x).toBe(holdX);
    expect(hold.facing).toBe(holdFacing);

    // A chaser closing distance is self-stabilising (it can enter its own dead zone after moving),
    // so this measures the FIRST tick only — detection and the dead-zone check both evaluate on the
    // tick chasing begins, per the existing single-call pattern above.
    const move = createScavenger({ x: 500, y: 960, patrolMin: 0, patrolMax: 100000 });
    const moveXBefore = move.x;
    stepScavenger(move, { playerX: 500 + move.deadZone + 1, playerY: 960 });
    expect(move.chasing).toBe(true);
    expect(move.x).not.toBe(moveXBefore);
    expect(move.facing).toBe(1);
  });

  it('the chase never exceeds patrolMax, and release never single-tick teleports', () => {
    const s = createScavenger({ x: 500, y: 960, patrolMin: 400, patrolMax: 700 });
    // Drive the player far to the right so the scavenger chases past its patrol bound.
    for (let i = 0; i < 60; i += 1) {
      stepScavenger(s, { playerX: 900, playerY: 960 });
      expect(s.x).toBeLessThanOrEqual(700);
    }
    expect(s.chasing).toBe(true);
    expect(s.x).toBe(700);

    // Release the chase by moving the player far away, past releaseRadius, and hold there.
    let maxDelta = 0;
    let prevX = s.x;
    for (let i = 0; i < 200; i += 1) {
      stepScavenger(s, { playerX: 99999, playerY: 960 });
      const delta = Math.abs(s.x - prevX);
      if (delta > maxDelta) maxDelta = delta;
      prevX = s.x;
    }
    expect(maxDelta).toBeLessThanOrEqual(s.chaseSpeed);
  });

  it('preserves facing toward the player when pinned at the chase boundary', () => {
    const s = createScavenger({ x: 690, y: 960, patrolMin: 400, patrolMax: 700 });
    // Enter the chase from within detectRadius first (99999 alone would never be sighted), then
    // push the player far to the right — chase pushes the scavenger to its patrolMax bound and it
    // must still face right, toward the player, not left as a patrol-branch clamp would leave it.
    stepScavenger(s, { playerX: 790, playerY: 960 });
    expect(s.chasing).toBe(true);
    for (let i = 0; i < 10; i += 1) {
      stepScavenger(s, { playerX: 99999, playerY: 960 });
    }
    expect(s.x).toBe(700);
    expect(s.chasing).toBe(true);
    expect(s.facing).toBe(1);
  });
});

describe('dead enemies stop acting — stepEnemies must filter hp <= 0', () => {
  const SCALE = 6;
  const BOUNDS = { widthPx: 8000, heightPx: 1080 };

  it('a dead sentry pushes zero projectiles and its cooldownCounter does not advance', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      bounds: BOUNDS,
      spawn: { x: 1000, y: 960 },
      enemies: [{ slug: 'brass-sentry', x: 1000, y: 960, patrolMin: 1000, patrolMax: 1000 }],
    });
    const sentry = world.enemies.sentries[0]!;
    sentry.hp = 0;
    const counterBefore = sentry.cooldownCounter;

    for (let i = 0; i < 60; i += 1) {
      stepEnemies(world);
    }

    expect(world.projectiles.length).toBe(0);
    expect(sentry.cooldownCounter).toBe(counterBefore);
  });

  it('a dead scavenger with real patrol bounds does not move, turn or start chasing', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      bounds: BOUNDS,
      // Player kept well outside detectRadius (480) so a live scavenger would only PATROL, not
      // chase — patrol drift is monotonic and deterministic, so `x` changing is never a coincidence
      // the way an oscillating chase could be.
      spawn: { x: 99999, y: 960 },
      enemies: [{ slug: 'rust-scavenger', x: 500, y: 960, patrolMin: 400, patrolMax: 900 }],
    });
    const scavenger = world.enemies.scavengers[0]!;
    scavenger.hp = 0;
    const xBefore = scavenger.x;
    const facingBefore = scavenger.facing;

    for (let i = 0; i < 60; i += 1) {
      stepEnemies(world);
    }

    expect(scavenger.x).toBe(xBefore);
    expect(scavenger.facing).toBe(facingBefore);
    expect(scavenger.chasing).toBe(false);
  });
});
