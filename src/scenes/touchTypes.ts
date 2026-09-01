import type { InputSnapshot } from '../sim/types';

/**
 * **The slice of Phaser the touch layer is allowed to touch, as structural interfaces.**
 *
 * No Phaser import anywhere in this file — not even a type. A real `Phaser.Scene` satisfies
 * `TouchSceneLike` structurally, and a plain object in a unit test satisfies it too, which is what
 * lets `npm run test:sim-isolated` run the whole suite with Phaser uninstalled.
 *
 * Split out of `touchControlsLayer.ts` at the 400-line ceiling. `touchControlsLayer.ts` re-exports
 * every name here, so no importer had to change.
 *
 * Every method below is one the touch layer actually calls. A real `Phaser.Scene`, `Zone`,
 * `Rectangle`, `Text` and `EventEmitter` satisfy these already — Phaser's own signatures are wider,
 * and a wider signature is assignable to a narrower one. Nothing here re-declares Phaser's API; it
 * is a **budget** for how much of it the touch layer is allowed to touch. The walk control and the walk latch took it past
 * the ceiling a second time; `TouchBinding` and the two depths followed the interfaces here, for
 * the same reason — they name no behaviour, only the shape of what the layer is handed.
 */

/** All this file ever reads off a pointer. */
export interface PointerLike {
  id: number;
}

/**
 * The `on` / `off` pair, as Phaser's `EventEmitter` exposes it.
 *
 * `(...args: never[]) => void` accepts a handler of any arity: `never` is assignable to every
 * parameter type, so `(p: PointerLike) => void` fits where `unknown[]` would not.
 */
export interface EmitterLike {
  on(event: string, fn: (...args: never[]) => void, context?: unknown): unknown;
  off(event: string, fn?: (...args: never[]) => void, context?: unknown): unknown;
}

/** A hit target. Interactivity is toggled, never re-created — see `refresh`. */
export interface TouchZoneLike {
  setName(name: string): TouchZoneLike;
  setOrigin(x: number, y?: number): TouchZoneLike;
  setDepth(depth: number): TouchZoneLike;
  setPosition(x: number, y: number): TouchZoneLike;
  setSize(width: number, height: number): TouchZoneLike;
  /**
   * 🔴 Required by tap routes drawn on `GameScene`, whose camera SCROLLS with the player.
   * Without it the completion zone sits in world space at the level origin, thousands of pixels
   * behind the player by the time the panel appears — drawn, interactive, and unreachable.
   */
  setScrollFactor(x: number, y?: number): TouchZoneLike;
  setInteractive(): TouchZoneLike;
  disableInteractive(): TouchZoneLike;
  on(event: string, fn: (...args: never[]) => void): TouchZoneLike;
  destroy(): void;
}

/** Anything drawn over a zone: the grey-box plate, its glyph, and later the generated art. */
export interface TouchFaceLike {
  setName(name: string): TouchFaceLike;
  setOrigin(x: number, y?: number): TouchFaceLike;
  setDepth(depth: number): TouchFaceLike;
  setPosition(x: number, y: number): TouchFaceLike;
  setVisible(visible: boolean): TouchFaceLike;
  /** A `Rectangle` only. The plate's second ink — see the PLATE_* block below. */
  setStrokeStyle?(width: number, color: number): TouchFaceLike;
  /** `Text` only. The rotate prompt resizes its copy against the live CSS scale. */
  setFontSize?(size: number): TouchFaceLike;
  /**
   * `Text` only. The rotate prompt's subline is 36 monospace characters, and at a phone-portrait
   * CSS scale that is wider than the 1920 px design surface — so it MUST be allowed to wrap.
   */
  setWordWrapWidth?(width: number, useAdvancedWrap?: boolean): TouchFaceLike;
  /** `Text` only, and only meaningful once the line above can wrap. */
  setAlign?(align: string): TouchFaceLike;
  /**
   * `Text` only. Declared so that CALLING it is expressible — and therefore forbiddable.
   *
   * 🔴 `paintLevelButton` must never call this: the level-select label is byte-identical between
   * the selected and unselected states, and selection reads on the plate's keyline instead. The
   * gate for that is `level-buttons.test.ts`'s "does not touch the label text" case, and it was
   * DECORATION until this line existed. `setText` was on neither the interface nor the fake, so a
   * mutation that re-introduced the old `"> "` prefix was a no-op against the fake and the gate
   * stayed green through the exact change it names *(C2)*. Caught by running that mutation.
   */
  setText?(text: string): TouchFaceLike;
  /**
   * `Text` only. The level-select row's ink — unlocked, locked or selected.
   *
   * A CSS colour STRING, not a number: `Text` styles are CSS and `setColor` takes `'#8f8776'`,
   * while `setStrokeStyle` on the plate beside it takes `0x8f8776`. The two forms of the same ink
   * are why `levelButtons.ts` declares each colour twice rather than converting at the call site.
   */
  setColor?(color: string): TouchFaceLike;
  /** `Rectangle` only. The rotate prompt's scrim re-sizes to a changed design size. */
  setSize?(width: number, height: number): TouchFaceLike;
  /** `Image` only. A 160 px face drawn into a box `touchLayout` scaled off the view. */
  setDisplaySize?(width: number, height: number): TouchFaceLike;
  /** The pressed state. A control that does not visibly answer a thumb reads as a broken app. */
  setAlpha(alpha: number): TouchFaceLike;
  /**
   * `Rectangle` only — the grey-box plate's pressed state.
   *
   * 🔴 **Not `setAlpha`, and the difference is the keyline.** A `Shape` carries `fillAlpha`
   * separately from the Alpha component's `alpha` (`Shape.js:119`, *"only used when `isFilled`"*).
   * `drawPlate` sets the plate's translucency through `add.rectangle`'s 6th argument — that is
   * `fillAlpha`, and it leaves the keyline opaque, which is where the plate's WCAG 1.4.11 contrast
   * actually comes from. Pressing with `setAlpha` instead multiplies the stroke too: the effective
   * fill became `rest x pressed` and the keyline dropped to the pressed value, dimming the one
   * element the contrast argument rests on. The art arm is an `Image` with no fill, so it keeps
   * using `setAlpha`.
   */
  setFillStyle?(fillColor: number, fillAlpha: number): TouchFaceLike;
  /** `Rectangle` only — the two strokes of the attack cross. */
  setAngle?(degrees: number): TouchFaceLike;
  destroy(): void;
}

/** The bound `Game` scene, which this layer only ever listens to. */
export interface TouchGameSceneLike {
  events: EmitterLike;
}

/** The scene the controls are drawn on — `UIScene`, whose camera never moves. */
export interface TouchSceneLike {
  add: {
    zone(x: number, y: number, width: number, height: number): TouchZoneLike;
    rectangle(
      x: number,
      y: number,
      width: number,
      height: number,
      fillColor?: number,
      fillAlpha?: number,
    ): TouchFaceLike;
    text(x: number, y: number, text: string, style?: object): TouchFaceLike;
    triangle(
      x: number,
      y: number,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      x3: number,
      y3: number,
      fillColor?: number,
      fillAlpha?: number,
    ): TouchFaceLike;
    /** The gear's body and hub, and the wrench's ring. A shape a rectangle cannot fake. */
    circle(x: number, y: number, radius: number, fillColor?: number, fillAlpha?: number): TouchFaceLike;
    /** The generated brass face, once the plate has been cut. See `touchControlsLayer.build`. */
    image(x: number, y: number, key: string): TouchFaceLike;
  };
  /** Whether a generated face reached the texture manager. The greybox-or-art decision. */
  textures: { exists(key: string): boolean };
  input: EmitterLike;
  game: { events: EmitterLike };
  scale: {
    gameSize: { width: number; height: number };
    displaySize: { width: number; height: number };
  };
}


/** Above every HUD depth (`hudFade` 1000/1001, the gear counter 1002) — the controls are the top layer. */
export const TOUCH_FACE_DEPTH = 2000;
export const TOUCH_ZONE_DEPTH = 2001;

/** Everything the layer needs from one `Game` scene, rebound on every level entry. */
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
