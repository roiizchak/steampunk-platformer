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
  SCAVENGER,
  createScavenger,
  detects,
  scavengerFooting,
  stepScavenger,
} from '../../src/sim/enemies';
import { DEFAULT_TUNING } from '../../src/sim/player';

/**
 * Ground under everything, at every height — the footing for every test that is NOT about ledges.
 *
 * One solid spanning the whole plane means `groundUnder` answers `true` for any `(x, y)` these
 * fixtures use, so a test about detection or dead zones measures detection or dead zones and not
 * terrain. The ledge behaviour has its own `describe` with its own deliberately finite floor —
 * keeping the two apart is what stops a chase test failing for a reason it never meant to assert.
 */
const EVERYWHERE = scavengerFooting([{ x: -1e6, y: -1e6, w: 2e6, h: 2e6 }], 6);
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
