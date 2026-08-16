import { expect } from '@playwright/test';

/**
 * The audio half of the e2e harness — Phase 7.
 *
 * ## 🔴 Nothing here reads `mute` or `volume` back from Phaser
 *
 * Vault 7.5: on a context that has not resumed, a write is scheduled and the read returns the old
 * value, so those getters are not readbacks. The two honest sources are used instead:
 *
 *  - **`localStorage`** — our own flag, which is what criterion 7.4 is actually about.
 *  - **An `AnalyserNode` on the master bus** — the real output, which is what "applied to playback"
 *    actually means. A scheduled parameter can read correct while nothing audible changed.
 *
 * ## And no ninth field on `window.__game`
 *
 * The debug surface is closed at eight by a Phase 1 Codex ruling. Everything below reaches through
 * `window.__phaserGame`, which is already dev-only and already exists for exactly this — letting a
 * spec assert against the running engine rather than against a summary the game wrote about itself.
 */

type Page = import('@playwright/test').Page;

/** The slice of Phaser a spec touches. Deliberately narrow — a wide type invites reading state. */
interface SoundHandle {
  sounds: { key: string; isPlaying: boolean }[];
  locked: boolean;
  context?: AudioContext;
  masterVolumeNode?: AudioNode;
  play(key: string, config?: object): boolean;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface PhaserHandle {
  sound: SoundHandle;
  scene: {
    getScene(key: string): unknown;
    isActive(key: string): boolean;
  };
}

/** One contiguous run of a cue, and the sim tick it started on. */
export interface CuePlay {
  key: string;
  tick: number;
}

declare global {
  interface Window {
    /** Installed by `startCueRecorder`. Test-only; never part of the product. */
    __cuesPlayed?: CuePlay[];
  }
}

/**
 * Start recording every cue Phaser actually has PLAYING.
 *
 * 🔴 **Not a hook on `sound.on('play')`.** That was the first implementation and it recorded
 * nothing, because `Phaser.Sound.Events.PLAY` is emitted on the **Sound instance**, not on the
 * manager — the manager only emits the global events (`unlocked`, `globalmute`, `pauseall`…). A
 * listener on the wrong emitter is silent rather than wrong, which is why every cue assertion failed
 * at once while the game was working perfectly.
 *
 * 🔴 **And not a wrapper around `sound.play()` either**, which would have been the easy fix. That
 * records that a CALL was made. Phase 6's second trap says the opposite is needed: *"a separate,
 * independent assertion that the thing is actually happening — for audio, that a sound really
 * played, not that a play call returned."*
 *
 * So this samples the engine's own `sounds` list once per animation frame and records the key of
 * anything reporting `isPlaying`. That is Phaser's state, not our call log: a `play()` that returned
 * false, or a sound that failed to decode, never appears. The shortest shipped cue is 180 ms against
 * a ~16 ms frame, so nothing can start and finish between two samples.
 *
 * Must be called AFTER `bootToGame`, because the manager only exists once the game does.
 */
export async function startCueRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = (window as unknown as { __phaserGame: PhaserHandle }).__phaserGame;
    window.__cuesPlayed = [];
    const seenThisRun = new Set<string>();
    const sample = (): void => {
      const playingNow = new Set<string>();
      for (const sound of game.sound.sounds) {
        if (sound.isPlaying) playingNow.add(sound.key);
      }
      // 🔴 The TICK is recorded, not just the key. Codex implementation review C3: the jump/land
      // spec asserted only that both cues appeared, and `waitForCue` checks a cumulative
      // `includes()` — so moving `events.landed = true` into the TAKEOFF branch made both cues fire
      // on the same tick and the test still passed. An existence assertion cannot verify a timing
      // claim; the cue's tick is what makes "landing plays the land cue" mean anything.
      const tick = (window as unknown as { __game?: { tick?: number } }).__game?.tick ?? -1;
      for (const key of playingNow) {
        // One entry per contiguous run of a key, so a 180 ms cue is one footstep rather than eleven.
        if (!seenThisRun.has(key)) window.__cuesPlayed!.push({ key, tick });
      }
      seenThisRun.clear();
      for (const key of playingNow) seenThisRun.add(key);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

/**
 * Wait until nothing but the looping beds is sounding.
 *
 * Every "the manager holds exactly the beds" assertion needs this first. A one-shot in flight is a
 * legitimate member of `sounds` — it is fire-and-forget and destroys itself on completion — so
 * asserting an exact count without waiting for quiet fails on a footstep that happened to be
 * mid-decay. That is a flaky gate, not a leak, and the two must not be confused.
 */
export async function waitForQuiet(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const sounds = (window as unknown as { __phaserGame: PhaserHandle }).__phaserGame.sound.sounds;
      return sounds.length > 0 && sounds.every((sound) => sound.key.startsWith('bed-'));
    },
    undefined,
    { timeout },
  );
}

/** Everything recorded so far, with the tick each cue started on. */
export async function cuePlays(page: Page): Promise<CuePlay[]> {
  const cues = await page.evaluate(() => window.__cuesPlayed);
  // Type before value (vault C1): an undefined recorder returns undefined, and `[].includes` on
  // undefined would throw rather than fail — a red for the wrong reason.
  expect(Array.isArray(cues), 'the cue recorder was never installed').toBe(true);
  return cues as CuePlay[];
}

/** Just the keys, in order. */
export async function cuesPlayed(page: Page): Promise<string[]> {
  return (await cuePlays(page)).map((play) => play.key);
}

/**
 * The sim tick a cue FIRST played on, or `null`.
 *
 * This is what a timing claim needs. `waitForCue` proves a cue happened; only a tick can say it
 * happened at the right moment, and the two are not interchangeable — Codex C3.
 */
export async function cueTick(page: Page, key: string): Promise<number | null> {
  const play = (await cuePlays(page)).find((p) => p.key === key);
  return play ? play.tick : null;
}

/** Clear the recording without re-installing the listener. */
export async function resetCues(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__cuesPlayed = [];
  });
}

/**
 * Wait until `key` has been recorded as played, or fail the wait.
 *
 * A wait rather than a read-once, because a cue is emitted by a sim tick and the tick that produces
 * it may not have run when the driving key press returns. Never a `waitForTimeout` — this polls a
 * real condition, so a cue that never fires fails as a timeout naming the cue rather than as a sleep
 * that happened to be too short.
 */
export async function waitForCue(page: Page, key: string, timeout = 10_000): Promise<void> {
  try {
    await page.waitForFunction(
      (k) => (window.__cuesPlayed ?? []).some((play) => play.key === k),
      key,
      { timeout },
    );
  } catch {
    // 🔴 AWAITED. This read was `JSON.stringify(page.evaluate(...))` without an await, which
    // stringifies a pending Promise to `{}` — so the one message whose entire job is to say what
    // DID play printed `Recorded: {}`, and only ever on the failure path where nobody could see it
    // was broken.
    const recorded = await page.evaluate(() => window.__cuesPlayed).catch(() => undefined);
    throw new Error(`cue "${key}" never played. Recorded: ${JSON.stringify(recorded)}`);
  }
}

/** How many tracks the manager is holding. Criterion 7.5 counts exactly this. */
export async function liveTrackCount(page: Page): Promise<number> {
  const count = await page.evaluate(
    () => (window as unknown as { __phaserGame: PhaserHandle }).__phaserGame.sound.sounds.length,
  );
  expect(typeof count).toBe('number');
  return count;
}

/** The keys of the tracks the manager is holding, so a failure names what leaked. */
export async function liveTrackKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { __phaserGame: PhaserHandle }).__phaserGame.sound.sounds.map((s) => s.key),
  );
}

/** Our own flag, straight out of storage. The only honest answer to "is it muted". */
export async function storedSettings(page: Page): Promise<{ muted: unknown; volume: unknown } | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('steampunk.audio');
    return raw === null ? null : (JSON.parse(raw) as { muted: unknown; volume: unknown });
  });
}

/**
 * Peak output on the master bus while `key` plays, measured with an `AnalyserNode`.
 *
 * 🔴 This is the answer to *"and are re-applied to playback"* — Codex plan review F5. A stored flag
 * can round-trip perfectly while nothing was ever applied to the audio graph, and asserting
 * `sound.mute` instead would be asserting the getter vault 7.5 forbids. Tapping
 * `masterVolumeNode` measures what actually leaves the mixer.
 *
 * Returns a 0–1 peak from `getFloatTimeDomainData`, sampled once per animation frame for `frames`
 * frames — sampling INSIDE the page and returning an aggregate, because a wait expressed in ticks
 * cannot bound a sampling window.
 */
export async function peakWhilePlaying(page: Page, key: string, frames = 40): Promise<number> {
  return page.evaluate(
    async ({ soundKey, sampleFrames }) => {
      const game = (window as unknown as { __phaserGame: PhaserHandle }).__phaserGame;
      const { context, masterVolumeNode } = game.sound;
      if (!context || !masterVolumeNode) {
        return -1; // Not WebAudio. The caller asserts on this rather than silently reporting 0.
      }

      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      masterVolumeNode.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      let peak = 0;
      game.sound.play(soundKey);

      await new Promise<void>((resolve) => {
        let frame = 0;
        const step = (): void => {
          analyser.getFloatTimeDomainData(buffer);
          for (let i = 0; i < buffer.length; i += 1) {
            const magnitude = Math.abs(buffer[i]!);
            if (magnitude > peak) peak = magnitude;
          }
          frame += 1;
          if (frame >= sampleFrames) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      masterVolumeNode.disconnect(analyser);
      return peak;
    },
    { soundKey: key, sampleFrames: frames },
  );
}
