/**
 * **The slice of Phaser the touch layer is allowed to touch, as structural interfaces.**
 *
 * No Phaser import anywhere in this file — not even a type. A real `Phaser.Scene` satisfies
 * `TouchSceneLike` structurally, and a plain object in a unit test satisfies it too, which is what
 * lets `npm run test:sim-isolated` run the whole suite with Phaser uninstalled.
 *
 * Split out of `touchControlsLayer.ts` at the 400-line ceiling. `touchControlsLayer.ts` re-exports
 * every name here, so no importer had to change.
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
  /** `Rectangle` only. The rotate prompt's scrim re-sizes to a changed design size. */
  setSize?(width: number, height: number): TouchFaceLike;
  /** `Image` only. A 160 px face drawn into a box `touchLayout` scaled off the view. */
  setDisplaySize?(width: number, height: number): TouchFaceLike;
  /** The pressed state. A control that does not visibly answer a thumb reads as a broken app. */
  setAlpha(alpha: number): TouchFaceLike;
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
