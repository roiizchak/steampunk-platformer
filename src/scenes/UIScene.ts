/**
 * The HUD, in a scene of its own, running in parallel with `GameScene`.
 *
 * ## Why a parallel scene and not a second camera
 *
 * Vault 6.1: **a zero scroll factor pins an object against camera PAN but not against camera ZOOM.**
 * The stated remedy is a second, non-zooming camera with *reciprocal and exhaustive ignore lists* —
 * every world object ignored by the HUD camera and every HUD object ignored by the world camera,
 * because an object missing from both lists renders twice and one in both renders never.
 *
 * A parallel scene removes the hazard rather than managing it. It has its own display list and its
 * own camera, so no object can be in the wrong one: there is nothing to ignore, and therefore no
 * list to get wrong as the HUD grows. The zoom independence falls out for free — `GameScene`'s
 * camera zoom is a property of `GameScene`'s camera.
 *
 * That is a deviation from the vault item as written, and it is recorded as one rather than
 * silently substituted.
 *
 * ## Vault 6.2, and why nothing here is a literal
 *
 * **A second camera created at an explicit size never auto-resizes** — Phaser only resizes cameras
 * whose dimensions equal the previous game size, so one hardcoded at 1280 cropped a whole HUD plate
 * off a phone. This scene never sets a camera size at all: it reads `this.scale.gameSize` and hands
 * it to `hudLayout`, and re-lays-out on `resize`. The current scale mode is `FIT`, so that event
 * does not fire in production today — which is exactly why the code must not depend on it not
 * firing.
 *
 * ## Vault 6.3 — depth
 *
 * A container's OWN depth is what sorts it against the scene; its children's depths are only
 * relative to each other. There is no container here for that reason: the HUD is four flat objects
 * with explicit depths on a display list nothing else shares.
 *
 * ## Vault 6.5 — visibility is not interactivity
 *
 * Nothing in this HUD is interactive. If anything here ever becomes clickable, hiding it must also
 * `disableInteractive()` it: invisible objects keep their scene-level listeners, and Phaser's touch
 * manager forwards any touch whose target is not the canvas straight into the input system.
 */

import Phaser from 'phaser';
import { HUD_SLOT, playerHudFill } from '../render/playerHud';
import {
  counterText,
  gearsCollectedFrom,
  hudLayout,
  type HudLayout,
} from '../render/hud';
import { addGearObject } from './gearLayer';
import type { World } from '../sim/types';

/** How long a collected gear takes to fly to the counter, in milliseconds. */
const TWEEN_MS = 260;

/**
 * The counter's colours.
 *
 * 🔴 **Criterion 6.6 requires a MEASURED contrast ratio of at least 4.5:1** — WCAG 2.2 SC 1.4.3,
 * Level AA, normal-size text. These two are the pair that was measured; changing either without
 * re-measuring breaks the criterion silently, because a colour that looks fine on brass is exactly
 * the kind of claim an eye gets wrong. The plate behind the text is dark, and the counter is drawn
 * over the HUD's own background rather than over the world, so the measurement is stable.
 */
const COUNTER_FILL = '#f7e3b8';
const COUNTER_STROKE = '#1a1410';

export class UIScene extends Phaser.Scene {
  private layout!: HudLayout;
  private plate!: Phaser.GameObjects.Image;
  private barFill!: Phaser.GameObjects.Graphics;
  private gearIcon!: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  private counter!: Phaser.GameObjects.Text;
  /** The last sim tick a collect tween was spawned for. See `gearsCollectedFrom`. */
  private lastGearTick = 0;
  private built = false;
  /**
   * The diameter the gear icon was CREATED at.
   *
   * Resizing goes through `setScale` against this rather than `setDisplaySize`, because the icon is
   * an `Image` or an `Arc` depending on whether the art exists yet and those two do not implement
   * the same components — a sizing call that silently does nothing on one branch is exactly how the
   * grey box and the sprite would end up different sizes.
   */
  private iconBaseDiameter = 1;

  constructor() {
    super('UI');
  }

  create(): void {
    this.build();
    // Re-layout rather than re-create: the objects keep their identity, so an e2e spec holding a
    // reference across a resize is still looking at the thing on screen.
    this.scale.on('resize', this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.applyLayout, this);
      this.built = false;
    });
  }

  private build(): void {
    // The live size, never a literal (vault 6.2).
    const { width, height } = this.scale.gameSize;
    this.layout = hudLayout(width, height, HUD_SLOT);

    this.plate = this.add.image(0, 0, 'hud-health').setOrigin(0, 0).setDepth(1000);
    this.barFill = this.add.graphics().setDepth(1001);
    // Same decision as the world pickups, made in one place: generated sprite if the catalog has
    // one, grey box until it does. The HUD icon and the thing it counts must not be two different
    // answers to "what does a gear look like".
    this.iconBaseDiameter = this.layout.gearIcon.w;
    this.gearIcon = addGearObject(this, 0, 0, this.iconBaseDiameter).setDepth(1002);
    this.counter = this.add
      .text(0, 0, counterText(0), {
        // 🔴 `monospace` is the tabular-figures decision, criterion 6.1. Every digit in a monospace
        // face has the same advance width BY CONSTRUCTION, so a counter going 009 -> 010 cannot
        // shift. The alternative was generating a bitmap font, which is a fal spend and a whole
        // asset pipeline for one number. Recorded as the deliberate trade it is.
        fontFamily: 'monospace',
        fontStyle: 'bold',
        color: COUNTER_FILL,
        stroke: COUNTER_STROKE,
        strokeThickness: 6,
      })
      .setOrigin(0, 0)
      .setDepth(1002);

    this.built = true;
    this.applyLayout();
  }

  /** Position everything from the CURRENT game size. Called on build and on every resize. */
  private applyLayout(): void {
    if (!this.built) {
      return;
    }
    const { width, height } = this.scale.gameSize;
    this.layout = hudLayout(width, height, HUD_SLOT);

    this.plate.setPosition(this.layout.plate.x, this.layout.plate.y);
    this.plate.setDisplaySize(this.layout.plate.w, this.layout.plate.h);

    // Centre-positioned by the shared contract in `gearLayer.ts`, so the layout's top-left rect
    // becomes a centre here.
    this.gearIcon.setPosition(
      this.layout.gearIcon.x + this.layout.gearIcon.w / 2,
      this.layout.gearIcon.y + this.layout.gearIcon.h / 2,
    );
    this.gearIcon.setScale(this.layout.gearIcon.w / this.iconBaseDiameter);

    this.counter.setPosition(this.layout.counter.x, this.layout.counter.y);
    this.counter.setFontSize(this.layout.counter.fontPx);
  }

  /**
   * Draw the HUD for this frame.
   *
   * Takes the world and the world CAMERA rather than a bag of numbers: the camera is what turns a
   * gear's world position into a screen position, and doing that conversion in `GameScene` would
   * put HUD arithmetic in the scene that is already the project's only over-length file.
   */
  render(world: World, worldCamera: Phaser.Cameras.Scene2D.Camera): void {
    if (!this.built) {
      // `scene.launch` is asynchronous — `GameScene.update()` can run a frame before this scene's
      // `create()` has. Returning is correct rather than defensive: there is nothing to draw yet,
      // and the next frame draws it.
      return;
    }

    this.drawHealth(world.player.hp, world.player.maxHp);
    this.counter.setText(counterText(world.gearsCollected));
    this.spawnCollectTweens(world, worldCamera);
  }

  private drawHealth(hp: number, maxHp: number): void {
    const fill = playerHudFill(hp, maxHp, 0, 0);
    const { slot, scale } = this.layout;
    this.barFill.clear();

    // The EMPTY portion is painted, not the full one. `hud-health.png` already contains a complete
    // gold bar, so drawing a gold fill over it was invisible — gold on gold, which is how the first
    // version of this fix looked identical to the bug it was fixing. Blanking the spent part turns
    // the art's bar into the lit portion and this rectangle into the drained one, which also leaves
    // the bezel and highlights in the art untouched.
    const spentW = (HUD_SLOT.w - fill.w) * scale;
    if (spentW > 0) {
      this.barFill
        .fillStyle(0x241c18, 0.92)
        .fillRect(slot.x + fill.w * scale, slot.y, spentW, slot.h);
    }
  }

  /** One flying gear per gear collected since the last frame — position and count from the sim. */
  private spawnCollectTweens(world: World, worldCamera: Phaser.Cameras.Scene2D.Camera): void {
    const fresh = gearsCollectedFrom(world.gears, this.lastGearTick);
    this.lastGearTick = world.tickCount;
    if (fresh.length === 0) {
      return;
    }

    const target = this.layout.gearIcon;
    for (const gear of fresh) {
      // World space to this scene's screen space. `getBounds()` is not used: the world camera's
      // scroll and zoom ARE the transform, and asking the camera is what keeps this correct when
      // the zoom is not 1.
      const screenX = (gear.x - worldCamera.scrollX) * worldCamera.zoom;
      const screenY = (gear.y - worldCamera.scrollY) * worldCamera.zoom;

      const flyer = addGearObject(this, screenX, screenY, target.w).setDepth(1003);

      this.tweens.add({
        targets: flyer,
        x: target.x + target.w / 2,
        y: target.y + target.h / 2,
        scale: { from: 1, to: 0.6 },
        alpha: { from: 1, to: 0.25 },
        duration: TWEEN_MS,
        ease: 'Quad.easeIn',
        // Destroyed rather than hidden: an invisible object still costs a display-list walk every
        // frame, and a HUD that leaks one object per gear is a leak with a level-sized bound.
        onComplete: () => flyer.destroy(),
      });
    }
  }

  /**
   * The drawn objects, for the e2e spec.
   *
   * Exposed deliberately. Criterion 6.2 asserts `willRender` and screen position on **all three**
   * HUD objects, not just the plate — Codex's plan review (F5) pointed out that checking the image
   * alone lets the bar or the counter vanish while the criterion stays green.
   */
  hudObjects(): {
    plate: Phaser.GameObjects.Image;
    barFill: Phaser.GameObjects.Graphics;
    gearIcon: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
    counter: Phaser.GameObjects.Text;
    layout: HudLayout;
  } {
    return {
      plate: this.plate,
      barFill: this.barFill,
      gearIcon: this.gearIcon,
      counter: this.counter,
      layout: this.layout,
    };
  }
}
