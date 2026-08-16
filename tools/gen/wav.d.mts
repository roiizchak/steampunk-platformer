/**
 * Hand-written typings for `wav.mjs`.
 *
 * `tools/gen` is outside tsconfig's `include`, so these are authored rather than emitted — the same
 * arrangement `png.d.mts` and `catalogWrite.d.mts` already use. Keep them in step with the `.mjs` by
 * hand; nothing checks that they agree except the tests that import through them.
 */

/** One decoded WAV. Samples are normalised to ±1 and are always float — vault 7.3. */
export interface DecodedWav {
  sampleRate: number;
  /** One entry per channel. `Float32Array`, never an integer view. */
  channels: Float32Array[];
  frames: number;
}

/**
 * Decode a RIFF/WAVE byte buffer. Throws, naming the format, on anything that is not 16-bit integer
 * PCM or 32-bit float PCM.
 */
export function decodeWav(bytes: Uint8Array): DecodedWav;

/** Read and decode a WAV from a repository-relative path, e.g. `public/assets/audio/hit.wav`. */
export function readWav(path: string): DecodedWav;
