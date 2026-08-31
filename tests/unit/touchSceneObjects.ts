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
  alpha: number;
  angle: number;
  strokeWidth: number;
  strokeColor: number;
  fontSize: number;
  /** Zero until something sets it — the rotate prompt's copy is the only thing that wraps. */
  wrapWidth: number;
  align: string;
  /** The texture an `add.image` face was built from. Empty for every drawn shape. */
  textureKey: string;
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
): (x: number, y: number, w?: number, h2?: number, fillAlpha?: number) => FaceFake & TouchFaceLike {
  // 🔴 `fillAlpha` is recorded from the CONSTRUCTOR, not left at 1 until something calls
  // `setAlpha`. Production sets a plate's translucency in the `add.rectangle` call, so a fake
  // that ignored the argument reported every plate fully opaque — and the gate that pins the
  // plate's alpha would have measured the fake's default instead of the layer's choice.
  return (x: number, y: number, w = 0, h2 = 0, fillAlpha = 1): FaceFake & TouchFaceLike => {
  const api = {
    id: '',
    x,
    y,
    w,
    h: h2,
    visible: true,
    destroyed: false,
    depth: 0,
    alpha: fillAlpha,
    angle: 0,
    strokeWidth: 0,
    strokeColor: 0,
    fontSize: 0,
    wrapWidth: 0,
    align: '',
    textureKey: '',
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
    destroy() {
      api.destroyed = true;
    },
  } as unknown as FaceFake & TouchFaceLike;
    faces.push(api);
    return api;
  };
}
