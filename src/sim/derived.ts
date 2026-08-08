/**
 * Derived feel metrics — vault **A6**, the half that was missing.
 *
 *   > "The Playground needs knob-sweep verification wired in from day one. **A slider that visibly
 *   > exists reads as a slider that visibly works.** Change it, run, confirm the output moved."
 *
 * `tests/unit/knob-sweep.test.ts` proves every knob moves *some* trajectory. That satisfies the
 * criterion mechanically and does nothing for the person holding the keyboard: several knobs have
 * no effect you can see while playing. Coyote time and jump buffering are forgiveness windows you
 * only notice at the exact edge of a ledge; `airFriction` acts only while airborne with nothing
 * held; `jumpCutDivisor` only if you tap instead of hold. Turning those and seeing nothing is
 * indistinguishable from turning a dead knob — which is the failure A6 names.
 *
 * So the Playground shows the NUMBERS a knob moves, alongside the knob. Every one is produced by
 * running the real simulation in a scratch world, not by a formula that could drift from it: change
 * a knob, and the number under it changes on the same frame.
 *
 * Engine-free and clock-free like the rest of `src/sim/`, so it is unit-testable and cannot become
 * the place a `deltaTime` sneaks in.
 */

import { advance, createWorld } from './tick';
import { createSnapshot } from './input';
import { TILE_SIZE } from '../game/constants';
import type { Rect, TuningKnobs } from './types';

/** A drop tall enough for terminal velocity to actually be reached. */
const DEEP_FALL: Rect[] = [{ x: 0, y: 4000, w: 4000, h: 120 }];

export interface DerivedFeel {
  /** Peak height of a full held jump, in pixels and tiles. */
  apexPx: number;
  apexTiles: number;
  /** Ticks from leaving the ground to touching down again, jump held. */
  airtimeTicks: number;
  /** Peak height when jump is released after two ticks. */
  shortHopPx: number;
  /** Horizontal speed cap actually reached, px/tick. */
  topSpeed: number;
  /** Ticks of held input to reach it. */
  ticksToTopSpeed: number;
  /** The same cap with the walk modifier held. The only output `walkMax` moves. */
  walkTopSpeed: number;
  /**
   * Ticks whose PUBLISHED state was `jump`, and ticks whose published state was `fall`.
   *
   * **Counted, never obtained as `airtimeTicks - riseTicks`.** `airtimeTicks` includes the landing
   * tick, which is already `grounded` and therefore publishes `idle` or `run` — so subtracting
   * misallocates one non-fall tick to the fall animation. Codex plan review finding 9 predicted
   * exactly that off-by-one against an earlier draft of the Phase 4 plan.
   *
   * These are the `simTicks` the jump and fall animation frame rates are derived from
   * (`fps = renderFrames * TICK_HZ / simTicks`, vault 4.22). A derivation that cannot be wrong by
   * one is worth more than a corrected subtraction.
   */
  riseTicks: number;
  fallTicks: number;
  /** Pixels travelled between releasing the key and stopping, on the ground. */
  groundStopPx: number;
  /** The same in the air — how much a released jump keeps drifting. */
  airDriftPx: number;
  /** Fastest downward speed reached in a long fall, px/tick. */
  terminalFallSpeed: number;
  /** The two forgiveness windows, in milliseconds. */
  coyoteMs: number;
  bufferMs: number;
}

function scratch(tuning: TuningKnobs, solids?: Rect[]) {
  const world = createWorld({ seed: 1, scale: 1, solids });
  Object.assign(world.tuning, tuning);
  return { world, input: createSnapshot() };
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function derivedFeel(tuning: TuningKnobs, ticksToMs: (t: number) => number): DerivedFeel {
  // Full jump: apex and airtime.
  const jump = scratch(tuning);
  advance(jump.world, jump.input, 5);
  const floorY = jump.world.player.y;
  jump.input.jumpHeld = true;
  jump.input.jumpPressed = true;
  let apex = floorY;
  let airtime = 0;
  let riseTicks = 0;
  let fallTicks = 0;
  for (let i = 0; i < 600; i += 1) {
    const events = advance(jump.world, jump.input, 1);
    apex = Math.min(apex, jump.world.player.y);
    airtime += 1;
    // Count the state this tick PUBLISHED. The landing tick is grounded and publishes idle/run,
    // so it lands in neither bucket — which is the whole point of counting instead of subtracting.
    if (jump.world.player.state === 'jump') {
      riseTicks += 1;
    } else if (jump.world.player.state === 'fall') {
      fallTicks += 1;
    }
    if (events.landed) {
      break;
    }
  }

  // Short hop: released after two ticks.
  const hop = scratch(tuning);
  advance(hop.world, hop.input, 5);
  hop.input.jumpHeld = true;
  hop.input.jumpPressed = true;
  advance(hop.world, hop.input, 2);
  hop.input.jumpHeld = false;
  let hopApex = hop.world.player.y;
  for (let i = 0; i < 600; i += 1) {
    if (advance(hop.world, hop.input, 1).landed) {
      break;
    }
    hopApex = Math.min(hopApex, hop.world.player.y);
  }

  // Run-up: top speed and how long it takes to get there.
  const run = scratch(tuning);
  advance(run.world, run.input, 5);
  run.input.right = true;
  let ticksToTop = 0;
  let previousVx = -1;
  for (let i = 0; i < 600; i += 1) {
    advance(run.world, run.input, 1);
    if (run.world.player.vx === previousVx) {
      break;
    }
    previousVx = run.world.player.vx;
    ticksToTop = i + 1;
  }
  const topSpeed = run.world.player.vx;

  // The same run-up with the walk modifier held. Separate scratch world: reusing `run` would start
  // from `runMax` and measure the bleed-down path instead of the cap.
  const walk = scratch(tuning);
  advance(walk.world, walk.input, 5);
  walk.input.right = true;
  walk.input.walkHeld = true;
  let previousWalkVx = -1;
  for (let i = 0; i < 600; i += 1) {
    advance(walk.world, walk.input, 1);
    if (walk.world.player.vx === previousWalkVx) {
      break;
    }
    previousWalkVx = walk.world.player.vx;
  }
  const walkTopSpeed = walk.world.player.vx;

  // Ground stop: distance covered after releasing the key.
  run.input.right = false;
  const stopFrom = run.world.player.x;
  for (let i = 0; i < 600; i += 1) {
    advance(run.world, run.input, 1);
    if (run.world.player.vx === 0) {
      break;
    }
  }
  const groundStopPx = run.world.player.x - stopFrom;

  // Air drift: the same measurement, airborne, which is the only thing airFriction touches.
  const air = scratch(tuning);
  advance(air.world, air.input, 5);
  air.input.jumpHeld = true;
  air.input.jumpPressed = true;
  air.input.right = true;
  advance(air.world, air.input, 12);
  air.input.right = false;
  const driftFrom = air.world.player.x;
  advance(air.world, air.input, 20);
  const airDriftPx = air.world.player.x - driftFrom;

  // Terminal velocity needs a drop long enough to actually reach it.
  const drop = scratch(tuning, DEEP_FALL);
  let fastest = 0;
  for (let i = 0; i < 400; i += 1) {
    advance(drop.world, drop.input, 1);
    fastest = Math.max(fastest, drop.world.player.vy);
  }

  return {
    apexPx: round(floorY - apex),
    apexTiles: round((floorY - apex) / TILE_SIZE, 2),
    airtimeTicks: airtime,
    shortHopPx: round(floorY - hopApex),
    topSpeed: round(topSpeed, 2),
    ticksToTopSpeed: ticksToTop,
    walkTopSpeed: round(walkTopSpeed, 2),
    riseTicks,
    fallTicks,
    groundStopPx: round(groundStopPx),
    airDriftPx: round(airDriftPx),
    terminalFallSpeed: round(fastest, 2),
    coyoteMs: ticksToMs(tuning.coyoteTicks),
    bufferMs: ticksToMs(tuning.jumpBufferTicks),
  };
}
