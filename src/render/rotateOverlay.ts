/**
 * **Is this viewport one the controls cannot be made to fit?** — decided from the RAW viewport.
 *
 * 🔴 **This exists because the decision used to be read from `Phaser.ScaleManager.displaySize`, and
 * on a real phone that value is stale exactly when it matters.** The owner turned the device to
 * landscape twice, on two different builds, and the prompt stayed up both times. Every consumer —
 * the prompt, `touchControlsLayer` and `touchRoutes` — read the same cached number, so one stale
 * value froze all three. Polling it per frame did not help: a cache re-read is still a cache.
 *
 * `window.innerWidth` / `innerHeight` cannot be stale. They are what the sibling project at
 * `C:\Claude\Street-Fighter` reads (`src/render/touch.ts`, `shouldBlockForOrientation`), and its
 * rotate gate works on this class of device — which is why the owner pointed at it.
 *
 * ## What is computed here, and what is not
 *
 * ⚠️ **Deliberately still reasoning from FIT, and that is a decision rather than an oversight.**
 * The view fills the screen (2026-09-01), so `touchControlsLayer` lays out against the LIVE view
 * while this predicate evaluates the DESIGN one. With the height clamped at 1080 the two differ
 * only in horizontal separation, and MORE separation can never turn a passing fit-verdict into a
 * failing one — so the overlay stays strictly conservative, which is the safe direction. Recorded
 * because `touchLayout.ts:5-9` warns about consumers reading different numbers.
 *
 * `Phaser.Scale.FIT` letterboxes the fixed design surface into the viewport, so the canvas CSS width
 * is `min(viewportWidth, viewportHeight * aspect)` — the same arithmetic the engine does, from
 * numbers that are always current. That feeds the ONE predicate the routes and the controls also
 * ask, so nothing here decides anything new; it only supplies a live input to a settled question.
 *
 * Pure, engine-free and DOM-free: it takes numbers. Applying the answer to the page is
 * `rotatePrompt.ts`'s job, and wiring the events that ask is `rotateGuard.ts`'s.
 */

import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { type HitBox, rotatePromptWanted } from './touchLayout';

/**
 * The CSS width `Scale.FIT` will give the canvas in this viewport.
 *
 * `autoRound: true` in the game config floors the display size, so this floors too — a half pixel
 * either way cannot change the answer, but agreeing with the engine costs nothing.
 */
export function fitCanvasCssWidth(
  viewportWidth: number,
  viewportHeight: number,
  designWidth: number = GAME_WIDTH,
  designHeight: number = GAME_HEIGHT,
): number {
  if (!(viewportWidth > 0 && viewportHeight > 0)) return 0;
  if (!(designWidth > 0 && designHeight > 0)) return 0;
  return Math.floor(Math.min(viewportWidth, (viewportHeight * designWidth) / designHeight));
}

/**
 * Whether the rotate overlay belongs on screen for this viewport.
 *
 * `targets` is the tap route the current screen carries, empty for "the play controls only" — the
 * same argument `rotatePromptWanted` has always taken, so the overlay and the routes cannot
 * disagree about which side of the threshold a frame is on.
 */
export function rotateOverlayWanted(
  viewportWidth: number,
  viewportHeight: number,
  isTouchDevice: boolean,
  targets: readonly HitBox[] = [],
): boolean {
  // Never on a device with no touch: a narrow desktop window has a keyboard, and telling a keyboard
  // player to rotate their monitor is worse than saying nothing.
  if (!isTouchDevice) return false;
  const cssWidth = fitCanvasCssWidth(viewportWidth, viewportHeight);
  if (cssWidth <= 0) return false;
  return rotatePromptWanted(GAME_WIDTH, GAME_HEIGHT, cssWidth, targets);
}
