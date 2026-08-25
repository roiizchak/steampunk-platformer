/**
 * The REDUCTION half of the §1a combat instrument: near/far windows, per-event pairs, the table.
 *
 * Split out of `combatFrames.ts` on 2026-08-25 (the 400-line rule, CLAUDE.md §3). The seam is the one
 * that already ran through the file — `combatFrames.ts` RECORDS what the page did, this REDUCES it —
 * and it is the same instrument/claim split `brawlArm.ts` and `polishSeries.ts` establish.
 *
 * Nothing here asserts, with one exception: `reduceCombat` throws for a run that produced no usable
 * event, because a reduction whose preconditions are unmet is not a reduction.
 */

import { NEAR_TICKS, type CombatEvent, type CombatFrame } from './combatFrames';

/**
 * How far a REST frame must be from the last event to be a control.
 *
 * 🔴 **The control is the REST phase, not "frames far from every hit".** Probe 2 (2026-08-24) used
 * the distance rule alone and watched the control collapse from 2294 frames to 56 as the event rate
 * rose, with its median climbing 0.6 → 1.3 ms — a statistic that gets quieter the more combat there
 * is. `combatDrive.ts` pins `iFrameCounter` through REST so no event can occur there at all, and this
 * margin only has to clear the longest effect lifespan (steam, 45 ticks) so no decaying particle from
 * the fight is still on screen.
 */
export const REST_MARGIN_TICKS = 50;

/** One event's paired reading. `near` is the worst frame it carries; `far` is the run's control. */
export interface CombatPair {
  event: CombatEvent;
  nearFrames: number;
  nearMaxWork: number;
  nearMedianWork: number;
  delta: number;
  medianDeltaOne: number;
}

/** The whole reduction: the pairs, the control, and the printable table. */
export interface CombatReading {
  pairs: CombatPair[];
  /** Median work over every frame FAR from all events. The control the deltas are taken against. */
  farMedian: number;
  farFrames: number;
  /** Median of the per-event MAX deltas. */
  medianDelta: number;
  /** Median of the per-event MEDIAN deltas — the statistic that survived probe 5. */
  medianOfMedianDeltas: number;
  /** How many REST frames observed a hit stamp advance. The leak, measured rather than denied. */
  restEventFrames: number;
  /** The worst frame in the whole run that carried a combat event. §1a's secondary, absolute guard. */
  worstCombatFrame: number;
  /** Peak live particles seen inside any near window. */
  peakAliveNear: number;
  /** Peak live SPARK particles inside any near window — the admission premise's real input. */
  peakSparksNear: number;
  table: string[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Reduce a recording to event-aligned pairs.
 *
 * 🔴 **It throws rather than returning an empty reduction.** A run that landed no hit, or landed so
 * many that no control frame survives, is a *harness* failure and not a green measurement — and the
 * silent-zero shape (`PASS (0) FAIL (0)`) is one this project has now paid for three times. The
 * message names which of the two happened, because the fixes are opposite: drive longer, or drive
 * less.
 */
export function reduceCombat(frames: CombatFrame[], events: CombatEvent[]): CombatReading {
  if (events.length === 0) {
    throw new Error(
      `THE HARNESS: ${frames.length} frames recorded and NOT ONE landed hit, so there is nothing to ` +
        'align on. The brawl driver did not connect — drive longer, or check that the low-hp ' +
        'scavenger fixture spawned. This is not a passing measurement.',
    );
  }
  const eventTicks = events.map((e) => e.tick);
  // 🔴 **REST-phase frames, AND past every event** — the phase test added 2026-08-25 after the Codex
  // implementation review pointed out that the distance rule alone was being printed as "rest
  // frames" with nothing checking it. Both conditions, because neither alone is the control this
  // reduction claims: the phase says the driver was quiet, the margin says no particle from the
  // previous fight is still on screen.
  const far = frames.filter(
    (f) =>
      !f.spawning &&
      f.phase === 'rest' &&
      eventTicks.every((t) => f.tick - t < 0 || f.tick - t >= REST_MARGIN_TICKS),
  );
  if (far.length < 20) {
    throw new Error(
      `THE HARNESS: ${events.length} events over ${frames.length} frames left only ${far.length} ` +
        `control frames at least ${REST_MARGIN_TICKS} ticks past every hit. The deltas would be ` +
        'taken against a baseline that still contains the effect. Lengthen REST, or record longer.',
    );
  }
  const farMedian = median(far.map((f) => f.work));

  const pairs: CombatPair[] = [];
  let peakAliveNear = 0;
  let peakSparksNear = 0;
  let dropped = 0;
  for (const event of events) {
    // 🔴 The upper edge is EXCLUSIVE. With `<=`, two clustered events exactly `NEAR_TICKS` apart
    // share one tick, and the second hit's burst — which is what makes that tick expensive — is
    // counted as the FIRST hit's reading too. Caught by the 2026-08-25 adversarial gate brief;
    // clustering guarantees events are at least `NEAR_TICKS` apart, so `<` makes the windows a
    // partition rather than an overlapping cover.
    const near = frames.filter(
      (f) => !f.spawning && f.tick >= event.tick && f.tick < event.tick + NEAR_TICKS,
    );
    if (near.length === 0) {
      // The hit landed on a tick no frame observed — the harness's resolution, not a defect. 🔴 But
      // it is COUNTED and printed: a silent drop is how a reduction quietly narrows to the events
      // that happen to be cheap. The adversarial brief asked for the counter by name.
      dropped += 1;
      continue;
    }
    const nearMaxWork = Math.max(...near.map((f) => f.work));
    const nearMedianWork = median(near.map((f) => f.work));
    peakAliveNear = Math.max(peakAliveNear, ...near.map((f) => f.alive));
    peakSparksNear = Math.max(peakSparksNear, ...near.map((f) => f.sparks));
    pairs.push({
      event,
      nearFrames: near.length,
      nearMaxWork,
      nearMedianWork,
      delta: nearMaxWork - farMedian,
      medianDeltaOne: nearMedianWork - farMedian,
    });
  }
  if (pairs.length === 0) {
    throw new Error(
      `THE HARNESS: ${events.length} hits landed but no recorded frame fell inside any of their ` +
        `${NEAR_TICKS}-tick windows. That is the harness's tick resolution, not the game's cost.`,
    );
  }

  // 🔴 Was REST actually quiet? MEASURED, not assumed. `startPhasedCombat` writes from a rAF callback
  // that runs after the frame's sim ticks have already drained, so a FIGHT→REST edge can leak a tick
  // or two of live combat into REST. This counts the leak instead of a docstring claiming there is
  // none, and the spec prints it.
  const restEventFrames = frames.filter((f, i) => {
    if (f.phase !== 'rest' || i === 0) return false;
    const prev = frames[i - 1]!;
    return f.enemyHitTick > prev.enemyHitTick || f.playerHitTick > prev.playerHitTick;
  }).length;

  const byKind = (k: CombatEvent['kind']): number => events.filter((e) => e.kind === k).length;
  const table = [
    `      combat events ${events.length} (light ${byKind('light')}, lethal ${byKind('lethal')}, ` +
      `playerHurt ${byKind('playerHurt')}) over ${frames.length} frames`,
    `      control ${far.length} REST-phase frames >= ${REST_MARGIN_TICKS} ticks past every hit, median ${farMedian.toFixed(3)} ms`,
    `      REST frames that saw a hit stamp advance: ${restEventFrames} (the phase-edge leak, measured)`,
    `      per-event MEDIAN deltas ${pairs
      .slice(0, 12)
      .map((p) => p.medianDeltaOne.toFixed(3))
      .join('/')}${pairs.length > 12 ? ` (+${pairs.length - 12} more)` : ''}`,
    `      per-event MAX deltas ${pairs
      .slice(0, 12)
      .map((p) => p.delta.toFixed(3))
      .join('/')}${pairs.length > 12 ? ` (+${pairs.length - 12} more)` : ''}`,
    `      peak live particles inside a near window ${peakAliveNear} (sparks ${peakSparksNear})`,
    `      ${pairs.length} of ${events.length} events yielded a window; ${dropped} landed on a tick no frame observed`,
  ];

  return {
    pairs,
    farMedian,
    farFrames: far.length,
    medianDelta: median(pairs.map((p) => p.delta)),
    medianOfMedianDeltas: median(pairs.map((p) => p.medianDeltaOne)),
    restEventFrames,
    worstCombatFrame: Math.max(...pairs.map((p) => p.nearMaxWork)),
    peakAliveNear,
    peakSparksNear,
    table,
  };
}
