/**
 * Everything `GameScene` does that only exists in a DEV build, in one place.
 *
 * ## Why it moved here
 *
 * `GameScene.ts` is the file this project keeps pushing at the 400-line ceiling, and
 * `tests/unit/file-size.test.ts` permits exactly one file over it. Phase 6 pushed it from 459 to 471
 * by adding the gear layer and the HUD launch, and the honest options were to record the growth or
 * to stop
 * it. This is stopping it: the dev overlays, the dev fixtures and the dev scene toggles are a
 * coherent group that has nothing to do with the seam between real time and simulated time, which
 * is what `GameScene` is actually for.
 *
 * ## 🔴 The DEV guard stays INSIDE each body, exactly as it was
 *
 * Moving these out of the scene must not weaken the guard, because the guard is what keeps the
 * scene KEYS out of `dist/`. Every function below keeps its own `import.meta.env.DEV` test inside
 * the body rather than relying on the caller, so Vite folds each one to an empty function and the
 * string literals `'Playground'`, `'ElementEditor'` and `'Gym'` never reach the bundle.
 *
 * Phase 2 gated the key BINDING alone and left the literals behind; `tools/gen/verify-dist.mjs`
 * fails the build on a quoted scene key precisely because a "DEV ONLY" label in a document is not
 * a build gate. That gate still runs, and it is what proves this move did not regress.
 *
 * `GameScene` keeps thin `protected` wrappers around the toggles and the help line rather than
 * calling these directly, because `ElementEditorScene` overrides two of them.
 */

import type Phaser from 'phaser';
import { devSeam } from '../debug/devSeam';
import { CATALOG_KEY, type AssetCatalog } from '../game/assetCatalog';
import { createFeelTuner } from './devFeelTuner';
import { createPinProbe } from './devPinProbe';
import type { PinProbe } from './devPinProbe';
import { createMotionProbe, type MotionProbe } from './devMotionProbe';
import { spawnDevEnemies, spawnDevFleet } from './devSpawn';
import type { World } from '../sim/types';
import type { AudioSettings } from '../game/audioSettings';

/**
 * DEV-only spawn constants for criteria 5.11 and 5.7 — the two things combat itself cannot produce
 * (see `docs/qa/` for why). Every value here is a fixed constant, never dragged or typed, which is
 * what keeps `N`/`M` a QA fixture instead of a cheat menu.
 *
 * `DEV_FLEET_COUNT` 20: the shipped level places 2 enemies total (1 sentry, 1 scavenger), so 20 is a
 * deliberate 10x stress multiple — comfortably a "worst case" no authored level approaches, while
 * staying small enough to reason about and cheap to eyeball in Playwright.
 */
const DEV_FLEET_COUNT = 20;
const DEV_FLEET_HP = 60;
/**
 * How wide the fleet is spread, in SIM px, centred on the player.
 *
 * 🔴 This replaces `DEV_FLEET_OFFSET_X = 200`, which put the whole fleet **off camera**. The view
 * is 1920 drawn px at `RENDER_SCALE` 6, so the visible half-width is `960 / 6` = **160 sim px** —
 * the old fixture started 40 sim px past the right edge and ran 760 further, and 5.11 measured a
 * frame that drew none of its twenty bodies.
 *
 * 288 is `160 * 2 * 0.9`: the full visible width less a 10 % margin, so every body stays inside the
 * view even as the player drifts a little between the keypress and the sample.
 */
const DEV_FLEET_SPREAD_SIM_PX = 288;
/** 2 of 60: below the 3-swing floor (60 hp / 20 dmg per swing) combat can ever land on. */
const DEV_LOW_HP = 2;
const DEV_LOW_HP_OFFSET_X = 200;

/** The overlays a dev build can attach, both off unless their query flag is present. */
export interface DevOverlays {
  feelTuner?: (sprite: Phaser.GameObjects.Sprite) => void;
  motionProbe?: MotionProbe;
  /** The collision overlay and stall classifier, `?pin=1`. See `devPinProbe.ts`. */
  pinProbe?: PinProbe;
}

/**
 * The two URL-flag overlays: the locomotion tuner (`?tune=1`) and the ghost falsifier (`?probe=1`).
 *
 * Both are off by default so an ordinary dev run is not covered in an overlay, and both are absent
 * from production entirely.
 */
export function attachDevOverlays(scene: Phaser.Scene, world: World): DevOverlays {
  if (!import.meta.env.DEV) {
    return {};
  }
  devSeam('__DEVSEAM_gameDev_attachDevOverlays__');
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const overlays: DevOverlays = {};

  if (params.get('tune') === '1') {
    const catalog = scene.cache.json.get(CATALOG_KEY) as AssetCatalog | undefined;
    const fpsOf = (key: string): number => catalog?.sheets.find((s) => s.key === key)?.fps ?? 24;
    overlays.feelTuner = createFeelTuner(scene, world, {
      runFps: fpsOf('brass-courier-run'),
      walkFps: fpsOf('brass-courier-walk'),
    });
  }
  // Two copies of one FROZEN pose, one moved on whole ticks and one moved every refresh, so the
  // position schedule is the only variable. `devMotionProbe.ts` explains the three outcomes.
  if (params.get('probe') === '1') {
    overlays.motionProbe = createMotionProbe(scene, 'brass-courier-run');
  }
  // Draws every solid and hazard rectangle and names what stopped the player. Built because three
  // fixes shipped against a stuck state nobody had put on screen — `devPinProbe.ts` has the account.
  if (params.get('pin') === '1') {
    overlays.pinProbe = createPinProbe(scene, world);
  }
  return overlays;
}

/**
 * The controls banner.
 *
 * SHIFT is a PRODUCTION control, so it belongs in `base` and not behind the DEV branch. The
 * dev-scene keys are bound only under `import.meta.env.DEV`, so advertising them in a production
 * build offers the player three keys that do nothing — Vite folds this to `base`.
 *
 * Caught by the Phase 5 code-reviewer gate owner (brief 2), which also noticed that `verify-dist`'s
 * scene-key sweep could not see it: the string says "playground" in lowercase, inside a longer
 * literal, and the sweep looks for a quoted `Playground`.
 */
export function helpLine(audio?: AudioSettings, touch = false): string {
  // Phase 7's audio keys are in the SHIPPED half deliberately. A mute control the player cannot
  // discover is a mute control they do not have, and this banner is the only place the game
  // currently tells anyone what the keys are.
  // `ESC levels` is in the shipped half too, and for the identical reason: Phase 8 put the level menu
  // behind a key rather than in front of the game, so this banner is the only thing that says so.
  // 🔴 The spaces INSIDE each key/label pair are non-breaking (U+00A0); the `  ·  ` separators are
  // ordinary. Phaser wraps on word boundaries, and in the narrower band the banner now occupies it
  // broke `[ ]` from `volume` and, at 852 x 480, `G` from `gym` — a key rendered adrift from the
  // thing it does, on the one surface that teaches the controls. Predicted by the accessibility gate
  // owner (brief 2, finding 1) and then MEASURED from `getWrappedText()`, not argued.
  //
  // A non-breaking space is the minimal fix: every key is still printed, every glyph still renders
  // identically in a monospace face, and the only thing that changes is that a segment now wraps as
  // a unit. The DEV suffix below deliberately keeps ordinary spaces — `verify-dist.mjs` sweeps
  // `dist/` for the literal phrases `'p play'`, `'o editor'` and `' gym'`, and rewriting them here
  // would make that sweep unable to match, which is a gate narrowed by a change somewhere else.
  //
  // 🔴 **The volume's VALUE is printed beside its keys — and it is the only readout in play.**
  // Nothing in the game showed it. At the top of the ladder `]` cannot do anything, so a player who
  // tried the key this banner advertises got silence with no way to tell "already at maximum" from
  // "still broken" — which is the reading the owner reported before the dispatch bug was even found.
  // The value is joined with a non-breaking space for the reason the paragraph above gives: a level
  // that wraps away from `volume` is a number adrift from the thing it measures.
  //
  // `audio` is optional so a caller with no manager — `ElementEditorScene`'s own override does not
  // pass one — gets the bare line rather than a `NaN%`.
  const level =
    audio === undefined ? '' : ` ${audio.muted ? 'muted' : `${Math.round(audio.volume * 100)}%`}`;
  // 🔴 A touch player has none of these keys, and a persistent instruction to press ARROWS,
  // SPACE, SHIFT, F, L, M, `[`, `]` and ESC — none of which exist on their device — is worse than
  // no banner at all. Worse still, the two once CONTRADICTED each other: the banner said attack was
  // `F / L` while the attack plate showed the letter `A`.
  //
  // ✅ **And the touch banner does not describe the buttons either — owner decision, 2026-08-30.**
  // The interim version named each plate (*"TAP to move, jump, strike"*), which was the right
  // answer while the plates were unlabelled grey boxes. They are not: the generated faces carry an
  // arrow, a wrench, a gear. A caption explaining an arrow is clutter across the top of a 412 px
  // screen, and it competed with the HUD for the only row either can use. What remains on touch is
  // the state a symbol cannot show — the volume — and nothing else.
  // ⚠️ And it WAS labelled — `VOLUME 100%` rather than a bare `100%`, because a percentage across
  // the top of the screen names no quantity on its own. That reasoning was sound and is kept for
  // the record, but the line it defended is gone.
  //
  // 🔴 **A touch device gets NO banner at all — 2026-09-01, owner decision.** The volume readout
  // was the last thing standing on the touch line, and on a phone the volume is not the game's to
  // report: the player sets it with the hardware keys and the OS draws its own overlay when they
  // do. A row of text across a 412 px screen, duplicating a control the game does not own, is
  // clutter competing with the HUD for the only row either can use.
  //
  // ⚠️ **The return is HERE, ABOVE the DEV suffix, and that placement is the fix.** The suffix is
  // appended to `base` below, so emptying only the touch arm of `base` would have left
  // `·  P play  ·  O editor  ·  G gym` rendering alone on a phone in the dev build. Caught by the
  // Codex plan review, round 1.
  if (touch) return '';
  const base = 'ARROWS / WASD move  ·  SPACE / UP / W jump  ·  ' +
    `SHIFT walk  ·  F / L attack  ·  M mute  ·  [ ] volume${level}  ·  ` +
    'ESC levels';
  // 🔴 **Abbreviated 2026-08-26, and only because it is DEV-only text.** Raising the banner to
  // 44 px bold — the size that makes it WCAG large text and so lets the 3:1 bar apply — pushed the
  // long DEV form onto a THIRD wrapped row, which `hud-layout.test.ts` caps against for eating the
  // play area. Measured: at 44 px the shipped line is 2 rows and the old DEV line was 3; no size is
  // both large text (≥42 px) and two DEV rows (≤41 px). Shortening the dev suffix removes the
  // conflict instead of trading the shipped banner against it, and costs nothing a player sees.
  return import.meta.env.DEV
    ? (devSeam('__DEVSEAM_gameDev_helpLineSuffix__'), `${base}  ·  P play  ·  O editor  ·  G gym`)
    : base;
}

/**
 * Start a dev-only scene.
 *
 * **The guard is inside this body, and that is the whole point.** Phase 2 gated the key binding
 * alone and recorded the leftover string as accepted residue — a dead method naming a scene not
 * registered in production. It is unreachable, but "unreachable dead code referencing a dev scene"
 * is exactly what a Phase 10 bundle audit has to argue about, and the argument costs more than the
 * guard.
 *
 * **Verified precisely:** no `ElementEditor` or `Playground` scene KEY survives a production build —
 * the string literals are gone, along with both scene classes and every editor UI string. What does
 * remain is the method NAMES on `GameScene`, as empty bodies, which Rollup cannot drop from a class
 * that ships. A grep for the bare identifier therefore still returns 1 each; an earlier comment
 * claimed otherwise and the code-reviewer gate owner measured it and was right. `verify-dist.mjs`
 * asserts the correct thing — quoted scene keys — so the build gate cannot cry wolf over a name.
 */
export function startDevScene(
  scene: Phaser.Scene,
  key: 'Playground' | 'ElementEditor' | 'Gym',
  /**
   * 🔴 Phase 8. `PlaygroundScene` and `ElementEditorScene` both `extends GameScene`, so they now go
   * through `pickLevel` too — which resumes whatever the SAVE says. That would make both dev tools
   * open whichever level was last played, and `tests/e2e/phase-03-element-editor.spec.ts` asserts
   * against level-01's collision strips specifically. Passing the first catalogued level makes the dev
   * tools deterministic regardless of the save; `GymScene` ignores it, having no level at all.
   */
  levelId?: string,
): void {
  if (import.meta.env.DEV) {
    devSeam('__DEVSEAM_gameDev_startDevScene__');
    scene.scene.start(key, { levelId });
  }
}

/** DEV ONLY (5.11 fixture). Guard repeated inside the body — see `startDevScene`. */
export function spawnFleetFixture(world: World): void {
  if (import.meta.env.DEV) {
    devSeam('__DEVSEAM_gameDev_spawnFleetKeyN__');
    spawnDevFleet(world, {
      count: DEV_FLEET_COUNT,
      hp: DEV_FLEET_HP,
      x: world.player.x,
      y: world.player.y,
      spreadSimPx: DEV_FLEET_SPREAD_SIM_PX,
    });
  }
}

/** DEV ONLY (5.7 fixture). Guard repeated inside the body — see `startDevScene`. */
export function spawnLowHpFixture(world: World): void {
  if (import.meta.env.DEV) {
    devSeam('__DEVSEAM_gameDev_spawnLowHpKeyK__');
    spawnDevEnemies(world, {
      count: 1,
      hp: DEV_LOW_HP,
      x: world.player.x + DEV_LOW_HP_OFFSET_X,
      y: world.player.y,
    });
  }
}
