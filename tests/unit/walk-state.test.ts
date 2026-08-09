/**
 * The `walk` state — criterion 4.25, and the two transition cases the Codex plan review found.
 *
 * Phase 4 needs five animations against a sim that published four states. `walk` is the fifth, and
 * it is a REAL state with a modifier key, not a render-layer relabelling: holding it lowers the
 * horizontal speed cap, so it changes how the game plays and not only how it looks.
 *
 * ## Why steady-state tests are not enough here
 *
 * The obvious implementation — clamp `vx` to whichever cap is active — is wrong in two ways that a
 * "hold right, check top speed" test cannot see, both named by Codex plan review finding 8:
 *
 *   1. **The cap can SHRINK under a moving player.** Pressing the modifier at full run speed makes
 *      a clamp an instantaneous velocity change from `runMax` to `walkMax`. It reads as a stutter,
 *      and vault 2.11 forbids papering over a velocity discontinuity in the render layer later.
 *   2. **`state` can disagree with `vx`.** With direction released, friction alone can leave the
 *      player above `walkMax` while the modifier is held — publishing `walk` while the body moves
 *      at run speed. That is the foot-slide the whole `fps = renderFrames * TICK_HZ / simTicks`
 *      derivation exists to prevent, arriving through the state machine instead of through the art.
 *
 * So the invariant below is asserted on EVERY tick of a scripted transition, not at rest.
 *
 * These are GUARDS, not reproductions *(vault C3)* — no shipped defect produced them; the plan
 * review predicted them before the code existed.
 */

import { describe, expect, it } from 'vitest';
import { createSnapshot } from '../../src/sim/input';
import { advance, createWorld } from '../../src/sim/tick';
import type { InputSnapshot } from '../../src/sim/types';

/** A flat floor with no ledge — this file measures horizontal behaviour and nothing else. */
const FLAT: { x: number; y: number; w: number; h: number }[] = [
  { x: -2000, y: 960, w: 8000, h: 120 },
];

function grounded() {
  const world = createWorld({ seed: 5, scale: 1, solids: FLAT, spawn: { x: 0, y: 960 } });
  const input = createSnapshot();
  advance(world, input, 5);
  return { world, input };
}

/** Run one tick at a time, recording the state and velocity each tick published. */
function record(
  world: ReturnType<typeof grounded>['world'],
  input: InputSnapshot,
  ticks: number,
): { state: string; vx: number }[] {
  const samples: { state: string; vx: number }[] = [];
  for (let i = 0; i < ticks; i += 1) {
    advance(world, input, 1);
    samples.push({ state: world.player.state, vx: world.player.vx });
  }
  return samples;
}

describe('walk is a real state with a real cap (criterion 4.25)', () => {
  it('holding walk caps horizontal speed at walkMax, not runMax', () => {
    const { world, input } = grounded();
    input.right = true;
    input.walkHeld = true;
    advance(world, input, 60);

    // Derived from the live knob, never a literal — the Phase 3 re-tune doubled every distance
    // knob and a literal here would have had to be found by hand.
    expect(world.player.vx).toBeCloseTo(world.tuning.walkMax, 6);
    expect(world.player.vx).toBeLessThan(world.tuning.runMax);
    expect(world.player.state).toBe('walk');
  });

  it('releasing walk accelerates back up to runMax', () => {
    const { world, input } = grounded();
    input.right = true;
    input.walkHeld = true;
    advance(world, input, 60);
    input.walkHeld = false;
    advance(world, input, 60);

    expect(world.player.vx).toBeCloseTo(world.tuning.runMax, 6);
    expect(world.player.state).toBe('run');
  });

  it('walkMax and runMax are actually different, so every assertion here means something', () => {
    const { world } = grounded();
    expect(world.tuning.walkMax).toBeLessThan(world.tuning.runMax);
    expect(world.tuning.walkMax).toBeGreaterThan(0);
  });
});

describe('the invariant: state === walk implies |vx| <= walkMax (Codex finding 8, case 2)', () => {
  it('holds on every tick while decelerating from run speed with the modifier held', () => {
    const { world, input } = grounded();
    input.right = true;
    advance(world, input, 60); // at runMax
    expect(world.player.vx).toBeCloseTo(world.tuning.runMax, 6);

    // Release direction and hold walk: friction alone takes several ticks to fall under walkMax.
    input.right = false;
    input.walkHeld = true;
    const samples = record(world, input, 20);

    const violations = samples.filter(
      (s) => s.state === 'walk' && Math.abs(s.vx) > world.tuning.walkMax + 1e-9,
    );
    expect(
      violations,
      `published "walk" while faster than walkMax on ${violations.length} tick(s): ` +
        violations.map((v) => v.vx.toFixed(3)).join(', '),
    ).toHaveLength(0);

    // Anti-vacuity: the scenario must actually spend ticks above walkMax, or it proves nothing.
    const aboveCap = samples.filter((s) => Math.abs(s.vx) > world.tuning.walkMax + 1e-9);
    expect(aboveCap.length, 'scenario never exceeded walkMax — it cannot test the rule').
      toBeGreaterThan(0);
  });

  it('holds on every tick while still pushing direction after the cap shrinks', () => {
    const { world, input } = grounded();
    input.right = true;
    advance(world, input, 60);

    input.walkHeld = true; // cap shrinks under a moving player, direction still held
    const samples = record(world, input, 20);

    const violations = samples.filter(
      (s) => s.state === 'walk' && Math.abs(s.vx) > world.tuning.walkMax + 1e-9,
    );
    expect(violations, 'published "walk" above walkMax while accelerating').toHaveLength(0);

    const aboveCap = samples.filter((s) => Math.abs(s.vx) > world.tuning.walkMax + 1e-9);
    expect(aboveCap.length, 'scenario never exceeded walkMax').toBeGreaterThan(0);
  });
});

describe('no velocity snap when the cap changes (Codex finding 8, case 1)', () => {
  it('pressing walk at full run speed bleeds toward the cap instead of clamping in one tick', () => {
    const { world, input } = grounded();
    input.right = true;
    advance(world, input, 60);
    const before = world.player.vx;
    expect(before).toBeCloseTo(world.tuning.runMax, 6);

    input.walkHeld = true;
    const samples = record(world, input, 30);

    // The largest single-tick change must be within what a knob can actually produce. A clamp
    // would move runMax -> walkMax in one tick; the knobs cannot.
    const budget = Math.max(world.tuning.runAccel, world.tuning.groundFriction) + 1e-9;
    let previous = before;
    const jumps: number[] = [];
    for (const s of samples) {
      const delta = Math.abs(s.vx - previous);
      if (delta > budget) {
        jumps.push(delta);
      }
      previous = s.vx;
    }
    expect(
      jumps,
      `single-tick velocity change exceeded max(runAccel, groundFriction)=${budget.toFixed(3)}: ` +
        jumps.map((j) => j.toFixed(3)).join(', '),
    ).toHaveLength(0);

    // And it must actually arrive at the cap, not merely avoid snapping by never converging.
    expect(world.player.vx).toBeCloseTo(world.tuning.walkMax, 6);
  });

  it('the snap this guards against is larger than the budget, so the guard is not vacuous', () => {
    const { world } = grounded();
    const snap = world.tuning.runMax - world.tuning.walkMax;
    const budget = Math.max(world.tuning.runAccel, world.tuning.groundFriction);
    expect(
      snap,
      'runMax and walkMax are close enough that a clamp would pass the no-snap test',
    ).toBeGreaterThan(budget);
  });
});

describe('the one door still derives every state (vault 2.6)', () => {
  it('publishes walk only while grounded — airborne states ignore the modifier', () => {
    const { world, input } = grounded();
    input.right = true;
    input.walkHeld = true;
    input.jumpHeld = true;
    input.jumpPressed = true;
    advance(world, input, 3);

    expect(world.player.grounded).toBe(false);
    expect(['jump', 'fall']).toContain(world.player.state);
  });

  it('publishes idle, not walk, when the modifier is held with no direction', () => {
    const { world, input } = grounded();
    input.walkHeld = true;
    advance(world, input, 10);

    expect(world.player.vx).toBe(0);
    expect(world.player.state).toBe('idle');
  });
});
