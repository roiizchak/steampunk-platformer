/**
 * **"Turn your phone."** The one viewport in scope that cannot be made playable.
 *
 * `Phaser.Scale.FIT` holds the backing store at 1920x1080 at every viewport and DPR — only the CSS
 * size changes (`docs/ENGINE-NOTES.md:305-331`, measured). A control's real size is therefore
 * `gamePx * canvasCssWidth / 1920`, and on a phone held upright:
 *
 * | viewport | canvas CSS | scale | a 160 px button is |
 * |---|---|---|---|
 * | iPhone 14 portrait 390x844 | 390x219 | 0.203 | **32.5 CSS px** |
 * | Pixel 7 portrait 412x892 | 412x232 | 0.215 | 34.3 CSS px |
 *
 * against the 44 px floor cited from `ui-ux-pro-max`'s `ux-guidelines.csv`. No button size fixes
 * it: the canvas is 219 px tall, so a thumb-sized control would eat a third of the visible game.
 * Landscape phone, landscape tablet and **portrait tablet** (0.400) all clear the floor; only phone
 * portrait does not, and it gets this instead.
 *
 * ## 🔴 This draws NOTHING. It toggles a class, and the overlay is in `index.html`.
 *
 * It used to be a Phaser scrim and two `Text` objects, and that shape produced two device defects
 * the owner had to find by hand, twice:
 *
 * - **the copy was sized in CSS pixels and positioned in GAME pixels.** Those units do not move
 *   together. At phone portrait the subline renders at `18 / 0.203 = 89` game px while its offset
 *   from centre stays at 56, so 36 monospace characters ran off both edges *and* collided with the
 *   headline 48 px above. A word-wrap repair fixed the clipping and made the collision worse.
 * - **the decision was read from `ScaleManager.displaySize`, which is stale after a rotation.**
 *   Turning the device left the prompt up. Polling per frame did not help, because re-reading a
 *   cache more often does not make it current.
 *
 * A browser needs to be told none of this. `flex`, `gap`, `padding` and a `max-width` lay two lines
 * of real CSS text out at every viewport, and the decision now comes from `window.innerWidth` /
 * `innerHeight`, which cannot be stale. The sibling project at `C:\Claude\Street-Fighter` has always
 * done it this way and its rotate gate works on the owner's device — the owner said so, and that is
 * the evidence this rewrite rests on.
 *
 * ## It still shares a predicate with the controls, rather than agreeing with them
 *
 * 🔴 `!touchTargetsFit` is part of the controls' DISABLE predicate too, not only their draw
 * predicate — `touchControlsLayer.refresh()` and `touch-draw-path.test.ts`'s M8 case. Were it only
 * a draw decision, the six hit areas would stay live *underneath* this overlay on a running,
 * input-enabled game, and a tap meant for "turn your phone" would move the player instead. A DOM
 * overlay does NOT stop Phaser seeing the tap — Street-Fighter's `main.ts` documents that trap and
 * disables `game.input` for it — so that shared predicate is load-bearing, not decorative.
 */

import type { HitBox } from '../render/touchLayout';
import { rotateOverlayWanted } from '../render/rotateOverlay';

/** The class `index.html`'s `html.rotate #rotate { display: flex }` rule keys off. */
export const ROTATE_CLASS = 'rotate';

/**
 * The page, and the viewport it reports — injected so the decision is testable without a DOM.
 *
 * The unit suite runs `environment: 'node'`, so there is no `document` and no `window`. That is not
 * a reason to leave this untested: the host is two reads and one toggle, and a fake supplies them.
 */
export interface RotateHost {
  innerWidth: number;
  innerHeight: number;
  /**
   * Whether the overlay is on screen RIGHT NOW, read from the page rather than remembered.
   *
   * 🔴 **This is the difference between working and not.** There is one overlay and one class, and
   * more than one `RotatePrompt` alive at a time: `TitleScene` and `LevelSelectScene` attach their
   * own, `UIScene` builds another. Each used to cache `isShowing` and write only on a change — so
   * when the title screen shut down and its prompt cleared the class, `UIScene`'s prompt still
   * believed the overlay was up and never re-asserted it. The overlay vanished on a portrait phone
   * the moment play started, which is exactly what the e2e reproduction caught.
   *
   * Comparing against the PAGE instead of against a private flag makes every instance idempotent
   * and self-healing: whichever one refreshes next puts the class back within a frame.
   */
  isShown(): boolean;
  setShown(shown: boolean): void;
}

/** The real page. Returns `null` where there is no DOM, which is every unit test. */
export function browserHost(): RotateHost | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  return {
    get innerWidth() {
      return window.innerWidth;
    },
    get innerHeight() {
      return window.innerHeight;
    },
    isShown() {
      return document.documentElement.classList.contains(ROTATE_CLASS);
    },
    setShown(shown: boolean) {
      document.documentElement.classList.toggle(ROTATE_CLASS, shown);
    },
  };
}

export class RotatePrompt {
  /** What THIS instance last decided. The page is the authority on what is drawn; see `RotateHost`. */
  private isShowing = false;

  constructor(
    private readonly isTouchDevice: boolean,
    /**
     * The targets THIS screen carries, if it carries any of its own.
     *
     * 🔴 Empty means "the play controls only", which is what `UIScene` wants. A screen with its own
     * tap route passes that route's targets, so the prompt and the route ask the identical
     * question — the Codex round-3 finding: without this the level menu's rows going under-floor
     * (a sixth catalog level does it) killed the route with no prompt to explain it.
     */
    private readonly targets: readonly HitBox[] = [],
    private readonly host: RotateHost | null = browserHost(),
  ) {}

  get showing(): boolean {
    return this.isShowing;
  }

  /**
   * Re-evaluate against the LIVE viewport.
   *
   * Cheap enough to call on every frame and on every DOM event that might mean a rotation: two
   * property reads, some arithmetic, and a `classList.toggle` only when the answer changed.
   */
  refresh(): void {
    if (this.host === null) return;
    const wanted = rotateOverlayWanted(
      this.host.innerWidth,
      this.host.innerHeight,
      this.isTouchDevice,
      this.targets,
    );
    this.isShowing = wanted;
    if (wanted === this.host.isShown()) return;
    this.host.setShown(wanted);
  }

  /** Leave the page as it was found. A scene that ends while the overlay is up must not strand it. */
  destroy(): void {
    if (this.isShowing) this.host?.setShown(false);
    this.isShowing = false;
  }
}
