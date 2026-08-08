/**
 * Typed view of `png.mjs`, hand-written.
 *
 * The implementation is `.mjs` under `tools/`, which is outside the tsconfig `include`, so its
 * `node:zlib` import never drags `@types/node` into a project whose dependencies are frozen. This
 * file is what lets `tests/unit/*.test.ts` import it under `strict` without `allowJs`.
 */

export interface DecodedPng {
  width: number;
  height: number;
  /** Always RGBA, 4 bytes per pixel, whatever the file's colour type was. */
  data: Uint8ClampedArray;
  colorType: number;
  /**
   * Whether the FILE carried an alpha channel. Not the same question as "is any pixel
   * transparent" — vault 4.12 is precisely about not confusing the two.
   */
  sourceHadAlphaChannel: boolean;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export declare function decodePng(buffer: Uint8Array): DecodedPng;
/**
 * Decode a PNG off disk. The path is resolved relative to the process cwd, which for both vitest
 * and the `tools/gen/` scripts is the repository root.
 */
export declare function readPng(path: string): DecodedPng;
export declare function encodePng(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): Uint8Array;
export declare function blank(
  width: number,
  height: number,
  rgba?: [number, number, number, number],
): RgbaImage;
