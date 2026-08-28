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
 * Only that `pause()` with no argument pauses the scene the plugin belongs to, and that the three
 * state predicates answer about a named scene. The queueing `SceneManager` does is deliberately NOT
 * modelled — that is an engine fact, asserted in `phase-11-welcome.spec.ts` against the real thing.
 * This file holds the branch logic.
 *
 * ⚠️ **The fake models all THREE predicates on purpose.** It first modelled only `isActive`, which
 * is exactly the blind spot the code had: `isActive` is false for a PAUSED or SLEEPING scene, and a
 * paused scene still renders. Codex implementation review, finding 2.
 */

type TitleState = 'gone' | 'active' | 'paused' | 'sleeping';

interface FakePlugin {
  calls: string[];
  active: Set<string>;
  launched: TitleSceneData[];
  state: TitleState;
}

function fakeScene(state: TitleState = 'gone'): { scene: Phaser.Scene; plugin: FakePlugin } {
  const plugin: FakePlugin = {
    calls: [],
    active: new Set(state === 'active' ? [TITLE_KEY] : []),
    launched: [],
    state,
  };
  const scenePlugin = {
    isActive: (key: string) => plugin.active.has(key),
    isPaused: (key: string) => key === TITLE_KEY && plugin.state === 'paused',
    isSleeping: (key: string) => key === TITLE_KEY && plugin.state === 'sleeping',
    pause: () => {
      plugin.calls.push('pause');
    },
    resume: (key?: string) => {
      plugin.calls.push(key === undefined ? 'resume' : `resume:${key}`);
      if (key === TITLE_KEY) plugin.state = 'active';
    },
    wake: (key?: string) => {
      plugin.calls.push(key === undefined ? 'wake' : `wake:${key}`);
      if (key === TITLE_KEY) plugin.state = 'active';
    },
    launch: (key: string, data: TitleSceneData) => {
      plugin.calls.push(`launch:${key}`);
      plugin.active.add(key);
      plugin.state = 'active';
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

    // Both ops, and the order they are written in. NOT a mechanism claim: they drain in the same
    // processQueue pass either way, so this is a change-detector, not an engine requirement.
    expect(plugin.calls).toEqual([
      `launch:${TITLE_KEY}`,
      'pause',
    ]);
  });

  it('a second attach with the title already gone does NOTHING', () => {
    const { scene, plugin } = fakeScene();
    attachTitle(scene, noAudio, noop);
    plugin.active.delete(TITLE_KEY);
    plugin.state = 'gone';
    plugin.calls.length = 0;

    attachTitle(scene, noAudio, noop);

    // The failure this forbids: a mid-session `Game` restart reopening the welcome screen. The
    // lifecycle suite and `phase-07-audio-adopt.spec.ts` both restart `Game` with no data.
    expect(plugin.calls, 'once per page load').toEqual([]);
  });

  it('a restart WHILE the title is up re-pauses the new game and does not stack a second title', () => {
    const { scene, plugin } = fakeScene('active');

    attachTitle(scene, noAudio, noop);

    // 🔴 The branch that keeps the pause invariant. Suppressing the relaunch and stopping there
    // would leave a stale title drawn over a newly RUNNING level — a player reading a title screen
    // over a game that is quietly killing them.
    expect(plugin.calls).toEqual(['pause']);
    expect(plugin.launched, 'relaunching would stack a second copy of every text object').toHaveLength(0);
  });

  /**
   * 🔴 A PAUSED or SLEEPING title is still THERE, and `isActive` says false for both — so a check
   * written on `isActive` alone fell through to the latch and left the title over a running level.
   *
   * ⚠️ **The two states are not symmetric, and detecting them is not enough.** `SceneManager.render`
   * draws while `status < SLEEPING`, and PAUSED is 6 to SLEEPING's 7: a paused title still DRAWS but
   * takes no input — an undismissable screen over a frozen game — while a sleeping one draws
   * nothing, leaving a frozen game with a blank overlay. Simply re-pausing `Game` under either
   * strands the player. This test used to assert exactly that broken behaviour, and its comment
   * claimed "Phaser renders both", which is false. Codex implementation review round 2, finding 3.
   */
  for (const [state, restore] of [
    ['paused', `resume:${TITLE_KEY}`],
    ['sleeping', `wake:${TITLE_KEY}`],
  ] as const) {
    it(`a ${state} title is RESTORED, then the new game is re-paused behind it`, () => {
      const { scene, plugin } = fakeScene(state);

      attachTitle(scene, noAudio, noop);

      // The restore must come first: pausing Game behind a screen that cannot answer a key is the
      // stranded state, not a fix for it.
      expect(plugin.calls, 'the player must be left with a way out').toEqual([restore, 'pause']);
      expect(plugin.launched, 'and still no second copy of every text object').toHaveLength(0);
    });
  }

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
    plugin.state = 'gone';
    plugin.calls.length = 0;

    // A real reload gets a fresh module; this is that, in one call.
    resetTitleLatch();
    attachTitle(scene, noAudio, noop);

    expect(plugin.calls).toEqual([`launch:${TITLE_KEY}`, 'pause']);
  });
});
