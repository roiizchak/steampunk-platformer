/**
 * The controls banner as an object that owns itself, beside the gear counter.
 *
 * ## The defect
 *
 * The banner was drawn by a fire-and-forget `addHelpBanner(scene, text)` that returned `void` and
 * threw the `Text` away. It sat at a fixed `(HUD_MARGIN, HELP_BANNER_Y)` in raw design pixels,
 * wrapped to the full view width — a strip of 44 px bold text spanning the whole screen **below**
 * the HUD plate and across the play area. The owner played the production build and reported it.
 *
 * Two things followed from the object being discarded, and both are why this file is a class:
 *
 * - **Nothing could assert the banner existed.** Codex plan review round 1, finding 3: deleting the
 *   draw call outright left the entire suite green.
 * - **It did not survive a resize.** `UIScene` re-lays-out the whole plate through `hudLayout()` on
 *   `resize`, and `phase-06-chrome.spec.ts` drives exactly that path — while the banner stayed at
 *   its raw coordinates and its raw font size, drifting further out of the assembly at every size.
 *
 * ## Why a layer of its own and not a field on `UIScene`
 *
 * That was the round-1 design, and Codex round 2 killed it with three findings that all turned out
 * to be true when checked locally:
 *
 * 1. `attachHud()` returns **before** `UIScene.create()` has run, so a setter called on the way out
 *    of it has nothing to set;
 * 2. `UIScene.update()` hardcodes `this.scene.get('Game')` and **stops itself** when that scene goes
 *    away — so the Playground and Element Editor legends would have died on transition;
 * 3. `UIScene.ts` imports Phaser as a **value**, which is why `enemy-feedback.test.ts` records it as
 *    *"still gated as source text"*. Anything put there cannot have the stronger behavioural gate,
 *    and `npm run test:sim-isolated` runs the unit suite with the engine uninstalled.
 *
 * This file imports Phaser as a **type only**. That is what buys `help-banner-layer.test.ts` a fake
 * scene it can drive end to end, and it keeps the isolated run green.
 *
 * ## 🔴 Why layout is deferred to an update rather than ordered against the resize
 *
 * Two separate hazards, one mechanism.
 *
 * The counter does not exist when this layer is built — `attachHud()` launches `UIScene` in
 * parallel and returns immediately — so there is no width to measure yet.
 *
 * And on a resize, **this layer's handler runs BEFORE `UIScene`'s**: `GameScene.create()` builds
 * this layer, and `UIScene.create()` registers its own `resize` listener afterwards, so the
 * emitter calls them in that order. Reading the counter during the resize would therefore read the
 * *previous* size's position and width, every time.
 *
 * Codex round 2 finding 9 asked for a pinned order — position, then `setFontSize()`, then read
 * `Text.width`, because Phaser's setter synchronously rewrites the width. Deferring removes the
 * ordering question instead of pinning it: `resize` only marks the layer dirty, and the actual
 * layout happens on the next `update`, which by definition runs after every listener for that
 * frame's resize. The cost is one boolean test per frame.
 */

import type Phaser from 'phaser';

import { COUNTER_FILL, COUNTER_STROKE } from '../render/hud';
import type { HudLayout } from '../render/hud';
import {
  HELP_FONT_PX,
  HELP_FONT_STYLE,
  HELP_STROKE_PX,
  helpBannerLayout,
} from '../render/helpBanner';
import { SCENE_SHUTDOWN, SCENE_UPDATE } from './engineLiterals';

/**
 * What the layer needs from the HUD, as the narrowest shape that expresses it.
 *
 * `UIScene` satisfies this structurally. Typed as a shape rather than as `UIScene` on purpose: a
 * nominal type would drag `UIScene`'s value import of Phaser into this module's graph and undo the
 * whole reason the file is type-only.
 */
export interface HudCounterSource {
  hudObjects(): { counter: Phaser.GameObjects.Text; layout: HudLayout };
}

export class HelpBannerLayer {
  private banner: Phaser.GameObjects.Text | null = null;

  /** Does the banner need laying out on the next update? True until the first one lands. */
  private dirty = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hud: HudCounterSource,
    private readonly content: string,
  ) {}

  /**
   * Draw the banner and start listening.
   *
   * Position is deliberately left at `(0, 0)`: the first `update` moves it, and there is nothing
   * useful to put here that would not be a second, worse copy of `helpBannerLayout()`.
   */
  create(): void {
    this.banner = this.scene.add
      .text(0, 0, this.content, {
        fontFamily: 'monospace',
        fontSize: `${HELP_FONT_PX}px`,
        fontStyle: HELP_FONT_STYLE,
        // The counter's own ink PAIR, not half of it. `helpBanner.ts` carries the contrast sweep
        // that rejected a stroke under the old mid-luminance fill.
        color: COUNTER_FILL,
        stroke: COUNTER_STROKE,
        strokeThickness: HELP_STROKE_PX,
        // Replaced on the first layout with the measured band. A non-zero starting width keeps the
        // initial `getWrappedText()` meaningful if anything reads it before then.
        wordWrap: { width: 1 },
      })
      .setScrollFactor(0);

    this.scene.events.on(SCENE_UPDATE, this.onUpdate, this);
    this.scene.scale.on('resize', this.markDirty, this);
    this.scene.events.once(SCENE_SHUTDOWN, this.destroy, this);
  }

  /** The drawn object, for the e2e spec. `null` before `create()`, and after `destroy()`. */
  object(): Phaser.GameObjects.Text | null {
    return this.banner;
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private onUpdate(): void {
    if (!this.dirty) return;
    this.layout();
  }

  /**
   * Place the banner beside the counter, at the counter's CURRENT measured width.
   *
   * ⚠️ Silently a no-op while the counter has not been built — `attachHud()` launches `UIScene` in
   * parallel, and on a scene restart the first update can land in the gap. `dirty` stays true, so
   * this simply tries again next frame rather than positioning against `undefined`.
   *
   * The line count is **measured, never declared**. Four different strings reach this class — the
   * shipped legend, the DEV legend with three extra keys, and the Playground and Element Editor
   * legends — and the owner's decision this session was to keep every key printed at whatever row
   * count that takes. `getWrappedText()` is asked after the wrap width and font size are applied,
   * because that is the only point at which its answer is about the band the banner will occupy.
   */
  private layout(): void {
    const banner = this.banner;
    if (banner === null) return;

    const { counter, layout } = this.hud.hudObjects();
    if (!counter || !layout) return;

    const { width } = this.scene.scale.gameSize;
    const counterRight = counter.x + counter.width;

    // First pass: everything that does not depend on how many rows the text becomes. The wrap width
    // and the font size are what DECIDE the row count, so they must be applied before it is read.
    const first = helpBannerLayout(counterRight, width, layout.scale, 1);
    banner.setFontSize(first.fontPx);
    banner.setWordWrapWidth(first.wrapPx);

    // Second pass: re-centre on the rows the browser actually produced.
    const lines = Math.max(1, banner.getWrappedText().length);
    const final = helpBannerLayout(counterRight, width, layout.scale, lines);
    banner.setPosition(final.x, final.y);

    this.dirty = false;
  }

  /** Drop the listeners with the scene, or a restarted scene accumulates a set per entry. */
  destroy(): void {
    this.scene.events.off(SCENE_UPDATE, this.onUpdate, this);
    this.scene.scale.off('resize', this.markDirty, this);
    this.banner?.destroy();
    this.banner = null;
  }
}
