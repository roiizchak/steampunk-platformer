/**
 * A recording stand-in for the scene `TouchControlsLayer` draws into.
 *
 * The `enemy-feedback.test.ts` shape: implement exactly the Phaser surface the layer calls, record
 * every call worth asserting, and **throw on any path that should not be taken** so a silent
 * fallback cannot pass. Phaser is never imported, here or in the layer — which is what lets
 * criterion 12.15 run this suite with the engine uninstalled.
 */

import {
  GAMEOBJECT_POINTER_DOWN,
  INPUT_GAME_OUT,
  INPUT_POINTER_UP,
  INPUT_POINTER_UP_OUTSIDE,
} from '../../src/scenes/engineLiterals';
import type { TouchHeld } from '../../src/scenes/inputMerge';
import type {
  TouchFaceLike,
  TouchGameSceneLike,
  TouchSceneLike,
  TouchZoneLike,
} from '../../src/scenes/touchControlsLayer';
import type { TouchId } from '../../src/render/touchLayout';

/**
 * The emitter handler type the layer's `EmitterLike` declares.
 *
 * `never[]` is what lets a handler of ANY arity be registered — `never` is assignable to every
 * parameter type — which is exactly the latitude a real `EventEmitter` has. The cost is that the
 * fake cannot call one back without saying what it is dispatching, so the two dispatch helpers below
 * narrow at the call site. The cast lives here, in the thing that is pretending, and never in the
 * production layer.
 */
type Handler = (...args: never[]) => void;

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
  visible: boolean;
  destroyed: boolean;
}

export interface TouchSceneHarness {
  // Typed against the layer's own interfaces, so the fake cannot drift into implementing a surface
  // the production code does not have — or miss one it does.
  scene: TouchSceneLike;
  gameScene: TouchGameSceneLike;
  zones: ZoneFake[];
  faces: FaceFake[];
  /** Event names subscribed on the UI scene's own input plugin. */
  sceneEvents: string[];
  /** Event names subscribed on the bound `Game` scene. */
  gameSceneEvents: string[];
  /** Event names subscribed on the GAME emitter — the ones Phaser will not tear down. */
  gameEvents: string[];
  playerInputEnabled: boolean;
  gameStatusRunning: boolean;
  levelSelectOpened: number;
  /**
   * What the layer believed was held at the instant it called `disableInteractive`.
   *
   * The only way to observe the cancel-before-disable ORDER from outside the layer. If cancellation
   * ran first this is empty; if it ran second, the contact is still visible here.
   */
  heldAtDisable: TouchHeld | null;
  /** Read the layer's held state — installed by the harness once the layer exists. */
  readHeld: () => TouchHeld;
  press: (id: TouchId, pointerId: number) => void;
  releasePointer: (pointerId: number) => void;
  fireGameEvent: (name: string) => void;
  fireGameSceneEvent: (name: string) => void;
}

const GAME_WIDTH = 1920;
const GAME_HEIGHT = 1080;

export function makeTouchScene(): TouchSceneHarness {
  const zones: ZoneFake[] = [];
  const faces: FaceFake[] = [];
  const sceneEvents: string[] = [];
  const gameSceneEvents: string[] = [];
  const gameEvents: string[] = [];
  const sceneHandlers = new Map<string, Handler>();
  const gameHandlers = new Map<string, Handler>();
  const gameSceneHandlers = new Map<string, Handler>();

  const h: TouchSceneHarness = {
    scene: null as never,
    gameScene: null as never,
    zones,
    faces,
    sceneEvents,
    gameSceneEvents,
    gameEvents,
    playerInputEnabled: true,
    gameStatusRunning: true,
    levelSelectOpened: 0,
    heldAtDisable: null,
    readHeld: () => ({ left: false, right: false, jump: false }),
    press: () => {},
    releasePointer: () => {},
    fireGameEvent: () => {},
    fireGameSceneEvent: () => {},
  };

  const makeZone = (x: number, y: number, w: number, h2: number): ZoneFake & TouchZoneLike => {
    const z: ZoneFake = {
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
    };
    const api = {
      ...z,
      setName(name: string) {
        z.id = name;
        api.id = name;
        return api;
      },
      setOrigin(ox: number, oy?: number) {
        z.originX = ox;
        z.originY = oy ?? ox;
        api.originX = z.originX;
        api.originY = z.originY;
        return api;
      },
      setDepth(d: number) {
        z.depth = d;
        api.depth = d;
        return api;
      },
      setPosition(nx: number, ny: number) {
        z.x = nx;
        z.y = ny;
        api.x = nx;
        api.y = ny;
        return api;
      },
      setSize(nw: number, nh: number) {
        z.w = nw;
        z.h = nh;
        api.w = nw;
        api.h = nh;
        return api;
      },
      setInteractive() {
        z.interactive = true;
        api.interactive = true;
        return api;
      },
      disableInteractive() {
        // Snapshot what the layer thinks is held AT THIS INSTANT — see `heldAtDisable`.
        h.heldAtDisable = h.readHeld();
        z.interactive = false;
        api.interactive = false;
        return api;
      },
      on(event: string, fn: Handler) {
        z.events.push(event);
        z.handlers.set(event, fn);
        return api;
      },
      destroy() {
        z.destroyed = true;
        api.destroyed = true;
      },
    } as unknown as ZoneFake & TouchZoneLike;
    // Keep the recorded object and the API object the same identity for assertions.
    zones.push(api);
    return api;
  };

  const makeFace = (x: number, y: number): FaceFake & TouchFaceLike => {
    const api = {
      id: '',
      x,
      y,
      visible: true,
      destroyed: false,
      setName(name: string) {
        api.id = name;
        return api;
      },
      setOrigin() {
        return api;
      },
      setDepth() {
        return api;
      },
      setPosition(nx: number, ny: number) {
        api.x = nx;
        api.y = ny;
        return api;
      },
      setSize() {
        return api;
      },
      setDisplaySize() {
        return api;
      },
      setVisible(v: boolean) {
        api.visible = v;
        return api;
      },
      setStyle() {
        return api;
      },
      setFontSize() {
        return api;
      },
      destroy() {
        api.destroyed = true;
      },
    } as unknown as FaceFake & TouchFaceLike;
    faces.push(api);
    return api;
  };

  h.gameScene = {
    events: {
      on(event: string, fn: Handler) {
        gameSceneEvents.push(event);
        gameSceneHandlers.set(event, fn);
      },
      off(event: string) {
        const i = gameSceneEvents.indexOf(event);
        if (i >= 0) gameSceneEvents.splice(i, 1);
        gameSceneHandlers.delete(event);
      },
    },
  };

  h.scene = {
    add: {
      zone: (x: number, y: number, w: number, h2: number) => makeZone(x, y, w, h2),
      rectangle: (x: number, y: number) => makeFace(x, y),
      text: (x: number, y: number) => makeFace(x, y),
      image: () => {
        throw new Error(
          'add.image was called, but textures.exists() is false in this fake — the layer took the ' +
            'art path when no art is loaded, which would draw a green box in the shipped game.',
        );
      },
    },
    textures: { exists: () => false },
    input: {
      on(event: string, fn: Handler) {
        sceneEvents.push(event);
        sceneHandlers.set(event, fn);
      },
      off(event: string) {
        const i = sceneEvents.indexOf(event);
        if (i >= 0) sceneEvents.splice(i, 1);
        sceneHandlers.delete(event);
      },
    },
    events: {
      on() {},
      off() {},
    },
    game: {
      events: {
        on(event: string, fn: Handler) {
          gameEvents.push(event);
          gameHandlers.set(event, fn);
        },
        off(event: string) {
          const i = gameEvents.indexOf(event);
          if (i >= 0) gameEvents.splice(i, 1);
          gameHandlers.delete(event);
        },
      },
    },
    scale: {
      gameSize: { width: GAME_WIDTH, height: GAME_HEIGHT },
      displaySize: { width: GAME_WIDTH, height: GAME_HEIGHT },
    },
  } as unknown as TouchSceneHarness['scene'];

  h.press = (id, pointerId) => {
    const zone = zones.find((z) => z.id === id);
    if (!zone) throw new Error(`no zone for ${id} — the layer never created it`);
    const fn = zone.handlers.get(GAMEOBJECT_POINTER_DOWN);
    if (!fn) throw new Error(`${id} has no ${GAMEOBJECT_POINTER_DOWN} handler`);
    (fn as (pointer: { id: number }) => void)({ id: pointerId });
  };

  h.releasePointer = (pointerId) => {
    const fn = sceneHandlers.get(INPUT_POINTER_UP);
    if (!fn) throw new Error(`the layer never subscribed to the scene-level ${INPUT_POINTER_UP}`);
    (fn as (pointer: { id: number }) => void)({ id: pointerId });
  };

  h.fireGameEvent = (name) => {
    const fn = gameHandlers.get(name);
    if (!fn) throw new Error(`the layer never subscribed to ${name} on the game emitter`);
    (fn as () => void)();
  };

  h.fireGameSceneEvent = (name) => {
    const fn = gameSceneHandlers.get(name);
    if (!fn) throw new Error(`the layer never subscribed to ${name} on the Game scene`);
    (fn as () => void)();
  };

  // Referenced so the import is not merely decorative — these are the two names the layer must use
  // for a release, and the harness would silently accept the wrong one otherwise.
  void INPUT_POINTER_UP_OUTSIDE;
  void INPUT_GAME_OUT;

  return h;
}
