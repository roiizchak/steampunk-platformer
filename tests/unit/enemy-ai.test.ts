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
  createScavenger,
  createSentry,
  detects,
  groundUnder,
  scavengerFooting,
  stepScavenger,
  stepSentry,
  withinRadius,
} from '../../src/sim/enemies';
import { ATTACK, attackTotalTicks } from '../../src/sim/combat';
import { DEFAULT_TUNING } from '../../src/sim/player';
import { TILE_SIZE } from '../../src/game/constants';
import { createSnapshot, latchAttackPress } from '../../src/sim/input';
import { stepEnemies } from '../../src/sim/enemyTurn';
import { createWorld, tick } from '../../src/sim/tick';
import { sentryRenderDesc } from '../../src/render/enemyView';

/** The sentry sits at x=1000; the player is placed relative to it. */
function sentryAt(x: number) {
  return createSentry({ x, y: 0 });
}

/**
 * Ground under everything, at every height — the footing for every test that is NOT about ledges.
 *
 * One solid spanning the whole plane means `groundUnder` answers `true` for any `(x, y)` these
 * fixtures use, so a test about detection or dead zones measures detection or dead zones and not
 * terrain. The ledge behaviour has its own `describe` with its own deliberately finite floor —
 * keeping the two apart is what stops a chase test failing for a reason it never meant to assert.
 */
const EVERYWHERE = scavengerFooting([{ x: -1e6, y: -1e6, w: 2e6, h: 2e6 }], 6);

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

describe('rust-scavenger — criterion 5.2', () => {
  it('patrols between its bounds and turns at them, without drifting out', () => {
    const s = createScavenger({ x: 500, y: 0, patrolMin: 400, patrolMax: 700 });
    const xs: number[] = [];
    for (let i = 0; i < 2000; i += 1) {
      stepScavenger(s, { playerX: 99999, playerY: 0 }, EVERYWHERE);
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
      stepScavenger(base, far, EVERYWHERE);
      stepScavenger(faster, far, EVERYWHERE);
    }
    expect(Math.abs(faster.x - 500)).toBeGreaterThan(Math.abs(base.x - 500));
  });

  /**
   * Chase must be OUT-RUNNABLE, and that matters more now than when it was written.
   *
   * Aggro is permanent as of 2026-08-14, so out-running the scavenger no longer ends the chase — it
   * only buys ground. If the chase were as fast as the run, "keep coming until I kill it" would mean
   * "you must kill it", and a player who does not want that fight would have no move at all.
   *
   * 🔴 The bounds are DERIVED, not typed. This test used to read `toBeLessThan(12.0)` with the knob
   * name in a comment, so it stayed green through two speed re-tunes and would have passed at 7.9 —
   * Codex plan review finding 10. `DEFAULT_TUNING` is the authority for both ends now.
   */
  it('chases slower than a running player and faster than a walking one', () => {
    expect(SCAVENGER.chaseSpeed).toBeLessThan(DEFAULT_TUNING.runMax);
    expect(SCAVENGER.chaseSpeed).toBeGreaterThan(DEFAULT_TUNING.walkMax);
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
   * 🔴 **The mechanism it guards changed on 2026-08-14; the test did not, and that is the point.**
   * It was written against hysteresis (`detectRadius` to enter, a larger `releaseRadius` to leave)
   * and used to be verified red by collapsing the two thresholds into one — 1 state change became
   * ~20. Both thresholds are gone now: aggro is permanent, so the only transition is
   * patrol → chase and a second one is unreachable by construction.
   *
   * It is kept, unchanged, because it asserts the PROPERTY (the drawn state does not oscillate) and
   * not the implementation. Verified red against the current code by making the chase clearable —
   * adding `else if (!detects(...)) scavenger.chasing = false` to `stepScavenger` takes it back to
   * ~300 changes.
   */
  it('does not flap when the player oscillates across the detection boundary', () => {
    const s = createScavenger({ x: 500, y: 0, patrolMin: 400, patrolMax: 700 });
    const inside = 500 + SCAVENGER.detectRadius - 10;
    const outside = 500 + SCAVENGER.detectRadius + 10;

    const states: string[] = [];
    for (let i = 0; i < 600; i += 1) {
      s.x = 500; // pinned: isolate detection from the chase closing the distance
      stepScavenger(s, { playerX: i % 2 === 0 ? inside : outside, playerY: 0 }, EVERYWHERE);
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
   * 🔴 **The reversal, asserted directly.** This slot used to hold two tests —
   * `releaseRadius > detectRadius` and "a chase commits for `CHASE_COMMIT_TICKS`" — and the second
   * one ended `expect(s.chasing).toBe(false)`, which is exactly what the user asked to stop
   * happening: *"it should keep coming until I kill it"* (2026-08-14).
   *
   * Both mechanisms are gone rather than re-tuned, and the flap test above still passes without
   * them, because **a state with no exit cannot flap**. That is the property worth having; the
   * hysteresis gap was only ever an approximation of it.
   *
   * 1000 ticks is 16 seconds of the player being 100 000 px away — two orders of magnitude past the
   * old 720 px release. If anything in the sim can still end a chase from geometry, this finds it.
   */
  it('never gives up: a chase entered once survives the player leaving the level', () => {
    const s = createScavenger({ x: 500, y: 0, patrolMin: 400, patrolMax: 700 });
    stepScavenger(s, { playerX: 500, playerY: 0 }, EVERYWHERE); // in range → chase
    expect(s.chasing).toBe(true);

    for (let i = 0; i < 1000; i += 1) {
      stepScavenger(s, { playerX: 99999, playerY: 0 }, EVERYWHERE);
      expect(s.chasing).toBe(true);
    }
    // Non-vacuity: the counter must be counting the episode, or "still chasing" could be a flag
    // nothing ever reads. It is the ONE counter vault 5.1 allows, and this is what it is now for.
    expect(s.chaseCounter).toBe(1000);
  });

  /**
   * The detection radius is still a real threshold — permanence starts a chase no earlier than the
   * old rule did. Without this, "never gives up" would also pass on a scavenger that chases from
   * the first tick regardless of where the player is, which is a different game.
   */
  it('does not start a chase from outside the detection radius, however long it waits', () => {
    // Bounds pinned to a point: a patrolling scavenger walks its beat, and one that walked RIGHT
    // would close on the player and detect them legitimately — which would fail this test for a
    // reason that is not the one it asserts.
    const s = createScavenger({ x: 500, y: 0, patrolMin: 500, patrolMax: 500 });
    for (let i = 0; i < 600; i += 1) {
      stepScavenger(s, { playerX: 500 + SCAVENGER.detectRadius + 1, playerY: 0 }, EVERYWHERE);
    }
    expect(s.chasing).toBe(false);
    expect(s.chaseCounter).toBe(0);
  });

  /**
   * Vault 5.1's shape rule, as a **named allowlist** rather than a count.
   *
   * The rule is about counters on the SAME axis: two of those admit a state that cannot be drawn —
   * "chasing and patrolling", or neither — and the point is that the unrepresentable state must not
   * be constructible.
   *
   * 🔴 This was `expect(counters.length).toBe(1)` until 2026-08-14, when the scavenger gained a
   * swing and with it `attackCounter`. **Bumping that literal to `2` would have been exactly the
   * loosening this project bans**: the next counter would have bumped it to 3, and the rule would
   * have decayed into a tally nobody reads.
   *
   * Naming them is strictly stronger. A third counter still fails; a *renamed* counter fails; and
   * the two that exist had to be written down here, which is the review step a number does not
   * force. `attackCounter` is a different axis from `chaseCounter` — a scavenger may legitimately
   * be chasing AND mid-swing, and `scavengerAnim` resolves that by precedence — so it does not
   * reintroduce the contradiction 5.1 forbids.
   */
  it('carries exactly the two named counters and one flag — no unrepresentable state', () => {
    const s = createScavenger({ x: 500, y: 0, patrolMin: 400, patrolMax: 700 });
    const counters = Object.keys(s).filter((k) => k.endsWith('Counter')).sort();
    expect(counters).toEqual(['attackCounter', 'chaseCounter']);
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

    stepScavenger(s, { playerX: inside, playerY: 0 }, EVERYWHERE);
    expect(s.chasing).toBe(true);
  });
});

describe('rust-scavenger — W2, chase dead zone and patrol-bound clamp', () => {
  it('does not flip facing when the player is unreachable straight up and barely off-axis', () => {
    const s = createScavenger({ x: 500, y: 960, patrolMin: 400, patrolMax: 700 });
    stepScavenger(s, { playerX: 504, playerY: 660 }, EVERYWHERE);
    expect(s.chasing).toBe(true);

    const facings: Array<1 | -1> = [];
    for (let i = 0; i < 40; i += 1) {
      stepScavenger(s, { playerX: 504, playerY: 660 }, EVERYWHERE);
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
    stepScavenger(s, { playerX: 500, playerY: 960 }, EVERYWHERE);
    expect(s.chasing).toBe(true);

    // Assert EVERY tick, not just the last — an even tick count would land back home by
    // oscillation coincidence even with the bug present, exactly the parity trap that produced a
    // false green in W1.
    const xBefore = s.x;
    for (let i = 0; i < 41; i += 1) {
      stepScavenger(s, { playerX: 500, playerY: 960 }, EVERYWHERE);
      expect(s.x).toBe(xBefore);
    }
  });

  /**
   * ⚠️ **`attackRange: 0` disables the swing so the DEAD ZONE is what is being measured.**
   *
   * The shipped `attackRange` is 144 px and `deadZone` is 96, so the whole dead-zone boundary lives
   * *inside* attack range: at the shipped tuning a player 97 px away is swung at, not walked toward,
   * and the body is planted for the 36 ticks that takes. That is correct behaviour and it makes this
   * probe unable to see the rule it is named for — the hold at 95 would pass for the wrong reason
   * and the move at 97 would fail for the wrong reason.
   *
   * Zero is representable and means "never in range" (`Math.abs(dx) <= 0` only at dx === 0), so the
   * fixture isolates one rule instead of measuring the interaction of two. The interaction itself is
   * asserted separately, in the swing tests below.
   */
  it('boundary probe: 95px offset holds, 97px offset moves and turns', () => {
    const hold = createScavenger({ x: 500, y: 960, patrolMin: 0, patrolMax: 100000, attackRange: 0 });
    stepScavenger(hold, { playerX: 500 + hold.deadZone - 1, playerY: 960 }, EVERYWHERE);
    expect(hold.chasing).toBe(true);
    const holdX = hold.x;
    const holdFacing = hold.facing;
    stepScavenger(hold, { playerX: 500 + hold.deadZone - 1, playerY: 960 }, EVERYWHERE);
    expect(hold.x).toBe(holdX);
    expect(hold.facing).toBe(holdFacing);

    // A chaser closing distance is self-stabilising (it can enter its own dead zone after moving),
    // so this measures the FIRST tick only — detection and the dead-zone check both evaluate on the
    // tick chasing begins, per the existing single-call pattern above.
    const move = createScavenger({ x: 500, y: 960, patrolMin: 0, patrolMax: 100000, attackRange: 0 });
    const moveXBefore = move.x;
    stepScavenger(move, { playerX: 500 + move.deadZone + 1, playerY: 960 }, EVERYWHERE);
    expect(move.chasing).toBe(true);
    expect(move.x).not.toBe(moveXBefore);
    expect(move.facing).toBe(1);
  });

  /**
   * 🔴 **The patrol clamp no longer applies to a chase, and this is the test that used to say the
   * opposite.** It read *"the chase never exceeds patrolMax"* and ended `expect(s.x).toBe(700)`.
   *
   * That clamp IS the bug the user reported: *"after it sees me, it gets stuck after I get far from
   * him."* A chasing scavenger driven past its patrol bound was pinned there, playing a run
   * animation while covering no ground — which on screen reads as broken, not as territorial. The
   * bound is a PATROL beat, a level-design number about where an idle machine walks; it was never
   * meant to be the reach of a hunt.
   *
   * A chase is now bounded by GROUND instead, which is a physical limit rather than an authored one.
   */
  it('leaves its patrol zone to keep chasing, rather than pinning at the bound', () => {
    const s = createScavenger({ x: 500, y: 960, patrolMin: 400, patrolMax: 700 });
    // Sighted from inside detectRadius first — 3000 alone is 2500 px away and would never be seen.
    // From here on the chase is permanent, so the player can run as far as they like.
    stepScavenger(s, { playerX: 900, playerY: 960 }, EVERYWHERE);
    expect(s.chasing).toBe(true);
    for (let i = 0; i < 600; i += 1) {
      stepScavenger(s, { playerX: 3000, playerY: 960 }, EVERYWHERE);
    }
    expect(s.chasing).toBe(true);
    expect(s.x).toBeGreaterThan(700);
    // It closed on the player rather than merely drifting: 60 ticks at chaseSpeed covers the gap.
    expect(Math.abs(3000 - s.x)).toBeLessThan(s.deadZone + s.chaseSpeed);
  });

  it('never teleports — no single tick moves it further than one chaseSpeed', () => {
    const s = createScavenger({ x: 500, y: 960, patrolMin: 400, patrolMax: 700 });
    stepScavenger(s, { playerX: 900, playerY: 960 }, EVERYWHERE);
    let maxDelta = 0;
    let prevX = s.x;
    for (let i = 0; i < 200; i += 1) {
      stepScavenger(s, { playerX: 99999, playerY: 960 }, EVERYWHERE);
      const delta = Math.abs(s.x - prevX);
      if (delta > maxDelta) maxDelta = delta;
      prevX = s.x;
    }
    expect(maxDelta).toBeLessThanOrEqual(s.chaseSpeed);
    // Non-vacuity: it must have MOVED at all, or a frozen scavenger passes the line above trivially.
    expect(maxDelta).toBe(s.chaseSpeed);
  });
});

/**
 * Ground-following — the limit that replaced the patrol clamp.
 *
 * The user's decision (2026-08-14): the scavenger may leave its patrol zone to chase, but only where
 * its **whole body** has ground. It never floats, and it never falls — enemies still have no gravity
 * and no collision, deliberately, so `groundUnder` is a veto on a step and nothing more.
 */
describe('rust-scavenger — a chase stops at the edge of the floor', () => {
  /** A ledge ending at x = 2000, with the scavenger's feet on its top surface at y = 960. */
  const LEDGE = scavengerFooting([{ x: 0, y: 960, w: 2000, h: 500 }], 6);

  /** Sight the player from inside `detectRadius`, then have them flee past the drop and stay there. */
  function seeThenFlee(s: ReturnType<typeof createScavenger>): void {
    stepScavenger(s, { playerX: 1600, playerY: 960 }, LEDGE);
    for (let i = 0; i < 300; i += 1) {
      stepScavenger(s, { playerX: 5000, playerY: 960 }, LEDGE);
    }
  }

  it('stops before its LEADING EDGE leaves the floor, not when its centre does', () => {
    const s = createScavenger({ x: 1500, y: 960, patrolMin: 0, patrolMax: 100000 });
    seeThenFlee(s);
    expect(s.chasing).toBe(true);
    // 🔴 The body is 120 px wide, so the last legal centre is a half-body back from the drop —
    // and this bound is what a CENTRE probe (Codex plan review finding 7) would fail: it would
    // happily walk to 2000 and leave half a scavenger hanging over the void.
    expect(s.x).toBeLessThanOrEqual(2000 - LEDGE.halfWidthPx);
    // ...but it did walk right up to it. A scavenger that stopped early for any other reason —
    // a surviving clamp, a stalled chase — fails here.
    expect(s.x).toBeGreaterThan(2000 - LEDGE.halfWidthPx - s.chaseSpeed);
  });

  it('keeps FACING the player it cannot reach, so it does not read as having given up', () => {
    const s = createScavenger({ x: 1500, y: 960, patrolMin: 0, patrolMax: 100000 });
    seeThenFlee(s);
    expect(s.facing).toBe(1);
    expect(s.chasing).toBe(true);
  });

  it('walks back off the edge the moment the player is on the reachable side again', () => {
    const s = createScavenger({ x: 1500, y: 960, patrolMin: 0, patrolMax: 100000 });
    seeThenFlee(s);
    const stopped = s.x;
    for (let i = 0; i < 100; i += 1) {
      stepScavenger(s, { playerX: 200, playerY: 960 }, LEDGE);
    }
    expect(s.x).toBeLessThan(stopped);
    expect(s.facing).toBe(-1);
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

  /**
   * 🔴 **Codex plan review finding 3.** The test below was vacuous for the half that mattered: it
   * sets `hp = 0` on a scavenger that had **never chased**, so `expect(chasing).toBe(false)` passed
   * on the initial value of the field and would have passed with the death transition deleted.
   *
   * It could be ignored while a chase lapsed on its own. It cannot now: aggro is permanent, so death
   * is the ONLY exit, and a corpse left flagged `chasing` would keep `enemyView` picking the `chase`
   * sheet for a body that is not going anywhere.
   *
   * The kill is done with **real swings against a live enemy**, not by assigning `hp = 0` — which is
   * separately the gap (T2) that let a dead-enemy defect ship past the entire Phase 5 gate: 5.10 and
   * 5.16 both zeroed hp directly, and the closest real swing stopped two hits short of a kill.
   */
  it('a CHASING scavenger, killed by real swings, stops chasing', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      bounds: BOUNDS,
      solids: [{ x: 0, y: 960, w: 8000, h: 120 }],
      spawn: { x: 1000, y: 960 },
      // 1200 is `player-attack.test.ts`'s IN_REACH: clear of the player's own 132 px box and inside
      // the swing's reach, a gap only `ATTACK_BOX` crosses.
      enemies: [{ slug: 'rust-scavenger', x: 1200, y: 960, patrolMin: 1100, patrolMax: 1300 }],
    });
    const scavenger = world.enemies.scavengers[0]!;

    // Chasing FIRST — the whole point, and what the old version of this test never established.
    // 200 px is well inside the 480 px detect radius.
    stepEnemies(world);
    expect(scavenger.chasing).toBe(true);

    // Then freeze it where it stands. A chaser that closes to contact puts the player in `hurt`,
    // where `canAct` is false and no swing ever starts — the same reason `player-attack.test.ts`
    // disables approach. `chasing` stays true, which is the state under test.
    scavenger.chaseSpeed = 0;

    let killed = false;
    for (let swing = 0; swing < 20 && !killed; swing += 1) {
      // `attackPressed` is an EDGE: re-latched per swing, so a held key cannot become a second hit.
      const input = createSnapshot();
      latchAttackPress(input);
      for (let i = 0; i < attackTotalTicks(ATTACK) + 4; i += 1) {
        tick(world, input);
      }
      killed = scavenger.hp <= 0;
    }

    expect(killed, 'the swing loop never actually killed it — the rest asserts nothing').toBe(true);
    // `tick` runs `stepEnemies`, so the clear has already happened by here — asserted after a kill
    // that took real damage through the real attack path, not after an assignment.
    expect(scavenger.chasing).toBe(false);
    expect(scavenger.chaseCounter).toBe(0);
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

/**
 * `withinRadius` and `groundUnder` — the two shared geometry predicates, tested directly.
 *
 * ## T6: deleting `dy * dy` used to turn nothing red
 *
 * `withinRadius` is the single definition BOTH enemies consult (vault 5.3) and it had no direct
 * test. Every fixture that reached it did so through a sentry or a scavenger, and **every one of
 * those placed the enemy and the player at the same `y`** — `y: 0` against `playerY: 0`. With
 * `dy === 0` the vertical term contributes nothing, so removing it from the distance entirely left
 * the whole suite green. The radius was, in effect, only ever tested as a horizontal one.
 *
 * That matters in the shipped level rather than in theory: `level-01` stands its sentry on a ledge
 * four tiles above the player, which is the geometry `enemyTurn.ts` aims the muzzle for.
 */
describe('the shared geometry predicates, asserted directly', () => {
  it('withinRadius measures TRUE distance — a purely vertical gap counts (T6)', () => {
    const at = { playerX: 1000, playerY: 1000 - 500 };
    // Directly above, 500 px up, against a 480 px radius. Out of range — and a predicate that
    // ignored `dy` would compute a distance of 0 and report the player as sighted.
    expect(withinRadius(1000, 1000, at, 480)).toBe(false);
    // The same 500 px gap, now horizontal. Both must answer the same way, or the radius is an
    // ellipse and the sentry can see further along one axis than the other.
    expect(withinRadius(1000, 1000, { playerX: 1500, playerY: 1000 }, 480)).toBe(false);
  });

  it('a DIAGONAL player is judged on the hypotenuse, not on either leg', () => {
    // 300 across and 400 up is exactly 500 by Pythagoras. Each leg alone is inside 480; the true
    // distance is not. This is the case a per-axis test cannot express.
    const diagonal = { playerX: 1000 + 300, playerY: 1000 - 400 };
    expect(withinRadius(1000, 1000, diagonal, 480)).toBe(false);
    expect(withinRadius(1000, 1000, diagonal, 500)).toBe(true); // `<=`, exactly on the boundary
  });

  it('the boundary is EXACT, because squares are compared rather than a square root', () => {
    // `sqrt` returns a float, and comparing a float against an integer radius makes "exactly on
    // the boundary" depend on rounding — which is precisely where the flap test parks the player.
    expect(withinRadius(0, 0, { playerX: 480, playerY: 0 }, 480)).toBe(true);
    expect(withinRadius(0, 0, { playerX: 481, playerY: 0 }, 480)).toBe(false);
  });

  it('groundUnder probes BELOW the feet, so a foot line on a surface reads as supported', () => {
    const floor = [{ x: 0, y: 960, w: 1000, h: 120 }];
    // Feet exactly on the top edge — the normal case, and a boundary comparison at `y` itself
    // would be at the mercy of a level authored half a pixel out.
    expect(groundUnder(500, 960, floor)).toBe(true);
    // Past the right end, and before the left one.
    expect(groundUnder(1001, 960, floor)).toBe(false);
    expect(groundUnder(-1, 960, floor)).toBe(false);
    // Standing at the right height for NO floor at all.
    expect(groundUnder(500, 500, floor)).toBe(false);
    expect(groundUnder(500, 960, [])).toBe(false);
  });
});
