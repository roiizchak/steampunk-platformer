/**
 * Screen shake — the DECISION, engine-free *(vault 2.12)*.
 *
 * ⚠️ **`camera.shake()` is not used anywhere in this project, and this header used to say the
 * opposite** — that Phaser owned the mechanism and that reimplementing it here would be a duplicate.
 * Every clause of that was false by the time it shipped, and it was the first thing a reader
 * auditing criterion 9.2 would have been told: that the timing and the decay live inside the engine,
 * which is precisely the arrangement 9.2 forbids *(C9)*.
 *
 * What actually lives here is the whole shake: the *inputs* (how long, how hard), the *arbitration*
 * (may this shake replace the one already running), the **jitter itself** (`shakeOffset`, a pure
 * function of the tick), and the *predicate* that says whether a rendered offset was legal.
 * `gameEffects.applyShake` writes `camera.setPosition(base + offset)` from `shakeOffset` on every
 * frame and awaits no event — its docstring carries the 9.2 argument for why.
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
 * ## No milliseconds
 *
 * Every duration in this file is an integer count of 60 Hz ticks, with no conversion anywhere. There
 * was one — `shakeDurationMs`, justified by "Phaser's camera API takes milliseconds" — and it was
 * **deleted** rather than kept, because no camera API is called: it had no production caller, and its
 * only general assertion compared it against `ticksToMs(...)`, which is its own body. A function
 * whose test restates its implementation cannot fail for any edit that keeps the delegation.
 */

import { HITSTOP_TICKS, type ImpactClass } from '../sim/hitstop';

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
 * Phaser's 0.05 default would move the camera a whole 96 px grid cell for a hit on a gear. These
 * sit between **7×** and **62×** under it: `playerHurt.ay` 0.007 is the largest at 0.05 / 0.007 =
 * 7.1, and `land.ax` 0.0008 the smallest at 62.5.
 */
export const SHAKE: Readonly<Record<ImpactClass | 'land', ShakeCommand>> = {
  light: { durationTicks: 4, ax: 0.003, ay: 0.001 },
  lethal: { durationTicks: 7, ax: 0.005, ay: 0.004 },
  playerHurt: { durationTicks: 8, ax: 0.004, ay: 0.007 },
  land: { durationTicks: 3, ax: 0.0008, ay: 0.004 },
};

/**
 * How much bigger than the screen the shaken camera's viewport must be — **inventory 2b.7**.
 *
 * `applyShake` moves the camera with `setPosition`, which moves the **viewport rectangle on the
 * canvas**, not the world scroll. A viewport exactly the size of the screen therefore uncovers a
 * strip of raw page background at whichever edge it moves away from. Measured at the design size:
 * `lethal.ax` 0.005 × 1920 = **9.6 px** horizontally, `playerHurt.ay` 0.007 × 1080 = **7.6 px**
 * vertically. Small, and unmissable once seen — it is a bright seam that appears only on impact.
 *
 * ## Why not the two obvious alternatives
 *
 * **Clamping the offset to the screen** biases the shake: the camera could then only move inward
 * from an edge, so a shake at `x = 0` is a one-sided lurch rather than a jitter.
 *
 * **Shaking `scrollX/scrollY` instead** keeps the viewport still, and Phaser clamps scroll to the
 * camera bounds — so the shake would silently damp or vanish at a level edge, which is exactly
 * where heavy landings happen. That trades a visible seam for an invisible absence, which is worse.
 *
 * So the viewport is grown by this margin on every side and its base moved to `-margin`. The camera
 * draws a little more world than the screen shows, and the shake moves within that slack.
 *
 * ⚠️ **Derived from the SHAKE table, not authored.** Adding a heavier shake widens the margin
 * automatically; a hardcoded 10 would be silently wrong the first time someone tunes `ax`.
 *
 * ⚠️ **Takes the DESIGN size, not the grown viewport.** Feeding the enlarged camera's own width
 * back in would grow the amplitude, which would grow the required margin, which would grow the
 * amplitude. `applyShake` passes the same design size for the same reason.
 */
export function shakeSafeMargin(
  designW: number,
  designH: number,
): { x: number; y: number } {
  let ax = 0;
  let ay = 0;
  for (const cmd of Object.values(SHAKE)) {
    if (cmd.ax > ax) ax = cmd.ax;
    if (cmd.ay > ay) ay = cmd.ay;
  }
  // Ceil, because a fractional margin still leaves a sub-pixel seam that a browser will happily
  // render as a grey line.
  return { x: Math.ceil(ax * designW), y: Math.ceil(ay * designH) };
}

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
 * by **2.55×** (0.008062 / 0.003162). On `max(ax, ay)` it would be 1.4×, which is inside the range a
 * retune could invert by accident.
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
 * The camera jitter, in [-1, 1], as a pure function of the tick.
 *
 * **No `Math.random`.** Two incommensurate frequencies so the two axes never trace a diagonal, and a
 * value that changes once per SIM tick rather than once per frame — a 240 Hz jitter over a 60 Hz
 * world reads as a blur rather than as a shake. Bounded by 1 by construction, which is what keeps
 * the drawn offset inside `shakeWithinEnvelope`'s peak box.
 */
const JITTER_X_FREQ = 12.9898;
const JITTER_Y_FREQ = 7.233;

/**
 * The EXACT offset the camera must be at on `tick`. `gameEffects.applyShake` writes this and nothing
 * else; nothing anywhere recomputes it.
 *
 * 🔴 **It moved here from `src/scenes/gameEffects.ts` so that one number can be asserted rather than
 * two that agree** — the `shakeWithinEnvelope` / `viewFits` / `tracksTarget` precedent, and the same
 * reason those live in `src/render/`: this is a DECISION, and the scene only applies it.
 *
 * The reason it had to move is a hole a review found in the e2e gate. `shakeWithinEnvelope`'s
 * running regime is the peak BOX, loose on purpose (see its docstring), and the only lower bound
 * anywhere was "the camera moved at all". So an amplitude regression of **100×** — `0.01 * cmd.ax`
 * — passed the whole shake gate green: every sample was still inside the box and still non-zero.
 * The offset is deterministic in `(cmd, tick, viewportW, viewportH)`, so the exact value was
 * available the entire time and cost nothing; `phase-09-polish.spec.ts` now asserts against it.
 *
 * Returns the offset unconditionally — WHETHER a shake is running is `shakeSettled`'s question and
 * the caller's branch, not this function's. Keeping the two apart is what lets the spec assert the
 * value on exactly the ticks it has already established are inside the window.
 */
/**
 * ## 🔴 The caller must sample at `tick - 1`, not `tick` — inventory 3.1, owner ruling 2026-08-23
 *
 * `gameEffects.ts` called `applyShake(camera, tick)` while the landing squash three lines above it
 * used `tick - 1`. One tick apart, and the cost was recorded in the QA log and then left: of
 * `SHAKE.land`'s **three** ticks the renderer could only ever put **two** on screen.
 *
 * `tickCount` counts ticks EXECUTED, so a frame draws the result of index `tick - 1`. A shake
 * evaluated at `tick` is therefore already one tick into its own window before its first drawn
 * frame, and settles one tick early — the third tick exists in the sim and never reaches a screen.
 *
 * ⚠️ **This was a feel change, not a refactor.** A shipped landing now delivers 50 % more of the
 * amplitude it was always authored with, for the same numbers. It was put to the owner as a balance
 * decision and taken as one, and criterion 9.2's `(landTick, landTick + span)` sampling window moved
 * with it rather than being left measuring the old phase.
 *
 * The reading in `effects-behaviour.test.ts` was **re-taken**, not adjusted: its oracle now names
 * the same index the renderer does. A test whose expected value is edited to match a changed
 * product has stopped being a test.
 */
export function shakeOffset(
  cmd: ShakeCommand,
  tick: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  return {
    x: cmd.ax * viewportW * Math.sin(tick * JITTER_X_FREQ),
    y: cmd.ay * viewportH * Math.cos(tick * JITTER_Y_FREQ),
  };
}

/**
 * Does an offset a camera actually rendered lie inside what the state permits this tick?
 *
 * Imported by BOTH the unit test and the e2e spec, deliberately — the `viewFits` / `tracksTarget`
 * precedent in `cameraRig.ts`. One criterion asserted against one definition, never two copies that
 * agree on the happy path and diverge exactly where a bug would live.
 *
 * There are three regimes, and the two that bound tightly are the ones that matter:
 *
 *  1. 🔴 **BEFORE `startedTick` — exactly zero.** This is the window the whole module exists for.
 *     `shakeStartTick` delays an outgoing shake until the hit-stop freeze releases, precisely so the
 *     camera does not jitter over a still image. Without this branch the predicate could not see
 *     that failure at all: `shakeEnergy` clamps a not-yet-started state to its **full peak** (it has
 *     spent nothing), so `shakeSettled` is `false` for the entire delay and the check fell through
 *     to the peak box below — reporting a camera thrown ±9.6 px on every frame of the freeze as
 *     inside the envelope. A later e2e spec imports this function *as* its assertion for "the shake
 *     starts after the freeze", so that was a false green waiting to happen.
 *  2. **While running — the PEAK box, not `shakeEnergy`.** `shakeOffset` jitters at a constant
 *     amplitude for the whole duration; it does not taper — read its two lines, the only
 *     tick-dependent terms are the sines. (This used to be justified by the same property of
 *     *Phaser's* `Shake` effect, which nothing in this project runs: the bound was right and the
 *     stated reason was a fact about code that never executes.) `shakeEnergy`'s linear decay is
 *     *our* arbitration currency — a claim about which shake deserves the camera next, not a claim
 *     about what is drawn. Bounding this regime by the decayed value would false-red on a correct
 *     camera on almost every frame, which is exactly the class of false red this suite has already
 *     paid for twice. This is the one loose regime, deliberately.
 *  3. **After it settles — exactly zero again.** The assertion that catches a shake which never
 *     stops.
 */
export function shakeWithinEnvelope(
  state: ShakeState | null,
  tick: number,
  offsetX: number,
  offsetY: number,
  viewportW: number,
  viewportH: number,
): boolean {
  // Regimes 1 and 3 above: nothing may be drawn before the shake starts, or after it ends.
  if (state === null || tick < state.startedTick || shakeSettled(state, tick)) {
    return offsetX === 0 && offsetY === 0;
  }
  return (
    Math.abs(offsetX) <= state.cmd.ax * viewportW && Math.abs(offsetY) <= state.cmd.ay * viewportH
  );
}
