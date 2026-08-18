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
import { setOverlay, type LevelCompleteInfo, type LevelCompleteOverlay } from './hudFade';
import { ticksToMs } from '../sim';
import type { World } from '../sim/types';

/**
 * How long a collected gear takes to fly to the counter, as an INTEGER COUNT OF TICKS.
 *
 * 🔴 This was `const TWEEN_MS = 260`, and Codex's implementation review called it a blocker against
 * the project's own rule: *every duration is an integer count of 60 Hz ticks*. 260 ms is 15.6 ticks
 * — a float of seconds wearing a millisecond's clothes, in the one layer where the rule is easiest
 * to forget because Phaser's tween API genuinely takes milliseconds.
 *
 * 15 ticks is 250 ms exactly. The conversion goes through `ticksToMs`, the same function the rest of
 * the project uses, so the number that reaches Phaser is derived rather than authored.
 */
const TWEEN_TICKS = 15;

/**
 * The counter's colours.
 *
 * 🔴 **Criterion 6.6 requires a MEASURED contrast ratio of at least 4.5:1** — WCAG 2.2 SC 1.4.3,
 * Level AA. Measured 2026-08-15 by the accessibility gate owner against background pixels sampled
 * from the running game: **9.47:1 to 11.87:1**, well clear of the 4.5:1 normal-text threshold and
 * of the 3:1 large-text one this 44 px bold face actually qualifies for. Changing either colour
 * without re-measuring breaks the criterion silently.
 *
 * 🔴 **The counter is drawn over the LEVEL, not over the HUD plate.** An earlier version of this
 * comment claimed the opposite — that the text sat on the plate's own dark background, so the
 * measurement was stable. It is false: `hudLayout` puts `counter.x` beyond `plate.x + plate.w`, so
 * whatever the world happens to be behind it IS the background. The accessibility gate owner
 * caught it while verifying the claim rather than assuming it *(vault C9 — a comment describing a
 * mechanism that does not exist turns nothing red)*.
 *
 * That makes `COUNTER_STROKE` load-bearing rather than decorative: a 6 px dark outline is what
 * holds the contrast when the player walks in front of something pale. The measurement above is of
 * the shipped level's actual background, not of a guaranteed one, and that limitation is recorded
 * in `docs/qa/phase-06-hud.md` rather than papered over.
 */
const COUNTER_FILL = '#f7e3b8';
const COUNTER_STROKE = '#1a1410';

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
      // Phase 8. `destroy()` kills the tweens first — a tween still running against a destroyed
      // target throws inside Phaser's update loop, and a throw there stops every scene after it.
      this.levelComplete(null);
    });
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
        strokeThickness: 6,
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
      this.spawnCollectTweens(world, worldCamera);
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

  /** One flying gear per gear collected since the last frame — position and count from the sim. */
  private spawnCollectTweens(world: World, worldCamera: Phaser.Cameras.Scene2D.Camera): void {
    // `lastGearTick` is advanced by the caller, on EVERY frame — including the ones that skip this
    // function. It has to be: if it only moved when a gear was collected, the window would grow
    // without bound and a gear collected long ago would be re-tweened the next time any gear was.
    const fresh = gearsCollectedFrom(world.gears, this.lastGearTick);
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

      // 🔴 `from` is the flyer's OWN scale, never a literal 1.
      //
      // `addGearObject` sizes an `Image` with `setDisplaySize`, i.e. it sets `scaleX`. Tweening
      // `scale` from a literal 1 overwrote that on the first step — correct only by coincidence at
      // the design size, where `target.w` happens to equal the texture's own 72 px. After a
      // `scale.resize(1280, 720)` the icon is 48 px, the flyer's real scale is 0.667, and every
      // flyer would have snapped to 72 px before shrinking. The `Arc` branch was unaffected, which
      // is exactly how this would have shipped: the grey-box path looked right.
      const flyerScale = flyer.scale;

      this.tweens.add({
        targets: flyer,
        x: target.x + target.w / 2,
        y: target.y + target.h / 2,
        scale: { from: flyerScale, to: flyerScale * 0.6 },
        alpha: { from: 1, to: 0.25 },
        duration: ticksToMs(TWEEN_TICKS),
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
