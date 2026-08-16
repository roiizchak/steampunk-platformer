/**
 * The loudness instrument — `tools/gen/wav.mjs` and `tools/gen/audioGate.mjs`, criteria 7.2 and 7.3.
 *
 * ## 🔴 Vault 7.3 is about the INSTRUMENT, not the files
 *
 * *"A +2.00 dBFS master decoded as 16-bit integer reports its peak as exactly 0.0 — the instrument
 * saturates at the value it is supposed to detect."* Every sample here therefore travels as
 * `Float32Array`, and the summing test below is the one that proves it: two cues at −3 dBFS added
 * together are **hotter than full scale**, and an instrument that clamps would report a comfortable
 * 0.0 and pass criterion 7.2 on a mix that clips.
 *
 * What the probe generation actually returned refines this usefully, and it is measured rather than
 * assumed: `fal-ai/stable-audio-3/small/sfx/text-to-audio` emits **16-bit integer PCM**. So no single
 * shipped cue can exceed 0 dBFS — the container will not carry it. The entire clipping risk is in the
 * **sum**, which is exactly what 7.2 measures and exactly why the sum is computed in float.
 *
 * ## Why the decoder lives in `tools/gen/`
 *
 * vitest runs `environment: 'node'`, so there is no `AudioContext` and no `decodeAudioData`. And a
 * test cannot call `readFileSync` itself: `@types/node` is deliberately not a dependency and `tests/`
 * is inside the typecheck program. `tools/gen/` is outside it, which is why `png.mjs` already carries
 * `readPng`/`readBytes` for the shipped sheets. `wav.mjs` is that same bridge for audio.
 *
 * ⚠️ Vite's `?arraybuffer` glob query does NOT return decodable bytes under vitest — it was tried for
 * PNGs and every gate threw a signature mismatch (`shipped-sheets.test.ts:43-47`). Do not retry it.
 */

import { describe, expect, it } from 'vitest';

import { decodeWav } from '../../tools/gen/wav.mjs';
import { SILENCE_FLOOR_DBFS, peakDbfs, sumPeakDbfs } from '../../tools/gen/audioGate.mjs';

/** Encode a 16-bit PCM WAV the way the endpoint does, so the decoder is tested on the real shape. */
function wavBytes(channels: number[][], sampleRate = 44100): Uint8Array {
  const frames = channels[0]!.length;
  const blockAlign = channels.length * 2;
  const dataBytes = frames * blockAlign;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) out[offset + i] = text.charCodeAt(i);
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let f = 0; f < frames; f += 1) {
    for (const channel of channels) {
      view.setInt16(offset, channel[f]!, true);
      offset += 2;
    }
  }
  return out;
}

/** A constant-amplitude channel, in int16 units. */
const flat = (value: number, frames = 64): number[] => Array.from({ length: frames }, () => value);

const FULL_SCALE = 32767;

describe('decodeWav', () => {
  it('reads a 16-bit stereo file into per-channel Float32Array, normalised to ±1', () => {
    const decoded = decodeWav(wavBytes([flat(FULL_SCALE), flat(-16384)]));

    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels).toHaveLength(2);
    // Type before value *(vault C1)*: a plain array would satisfy every numeric assertion below
    // while silently being the wrong precision, which is the whole subject of 7.3.
    expect(decoded.channels[0]).toBeInstanceOf(Float32Array);
    expect(decoded.channels[0]![0]).toBeCloseTo(1, 4);
    expect(decoded.channels[1]![0]).toBeCloseTo(-0.5, 4);
  });

  it('refuses bytes that are not a RIFF/WAVE file rather than decoding garbage', () => {
    expect(() => decodeWav(new Uint8Array([1, 2, 3, 4]))).toThrow(/RIFF|WAVE|not a wav/i);
  });

  it('refuses a bit depth it cannot decode, naming it', () => {
    const bytes = wavBytes([flat(1000)]);
    new DataView(bytes.buffer).setUint16(34, 24, true); // claim 24-bit
    // Silently misreading 24-bit as 16-bit produces numbers, and numbers look like measurements.
    expect(() => decodeWav(bytes)).toThrow(/24/);
  });
});

describe('peakDbfs', () => {
  it('reports full scale as 0 dBFS', () => {
    expect(peakDbfs(decodeWav(wavBytes([flat(FULL_SCALE)])).channels)).toBeCloseTo(0, 2);
  });

  it('reports half scale as about -6 dBFS', () => {
    expect(peakDbfs(decodeWav(wavBytes([flat(16384)])).channels)).toBeCloseTo(-6.02, 1);
  });

  it('reports digital silence at the floor sentinel, not -Infinity', () => {
    // -Infinity propagates through every later comparison and formats as "-Infinity" in a report.
    // A finite sentinel keeps criterion 7.3's "no cue is silent" check readable when it fails.
    expect(peakDbfs(decodeWav(wavBytes([flat(0)])).channels)).toBe(SILENCE_FLOOR_DBFS);
  });

  it('takes the loudest sample across every channel, not just the first', () => {
    const quietLeftLoudRight = decodeWav(wavBytes([flat(100), flat(FULL_SCALE)])).channels;
    expect(peakDbfs(quietLeftLoudRight)).toBeCloseTo(0, 2);
  });
});

describe('sumPeakDbfs — criterion 7.2, and the reason vault 7.3 exists', () => {
  it('two cues at -3 dBFS sum ABOVE full scale, and the instrument says so', () => {
    // 🔴 THE test. Each input is a legal 16-bit file that cannot itself clip. Their sum is +3.0 dBFS.
    // An instrument that accumulated into 16-bit integers, or clamped to ±1 before measuring, would
    // report exactly 0.0 — a comfortable pass on a mix that clips. That is the saturation failure
    // vault 7.3 records, reproduced here as a committed case rather than described in a comment.
    const minus3 = Math.round(FULL_SCALE * 10 ** (-3 / 20));
    const cue = decodeWav(wavBytes([flat(minus3)])).channels;

    const summed = sumPeakDbfs([cue, cue]);

    expect(summed).toBeGreaterThan(0);
    expect(summed).toBeCloseTo(3.0, 1);
  });

  it('sums a full stack of cues over a bed, aligning on the loudest overlap', () => {
    const at = (dbfs: number) =>
      decodeWav(wavBytes([flat(Math.round(FULL_SCALE * 10 ** (dbfs / 20)))])).channels;

    // Six cues at -20 dBFS over two beds at -26. Sum = 6*0.1 + 2*0.0501 = 0.7002 -> about -3.1 dBFS.
    const stack = sumPeakDbfs([at(-20), at(-20), at(-20), at(-20), at(-20), at(-20), at(-26), at(-26)]);
    expect(stack).toBeCloseTo(-3.1, 1);
  });

  it('sums cues of different lengths without reading past the short one', () => {
    const long = decodeWav(wavBytes([flat(8000, 128)])).channels;
    const short = decodeWav(wavBytes([flat(8000, 8)])).channels;

    const summed = sumPeakDbfs([long, short]);

    expect(Number.isFinite(summed)).toBe(true);
    // The overlap is where they add; a NaN here means the short cue's absent samples were read.
    expect(summed).toBeCloseTo(peakDbfs(decodeWav(wavBytes([flat(16000, 8)])).channels), 1);
  });

  it('an empty stack is silence, not a crash', () => {
    expect(sumPeakDbfs([])).toBe(SILENCE_FLOOR_DBFS);
  });
});
