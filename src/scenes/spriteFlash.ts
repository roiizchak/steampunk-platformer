/**
 * `hitFlashAlpha` → a drawn white flash. ONE definition, applied by both the player and the enemies.
 *
 * ## 🔴 `setTintFill` does not exist in Phaser 4, and it does not throw
 *
 * `node_modules/phaser/src/gameobjects/components/Tint.js:276-280`:
 *
 * > *"`setTintFill(color)` is removed as of Phaser 4. Use `setTint(color).setTintMode(
 * > Phaser.TintModes.FILL)` instead."*
 *
 * The Phaser 3 method survives as a **stub that logs to `console.error` and returns `undefined`** —
 * so a flash written the Phaser 3 way typechecks against the arity-0 signature only if you pass no
 * argument, draws nothing at all, and reports the failure to a console nobody reads during a spec
 * run. This is `ENGINE-NOTES.md` territory and it is written here because this file is the only
 * place in the project that tints a sprite.
 *
 * ## Why ADD rather than FILL
 *
 * FILL replaces the pixel with the tint colour, so a partial flash is a grey silhouette and the
 * decay reads as the character turning to stone. ADD adds the tint to the texture, so a black tint
 * is a no-op and white is fully blown out: `hitFlashAlpha`'s decay maps onto it directly and the
 * character stays itself the whole way down. `light`'s four-tick ramp is the only class that decays
 * at all — `lethal` and `playerHurt` hold at 1 — and the ramp is exactly what FILL would have wasted.
 *
 * ## Why the mode is a LITERAL and not `Phaser.TintModes.ADD`
 *
 * Both callers — `gamePlayerDraw.ts` for the player and `enemyLayer.ts` for the enemies — reach this
 * from `enemy-layer-catalog.test.ts` and friends, and **`npm run test:sim-isolated` runs the whole
 * unit suite with Phaser uninstalled**. A value import of the engine anywhere in that graph turns a
 * boundary check into a module-resolution failure.
 *
 * The number itself moved to `engineLiterals.ts` when `gameEffects.ts` needed the same treatment for
 * two more, and is **re-exported from here** so every existing `from './spriteFlash'` still
 * resolves. `engineLiterals.ts` carries the pin's reasoning; `tests/unit/engine-literals.test.ts`
 * and `tests/e2e/phase-09-draw.spec.ts` both hold it against the vendored engine.
 */

import type Phaser from 'phaser';
import { TINT_MODE_ADD } from './engineLiterals';

export { TINT_MODE_ADD };

/** Anything with the Tint component. `Shape`/`Rectangle` does NOT have it — see `enemyLayer.ts`. */
type Tintable = Pick<Phaser.GameObjects.Sprite, 'setTint' | 'setTintMode' | 'clearTint'>;

/**
 * Draw `flash` (0–1, from `hitFlashAlpha`) on `target`. Called on EVERY frame, flashing or not.
 *
 * The `else` branch is the feature, not defensive noise: clearing unconditionally is what makes the
 * flash self-correcting across a death, a restart and a level change, with nothing armed and nothing
 * to tear down — the same no-teardown shape `spriteFeedback.ts`'s header argues for. An armed flash
 * that a listener has to remember to clear is how Phase 6 paid for the HUD's lifetime.
 */
export function applyHitFlash(target: Tintable, flash: number): void {
  if (flash <= 0) {
    // Resets the colour AND the mode — `clearTint()` restores `TintModes.MULTIPLY` with 0xffffff,
    // which is the neutral both halves of.
    target.clearTint();
    return;
  }
  const v = Math.round(255 * Math.min(1, flash));
  target.setTint((v << 16) | (v << 8) | v).setTintMode(TINT_MODE_ADD);
}
