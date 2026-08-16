/**
 * Hand-written typings for `audioGate.mjs`.
 *
 * `tools/gen` is outside tsconfig's `include`, so these are authored rather than emitted — the same
 * arrangement `png.d.mts` and `catalogWrite.d.mts` already use.
 *
 * Note every function takes `Float32Array[]` and none takes a path. That is deliberate: the same
 * arithmetic serves `readWav()` in Node and `AudioContext.decodeAudioData` in the browser, so
 * criterion 7.2's stack can be summed across both containers in one calculation (Codex plan review
 * F2).
 */

/** Reported for digital silence, in place of `-Infinity`. */
export const SILENCE_FLOOR_DBFS: number;

/** Largest absolute sample across every channel, as dBFS. May exceed 0 for a hot buffer. */
export function peakDbfs(channels: Float32Array[]): number;

/**
 * Peak of every cue summed frame-aligned from sample zero — criterion 7.2's worst case.
 * **A positive return means the mix clips.**
 */
export function sumPeakDbfs(cues: Float32Array[][]): number;

/** Peak and quietest-non-silent level for one cue — the shape criterion 7.3 reports. */
export function measureCue(channels: Float32Array[]): { peakDbfs: number; floorDbfs: number };
