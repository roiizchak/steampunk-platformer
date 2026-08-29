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

  /**
   * 🔴 **Compared as LOUDNESS, not as raw gain — and the difference is a shipped bug.**
   *
   * This read `max(bed.gain) < min(cue.gain)` until 2026-08-29, which compares two numbers that do
   * not mean the same thing. A cue's gain multiplies a **peak-normalised** signal; a bed's gain
   * multiplies the raw OGG, because Node cannot decode it and `normalise` falls back to 1. So the
   * assertion held while `bed-music` was reaching the player at −48.6 dBFS RMS — not "quieter than
   * every cue" but **inaudible**, which is what the owner reported after playing.
   *
   * The claim is right and the statistic was wrong, so the statistic is replaced rather than the
   * bound moved. A bed's post-gain **RMS** against a one-shot's post-gain **peak** is the comparison
   * that orders the thing this test is named after — and it still fails the moment a bed is mixed
   * above the action, which is the defect it exists to catch.
   */
  it('both beds sit below every cue in what a listener HEARS, not in raw gain', () => {
    // Measured from the shipped masters with `ffmpeg -af volumedetect`; see `BED_MAKEUP_DB` in
    // tools/gen/build-audio.mjs for the commands and why this cannot be computed in Node.
    const BED_DBFS: Record<string, { peak: number; rms: number }> = {
      'bed-music': { peak: -5.5, rms: -24.6 },
      'bed-ambience': { peak: 0.0, rms: -19.2 },
    };
    const db = (linear: number): number => 20 * Math.log10(linear);

    // A one-shot is peak-normalised by `build-audio`, so its shipped PEAK is exactly its gain in dB.
    const quietestCuePeak = Math.min(...CUES.map((row) => db(row.gain)));

    // 🔴 **Peak against peak.** The first version of this compared a bed's RMS to a cue's peak,
    // which is the same unit mismatch it was written to catch, pointing the other way: at
    // `BED_MAKEUP_DB = 26` the beds reached gain 1.0 and 0.91 — plainly mixed over the action — and
    // the assertion still passed, because a bed's RMS sits 19 dB under its own peak. Watched, 2026-08-29.
    const loudestBedPeak = Math.max(...BEDS.map((row) => BED_DBFS[row.key]!.peak + db(row.gain)));
    expect(
      loudestBedPeak,
      `loudest bed ${loudestBedPeak.toFixed(1)} dBFS peak vs quietest cue ${quietestCuePeak.toFixed(1)} dBFS peak`,
    ).toBeLessThan(quietestCuePeak);

    // 🔴 And a FLOOR in RMS, which is the unit audibility lives in and which the old assertion
    // had no way to express: a bed may sit below the action and still be inaudible. −40 dBFS RMS was
    // the shipped state the owner played and could not hear.
    const loudestBedRms = Math.max(...BEDS.map((row) => BED_DBFS[row.key]!.rms + db(row.gain)));
    expect(
      loudestBedRms,
      `loudest bed ${loudestBedRms.toFixed(1)} dBFS RMS — below the action is not the same as inaudible`,
    ).toBeGreaterThan(-40);
  });
});
