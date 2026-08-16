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

/** A master trimmed down to its event. `startFrame` is where the cut began in the original. */
export interface TrimmedCue {
  channels: Float32Array[];
  frames: number;
  startFrame: number;
}

/**
 * Trim a generated master to its event — vault 7.1. Starts before the onset so the attack is not
 * clipped, ends once the cue has decayed below its own peak, and fades the cut to zero.
 *
 * Throws if the master is silent end to end, rather than emitting an inaudible cue.
 */
export function trimToEvent(channels: Float32Array[], sampleRate: number): TrimmedCue;

/** Encode float channels as 16-bit PCM WAV. Samples are clamped, never wrapped. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array;
