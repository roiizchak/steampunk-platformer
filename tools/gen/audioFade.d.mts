/**
 * Typed view of `audioFade.mjs`, hand-written.
 *
 * The implementation is `.mjs` under `tools/`, outside the tsconfig `include`, so its `node:fs`
 * import never drags `@types/node` into a project whose dependencies are frozen. This file is what
 * lets `tests/unit/*.test.ts` import it under `strict` without `allowJs` — the same arrangement
 * `png.d.mts` documents.
 */

export interface WavHeader {
  channels: number;
  rate: number;
  bits: number;
  dataStart: number;
  dataSize: number;
}

export declare function parseWav(buffer: Uint8Array): WavHeader | null;
/** Absolute value of the first sample, 0..1 — the number inventory 2b.8 is about. */
export declare function firstSampleMagnitude(buffer: Uint8Array): number | null;
export declare function fadeInWav(buffer: Uint8Array, fadeMs?: number): Uint8Array;
