/**
 * # What stopped the player, decided in ONE place
 *
 * The offline sweep and the live probe both answer the same question — *the player asked to move
 * and did not; why?* — and if they answer it with two implementations they will eventually disagree,
 * quietly, on the one case that matters. A shared trace seam guarantees common **evidence**; only a
 * shared analyzer guarantees common **conclusions**. Both consumers are adapters over this file.
 *
 * ## Engine-free and clock-free, on purpose
 *
 * Everything here counts **ticks**, never milliseconds. The live probe adds a wall-clock condition
 * on top, because that half needs a clock and the sim may not touch one. Keeping the shared logic
 * clock-free is what lets the offline driver replay it exactly.
 *
 * ## The classification is ordered, and the order is the contract
 *
 * A single tick can satisfy several predicates at once — a lethal projectile lands, the body is
 * frozen, and direction is forced to zero, all on the same tick. Reporting whichever matched first
 * by accident is how a diagnostic ends up blaming the symptom. The order below runs
 * **outermost-cause first**: a lock that was *imposed on* the player outranks the player's own
 * geometry, and geometry is only ever claimed when nothing else can explain the tick.
 */

import type { DamageSource, TickTrace } from './trace';

/**
 * Why a tick made no progress. `null` means the tick is not a stall at all.
 *
 * `geometry` is deliberately the LAST resort and `unexplained` sits below it: a diagnostic that
 * says "I do not know" is worth more than one that guesses, and this whole session exists because
 * three fixes were shipped against confident guesses.
 */
export type StallCause =
  | 'frozen'
  | 'movementLock'
  | 'goalEntry'
  | 'damage'
  | 'respawn'
  | 'boundsClamp'
  | 'geometry'
  | 'airborneBlock'
  | 'unexplained';

export interface StallReading {
  readonly cause: StallCause;
  /** Populated only when `cause` is `damage` — which source actually landed. */
  readonly damageSource: DamageSource | null;
  /** Signed movement along the direction the player asked for. Negative means pushed backwards. */
  readonly progressPx: number;
}

/**
 * Movement below this, along the requested direction, counts as "did not move".
 *
 * Not zero. Exact equality misses the two failures that look identical to a player: sub-pixel creep
 * that covers no ground, and an oscillation that returns to the same place every other tick. Both
 * reset an equality test forever and neither is progress. Half a pixel is an eighth of one walk
 * frame's 4.5 px step, so nothing a player could perceive as walking falls under it.
 */
export const JITTER_PX = 0.5;

/**
 * Consecutive eligible ticks before a stall is called.
 *
 * 24 ticks is 400 ms of simulation. Chosen above the two locks that legitimately stop the body for a
 * short, designed moment — the 5-tick hurt lock and the 9-tick lethal freeze — so neither is ever
 * reported as a stall by the rolling detector. Those still get **immediate** entries of their own
 * (see `classify`), because a threshold they cannot reach would otherwise hide them completely.
 */
export const MIN_STALL_TICKS = 24;

/** Did this tick even ask to move? A tick with no input is not evidence of anything. */
export function eligible(trace: TickTrace): boolean {
  return trace.rawDir !== 0;
}

/** Signed displacement along the direction the player asked for. */
export function progressAlongDir(trace: TickTrace): number {
  return (trace.x - trace.previousX) * trace.rawDir;
}

/**
 * Classify one tick. Returns `null` when the player asked to move and actually did.
 *
 * Read the order as the contract it is — see this file's header.
 */
export function classify(trace: TickTrace): StallReading | null {
  const progressPx = progressAlongDir(trace);
  if (!eligible(trace) || progressPx > JITTER_PX) {
    return null;
  }
  const reading = (cause: StallCause): StallReading => ({
    cause,
    damageSource: cause === 'damage' ? trace.damageSource : null,
    progressPx,
  });

  // Respawn first: it teleports the body, so every positional test below is meaningless on this tick.
  if (trace.respawned || trace.died) return reading('respawn');
  // Frozen: steps 5-8 did not run at all. "Did not move" means something entirely different here.
  if (!trace.motionRan) return reading('frozen');
  // Imposed locks, outermost first. Both override the player's direction rather than resisting it.
  if (trace.entryLocked) return reading('goalEntry');
  if (trace.hitstunLocked) return reading('movementLock');
  // Damage that landed but did not lock — knockback fighting the held direction.
  if (trace.damageSource !== null) return reading('damage');
  /**
   * 🔴 The world edge, before geometry. `clampToBounds` zeroes `vx` exactly as the solid resolver
   * does, so the two are indistinguishable from position alone — and this branch did not exist
   * until the Codex implementation review pointed out that `boundsClamp` was declared in
   * `StallCause` and returned by nothing. A player walking into the end of the level was being
   * reported as `geometry`: the same label, and the same confident wrongness, that three shipped
   * fixes were built on.
   */
  if (trace.boundsClamped) return reading('boundsClamp');
  // Geometry is claimed ONLY when the body was free to move, on the ground, and still did not.
  if (trace.grounded) return reading('geometry');
  /**
   * 🔴 Airborne, asking to move, and `vx` is exactly zero — something ZEROED it, and in this sim only
   * the collision resolver and `clampToBounds` do that. So this is a wall met in mid-air: ordinary
   * platforming, not a defect.
   *
   * It gets its own label because the first version let it fall through to `unexplained`, and the
   * owner's very first probe run reported "NOTHING EXPLAINS THIS STOP" for a player pressed against
   * a plainly visible 3-tile wall while jumping. A last-resort label that fires on ordinary events
   * teaches the reader to ignore it — which destroys the one line this whole instrument exists to
   * print.
   */
  if (trace.vx === 0) return reading('airborneBlock');
  return reading('unexplained');
}

/** Which phase of an incident a trial belongs to. */
export type IncidentPhase = 'baseline' | 'reverseTrial' | 'jumpTrial';

export interface StallIncident {
  readonly id: number;
  /** The tick the stall was CALLED on, not the tick it began. */
  readonly tick: number;
  readonly firstTick: number;
  readonly x: number;
  readonly y: number;
  readonly dir: -1 | 0 | 1;
  readonly cause: StallCause;
  readonly damageSource: DamageSource | null;
  readonly ticks: number;
}

/**
 * The rolling detector, with the incident continuity the owner's signature needs.
 *
 * 🔴 **An input change must not reset an ACTIVE incident.** The owner's report has two clauses that
 * are themselves input changes — *reversing does not free it* and *only a jump releases it*. A
 * detector that resets whenever the keys change would file the baseline stall, the failed reversal
 * and the successful jump as three unrelated records that only a human could correlate by
 * coordinate. So a direction change resets an **untriggered candidate window** only; once a stall
 * has fired, the incident stays open and later ticks are recorded as trial phases against it.
 */
export function createStallDetector(minTicks: number = MIN_STALL_TICKS) {
  let runTicks = 0;
  let runDir: -1 | 0 | 1 = 0;
  let firstTick = 0;
  let nextId = 1;
  let active: StallIncident | null = null;

  return {
    /** Feed one tick. Returns an incident on the tick a stall is first called, else `null`. */
    observe(trace: TickTrace): StallIncident | null {
      const reading = classify(trace);

      if (reading === null) {
        // Real progress. This closes any open incident — the player got free.
        runTicks = 0;
        active = null;
        return null;
      }

      if (active !== null) {
        // Inside a live incident: keep it open through reversals and jump attempts.
        return null;
      }

      if (trace.rawDir !== runDir) {
        // A direction change on an UNTRIGGERED window starts the count again.
        runDir = trace.rawDir;
        runTicks = 1;
        firstTick = trace.tick;
        return null;
      }

      runTicks += 1;
      if (runTicks < minTicks) {
        return null;
      }

      active = {
        id: nextId,
        tick: trace.tick,
        firstTick,
        x: trace.x,
        y: trace.y,
        dir: trace.rawDir,
        cause: reading.cause,
        damageSource: reading.damageSource,
        ticks: runTicks,
      };
      nextId += 1;
      return active;
    },

    /** The incident currently open, if any — what a trial phase attaches to. */
    current(): StallIncident | null {
      return active;
    },

    /** Drop any open incident and candidate window, e.g. after a scene restart or dropped ticks. */
    reset(): void {
      runTicks = 0;
      runDir = 0;
      active = null;
    },
  };
}
