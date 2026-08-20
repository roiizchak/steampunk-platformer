/**
 * Screen shake — the DECISION, engine-free *(vault 2.12)*.
 *
 * Phaser owns the mechanism: `camera.shake(duration, intensity, force)` already jitters the camera
 * and already decays its own elapsed time. Reimplementing that here would be a second copy of
 * something the engine does correctly. What lives here is the *inputs* (how long, how hard), the
 * *arbitration* (may this shake replace the one already running), and the *predicate* that says
 * whether a rendered offset was legal.
 *
 * ## Why the arbitration cannot be left to Phaser
 *
 * `camera.shake()` has exactly two behaviours and **both defaults are wrong for feel**:
 *
 *   - **without `force`** the call is a **silent no-op while a shake is already running**. A killing
 *     blow landing during a graze's four-tick shake produces *no shake at all* — the biggest moment
 *     in the fight is the one that gets swallowed.
 *   - **with `force: true`** it **restarts from zero and never blends**. A graze landing during a
 *     kill's shake *truncates the bigger one* — the flurry after a kill erases the kill.
 *
 * Neither throws, neither logs, and both read in a playtest as "the shake is a bit inconsistent",
 * which is the hardest kind of defect to chase. So the caller must arbitrate, and the rule is:
 *
 * > **Preempt if and only if the incoming command's peak amplitude is greater than or equal to the
 * > running shake's REMAINING amplitude.**
 *
 * Bigger events always win; smaller events never cut a bigger one short; and a shake most of the way
 * through has little left to protect, so a fresh small hit legitimately takes over. `>=` rather than
 * `>` is deliberate — a second identical hit must re-arm its own shake, or a flurry shakes once.
 *
 * ## No state, no teardown
 *
 * `ShakeState` is a value the caller holds and this module reads; nothing here mutates and nothing
 * here remembers. That is the same no-teardown shape as `goalEntryAlpha` in `playerView.ts`: every
 * answer is recomputed from `(state, tick)`, so a scene restart, a death mid-shake and a level change
 * need no cancellation path. A stale `ShakeState` decays to zero on its own and stays there.
 *
 * ## Milliseconds
 *
 * Every duration in this project is an integer count of 60 Hz ticks. `shakeDurationMs` is the ONLY
 * place in `src/render/` where a millisecond exists, and it exists solely because Phaser's camera API
 * takes one. It delegates to the sim's `ticksToMs` rather than restating the arithmetic — a second
 * copy would diverge the day one of them is corrected *(vault 5.3)*.
 */

import { HITSTOP_TICKS, type ImpactClass } from '../sim/hitstop';
import { ticksToMs } from '../sim';

export interface ShakeCommand {
  durationTicks: number;
  /** Fractions of viewport width and height. Phaser's default 0.05 is ±54 px at 1080 — far too much. */
  ax: number;
  ay: number;
}

/** What the caller holds between ticks. Two numbers, no lifecycle. */
export interface ShakeState {
  startedTick: number;
  cmd: ShakeCommand;
}

/**
 * The shake each impact class is worth. `land` is the heavy-landing case, which has no freeze.
 *
 * The axis split is the craft. A spanner swung horizontally throws the camera sideways
 * (`light`/`lethal` lead on `ax`); a body hitting the ground throws it vertically (`land` is almost
 * pure `ay`); and taking a hit rings the player's own head hardest on the axis they were struck on,
 * so `playerHurt` leads on `ay` and is the only outgoing-scale shake that does.
 *
 * Every value is between one and two orders of magnitude under Phaser's 0.05 default, which at
 * 1920 × 1080 would move the camera a whole 96 px grid cell for a hit on a gear.
 */
export const SHAKE: Readonly<Record<ImpactClass | 'land', ShakeCommand>> = {
  light: { durationTicks: 4, ax: 0.003, ay: 0.001 },
  lethal: { durationTicks: 7, ax: 0.005, ay: 0.004 },
  playerHurt: { durationTicks: 8, ax: 0.004, ay: 0.007 },
  land: { durationTicks: 3, ax: 0.0008, ay: 0.004 },
};

/** The command an impact is worth. Returns the table entry itself — commands are immutable data. */
export function shakeFor(impact: ImpactClass | 'land'): ShakeCommand {
  return SHAKE[impact];
}

/**
 * The one scalar the arbitration compares: how hard this command shakes at its peak.
 *
 * A euclidean magnitude rather than `max(ax, ay)`, because a command that is strong on both axes
 * genuinely reads as a bigger event than one equally strong on a single axis — `playerHurt`
 * (0.004, 0.007) must outrank `light` (0.003, 0.001) on any honest measure, and it does on this one
 * by a factor of three.
 *
 * Exported because `shouldPreempt` is asserted against it in the unit test; one definition of "how
 * big is this shake", never two that agree about the happy path *(vault 5.3)*.
 */
export function shakePeak(cmd: ShakeCommand): number {
  return Math.hypot(cmd.ax, cmd.ay);
}

/**
 * The tick a shake starts on, relative to the tick the hit was confirmed.
 *
 * **Outgoing damage (`light`, `lethal`): AFTER the freeze ends.** A shake underneath a hit-stop
 * freeze is camera noise over a still image, and it cancels itself — the whole point of the freeze
 * is that the frame stops moving, and jittering the viewport through it spends the shake on the one
 * stretch of time where nothing else is happening. Delayed by exactly `HITSTOP_TICKS[impact]`, it
 * lands on the frame the world starts moving again, which is the frame that reads as the release.
 *
 * **Incoming damage (`playerHurt`) and `land`: on the hit tick itself.** There the camera is the
 * VICTIM rather than the witness, and simultaneity is the effect — it reads as the player's own head
 * ringing rather than as a report of something that happened to someone else. `land` has no freeze
 * to wait for at all.
 */
export function shakeStartTick(impact: ImpactClass | 'land', hitTick: number): number {
  if (impact === 'light' || impact === 'lethal') {
    return hitTick + HITSTOP_TICKS[impact];
  }
  return hitTick;
}

/**
 * Remaining amplitude, decaying linearly to **exactly** 0 at the end tick. 0 when nothing is running.
 *
 * `Math.max(0, …)` rather than a near-zero epsilon, and the numerator hits `0` exactly at
 * `startedTick + durationTicks` because it is integer subtraction. A shake that settles at 1e-17
 * instead of 0 leaves the camera permanently, invisibly off its target, and every downstream
 * assertion about a rendered position inherits the error rather than catching it.
 *
 * Clamped at the top as well, so a shake scheduled for a future tick (`shakeStartTick` delays the
 * outgoing ones) reports its full peak rather than more than its peak. It has spent nothing yet.
 */
export function shakeEnergy(state: ShakeState | null, tick: number): number {
  if (state === null) {
    return 0;
  }
  const elapsed = tick - state.startedTick;
  const remaining = (state.cmd.durationTicks - elapsed) / state.cmd.durationTicks;
  return shakePeak(state.cmd) * Math.min(1, Math.max(0, remaining));
}

/**
 * Should `next` replace what is running? See the preemption rule in this file's header.
 *
 * The comparison is the entire feature. Inverting it reproduces Phaser's second wrong default —
 * every small hit truncating every big one — and `screen-shake.test.ts` asserts both directions
 * precisely so that inversion cannot land green.
 */
export function shouldPreempt(state: ShakeState | null, next: ShakeCommand, tick: number): boolean {
  return shakePeak(next) >= shakeEnergy(state, tick);
}

/** Has the shake fully settled? Exactly 0, not approximately. */
export function shakeSettled(state: ShakeState | null, tick: number): boolean {
  return shakeEnergy(state, tick) === 0;
}

/**
 * Phaser's camera API takes milliseconds. This is the only place in `src/render/` that one exists.
 *
 * Delegates to the sim's `ticksToMs` — a second implementation of `ticks * 1000 / 60` would be a
 * verbatim duplicate that silently diverges the day one of them is corrected *(vault 5.3)*.
 */
export function shakeDurationMs(cmd: ShakeCommand): number {
  return ticksToMs(cmd.durationTicks);
}

/**
 * Does an offset a camera actually rendered lie inside what the state permits this tick?
 *
 * Imported by BOTH the unit test and the e2e spec, deliberately — the `viewFits` / `tracksTarget`
 * precedent in `cameraRig.ts`. One criterion asserted against one definition, never two copies that
 * agree on the happy path and diverge exactly where a bug would live.
 *
 * ⚠️ **The bound is the PEAK, not `shakeEnergy`.** Phaser's `Shake` effect jitters at a constant
 * intensity for the whole duration; it does not taper. `shakeEnergy`'s linear decay is *our*
 * arbitration currency — a claim about which shake deserves the camera next, not a claim about what
 * is drawn. Bounding the envelope by the decayed value would false-red on a correct camera on almost
 * every frame, which is exactly the class of false red this suite has already paid for twice.
 *
 * What it does hold tightly is the settled case: once the shake is over the offset must be **exactly
 * zero**. That is the assertion that catches a shake which never stops, and it is the reason this
 * predicate is worth having at all.
 */
export function shakeWithinEnvelope(
  state: ShakeState | null,
  tick: number,
  offsetX: number,
  offsetY: number,
  viewportW: number,
  viewportH: number,
): boolean {
  if (shakeSettled(state, tick)) {
    return offsetX === 0 && offsetY === 0;
  }
  const cmd = (state as ShakeState).cmd;
  return Math.abs(offsetX) <= cmd.ax * viewportW && Math.abs(offsetY) <= cmd.ay * viewportH;
}
