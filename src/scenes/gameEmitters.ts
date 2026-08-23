/**
 * The particle-emitter factory: one emitter per `EffectKind`, every field read out of the spec.
 *
 * Extracted from `gameEffects.ts` on 2026-08-23, and the reason is worth stating. That file sat at
 * **exactly 400 lines**, so inventory 3.1's one-line phase change could not carry a comment
 * explaining itself — and the 400-line rule's own wording forbids the obvious dodge: *"do not get
 * under the limit by deleting the comments that explain the code."* A file at its ceiling makes the
 * next change either unexplained or oversized; extraction is the only honest third option, and this
 * is the seventh time this session has reached that conclusion.
 *
 * A clean seam rather than a convenient one: nothing here touches the effect attachment's state. It
 * is a pure `(scene, kind, spec) → emitter` construction, called once per kind at attach time and
 * never again — which is also why it needs no draw-path gate of its own beyond the ones
 * `effects-draw-path.test.ts` already applies to its output.
 */

import type Phaser from 'phaser';
import { TICK_HZ } from '../game/constants';
import { ticksToMs } from '../sim';
import { BLEND_MODE_NORMAL } from './engineLiterals';
import { ensureParticleTexture } from './particleTexture';
import type { EffectKind, EmitterSpec } from '../render/effects';

/**
 * Per-tick spec values to the per-second units Phaser's emitter config wants.
 *
 * Moved here with `createEmitter`, its only consumer. `TICK_HZ` is the project's single authority
 * for the ratio, and the square is written once rather than inline at the config so a spec value
 * cannot be converted at the wrong order by an edit that copies the neighbouring line.
 */
const perSecond = (pxPerTick: number): number => pxPerTick * TICK_HZ;
const perSecondSquared = (pxPerTickSquared: number): number => pxPerTickSquared * TICK_HZ * TICK_HZ;

/**
 * One emitter per `EffectKind`, every field read out of the spec.
 *
 * `emitting: false` because every one of these is an `explode()`, never a flow. `reserve()` walks
 * the particle pool up front so a burst neither allocates nor spikes GC at the exact moment the
 * frame budget is tightest.
 */
export function createEmitter(
  scene: Phaser.Scene,
  kind: EffectKind,
  spec: EmitterSpec,
): Phaser.GameObjects.Particles.ParticleEmitter {
  return scene.add
    .particles(0, 0, ensureParticleTexture(scene, kind, spec), {
      lifespan: ticksToMs(spec.lifespanTicks),
      speed: { min: perSecond(spec.speedMin), max: perSecond(spec.speedMax) },
      scale: { start: spec.scaleStart, end: spec.scaleEnd },
      alpha: { start: spec.alphaStart, end: spec.alphaEnd },
      gravityY: perSecondSquared(spec.gravityY),
      angle: { min: spec.angleMin, max: spec.angleMax },
      maxAliveParticles: spec.maxAliveParticles,
      emitting: false,
    })
    .setDepth(spec.depth)
    // NORMAL, and load-bearing: a blend-mode change forces a batch flush, and the depth band exists
    // so these join the player's existing quad run for zero extra flushes. ADD would cost one flush
    // every frame, forever, and be invisible in a screenshot.
    .setBlendMode(BLEND_MODE_NORMAL)
    .reserve(spec.reserve);
}