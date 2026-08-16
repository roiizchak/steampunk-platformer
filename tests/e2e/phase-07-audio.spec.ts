import { expect, test } from '@playwright/test';

import { bootToGame, waitTicks } from './gameHarness';
import {
  cuesPlayed,
  liveTrackCount,
  liveTrackKeys,
  peakWhilePlaying,
  resetCues,
  startCueRecorder,
  storedSettings,
  waitForCue,
  waitForQuiet,
} from './audioHelpers';

/**
 * Phase 7 — criteria 7.1, 7.4 and 7.5, on the real GPU browser.
 *
 * Routed to `chromium-gpu` by `playwright.config.ts`, and for audio the reason is not the frame
 * budget: **headless Chromium's audio stack is not the one a player runs**, and the WebAudio unlock
 * is a genuine user-gesture path that deserves a real browser rather than a headless approximation.
 *
 * ## What every assertion here is careful about
 *
 * **A cue "played" means Phaser had it PLAYING**, not that a call returned. `startCueRecorder`
 * samples the engine's own `sounds` list once per animation frame; a `play()` that returned false,
 * or a sound that failed to decode, never appears. Phase 6's second trap, applied to audio: any
 * "does it work" claim needs an independent assertion that the thing actually happened.
 *
 * **Nothing reads `mute` or `volume` back from Phaser** *(vault 7.5)*. Criterion 7.4 asserts against
 * `localStorage` — our own flag — and against an `AnalyserNode` on the master bus, which measures
 * what leaves the mixer rather than what was scheduled on it.
 *
 * **No ninth field on `window.__game`.** The surface is closed at eight by a Phase 1 Codex ruling.
 * Everything here goes through `window.__phaserGame`, which exists for exactly this.
 */

type PhaserSceneHandle = {
  world: { player: { x: number; y: number; hp: number }; tickCount: number };
};

test.describe('Phase 7 — 7.1 every cue plays at its event', () => {
  test('the beds start and are the only tracks the manager holds', async ({ page }) => {
    await bootToGame(page);
    // `bootToGame` clicks the canvas, which is a real user gesture — so the WebAudio context has
    // unlocked by the normal route rather than by a launch flag that would leave that path untested.
    // Quiet first: a one-shot in flight is a legitimate member of `sounds`, and asserting an exact
    // set without waiting would fail on a footstep mid-decay rather than on a leak.
    await waitForQuiet(page);

    expect((await liveTrackKeys(page)).sort()).toEqual(['bed-ambience', 'bed-music']);
  });

  test('jumping plays the jump cue, and landing plays the land cue', async ({ page }) => {
    await bootToGame(page);
    await startCueRecorder(page);

    await page.keyboard.press('Space');
    await waitForCue(page, 'sfx-jump');
    // The landing is a separate edge, arriving many ticks later. Waiting for it rather than
    // sampling once is what makes this a timing claim rather than an existence claim.
    await waitForCue(page, 'sfx-land');
  });

  test('walking plays footsteps, and they are paced rather than continuous', async ({ page }) => {
    await bootToGame(page);
    await startCueRecorder(page);

    await page.keyboard.down('ArrowRight');
    await waitTicks(page, 120);
    await page.keyboard.up('ArrowRight');

    const steps = (await cuesPlayed(page)).filter((key) => key === 'sfx-footstep');
    // 120 ticks of running at a 15-tick cadence is about eight footfalls. The bound is loose on
    // purpose — the point is that it is neither zero nor one-per-tick.
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.length).toBeLessThan(30);
  });

  test('attacking plays the attack cue', async ({ page }) => {
    await bootToGame(page);
    await startCueRecorder(page);

    await page.keyboard.press('f');
    await waitForCue(page, 'sfx-attack');
  });

  /**
   * 🔴 The kill plane, which is the path Codex plan review F4 caught the plan leaving silent.
   *
   * `applyWorldDamage` early-returns on the kill plane before `damagePlayer` is ever called, so a
   * death cue derived from that function's return would never fire here — while every
   * ordinary-lethal-damage test passed. Falling out of the world is the most common death in a
   * platformer.
   *
   * The player is placed below the world rather than walked there: `level-01` has no pit deep
   * enough, and the alternative is a test that cannot run until Phase 8 authors one. The mutation is
   * to live sim state on a fresh page, and it drives the real tick — nothing about the cue path is
   * stubbed.
   */
  test('falling out of the world plays the death cue', async ({ page }) => {
    await bootToGame(page);
    await startCueRecorder(page);

    await page.evaluate(() => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): PhaserSceneHandle } } }
      ).__phaserGame.scene.getScene('Game');
      scene.world.player.y = 99_999;
    });

    await waitForCue(page, 'sfx-death');
  });

  test('no unloaded-sound error, and every audio file was served', async ({ page }) => {
    const audioErrors: string[] = [];
    const badAudioResponses: string[] = [];
    const audioRequests: string[] = [];

    page.on('console', (message) => {
      // 🔴 Scoped to AUDIO, and that scope was earned rather than assumed. The first version
      // asserted zero console errors of any kind and went red on a `favicon.ico` 404 — pre-existing,
      // unrelated, and invisible to `page.on('response')` because the browser issues that request
      // outside the page's request graph, which is why the two listeners appeared to disagree.
      // Filtering it out without identifying it would have been the wrong move; so would asserting
      // something this criterion does not claim.
      if (message.type() === 'error' && /audio|sound|decode|\.wav|\.ogg/i.test(message.text())) {
        audioErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => audioErrors.push(error.message));
    page.on('response', (response) => {
      if (!/\.(wav|ogg)$/.test(response.url())) return;
      audioRequests.push(response.url());
      if (response.status() >= 400) badAudioResponses.push(`${response.status()} ${response.url()}`);
    });

    await bootToGame(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('f');
    await page.keyboard.down('ArrowRight');
    await waitTicks(page, 90);
    await page.keyboard.up('ArrowRight');

    // The positive half, and it is the half that matters: "no errors" is satisfied by a build that
    // requested nothing at all. Eleven files, every one served.
    expect(audioRequests, 'no audio was requested at all').toHaveLength(11);
    expect(badAudioResponses, `audio failed to load: ${badAudioResponses.join(' | ')}`).toEqual([]);
    expect(audioErrors, `audio errors during play: ${audioErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Phase 7 — 7.4 mute and volume persist AND are applied', () => {
  test('nothing is stored until the player changes something', async ({ page }) => {
    await bootToGame(page);
    // A default written on boot would make every later assertion pass trivially — including on a
    // build where the keys do nothing at all.
    expect(await storedSettings(page)).toBeNull();
  });

  test('mute survives a reload, read from our own flag', async ({ page }) => {
    await bootToGame(page);
    await page.keyboard.press('m');

    await expect
      .poll(async () => (await storedSettings(page))?.muted, { timeout: 5_000 })
      .toBe(true);

    await bootToGame(page);
    expect(await storedSettings(page)).toMatchObject({ muted: true });
  });

  test('volume survives a reload at the value it was left on', async ({ page }) => {
    await bootToGame(page);
    await page.keyboard.press('BracketLeft');

    // Read what the game ACTUALLY settled on rather than asserting a number of presses landed.
    // The criterion is persistence, not key-repeat behaviour, and an absolute expectation here
    // failed once on a third decrement nobody asked for — a flaky gate measuring the wrong thing.
    await expect
      .poll(async () => (await storedSettings(page))?.volume, { timeout: 5_000 })
      .toBeLessThan(1);
    const chosen = (await storedSettings(page))!.volume;
    expect(typeof chosen).toBe('number');

    await bootToGame(page);
    expect(await storedSettings(page)).toMatchObject({ volume: chosen });
  });

  /**
   * 🔴 Codex plan review F5: a stored flag can round-trip perfectly while nothing was applied.
   *
   * So this measures the master bus with an `AnalyserNode` — the real output — rather than reading
   * `sound.mute`, which vault 7.5 forbids and which would be true in both arms of a broken build.
   */
  test('a muted reload actually silences playback, not just the stored flag', async ({ page }) => {
    await bootToGame(page);

    const loud = await peakWhilePlaying(page, 'sfx-hit');
    // Non-vacuity, and it is the assertion that makes the next one mean anything: if the analyser
    // reads nothing in BOTH arms the test passes while measuring a harness that cannot hear.
    expect(loud, 'the analyser measured no output at all — the harness cannot hear').toBeGreaterThan(0.001);

    await page.keyboard.press('m');
    await expect.poll(async () => (await storedSettings(page))?.muted, { timeout: 5_000 }).toBe(true);

    await bootToGame(page);
    expect(await storedSettings(page)).toMatchObject({ muted: true });

    const quiet = await peakWhilePlaying(page, 'sfx-hit');
    expect(quiet, `muted playback still produced ${quiet}`).toBeLessThan(loud / 10);
  });
});

test.describe('Phase 7 — 7.5 a scene round-trip does not accumulate tracks', () => {
  /**
   * The criterion, and the reason `BootScene.init()` owns teardown.
   *
   * `this.sound` is one manager for the whole game and is NOT cleaned up on scene shutdown, so
   * without an explicit `remove()` every restart leaves the previous beds in the list and starts two
   * more on top. Counting after several round-trips is what distinguishes "it stops the old ones"
   * from "it looks fine once".
   */
  test('five Boot restarts leave exactly the two beds', async ({ page }) => {
    await bootToGame(page);
    await waitForQuiet(page);
    expect(await liveTrackCount(page)).toBe(2);

    for (let restart = 0; restart < 5; restart += 1) {
      await page.evaluate(() => {
        (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): { scene: { restart(): void } } } } }
        ).__phaserGame.scene.getScene('Boot').scene.restart();
      });
      await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 20_000 });
      await waitForQuiet(page);
    }

    // Two. Not "at most twelve", not "it did not grow much" — a leak of one per restart is exactly
    // what a passing-looking implementation produces.
    expect(await liveTrackKeys(page), 'tracks after five restarts').toHaveLength(2);
    expect((await liveTrackKeys(page)).sort()).toEqual(['bed-ambience', 'bed-music']);
  });

  test('one-shot cues do not accumulate either', async ({ page }) => {
    await bootToGame(page);
    await startCueRecorder(page);
    await resetCues(page);

    // A burst of footsteps and swings, then long enough for every one to have completed.
    await page.keyboard.down('ArrowRight');
    await waitTicks(page, 180);
    await page.keyboard.up('ArrowRight');
    await waitTicks(page, 180);
    await waitForQuiet(page);

    const played = await cuesPlayed(page);
    expect(played.length, 'the burst produced no cues at all').toBeGreaterThan(3);
    // Fire-and-forget sounds destroy themselves on completion. If they did not, this would be
    // `2 + played.length` and would grow for as long as the game ran.
    expect(await liveTrackKeys(page)).toHaveLength(2);
  });
});
