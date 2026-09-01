/**
 * **Every screen with its own tap routes keeps them on the live view.**
 *
 * 🔴 Under `Phaser.Scale.FIT` the view could not change while a screen was up, so `attachTapRoutes`
 * building its zones once was the whole truth. The filled view (2026-09-01) makes a rotation
 * or a fullscreen toggle re-lay-out the screen, and a stale zone then sits where a button used to
 * be — a tap that does nothing, with nothing on screen to explain it.
 *
 * ## Two halves, and neither can make the other's claim
 *
 * `keepTapRoutesSized` is driven behaviourally below: it is engine-free (a structural scene type,
 * no Phaser import), so it can be constructed under `environment: 'node'` and run for real.
 *
 * ⚠️ **But a working helper with a missing CALLER draws exactly nothing**, and that is the defect
 * this file mainly exists for. The Codex plan review, round 3: *"M118 mutates only the helper, so
 * deleting one caller's update wiring could remain green."* The three screens are checked by source
 * text — `TitleScene` and `LevelSelectScene` value-import Phaser and cannot be constructed here —
 * and each is its own case, so one caller reverting cannot hide behind another.
 */

import { describe, expect, it } from 'vitest';

import { keepTapRoutesSized } from '../../src/scenes/tapRouteResize';
import { SCENE_DESTROY, SCENE_SHUTDOWN } from '../../src/scenes/engineLiterals';
import type { TapRoutes } from '../../src/scenes/touchRoutes';

function fakeScene() {
  const handlers: (() => void)[] = [];
  const once: { name: string; fn: () => void }[] = [];
  const gameSize = { width: 1920, height: 1080 };
  return {
    gameSize,
    once,
    listeners: () => handlers.length,
    resize(width: number, height: number) {
      gameSize.width = width;
      gameSize.height = height;
      for (const fn of [...handlers]) fn();
    },
    scene: {
      scale: {
        gameSize,
        on(event: string, fn: () => void) {
          if (event === 'resize') handlers.push(fn);
        },
        off(event: string, fn: () => void) {
          if (event !== 'resize') return;
          const i = handlers.indexOf(fn);
          if (i >= 0) handlers.splice(i, 1);
        },
      },
      events: {
        once(name: string, fn: () => void) {
          once.push({ name, fn });
        },
      },
    },
  };
}

function fakeRoutes(): TapRoutes & { updates: number } {
  const routes = {
    updates: 0,
    updateTargets() {
      routes.updates += 1;
    },
    destroy() {},
  };
  return routes;
}

describe('keepTapRoutesSized', () => {
  it('rewrites the boxes and tells the routes, on every resize', () => {
    const h = fakeScene();
    const routes = fakeRoutes();
    const box = { id: 'a', x: 0, y: 0, w: 1920, h: 1080 };
    keepTapRoutesSized(h.scene, routes, ({ width, height }) => {
      box.w = width;
      box.h = height;
    });

    expect(routes.updates, 'it fired before any resize').toBe(0);
    h.resize(2400, 1080);
    expect(box.w, 'the box kept the old width').toBe(2400);
    expect(routes.updates, 'the zones were never told to move').toBe(1);
  });

  it('unsubscribes on SHUTDOWN and on DESTROY, and is idempotent', () => {
    for (const event of [SCENE_SHUTDOWN, SCENE_DESTROY]) {
      const h = fakeScene();
      const routes = fakeRoutes();
      keepTapRoutesSized(h.scene, routes, () => {});
      expect(h.listeners(), 'nothing subscribed — this case would prove nothing').toBe(1);
      // Both handlers are registered; firing either must clear the global subscription, because
      // `SceneManager.remove()` reaches DESTROY without ever emitting SHUTDOWN.
      h.once.find((l) => l.name === event)?.fn();
      expect(h.listeners(), `a ScaleManager listener survived ${event}`).toBe(0);
      h.once.forEach((l) => l.fn());
      expect(h.listeners()).toBe(0);
    }
  });

  it('stops updating once torn down', () => {
    const h = fakeScene();
    const routes = fakeRoutes();
    keepTapRoutesSized(h.scene, routes, () => {});
    h.once.find((l) => l.name === SCENE_SHUTDOWN)?.fn();
    h.resize(2400, 1080);
    expect(routes.updates, 'a torn-down attachment still moved the zones').toBe(0);
  });
});

describe('every screen with its own routes is wired to the helper', () => {
  const SOURCES = import.meta.glob(
    [
      '../../src/scenes/TitleScene.ts',
      '../../src/scenes/LevelSelectScene.ts',
      '../../src/scenes/gameComplete.ts',
    ],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>;

  function code(file: string): string {
    const key = Object.keys(SOURCES).find((k) => k.endsWith(file));
    if (key === undefined) throw new Error(`${file} is not in the glob — this gate scans nothing`);
    return SOURCES[key]!.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it.each([['TitleScene.ts'], ['LevelSelectScene.ts'], ['gameComplete.ts']])(
    '%s calls keepTapRoutesSized for the routes it attaches',
    (file) => {
      const src = code(file);
      // ⚠️ A word-boundary scan, NOT `toContain`. The first version of this gate used
      // `toContain('keepTapRoutesSized(')` and stayed green through its own mutation, because
      // renaming the call to `NOT_CALLED_keepTapRoutesSized(` still CONTAINS that substring. A gate
      // that cannot go red is decoration *(C2)* — caught by running the mutation it names.
      const calls = (name: string): number => {
        // Escape-free on purpose: counting an identifier followed by `(` needs no regex, and every
        // attempt to write one through this project's shells mangled the backslash.
        let n = 0;
        for (let at = src.indexOf(name + '('); at !== -1; at = src.indexOf(name + '(', at + 1)) {
          const prev = at === 0 ? '' : src[at - 1]!;
          if (!/[A-Za-z0-9_$]/.test(prev)) n += 1;
        }
        return n;
      };
      expect(calls('attachTapRoutes'), `${file} attaches no tap routes — this gate scans nothing`)
        .toBeGreaterThan(0);
      expect(
        calls('keepTapRoutesSized'),
        `${file} attaches routes but never re-sizes them: its zones go stale on the first rotation`,
      ).toBeGreaterThan(0);
    },
  );
});
