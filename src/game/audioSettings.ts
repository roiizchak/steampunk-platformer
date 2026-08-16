/**
 * Mute and volume, persisted — criterion 7.4, and the countermeasure to vault 7.5.
 *
 * ## 🔴 A WebAudio getter is not a readback
 *
 * *"On a context that has not resumed — every context before the first gesture — the write is
 * scheduled and the read returns the old value. Never assert on `mute` or `volume` — keep your own
 * flag."*
 *
 * This module IS that flag. It is the truth about what the player chose; `this.sound` is merely
 * where that truth gets applied. Nothing in this project reads playback state back out of WebAudio,
 * and the reason is that before the first user gesture such a read is simply wrong.
 *
 * Engine-free and storage-injected on purpose: no Phaser import, no direct `localStorage` reference,
 * so criterion 7.4 is a Node unit test taking milliseconds rather than a browser round trip. The
 * same functions serve the game (`window.localStorage`) and the suite (a Map-backed fake).
 *
 * ## Why nothing here can throw
 *
 * `localStorage` is the one input to this game that a *user* can edit by hand, that survives a
 * deploy, and that no build step validates. A `JSON.parse` throw would land inside
 * `GameScene.create()`, which leaves `ready:false` with `bootError:null` — the exact
 * indistinguishable hang state `refuseToRoute` exists to prevent. Access itself can throw too:
 * Safari private mode and a disabled-storage origin both raise on `getItem`.
 *
 * So every path returns usable settings. A corrupt volume falls back to the default **without**
 * discarding a valid `muted` beside it — losing a deliberate mute because the volume was malformed
 * would blast a muted player at full level, which is the worst available direction to fail in.
 */

/** The one key. Namespaced, because `localStorage` is shared across the whole origin. */
export const AUDIO_SETTINGS_KEY = 'steampunk.audio';

export interface AudioSettings {
  muted: boolean;
  /** Master volume, 0–1. Multiplies the per-cue gains the catalog carries. */
  volume: number;
}

/**
 * Full volume by default, and that is a considered choice rather than an omission.
 *
 * The per-cue gains in `public/assets/index.json` are already solved so the worst-case simultaneous
 * stack lands at −3 dBFS *(tools/gen/build-audio.mjs)*. The headroom is in the mix, so a master
 * volume below 1 would be a second, undocumented attenuation on top of a measured one — and the
 * number criterion 7.2 passes on would no longer be the number the player hears.
 */
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, volume: 1 };

/** Ten presses from silent to full. */
export const VOLUME_STEP = 0.1;

/** The slice of `Storage` this module needs. Narrow on purpose, so a fake is three lines. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isUsableVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Read the player's settings. Returns the defaults for anything unusable, and never throws.
 *
 * @param storage typically `safeLocalStorage()`; a fake in tests; `null` where storage is refused.
 */
export function readAudioSettings(storage: SettingsStorage | null): AudioSettings {
  let stored: unknown;
  try {
    const raw = storage?.getItem(AUDIO_SETTINGS_KEY) ?? null;
    if (raw === null) {
      return { ...DEFAULT_AUDIO_SETTINGS };
    }
    stored = JSON.parse(raw);
  } catch {
    // Either the origin refuses storage or the value is not JSON. Both are the player's problem to
    // have caused and neither is worth a boot failure.
    return { ...DEFAULT_AUDIO_SETTINGS };
  }

  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }

  const { muted, volume } = stored as Partial<AudioSettings>;
  return {
    muted: typeof muted === 'boolean' ? muted : DEFAULT_AUDIO_SETTINGS.muted,
    volume: isUsableVolume(volume) ? volume : DEFAULT_AUDIO_SETTINGS.volume,
  };
}

/** Persist the settings, clamping the volume. Never throws — a full quota is not a crash. */
export function writeAudioSettings(storage: SettingsStorage | null, settings: AudioSettings): void {
  try {
    storage?.setItem(
      AUDIO_SETTINGS_KEY,
      JSON.stringify({ muted: settings.muted, volume: clampVolume(settings.volume) }),
    );
  } catch {
    // Quota, private mode, a disabled origin. The setting still applies for this session; it just
    // will not survive a reload, which is strictly better than refusing to change the volume.
  }
}

/**
 * Move the volume one step, clamped.
 *
 * Rounded to two places because repeated float addition drifts: ten `+0.1` steps from zero reach
 * `0.9999999999999999`, which is inaudibly different from 1 and *visibly* different to an assertion.
 * Criterion 7.4 compares a persisted number across a reload, and a gate that flakes on float dust
 * is a gate nobody trusts.
 */
export function stepVolume(volume: number, direction: 1 | -1): number {
  return clampVolume(Math.round((volume + direction * VOLUME_STEP) * 100) / 100);
}

/**
 * `window.localStorage`, or `null` where the origin refuses it.
 *
 * 🔴 **The property getter itself throws** — this is not the same hazard as `getItem` throwing, and
 * the difference is what the code-reviewer's brief caught. In Chrome with site data blocked, and
 * inside a sandboxed iframe, merely *evaluating* `window.localStorage` raises `SecurityError`. Every
 * `try` in this module wraps a call on an already-obtained `Storage`, so an access written as
 * `readAudioSettings(window.localStorage)` throws at the argument, before any of that protection is
 * reached — and it throws inside `GameScene.create()`, which is the `ready:false` / `bootError:null`
 * hang this module's header says it exists to avoid.
 *
 * Kept here rather than in the caller so there is one place that knows the getter is dangerous, and
 * `null` rather than a no-op fake so the "no storage" case stays visible in the types.
 */
export function safeLocalStorage(): SettingsStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
