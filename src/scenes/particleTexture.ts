/**
 * The particle: one dot per kind, generated rather than loaded, **in the spec's own colour**.
 *
 * Grey-box before art (CLAUDE.md §3): the mechanics ship first and the fal spend comes after they
 * are playable. Generated into the texture manager once and guarded on `exists`, because
 * `attachEffects` runs again on every `create()` and `generateTexture` on a live key throws.
 *
 * 🔴 **Three textures rather than one white dot plus `setTint`, and that is not a style choice.**
 * `playerView.ts:60-62` records the reason: tint is WebGL-only in Phaser 4, this game runs
 * `Phaser.AUTO` with a live Canvas fallback, and a tinted texture renders **plain white** there. A
 * tint would therefore be correct on the machine it was written on and silently absent on someone
 * else's — with a green suite, because nothing in a unit test has a renderer. Baking the colour at
 * `generateTexture` time is the same picture on both backends.
 *
 * Three textures cost three entries in the texture manager and nothing per frame: the emitters still
 * share one `BatchHandlerQuad` run, so the batch-flush argument in `effects.ts`'s header is
 * unaffected.
 *
 * ## Why it is a file rather than three functions in `gameEffects.ts`
 *
 * `gameEffects.ts` reached 401 lines when the Phase 9 gate round added the shutdown teardown and the
 * landing squash, and this project splits rather than exempts. The seam is real: everything here is
 * about what a particle LOOKS like and runs once per key for the life of the game, and everything
 * there is about WHEN effects fire and runs every frame. `effects-draw-path.test.ts` follows the
 * function rather than the filename, so the gate on `spec.tint` moved with it.
 */

import type Phaser from 'phaser';
import type { EffectKind, EmitterSpec } from '../render/effects';

/** Every generated key starts with this — the e2e depth spec selects emitters by texture key. */
export const PARTICLE_TEXTURE_PREFIX = 'fx-particle-';

/** The dot's radius in texture pixels. The emitter's `scale` op is what sizes it on screen. */
const PARTICLE_RADIUS = 6;

export function ensureParticleTexture(
  scene: Phaser.Scene,
  kind: EffectKind,
  spec: EmitterSpec,
): string {
  const key = `${PARTICLE_TEXTURE_PREFIX}${kind}`;
  if (scene.textures.exists(key)) {
    return key;
  }
  const size = PARTICLE_RADIUS * 2;
  const pen = scene.make.graphics({ x: 0, y: 0 }, false);
  pen.fillStyle(spec.tint, 1).fillCircle(PARTICLE_RADIUS, PARTICLE_RADIUS, PARTICLE_RADIUS);
  pen.generateTexture(key, size, size);
  pen.destroy();
  return key;
}
