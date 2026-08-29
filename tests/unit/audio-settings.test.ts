/**
 * Mute and volume that persist — criterion 7.4, and vault 7.5's whole point.
 *
 * ## 🔴 A WebAudio getter is not a readback
 *
 * *"On a context that has not resumed — every context before the first gesture — the write is
 * scheduled and the read returns the old value. **Never assert on `mute` or `volume`** — keep your
 * own flag."*
 *
 * These functions ARE that flag. They are engine-free, take the storage as an argument, and never
 * touch Phaser, so criterion 7.4 can be asserted in a Node unit test in milliseconds — against the
 * value the game believes, which is the only value that means anything before the audio context has
 * resumed.
 *
 * ## Why every malformed case has a test
 *
 * `localStorage` is the one input to this game that a *user* can edit, that survives a deploy, and
 * that no build step validates. A `JSON.parse` throw here happens during `GameScene.create()`, which
 * leaves `ready:false` with `bootError:null` — the exact indistinguishable hang state
 * `refuseToRoute` exists to prevent. So the reader cannot throw, and it cannot return a shape the
 * caller has to re-check either: it returns usable settings or the defaults, always.
 */

import { describe, expect, it } from 'vitest';

import {
  AUDIO_SETTINGS_KEY,
  DEFAULT_AUDIO_SETTINGS,
  VOLUME_LADDER,
  readAudioSettings,
  stepVolume,
  writeAudioSettings,
} from '../../src/game/audioSettings';

/** A `Storage`-shaped fake. vitest runs in Node, so there is no real `localStorage` here. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    /** Test-only view of what was actually persisted. */
    raw: () => map,
  };
}

describe('readAudioSettings tolerates everything a user can put in localStorage', () => {
  it('returns the defaults when nothing has ever been saved', () => {
    expect(readAudioSettings(fakeStorage())).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('reads back what was written', () => {
    const storage = fakeStorage();
    writeAudioSettings(storage, { muted: true, volume: 0.4 });
    expect(readAudioSettings(storage)).toEqual({ muted: true, volume: 0.4 });
  });

  it.each([
    ['not JSON at all', 'muted!'],
    ['JSON that is not an object', '42'],
    ['null', 'null'],
    ['an array', '[]'],
    ['an object with the wrong types', '{"muted":"yes","volume":"loud"}'],
    ['an object missing both fields', '{}'],
    ['a volume above 1', '{"muted":false,"volume":9}'],
    ['a negative volume', '{"muted":false,"volume":-3}'],
    ['a NaN volume', '{"muted":false,"volume":null}'],
  ])('falls back to the defaults for %s', (_label, stored) => {
    // A throw here lands inside `GameScene.create()`, which leaves ready:false with bootError:null —
    // the indistinguishable hang state the whole boot gate exists to prevent.
    const storage = fakeStorage({ [AUDIO_SETTINGS_KEY]: stored });
    expect(() => readAudioSettings(storage)).not.toThrow();
    expect(readAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('keeps a valid muted flag even when the volume beside it is junk', () => {
    // Partial recovery is deliberate: losing a deliberate mute because the volume was corrupt would
    // blast a muted player at full level, which is the worst possible direction to fail in.
    const storage = fakeStorage({ [AUDIO_SETTINGS_KEY]: '{"muted":true,"volume":"loud"}' });
    expect(readAudioSettings(storage)).toEqual({ muted: true, volume: DEFAULT_AUDIO_SETTINGS.volume });
  });

  it('survives storage that throws — private mode, quota, a disabled origin', () => {
    const hostile = {
      getItem: () => {
        throw new DOMException('The operation is insecure.');
      },
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    };
    expect(readAudioSettings(hostile)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(() => writeAudioSettings(hostile, { muted: true, volume: 1 })).not.toThrow();
  });
});

describe('writeAudioSettings', () => {
  it('persists under one known key, so a reload finds it', () => {
    const storage = fakeStorage();
    writeAudioSettings(storage, { muted: true, volume: 0.25 });
    expect(storage.raw().has(AUDIO_SETTINGS_KEY)).toBe(true);
  });

  it('clamps a volume outside range rather than persisting it', () => {
    const storage = fakeStorage();
    writeAudioSettings(storage, { muted: false, volume: 5 });
    expect(readAudioSettings(storage).volume).toBe(1);
  });

  it('round-trips the default settings unchanged', () => {
    const storage = fakeStorage();
    writeAudioSettings(storage, DEFAULT_AUDIO_SETTINGS);
    expect(readAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });
});

describe('stepVolume', () => {
  it('moves to the next stop in each direction', () => {
    expect(stepVolume(0.5, 1)).toBe(0.71);
    expect(stepVolume(0.5, -1)).toBe(0.35);
  });

  it('clamps at both ends instead of running past them', () => {
    expect(stepVolume(1, 1)).toBe(1);
    expect(stepVolume(0, -1)).toBe(0);
  });

  it('lands exactly on 0 and 1 rather than near them', () => {
    // A volume of 0.9999999 is indistinguishable from 1 by ear but not by an assertion — which
    // makes criterion 7.4's persistence check flaky for no reason. Reading the stops out of a table
    // rather than accumulating them is what makes this true by construction.
    let volume = 0;
    for (let i = 0; i < 40; i += 1) volume = stepVolume(volume, 1);
    expect(volume).toBe(1);
    for (let i = 0; i < 40; i += 1) volume = stepVolume(volume, -1);
    expect(volume).toBe(0);
  });

  it('walks the whole ladder and visits every stop exactly once', () => {
    const climbed: number[] = [];
    let volume = 0;
    for (let i = 0; i < VOLUME_LADDER.length - 1; i += 1) {
      volume = stepVolume(volume, 1);
      climbed.push(volume);
    }
    expect(climbed, 'a press must never skip a stop or repeat one').toEqual(
      VOLUME_LADDER.slice(1),
    );
  });

  /**
   * 🔴 The gate the OLD ladder fails, and the whole reason this one exists.
   *
   * The complaint was not "the keys do nothing" — they worked. It was that a press near the top
   * changed nothing audible while a press near the bottom lurched. That is a statement about the
   * RATIO between consecutive stops, so that is what is asserted; a bound on the gain difference
   * cannot express it and is the statistic that shipped the defect.
   *
   * Watched red against the old ladder: ten linear tenths measure 6.02 dB from 0.1 to 0.2 and 0.92
   * dB from 0.9 to 1.0 \u2014 both ends failing this range, from opposite directions.
   */
  it('every audible step is the same size TO THE EAR, not to the number', () => {
    const audible = VOLUME_LADDER.filter((stop) => stop > 0);
    const stepsDb = audible
      .slice(1)
      .map((stop, i) => 20 * Math.log10(stop / audible[i]!));

    for (const [i, db] of stepsDb.entries()) {
      expect(db, `step ${i} of the ladder is ${db.toFixed(2)} dB`).toBeGreaterThan(2.5);
      expect(db, `step ${i} of the ladder is ${db.toFixed(2)} dB`).toBeLessThan(3.6);
    }
    // And the ladder has to cover a useful range, or an even step is even and useless.
    expect(20 * Math.log10(audible[0]! / 1), 'the quietest audible stop').toBeLessThan(-20);
  });

  /**
   * A stored volume need not be ON the ladder: a save written before the ladder existed, or a
   * hand-edited `localStorage`. Nearest-stop-then-step would move the wrong way from 0.36 — nearest
   * is 0.35, so `[` would return 0.25 and skip a stop that was already below the player.
   */
  it.each([
    [0.36, 0.35, 0.5],
    [0.4, 0.35, 0.5],
    [0.9, 0.71, 1],
    [0.01, 0, 0.06],
  ])('an off-ladder %s steps down to %s and up to %s', (from, down, up) => {
    expect(stepVolume(from, -1)).toBe(down);
    expect(stepVolume(from, 1)).toBe(up);
  });

  it('a volume outside 0–1 is clamped before it is stepped', () => {
    expect(stepVolume(5, -1)).toBe(0.71);
    expect(stepVolume(-5, 1)).toBe(0.06);
  });
});
