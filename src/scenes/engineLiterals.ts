/**
 * The three Phaser VALUES this project writes down as literals, and the reason it has to.
 *
 * ## Why literals at all
 *
 * `npm run test:sim-isolated` runs the whole unit suite with the engine **uninstalled** (QA
 * criterion 1.3). A value import of `phaser` anywhere in a module's import graph therefore turns a
 * boundary check into a module-resolution failure — so any scene module a unit test needs to drive
 * must reach the engine through `import type` only. Three modules needed exactly three constants:
 *
 * | literal | what it replaces | vendored source |
 * |---|---|---|
 * | `TINT_MODE_ADD` | `Phaser.TintModes.ADD` | `src/renderer/TintModes.js` |
 * | `BLEND_MODE_NORMAL` | `Phaser.BlendModes.NORMAL` | `src/renderer/BlendModes.js` |
 * | `SCENE_SHUTDOWN` | `Phaser.Scenes.Events.SHUTDOWN` | `src/scene/events/SHUTDOWN_EVENT.js` |
 *
 * That bought `gamePlayerDraw.ts` and `gameEffects.ts` a behavioural gate each, in place of the
 * source-text gates QA log entry 33 recorded as the weaker of the two by some distance.
 *
 * ## 🔴 A transcribed constant is only as good as its pin
 *
 * Copying a number out of a dependency is a silent-drift hazard: the engine moves, the literal does
 * not, and nothing anywhere is red. `tests/unit/engine-literals.test.ts` pins all three against the
 * vendored source **in the unit suite**, so a Phaser upgrade landed without running Playwright is
 * still caught — QA log entry 34, which is the half of this that used to run only under e2e.
 *
 * ⚠️ **If a pin reds, change the LITERAL here. Never the assertion.**
 *
 * ⚠️ **This file must never import Phaser, not even as a type.** There is nothing to type: they are
 * a number, a number and a string. A `typeof Phaser.TintModes.ADD` annotation would re-create the
 * dependency this file exists to remove — from a type position, which is safe today and is exactly
 * the sort of thing a later edit promotes to a value import without noticing.
 */

/**
 * `Phaser.TintModes.ADD` — `node_modules/phaser/src/renderer/TintModes.js:52`.
 *
 * Used by `spriteFlash.ts`, which re-exports it for the callers that had it from there first.
 * ADD rather than FILL for the reason that file's header gives, and `setTintFill` is not an option
 * at all: it is REMOVED in Phaser 4 and survives as a stub that logs and returns `undefined`.
 */
export const TINT_MODE_ADD = 2;

/**
 * `Phaser.BlendModes.NORMAL` — `node_modules/phaser/src/renderer/BlendModes.js:35`.
 *
 * Load-bearing rather than a default worth omitting: a blend-mode change forces a batch flush, and
 * the particle depth band exists precisely so the effects join the player's existing quad run for
 * zero extra flushes. ADD would cost one flush every frame, forever, and be invisible in a
 * screenshot — see `effects.ts`'s header, and `effects-draw-path.test.ts`, which gates the value.
 */
export const BLEND_MODE_NORMAL = 0;

/**
 * `Phaser.Scenes.Events.SHUTDOWN` — `node_modules/phaser/src/scene/events/SHUTDOWN_EVENT.js:25`.
 *
 * The string, not the constant object, because that is all the constant ever was. Phaser's own
 * docs say to listen for it as `this.events.on('shutdown', listener)`.
 */
export const SCENE_SHUTDOWN = 'shutdown';
