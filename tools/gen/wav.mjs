/**
 * WAV → `Float32Array` per channel. The audio half of the `png.mjs` bridge.
 *
 * ## Why this exists at all
 *
 * vitest runs `environment: 'node'` (`vite.config.ts`), so there is no `AudioContext` and no
 * `decodeAudioData` in the unit suite. And a test cannot call `readFileSync` itself: `@types/node`
 * is deliberately not a dependency and `tests/` is inside the typecheck program. `tools/gen/` is
 * outside that program, which is why `png.mjs` already reads the shipped sheets on the suite's
 * behalf. This is the same bridge for audio, and the same reason.
 *
 * ⚠️ Vite's `?arraybuffer` glob query does NOT return decodable bytes under vitest. It was tried
 * first for PNGs and every gate threw a signature mismatch (`shipped-sheets.test.ts`). Do not retry
 * it here.
 *
 * ## 🔴 Float, all the way through — vault 7.3
 *
 * *"A +2.00 dBFS master decoded as 16-bit integer reports its peak as exactly 0.0 — the instrument
 * saturates at the value it is supposed to detect."* Samples leave this file as `Float32Array`
 * normalised to ±1 and are never accumulated as integers anywhere downstream. Measured fact about
 * our own source: `fal-ai/stable-audio-3/small/sfx/text-to-audio` returns **16-bit integer PCM**, so
 * no single shipped cue can exceed 0 dBFS. The clipping risk is entirely in the sum, which
 * `audioGate.mjs` computes in float for exactly this reason.
 *
 * Deliberately minimal: 16-bit integer and 32-bit float PCM, which is what the pipeline produces and
 * ships. Anything else THROWS, naming the format. Silently misreading a bit depth produces numbers,
 * and numbers look like measurements.
 */

import { readFileSync } from 'node:fs';

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

/**
 * @typedef {object} DecodedWav
 * @property {number} sampleRate
 * @property {Float32Array[]} channels  One entry per channel, samples normalised to ±1.
 * @property {number} frames
 */

function ascii(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/**
 * Decode a RIFF/WAVE byte buffer.
 *
 * Walks the chunk list rather than assuming a 44-byte header: real encoders emit `LIST`, `fact` and
 * `bext` chunks before `data`, and a fixed offset reads those as audio. That is not hypothetical
 * tidiness — it is the difference between measuring a cue and measuring its metadata.
 *
 * @param {Uint8Array} bytes
 * @returns {DecodedWav}
 */
export function decodeWav(bytes) {
  if (bytes.length < 12 || ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WAVE') {
    throw new Error('not a wav: missing RIFF/WAVE signature');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format = null;
  let channelCount = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let data = null;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
      if (format === FORMAT_EXTENSIBLE && size >= 40) {
        // WAVE_FORMAT_EXTENSIBLE hides the real format in the first two bytes of its GUID.
        format = view.getUint16(body + 24, true);
      }
    } else if (id === 'data') {
      data = { start: body, size: Math.min(size, bytes.length - body) };
      break;
    }

    // Chunks are word-aligned: an odd size is followed by a pad byte that is not part of the chunk.
    offset = body + size + (size % 2);
  }

  if (format === null) throw new Error('not a wav: no fmt chunk');
  if (data === null) throw new Error('not a wav: no data chunk');
  if (channelCount < 1) throw new Error(`unsupported wav: ${channelCount} channels`);

  const isFloat = format === FORMAT_FLOAT && bitsPerSample === 32;
  const isPcm16 = format === FORMAT_PCM && bitsPerSample === 16;
  if (!isFloat && !isPcm16) {
    throw new Error(
      `unsupported wav: format ${format}, ${bitsPerSample}-bit. ` +
        'Only 16-bit integer PCM and 32-bit float are decoded, because those are what this ' +
        'pipeline produces — decoding anything else would report numbers that are not measurements.',
    );
  }

  const bytesPerSample = bitsPerSample / 8;
  const frames = Math.floor(data.size / (bytesPerSample * channelCount));
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frames));

  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const at = data.start + (frame * channelCount + channel) * bytesPerSample;
      channels[channel][frame] = isFloat
        ? view.getFloat32(at, true)
        : // 32768 rather than 32767: the int16 range is asymmetric, and dividing by the positive
          // maximum would report a full-scale negative sample as louder than full scale.
          view.getInt16(at, true) / 32768;
    }
  }

  return { sampleRate, channels, frames };
}

/**
 * Read and decode a WAV from disk.
 *
 * Takes a path and does its own file read, exactly like `readPng` — that is the whole point of the
 * bridge. Paths are repository-relative, e.g. `public/assets/audio/hit.wav`.
 *
 * @param {string} path
 * @returns {DecodedWav}
 */
export function readWav(path) {
  return decodeWav(new Uint8Array(readFileSync(path)));
}

/** How far in front of the event the trim starts. Vault 7.1's "before the loudest moment". */
const PREROLL_MS = 30;
/**
 * The event is over once a window falls this far below the loudest window SO FAR.
 *
 * Relative to a running peak, not to the file's peak and not to an absolute floor. Both of those
 * were tried against the real masters and both failed: the masters peak anywhere from −9.2 to
 * 0.0 dBFS, and their noise floor never falls more than about 40 dB down, so an absolute threshold
 * either cuts the quiet cues short or never fires at all.
 */
const TAIL_BELOW_RUNNING_PEAK_DB = -22;
/** Window the tail test is evaluated over. Short enough to catch a gap, long enough to ignore a dip. */
const TAIL_WINDOW_MS = 25;
/** Consecutive quiet windows before the event is called over — 100 ms of "and it stayed quiet". */
const TAIL_WINDOWS_NEEDED = 4;
/**
 * Hard ceiling on a trimmed cue.
 *
 * A master that is loud end to end offers no quiet window to cut on, and a one-shot game cue that
 * runs for eight seconds is wrong regardless of what the file does. Stated rather than emergent.
 */
const MAX_CUE_SECONDS = 2.0;
/** Fade applied to the last of the kept samples, so the cut lands on zero. */
const RELEASE_MS = 25;
/** A master whose peak is below this is nothing — vault 7.1's -37.9 dBFS of silence. */
const SILENT_MASTER_DBFS = -60;

/**
 * Trim a generated master down to its event — vault 7.1.
 *
 * Price is flat per generation, so every cue is generated long and cut here rather than asked for
 * short. Measured onsets across Phase 7's nine masters range from **29 ms to 691 ms**: shipping them
 * untrimmed would mean a jump cue arriving a quarter of a second after the key, which a player reads
 * as broken input rather than as late audio.
 *
 * Three decisions, each of which vault 7.1 or a click artefact forced:
 *
 *  1. **Start `PREROLL_MS` BEFORE the onset**, not at it. A transient's leading edge is part of its
 *     character, and cutting on the threshold crossing turns a strike into a thump. This is the
 *     "reach back before the loudest moment" half of the rule, and it is why the trim cannot just be
 *     "first sample over a threshold".
 *  2. **End where the cue has decayed `TAIL_BELOW_PEAK_DB` below its own peak** — relative, not
 *     absolute, because the nine masters peak anywhere from -9.2 to 0.0 dBFS and one absolute floor
 *     would cut the quiet ones short and let the loud ones run.
 *  3. **Fade the last `RELEASE_MS` to zero.** A hard edit at a non-zero amplitude is a step
 *     discontinuity — broadband noise that sounds exactly like the impact the cue is supposed to be.
 *
 * THROWS on a master that is silent end to end. Returning zero frames there would produce a cue that
 * loads, plays, and is inaudible — which is vault 7.1's original failure wearing a build step.
 *
 * @param {Float32Array[]} channels
 * @param {number} sampleRate
 * @returns {{ channels: Float32Array[], frames: number, startFrame: number }}
 */
export function trimToEvent(channels, sampleRate) {
  const frames = channels[0]?.length ?? 0;
  const magnitudeAt = (frame) => {
    let magnitude = 0;
    for (const channel of channels) {
      const sample = Math.abs(channel[frame]);
      if (sample > magnitude) magnitude = sample;
    }
    return magnitude;
  };

  let peak = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const magnitude = magnitudeAt(frame);
    if (magnitude > peak) peak = magnitude;
  }
  if (peak <= 0 || 20 * Math.log10(peak) < SILENT_MASTER_DBFS) {
    throw new Error(
      `trimToEvent: master is silent (peak ${peak > 0 ? (20 * Math.log10(peak)).toFixed(1) : '-inf'} ` +
        `dBFS, below ${SILENT_MASTER_DBFS}). Vault 7.1: a cue that sounds fine can be nothing at all — ` +
        're-prompt for the physical event rather than shipping this.',
    );
  }

  // Onset at a tenth of peak (-20 dB): high enough to ignore the model's noise floor, low enough to
  // sit before the transient's own leading edge.
  const onsetThreshold = peak * 0.1;
  let onset = 0;
  while (onset < frames && magnitudeAt(onset) < onsetThreshold) onset += 1;

  // 🔴 THE FIRST event, not the whole file. The masters are 8 seconds because price is flat per
  // generation, and the model filled the time: `hurt` decays to −67 dB and then returns to 0 dB at
  // 1.85 s, `land` at 1.5 s. They are two or three takes in one file. Walking backwards from the end
  // for the first sample above a threshold — the obvious implementation, and the one written first —
  // returns 6.3-second cues containing every take.
  //
  // So: scan FORWARD in windows from the onset, and stop at the first run of quiet ones. Quiet is
  // measured against the loudest window seen so far, because a cue can keep building (`kill` peaks a
  // full second in) and a threshold fixed at the onset's level would end it during its own crescendo.
  const window = Math.max(1, Math.round((TAIL_WINDOW_MS / 1000) * sampleRate));
  const cap = onset + Math.round(MAX_CUE_SECONDS * sampleRate);
  const limit = Math.min(frames, cap);
  let runningPeak = 0;
  let quietRun = 0;
  let end = limit;
  for (let windowStart = onset; windowStart < limit; windowStart += window) {
    let windowPeak = 0;
    for (let i = windowStart; i < Math.min(windowStart + window, limit); i += 1) {
      const magnitude = magnitudeAt(i);
      if (magnitude > windowPeak) windowPeak = magnitude;
    }
    if (windowPeak > runningPeak) runningPeak = windowPeak;

    const quiet = windowPeak <= runningPeak * 10 ** (TAIL_BELOW_RUNNING_PEAK_DB / 20);
    quietRun = quiet ? quietRun + 1 : 0;
    if (quietRun >= TAIL_WINDOWS_NEEDED) {
      // Keep the quiet run itself: it is the cue's own decay, and cutting it off is the click the
      // release fade exists to prevent.
      end = Math.min(limit, windowStart + window);
      break;
    }
  }

  const start = Math.max(0, onset - Math.round((PREROLL_MS / 1000) * sampleRate));
  const kept = Math.max(1, end - start);
  const release = Math.min(Math.round((RELEASE_MS / 1000) * sampleRate), kept);

  const trimmed = channels.map((channel) => {
    const out = channel.slice(start, start + kept);
    for (let i = 0; i < release; i += 1) {
      // Linear to zero. The cue is already 48 dB down here, so the curve shape is inaudible; what
      // matters is only that the final sample IS zero.
      out[kept - release + i] *= 1 - (i + 1) / release;
    }
    return out;
  });

  return { channels: trimmed, frames: kept, startFrame: start };
}

/**
 * Encode float channels as a 16-bit PCM WAV — the format the endpoint returns and the game ships.
 *
 * Samples are **clamped**, never wrapped. An over-unity sample written through a bare `Math.round`
 * into an `Int16` wraps to a loud opposite-sign value: the worst artefact this pipeline could
 * produce, and invisible to every peak measurement taken before the write.
 *
 * @param {Float32Array[]} channels
 * @param {number} sampleRate
 * @returns {Uint8Array}
 */
export function encodeWav(channels, sampleRate) {
  const channelCount = channels.length;
  const frames = channels[0]?.length ?? 0;
  const blockAlign = channelCount * 2;
  const dataBytes = frames * blockAlign;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, FORMAT_PCM, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (const channel of channels) {
      const clamped = Math.max(-1, Math.min(1, channel[frame]));
      // 32767 on the way out, 32768 on the way in: encoding through 32768 would let a full-scale
      // positive sample round to 32768, which does not fit and wraps to -32768.
      view.setInt16(offset, Math.round(clamped * 32767), true);
      offset += 2;
    }
  }
  return bytes;
}
