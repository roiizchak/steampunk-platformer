import type Phaser from 'phaser';
import { MS_PER_TICK } from '../game/constants';
import { DEFAULT_TUNING } from '../sim/playerTuning';

/**
 * DEV-ONLY falsification probe for the "ghost / double image" report (`?probe=1`).
 *
 * ## What it is for
 *
 * Six hypotheses were tested against the running game and all six were falsified: animation
 * cadence, movement speed, canvas nearest-neighbour resampling, a second sprite in the display
 * list, camera jitter, and pose-doubling via `anims.timeScale`. The current hypothesis is that a
 * 60 Hz fixed-timestep sim on a 240 Hz display holds each drawn POSITION for four refreshes and
 * then jumps `runMax` — sample-and-hold judder.
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
 * ## ⚠️ The outcome is still UNRECORDED, and the probe could not have produced it
 *
 * Item 3.12's complaint is that this probe's diagnosis *"was never proven"* — no comment records a
 * run. It could not have been run usefully: `PROBE_SPEED_PX_PER_TICK` was the literal `12` against a
 * `runMax` of 9.0, so the stepped lane jumped a third further than the game ever does. That is fixed
 * above.
 *
 * Running it needs a **240 Hz display and a pair of eyes** — the whole point is that the headless
 * harness runs at 18–60 Hz and cannot exhibit the effect. So it is `play`-owned, it is on the S.9
 * list, and the three outcomes above say what each one decides. **Write the result here.**
 *
 * ## ⚠️ 2026-08-26 — an owner PLAY observation, which is NOT this probe's outcome
 *
 * The owner played the shipped game on this machine (measured **173–174 Hz**, the right substrate)
 * and reported it looked good — **no judder visible in ordinary play.** Recorded because it is real
 * evidence from the only hardware that could show the effect, and because it is the first time
 * anyone has looked at this question on a high-refresh display at all.
 *
 * 🔴 **It does not settle the probe, and must not be written into the three outcomes above.**
 * *"Nothing looked wrong while playing"* is consistent with **NEITHER ghosts** and with a
 * **STEPPED-only** ghost that is simply hard to catch without the side-by-side lanes — which is the
 * entire reason those lanes exist. The probe holds one frozen pose so that pose cadence is excluded
 * by construction; ordinary play excludes nothing, so it cannot distinguish "position hold is fine"
 * from "position hold is bad but the animation masks it".
 *
 * **The item stays OPEN.** What closes it is `?probe=1` on this display and a reading of which of
 * the three outcomes above occurred.
 *
 * ## ✅ 2026-08-26 — RUN, AND THE OUTCOME IS RECORDED: **STEPPED ghosts, SMOOTH is clean**
 *
 * The owner ran `?probe=1` on this machine and reported that **the bottom lane — SMOOTH — is the
 * one that looks good.** Bottom is SMOOTH by construction (`LANE.smoothY` 640 against
 * `LANE.steppedY` 300), so the reading is unambiguous and it is the first of the three outcomes
 * above.
 *
 * 🔴 **The diagnosis HOLDS**, and it held against the falsifier the Codex plan review itself
 * proposed: *"the effect persisting with one frozen pose translated directly per rAF."* The
 * animation is stopped on a single frame here, so pose cadence is excluded by construction — the
 * only thing differing between the lanes is the position schedule. **Holding position for three
 * refreshes and then jumping 12 px is the cause**, on a display fast enough to show it.
 *
 * ⚠️ **AND IT COMMISSIONS NO WORK, because the fix already shipped — a correction to what was
 * first written here.** `src/render/interpolate.ts` landed in `01f2ae7` on **2026-08-14**, the same
 * day as this probe (`7ccc4ad`), and `renderAlpha` / `interpolatedPosition` are consumed
 * unconditionally by `gamePlayerDraw.ts` for the player and `enemyLayer.ts` for the enemies. The
 * first record of this outcome said it *"authorises building render interpolation"*. **It does not.
 * That was already built, and the reading confirms it rather than commissioning it.**
 *
 * So what the run actually establishes, which is the more useful thing:
 *
 *  1. **The shipped behaviour is the SMOOTH lane**, verified by eye on hardware that can show the
 *     difference — the first such verification this project has ever had. Every prior measurement
 *     ran on an 18–60 Hz headless harness that cannot exhibit the effect.
 *  2. **The STEPPED lane is the PRE-`01f2ae7` schedule**, kept as the comparison, and its captions
 *     had gone stale saying otherwise — fixed below.
 *  3. It explains what looked like a contradiction: the owner found ordinary play good **because**
 *     interpolation ships, and the STEPPED lane ghosted **because** it reproduces the old schedule
 *     on purpose.
 *
 * Guarded at the point of creation in `GameScene`, so it is tree-shaken out of `dist/`.
 */

/**
 * World px per tick the probe travels: **`DEFAULT_TUNING.runMax`, read rather than restated.**
 *
 * 🔴 **This was the literal `12`, and it was wrong by a third** *(inventory 3.12)*. The comment said
 * *"`DEFAULT_TUNING.runMax`, the speed the report concerns"* while hardcoding a number `runMax` has
 * not held since Phase 4's rescale: it is `FOOT_PX_PER_FRAME.run / LOCOMOTION_TICKS_PER_FRAME` =
 * 18.0 / 2 = **9.0**.
 *
 * That is not a cosmetic staleness. This probe exists to **falsify** a hypothesis by eye, and a
 * stepped lane jumping 12 px where the game jumps 9 makes the judder **33 % more visible than it
 * really is**. Anyone who had run it would have been falsifying a hypothesis about a speed the game
 * never reaches — and the item's complaint is precisely that the diagnosis was never proven. It
 * could not have been proven with this constant.
 *
 * Same defect class as this session's Tier 4, in the one place it does the most damage: an
 * instrument that lies about its own calibration.
 */
const PROBE_SPEED_PX_PER_TICK = DEFAULT_TUNING.runMax;

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
  // 🔴 **Both captions were STALE and said the opposite of the truth for twelve days.** They
  // read *"how the game moves today"* and *"what interpolation would do"* — written before
  // `01f2ae7` landed `src/render/interpolate.ts` on the same day this probe was built. The game has
  // drawn between ticks ever since, so SMOOTH is what it does today and STEPPED is what it USED to
  // do. A dev overlay that tells its reader the game has a defect it already fixed is worse than no
  // overlay, and this one had an owner read it before the wording was caught.
  caption(LANE.steppedY - 250, 'STEPPED  — the OLD schedule, before 01f2ae7 (12 px every 4th refresh)');
  caption(LANE.smoothY - 250, 'SMOOTH   — what the game does TODAY: render interpolation, every refresh');

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
