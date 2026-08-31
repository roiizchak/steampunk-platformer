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
 * ## It shares a predicate with the controls, rather than agreeing with them
 *
 * 🔴 `!touchTargetsFit` is part of the controls' DISABLE predicate too, not only their draw
 * predicate — `touchControlsLayer.refresh()` and `touch-draw-path.test.ts`'s M8 case. Were it only
 * a draw decision, the six hit areas would stay live *underneath* this overlay on a running,
 * input-enabled game, and a tap meant for "turn your phone" would move the player instead. Both
 * files call `touchTargetsFit`; neither carries its own copy of the rule.
 *
 * ## 🔴 The copy is sized in CSS pixels, not in game pixels
 *
 * The accessibility gate measured the first version and it failed on its own terms. The headline
 * was `72px` and the subline `40px` — **game** pixels, on a backing store `Scale.FIT` holds at
 * 1920 wide however small the canvas gets. This prompt appears **only** below a CSS scale of
 * 0.275, so those render at **14.6** and **8.1 CSS px** at iPhone 14 portrait: the one message
 * whose entire job is to be read, drawn at half the 16 px floor the same guidelines set for body
 * text, on the one screen where the player has nothing else to go on.
 *
 * Everything else in this phase is sized in game pixels because it is measured against a floor
 * that game pixels clear. This is the case that inverts — the copy has to be a fixed size on the
 * *glass*, so its game-pixel size is `cssPx / scale` and moves every time the view does. That is
 * why `refresh()` re-sizes rather than only re-showing.
 *
 * No Phaser import, for the reason `touchControlsLayer.ts`'s header gives.
 */


import { cssScaleFor, type HitBox, rotatePromptWanted } from '../render/touchLayout';
import type { TouchFaceLike, TouchSceneLike } from './touchControlsLayer';

/** Above the controls (2000/2001) — this covers them, and covering them is the point. */
export const ROTATE_PROMPT_DEPTH = 3000;

const SCRIM_COLOR = 0x12100e;
const SCRIM_ALPHA = 0.94;
/** Read off the glass, not off the backing store. 28 and 18 CSS px, both over the 16 px floor. */
const HEADLINE_CSS_PX = 28;
const SUBLINE_CSS_PX = 18;

/** Where the two lines sit either side of centre, in game px. Named so `create` and `place` agree. */
const HEADLINE_OFFSET_PX = 48;
const SUBLINE_OFFSET_PX = 56;
const HEADLINE = 'ROTATE YOUR DEVICE';
const SUBLINE = 'the controls need a landscape screen';

/**
 * The share of the design width the copy may occupy before it wraps.
 *
 * 🔴 **The subline was CUT OFF at both ends on a real phone**, and the arithmetic says it always
 * was. `SUBLINE` is 36 monospace characters; monospace advance is about 0.6 em; and the font size
 * is `SUBLINE_CSS_PX / scale`, which at iPhone 14 portrait (scale 0.203) is 89 game px. That is
 * `36 x 89 x 0.6 = 1922` px on a 1920 px design surface — over by two pixels on the widest phone in
 * scope, and worse on every narrower one. Nothing in the suite could see it: no gate measures a
 * text object's rendered width, and the font size that produces it exists only at a CSS scale the
 * headless harness never runs at. Found by the owner on the device, 2026-08-31.
 *
 * Wrapping rather than shrinking, because the whole point of sizing this copy in CSS pixels is that
 * it stays over the 16 px legibility floor — shrinking it to fit would trade the bug for the defect
 * the file's own header is about.
 */
const COPY_WIDTH_FRAC = 0.86;

export class RotatePrompt {
  private faces: TouchFaceLike[] = [];
  /** The scrim, held separately because it is the one face that re-sizes. */
  private scrim?: TouchFaceLike;
  /** The design size the objects are currently laid out for. See `place()`. */
  private placedW = 0;
  private placedH = 0;
  /** Held separately from `faces` because only these two are re-sized against the CSS scale. */
  private headline?: TouchFaceLike;
  private subline?: TouchFaceLike;
  private isShowing = false;
  /** The CSS scale the copy is currently sized for. See `refresh()`. */
  private sizedFor = 0;

  constructor(
    private readonly scene: TouchSceneLike,
    private readonly isTouchDevice: boolean,
    /**
     * The targets THIS screen carries, if it carries any of its own.
     *
     * 🔴 Empty means "the play controls only", which is what `UIScene` wants. A screen with its own
     * tap route passes that route's targets, so the prompt and the route ask `rotatePromptWanted`
     * the identical question — the Codex round-3 finding: without this the level menu's rows going
     * under-floor (a sixth catalog level does it) killed the route with no prompt to explain it.
     */
    private readonly targets: readonly HitBox[] = [],
  ) {}

  get showing(): boolean {
    return this.isShowing;
  }

  /**
   * Build the overlay, hidden.
   *
   * Nothing at all on a device with no touch: a desktop window narrow enough to trip the scale
   * threshold has a keyboard, and telling a keyboard player to rotate their monitor is worse than
   * saying nothing.
   */
  create(): void {
    if (!this.isTouchDevice) return;
    const { width, height } = this.scene.scale.gameSize;

    this.faces.push(
      this.scene.add
        .rectangle(0, 0, width, height, SCRIM_COLOR, SCRIM_ALPHA)
        .setOrigin(0, 0)
        .setDepth(ROTATE_PROMPT_DEPTH),
      this.scene.add
        .text(width / 2, height / 2 - HEADLINE_OFFSET_PX, HEADLINE, {
          fontFamily: 'monospace',
          fontSize: '72px',
          color: '#f7e3b8',
        })
        .setOrigin(0.5, 0.5)
        .setDepth(ROTATE_PROMPT_DEPTH),
      this.scene.add
        .text(width / 2, height / 2 + SUBLINE_OFFSET_PX, SUBLINE, {
          fontFamily: 'monospace',
          fontSize: '40px',
          color: '#b9a07a',
        })
        .setOrigin(0.5, 0.5)
        .setDepth(ROTATE_PROMPT_DEPTH),
    );
    this.headline = this.faces[1];
    this.subline = this.faces[2];
    this.scrim = this.faces[0];
    for (const face of this.faces) face.setVisible(false);
  }

  /**
   * Re-place every object against the live design size.
   *
   * 🔴 `refresh()` used to re-size only the FONTS, while a unit case called *"re-places itself when
   * the design size changes"* proved nothing: it built a SECOND prompt at the new size, so it
   * exercised `create()` and left the first prompt's stale scrim in the array it searched. The
   * Codex round-4 review found both halves — the missing behaviour and the gate that could not see
   * it. Under `Phaser.Scale.FIT` the design size does not move today; the claim is made true rather
   * than withdrawn, because the file makes it.
   */
  private place(width: number, height: number): void {
    // ⚠️ Only when it actually moved. `UIScene.update()` polls `refresh()` EVERY FRAME, and
    // `Rectangle.setSize` rebuilds geometry, path data and display origin on every call
    // (`node_modules/phaser/src/gameobjects/shape/rectangle/Rectangle.js:133`) — so an unconditional
    // `place()` ships continuous work on every touch device, at 60 Hz, while the prompt is hidden.
    // 12.11 cannot measure that cost, which is the reason not to create it. Codex round 5.
    if (width === this.placedW && height === this.placedH) return;
    this.placedW = width;
    this.placedH = height;
    this.scrim?.setSize?.(width, height);
    this.scrim?.setPosition(0, 0);
    this.headline?.setPosition(width / 2, height / 2 - HEADLINE_OFFSET_PX);
    this.subline?.setPosition(width / 2, height / 2 + SUBLINE_OFFSET_PX);
    for (const line of [this.headline, this.subline]) {
      line?.setWordWrapWidth?.(width * COPY_WIDTH_FRAC);
      line?.setAlign?.('center');
    }
  }

  /**
   * Re-evaluate against the live view.
   *
   * Polled from `UIScene.update()` beside the controls' own refresh, so a rotation clears the
   * prompt without a reload and going back to portrait brings it straight back — and so the prompt
   * and the controls can never disagree about which side of the threshold this frame is on.
   */
  refresh(): void {
    if (this.faces.length === 0) return;
    const { width, height } = this.scene.scale.gameSize;
    // No `|| GAME_WIDTH` fallback: `touchLayout` above already refuses a non-positive width, so
    // the guard defended a line that can never be reached with a bad value. Guard the whole
    // body instead, which is what the polling caller actually needs.
    if (!(width > 0 && height > 0)) return;
    const scale = cssScaleFor(this.scene.scale.displaySize.width, width);
    // ONE definition, shared with `touchRoutes.ts`. See `rotatePromptWanted`.
    const fits = !rotatePromptWanted(width, height, this.scene.scale.displaySize.width, this.targets);

    this.place(width, height);

    // Re-sized on every refresh, not only on a show: the prompt can be up while the browser
    // chrome collapses and the canvas grows under it, and 8 CSS px of subline is the defect
    // this exists to prevent.
    //
    // ⚠️ **Only when the scale is positive.** `cssScaleFor` returns 0 for a collapsed or
    // unmeasured canvas — deliberately, and the guard above lets that through because a zero CSS
    // width still has a valid design size. `Math.round(28 / 0)` is `Infinity`, which is what would
    // then reach Phaser's text renderer. Keep the last finite size instead; the prompt's VISIBILITY
    // is decided above and is unaffected. Codex round 4.
    // ⚠️ **Only when it actually changed**, for the reason `place()` gives one screen up: this is
    // polled every frame now, on every scene that carries a prompt, and `Text.setFontSize` re-styles
    // and re-renders the text texture on every call.
    if (scale > 0 && scale !== this.sizedFor) {
      this.sizedFor = scale;
      this.headline?.setFontSize?.(Math.round(HEADLINE_CSS_PX / scale));
      this.subline?.setFontSize?.(Math.round(SUBLINE_CSS_PX / scale));
    }

    if (fits === !this.isShowing) return;
    this.isShowing = !fits;
    for (const face of this.faces) face.setVisible(this.isShowing);
  }

  destroy(): void {
    for (const face of this.faces) face.destroy();
    this.faces = [];
    this.sizedFor = 0;
    this.headline = undefined;
    this.subline = undefined;
    this.isShowing = false;
  }
}
