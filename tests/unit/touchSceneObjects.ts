/**
 * The two recording game objects the touch scene fake hands out.
 *
 * Split from `touchSceneFake.ts` at the 400-line ceiling. They are factories rather than plain
 * constructors because each one appends to the harness's own array as it builds — that array is
 * what every assertion reads.
 */

import type { TouchHeld } from '../../src/scenes/inputMerge';
import type { TouchFaceLike, TouchZoneLike } from '../../src/scenes/touchControlsLayer';

/** An interactive hit zone. `id` is stamped on by the layer via `setName`. */
export interface ZoneFake {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  originX: number;
  originY: number;
  depth: number;
  interactive: boolean;
  events: string[];
  handlers: Map<string, Handler>;
  destroyed: boolean;
}

/** Anything the player can see: the art plate, or the grey-box rectangle and its glyph. */
export interface FaceFake {
  id: string;
  x: number;
  y: number;
  /** Zero for a text glyph, which is sized by its own content. */
  w: number;
  h: number;
  visible: boolean;
  destroyed: boolean;
  /** Recorded, because a depth nothing reads is a depth nothing gates. */
  depth: number;
  /**
   * The Alpha component's opacity — what `setAlpha` writes, and what an `Image` face uses.
   *
   * 🔴 Kept SEPARATE from `fillAlpha`, and it was not always. This fake recorded
   * `add.rectangle`'s 6th argument straight into `alpha`, so a gate asserting `plate.alpha === 0`
   * passed here while the real object's `alpha` stayed 1 — a fake-only green. Phaser distinguishes
   * the two; so does this. Caught by the Codex plan review, round 2.
   */
  alpha: number;
  /** A `Shape`'s fill opacity: `add.rectangle`'s 6th argument, or `setFillStyle`'s 2nd. */
  fillAlpha: number;
  angle: number;
  strokeWidth: number;
  strokeColor: number;
  fontSize: number;
  /** Zero until something sets it — the rotate prompt's copy is the only thing that wraps. */
  wrapWidth: number;
  align: string;
  /** The texture an `add.image` face was built from. Empty for every drawn shape. */
  textureKey: string;
  /**
   * A `Text` face's string, from `add.text`'s third argument.
   *
   * 🔴 The fake used to DROP that argument. `paintLevelButton` replaced the old `"> "` selection
   * prefix precisely by never calling `setText`, and "the label is byte-identical in both states"
   * cannot be asserted against a fake that never recorded a label at all.
   */
  text: string;
  /** A `Text` face's ink, from `setColor`. Empty until something sets it. */
  colour: string;
}

/** The emitter handler type the layer's `EmitterLike` declares. See `touchSceneFake.ts`. */
type Handler = (...args: never[]) => void;

export function makeZoneFactory(
  zones: ZoneFake[],
  h: { heldAtDisable: TouchHeld | null; readHeld: () => TouchHeld },
): (x: number, y: number, w: number, h2: number) => ZoneFake & TouchZoneLike {
  return (x: number, y: number, w: number, h2: number): ZoneFake & TouchZoneLike => {
  const api = {
    id: '',
    x,
    y,
    w,
    h: h2,
    originX: 0.5,
    originY: 0.5,
    depth: 0,
    interactive: false,
    events: [],
    handlers: new Map(),
    destroyed: false,
    setName(name: string) {
      api.id = name;
      return api;
    },
    setOrigin(ox: number, oy?: number) {
      api.originX = ox;
      api.originY = oy ?? ox;
      return api;
    },
    setDisplaySize(nw: number, nh: number) {
      api.w = nw;
      api.h = nh;
      return api;
    },
    setDepth(d: number) {
      api.depth = d;
      return api;
    },
    setPosition(nx: number, ny: number) {
      api.x = nx;
      api.y = ny;
      return api;
    },
    setSize(nw: number, nh: number) {
      api.w = nw;
      api.h = nh;
      return api;
    },
    setScrollFactor() {
      return api;
    },
    setInteractive() {
      api.interactive = true;
      return api;
    },
    disableInteractive() {
      // Snapshot what the layer thinks is held AT THIS INSTANT — see `heldAtDisable`.
      h.heldAtDisable = h.readHeld();
      api.interactive = false;
      return api;
    },
    on(event: string, fn: Handler) {
      api.events.push(event);
      api.handlers.set(event, fn);
      return api;
    },
    destroy() {
      api.destroyed = true;
    },
  } as unknown as ZoneFake & TouchZoneLike;
    // One object, not two. It used to keep a shadow `z` beside `api` and write every mutation
    // to both, while only `api` was ever pushed or read — half the setter bodies were dead.
    zones.push(api);
    return api;
  };
}

export function makeFaceFactory(
  faces: FaceFake[],
): (
  x: number,
  y: number,
  w?: number,
  h2?: number,
  fillAlpha?: number,
  isShape?: boolean,
) => FaceFake & TouchFaceLike {
  // 🔴 `fillAlpha` is recorded from the CONSTRUCTOR, not left at 1 until something calls
  // `setAlpha`. Production sets a plate's translucency in the `add.rectangle` call, so a fake
  // that ignored the argument reported every plate fully opaque — and the gate that pins the
  // plate's alpha would have measured the fake's default instead of the layer's choice.
  return (
    x: number,
    y: number,
    w = 0,
    h2 = 0,
    fillAlpha = 1,
    isShape = false,
  ): FaceFake & TouchFaceLike => {
  const api = {
    id: '',
    x,
    y,
    w,
    h: h2,
    visible: true,
    destroyed: false,
    depth: 0,
    alpha: 1,
    fillAlpha,
    angle: 0,
    strokeWidth: 0,
    strokeColor: 0,
    fontSize: 0,
    wrapWidth: 0,
    align: '',
    textureKey: '',
    text: '',
    colour: '',
    setName(name: string) {
      api.id = name;
      return api;
    },
    setOrigin() {
      return api;
    },
    setDepth(d: number) {
      api.depth = d;
      return api;
    },
    setPosition(nx: number, ny: number) {
      api.x = nx;
      api.y = ny;
      return api;
    },
    setSize(nw: number, nh: number) {
      api.w = nw;
      api.h = nh;
      return api;
    },
    setDisplaySize(nw: number, nh: number) {
      api.w = nw;
      api.h = nh;
      return api;
    },
    setVisible(v: boolean) {
      api.visible = v;
      return api;
    },
    setAlpha(a: number) {
      api.alpha = a;
      return api;
    },
    /**
     * 🔴 **Deleted below for non-shapes, and that is the point of the flag.**
     *
     * `paintPlate` feature-detects this method to tell a `Shape` from an `Image`. A fake that
     * hands it to every face makes the art arm take the fill branch — so the gate proving the art
     * responds to a thumb went green while measuring a number production never writes. A fake
     * whose objects have MORE API than the real ones is not a neutral convenience; it silently
     * re-routes the code under test.
     */
    setFillStyle(_color: number, a: number) {
      api.fillAlpha = a;
      return api;
    },
    setAngle(deg: number) {
      api.angle = deg;
      return api;
    },
    setStrokeStyle(width: number, color: number) {
      api.strokeWidth = width;
      api.strokeColor = color;
      return api;
    },
    setFontSize(size: number) {
      api.fontSize = size;
      return api;
    },
    setWordWrapWidth(width: number) {
      api.wrapWidth = width;
      return api;
    },
    setAlign(align: string) {
      api.align = align;
      return api;
    },
    setColor(colour: string) {
      api.colour = colour;
      return api;
    },
    /**
     * 🔴 Recorded, and the fake had neither this nor `FaceFake.text` until 2026-09-01. The
     * level-select gate asserts that repainting a row does NOT change its label — and a fake with
     * no `setText` makes that assertion unfalsifiable: the mutation that re-introduces the old
     * `"> "` prefix calls a method that is not there, and the gate passes through its own defect.
     */
    setText(text: string) {
      api.text = text;
      return api;
    },
    destroy() {
      api.destroyed = true;
    },
  } as unknown as FaceFake & TouchFaceLike;
    // Only a `Shape` has a fill. An `Image` and a `Text` do not, and `paintPlate` reads exactly
    // that difference to decide between `setFillStyle` and `setAlpha`.
    if (!isShape) delete (api as { setFillStyle?: unknown }).setFillStyle;
    faces.push(api);
    return api;
  };
}
