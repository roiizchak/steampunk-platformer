import type Phaser from 'phaser';
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

interface TunerState {
  runFps: number;
  walkFps: number;
  speedScale: number;
}

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
  const shippedRunMax = world.tuning.runMax;
  const shippedWalkMax = world.tuning.walkMax;
  const state: TunerState = { runFps: base.runFps, walkFps: base.walkFps, speedScale: 1 };

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
  nudge('OPEN_BRACKET', () => {
    if (world.player.state === 'walk') state.walkFps = Math.max(1, state.walkFps - 1);
    else state.runFps = Math.max(1, state.runFps - 1);
  });
  nudge('CLOSED_BRACKET', () => {
    if (world.player.state === 'walk') state.walkFps += 1;
    else state.runFps += 1;
  });
  nudge('MINUS', () => {
    state.speedScale = Math.max(0.1, Number((state.speedScale - 0.05).toFixed(2)));
  });
  nudge('PLUS', () => {
    state.speedScale = Number((state.speedScale + 0.05).toFixed(2));
  });
  nudge('ZERO', () => {
    state.runFps = base.runFps;
    state.walkFps = base.walkFps;
    state.speedScale = 1;
  });

  return (sprite: Phaser.GameObjects.Sprite): void => {
    world.tuning.runMax = shippedRunMax * state.speedScale;
    world.tuning.walkMax = shippedWalkMax * state.speedScale;

    const playing = world.player.state === 'walk' ? 'walk' : 'run';
    const wanted = playing === 'walk' ? state.walkFps : state.runFps;
    const baseFps = playing === 'walk' ? base.walkFps : base.runFps;
    sprite.anims.timeScale = wanted / baseFps;

    // Body travel per painted frame at the CURRENT settings, against what the art draws.
    const topSpeed = playing === 'walk' ? world.tuning.walkMax : world.tuning.runMax;
    const bodyPerFrame = (60 / wanted) * topSpeed;
    const footPerFrame = FOOT_PX_PER_FRAME[playing] ?? 0;
    const slip = bodyPerFrame - footPerFrame;

    label.setText(
      [
        `LOCOMOTION TUNER   [ ] cadence   - = speed   0 reset`,
        `state ${playing}   speed x${state.speedScale.toFixed(2)}   runMax ${world.tuning.runMax.toFixed(2)}  walkMax ${world.tuning.walkMax.toFixed(2)}`,
        `walk fps ${state.walkFps}    run fps ${state.runFps}`,
        `body/frame ${bodyPerFrame.toFixed(1)}px   foot/frame ${footPerFrame.toFixed(1)}px   SLIP ${slip >= 0 ? '+' : ''}${slip.toFixed(1)}px  <- drive to 0`,
      ].join('\n'),
    );
  };
}
