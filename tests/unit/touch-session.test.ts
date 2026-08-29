import { describe, expect, it } from 'vitest';

import { NO_TOUCH_HELD, type TouchHeld } from '../../src/scenes/inputMerge';
import type { TouchBinding } from '../../src/scenes/touchControlsLayer';
import { TouchSession, type TouchLayerLike } from '../../src/scenes/touchSession';

/**
 * **When the controls learn which `Game` scene they are driving.**
 *
 * ## The ordering problem this class exists for
 *
 * 🔴 `attachHud` runs BEFORE `UIScene.create()`, and `gameHud.ts:60-63` already says so in as many
 * words: *"`ui` has only been LAUNCHED — `UIScene.create()` has not run."* So a binding handed
 * straight to the controls layer would dereference a layer that does not exist yet, and
 * optional-chaining it away would silently skip the only binding there is and leave the first
 * level's controls inert. Named by the Codex plan review, round 2, as a BLOCKER.
 *
 * 🔴 And *"first launch is pending, relaunch is immediate"* — the obvious repair — is also wrong.
 * `ScenePlugin.launch` is `queueOp('start', …)` (`ScenePlugin.js:481-484`), **always** queued,
 * never a synchronous `create()`. Scene shutdown deliberately preserves the instance and its
 * references for reuse (`Systems.js:760-788`), so after a level-select round trip `UIScene` is the
 * *same object* still holding its old layer. Round 3, also a BLOCKER.
 *
 * So there is **one** path, not two: a binding is always stored, and applied when — or if — a layer
 * is active. Cold boot, level-to-level `scene.start('Game')` and the level-select return all take
 * it, and none of them depends on where an operation lands in Phaser's queue.
 */

/** Records what the layer was asked to do, and can be told to look destroyed. */
function fakeLayer(): TouchLayerLike & { bound: (TouchBinding | null)[]; refreshes: number; heldValue: TouchHeld } {
  const layer = {
    bound: [] as (TouchBinding | null)[],
    refreshes: 0,
    heldValue: { ...NO_TOUCH_HELD, right: true },
    bind(binding: TouchBinding | null) {
      layer.bound.push(binding);
    },
    refresh() {
      layer.refreshes += 1;
    },
    held() {
      return layer.heldValue;
    },
  };
  return layer;
}

function fakeBinding(tag: string): TouchBinding {
  return {
    input$: { tag } as never,
    gameScene: { events: { on() {}, off() {} } },
    isGameRunning: () => true,
    isPlayerInputEnabled: () => true,
    openLevelSelect: () => {},
  };
}

describe('TouchSession', () => {
  it('applies a binding that arrived BEFORE the layer existed', () => {
    // The cold-boot order: attachHud binds, and only then does UIScene.create() run.
    const session = new TouchSession();
    const binding = fakeBinding('cold');
    session.bind(binding);

    const layer = fakeLayer();
    session.activate(layer);

    expect(layer.bound, 'the pending binding never reached the layer').toEqual([binding]);
  });

  it('applies a binding that arrives AFTER the layer exists, without a second path', () => {
    const session = new TouchSession();
    const layer = fakeLayer();
    session.activate(layer);
    expect(layer.bound, 'activating with nothing pending must still clear the layer').toEqual([null]);

    const binding = fakeBinding('warm');
    session.bind(binding);
    expect(layer.bound.at(-1)).toBe(binding);
  });

  it('hands the layer the LATEST binding when several arrive before it exists', () => {
    const session = new TouchSession();
    session.bind(fakeBinding('level-01'));
    const latest = fakeBinding('level-02');
    session.bind(latest);

    const layer = fakeLayer();
    session.activate(layer);
    expect(layer.bound).toEqual([latest]);
  });

  it('stops writing to a layer that has been retired', () => {
    // 🔴 M2b. `UIScene`'s SHUTDOWN destroys the layer but Phaser KEEPS the scene instance
    // (`Systems.js:760-788`), so without this the session would go on driving a corpse.
    const session = new TouchSession();
    const layer = fakeLayer();
    session.activate(layer);
    const before = layer.bound.length;

    session.deactivate();
    session.bind(fakeBinding('after-shutdown'));
    session.refresh();

    expect(layer.bound.length, 'the retired layer was written to after deactivate').toBe(before);
    expect(layer.refreshes, 'the retired layer was refreshed after deactivate').toBe(0);
  });

  it('does not carry a pre-shutdown binding into the next activation', () => {
    // A binding names a specific `Game` scene and its `input$`. Re-applying yesterday's on a fresh
    // layer would point the controls at a scene that has been shut down.
    const session = new TouchSession();
    session.bind(fakeBinding('old'));
    session.activate(fakeLayer());
    session.deactivate();

    const next = fakeLayer();
    session.activate(next);
    expect(next.bound, 'a stale binding survived the shutdown').toEqual([null]);
  });

  it('reads held touch state through the layer, and reads NOTHING when there is none', () => {
    // The value `sampleHeldKeys` merges every frame. With no layer — desktop, or before create() —
    // it must be the all-false record, never undefined: the merge ORs it into the snapshot.
    const session = new TouchSession();
    expect(session.held()).toEqual(NO_TOUCH_HELD);

    const layer = fakeLayer();
    session.activate(layer);
    expect(session.held()).toEqual(layer.heldValue);

    session.deactivate();
    expect(session.held(), 'a retired layer still fed the sim').toEqual(NO_TOUCH_HELD);
  });

  it('forwards a refresh to the live layer', () => {
    const session = new TouchSession();
    const layer = fakeLayer();
    session.activate(layer);
    session.refresh();
    session.refresh();
    expect(layer.refreshes).toBe(2);
  });

  it('is safe to refresh or read before anything has been activated', () => {
    // UIScene.update() runs on the frame create() ran; nothing may throw on the way there.
    const session = new TouchSession();
    expect(() => session.refresh()).not.toThrow();
    expect(() => session.deactivate()).not.toThrow();
    expect(session.held()).toEqual(NO_TOUCH_HELD);
  });
});
