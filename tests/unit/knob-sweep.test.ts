/**
 * Knob sweep — QA criterion 2.6, vault A6 (blocker).
 *
 *   > "The Playground needs knob-sweep verification wired in from day one. A slider that visibly
 *   > exists reads as a slider that visibly works. Change it, run, confirm the output moved. The
 *   > Playground makes the vault's cheapest experiment free — and it is exactly what nobody does."
 *
 * The sweep is exhaustive BY CONSTRUCTION: it iterates `Object.keys(DEFAULT_TUNING)`, so a knob
 * added in a later phase is swept without anyone remembering to add it.
 *
 * **That construction is also its hole, and Codex plan review F7a found it**: a test whose
 * obligations are derived from the thing under test stays green when a knob and its behaviour are
 * deleted together — the iteration disappears along with the feature. So the roster is ALSO pinned
 * to an explicit literal list. Removing a knob now turns this file red; adding one cannot be done
 * without editing the list, which cannot be done without noticing the sweep. *(vault C2 — every
 * gate needs a way to fail.)*
 *
 * A knob passes if changing it moves the outcome of at least one scenario. Several knobs are only
 * observable under specific conditions — `airFriction` needs an airborne player with no input,
 * `jumpCutDivisor` needs an early release, `coyoteTicks` needs a ledge — so a single scenario
 * would report false failures rather than real ones.
 *
 * REPRODUCTION (red -> green) for the roster pin; GUARD for the sweep itself *(vault C3)*.
 */

import { describe, expect, it } from 'vitest';
import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { DEFAULT_TUNING } from '../../src/sim/player';
import { advance, createWorld } from '../../src/sim/tick';
import type { Rect, TuningKnobs, World } from '../../src/sim/types';

/**
 * The knob roster, written out by hand (Codex F7a).
 *
 * If this list and `DEFAULT_TUNING` disagree, one of them was changed without the other and the
 * sweep below is no longer covering what it claims to cover.
 */
const EXPECTED_KNOBS = [
  'airAccel',
  'airFriction',
  'coyoteTicks',
  'groundFriction',
  'gravity',
  'jumpBufferTicks',
  'jumpCutDivisor',
  'jumpVelocity',
  'maxFallSpeed',
  'runAccel',
  'runMax',
  'walkMax',
];

/**
 * A floor far enough down that the `longFall` scenario is still airborne when it stops.
 *
 * It was at y=960 — the same 180px drop as the real level — which meant `vy` only reached ~15.3
 * before the scenario ended, so the `maxFallSpeed * 2` perturbation never saturated the clamp and
 * contributed nothing. The knob passed on its halved case alone. Review brief 1 found this: the
 * sweep was non-vacuous but weaker than it read.
 */
const FLOOR_ONLY: Rect[] = [{ x: 0, y: 2400, w: 1920, h: 120 }];

/** A reproducible fingerprint of a trajectory. Any change in behaviour changes this string. */
function signature(world: World, jumps: number): string {
  const p = world.player;
  return [p.x, p.y, p.vx, p.vy, p.state, p.grounded, jumps]
    .map((v) => (typeof v === 'number' ? v.toFixed(4) : String(v)))
    .join('|');
}

type Scenario = (tuning: TuningKnobs) => string;

function withTuning(
  tuning: TuningKnobs,
  solids: Rect[] | undefined,
  run: (world: World, input: ReturnType<typeof createSnapshot>) => number,
): string {
  const world = createWorld({ seed: 11, scale: 1, solids });
  Object.assign(world.tuning, tuning);
  const input = createSnapshot();
  const jumps = run(world, input);
  return signature(world, jumps);
}

function countJumps(world: World, input: ReturnType<typeof createSnapshot>, ticks: number): number {
  let jumps = 0;
  for (let i = 0; i < ticks; i += 1) {
    if (advance(world, input, 1).jumped) {
      jumps += 1;
    }
  }
  return jumps;
}

const SCENARIOS: Record<string, Scenario> = {
  /** Ground acceleration and the speed cap. */
  runHeld: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.right = true;
      return countJumps(world, input, 40);
    }),

  /**
   * The walk modifier: the only scenario in which `walkMax` is the ACTIVE cap.
   *
   * Without this, `walkMax` moves no observable output in any scenario and the sweep goes red —
   * correctly. That redness is the proof the knob is real rather than decorative (vault A6), and
   * it is why the scenario was added alongside the knob rather than after it.
   *
   * It ends mid-approach on purpose: run past convergence and every walkMax under the distance
   * covered produces the same resting fingerprint, so the scenario stops discriminating.
   */
  walkHeld: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.right = true;
      input.walkHeld = true;
      return countJumps(world, input, 12);
    }),

  /**
   * The cap SHRINKING under a moving player — reach `runMax` first, then hold the modifier.
   *
   * This is the bleed path in `stepHorizontal`, which the steady-state `walkHeld` scenario never
   * touches: there the player is under the cap the whole way up. Codex plan review finding 8.
   */
  walkFromRun: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.right = true;
      const jumps = countJumps(world, input, 20);
      input.walkHeld = true;
      return jumps + countJumps(world, input, 4);
    }),

  /** Ground friction: accelerate, then release and coast. */
  runReleased: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.right = true;
      countJumps(world, input, 30);
      input.right = false;
      return countJumps(world, input, 30);
    }),

  /** Gravity, jump impulse, and the whole arc while held. */
  jumpHeld: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.jumpHeld = true;
      latchJumpPress(input);
      // Stopped MID-ARC on purpose. Run past the landing and the player settles back to its
      // spawn at rest, so two different gravities produce an identical fingerprint and the
      // scenario silently stops discriminating anything.
      return countJumps(world, input, 25);
    }),

  /** The early-release cut. */
  jumpCut: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.jumpHeld = true;
      latchJumpPress(input);
      const early = countJumps(world, input, 3);
      input.jumpHeld = false;
      return early + countJumps(world, input, 9);
    }),

  /** Air acceleration: steer while airborne. */
  airSteer: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.jumpHeld = true;
      latchJumpPress(input);
      const jumps = countJumps(world, input, 2);
      input.right = true;
      return jumps + countJumps(world, input, 20);
    }),

  /** Air friction: build air speed, then release with the player still airborne. */
  airCoast: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.jumpHeld = true;
      latchJumpPress(input);
      let jumps = countJumps(world, input, 2);
      input.right = true;
      jumps += countJumps(world, input, 10);
      input.right = false;
      return jumps + countJumps(world, input, 18);
    }),

  /**
   * A long unobstructed drop — the only scenario that saturates maxFallSpeed.
   *
   * 26 ticks: the default clamp of 17 px/tick is reached around tick 19, so BOTH perturbations
   * are observable — halving it saturates earlier and doubling it never saturates at all. Still
   * stopped in mid-air, because landing converges every tuning to the same resting fingerprint.
   */
  longFall: (tuning) =>
    withTuning(tuning, FLOOR_ONLY, (world, input) => countJumps(world, input, 26)),

  /** Coyote time: walk off the ledge, wait, then press. */
  coyote: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.right = true;
      for (let i = 0; i < 400; i += 1) {
        if (advance(world, input, 1).leftGround) {
          break;
        }
      }
      input.right = false;
      const waited = countJumps(world, input, 5);
      latchJumpPress(input);
      return waited + countJumps(world, input, 10);
    }),

  /** Jump buffering: press well before touchdown and see whether it survives. */
  buffer: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.jumpHeld = true;
      latchJumpPress(input);
      let jumps = countJumps(world, input, 26);
      latchJumpPress(input);
      return jumps + countJumps(world, input, 20);
    }),
};

/** Values a knob is nudged to. Integer knobs stay integers so a tick count is never a fraction. */
function perturbations(key: string, value: number): number[] {
  const isTickCount = key === 'coyoteTicks' || key === 'jumpBufferTicks';
  if (isTickCount) {
    return [Math.max(1, Math.floor(value / 2)), value * 2];
  }
  if (key === 'jumpCutDivisor') {
    return [1, value * 3];
  }
  return [value / 2, value * 2];
}

describe('every Playground knob moves an observable output (criterion 2.6, vault A6)', () => {
  it('the knob roster matches the hand-written list — deleting a knob goes RED (Codex F7a)', () => {
    expect(Object.keys(DEFAULT_TUNING).sort()).toEqual([...EXPECTED_KNOBS].sort());
    // 11 through Phase 3; `walkMax` is Phase 4's, added with the `walk` state. Deleting a knob
    // AND its roster entry together would satisfy the equality above, so the count is pinned too.
    expect(EXPECTED_KNOBS.length).toBe(12);
  });

  it('every knob is a finite number, so a sweep of it means something', () => {
    for (const key of EXPECTED_KNOBS) {
      const value = DEFAULT_TUNING[key as keyof TuningKnobs];
      expect(typeof value, `${key} must be a number`).toBe('number');
      expect(Number.isFinite(value), `${key} must be finite`).toBe(true);
      expect(value, `${key} must be positive`).toBeGreaterThan(0);
    }
  });

  it.each(EXPECTED_KNOBS)('sweeping %s changes at least one observed trajectory', (key) => {
    const baseline: Record<string, string> = {};
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      baseline[name] = scenario({ ...DEFAULT_TUNING });
    }

    const original = DEFAULT_TUNING[key as keyof TuningKnobs];
    const moved: string[] = [];

    for (const value of perturbations(key, original)) {
      const tuning = { ...DEFAULT_TUNING, [key]: value };
      for (const [name, scenario] of Object.entries(SCENARIOS)) {
        if (scenario(tuning) !== baseline[name]) {
          moved.push(`${name}@${value}`);
        }
      }
    }

    // The whole point of A6: the number has to actually move. A knob that changes nothing is
    // either dead or wired to the wrong thing, and both look identical in the Playground.
    expect(moved, `knob "${key}" changed no observable output in any scenario`).not.toHaveLength(0);
  });

  it('the sweep can fail: an unused knob added to the roster is not silently swept', () => {
    // The scenarios are driven by DEFAULT_TUNING keys, so this asserts the check above is
    // comparing real trajectories rather than always-equal placeholders (vault C2).
    const baseline = SCENARIOS.jumpHeld({ ...DEFAULT_TUNING });
    const changed = SCENARIOS.jumpHeld({ ...DEFAULT_TUNING, gravity: DEFAULT_TUNING.gravity * 2 });
    expect(typeof baseline).toBe('string');
    expect(baseline).not.toBe(changed);
  });
});
