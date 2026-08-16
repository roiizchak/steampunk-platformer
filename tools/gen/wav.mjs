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
