/**
 * Run and jump — QA criteria 2.1 and 2.2.
 *
 * The load-bearing test in this file is the apex, and it exists because of vault **2.14**:
 *
 *   > "Use the engine's DISCRETE integrator to compute a jump apex. A review caught a 7.4 px error
 *   > from using `v^2/2g` where the game runs semi-implicit Euler."
 *
 * So the expected apex is produced by a small independent discrete loop written from the knobs and
 * the documented step order — NOT by the closed form, and NOT by calling `tick()`. And the test
 * also asserts the closed form is **outside** tolerance, which is what stops the whole check from
 * quietly becoming vacuous: if someone retunes gravity until discrete and continuous agree within
 * 2 px, this test says so out loud instead of passing for the wrong reason *(vault C2)*.
 *
 * `apex` and `monotonic run` are REPRODUCTIONS; the rest are GUARDS *(vault C3)*.
 */

import { describe, expect, it } from 'vitest';
import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { advance, createWorld } from '../../src/sim/tick';
import { toWorld } from '../../src/sim/player';

const APEX_TOLERANCE_PX = 2;

/**
 * The expected rise in pixels, from the knobs, using semi-implicit Euler exactly as the tick order
 * specifies: the impulse overwrites gravity on the jump tick (step 7 then step 8), then position
 * integrates (step 9); every tick after that applies gravity first and then integrates.
 */
function discreteApexRise(
  jumpVelocity: number,
  gravity: number,
  maxFallSpeed: number,
  ticks = 400,
): number {
  let v = -jumpVelocity;
  let y = 0;
  let highest = 0;

  y += v;
  highest = Math.min(highest, y);

  for (let i = 1; i < ticks; i += 1) {
    v = Math.min(v + gravity, maxFallSpeed);
    y += v;
    highest = Math.min(highest, y);
  }
  return -highest;
}

describe('running (criterion 2.1)', () => {
  it('holding right moves x monotonically, bracketed by the live knob', () => {
    const world = createWorld({ seed: 3, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 10);

    const startX = world.player.x;
    input.right = true;

    const TICKS = 120;
    let previous = startX;
    for (let i = 0; i < TICKS; i += 1) {
      advance(world, input, 1);
      expect(typeof world.player.x).toBe('number');
      expect(world.player.x).toBeGreaterThanOrEqual(previous);
      previous = world.player.x;
    }

    const travelled = world.player.x - startX;
    // Floor AND ceiling, both derived from the live knob (vault 2.8). The ceiling is what a
    // "monotonically increases" assertion alone cannot give: it rules out both a one-pixel drift
    // and a runaway with no speed cap.
    expect(travelled).toBeGreaterThan(world.tuning.runMax * TICKS * 0.5);
    expect(travelled).toBeLessThanOrEqual(world.tuning.runMax * TICKS);
  });

  it('horizontal speed is capped at runMax however long the key is held', () => {
    const world = createWorld({ seed: 3, scale: 1 });
    const input = createSnapshot();
    input.right = true;
    advance(world, input, 600);

    expect(world.player.vx).toBeLessThanOrEqual(world.tuning.runMax);
    expect(world.player.vx).toBeCloseTo(world.tuning.runMax, 6);
  });

  it('facing follows the input and is not recomputed anywhere else', () => {
    const world = createWorld({ seed: 3, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 10);

    input.right = true;
    advance(world, input, 5);
    expect(world.player.facing).toBe(1);

    input.right = false;
    input.left = true;
    advance(world, input, 5);
    expect(world.player.facing).toBe(-1);

    // Releasing everything holds the last facing rather than snapping to a default.
    input.left = false;
    advance(world, input, 60);
    expect(world.player.facing).toBe(-1);
  });

  it('friction brings a released run to a full stop, not to a crawl', () => {
    const world = createWorld({ seed: 3, scale: 1 });
    const input = createSnapshot();
    input.right = true;
    advance(world, input, 60);
    expect(world.player.vx).toBeGreaterThan(0);

    input.right = false;
    advance(world, input, 300);
    expect(world.player.vx).toBe(0);
  });
});

describe('jump apex (criterion 2.2, vault 2.14)', () => {
  it('reaches the DISCRETE-integrator apex within +/-2px', () => {
    const world = createWorld({ seed: 4, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 10);
    expect(world.player.grounded).toBe(true);

    const floorY = world.player.y;
    const { jumpVelocity, gravity, maxFallSpeed } = world.tuning;

    input.jumpHeld = true;
    latchJumpPress(input);

    let highest = floorY;
    for (let i = 0; i < 400; i += 1) {
      advance(world, input, 1);
      expect(typeof world.player.y).toBe('number');
      highest = Math.min(highest, world.player.y);
      if (world.player.grounded && i > 4) {
        break;
      }
    }

    const measured = floorY - highest;
    const expectedDiscrete = discreteApexRise(jumpVelocity, gravity, maxFallSpeed);

    expect(measured).toBeGreaterThan(0);
    expect(Math.abs(measured - expectedDiscrete)).toBeLessThanOrEqual(APEX_TOLERANCE_PX);
  });

  it('a CLOSED-FORM discrete oracle agrees with the loop — not the same code twice', () => {
    // Codex implementation review I6: the accepted reason for keeping `discreteApexRise` as-is did
    // not hold. The `v^2/2g` guard proves the continuous formula differs from the loop; it does
    // NOT stop the loop and the production code from sharing one wrong step-order assumption.
    //
    // This is a genuinely independent derivation — algebra, not iteration. Under the documented
    // order the impulse overwrites gravity on the jump tick, so tick 1 rises by `v0` and tick k
    // rises by `v0 - (k-1)*g`. Summing gives a closed form with no loop in it at all:
    //
    //     rise(n) = n*v0 - g * n*(n-1)/2
    //
    // Three things must now agree: this algebra, the iterative oracle, and the simulation. A
    // shared misconception would have to survive all three, and the algebra was derived from the
    // contract in `tick.ts`'s header rather than from either implementation.
    const { jumpVelocity: v0, gravity: g, maxFallSpeed } = createWorld({ seed: 4, scale: 1 }).tuning;

    let best = 0;
    for (let n = 1; n <= 200; n += 1) {
      best = Math.max(best, n * v0 - (g * n * (n - 1)) / 2);
    }

    expect(best).toBeGreaterThan(0);
    expect(Math.abs(best - discreteApexRise(v0, g, maxFallSpeed))).toBeLessThan(1e-9);
  });

  it('the continuous formula v^2/2g is measurably WRONG here — the check is not vacuous', () => {
    const world = createWorld({ seed: 4, scale: 1 });
    const { jumpVelocity, gravity, maxFallSpeed } = world.tuning;

    const discrete = discreteApexRise(jumpVelocity, gravity, maxFallSpeed);
    const continuous = (jumpVelocity * jumpVelocity) / (2 * gravity);

    // If this ever fails, the tuning has made the two integrators agree and the apex test above
    // can no longer detect the substitution vault 2.14 is about. That is a real finding, not a
    // flaky test — retune or delete the claim, do not widen the tolerance.
    expect(Math.abs(discrete - continuous)).toBeGreaterThan(APEX_TOLERANCE_PX);
  });

  it('releasing jump early cuts the rise short (variable-height jump)', () => {
    function apexWithHold(holdTicks: number): number {
      const world = createWorld({ seed: 4, scale: 1 });
      const input = createSnapshot();
      advance(world, input, 10);
      const floorY = world.player.y;

      input.jumpHeld = true;
      latchJumpPress(input);
      advance(world, input, 1);

      let highest = world.player.y;
      for (let i = 0; i < 400; i += 1) {
        if (i >= holdTicks) {
          input.jumpHeld = false;
        }
        advance(world, input, 1);
        highest = Math.min(highest, world.player.y);
        if (world.player.grounded && i > 4) {
          break;
        }
      }
      return floorY - highest;
    }

    const short = apexWithHold(2);
    const full = apexWithHold(400);

    expect(short).toBeGreaterThan(0);
    // Floor and ceiling: a cut jump must be genuinely shorter, but not so short it never left
    // the ground (which a broken impulse would also produce).
    expect(short).toBeLessThan(full);
    expect(short).toBeGreaterThan(full * 0.15);
  });

  it('publishes the state of THIS tick, not the previous one (Codex I4)', () => {
    // Resolved before integration, the state described the position of the previous tick: a jump's
    // first airborne tick still said `idle`, and the landing tick still said `fall`. Since
    // `playerView` picks its colour straight from `state`, that was visible on screen — and no
    // test caught it, because nothing asserted state on a transition tick.
    const world = createWorld({ seed: 9, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 10);
    expect(world.player.state).toBe('idle');
    expect(world.player.grounded).toBe(true);

    input.jumpHeld = true;
    latchJumpPress(input);
    const takeoff = advance(world, input, 1);

    // The very tick the jump fires, the player is airborne and rising — so it must say so.
    expect(takeoff.jumped).toBe(true);
    expect(world.player.grounded).toBe(false);
    expect(world.player.vy).toBeLessThan(0);
    expect(world.player.state).toBe('jump');

    // Falling: still airborne, now descending.
    for (let i = 0; i < 400; i += 1) {
      advance(world, input, 1);
      if (world.player.vy > 0 && !world.player.grounded) {
        break;
      }
    }
    expect(world.player.state).toBe('fall');

    // The landing tick itself must report a grounded state, not one more tick of `fall`.
    for (let i = 0; i < 400; i += 1) {
      if (advance(world, input, 1).landed) {
        break;
      }
    }
    expect(world.player.grounded).toBe(true);
    expect(['idle', 'run']).toContain(world.player.state);
  });

  it('falling speed is clamped to maxFallSpeed', () => {
    const world = createWorld({ seed: 4, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 10);
    latchJumpPress(input);

    let fastest = 0;
    for (let i = 0; i < 600; i += 1) {
      advance(world, input, 1);
      fastest = Math.max(fastest, world.player.vy);
    }
    expect(fastest).toBeLessThanOrEqual(world.tuning.maxFallSpeed);
  });
});

describe('collision boxes are local, with one conversion out (vault 2.10, 2.11)', () => {
  it('a box authored +y up from the feet lands above the feet in world space', () => {
    const box = { x: -12, y: 0, w: 24, h: 40 };
    const world = toWorld(box, 100, 500, 1, 1);

    // World +y is DOWN, so a box sitting ON the feet occupies y in [460, 500).
    expect(world.x).toBe(88);
    expect(world.y).toBe(460);
    expect(world.w).toBe(24);
    expect(world.h).toBe(40);
  });

  it('mirroring is a sign flip, and a symmetric box is unchanged by it', () => {
    const offset = { x: 4, y: 8, w: 16, h: 10 };
    const right = toWorld(offset, 100, 500, 1, 1);
    const left = toWorld(offset, 100, 500, -1, 1);

    // The forward-facing box starts 4px ahead; mirrored it ends 4px behind. Same width, same y.
    expect(right.x).toBe(104);
    expect(left.x).toBe(100 - 4 - 16);
    expect(left.w).toBe(right.w);
    expect(left.y).toBe(right.y);

    const symmetric = { x: -8, y: 0, w: 16, h: 20 };
    expect(toWorld(symmetric, 100, 500, -1, 1)).toEqual(toWorld(symmetric, 100, 500, 1, 1));
  });

  it('scale multiplies geometry and is required, validated and never applied to velocity', () => {
    const box = { x: -10, y: 0, w: 20, h: 30 };
    const scaled = toWorld(box, 100, 500, 1, 2);

    expect(scaled.w).toBe(40);
    expect(scaled.h).toBe(60);
    expect(scaled.x).toBe(80);
    expect(scaled.y).toBe(500 - 60);

    expect(() => createWorld({ seed: 5, scale: 0 })).toThrow(/scale/i);
    expect(() => createWorld({ seed: 5, scale: -1 })).toThrow(/scale/i);

    // Vault 2.11: scaling a velocity is a balance change disguised as a rendering setting. Two
    // worlds at different scales must accelerate identically.
    const oneX = createWorld({ seed: 5, scale: 1 });
    const twoX = createWorld({ seed: 5, scale: 2 });
    const a = createSnapshot();
    const b = createSnapshot();
    a.right = true;
    b.right = true;
    advance(oneX, a, 30);
    advance(twoX, b, 30);
    expect(twoX.player.vx).toBe(oneX.player.vx);
  });
});
