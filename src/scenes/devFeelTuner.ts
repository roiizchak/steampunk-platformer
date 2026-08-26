import type Phaser from 'phaser';
import { devSeam } from '../debug/devSeam';
import type { World } from '../sim/types';

/**
 * DEV-ONLY live tuner for locomotion cadence and speed — the Street-Fighter `PlaygroundScene`
 * equivalent, scoped to the two knobs this project is actually stuck on.
 *
 * ## Why this exists rather than another set of presets
 *
 * Locomotion cadence is authored now (`src/render/animTiming.ts`), which was the right rule change,
 * but the STARTING NUMBERS were still derived from a measurement with a ±20 % spread — foot travel
 * per frame read 17.85 to 23.75 px depending on method. The user reported the character still reads
 * wrong, and a third round of me picking a number out of that spread is not a plan.
 *
 * The sibling project settles exactly this by hand, live, against the running character. So:
 *
 *   1. Hold RIGHT and watch the feet.
 *   2. `[` / `]` change the cadence of whichever loop is playing.
 *   3. `-` / `=` change movement speed.
 *   4. When the feet stop sliding, read the numbers off the overlay and paste them into
 *      `character-bounds.json` -> `animations.<name>.fps` and the tuning knobs.
 *
 * **`SLIP` is the number to drive to zero.** It is `bodyTravelPerFrame - footTravelPerFrame`, in
 * world px: positive means the feet skate forwards (the "ghost"), negative means they drag. The
 * foot-travel figures are the per-frame measurements taken off the shipped sheets, and they are the
 * one quantity in this whole problem that measured cleanly.
 *
 * ## Why `timeScale` rather than re-registering the animation
 *
 * `sprite.anims.timeScale` multiplies playback rate live, on one property, with no re-`play()` —
 * and re-`play()` is exactly what restarts a looping animation at frame 0 every time it is called
 * (`playAnim.ts`'s frame-0 guard exists for that). Effective fps is `baseFps * timeScale`, which the
 * overlay reports directly so what you paste is an fps and not a scale factor.
 *
 * Guarded at the point of use in `GameScene`, so it is tree-shaken out of `dist/`.
 */

/**
 * Foot travel per painted frame, world px, measured off the shipped sheets by tracking the planted
 * foot across cells. This is the ART's contribution and does not change with speed or cadence.
 *
 * Run is the tighter reading (sd 1.51 px on the 3px contact band); walk's methods spread more. They
 * are here to compute SLIP for the overlay — a guide for the eye, not an authority. The eye decides.
 */
const FOOT_PX_PER_FRAME: Record<string, number> = { run: 22.5, walk: 9.0 };

/**
 * 🔴 The knob steps in TICKS PER FRAME, not in fps, and that is the whole point of the second pass.
 *
 * The first version stepped +/-1 fps and the user reported it made no difference in either
 * direction. It didn't: a frame can only be held for a whole number of 60 Hz refreshes, so of the
 * values a 1-fps step reaches around 31, only 30 divides evenly. Every other setting juddered too,
 * just with a different pattern — which is why up and down looked identical.
 *
 * Stepping the DWELL makes every reachable value legal: 1 tick/frame = 60 fps, 2 = 30, 3 = 20,
 * 4 = 15, 5 = 12, 6 = 10, 8 = 7.5. The steps are coarse on purpose. They are the only steps there
 * are.
 */
const MAX_TICKS_PER_FRAME = 20;

interface TunerState {
  /** Ticks (== refreshes) each drawn frame is held for. Integer >= 1. Effective fps is `60 / tpf`. */
  runTpf: number;
  walkTpf: number;
  speedScale: number;
}

/** Nearest legal dwell for an fps, matching `cadenceTicks`. */
const tpfFor = (fps: number): number => Math.max(1, Math.round(60 / fps));

/**
 * Install the tuner. Returns an `update` to call once per frame with the drawn player sprite.
 *
 * `baseRunFps` / `baseWalkFps` come from the catalog, so the overlay's numbers are absolute fps a
 * human can paste, never deltas.
 */
export function createFeelTuner(
  scene: Phaser.Scene,
  world: World,
  base: { runFps: number; walkFps: number },
): (sprite: Phaser.GameObjects.Sprite) => void {
  devSeam('__DEVSEAM_devFeelTuner_createFeelTuner__');
  const shippedRunMax = world.tuning.runMax;
  const shippedWalkMax = world.tuning.walkMax;
  const state: TunerState = {
    runTpf: tpfFor(base.runFps),
    walkTpf: tpfFor(base.walkFps),
    speedScale: 1,
  };

  const label = scene.add
    .text(24, 900, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffd479',
      backgroundColor: '#000000cc',
      padding: { x: 10, y: 8 },
    })
    .setScrollFactor(0)
    .setDepth(1000);

  const nudge = (key: string, fn: () => void): void => {
    scene.input.keyboard?.on(`keydown-${key}`, fn);
  };
  // Cadence of whichever loop is playing, so one pair of keys tunes both without a mode.
  // `]` is FASTER, so it decrements the dwell — the key that reads as "more" still gives more fps.
  const stepDwell = (by: number): void => {
    const clamp = (t: number): number => Math.min(MAX_TICKS_PER_FRAME, Math.max(1, t + by));
    if (world.player.state === 'walk') state.walkTpf = clamp(state.walkTpf);
    else state.runTpf = clamp(state.runTpf);
  };
  nudge('OPEN_BRACKET', () => stepDwell(1));
  nudge('CLOSED_BRACKET', () => stepDwell(-1));
  nudge('MINUS', () => {
    state.speedScale = Math.max(0.1, Number((state.speedScale - 0.05).toFixed(2)));
  });
  nudge('PLUS', () => {
    state.speedScale = Number((state.speedScale + 0.05).toFixed(2));
  });
  nudge('ZERO', () => {
    state.runTpf = tpfFor(base.runFps);
    state.walkTpf = tpfFor(base.walkFps);
    state.speedScale = 1;
  });

  return (sprite: Phaser.GameObjects.Sprite): void => {
    world.tuning.runMax = shippedRunMax * state.speedScale;
    world.tuning.walkMax = shippedWalkMax * state.speedScale;

    const playing = world.player.state === 'walk' ? 'walk' : 'run';
    const tpf = playing === 'walk' ? state.walkTpf : state.runTpf;
    const wanted = 60 / tpf;
    const baseFps = playing === 'walk' ? base.walkFps : base.runFps;
    sprite.anims.timeScale = wanted / baseFps;

    // Body travel per painted frame at the CURRENT settings, against what the art draws.
    const topSpeed = playing === 'walk' ? world.tuning.walkMax : world.tuning.runMax;
    const bodyPerFrame = (60 / wanted) * topSpeed;
    const footPerFrame = FOOT_PX_PER_FRAME[playing] ?? 0;
    const slip = bodyPerFrame - footPerFrame;

    const fpsOf = (t: number): string => (60 / t).toFixed(2);
    label.setText(
      [
        `LOCOMOTION TUNER   [ slower / ] faster   - = speed   0 reset`,
        `state ${playing}   speed x${state.speedScale.toFixed(2)}   runMax ${world.tuning.runMax.toFixed(2)}  walkMax ${world.tuning.walkMax.toFixed(2)}`,
        `walk ${state.walkTpf} ticks/frame = ${fpsOf(state.walkTpf)} fps     run ${state.runTpf} ticks/frame = ${fpsOf(state.runTpf)} fps`,
        `body/frame ${bodyPerFrame.toFixed(1)}px   foot/frame ${footPerFrame.toFixed(1)}px   SLIP ${slip >= 0 ? '+' : ''}${slip.toFixed(1)}px  <- drive to 0`,
      ].join('\n'),
    );
  };
}
