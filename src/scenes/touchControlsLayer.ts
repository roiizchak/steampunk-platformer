/**
 * **The on-screen touch controls.** No Phaser import at all, not even a type — see below.
 *
 * `src/render/touchLayout.ts` decides where the five controls go; this file puts them there, turns
 * fingers into sim intents, and takes them away again when they must not be pressable.
 *
 * ## Why `import type` only
 *
 * `tests/unit/touch-draw-path.test.ts` drives this class against a fake scene, and criterion 12.15
 * runs the whole unit suite with Phaser **uninstalled**. A value import would turn that into a
 * module-resolution failure.
 *
 * It goes one step further and names **no** Phaser type either: the scene, its objects and its
 * emitters arrive through the structural interfaces below. A real `Phaser.Scene` satisfies
 * `TouchSceneLike` without being told to, and the interfaces are the exact list of what this file
 * is allowed to reach for — anything else is a compile error rather than a habit. The event names
 * come from `engineLiterals.ts`, pinned against the vendored engine by
 * `tests/unit/engine-literals.test.ts` — a transcribed constant is only as good as its pin.
 *
 * ## Two objects per control, and why
 *
 * A **zone** is the hit target and a **face** is what the player sees. Keeping them separate means
 * the touch target is exactly `TOUCH_BOX_PX` however big or small the art turns out to be — so
 * criterion 12.9's 44 CSS px floor is a property of the layout rather than of a generated image.
 *
 * ## The three things that are easy to get wrong, all of them found by review before they shipped
 *
 * 1. 🔴 **The authoritative release is the SCENE-level `pointerup`, not the zone's.** Phaser
 *    dispatches it *"if a pointer is released anywhere"*; a Game Object hears only about a release
 *    over itself. Press RIGHT, slide onto empty canvas, lift — without the scene subscription the
 *    pointer id sits in the set forever and the player runs right until the level ends.
 * 2. 🔴 **Cancel contacts BEFORE `disableInteractive()`.** Disabling removes the object from
 *    Phaser's `_over` lists (`InputPlugin.js:861, 873`), which suppresses the later object-level
 *    release and leaves the action stuck held.
 * 3. 🔴 **The `BLUR` / `HIDDEN` subscriptions live on the GAME's emitter, which Phaser does not tear
 *    down for us.** Scene shutdown removes `InputPlugin`'s own listeners (`InputPlugin.js:3098-3142`)
 *    and nothing else, so `destroy()` removes them by hand or a level-select round trip leaves a
 *    dead closure firing into a destroyed layer.
 *
 * ## `controlsLive` is one predicate, and it gates INTERACTIVITY as well as visibility
 *
 * ```
 * live = isTouchDevice && gameRunning && playerInputEnabled && touchTargetsFit(layout, cssScale)
 * ```
 *
 * The last term is the one a first draft leaves out. The rotate prompt covers the screen at phone
 * portrait; if the controls stayed interactive underneath it, a tap meant for *"turn your phone"*
 * would move the player instead.
 */

import { latchAttackPress, latchJumpPress } from '../sim/input';
import type { InputSnapshot } from '../sim/types';
import {
  type TouchId,
  type TouchTarget,
  cssScaleFor,
  touchLayout,
  touchTargetsFit,
} from '../render/touchLayout';
import { drawMarks, drawPlate, PLATE_ALPHA, PLATE_ALPHA_PRESSED } from './touchMarks';
import type {
  PointerLike,
  TouchFaceLike,
  TouchGameSceneLike,
  TouchSceneLike,
  TouchZoneLike,
} from './touchTypes';

// Re-exported from their original home so every existing importer keeps working. The interfaces
// moved to `touchTypes.ts` when the two-ink repair took this file past the 400-line ceiling; they
// are a clean seam because they name no behaviour, only the slice of Phaser this layer may touch.
export type {
  EmitterLike,
  PointerLike,
  TouchFaceLike,
  TouchGameSceneLike,
  TouchSceneLike,
  TouchZoneLike,
} from './touchTypes';
import {
  GAMEOBJECT_POINTER_DOWN,
  GAME_BLUR,
  GAME_HIDDEN,
  INPUT_GAME_OUT,
  INPUT_POINTER_UP,
  INPUT_POINTER_UP_OUTSIDE,
  SCENE_DESTROY,
  SCENE_PAUSE,
  SCENE_SHUTDOWN,
  SCENE_SLEEP,
} from './engineLiterals';
import type { TouchHeld } from './inputMerge';
import { TouchContacts } from './touchContacts';

/**
 * ## The Phaser surface, as structure rather than as an import
 *
 * Every method below is one this file actually calls. A real `Phaser.Scene`, `Zone`, `Rectangle`,
 * `Text` and `EventEmitter` satisfy these already — Phaser's own signatures are wider, and a wider
 * signature is assignable to a narrower one. Nothing here re-declares Phaser's API; it is a
 * **budget** for how much of it the touch layer is allowed to touch.
 */

/** Above every HUD depth (`hudFade` 1000/1001, the gear counter 1002) — the controls are the top layer. */
export const TOUCH_FACE_DEPTH = 2000;
export const TOUCH_ZONE_DEPTH = 2001;



/** Everything this layer needs from one `Game` scene, rebound on every level entry. */
export interface TouchBinding {
  input$: InputSnapshot;
  /** The scene whose PAUSE / SLEEP / SHUTDOWN / DESTROY must drop every contact. */
  gameScene: TouchGameSceneLike;
  /** Is the bound `Game` scene RUNNING? Polled — `UIScene` already reads this for its own retirement. */
  isGameRunning: () => boolean;
  /** `GameScene.playerInputEnabled` is `protected`, so it arrives as a provider. */
  isPlayerInputEnabled: () => boolean;
  openLevelSelect: () => void;
}

interface Control {
  id: TouchId;
  zone: TouchZoneLike;
  faces: TouchFaceLike[];
}

export class TouchControlsLayer {
  private readonly contacts = new TouchContacts();
  private controls: Control[] = [];
  private binding: TouchBinding | null = null;
  private isLive = false;
  /** The view the objects are currently placed for. `-1` so the first refresh always places. */
  private placedFor = { w: -1, h: -1 };
  /**
   * The pressed state, and why it is not decoration.
   *
   * A thumb physically covers a 55.6 CSS px control. With no visual answer, the ONLY confirmation
   * a press registered is the character reacting — which is fine for LEFT and RIGHT, and useless
   * for an ATTACK swallowed by hitstop, a JUMP taken by the buffer window, or any press that
   * missed the zone. In all of those the screen is byte-identical to no touch at all, which is
   * the definition of an app that reads as broken. Named by the UI/UX gate.
   */
  private setPressed(id: TouchId, pressed: boolean): void {
    const control = this.controls.find((c) => c.id === id);
    control?.faces[0]?.setAlpha(pressed ? PLATE_ALPHA_PRESSED : PLATE_ALPHA);
  }

  /** Every control back to rest. Runs on every loss path, so no plate can be left lit. */
  private clearPressed(): void {
    for (const control of this.controls) control.faces[0]?.setAlpha(PLATE_ALPHA);
  }

  private readonly onRelease = (pointer: PointerLike): void => {
    const id = this.contacts.release(pointer.id);
    if (id) this.setPressed(id, false);
  };
  private readonly onLoseEverything = (): void => {
    this.contacts.cancelAll();
    this.clearPressed();
  };

  constructor(
    private readonly scene: TouchSceneLike,
    /** `game.device.input.touch`, read once. No URL override, so nothing extra can reach `dist/`. */
    private readonly isTouchDevice: boolean,
  ) {}

  get live(): boolean {
    return this.isLive;
  }

  held(): TouchHeld {
    return this.contacts.snapshot();
  }

  /**
   * Build the controls and subscribe to every release path.
   *
   * A non-touch device gets **nothing at all** — not a hidden object, not a disabled one. An
   * invisible interactive object still swallows pointers (`UIScene.ts:36-38`).
   */
  create(): void {
    if (!this.isTouchDevice) return;

    for (const target of this.plan()) {
      this.controls.push(this.build(target));
    }

    // Scene-level, so a release is caught wherever it lands — see the header.
    this.scene.input.on(INPUT_POINTER_UP, this.onRelease, this);
    this.scene.input.on(INPUT_POINTER_UP_OUTSIDE, this.onRelease, this);
    // ⚠️ KEPT, and flagged rather than removed. `InputManager.onTouchMove` runs
    // `document.elementFromPoint` per finger per move and fires GAME_OUT when the topmost
    // element is not the canvas — so on a pillarboxed phone a thumb rolling a few millimetres
    // past the canvas edge drops the jump the OTHER hand is holding. The QA gate's adversarial
    // 12.5 brief argues for deleting this line, because a finger that leaves the canvas still
    // delivers `touchend` and POINTER_UP clears it per pointer. That is persuasive — and
    // GAME_OUT is named in criterion 12.5's own text, so dropping it narrows an approved
    // criterion. Recorded for the owner in the QA log instead of decided here.
    this.scene.input.on(INPUT_GAME_OUT, this.onLoseEverything, this);
    // On the GAME emitter. Phaser will not remove these; `destroy()` must.
    this.scene.game.events.on(GAME_BLUR, this.onLoseEverything, this);
    this.scene.game.events.on(GAME_HIDDEN, this.onLoseEverything, this);
  }

  /**
   * Point the controls at a `Game` scene — or at nothing.
   *
   * Idempotent, because `attachHud` reuses an already-active `UIScene` on every level transition
   * (`gameHud.ts:49-52`). Drops live contacts first: a finger must not survive a level change.
   */
  bind(binding: TouchBinding | null): void {
    this.contacts.cancelAll();
    this.unwatchGameScene();
    this.binding = binding;
    if (binding) {
      for (const event of [SCENE_PAUSE, SCENE_SLEEP, SCENE_SHUTDOWN, SCENE_DESTROY]) {
        binding.gameScene.events.on(event, this.onLoseEverything, this);
      }
    }
    this.refresh();
  }

  /**
   * Re-place the controls and re-evaluate whether they may be touched.
   *
   * Called from `UIScene`'s update and on `resize`. Polling rather than event-driven on purpose:
   * `UIScene` already reads the `Game` scene's status every frame for its own retirement, so this
   * asks the same question at the same moment instead of inventing a second source of truth.
   */
  refresh(): void {
    if (this.controls.length === 0) {
      this.isLive = false;
      return;
    }

    const { width, height } = this.scene.scale.gameSize;
    const targets = this.plan();
    // Re-place only on a real size change. `refresh()` runs every frame — it is how the live
    // predicate is re-evaluated without a second source of truth — and moving five objects to the
    // coordinates they are already at, 60 times a second, is work with no observable effect.
    if (width !== this.placedFor.w || height !== this.placedFor.h) {
      this.placedFor = { w: width, h: height };
      for (const [i, target] of targets.entries()) {
        const control = this.controls[i];
        control.zone.setPosition(target.x, target.y).setSize(target.w, target.h);
        for (const face of control.faces) {
          face.setPosition(target.x + target.w / 2, target.y + target.h / 2);
        }
      }
    }

    const scale = cssScaleFor(this.scene.scale.displaySize.width, this.scene.scale.gameSize.width);
    const wanted =
      this.binding !== null &&
      this.binding.isGameRunning() &&
      this.binding.isPlayerInputEnabled() &&
      touchTargetsFit(targets, scale);

    if (wanted === this.isLive) return;
    this.isLive = wanted;

    // 🔴 Cancel FIRST. Disabling a zone removes it from Phaser's `_over` lists, which suppresses the
    // release that would otherwise clear the contact.
    if (!wanted) {
      this.contacts.cancelAll();
      this.clearPressed();
    }

    for (const control of this.controls) {
      if (wanted) control.zone.setInteractive();
      else control.zone.disableInteractive();
      for (const face of control.faces) face.setVisible(wanted);
    }
  }

  /** Remove every subscription, including the two Phaser would leave behind, and drop the objects. */
  destroy(): void {
    this.contacts.cancelAll();
    this.unwatchGameScene();
    this.binding = null;
    this.scene.input.off(INPUT_POINTER_UP, this.onRelease, this);
    this.scene.input.off(INPUT_POINTER_UP_OUTSIDE, this.onRelease, this);
    this.scene.input.off(INPUT_GAME_OUT, this.onLoseEverything, this);
    this.scene.game.events.off(GAME_BLUR, this.onLoseEverything, this);
    this.scene.game.events.off(GAME_HIDDEN, this.onLoseEverything, this);
    for (const control of this.controls) {
      control.zone.destroy();
      for (const face of control.faces) face.destroy();
    }
    this.controls = [];
    this.isLive = false;
    this.placedFor = { w: -1, h: -1 };
  }

  private plan(): TouchTarget[] {
    const { width, height } = this.scene.scale.gameSize;
    return touchLayout(width, height);
  }

  private unwatchGameScene(): void {
    if (!this.binding) return;
    for (const event of [SCENE_PAUSE, SCENE_SLEEP, SCENE_SHUTDOWN, SCENE_DESTROY]) {
      this.binding.gameScene.events.off(event, this.onLoseEverything, this);
    }
  }

  private build(target: TouchTarget): Control {
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;

    // Grey-box until the generated plate lands. `textures.exists` is the same greybox-or-sprite
    // decision `gearLayer.addGearObject` makes, in one place, so the HUD icon and the thing it
    // counts cannot become two different answers.
    const faces: TouchFaceLike[] = [];
    faces.push(drawPlate(this.scene, target, cx, cy));
    for (const mark of drawMarks(this.scene, target, cx, cy)) faces.push(mark);

    const zone = this.scene.add
      .zone(target.x, target.y, target.w, target.h)
      .setName(target.id)
      .setOrigin(0, 0)
      .setDepth(TOUCH_ZONE_DEPTH);
    zone.on(GAMEOBJECT_POINTER_DOWN, (pointer: PointerLike) => this.onPress(target.id, pointer));

    // 🔴 Built HIDDEN, to match `isLive`, which starts false.
    //
    // `refresh()` early-outs when the wanted state equals the current one, so a face created visible
    // while `isLive` was false would never be told to hide — and on a phone held upright the five
    // controls stayed drawn under the rotate prompt, non-interactive but plainly there. Caught by
    // `phase-12-viewport.spec.ts`, not by a unit test: every unit case reached the live state, where
    // the flag and the objects agree again.
    for (const face of faces) face.setVisible(false);

    return { id: target.id, zone, faces };
  }

  /**
   * A finger landed on a control.
   *
   * Guarded on `isLive` as well as on `disableInteractive` — belt and braces, and the belt is what a
   * test can see. `contacts.begin` returning false means this pointer already owns another control
   * (it slid across), so it arms nothing: a slide from RIGHT onto JUMP must neither fire a jump nor
   * stop the player running right.
   */
  private onPress(id: TouchId, pointer: PointerLike): void {
    if (!this.isLive || !this.binding) return;
    if (!this.contacts.begin(pointer.id, id)) return;

    this.setPressed(id, true);
    if (id === 'jump') latchJumpPress(this.binding.input$);
    else if (id === 'attack') latchAttackPress(this.binding.input$);
    else if (id === 'pause') this.binding.openLevelSelect();
    // `left` and `right` are levels; `TouchContacts` already holds them and `applyHeld` reads them.
  }
}

