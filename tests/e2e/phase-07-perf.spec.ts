import { expect, test } from '@playwright/test';

import { MAX_AUDIO_FRAME_LOSS_RATIO, MAX_AUDIO_WORK_DELTA_MS, MIN_SAMPLES } from './perfBudget';
import { SOFTWARE_RENDERERS, sample, webglRenderer } from './perfSampler';
import { bootToGame, readPlayer, waitTicks } from './gameHarness';
import { cuesPlayed, resetCues, startCueRecorder } from './audioHelpers';

/**
 * # Criterion 7.7's frame-budget half — what firing audio cues costs per frame
 *
 * ## 🔴 The trap, and it is the same one Phase 6 nearly shipped
 *
 * A ratio is an **upper bound**. If the audio manager plays nothing — a cache that never filled, a
 * `play()` that returns false, a cue path that silently skips — then the "audio on" and "audio off"
 * arms do identical work, the ratio is ~1.0, and it sails under any ceiling anyone sets. The
 * measurement would be reporting *"audio is free"* about a build with no audio, which is vault 9.4
 * exactly: Phase 5 shipped 12 of 20 enemies as grey-box Rectangles with every gate green, and
 * Rectangles are CHEAPER — the defect made the frame budget look better.
 *
 * So this spec asserts two things by two different mechanisms, and neither substitutes for the other:
 *
 *  1. **A correctness guard, inside every window of both arms.** The cue recorder samples Phaser's
 *     own `sounds` list once per animation frame, so it records what the engine had PLAYING, not
 *     that a call returned. The on-arm window must contain cues; the off-arm window must contain
 *     none. An arm that measured the wrong thing fails here, loudly, before any time is compared.
 *  2. **A budget guard** — the delta and the ratio, which mean something only *because* guard 1
 *     already proved the two arms differ in real audio work.
 *
 * ## What the toggle actually is, and why it is the honest one
 *
 * The off arm **removes the nine `sfx-*` buffers from `scene.cache.audio`**. `AudioManager.playCues`
 * already tests `scene.cache.audio.exists(key)` and skips, so the sim still ticks, still emits the
 * same cue edges, and `playCues` still iterates them — only the `Sound` construction and the
 * `AudioBufferSourceNode` start disappear. That isolates the cost this criterion is about instead of
 * also switching off the code path that decides there is a cost.
 *
 * Muting was the obvious alternative and it is the wrong instrument: `setMute` sets a gain to zero
 * and every node is still built and started, so a muted arm measures the same work and the ratio
 * would read 1.0 for a reason that has nothing to do with the budget.
 *
 * ⚠️ **Stated limits** *(vault 9.3 — a gate's blind spots are part of its result)*:
 *
 *  - **The two beds play in BOTH arms and divide out.** They are looping `AudioBufferSourceNode`s
 *    mixed on the audio rendering thread, so their main-thread per-frame cost is near zero and this
 *    spec cannot see it. What it measures is the one-shot path.
 *  - **WebAudio mixing is not on this thread at all.** A cue that is expensive to *mix* costs the
 *    audio thread, not the frame, and an underrun would present as a glitch nobody here can hear.
 *    Criterion 7.10 is where a human listens; this number cannot stand in for that.
 *  - **A percentile cannot see this cost at all.** At ~240 fps against a 60 Hz sim, cue frames are
 *    under 2 % of frames, so `workP95Ms` is blind to them by construction. That is measured, not
 *    assumed — see `MAX_AUDIO_FRAME_LOSS_RATIO`. Any future spec reducing `sample()` with a
 *    percentile needs to check its event rate against the frame rate first.
 *  - **Absolute milliseconds from this harness mean little** — Vite is still compiling and the box is
 *    shared. Both arms are sampled in the same page, seconds apart, interleaved, which is what makes
 *    the comparison trustworthy even though neither figure alone is.
 */

/** Three pairs, interleaved, so drift in the machine hits both arms alike. */
const PAIRS = 3;

/**
 * 120 ticks — two seconds of running per window.
 *
 * Shorter than the 180 that `SAMPLE_TICKS` uses for combat, and deliberately: this window is a
 * straight sprint from a fixed start, and the longer it runs the further the player travels into
 * terrain the other arm's window did not cover. Two seconds at the run cadence of
 * `FOOTSTEP_TICKS.run = 15` is about eight footfalls, which is a cue rate the game genuinely
 * produces rather than a synthetic burst.
 */
const AUDIO_SAMPLE_TICKS = 120;

type Page = import('@playwright/test').Page;

/**
 * Take the nine one-shot cues out of the audio cache, or put them back.
 *
 * Stashed on `window`, not re-fetched: re-loading them would put a network fetch and a decode
 * inside the run, and a decode is the single most expensive audio operation there is.
 */
async function setCues(page: Page, on: boolean): Promise<void> {
  await page.evaluate((wanted) => {
    interface Cache {
      exists(key: string): boolean;
      get(key: string): unknown;
      add(key: string, data: unknown): void;
      remove(key: string): void;
      entries: { keys(): string[] };
    }
    const scene = (
      window as unknown as {
        __phaserGame: { scene: { getScene(k: string): { cache: { audio: Cache } } } };
      }
    ).__phaserGame.scene.getScene('Game');
    const cache = scene.cache.audio;
    const stash = ((window as unknown as { __stashedCues?: Record<string, unknown> }).__stashedCues ??=
      {});

    if (!wanted) {
      for (const key of cache.entries.keys()) {
        if (!key.startsWith('sfx-')) continue;
        stash[key] = cache.get(key);
        cache.remove(key);
      }
      return;
    }
    for (const [key, data] of Object.entries(stash)) {
      if (!cache.exists(key)) cache.add(key, data);
    }
  }, on);

  // Assert the toggle LANDED rather than assuming it did. A cache API that changed shape under a
  // Phaser upgrade would otherwise leave both arms identical and the ratio at a passing 1.0.
  const present = await page.evaluate(
    () =>
      (
        window as unknown as {
          __phaserGame: {
            scene: { getScene(k: string): { cache: { audio: { entries: { keys(): string[] } } } } };
          };
        }
      ).__phaserGame.scene
        .getScene('Game')
        .cache.audio.entries.keys()
        .filter((k: string) => k.startsWith('sfx-')).length,
  );
  expect(present, `sfx cues in cache with audio ${on ? 'on' : 'off'}`).toBe(on ? 9 : 0);
}

/** Put the player back on a known tile with no momentum, so every window starts identically. */
async function resetRun(page: Page, start: { x: number; y: number }): Promise<void> {
  await page.keyboard.up('ArrowRight');
  await page.evaluate((at) => {
    const scene = (
      window as unknown as {
        __phaserGame: {
          scene: { getScene(k: string): { world: { player: Record<string, number | string> } } };
        };
      }
    ).__phaserGame.scene.getScene('Game');
    Object.assign(scene.world.player, { x: at.x, y: at.y, vx: 0, vy: 0 });
  }, start);
  await waitTicks(page, 10);
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

test.describe('Phase 7 — criterion 7.7, the audio frame budget', () => {
  test('firing cues costs a bounded slice of the frame, and is provably firing while measured', async ({
    page,
  }) => {
    // Arithmetic, not a loosened bound: six windows of 120 ticks is 12 s of deliberate sampling
    // before the resets and settles between them are counted. Boot stays bounded by BOOT_TIMEOUT.
    test.setTimeout(180_000);

    await bootToGame(page);

    // 🔴 The renderer, before any number is trusted. SwiftShader inflates this harness's
    // milliseconds ~21x (HANDOFF §14), and while a ratio survives that, a spec that silently fell
    // back to software rasterisation is not the substrate this phase agreed to measure on.
    const renderer = (await webglRenderer(page)).toLowerCase();
    expect(typeof renderer).toBe('string');
    for (const software of SOFTWARE_RENDERERS) {
      expect(renderer, `software rasteriser: ${renderer}`).not.toContain(software);
    }

    await startCueRecorder(page);
    const spawn = await readPlayer(page);
    const start = { x: spawn.x, y: spawn.y };

    const arms: Record<'on' | 'off', { work: number[]; frames: number[]; cues: number[] }> = {
      on: { work: [], frames: [], cues: [] },
      off: { work: [], frames: [], cues: [] },
    };

    for (let pair = 0; pair < PAIRS; pair += 1) {
      // Interleaved within the pair, and the order is fixed rather than alternating: a machine that
      // warms up over the run biases whichever arm goes first, and holding that constant means the
      // bias sits in both pairs the same way instead of cancelling into noise nobody can see.
      for (const arm of ['on', 'off'] as const) {
        await setCues(page, arm === 'on');
        await resetRun(page, start);
        await resetCues(page);

        await page.keyboard.down('ArrowRight');
        const measured = await sample(page, AUDIO_SAMPLE_TICKS);
        await page.keyboard.up('ArrowRight');

        const fired = (await cuesPlayed(page)).filter((key) => key.startsWith('sfx-'));

        expect(measured.frames, `arm ${arm}, pair ${pair}: too few frames to reduce`).toBeGreaterThan(
          MIN_SAMPLES,
        );
        expect(measured.ticks, `arm ${arm}, pair ${pair}: short window`).toBeGreaterThanOrEqual(
          AUDIO_SAMPLE_TICKS,
        );

        arms[arm].work.push(measured.workMedianMs);
        arms[arm].frames.push(measured.frames);
        arms[arm].cues.push(fired.length);
      }
    }

    await setCues(page, true);

    // ── Guard 1: the arms really did differ in audio work ──────────────────────────────────────
    //
    // Both directions asserted. "Cues fired in the on arm" alone would still pass if the off arm
    // fired them too — which is the null mutation for this spec, and the one that turns the ratio
    // into a comparison of a thing against itself.
    for (let pair = 0; pair < PAIRS; pair += 1) {
      expect(
        arms.on.cues[pair],
        `pair ${pair}: the audio-ON window played no cues — the budget below would be measuring nothing`,
      ).toBeGreaterThan(0);
      expect(
        arms.off.cues[pair],
        `pair ${pair}: the audio-OFF window played ${arms.off.cues[pair]} cues — the arms are the same arm`,
      ).toBe(0);
    }

    // ── Guard 2: the budget ────────────────────────────────────────────────────────────────────
    //
    // 🔴 **The load-bearing statistic is FRAMES SERVED, and two earlier versions of this gate got
    // that wrong before a mutation said so.**
    //
    // Draft one asserted on `workMedianMs`; draft two added `workP95Ms`. A proving mutation of
    // **30 ms of blocking work per cue** moved the p95 by 0.400 ms — indistinguishable from noise.
    // The cause is arithmetic, not luck: this machine serves ~479 rAF frames per 120 sim ticks
    // (~240 fps against a 60 Hz sim), a cue fires about eight times per window, so **cue frames are
    // 1.9 % of frames** and the 95th percentile is the 21st slowest of 479. It never lands on one.
    //
    // Blocking the main thread costs FRAMES, and that is visible: the same mutation took the window
    // from 479 frames to 425, and 54 lost frames at a 4.4 ms interval is the eight 30 ms stalls
    // returned almost exactly. Clean, the two arms agree to within one frame in 479.
    //
    // The median is kept because it catches the defect the frame count is worst at — a cost that
    // leaks into *every* frame rather than into 2 % of them.
    const on = median(arms.on.work);
    const off = median(arms.off.work);
    const delta = on - off;
    const framesOn = median(arms.on.frames);
    const framesOff = median(arms.off.frames);
    const frameLoss = framesOn > 0 ? framesOff / framesOn : Infinity;
    const detail = `frames ${arms.on.frames.join('/')} with audio vs ${arms.off.frames.join('/')} without (loss ${frameLoss.toFixed(4)}x) | median work ${on.toFixed(3)} vs ${off.toFixed(3)} ms (delta ${delta.toFixed(3)}) | cues/window ${arms.on.cues.join('/')} vs ${arms.off.cues.join('/')} | renderer ${renderer}`;

    expect(frameLoss, detail).toBeLessThanOrEqual(MAX_AUDIO_FRAME_LOSS_RATIO);
    expect(delta, detail).toBeLessThanOrEqual(MAX_AUDIO_WORK_DELTA_MS);
  });
});
