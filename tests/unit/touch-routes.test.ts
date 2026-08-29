import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { SCENE_DESTROY, SCENE_SHUTDOWN } from '../../src/scenes/engineLiterals';
import { attachTapRoutes } from '../../src/scenes/touchRoutes';
import { makeTouchScene, type TouchSceneHarness } from './touchSceneFake';

/**
 * **The three screens a phone player cannot get past without this.**
 *
 * 🔴 The whole game outside the play scene is keyboard-only, confirmed at `TitleScene.ts:333-335`
 * (`Enter` / `NumpadEnter` / `Space`), `LevelSelectScene.ts:145-167` (`UP W DOWN S ENTER`) and
 * `gameComplete.ts:119-135` (`ANY_KEY_DOWN` filtered to `Enter`). Shipping in-play controls alone
 * would produce a phone build that still cannot be started — and a criterion "the owner played it
 * on a phone" that can only be passed by reaching for a keyboard. Named by the Codex plan review,
 * round 1, as its first BLOCKER.
 *
 * This file is the one mechanism all three use: a zone per target, a callback carrying the target's
 * id, and a teardown registered against the scene that owns it.
 *
 * ## Why the teardown is not optional
 *
 * `gameComplete`'s panel lives while `UIScene` — which SURVIVES the level-to-level
 * `scene.start('Game')` (`gameHud.ts:49-52`) — is still up. A zone that outlived its panel would sit
 * invisible over the next level, one tap from skipping it. So every zone is registered against both
 * SHUTDOWN and DESTROY of the scene it was drawn on, and `destroy()` is idempotent.
 *
 * ## 🔴 And why a route is dead while the rotate prompt is up
 *
 * The QA gate's adversarial code review found a shipped defect here: the prompt draws at depth 3000
 * and these zones were interactive from creation until `destroy()`, with no gate at all. On a phone
 * held upright, a tap on "ROTATE YOUR DEVICE" started the level underneath it. The five play
 * controls were never exposed — `touchControlsLayer.refresh()` gates them on `touchTargetsFit` —
 * which is exactly why the claim in `rotatePrompt.ts`'s header read as true.
 */

const RECTS = [
  { id: 'a', x: 100, y: 100, w: 400, h: 200 },
  { id: 'b', x: 100, y: 400, w: 400, h: 200 },
];

function scene(): TouchSceneHarness {
  const h = makeTouchScene();
  h.scene.scale.gameSize = { width: GAME_WIDTH, height: GAME_HEIGHT };
  return h;
}

describe('attachTapRoutes', () => {
  it('draws nothing on a device with no touch, so a desktop pointer hits nothing', () => {
    const h = scene();
    const taps: string[] = [];
    const routes = attachTapRoutes(h.scene, false, RECTS, (id) => taps.push(id));
    expect(h.zones, 'a desktop got hit areas it can never need').toEqual([]);
    expect(h.ownEvents, 'a teardown was registered for objects that do not exist').toEqual([]);
    routes.destroy();
  });

  it('makes one interactive zone per target, at the target', () => {
    const h = scene();
    attachTapRoutes(h.scene, true, RECTS, () => {});
    expect(h.zones.map((z) => z.id)).toEqual(['a', 'b']);
    for (const [i, z] of h.zones.entries()) {
      expect([z.x, z.y, z.w, z.h], `${z.id} is not where the layout put it`).toEqual([
        RECTS[i].x,
        RECTS[i].y,
        RECTS[i].w,
        RECTS[i].h,
      ]);
      expect(z.originX, 'a zone placed from its centre lands half a box off').toBe(0);
      expect(z.originY).toBe(0);
      expect(z.interactive, `${z.id} is drawn but cannot be tapped`).toBe(true);
    }
  });

  it('reports WHICH target was tapped, so a level row can name its level', () => {
    const h = scene();
    const taps: string[] = [];
    attachTapRoutes(h.scene, true, RECTS, (id) => taps.push(id));
    h.press('b' as never, 1);
    h.press('a' as never, 2);
    expect(taps).toEqual(['b', 'a']);
  });

  it('fires once per press, not once per pointer already down', () => {
    // A second finger landing while the first is still down must not double-advance a screen whose
    // action is `scene.start`.
    const h = scene();
    let count = 0;
    attachTapRoutes(h.scene, true, RECTS, () => {
      count += 1;
    });
    h.press('a' as never, 1);
    h.press('a' as never, 1);
    expect(count, 'the same pointer pressed twice ran the route twice').toBe(1);
  });

  it('tears itself down on the drawing scene SHUTDOWN and on DESTROY', () => {
    // 🔴 The completion panel's zone must not outlive its panel: `UIScene` survives the
    // level-to-level `scene.start('Game')`, and an invisible zone over the next level is one tap
    // from skipping it.
    const h = scene();
    const taps: string[] = [];
    attachTapRoutes(h.scene, true, RECTS, (id) => taps.push(id));
    expect(h.ownEvents.sort()).toEqual([SCENE_DESTROY, SCENE_SHUTDOWN].sort());
    h.fireOwnEvent(SCENE_SHUTDOWN);
    for (const z of h.zones) expect(z.destroyed, `${z.id} outlived its scene`).toBe(true);
    expect(taps).toEqual([]);
  });

  it('stops calling back once destroyed, even if a press still arrives', () => {
    const h = scene();
    const taps: string[] = [];
    const routes = attachTapRoutes(h.scene, true, RECTS, (id) => taps.push(id));
    routes.destroy();
    h.press('a' as never, 1);
    expect(taps, 'a destroyed route still ran its action').toEqual([]);
  });

  it('is safe to destroy twice', () => {
    const h = scene();
    const routes = attachTapRoutes(h.scene, true, RECTS, () => {});
    routes.destroy();
    expect(() => routes.destroy()).not.toThrow();
  });

  it('draws nothing for an empty target list rather than one zero-sized zone', () => {
    const h = scene();
    attachTapRoutes(h.scene, true, [], () => {});
    expect(h.zones).toEqual([]);
  });
});

describe('a tap route is dead on the frames the rotate prompt covers the screen', () => {
  /** Phone portrait: 390 CSS px of canvas for 1920 game px, a scale of 0.203. */
  const PORTRAIT = 390;

  it('ignores a press while the prompt would be up, so the prompt cannot be tapped through', () => {
    const h = scene();
    const taps: string[] = [];
    attachTapRoutes(h.scene, true, RECTS, (id) => taps.push(id));

    // Landscape first, so the assertion below is about the SCALE and not about a route that never
    // worked at all.
    h.scene.scale.displaySize.width = GAME_WIDTH;
    h.press('a' as never, 1);
    expect(taps, 'the route never fired even in landscape — this test proves nothing').toEqual(['a']);
    h.releasePointer(1);

    h.scene.scale.displaySize.width = PORTRAIT;
    h.press('a' as never, 2);
    expect(
      taps,
      'a tap landed on a level row while the rotate prompt was covering it',
    ).toEqual(['a']);
  });

  it('comes back the moment the device is turned, without anything being rebuilt', () => {
    const h = scene();
    const taps: string[] = [];
    attachTapRoutes(h.scene, true, RECTS, (id) => taps.push(id));

    h.scene.scale.displaySize.width = PORTRAIT;
    h.press('b' as never, 1);
    h.releasePointer(1);
    expect(taps).toEqual([]);

    h.scene.scale.displaySize.width = GAME_WIDTH;
    h.press('b' as never, 2);
    expect(taps, 'the route stayed dead after the device was turned back').toEqual(['b']);
  });
});
