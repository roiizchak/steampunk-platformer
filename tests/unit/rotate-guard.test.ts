import { afterEach, describe, expect, it } from 'vitest';

import { attachRotatePrompt, type RotateGuardScene } from '../../src/scenes/rotateGuard';
import { SCENE_DESTROY, SCENE_SHUTDOWN, SCENE_UPDATE } from '../../src/scenes/engineLiterals';

/**
 * **The rotate guard's ATTACHMENT — what it subscribes to, and what each frame costs.**
 *
 * 🔴 `rotate-prompt.test.ts` drives `RotatePrompt` and `rotateOverlayWanted` — the prompt layer and
 * its predicate. `attachRotatePrompt` itself, which is where the listeners and the polling live,
 * had no gate at all: `rotateGuard.ts` claimed it "became unit-testable" and nothing tested it.
 * Codex implementation review, finding 1.
 *
 * The finding underneath: `refresh` is subscribed to `SCENE_UPDATE` and called
 * `scene.scale.refresh()` unconditionally, so **every frame** re-ran `updateScale()` (which writes
 * `canvas.style` and forces a layout through `getBoundingClientRect()`), `updateBounds()`,
 * `updateOrientation()` and a GLOBAL RESIZE emit. `UIScene.applyLayout` is one of the listeners
 * that fired: it destroys and recreates the gear-pop attachment and re-runs Phaser's `MeasureText`.
 * Per frame, for a size that had not moved.
 */

/** A scene that records what was subscribed and counts the engine re-measures. */
function makeGuardScene() {
  const handlers = new Map<string, (() => void)[]>();
  const scaleHandlers = new Map<string, (() => void)[]>();
  let refreshes = 0;

  const push = (m: Map<string, (() => void)[]>, e: string, fn: () => void): void => {
    m.set(e, [...(m.get(e) ?? []), fn]);
  };
  const drop = (m: Map<string, (() => void)[]>, e: string, fn: () => void): void => {
    m.set(e, (m.get(e) ?? []).filter((f) => f !== fn));
  };

  const scene = {
    events: {
      on: (e: string, fn: () => void) => push(handlers, e, fn),
      once: (e: string, fn: () => void) => push(handlers, e, fn),
      off: (e: string, fn: () => void) => drop(handlers, e, fn),
    },
    scale: {
      gameSize: { width: 1920, height: 1080 },
      displaySize: { width: 1920, height: 1080 },
      on: (e: string, fn: () => void) => push(scaleHandlers, e, fn),
      off: (e: string, fn: () => void) => drop(scaleHandlers, e, fn),
      refresh: () => {
        refreshes += 1;
      },
    },
  } as unknown as RotateGuardScene;

  return {
    scene,
    get refreshes() {
      return refreshes;
    },
    fire: (e: string) => {
      for (const fn of [...(handlers.get(e) ?? [])]) fn();
    },
    fireScale: (e: string) => {
      for (const fn of [...(scaleHandlers.get(e) ?? [])]) fn();
    },
    listeners: (e: string) => (handlers.get(e) ?? []).length,
    scaleListeners: (e: string) => (scaleHandlers.get(e) ?? []).length,
  };
}

/**
 * A viewport this test owns.
 *
 * The suite runs on the `node` environment (`vite.config.ts:129`), so there is no `window` — and
 * `viewportSize()` answers `[-1, -1]` there, which would make every frame look unchanged and the
 * assertion below unfalsifiable. Installing one is what lets a MOVE be distinguished from a
 * still frame.
 */
function installViewport(width: number, height: number): { set(w: number, h: number): void } {
  // `addEventListener`/`removeEventListener` are here because `domSubscriptions()` wires
  // `orientationchange` and `visualViewport` — the events Phaser does NOT listen to, and the
  // reason the owner's phone kept the overlay up through two repairs. A window without them
  // throws on attach, which is how this fake earned them.
  const w = {
    innerWidth: width,
    innerHeight: height,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Window & typeof globalThis;
  (globalThis as { window?: unknown }).window = w;
  return {
    set(nw: number, nh: number) {
      (w as unknown as { innerWidth: number; innerHeight: number }).innerWidth = nw;
      (w as unknown as { innerWidth: number; innerHeight: number }).innerHeight = nh;
    },
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('the rotate guard polls every frame, and the poll is cheap', () => {
  it('re-measures the engine ONCE for a viewport that never moves', () => {
    const view = installViewport(900, 405);
    const h = makeGuardScene();
    attachRotatePrompt(h.scene, true, []);

    // The first poll always pays: nothing has been seen yet, and the engine's cached CSS size is
    // exactly what was stale through a rotation.
    h.fire(SCENE_UPDATE);
    const afterFirst = h.refreshes;
    expect(afterFirst, 'the first poll never re-measured the engine at all').toBe(1);

    // 🔴 Sixty more frames at the same size. Unguarded this was 61 global RESIZE emits, each one
    // re-running every scale listener in the game.
    for (let i = 0; i < 60; i += 1) h.fire(SCENE_UPDATE);
    expect(
      h.refreshes - afterFirst,
      'the frame poll re-measures the ScaleManager on a size that did not change — that emits a ' +
        'global RESIZE every frame, and UIScene.applyLayout re-runs MeasureText on each one',
    ).toBe(0);

    // And it still notices a real move, which is the whole reason the poll exists: iOS Safari does
    // not reliably fire `window.resize` on a rotation or when its toolbars slide.
    view.set(405, 900);
    h.fire(SCENE_UPDATE);
    expect(h.refreshes - afterFirst, 'the poll stopped noticing a rotation').toBe(1);
  });

  it('subscribes to the frame, to the scale, and retires on BOTH lifecycle events', () => {
    installViewport(900, 405);
    const h = makeGuardScene();
    attachRotatePrompt(h.scene, true, []);

    expect(h.listeners(SCENE_UPDATE), 'nothing polls the viewport').toBe(1);
    expect(h.scaleListeners('resize'), 'the guard ignores the engine\'s own resize').toBe(1);
    expect(h.listeners(SCENE_SHUTDOWN)).toBe(1);
    // A ScaleManager listener is GAME-global: removing an active scene reaches DESTROY without
    // ever reaching SHUTDOWN, and a guard subscribed to only one of the two outlives its scene.
    expect(h.listeners(SCENE_DESTROY), 'the guard does not retire on DESTROY').toBe(1);

    h.fire(SCENE_SHUTDOWN);
    expect(h.listeners(SCENE_UPDATE), 'the frame poll survived the shutdown').toBe(0);
    expect(h.scaleListeners('resize'), 'the scale listener survived the shutdown').toBe(0);
  });

  it('does nothing at all on a device with no touch', () => {
    installViewport(1920, 1080);
    const h = makeGuardScene();
    attachRotatePrompt(h.scene, false, []);

    for (let i = 0; i < 10; i += 1) h.fire(SCENE_UPDATE);
    // Criterion 12.7: desktop gains nothing. The overlay cannot be shown there, so the engine must
    // never be re-measured on its account either.
    expect(h.refreshes, 'the guard re-measures the engine on a desktop, where it draws nothing')
      .toBe(0);
  });
});
