/**
 * The knob sweep's **fixture**: the roster, the eleven scenarios, the geometry they run in, and the
 * regime probe. Split out of `knob-sweep.test.ts` when §3c's regime preconditions pushed that file
 * past the 400-line limit.
 *
 * 🔴 **Two gates read this one fixture, and that is the point.** `knob-sweep.test.ts` asserts every
 * knob MOVES an output; `knob-sweep.test.ts`'s regime tests assert each scenario is in the regime
 * where its knob is observable at all. A criterion asserted against one definition rather than two
 * that agree on the happy path is this project's standing rule for exactly the reason it matters
 * here: a scenario re-implemented for the precondition check could drift out from under the sweep
 * and both would stay green.
 */

import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { advance, createWorld } from '../../src/sim/tick';
import type { Rect, TuningKnobs, World } from '../../src/sim/types';
import { LONG_FALL_TICKS, longFallGeometry, tuningEnvelope, worstCaseFall } from './knobSweepGeometry';

/**
 * The knob roster, written out by hand (Codex F7a).
 *
 * If this list and `DEFAULT_TUNING` disagree, one of them was changed without the other and the
 * sweep below is no longer covering what it claims to cover.
 */
export const EXPECTED_KNOBS = [
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
 * 🔴 **The floor and the world are DERIVED, not written down** — see `knobSweepGeometry.ts`.
 *
 * They used to be `y: 6000` and `heightPx: 8000`, sitting directly under a docstring that said *"the
 * floor and the window are properties of the tuning, not constants."* That sentence was written after
 * a physics change cost this sweep its sensitivity **three times in one session** — each time the
 * sweep reported a live knob as DEAD and blamed the knob. Stating the rule in prose and then
 * hand-writing the constants is the same defect one level up.
 *
 * The history is kept because it is the argument for the derivation:
 *
 * - `y` 960 → 2400: at the real level's 180 px drop, `vy` only reached ~15.3, so the
 *   `maxFallSpeed x2` perturbation never saturated the clamp and the knob passed on its halved case
 *   alone. Review brief 1 found it: non-vacuous, but weaker than it read.
 * - `y` 2400 → 6000 *(2026-08-15)*: `gravity` 2.7 → 0.675 moved the 51.6 clamp from tick 19 to tick
 *   **77** and ~2027 px, so ~1440 px of drop made it unreachable in every perturbation.
 * - And the floor was never the whole story. `createWorld` defaults to 1920x1080 and
 *   `belowKillPlane` is `feetY > heightPx`, so the player CROSSED THE KILL PLANE, died and respawned
 *   — converging every perturbation on one resting fingerprint. **No floor position could have fixed
 *   that**; the world itself had to grow. The first fix moved the floor and changed nothing, which is
 *   what a wrong diagnosis looks like.
 *
 * `SPAWN_Y` is private to `src/sim/world.ts`, so it is read off a real world rather than copied.
 */
const SPAWN_Y = createWorld({ seed: 11, scale: 1 }).player.y;

/** One fixed worst case over the WHOLE envelope — never re-derived per mutated tuning. */
const WORST_FALL = worstCaseFall(tuningEnvelope(EXPECTED_KNOBS, perturbations));

export const LONG_FALL = longFallGeometry(SPAWN_Y, WORST_FALL);

/** A reproducible fingerprint of a trajectory. Any change in behaviour changes this string. */
function signature(world: World, jumps: number): string {
  const p = world.player;
  return [p.x, p.y, p.vx, p.vy, p.state, p.grounded, jumps]
    .map((v) => (typeof v === 'number' ? v.toFixed(4) : String(v)))
    .join('|');
}

export type Scenario = (tuning: TuningKnobs) => string;

/**
 * 🔴 **The regime probe.** A scenario returns a fingerprint string, which says whether a knob moved
 * something — and says nothing about whether the scenario was in the regime where that knob is
 * observable at all. That gap is this file's recorded failure mode: three times in one session the
 * sweep measured outside the regime and reported a live knob as dead.
 *
 * Written by the last `withTuning` call and read immediately after, in a single-threaded test file.
 * The alternative was returning a tuple from every scenario, which would have touched all eleven of
 * them to instrument two.
 */
export const probe: { world: World | null; leftGroundAtTick: number } = { world: null, leftGroundAtTick: -1 };

function withTuning(
  tuning: TuningKnobs,
  solids: Rect[] | undefined,
  run: (world: World, input: ReturnType<typeof createSnapshot>) => number,
  /**
   * 🔴 Optional TALLER world, added 2026-08-15. The default is 1920x1080 and `belowKillPlane` fires
   * at `feetY > heightPx`, so a scenario that wants a long fall must say so or the player DIES
   * mid-measurement and respawns — converging every perturbation to one fingerprint and reporting a
   * live knob as dead. See `longFall`.
   */
  bounds?: { widthPx: number; heightPx: number },
): string {
  const world = createWorld({ seed: 11, scale: 1, solids, bounds });
  Object.assign(world.tuning, tuning);
  const input = createSnapshot();
  const jumps = run(world, input);
  probe.world = world;
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

export const SCENARIOS: Record<string, Scenario> = {
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
   * `LONG_FALL_TICKS` (100), against the shipped tuning: the 51.6 px/tick clamp is reached at tick
   * **77** at `gravity` 0.675, so both perturbations are observable — halving it saturates at tick
   * 39, doubling it never saturates inside the window at all. Still stopped in mid-air, because
   * landing converges every tuning to the same resting fingerprint.
   *
   * ⚠️ Was **26 ticks against a clamp the docstring called "17 px/tick"** — a number that had not
   * been true since the Phase 4 rescale, describing a saturation point that moved twice under it.
   * The geometry is now derived (`LONG_FALL`); this tick count is the one number still chosen, and
   * the precondition test below is what checks it is still enough.
   */
  longFall: (tuning) =>
    withTuning(
      tuning,
      LONG_FALL.floor,
      (world, input) => countJumps(world, input, LONG_FALL_TICKS),
      LONG_FALL.bounds,
    ),

  /** Coyote time: walk off the ledge, wait, then press. */
  coyote: (tuning) =>
    withTuning(tuning, undefined, (world, input) => {
      advance(world, input, 5);
      input.right = true;
      probe.leftGroundAtTick = -1;
      for (let i = 0; i < 400; i += 1) {
        if (advance(world, input, 1).leftGround) {
          probe.leftGroundAtTick = i;
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
export function perturbations(key: string, value: number): number[] {
  const isTickCount = key === 'coyoteTicks' || key === 'jumpBufferTicks';
  if (isTickCount) {
    return [Math.max(1, Math.floor(value / 2)), value * 2];
  }
  if (key === 'jumpCutDivisor') {
    return [1, value * 3];
  }
  return [value / 2, value * 2];
}
