/**
 * Drawing the player, and the DEV-only locomotion-feel variant that re-paces it.
 *
 * Split out of `GameScene.ts` on 2026-08-15 to bring it under the 400-line rule (criterion
 * 4.16 / 5.12), following the sibling pattern this scene already uses for `gameLevelDraw.ts`,
 * `gameHud.ts` and `gameParallax.ts`.
 *
 * ⚠️ That sentence used to end "the scene keeps a one-line method, the logic lives here". It does
 * not: the one-line wrappers were inlined at their call sites on 2026-08-17 to bring
 * `GameScene.ts` back under 400, so `update()` calls `renderPlayerSprite` directly.
 *
 * The `import.meta.env.DEV` guards moved WITH their bodies and are still at the point of use, so
 * the branches and the imports they reach are tree-shaken out of `dist/` — `verify-dist` proves the
 * absence, and that proof is what the guards exist for.
 */

import Phaser from 'phaser';
import { LOCOMOTION_KEYS, tunedFps, variantFromSearch } from '../game/feelVariants';
import { ATTACK_CONTACT_FRAME_INDEX } from '../render/effects';
import { interpolatedPosition, renderAlpha, type Point } from '../render/interpolate';
import { animKeyFor, playerRenderDesc } from '../render/playerView';
import { frozen } from '../sim/hitstop';
import type { World } from '../sim/types';
import { registerCatalogAnimations } from './gameAnimations';
import { playIfChanged } from './playAnim';

export function renderPlayerSprite(
  sprite: Phaser.GameObjects.Sprite,
  world: World,
  prevPlayer: Point | null,
  accumulatorMs: number,
  feelTuner?: (sprite: Phaser.GameObjects.Sprite) => void,
): void {
  const desc = playerRenderDesc(world.player, world.scale, world.goalEntryTicks);
  // Drawn BETWEEN the last two ticks, not at the current one. Without this the sprite is held
  // still on every frame `drainTicks` returns 0 ticks for — three refreshes out of four at
  // 240 Hz — and then jumps 12 px, which is the "ghost / double image" the user reported and
  // which the `?probe=1` falsifier reproduced with the animation frozen. See
  // `src/render/interpolate.ts`. `accumulatorMs` is already the time since the last whole
  // tick, so it is exactly the blend factor.
  const drawn = interpolatedPosition(prevPlayer, desc, renderAlpha(accumulatorMs));
  sprite.setPosition(drawn.x, drawn.y);

  // A real flip at last. Phase 2 drew facing as a "nose" rectangle because Phaser 4's Flip
  // component is mixed into Sprite and Image but NOT into Shape, so the grey-box `Rectangle`
  // had no `setFlipX` — the typechecker caught that, not a test. The decision was exercised
  // anyway so it would not arrive untested in this phase, which is why this line is a
  // one-for-one replacement rather than new behaviour.
  sprite.setFlipX(desc.flipX);

  // The gate-entry fade. Applied EVERY frame from the descriptor rather than tweened once, so it
  // is self-correcting: a new level builds a world with `goalEntryTicks: null`, the descriptor
  // says 1, and the sprite is opaque again on the first frame with nothing to tear down. See
  // `goalEntryAlpha` in `playerView.ts` for why a Phaser tween was rejected.
  sprite.setAlpha(desc.alpha);

  // Routed through `playAnim.ts` — see its header for the frame-0 and missing-key guards this
  // used to reimplement inline (R10).
  playIfChanged(sprite, desc.animKey);

  // 🔴 The hit-stop freeze's DRAWN frame — Phase 9, and it has to live here.
  //
  // The line above re-derives the animation from sim state on EVERY frame, so an `anims.pause()` or
  // `setCurrentFrame()` called from anywhere else is silently overwritten within one frame. Both are
  // therefore recomputed here from a sim predicate, in the same self-correcting shape as the
  // `goalEntryAlpha` line four lines up: nothing is armed, nothing is torn down, and a restart or a
  // new level needs no cancellation path.
  //
  // The SNAP is the part a screenshot cannot see. Contact lands on `combatCounter` 8–9, the last two
  // ticks of the four-tick active window — so a freeze that simply held whatever frame the renderer
  // had last advanced to would hold a mid-wind-up pose, which is the opposite of what a freeze is
  // for. `ATTACK_CONTACT_FRAME_INDEX` is a measurement traced against the shipped sheet; see its
  // docstring in `spriteFeedback.ts`, and note that `sheetGates.mjs`'s G5 passes here and is blind
  // to it.
  if (frozen(world.player, world.tickCount)) {
    sprite.anims.pause();
    const frames = sprite.anims.currentAnim?.frames;
    // Only the attack clip is snapped: every other clip's frozen pose is already the right one.
    // The bounds check is not defensive noise — a regenerated sheet with fewer frames must draw the
    // wrong pose for a few ticks, never take the scene down inside a render loop.
    if (desc.animKey === animKeyFor('attack') && frames && frames.length > ATTACK_CONTACT_FRAME_INDEX) {
      sprite.anims.setCurrentFrame(frames[ATTACK_CONTACT_FRAME_INDEX]);
    }
  } else {
    // UNCONDITIONALLY, every frame. Resuming a running animation is a no-op, and doing it without a
    // guard is exactly what makes the pause above self-correcting across a restart — there is no
    // "was frozen" flag to leak.
    sprite.anims.resume();
  }

  // DEV ONLY — the live locomotion tuner's per-frame update. Guarded at the point of use so the
  // branch and its import are tree-shaken out of `dist/`; `verify-dist` proves the absence.
  if (import.meta.env.DEV) {
    feelTuner?.(sprite);
  }
}

/** Registration logic lives in `gameAnimations.ts` — see its header. */
export function registerAnimations(scene: Phaser.Scene): void {
  if (import.meta.env.DEV) {
    // DEV ONLY — the locomotion-feel A/B (`?feel=1`). Guarded at the point of use so the whole
    // branch, and the import it reaches, are tree-shaken out of `dist/`; `verify-dist` proves it.
    // Only locomotion is re-paced: `simTicks` for a one-shot like `attack` is a COMBAT WINDOW
    // written against `tick.ts`'s numbered order, and scaling it would be a balance change
    // wearing an animation change's clothes.
    const variant = variantFromSearch(globalThis.location?.search ?? '');
    if (variant.strideScale !== 1 || variant.speedScale !== 1) {
      registerCatalogAnimations(scene, (sheet) =>
        LOCOMOTION_KEYS.has(sheet.key)
          ? tunedFps(sheet.frameCount, sheet.simTicks, variant)
          : sheet.fps,
      );
      return;
    }
  }
  registerCatalogAnimations(scene);
}


/**
 * DEV ONLY — apply the locomotion-feel variant's speed scale to this world's tuning.
 *
 * `world.tuning` is a per-world copy (`createTuning()`), so this cannot leak into another world
 * or into `DEFAULT_TUNING`. Speed and stride are deliberately separate knobs: scaling speed alone
 * does NOT change foot-slide, because ground travel per cycle is `simTicks * topSpeed` and
 * `simTicks` is itself derived from the speed.
 *
 * ⚠️ `KNOCKBACK_SPEED` is bound to `DEFAULT_TUNING.walkMax` at module load, so it does NOT scale
 * with this. That is fine for judging locomotion and would NOT be fine for shipping a retune —
 * recorded rather than papered over.
 */
export function applyFeelVariant(world: World): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const variant = variantFromSearch(globalThis.location?.search ?? '');
  if (variant.speedScale === 1) {
    return;
  }
  world.tuning.runMax *= variant.speedScale;
  world.tuning.walkMax *= variant.speedScale;
}
