/**
 * The sound manager — Phase 7's only file that touches Phaser audio.
 *
 * A plain module with an explicit create/destroy pair, deliberately **not** a scene.
 *
 * ## 🔴 Why not a scene, and why teardown lives in Boot
 *
 * Phase 6 took three attempts to retire the HUD, and the two that failed both failed the same way:
 * `ScenePlugin` operations are QUEUED, so a `SHUTDOWN` handler's stop drains *after* the next
 * scene's `create()` has already run. The form that finally held was a **condition re-evaluated
 * every frame**, because a condition has no ordering to get wrong.
 *
 * Audio has the same hazard and a sharper version of it: `this.sound` is **one manager for the whole
 * game** and is not cleaned up on scene shutdown, so a looping bed survives a scene restart and a
 * second one starts on top of it. That is criterion 7.5, and vault 7.5 names the fix precisely —
 * *"unsubscribe the exact unlock handler and **remove** long-running tracks"*.
 *
 * The order-independent form here is a **module-level singleton plus an idempotent teardown**:
 *
 *   - at most one manager exists, enforced by `createAudio` destroying any predecessor;
 *   - `destroyAudio` is a no-op when there is nothing to destroy;
 *   - `BootScene.init()` calls it, which runs before any load on **every** boot, restart and
 *     refusal — the same place, and for the same reason, that Boot already stops `Game` and `UI`.
 *
 * No `SHUTDOWN` handler, no queued operation, nothing that depends on which callback fires first.
 *
 * ## 🔴 The getter is not a readback
 *
 * Vault 7.5: on a context that has not resumed — every context before the first gesture — a write to
 * `mute` or `volume` is scheduled and the read returns the old value. So `settings` below is the
 * truth and `this.sound` is only where that truth is applied. **Nothing in this file ever reads
 * playback state back out of Phaser**, and criterion 7.4 asserts against `localStorage`, not against
 * `sound.volume`.
 */

import Phaser from 'phaser';

import type { AudioCue } from '../sim/audioCues';
import type { AssetCatalog, AudioEntry } from './assetCatalog';
import {
  type AudioSettings,
  type SettingsStorage,
  readAudioSettings,
  safeLocalStorage,
  stepVolume,
  writeAudioSettings,
} from './audioSettings';

/** Catalog keys are namespaced; the sim speaks in bare cue names. */
const cueKey = (cue: AudioCue): string => `sfx-${cue}`;

/** The two continuous tracks. Everything else is fire-and-forget. */
const BED_KEYS = ['bed-music', 'bed-ambience'] as const;

export interface AudioManager {
  /** Play this tick's cues. Takes what `audioCues()` returned, unchanged. */
  playCues(cues: readonly AudioCue[]): void;
  /** Flip mute and persist it. Returns the new state — from our flag, never from the getter. */
  toggleMute(): boolean;
  /** Nudge master volume one step and persist it. Returns the new volume. */
  nudgeVolume(direction: 1 | -1): number;
  /** Stop and REMOVE both beds, and unsubscribe the exact unlock handler. Idempotent. */
  destroy(): void;
}

/**
 * The one live manager.
 *
 * Module scope rather than a scene field, because the thing being guarded — `this.sound` — is itself
 * game-global. A per-scene handle would let two scenes each believe they owned the beds, which is
 * exactly the accumulation criterion 7.5 counts.
 */
let current: AudioManager | null = null;

function gainsFrom(catalog: AssetCatalog): Map<string, number> {
  return new Map(catalog.audio.map((row: AudioEntry) => [row.key, row.gain]));
}

/**
 * Create the manager, replacing any predecessor.
 *
 * `catalog` is passed in rather than read from the cache so this function is honest about its
 * inputs: the per-cue gains are the mix criterion 7.2 was measured against, and they come from
 * exactly one place *(`tools/gen/build-audio.mjs` solves them)*.
 */
export function createAudio(scene: Phaser.Scene, catalog: AssetCatalog): AudioManager {
  destroyAudio(scene);

  const sound = scene.sound;
  const gains = gainsFrom(catalog);
  // Obtained ONCE, through the guarded accessor: the `window.localStorage` property getter throws
  // outright on a storage-refused origin, which no `try` inside `audioSettings` could catch.
  const storage: SettingsStorage | null = safeLocalStorage();
  const settings: AudioSettings = readAudioSettings(storage);
  const beds: Phaser.Sound.BaseSound[] = [];

  /** Apply our flag to Phaser. One direction only — see the header. */
  const apply = (): void => {
    sound.setMute(settings.muted);
    sound.setVolume(settings.volume);
  };

  const startBeds = (): void => {
    for (const key of BED_KEYS) {
      if (!scene.cache.audio.exists(key)) {
        // Boot refuses to route on a missing catalogued asset, so reaching here means the catalog
        // and the cache disagree — worth not crashing over, and worth not pretending about either.
        console.warn(`[audio] bed "${key}" is not in the cache; continuing without it`);
        continue;
      }
      const bed = sound.add(key, { loop: true, volume: gains.get(key) ?? 1 });
      bed.play();
      beds.push(bed);
    }
  };

  /**
   * Held by reference so `destroy` can pass the SAME function to `off()`.
   *
   * Vault 7.5 says "the exact handler" and means it: `off(event, someOtherFunction)` removes
   * nothing, silently, and the leak only shows up as a bed starting on a scene the player already
   * left. `once` still needs the explicit removal — it self-removes when it FIRES, not when the
   * thing that registered it goes away.
   */
  const onUnlocked = (): void => startBeds();

  apply();
  if (sound.locked) {
    sound.once(Phaser.Sound.Events.UNLOCKED, onUnlocked);
  } else {
    startBeds();
  }

/**
 * DEV ONLY. `?perfMutation=cue-stall` blocks the main thread for `CUE_STALL_MS` on every cue that
 * actually plays — **criterion 7.7's proving mutation, committed rather than performed by hand.**
 *
 * The same argument, and the same shape, as `?breakAsset=corrupt` in `bootAssets.ts`: a gate that
 * cannot go red is decoration *(vault C2)*, and a mutation that lives in someone's working copy is
 * a ritual rather than a regression. The previous perf session's storm and scrim mutations were
 * both left uncommitted and recorded as unresolved methodology debt; this is that debt paid for the
 * audio half.
 *
 * **30 ms is the number 7.7's docstring names**, so this is the mutation the bound names rather
 * than a convenient one. It is placed after the `exists()` guard on purpose — a cue that does not
 * play costs nothing in the shipped game, and charging for it would make the mutation heavier than
 * the defect it stands for.
 *
 * A busy loop, not `setTimeout`: the defect being modelled is main-thread blocking inside the audio
 * path, and a timer would yield to rAF and model nothing.
 */
const CUE_STALL_MS = 30;

function stallPerCue(): void {
  if (!import.meta.env.DEV) {
    return;
  }
  if (new URLSearchParams(window.location.search).get('perfMutation') !== 'cue-stall') {
    return;
  }
  const until = performance.now() + CUE_STALL_MS;
  while (performance.now() < until) {
    /* block, deliberately */
  }
}

  const manager: AudioManager = {
    playCues(cues) {
      for (const cue of cues) {
        const key = cueKey(cue);
        if (!scene.cache.audio.exists(key)) {
          continue;
        }
        stallPerCue();
        // Fire-and-forget: Phaser destroys the instance on completion, so a burst of footsteps
        // cannot accumulate. The beds are the only tracks we hold a reference to, which is exactly
        // the set criterion 7.5 counts.
        sound.play(key, { volume: gains.get(key) ?? 1 });
      }
    },

    toggleMute() {
      settings.muted = !settings.muted;
      apply();
      writeAudioSettings(storage, settings);
      return settings.muted;
    },

    nudgeVolume(direction) {
      settings.volume = stepVolume(settings.volume, direction);
      apply();
      writeAudioSettings(storage, settings);
      return settings.volume;
    },

    destroy() {
      sound.off(Phaser.Sound.Events.UNLOCKED, onUnlocked);
      for (const bed of beds) {
        // REMOVE, not stop. Vault 7.5: a stopped track is still in `sound.sounds`, so a scene
        // round-trip that stops and re-adds grows the list every time — which is the number
        // criterion 7.5 measures.
        sound.remove(bed);
      }
      beds.length = 0;
      if (current === manager) {
        current = null;
      }
    },
  };

  current = manager;
  return manager;
}

/**
 * Tear down whatever manager exists. Safe to call when there is none.
 *
 * Called from `BootScene.init()`, which runs before any load on every boot, restart and refusal —
 * a no-op on a fresh boot, and the only teardown point that cannot be beaten by a queued scene
 * operation. `scene` is accepted so callers read symmetrically with `createAudio`; the manager holds
 * its own references and does not need it.
 */
export function destroyAudio(_scene: Phaser.Scene): void {
  current?.destroy();
  current = null;
}
