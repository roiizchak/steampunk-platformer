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
 * a draw decision, the five hit areas would stay live *underneath* this overlay on a running,
 * input-enabled game, and a tap meant for "turn your phone" would move the player instead. Both
 * files call `touchTargetsFit`; neither carries its own copy of the rule.
 *
 * No Phaser import, for the reason `touchControlsLayer.ts`'s header gives.
 */

import { GAME_WIDTH } from '../game/constants';
import { cssScaleFor, touchLayout, touchTargetsFit } from '../render/touchLayout';
import type { TouchFaceLike, TouchSceneLike } from './touchControlsLayer';

/** Above the controls (2000/2001) — this covers them, and covering them is the point. */
export const ROTATE_PROMPT_DEPTH = 3000;

const SCRIM_COLOR = 0x12100e;
const SCRIM_ALPHA = 0.94;
const HEADLINE = 'ROTATE YOUR DEVICE';
const SUBLINE = 'the controls need a landscape screen';

export class RotatePrompt {
  private faces: TouchFaceLike[] = [];
  private isShowing = false;

  constructor(
    private readonly scene: TouchSceneLike,
    private readonly isTouchDevice: boolean,
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
        .text(width / 2, height / 2 - 48, HEADLINE, {
          fontFamily: 'monospace',
          fontSize: '72px',
          color: '#f7e3b8',
        })
        .setOrigin(0.5, 0.5)
        .setDepth(ROTATE_PROMPT_DEPTH),
      this.scene.add
        .text(width / 2, height / 2 + 56, SUBLINE, {
          fontFamily: 'monospace',
          fontSize: '40px',
          color: '#b9a07a',
        })
        .setOrigin(0.5, 0.5)
        .setDepth(ROTATE_PROMPT_DEPTH),
    );
    for (const face of this.faces) face.setVisible(false);
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
    const fits = touchTargetsFit(
      touchLayout(width, height),
      cssScaleFor(this.scene.scale.displaySize.width, width || GAME_WIDTH),
    );
    if (fits === !this.isShowing) return;
    this.isShowing = !fits;
    for (const face of this.faces) face.setVisible(this.isShowing);
  }

  destroy(): void {
    for (const face of this.faces) face.destroy();
    this.faces = [];
    this.isShowing = false;
  }
}
