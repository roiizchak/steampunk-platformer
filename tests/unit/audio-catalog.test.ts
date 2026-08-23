/**
 * The catalog's `audio` list — criterion 7.5b, and the boot gate that stands behind it.
 *
 * `audio` is **required and non-empty**, for exactly the reason Codex's Phase 3 plan review (P3) made
 * `levels` required: an optional list is how a typo'd key ships a game with no audio and a boot that
 * is perfectly happy about it. That is Phase 1's "zero expectations satisfy themselves" failure,
 * rebuilt at a new field — and this time it would ship as *silence*, which is the one defect a player
 * is most likely to assume is their own speakers.
 *
 * `gain` is validated as hard as `frameWidth` is, and for the same reason: it is a number the manager
 * hands straight to Phaser without checking. A `gain` of 0 loads, plays, and is inaudible; a `gain`
 * above 1 amplifies past the level criterion 7.2's clipping budget was solved for, which is the one
 * way to break that budget from a data file rather than from code.
 */

import { describe, expect, it } from 'vitest';

import { describeCatalogProblem } from '../../src/game/assetCatalog';
import type { AssetCatalog, AudioEntry } from '../../src/game/assetCatalog';
import shipped from '../../public/assets/index.json';

const AUDIO: AudioEntry = { key: 'sfx-hit', url: 'assets/audio/hit.wav', gain: 0.2, loop: false };

/** A catalog that is valid apart from whatever the caller overrides. */
function catalogWith(audio: unknown): AssetCatalog {
  return {
    images: [{ key: 'tile', url: 'assets/tiles/walkway.png' }],
    levels: [{ key: 'level-01', url: 'assets/levels/level-01.tmj' }],
    sheets: [
      {
        key: 'sheet',
        url: 'assets/characters/x.png',
        frameWidth: 8,
        frameHeight: 8,
        frameCount: 2,
        fps: 10,
        loop: true,
        simTicks: 12,
        derivedFrom: 'sim',
      },
    ],
    audio: audio as AudioEntry[],
  };
}

describe('the audio list is required, like levels and sheets', () => {
  it('accepts a well-formed catalog', () => {
    expect(describeCatalogProblem(catalogWith([AUDIO]))).toBeNull();
  });

  it('rejects a catalog with no audio list at all', () => {
    expect(describeCatalogProblem(catalogWith(undefined))).toMatch(/audio/i);
  });

  it('rejects an empty audio list — zero expectations satisfy themselves', () => {
    expect(describeCatalogProblem(catalogWith([]))).toMatch(/no audio/i);
  });

  it('rejects a non-object entry, which would throw while queueing and hang boot', () => {
    expect(describeCatalogProblem(catalogWith([null]))).toMatch(/non-object audio entry/i);
  });

  it('rejects an empty url', () => {
    expect(describeCatalogProblem(catalogWith([{ ...AUDIO, url: '' }]))).toMatch(/url/i);
  });

  it('rejects a key that collides with another kind — one namespace, checked once', () => {
    expect(describeCatalogProblem(catalogWith([{ ...AUDIO, key: 'level-01' }]))).toMatch(/duplicate/i);
  });
});

describe('gain is validated as hard as a frame size', () => {
  it.each([
    ['zero', 0],
    ['negative', -0.5],
    ['over unity', 1.5],
    ['not a number', 'loud'],
    ['NaN', Number.NaN],
  ])('rejects %s gain', (_label, gain) => {
    // A gain of 0 loads, plays and is inaudible. A gain over 1 amplifies past the level criterion
    // 7.2's budget was solved for — the only way to break that budget from a data file.
    expect(describeCatalogProblem(catalogWith([{ ...AUDIO, gain }]))).toMatch(/gain/i);
  });

  it('accepts unity gain, which is the legal maximum', () => {
    expect(describeCatalogProblem(catalogWith([{ ...AUDIO, gain: 1 }]))).toBeNull();
  });

  it('rejects a missing loop flag — a loop is a CLAIM (vault 4.23)', () => {
    const { loop: _dropped, ...noLoop } = AUDIO;
    expect(describeCatalogProblem(catalogWith([noLoop]))).toMatch(/loop/i);
  });
});

describe('the SHIPPED catalog satisfies its own validator', () => {
  /**
   * Vault 3.1: run the real validator over the shipped bytes. A rule that only the fixtures obey is
   * a rule the game does not have.
   */
  it('public/assets/index.json passes describeCatalogProblem', () => {
    expect(describeCatalogProblem(shipped as unknown as AssetCatalog)).toBeNull();
  });

  it('ships every cue and both beds', () => {
    const keys = (shipped as unknown as AssetCatalog).audio.map((row) => row.key).sort();
    expect(keys).toEqual([
      'bed-ambience',
      'bed-music',
      'sfx-attack',
      // Added by inventory 3.6, 2026-08-23 — the level-complete sting, on `goalReached`.
      'sfx-complete',
      'sfx-death',
      'sfx-footstep',
      'sfx-hit',
      'sfx-hurt',
      'sfx-jump',
      'sfx-kill',
      'sfx-land',
      'sfx-pickup',
    ]);
  });

  it('loops both beds and no cue — a one-shot that loops never stops', () => {
    for (const row of (shipped as unknown as AssetCatalog).audio) {
      expect(row.loop, `${row.key} loop flag`).toBe(row.key.startsWith('bed-'));
    }
  });
});
