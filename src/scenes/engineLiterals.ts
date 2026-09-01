/**
 * The four Phaser VALUES this project writes down as literals, and the reason it has to.
 *
 * ## Why literals at all
 *
 * `npm run test:sim-isolated` runs the whole unit suite with the engine **uninstalled** (QA
 * criterion 1.3). A value import of `phaser` anywhere in a module's import graph therefore turns a
 * boundary check into a module-resolution failure — so any scene module a unit test needs to drive
 * must reach the engine through `import type` only. Four modules needed exactly four constants:
 *
 * | literal | what it replaces | vendored source |
 * |---|---|---|
 * | `TINT_MODE_ADD` | `Phaser.TintModes.ADD` | `src/renderer/TintModes.js` |
 * | `BLEND_MODE_NORMAL` | `Phaser.BlendModes.NORMAL` | `src/renderer/BlendModes.js` |
 * | `SCENE_SHUTDOWN` | `Phaser.Scenes.Events.SHUTDOWN` | `src/scene/events/SHUTDOWN_EVENT.js` |
 * | `SCENE_UPDATE` | `Phaser.Scenes.Events.UPDATE` | `src/scene/events/UPDATE_EVENT.js` |
 *
 * **Phase 12 added nine more**, all event-name strings, for `touchControlsLayer.ts` — which has to
 * be `import type` only for exactly the same reason: it is driven by a fake scene in
 * `tests/unit/touch-draw-path.test.ts`, and criterion 12.15 runs that suite with Phaser removed.
 *
 * | literal | what it replaces |
 * |---|---|
 * | `SCENE_PAUSE` / `SCENE_SLEEP` / `SCENE_DESTROY` | `Phaser.Scenes.Events.PAUSE` / `.SLEEP` / `.DESTROY` |
 * | `GAME_BLUR` / `GAME_HIDDEN` | `Phaser.Core.Events.BLUR` / `.HIDDEN` |
 * | `INPUT_GAME_OUT` | `Phaser.Input.Events.GAME_OUT` |
 * | `INPUT_POINTER_UP` / `INPUT_POINTER_UP_OUTSIDE` | `Phaser.Input.Events.POINTER_UP` / `.POINTER_UP_OUTSIDE` |
 * | `GAMEOBJECT_POINTER_DOWN` | `Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN` |
 *
 * That bought `gamePlayerDraw.ts` and `gameEffects.ts` a behavioural gate each, in place of the
 * source-text gates QA log entry 33 recorded as the weaker of the two by some distance.
 *
 * ## 🔴 A transcribed constant is only as good as its pin
 *
 * Copying a number out of a dependency is a silent-drift hazard: the engine moves, the literal does
 * not, and nothing anywhere is red. `tests/unit/engine-literals.test.ts` pins all four against the
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

/**
 * `Phaser.Scenes.Events.UPDATE` — `node_modules/phaser/src/scene/events/UPDATE_EVENT.js:32`.
 *
 * `helpBannerLayer.ts` subscribes to it and does work only when a dirty flag is set — on the first
 * update, and after a resize. Two reasons, both lifecycle: `attachHud()` returns before
 * `UIScene.create()` has run (`gameHud.ts`), so the gear counter the banner measures itself against
 * does not exist yet; and the banner's own `resize` listener is registered BEFORE `UIScene`'s, so
 * reading the counter during a resize reads the previous size. An update always runs after every
 * listener for that frame, so deferring to one removes both problems rather than ordering them.
 *
 * The alternative was a pending-text field inside `UIScene` — Codex plan review round 2 finding 1,
 * whose fix put lifecycle state in the scene that already stops itself when `Game` shuts down. A
 * `once` on the owner's own event keeps the whole problem inside the layer.
 */
export const SCENE_UPDATE = 'update';

/**
 * `Phaser.Scenes.Events.PAUSE` — `node_modules/phaser/src/scene/events/PAUSE_EVENT.js:22`.
 *
 * 🔴 Subscribed on the bound **`Game`** scene, never on `UIScene`. `UIScene` deliberately outlives
 * PAUSED — that is how the HUD stays on screen under the Phase 11 welcome card (`UIScene.ts:160-186`)
 * — so its own pause event never fires for the state the touch controls care about.
 */
export const SCENE_PAUSE = 'pause';

/** `Phaser.Scenes.Events.SLEEP` — `src/scene/events/SLEEP_EVENT.js:22`. */
export const SCENE_SLEEP = 'sleep';

/** `Phaser.Scenes.Events.DESTROY` — `src/scene/events/DESTROY_EVENT.js:22`. */
export const SCENE_DESTROY = 'destroy';

/**
 * `Phaser.Core.Events.BLUR` — `node_modules/phaser/src/core/events/BLUR_EVENT.js:18`.
 *
 * ⚠️ **On the GAME's emitter, not a scene's — so Phaser will not clean it up for you.** Scene
 * shutdown removes `InputPlugin`'s own listeners (`InputPlugin.js:3098-3142`) and nothing else. A
 * subscription left on `game.events` survives a level-select round trip and keeps firing into a
 * destroyed layer. `touchControlsLayer.destroy()` removes them by hand; mutation M14 is the proof.
 *
 * The blur path pauses the loop **without clearing pointers** (`Game.js:645`), which is why a
 * tab-away with a thumb down would otherwise leave the player running forever.
 */
export const GAME_BLUR = 'blur';

/** `Phaser.Core.Events.HIDDEN` — `src/core/events/HIDDEN_EVENT.js:21`. Same ownership caveat as BLUR. */
export const GAME_HIDDEN = 'hidden';

/** `Phaser.Input.Events.GAME_OUT` — `src/input/events/GAME_OUT_EVENT.js:22`. The pointer left the canvas. */
export const INPUT_GAME_OUT = 'gameout';

/**
 * `Phaser.Input.Events.POINTER_UP` — `node_modules/phaser/src/input/events/POINTER_UP_EVENT.js:30`.
 *
 * 🔴 **The authoritative release, and the one a first draft leaves out.** Phaser's own docs:
 * *"dispatched by the Input Plugin belonging to a Scene if a pointer is released **anywhere**"*,
 * with the hierarchy `GAMEOBJECT_POINTER_UP` -> `GAMEOBJECT_UP` -> `POINTER_UP` or
 * `POINTER_UP_OUTSIDE`. A Game Object's own `pointerup` fires only when the release happens over
 * that object — so press RIGHT, slide the thumb onto empty canvas, lift, and the button never hears
 * about it. Mutation M6 deletes this subscription and 12.5 must go red.
 */
export const INPUT_POINTER_UP = 'pointerup';

/** `Phaser.Input.Events.POINTER_UP_OUTSIDE` — `src/input/events/POINTER_UP_OUTSIDE_EVENT.js:29`. */
export const INPUT_POINTER_UP_OUTSIDE = 'pointerupoutside';

/**
 * `Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN` —
 * `src/input/events/GAMEOBJECT_POINTER_DOWN_EVENT.js:36`.
 *
 * The only per-object event the touch controls use. Everything else is scene-level, because a
 * release must be caught wherever it lands.
 */
export const GAMEOBJECT_POINTER_DOWN = 'pointerdown';
