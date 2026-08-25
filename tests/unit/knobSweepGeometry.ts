/**
 * The `longFall` scenario's geometry, **derived from `DEFAULT_TUNING` instead of written down**.
 *
 * ## Why this file exists
 *
 * `knob-sweep.test.ts` carried two magic numbers — a floor at `y: 6000` and a world `heightPx: 8000`
 * — directly under a docstring that said, of the very same numbers:
 *
 *   > *"The floor and the window are properties of the tuning, not constants — anything that lowers
 *   > gravity has to move them or this gate quietly stops measuring."*
 *
 * That sentence was written **after the failure happened three times in one session**: a physics
 * change moved the saturation point, the geometry did not follow, and the sweep reported a live knob
 * as DEAD while blaming the knob rather than itself. Recording the rule in prose and then leaving the
 * constants hand-written is the same defect one level up. These are computed.
 *
 * ## 🔴 ONE fixed worst case, from the WHOLE envelope — never re-derived per mutated tuning
 *
 * The geometry is computed once, from the **maximum** fall the sweep can produce across every
 * perturbation it will ever run, and every arm of the sweep then uses that same value.
 *
 * Deriving it per-tuning instead would be worse than the magic numbers: each perturbation would get
 * the window that flatters it, so the sweep would be measuring **its own scenario generator** rather
 * than the knob. Named by the Codex plan review, round 2.
 *
 * ## The envelope is one knob at a time, because the sweep is
 *
 * `knob-sweep.test.ts` builds `{ ...DEFAULT_TUNING, [key]: value }` — a single override. So the
 * envelope here is the same shape: `gravity x2` (4199.6 px) beats `maxFallSpeed x2` (3408.8 px)
 * rather than the two compounding. Combining them would inflate the world for a case that cannot
 * occur, and a scenario that never lands under *any* tuning also never discriminates a knob that
 * only matters near the ground.
 */

import { DEFAULT_TUNING } from '../../src/sim/player';
import type { Rect, TuningKnobs } from '../../src/sim/types';

/** Ticks the `longFall` scenario runs. The geometry below is a function of this. */
export const LONG_FALL_TICKS = 100;

/**
 * Fall distance in `ticks`, by **the sim's own integration** — `src/sim/player.ts:271`:
 * `vy = Math.min(vy + gravity, maxFallSpeed)`, then the position steps by `vy`.
 *
 * ⚠️ A closed form was drafted first and thrown away. `dist = g*n*(n+1)/2` is only right before the
 * clamp bites, and the whole point of this scenario is the tick at which it does.
 */
export function fallDistance(gravity: number, maxFallSpeed: number, ticks: number): number {
  let vy = 0;
  let dist = 0;
  for (let i = 0; i < ticks; i += 1) {
    vy = Math.min(vy + gravity, maxFallSpeed);
    dist += vy;
  }
  return dist;
}

/**
 * Every tuning the sweep will run: the baseline, plus each knob moved to each of its perturbations,
 * one knob at a time.
 *
 * `perturb` is passed in rather than duplicated so the two cannot drift — if `knob-sweep.test.ts`
 * changes what a knob is nudged to, this envelope changes with it and the geometry follows.
 */
export function tuningEnvelope(
  knobs: readonly string[],
  perturb: (key: string, value: number) => number[],
): TuningKnobs[] {
  const out: TuningKnobs[] = [{ ...DEFAULT_TUNING }];
  for (const key of knobs) {
    const original = DEFAULT_TUNING[key as keyof TuningKnobs];
    for (const value of perturb(key, original)) out.push({ ...DEFAULT_TUNING, [key]: value });
  }
  return out;
}

/** The furthest any single-knob perturbation can fall inside the scenario's window. */
export function worstCaseFall(envelope: readonly TuningKnobs[]): number {
  return Math.max(...envelope.map((t) => fallDistance(t.gravity, t.maxFallSpeed, LONG_FALL_TICKS)));
}

/**
 * Headroom over the worst case, as a multiple.
 *
 * Not a tight fit on purpose. The sim applies gravity at a numbered step in the tick order and the
 * position integrates at another, so the analytic distance above is the right *shape* but not
 * guaranteed to be the exact px to the last unit. 1.25x is wide enough that a step-order change
 * cannot silently put the floor inside the fall, and narrow enough that the world stays small.
 */
export const FALL_HEADROOM = 1.25;

/**
 * The floor and the world, given the worst case and the spawn the sim actually uses.
 *
 * `spawnY` is read off a real `createWorld` rather than copied: `SPAWN_Y` is private to
 * `src/sim/world.ts`, and a copy of a private constant is the same drift this file exists to stop.
 *
 * The world must be taller than the floor because `belowKillPlane` is `feetY > bounds.heightPx`
 * (`src/sim/hazards.ts:59`): a player who crosses it dies and respawns, and every perturbation then
 * converges on one resting fingerprint — which is precisely how `maxFallSpeed` was once reported
 * dead while being demonstrably live.
 */
export function longFallGeometry(
  spawnY: number,
  worstFall: number,
): { floor: Rect[]; bounds: { widthPx: number; heightPx: number }; floorY: number } {
  const floorY = Math.ceil(spawnY + worstFall * FALL_HEADROOM);
  const floorHeight = 120;
  return {
    floor: [{ x: 0, y: floorY, w: 1920, h: floorHeight }],
    // Below the floor's underside, so the floor is reachable geometry rather than a slab hanging
    // past the edge of the world.
    bounds: { widthPx: 1920, heightPx: floorY + floorHeight + 1000 },
    floorY,
  };
}
