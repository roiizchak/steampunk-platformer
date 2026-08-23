/**
 * Apply a short fade-in to a 16-bit PCM WAV, in place, preserving every chunk but `data`.
 *
 * ## Why this exists
 *
 * Session inventory **2b.8**: `sfx-jump`'s first sample is **0.0888** where every other cue opens
 * under 0.0073 — measured across all nine shipped cues on 2026-08-23. A waveform that starts at
 * 8.9 % of full scale is a step discontinuity, and a step is a click. It is on the cue the player
 * triggers more than any other.
 *
 * A fade is the right fix rather than a trim: trimming to the first zero crossing throws away the
 * transient that makes a jump read as a jump. A ramp keeps the transient and removes the step.
 *
 * ## Why 2 ms
 *
 * 88 samples at 44.1 kHz. Long enough that the discontinuity is gone, short enough to be inaudible
 * as an envelope — a jump cue's own attack is an order of magnitude longer. Anything approaching
 * 10 ms would soften the transient, which is the thing being protected.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const DEFAULT_FADE_MS = 2;

/** Parse enough of a RIFF/WAVE file to find `fmt ` and `data`. Returns null if it is not 16-bit PCM. */
export function parseWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  let pos = 12;
  let fmt = null;
  let dataStart = -1;
  let dataSize = 0;
  while (pos + 8 <= buffer.length) {
    const id = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      fmt = {
        channels: buffer.readUInt16LE(pos + 10),
        rate: buffer.readUInt32LE(pos + 12),
        bits: buffer.readUInt16LE(pos + 22),
      };
    } else if (id === 'data') {
      dataStart = pos + 8;
      dataSize = size;
    }
    pos += 8 + size + (size % 2);
  }
  if (fmt === null || dataStart < 0 || fmt.bits !== 16) return null;
  return { ...fmt, dataStart, dataSize };
}

/** The absolute value of the first sample, 0..1. The number 2b.8 is about. */
export function firstSampleMagnitude(buffer) {
  const wav = parseWav(buffer);
  if (wav === null || wav.dataSize < 2) return null;
  return Math.abs(buffer.readInt16LE(wav.dataStart) / 32768);
}

/**
 * Ramp the opening `fadeMs` of every channel from silence to full.
 *
 * Operates on the buffer in place and returns it, so the caller decides whether to write.
 */
export function fadeInWav(buffer, fadeMs = DEFAULT_FADE_MS) {
  const wav = parseWav(buffer);
  if (wav === null) throw new Error('fadeInWav: not a 16-bit PCM WAV');
  const frames = Math.min(
    Math.floor((wav.rate * fadeMs) / 1000),
    Math.floor(wav.dataSize / 2 / wav.channels),
  );
  for (let frame = 0; frame < frames; frame += 1) {
    // Linear, not equal-power: this is a discontinuity fix, not a crossfade, and a linear ramp is
    // the one that reaches exactly zero at sample zero.
    const gain = frame / frames;
    for (let ch = 0; ch < wav.channels; ch += 1) {
      const offset = wav.dataStart + (frame * wav.channels + ch) * 2;
      buffer.writeInt16LE(Math.round(buffer.readInt16LE(offset) * gain), offset);
    }
  }
  return buffer;
}

/** CLI: `node tools/gen/audioFade.mjs <file.wav> [fadeMs]` */
if (process.argv[1]?.endsWith('audioFade.mjs')) {
  const path = process.argv[2];
  const ms = Number(process.argv[3] ?? DEFAULT_FADE_MS);
  if (path === undefined) {
    console.error('usage: node tools/gen/audioFade.mjs <file.wav> [fadeMs]');
    process.exit(1);
  }
  const before = readFileSync(path);
  const was = firstSampleMagnitude(before);
  writeFileSync(path, fadeInWav(Buffer.from(before), ms));
  const now = firstSampleMagnitude(readFileSync(path));
  console.log(`${path}: first sample ${was?.toFixed(4)} -> ${now?.toFixed(4)} (${ms}ms fade)`);
}

/**
 * The float-domain fade, applied by `build-audio.mjs` immediately after `trimToEvent`.
 *
 * 🔴 **This is where the 2b.8 fix belongs, and the byte-level `fadeInWav` above is not.**
 *
 * `trimToEvent` cuts each master back to just before its loudest moment *(vault 7.1)*. That cut
 * lands on whatever sample happens to be there — it is not a zero crossing, and nothing made it
 * one. So the trim **creates** the discontinuity: `jump` opened at 0.0888 not because the master
 * did, but because that is where its event began.
 *
 * Fixing the shipped `.wav` after the fact would therefore be undone by the next
 * `npm run assets:audio`, silently, with the click back and every gate green. Fading here makes it
 * a property of the pipeline instead of a property of one file.
 *
 * Applied to EVERY cue rather than only the one that was measurably bad: the others are small
 * because their events happen to start quietly, which is luck, not design.
 */
export function fadeInChannels(channels, rate, fadeMs = DEFAULT_FADE_MS) {
  const frames = Math.min(Math.floor((rate * fadeMs) / 1000), channels[0]?.length ?? 0);
  for (const channel of channels) {
    for (let i = 0; i < frames; i += 1) channel[i] *= i / frames;
  }
  return channels;
}
