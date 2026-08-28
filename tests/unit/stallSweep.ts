/**
 * # The offline dynamic sweep — the real `tick()`, with everything live
 *
 * The static sweep that opened this session walked solid rectangles and nothing else. It found the
 * flush-seam pin and proved it exists in only two of five levels — which cannot explain a bug the
 * owner reports in all five. So this driver runs the **shipped worlds** through the real `tick()`
 * with enemies, projectiles, hazards, the goal run-in and the bounds clamp all live, and classifies
 * every stall through the same analyzer the live probe uses.
 *
 * ## Why this is not `autoPlay()`
 *
 * ⚠️ `autoPlay()` jumps whenever `stuckFor >= 4`. That is not a stray convenience — read its jump
 * condition: `stuckFor >= 4 || !groundAhead(...) || hazardAhead(...)`. At a vertical wall with floor
 * beyond it, `groundAhead` stays true and `hazardAhead` is false, so **the stuck-jump is the only
 * reason it ever jumps there**. It has been silently escaping the exact symptom this session is
 * hunting, on every run, for the whole project.
 *
 * Removing it wholesale is the opposite mistake: with no stuck-jump the walker parks at the first
 * authored ledge and never reaches the enemies, projectiles, hazards or goal further into the level,
 * so the sweep would report a confident nothing. This driver therefore **keeps the two
 * geometry-navigation jumps and drops only the unexplained-stall escape**.
 *
 * It builds on `shippedWorld`, `groundAhead` and `hazardAhead` — all already exported — so
 * `autoPlay()` itself is **not modified** and its two existing callers (`level-completable` and
 * `level-hazard-free`) keep today's behaviour by construction rather than by a defaulted flag.
 */

import { createSnapshot } from '../../src/sim/input';
import { advance } from '../../src/sim/tick';
import { observeTicks } from '../../src/sim/trace';
import type { TickTrace } from '../../src/sim/trace';
import { createStallDetector } from '../../src/sim/stallAnalysis';
import type { StallCause, StallIncident } from '../../src/sim/stallAnalysis';
import type { LevelData } from '../../src/game/tilemap';
import type { InputSnapshot, World } from '../../src/sim/types';
import { MAX_TICKS, groundAhead, hazardAhead, shippedWorld } from './levelAutoPlay';

/** Matches `autoPlay`'s own look-ahead, so the navigation policy is the shipped one. */
const LOOK_AHEAD_PX = 60;
const HALF_W = 66;

export interface SweepIncident extends StallIncident {
  readonly levelId: string;
  readonly seed: number;
  /** Did holding the SAME direction for another 60 ticks free the player? */
  readonly continueFreed: boolean;
  /** Did REVERSING for 60 ticks free the player? Clause 2 of the owner's signature. */
  readonly reverseFreed: boolean;
  /** Did a JUMP free the player? Clause 3. */
  readonly jumpFreed: boolean;
}

/** Every distinct cause this run observed — the non-vacuity evidence. */
export type CauseCensus = Partial<Record<StallCause, number>>;

export interface SweepResult {
  readonly incidents: SweepIncident[];
  readonly census: CauseCensus;
  readonly ticks: number;
  readonly furthestX: number;
}

function navigationJump(level: LevelData, world: World): boolean {
  const probe = world.player.x + HALF_W + LOOK_AHEAD_PX;
  return !groundAhead(level, probe, world.player.y) || hazardAhead(level, probe, world.player.y);
}

/**
 * ⚠️ `jumpHeld` stays true for the WHOLE rise. Releasing it is the jump CUT — `stepVertical` divides
 * `vy` by `jumpCutDivisor`, turning a 437 px apex into a hop that clears nothing. A trial that
 * released early would report "a jump does not free the player" at every ordinary 3-tile wall, which
 * is a statement about the trial, not the game. `autoPlay` holds it for the same reason.
 */
function held(dir: -1 | 0 | 1, jump: boolean, press = jump): InputSnapshot {
  const input = createSnapshot();
  input.right = dir === 1;
  input.left = dir === -1;
  input.jumpHeld = jump;
  input.jumpPressed = press;
  return input;
}

/**
 * Run one intervention against a cloned world and report whether the player got free.
 *
 * A clone rather than the live world, because the three trials must each start from the SAME state:
 * running them in sequence on one world means the reverse trial is answering a question about a
 * position the continue trial already changed.
 */
function trial(level: LevelData, seed: number, upToTick: number, dir: -1 | 0 | 1, jump: boolean): boolean {
  const world = replayTo(level, seed, upToTick);
  const startX = world.player.x;
  for (let i = 0; i < 90; i += 1) {
    advance(world, held(dir, jump, jump && i === 0), 1);
  }
  return Math.abs(world.player.x - startX) > 8;
}

/** Deterministic replay: same seed, same inputs, same tick count — so a trial starts where it says. */
function replayTo(level: LevelData, seed: number, upToTick: number): World {
  const world = shippedWorld(level, seed, {});
  for (let i = 0; i < upToTick; i += 1) {
    advance(world, held(1, navigationJump(level, world)), 1);
  }
  return world;
}

/**
 * Walk one level holding Right, with navigation jumps only, and classify EVERY stall.
 *
 * 🔴 **It records an incident and then escapes it, rather than stopping.** Stopping at the first
 * stall parks the walker at the first authored ledge — and every level has one within ~300 ticks —
 * so the sweep would never reach the enemies, projectiles, hazards or goal further in, and would
 * report a confident nothing about them. The escape jump is applied only AFTER the incident and its
 * trials are recorded, so it can no longer hide what it is escaping.
 *
 * Each incident carries the three intervention trials, because the owner's signature is defined by
 * which interventions work: a stall with no trials attached is a coordinate, not a reproduction.
 */
export function sweepLevel(level: LevelData, seed: number, maxTicks = MAX_TICKS): SweepResult {
  const world = shippedWorld(level, seed, {});
  const detector = createStallDetector();
  const census: CauseCensus = {};
  const incidents: SweepIncident[] = [];
  let found: StallIncident | null = null;

  const dispose = observeTicks(world, (trace: TickTrace) => {
    const hit = detector.observe(trace);
    if (hit !== null && found === null) {
      found = hit;
    }
  });

  // 🔴 Deduped by place-and-cause. A run that dies in a pit respawns at the shipped spawn and walks
  // the same route again, so an undeduped sweep reports the same wall a dozen times and buries the
  // one row that is new. The KEY is the evidence; the repeat count is not.
  const seen = new Set<string>();
  let ticks = 0;
  let escapeFor = 0;
  let furthestX = world.player.x;
  try {
    for (; ticks < maxTicks; ticks += 1) {
      if (found !== null) {
        const hit: StallIncident = found;
        found = null;
        const key = `${hit.x.toFixed(0)}|${hit.y.toFixed(0)}|${hit.dir}|${hit.cause}`;
        if (!seen.has(key)) {
          seen.add(key);
          census[hit.cause] = (census[hit.cause] ?? 0) + 1;
          incidents.push({
            ...hit,
            levelId: level.id,
            seed,
            continueFreed: trial(level, seed, hit.tick, 1, false),
            reverseFreed: trial(level, seed, hit.tick, -1, false),
            jumpFreed: trial(level, seed, hit.tick, 1, true),
          });
        }
        detector.reset();
        // Escape, so the sweep reaches the rest of the level. Held, never cut — see `held`.
        escapeFor = 40;
      }
      const escaping = escapeFor > 0;
      if (escaping) escapeFor -= 1;
      const jump = escaping || navigationJump(level, world);
      advance(world, held(1, jump, jump && escapeFor === 39), 1);
      if (world.player.x > furthestX) furthestX = world.player.x;
      if (world.completed) break;
    }
  } finally {
    dispose();
  }

  return { incidents, census, ticks, furthestX };
}
