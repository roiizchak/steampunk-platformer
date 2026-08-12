/**
 * Typed view of `chromaComponents.mjs`. See `png.d.mts` for why these declarations are
 * hand-written.
 */

import type { RgbaImage } from './png.d.mts';

export declare function components(
  image: RgbaImage,
  minAlpha?: number,
): { labels: Int32Array; sizes: number[] };
export declare function trimHalo(
  image: RgbaImage,
  options?: { solidAlpha?: number; maxDistance?: number },
): RgbaImage;
export declare function removeSpecks(image: RgbaImage, minPx?: number): RgbaImage;
export declare function assertComponentPolicy(state: string): void;
export declare function keepLargestComponent(image: RgbaImage, state: string): RgbaImage;
export declare function multiComponentStates(): string[];
export declare function dropCastShadow(
  image: RgbaImage,
  options?: { minAspect?: number; minPx?: number; maxHeightFraction?: number },
): RgbaImage;
