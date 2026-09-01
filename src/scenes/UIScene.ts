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
  COUNTER_FILL,
  COUNTER_STROKE,
  COUNTER_STROKE_PX,
  counterText,
  hudLayout,
  type HudLayout,
} from '../render/hud';
import { addGearObject } from './gearLayer';
import { setOverlay, type LevelCompleteInfo, type LevelCompleteOverlay } from './hudFade';
import { attachGearFlyers, type GearFlyers } from './hudGearFlyers';
import { attachGearPop, type GearPop } from './hudGearPop';
import type { World } from '../sim/types';
import type { TouchBinding } from './touchControlsLayer';
import { TouchSession } from './touchSession';
import { attachUiTouch, type UiTouchOverlay } from './uiTouch';
import type { TouchHeld } from './inputMerge';

/**
 * The counter's colours moved to `hud.ts` on 2026-08-23 *(inventory 2b.4)*, with the contrast
 * method that had never been written down and the measurement that method produces. They live in
 * the engine-free layer so a test can hold them in relation to the shipped backgrounds; this file
 * imports them and applies them, which is the same split as every other HUD decision.
 */

export class UIScene extends Phaser.Scene {
  /**
   * Phase 8's level-complete fade and panel, or `undefined` while a level is being played.
   *
   * **Public on purpose.** Criterion 8.6 asserts the overlay is *drawn*, and the Phase 6 lesson is
   * that `visible && alpha` both stay truthy while `setScale(0)` leaves the GPU drawing nothing — so
   * a spec needs the real game objects to ask `willRender(camera)`. It reaches them through
   * `window.__phaserGame`, the same way `drawnVsSim.ts` and `perfSampler.ts` already read scene
   * state, rather than through a ninth `window.__game` field (closed by a Phase 1 ruling).
   */
  overlay?: LevelCompleteOverlay;
  private layout!: HudLayout;
  private plate!: Phaser.GameObjects.Image;
  private barFill!: Phaser.GameObjects.Graphics;
  private gearIcon!: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  private counter!: Phaser.GameObjects.Text;
  /** The last sim tick a collect tween was spawned for. See `gearsCollectedFrom`. */
  private lastGearTick = 0;
  /**
   * The count currently DRAWN in the counter.
   *
   * Separate from `world.gearsCollected` so `render()` can tell "nothing changed" from "changed to
   * the same number", and skip both the text update and the tween scan on the overwhelming majority
   * of frames. See the comment in `render()` for whose finding this was.
   */
  private drawnGearCount = -1;
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
  private gearPop?: GearPop;
  /** The collect flight, and the handles it holds — criterion 9.3. See `hudGearFlyers.ts`. */
  private flyers?: GearFlyers;

  /**
   * The seam that tells the touch controls which `Game` scene they drive.
   *
   * Constructed with the scene, not in `create()`, because `attachHud` binds before `create()`
   * runs — `touchSession.ts` has the queue analysis. The objects it drives are built by
   * `attachUiTouch`, which also carries why they belong on this scene and not on `GameScene`.
   */
  readonly touch = new TouchSession();
  private touchUi?: UiTouchOverlay;

  constructor() {
    super('UI');
  }

  create(): void {
    this.flyers = attachGearFlyers(this);
    this.build();
    this.touchUi = attachUiTouch(this, this.game.device.input.touch, this.touch);
    // Re-layout rather than re-create: the objects keep their identity, so an e2e spec holding a
    // reference across a resize is still looking at the thing on screen.
    this.scale.on('resize', this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.applyLayout, this);
      this.built = false;
      // 🔴 M2b / M14. Phaser preserves this scene INSTANCE across a shutdown and removes only
      // `InputPlugin`'s own listeners — `attachUiTouch`'s `destroy` has the detail.
      this.touchUi?.destroy();
      this.touchUi = undefined;
      // Phase 8. `destroy()` kills the tweens first — a tween still running against a destroyed
      // target throws inside Phaser's update loop, and a throw there stops every scene after it.
      this.levelComplete(null);
      // 🔴 Phase 9 added TWO more tween owners to this scene and neither was added here. The gear
      // pop targets `gearIcon`, which this shutdown destroys; the flyers target objects of their
      // own. `gearPop` is also NULLED, or the next `create()`'s first `applyLayout` calls
      // `destroy()` on the previous run's handle and settles a destroyed icon from a dead list.
      this.gearPop?.destroy();
      this.gearPop = undefined;
      this.flyers?.destroy();
    });
  }

  /**
   * Point the touch controls at a `Game` scene. Called by `attachHud`, which runs BEFORE this
   * scene's `create()` — `touchSession.ts` carries why that is not a bug to route around.
   *
   * `isGameRunning` is supplied here rather than by the caller because it is the same status
   * read `update()` already makes, and `gameHud.ts` imports Phaser as a TYPE only so it cannot
   * name `Phaser.Scenes.RUNNING`. RUNNING exactly: PAUSED still renders, and controls that stay
   * live under a pause screen drive a sim the player cannot see.
   */
  bindTouchSession(binding: Omit<TouchBinding, 'isGameRunning'>): void {
    this.touch.bind({
      ...binding,
      isGameRunning: () =>
        (this.scene.get('Game') as Phaser.Scene | null)?.sys?.settings?.status ===
        Phaser.Scenes.RUNNING,
    });
  }

  /** This frame's touch levels, for `sampleHeldKeys`. All-false when there are no controls. */
  touchHeld(): TouchHeld {
    return this.touch.held();
  }

  /** Show, or clear (`null`), the level-complete overlay. The transition lives in `hudFade.ts`. */
  levelComplete(info: LevelCompleteInfo | null): void {
    this.overlay = setOverlay(this, this.overlay, info);
  }

  /**
   * 🔴 The HUD owns its own lifetime, and stops itself once `GameScene` is no longer running.
   *
   * ## Why this, and not a SHUTDOWN handler on `GameScene`
   *
   * A parallel scene outlives the scene that started it, so leaving `GameScene` used to strand the
   * HUD on top of whatever replaced it — a health bar and gear count belonging to a game that had
   * stopped *(code-reviewer brief 2 #6)*.
   *
   * The obvious fix — `GameScene` stopping `'UI'` from its own SHUTDOWN — was written, and **both**
   * code-reviewer briefs independently traced it breaking the restart path before any test caught
   * it. `SceneManager.start('Game')` on a running Game calls `sys.shutdown()` synchronously, so the
   * handler only *queues* `stop('UI')`; `GameScene` has no `preload`, so `create()` runs in that
   * same call and `attachHud` sees `isActive('UI') === true` and skips the launch; the queue then
   * drains and stops the HUD. Net: a running game with no HUD and no way back — exactly the Phase 7
   * level transition the handler was written for. Reproduced in a browser, then discarded.
   *
   * Making `attachHud` `stop`-then-`launch` fixed the restart and broke the dev-scene teardown.
   * Both attempts failed the same way: they depend on where an operation lands in Phaser's queue.
   *
   * This does not. It is a **condition, re-evaluated every frame**, and it is correct whatever the
   * queue does: on a restart `GameScene` is RUNNING again before the next frame, so the HUD never
   * sees it absent; on a dev-scene toggle it stays absent, and the HUD retires itself. There is no
   * ordering to get wrong because there is no ordering.
   */
  update(): void {
    /**
     * ⚠️ **Status, not `isActive`.** `isActive` is `status === RUNNING`, so it answers *false* for a
     * scene that is merely PAUSED or SLEEPING — and the HUD must outlive both. This was
     * `!this.scene.isActive('Game')` for exactly one test run, and it retired the HUD the moment
     * criterion 6.4's spec paused `Game` to read a synthetic render, which is also precisely the
     * pause-screen case a reviewer flagged as the next thing to break.
     *
     * The threshold is `SLEEPING`, not `SHUTDOWN`, and Codex's second implementation review is why.
     * The two non-running states are **not** alike:
     *
     *  - **PAUSED** still RENDERS. The world is on screen and frozen — a pause screen — so the HUD
     *    belongs there and must survive. This is also what criterion 6.4's spec does to read a
     *    synthetic render.
     *  - **SLEEPING** renders nothing. The game is gone from the screen, so a HUD that outlived it
     *    would float over whatever replaced it, showing a health bar for a game nobody can see —
     *    the exact defect this method exists to prevent, in the one state the first threshold let
     *    through.
     *
     * `SLEEPING`, `SHUTDOWN` and `DESTROYED` are the three highest statuses, so one comparison
     * covers them and any future terminal state; `PAUSED` (6) sits just below and is kept.
     */
    const game = this.scene.get('Game') as Phaser.Scene | null;
    const status = game?.sys?.settings?.status;
    // Re-placed and re-gated here rather than from an event, for the reason the retirement check
    // below is a per-frame condition: there is no ordering to get wrong because there is no
    // ordering. Cheap — the layer re-places its objects only when the view size actually changed.
    this.touchUi?.refresh();
    if (status === undefined || status >= Phaser.Scenes.SLEEPING) {
      this.scene.stop();
    }
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
        strokeThickness: COUNTER_STROKE_PX,
      })
      .setOrigin(0, 0)
      .setDepth(1002);

    // 🔴 Reset with the objects, not at field-declaration time.
    //
    // `attachHud`'s `isActive('UI')` guard deliberately does NOT rebuild this scene when
    // `GameScene` restarts, and neither did anything reset these two caches. After a level reload
    // the new world starts at `tickCount` 0 while `lastGearTick` still held the previous run's
    // final tick, so `gearsCollectedFrom` returned nothing and the first gear of the new run
    // produced no tween. Found by the code-reviewer's adversarial brief.
    this.lastGearTick = 0;
    this.drawnGearCount = -1;

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
    this.gearPop?.destroy();
    this.gearIcon.setScale(this.layout.gearIcon.w / this.iconBaseDiameter);
    this.gearPop = attachGearPop(this, this.gearIcon, this.layout.gearIcon.w / this.iconBaseDiameter);

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

    // 🔴 Both of the next two are guarded on "did the count actually change", and the guard is the
    // finding rather than an optimisation reflex.
    //
    // The performance gate owner's brief 1 pointed out that `setText` was called every frame with
    // the same string, and that whether Phaser 4.2.1 re-rasterises its canvas texture on an
    // unchanged value is an internal it could not read — making it the one place in this diff where
    // per-frame cost could plausibly scale with something other than "trivial". Rather than read
    // Phaser's internals to find out, the call is simply not made when nothing changed.
    //
    // The same guard removes `gearsCollectedFrom`'s per-frame array allocation, which `.filter()`
    // performs even when it matches nothing. `GearLayer.sync()` already uses this exact discipline
    // one file over (`body.visible === gear.collected`), so this is the established shape here, not
    // a new one.
    if (world.gearsCollected !== this.drawnGearCount) {
      this.drawnGearCount = world.gearsCollected;
      this.counter.setText(counterText(world.gearsCollected));
      this.gearPop?.pop();
      this.flyers?.spawn(world, this.lastGearTick, this.layout.gearIcon, worldCamera);
    }
    this.lastGearTick = world.tickCount;
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
