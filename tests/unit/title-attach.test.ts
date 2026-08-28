import { beforeEach, describe, expect, it } from 'vitest';

import type Phaser from 'phaser';

import { TITLE_KEY, attachTitle, resetTitleLatch } from '../../src/scenes/gameTitle';
import type { TitleSceneData } from '../../src/scenes/TitleScene';

/**
 * # `attachTitle` driven against a fake `ScenePlugin` — criterion 11.14
 *
 * ## Why this file exists
 *
 * `attachTitle` has **three** branches — relaunch-suppressed, already-active-so-re-pause, and the
 * first attach — and until now every one of them was reachable only from a browser. The criterion
 * 11.14 review found that, and found the matching smell beside it: `resetTitleLatch` carried the
 * docstring *"Test seam: reset the page-lifetime latch"* while **nothing imported it**. A seam with
 * no consumer is the same defect as a decision function with no consumer — it satisfies every claim
 * about itself and holds nothing up.
 *
 * ## Why it can be a unit test at all
 *
 * `gameTitle.ts` takes Phaser as a **type-only** import, so it runs end to end against a fake — the
 * `enemy-feedback.test.ts` idiom, and the stronger of the two draw-path shapes. It could not before:
 * it value-imported `TITLE_KEY` from `TitleScene.ts`, which value-imports the engine. The key moved
 * to `gameTitle.ts` for exactly this reason and `TitleScene` re-exports it.
 *
 * ## What the fake has to model faithfully
 *
 * Only that `pause()` with no argument pauses the scene the plugin belongs to, and that `isActive`
 * answers about a named scene. The queueing `SceneManager` does is deliberately NOT modelled — the
 * ordering claim it settles ("launch and pause drain in the same pass") is an engine fact, asserted
 * in `phase-11-welcome.spec.ts` against the real thing. This file holds the branch logic.
 */

interface FakePlugin {
  calls: string[];
  active: Set<string>;
  launched: TitleSceneData[];
}

function fakeScene(activeKeys: string[] = []): { scene: Phaser.Scene; plugin: FakePlugin } {
  const plugin: FakePlugin = { calls: [], active: new Set(activeKeys), launched: [] };
  const scenePlugin = {
    isActive: (key: string) => plugin.active.has(key),
    pause: () => {
      plugin.calls.push('pause');
    },
    resume: () => {
      plugin.calls.push('resume');
    },
    launch: (key: string, data: TitleSceneData) => {
      plugin.calls.push(`launch:${key}`);
      plugin.active.add(key);
      plugin.launched.push(data);
    },
  };
  return { scene: { scene: scenePlugin } as unknown as Phaser.Scene, plugin };
}

const noAudio = (): undefined => undefined;
const noop = (): void => {};

describe('attachTitle', () => {
  // 🔴 The latch is module scope and PAGE-lifetime by design, so it leaks between tests unless it is
  // reset. That is the seam earning its keep rather than sitting unused.
  beforeEach(() => {
    resetTitleLatch();
  });

  it('the first attach launches the title AND pauses the game underneath it', () => {
    const { scene, plugin } = fakeScene();

    attachTitle(scene, noAudio, noop);

    expect(plugin.calls, 'launch must come first, so the pause is queued against a live scene').toEqual([
      `launch:${TITLE_KEY}`,
      'pause',
    ]);
  });

  it('a second attach with the title already gone does NOTHING', () => {
    const { scene, plugin } = fakeScene();
    attachTitle(scene, noAudio, noop);
    plugin.active.delete(TITLE_KEY);
    plugin.calls.length = 0;

    attachTitle(scene, noAudio, noop);

    // The failure this forbids: a mid-session `Game` restart reopening the welcome screen. The
    // lifecycle suite and `phase-07-audio-adopt.spec.ts` both restart `Game` with no data.
    expect(plugin.calls, 'once per page load').toEqual([]);
  });

  it('a restart WHILE the title is up re-pauses the new game and does not stack a second title', () => {
    const { scene, plugin } = fakeScene([TITLE_KEY]);

    attachTitle(scene, noAudio, noop);

    // 🔴 The branch that keeps the pause invariant. Suppressing the relaunch and stopping there
    // would leave a stale title drawn over a newly RUNNING level — a player reading a title screen
    // over a game that is quietly killing them.
    expect(plugin.calls).toEqual(['pause']);
    expect(plugin.launched, 'relaunching would stack a second copy of every text object').toHaveLength(0);
  });

  it('the resume handed to the scene resumes the game this helper paused', () => {
    const { scene, plugin } = fakeScene();
    attachTitle(scene, noAudio, noop);
    plugin.calls.length = 0;

    plugin.launched[0]?.onPlay();

    expect(plugin.calls, 'pause and resume are written in one place so they cannot drift').toEqual([
      'resume',
    ]);
  });

  it('the callbacks reach the scene unchanged, and the audio getter is not called at attach time', () => {
    const { scene, plugin } = fakeScene();
    let audioReads = 0;
    let picked = 0;

    attachTitle(
      scene,
      () => {
        audioReads += 1;
        return undefined;
      },
      () => {
        picked += 1;
      },
    );

    // Resolved per press, never captured: a manager built after `create()` must still be reachable.
    expect(audioReads, 'the getter must not be drained at bind time').toBe(0);
    plugin.launched[0]?.audio?.();
    expect(audioReads).toBe(1);

    plugin.launched[0]?.onLevelSelect();
    expect(picked, 'the menu is opened by GAME, not by the title — scene.start stops its caller').toBe(1);
  });

  it('resetTitleLatch is what makes a reload show the screen again', () => {
    const { scene, plugin } = fakeScene();
    attachTitle(scene, noAudio, noop);
    plugin.active.delete(TITLE_KEY);
    plugin.calls.length = 0;

    // A real reload gets a fresh module; this is that, in one call.
    resetTitleLatch();
    attachTitle(scene, noAudio, noop);

    expect(plugin.calls).toEqual([`launch:${TITLE_KEY}`, 'pause']);
  });
});
