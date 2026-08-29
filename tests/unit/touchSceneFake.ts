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
import type { TouchGameSceneLike, TouchSceneLike } from '../../src/scenes/touchControlsLayer';
import type { TapSceneLike } from '../../src/scenes/touchRoutes';
import type { TouchId } from '../../src/render/touchLayout';
import {
  type FaceFake,
  makeFaceFactory,
  makeZoneFactory,
  type ZoneFake,
} from './touchSceneObjects';

export type { FaceFake, ZoneFake } from './touchSceneObjects';

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

export interface TouchSceneHarness {
  // Typed against the layer's own interfaces, so the fake cannot drift into implementing a surface
  // the production code does not have — or miss one it does.
  // Both, because one fake drives the controls layer AND the tap routes — and the two name
  // DIFFERENT slices of a scene on purpose. The layer never touches its own scene emitter; the
  // routes do, because that is how they learn they are going away.
  scene: TouchSceneLike & TapSceneLike;
  gameScene: TouchGameSceneLike;
  zones: ZoneFake[];
  faces: FaceFake[];
  /** Event names subscribed on the UI scene's own input plugin. */
  sceneEvents: string[];
  /** Event names subscribed on the bound `Game` scene. */
  gameSceneEvents: string[];
  /** Event names subscribed on the GAME emitter — the ones Phaser will not tear down. */
  gameEvents: string[];
  /** Event names subscribed on the drawing scene's OWN emitter — how a tap route tears itself down. */
  ownEvents: string[];
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
  fireOwnEvent: (name: string) => void;
  /** A release delivered as POINTER_UP_OUTSIDE rather than POINTER_UP. */
  releasePointerOutside: (pointerId: number) => void;
  /** Any scene-input-plugin event, by name — GAME_OUT among them. */
  fireSceneInputEvent: (name: string) => void;
}

const GAME_WIDTH = 1920;
const GAME_HEIGHT = 1080;

export function makeTouchScene(): TouchSceneHarness {
  const zones: ZoneFake[] = [];
  const faces: FaceFake[] = [];
  const sceneEvents: string[] = [];
  const gameSceneEvents: string[] = [];
  const gameEvents: string[] = [];
  const ownEvents: string[] = [];
  const ownHandlers = new Map<string, Handler>();
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
    ownEvents,
    playerInputEnabled: true,
    gameStatusRunning: true,
    levelSelectOpened: 0,
    heldAtDisable: null,
    readHeld: () => ({ left: false, right: false, jump: false }),
    press: () => {},
    releasePointer: () => {},
    fireGameEvent: () => {},
    fireGameSceneEvent: () => {},
    fireOwnEvent: () => {},
    releasePointerOutside: () => {},
    fireSceneInputEvent: () => {},
  };

  const makeZone = makeZoneFactory(zones, h);
  const makeFace = makeFaceFactory(faces);

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
      rectangle: (x: number, y: number, w: number, h2: number, _fill?: number, a?: number) =>
        makeFace(x, y, w, h2, a),
      text: (x: number, y: number) => makeFace(x, y),
      triangle: (_x: number, _y: number, x1: number, y1: number) => makeFace(x1, y1),
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
      on(event: string, fn: Handler) {
        ownEvents.push(event);
        ownHandlers.set(event, fn);
      },
      off(event: string) {
        const i = ownEvents.indexOf(event);
        if (i >= 0) ownEvents.splice(i, 1);
        ownHandlers.delete(event);
      },
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
    // 🔴 A disabled zone gets no pointer. Without this the fake let `disableInteractive()` be a
    // complete no-op in production and every unit case still passed, carried by the `isLive`
    // belt inside the handler — the belt being the only thing a test could see.
    if (!zone.interactive) return;
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

  h.fireOwnEvent = (name) => {
    const fn = ownHandlers.get(name);
    if (!fn) throw new Error(`nothing subscribed to ${name} on the drawing scene`);
    (fn as () => void)();
  };

  // 🔴 These two used to be `void` statements under a comment claiming they stopped the harness
  // silently accepting the wrong event name. A `void` expression enforces nothing, and the
  // comment said the opposite of the truth. They are dispatchers now, so the two loss paths can
  // be fired and OBSERVED rather than merely found in an array of strings.
  h.releasePointerOutside = (pointerId) => {
    const fn = sceneHandlers.get(INPUT_POINTER_UP_OUTSIDE);
    if (!fn) throw new Error(`the layer never subscribed to ${INPUT_POINTER_UP_OUTSIDE}`);
    (fn as (pointer: { id: number }) => void)({ id: pointerId });
  };

  h.fireSceneInputEvent = (name) => {
    const fn = sceneHandlers.get(name);
    if (!fn) throw new Error(`the layer never subscribed to ${name} on the scene input plugin`);
    (fn as () => void)();
  };
  void INPUT_GAME_OUT;

  return h;
}
