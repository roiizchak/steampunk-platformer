import type Phaser from 'phaser';
import { MS_PER_TICK } from '../game/constants';

/**
 * DEV-ONLY falsification probe for the "ghost / double image" report (`?probe=1`).
 *
 * ## What it is for
 *
 * Six hypotheses were tested against the running game and all six were falsified: animation
 * cadence, movement speed, canvas nearest-neighbour resampling, a second sprite in the display
 * list, camera jitter, and pose-doubling via `anims.timeScale`. The current hypothesis is that a
 * 60 Hz fixed-timestep sim on a 240 Hz display holds each drawn POSITION for four refreshes and
 * then jumps `runMax` (12 px) — sample-and-hold judder.
 *
 * 🔴 **That hypothesis is not established, and the Codex plan review said so plainly:** repeating a
 * 60 Hz frame across four 240 Hz refreshes still holds each position for ~16.7 ms, which is exactly
 * what a native 60 Hz panel does. The refresh rate alone therefore does not explain the report. It
 * FITS the evidence; it is not proven by it.
 *
 * So this probe exists to falsify it BEFORE any interpolation is built, per the review's own
 * suggested falsifier: *"the effect persisting with one frozen pose translated directly per rAF"*.
 *
 * ## How to read it
 *
 * Two copies of the SAME frozen pose cross the screen at the SAME average speed, 720 px/s:
 *
 *  - **STEPPED** moves the way the game moves today — nothing for three refreshes, then 12 px.
 *  - **SMOOTH** moves every refresh by `12 * delta / MS_PER_TICK`, which is what render
 *    interpolation would produce.
 *
 * The animation is stopped on a single frame, so pose cadence is excluded by construction and only
 * the position schedule differs. Three outcomes, and each decides the next step:
 *
 *  - STEPPED ghosts, SMOOTH is clean  -> the diagnosis holds; build interpolation.
 *  - BOTH ghost                        -> position hold is NOT the cause; interpolation is wasted
 *                                         work and the search moves elsewhere.
 *  - NEITHER ghosts                    -> the defect needs the animation running, so it is about
 *                                         pose and position together, not position alone.
 *
 * The measured refresh rate is drawn on screen too, because every measurement taken during this
 * investigation ran on an 18–60 Hz headless harness — hardware that cannot exhibit the effect at
 * all *(HANDOFF §14: the headless harness is not the frame rate)*. The number has to come from the
 * machine that can see it.
 *
 * Guarded at the point of creation in `GameScene`, so it is tree-shaken out of `dist/`.
 */

/** World px per tick the probe travels — `DEFAULT_TUNING.runMax`, the speed the report concerns. */
const PROBE_SPEED_PX_PER_TICK = 12;

/** Where the two lanes sit on screen, and how far they travel before wrapping. */
const LANE = { steppedY: 300, smoothY: 640, left: 120, right: 1800 };

export interface MotionProbe {
  /** Call once per frame with Phaser's millisecond delta. */
  update(deltaMs: number): void;
}

/**
 * Build the probe. `frozenFrame` is the animation frame index both copies hold.
 *
 * Both sprites use `setScrollFactor(0)` so they are fixed to the camera: the camera follows the
 * player, and a moving camera would add a second motion schedule on top of the one under test.
 */
export function createMotionProbe(
  scene: Phaser.Scene,
  textureKey: string,
  frozenFrame = 0,
): MotionProbe {
  const make = (y: number): Phaser.GameObjects.Sprite => {
    const s = scene.add.sprite(LANE.left, y, textureKey);
    s.anims.stop();
    s.setFrame(frozenFrame);
    s.setScrollFactor(0).setDepth(900);
    return s;
  };
  const stepped = make(LANE.steppedY);
  const smooth = make(LANE.smoothY);

  const caption = (y: number, text: string): void => {
    scene.add
      .text(LANE.left, y, text, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffd479',
        backgroundColor: '#000000cc',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(901);
  };
  caption(LANE.steppedY - 250, 'STEPPED  — how the game moves today (12 px every 4th refresh)');
  caption(LANE.smoothY - 250, 'SMOOTH   — what interpolation would do (every refresh)');

  const readout = scene.add
    .text(LANE.left, 60, '', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#9fe6a0',
      backgroundColor: '#000000cc',
      padding: { x: 8, y: 6 },
    })
    .setScrollFactor(0)
    .setDepth(901);

  // The stepped lane carries its own accumulator rather than reading the scene's: the point is to
  // reproduce the schedule exactly, in isolation, with nothing else able to perturb it.
  let accumulatorMs = 0;
  let steppedX = LANE.left;
  let smoothX = LANE.left;
  let frames = 0;
  let elapsedMs = 0;

  return {
    update(deltaMs: number): void {
      const delta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
      frames += 1;
      elapsedMs += delta;

      // STEPPED: whole ticks only, exactly like `drainTicks`. Between ticks it does not move at all.
      accumulatorMs += delta;
      while (accumulatorMs >= MS_PER_TICK) {
        accumulatorMs -= MS_PER_TICK;
        steppedX += PROBE_SPEED_PX_PER_TICK;
      }

      // SMOOTH: the same average speed, spread across every refresh.
      smoothX += PROBE_SPEED_PX_PER_TICK * (delta / MS_PER_TICK);

      if (steppedX > LANE.right) steppedX = LANE.left;
      if (smoothX > LANE.right) smoothX = LANE.left;
      stepped.x = steppedX;
      smooth.x = smoothX;

      if (elapsedMs >= 500) {
        const hz = (frames * 1000) / elapsedMs;
        readout.setText(
          `display ${hz.toFixed(0)} Hz   ->  ${(hz / 60).toFixed(2)} refreshes per 60 Hz tick   ` +
            `(both lanes average 720 px/s)`,
        );
        frames = 0;
        elapsedMs = 0;
      }
    },
  };
}
