/**
 * **Ask for fullscreen on the player's first tap, because the browser's chrome is what blocks play.**
 *
 * 🔴 This exists because of a measurement, not a preference. The owner's phone reports a landscape
 * viewport of **798 x 283** CSS px — Brave keeps its address bar, and that bar eats roughly a
 * quarter of the screen's short side. 798 / 283 is 2.82:1, wider than the 16:9 design surface, so
 * under `Scale.FIT` the height is the binding constraint and the canvas lands at **503 px wide**.
 * That is a CSS scale of 0.262, at which a `TOUCH_BOX_PX` control draws at **41.9 CSS px** against
 * the 44 px floor in `touchLayout.ts`. Two pixels short, so `rotatePromptWanted` returns true and
 * the rotate overlay stays up **in landscape** — correctly, and to the owner it looked for four
 * sessions like a rotation that was never detected.
 *
 * Fullscreen removes the chrome rather than shrinking the game around it: the same device reports
 * roughly 798 x 360 with the bars gone, a canvas of 640, a scale of 0.333 and controls at
 * **53.3 CSS px** — comfortably over the floor, with the play area untouched. The alternative was
 * growing every control by 10 % on every device to buy 2.1 px, which would still fail on a browser
 * leaving 260 px. The owner chose this one on 2026-09-01.
 *
 * ## Why a DOM listener on the wrapper and not a Phaser input handler
 *
 * The tap that matters most is the one on the **rotate overlay** — a `<div>` above the canvas,
 * which Phaser's input never sees. That is precisely the moment the player is stuck and the only
 * gesture they are offered. Listening on `#game` catches the overlay, the title screen and the play
 * canvas with one subscription and no scene coupling.
 *
 * `pointerup`, never `pointerdown`: a fullscreen request originating from `pointerdown` is refused
 * as an untrusted gesture on touch devices. `C:\Claude\Street-Fighter`'s `FlowScene.ts:386-388`
 * records the same finding.
 *
 * ## And it is deliberately silent, and deliberately not once-only
 *
 * iOS Safari has no fullscreen for an arbitrary element and Phaser answers `FULLSCREEN_UNSUPPORTED`;
 * Android may refuse a request it judges untrusted. Neither is a reason to interrupt someone who
 * just wanted to play, and the letterboxed layout is correct either way — fullscreen only makes it
 * bigger. So a refusal leaves the listener attached and the next tap asks again, which is what
 * turns "the player swiped out of fullscreen" from a dead end into one more tap.
 */

/** The slice of `ScaleManager` this needs. A type only, so the unit suite can drive it with a fake. */
export interface FullscreenTarget {
  readonly isFullscreen: boolean;
  startFullscreen(): unknown;
}

/**
 * Watch `element` for taps and ask for fullscreen while the game is not already in it.
 *
 * Returns the teardown, so a test can detach and production can ignore it — the wrapper outlives
 * the page.
 */
export function installFullscreenOnTap(
  element: {
    addEventListener(type: string, fn: () => void): void;
    removeEventListener(type: string, fn: () => void): void;
  } | null,
  scale: FullscreenTarget,
): () => void {
  if (element === null) return () => {};
  const onTap = (): void => {
    if (scale.isFullscreen) return;
    try {
      scale.startFullscreen();
    } catch {
      // Refused or unsupported: play letterboxed. The next tap will ask again.
    }
  };
  element.addEventListener('pointerup', onTap);
  return () => element.removeEventListener('pointerup', onTap);
}
