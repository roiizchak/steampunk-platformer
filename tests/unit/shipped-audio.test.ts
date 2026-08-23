/**
 * Criterion 7.3 — **no cue is silent**, measured on the shipped bytes, never listened to.
 *
 * Vault 7.1's whole point: *"very short and clean"* returned a file that played, loaded fine, and was
 * **−37.9 dBFS of nothing**. Nobody hears that as broken; they hear it as a quiet game. So the gate
 * is a measurement of what is in `public/assets/audio/`, taken through a float decode *(vault 7.3)*,
 * against the catalog rows that name it — the same "run the real validator over the shipped bytes"
 * rule `tilemap-data.test.ts` follows for levels *(vault 3.1)*.
 *
 * ## What this file does NOT own
 *
 * **Criterion 7.2, the clipping stack.** That stack mixes WAV cues with OGG beds, and Node cannot
 * decode OGG. Measuring the WAV half here and the OGG half elsewhere would be two correct halves
 * that never meet — Codex plan review F2. So 7.2 is computed in ONE calculation in the browser,
 * where `decodeAudioData` handles both containers, and this file deliberately does not assert it.
 * The split is **by criterion, not by container**.
 *
 * The beds are still checked here for existence and plausibility, because "the file is 200 bytes"
 * is worth catching in 9 ms rather than in a browser.
 */

import { describe, expect, it } from 'vitest';

import catalog from '../../public/assets/index.json';
import { AUDIO_CUES } from '../../src/sim/audioCues';
import { SILENCE_FLOOR_DBFS, measureCue } from '../../tools/gen/audioGate.mjs';
import { readBytes } from '../../tools/gen/png.mjs';
import { readWav } from '../../tools/gen/wav.mjs';
import type { AudioEntry } from '../../src/game/assetCatalog';

const AUDIO = catalog.audio as AudioEntry[];
const CUES = AUDIO.filter((row) => row.url.endsWith('.wav'));
const BEDS = AUDIO.filter((row) => row.url.endsWith('.ogg'));

/**
 * The floor a cue must clear.
 *
 * −20 dBFS, and it is chosen from what is CORRECT rather than fitted to our files: it is 18 dB above
 * the −37.9 dBFS that vault 7.1 records as the silent failure, and far below the −9.2 dBFS of our
 * quietest master. A cue between the two is neither the failure nor anything we have shipped, and it
 * should be looked at rather than waved through.
 *
 * Note this measures the FILE, not the mix. Playback gain lives in the catalog and is checked
 * separately — a cue is allowed to be quiet in the mix; it is not allowed to be empty on disk.
 */
const MIN_CUE_PEAK_DBFS = -20;

/** A cue shorter than this is a click, not a sound. */
const MIN_CUE_SECONDS = 0.05;
/** A one-shot longer than this is a bed that lost its loop flag. */
const MAX_CUE_SECONDS = 2.1;

describe('the catalog and the files on disk agree', () => {
  it('every catalog audio row points at a file that exists', () => {
    for (const row of AUDIO) {
      // `readBytes` throws on a missing path, which is the assertion — a `toBeDefined` on a value
      // read from a file that is not there never runs.
      expect(() => readBytes(`public/${row.url}`), `${row.key} at ${row.url}`).not.toThrow();
    }
  });

  it('ships every declared cue and two beds', () => {
    // 🔴 Re-taken 2026-08-23: this was `toHaveLength(9)` and inventory 3.6 made it ten. The count
    // is now read off `AUDIO_CUES` rather than restated, so adding an eleventh cue cannot leave
    // this assertion quietly describing the previous game *(vault 5.3)*.
    const declared = new Set(Object.values(AUDIO_CUES));
    expect(CUES).toHaveLength(declared.size);
    expect(BEDS).toHaveLength(2);
  });
});

describe('criterion 7.3 — no cue is silent, measured', () => {
  it.each(CUES.map((row) => [row.key, row] as const))('%s clears the silence floor', (_key, row) => {
    const { peakDbfs, floorDbfs } = measureCue(readWav(`public/${row.url}`).channels);

    expect(peakDbfs).toBeGreaterThan(MIN_CUE_PEAK_DBFS);
    // And it is not a DC block or a constant tone: something in it is quieter than its own peak.
    expect(floorDbfs).toBeLessThan(peakDbfs);
    expect(floorDbfs).toBeGreaterThan(SILENCE_FLOOR_DBFS);
  });

  it.each(CUES.map((row) => [row.key, row] as const))('%s is a cue-length one-shot', (_key, row) => {
    const { frames, sampleRate } = readWav(`public/${row.url}`);
    const seconds = frames / sampleRate;

    // Vault 7.1's trim rule, asserted on the result rather than on the trimmer. The untrimmed
    // masters are 8 seconds each; shipping one would mean a jump cue still sounding two jumps later.
    expect(seconds).toBeGreaterThan(MIN_CUE_SECONDS);
    expect(seconds).toBeLessThan(MAX_CUE_SECONDS);
  });

  it('every cue starts near silence, so its attack was not clipped', () => {
    // Vault 7.1's second half — the trim reaches back BEFORE the loudest moment. If the first sample
    // is already at the peak, the leading edge of the transient was cut off and the strike became a
    // thump.
    for (const row of CUES) {
      const { channels } = readWav(`public/${row.url}`);
      const first = Math.max(...channels.map((channel) => Math.abs(channel[0]!)));
      const peak = Math.max(
        ...channels.map((channel) => channel.reduce((max, s) => Math.max(max, Math.abs(s)), 0)),
      );
      expect(first, `${row.key} starts at ${first.toFixed(3)} against a peak of ${peak.toFixed(3)}`)
        .toBeLessThan(peak * 0.5);
    }
  });

  it('every cue ends at silence, so the cut cannot click', () => {
    for (const row of CUES) {
      const { channels } = readWav(`public/${row.url}`);
      const last = Math.max(...channels.map((channel) => Math.abs(channel[channel.length - 1]!)));
      // A hard edit at a non-zero amplitude is a step discontinuity — broadband noise that sounds
      // exactly like the impact the cue is meant to be.
      expect(last, `${row.key} ends at ${last.toFixed(4)}`).toBeLessThan(0.01);
    }
  });
});

describe('the beds — existence and plausibility only; their level is a browser measurement', () => {
  it.each(BEDS.map((row) => [row.key, row] as const))('%s is a substantial OGG', (_key, row) => {
    const bytes = readBytes(`public/${row.url}`);

    // OggS magic. A file that is not an Ogg container will not decode in the browser either, and
    // finding that out here costs nothing.
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe('OggS');
    // A silent 120-second bed compresses to almost nothing. This will not catch a quiet bed — only
    // the browser gate can — but it catches an empty one for free.
    expect(bytes.length).toBeGreaterThan(200_000);
  });

  it('both beds loop and no cue does', () => {
    for (const row of AUDIO) {
      expect(row.loop, `${row.key}`).toBe(row.url.endsWith('.ogg'));
    }
  });
});

describe('the mix is inside the budget it was solved against', () => {
  it('every gain is in (0, 1]', () => {
    for (const row of AUDIO) {
      expect(row.gain, row.key).toBeGreaterThan(0);
      expect(row.gain, row.key).toBeLessThanOrEqual(1);
    }
  });

  it('both beds are quieter than every cue — they are the only always-on sources', () => {
    const loudestBed = Math.max(...BEDS.map((row) => row.gain));
    const quietestCue = Math.min(...CUES.map((row) => row.gain));
    expect(loudestBed).toBeLessThan(quietestCue);
  });
});
