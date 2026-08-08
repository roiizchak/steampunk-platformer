/** Typed view of `chroma.mjs`. See `png.d.mts` for why these declarations are hand-written. */

import type { RgbaImage } from './png.d.mts';

export interface ChromaThresholds {
  LOW: number;
  HIGH: number;
  MIN_COMPONENT_PX: number;
  KEY: readonly [number, number, number] | number[];
}

export declare const CHROMA: Readonly<ChromaThresholds>;
export declare function chromaThresholds(): ChromaThresholds;
export declare function keyDistance(
  r: number,
  g: number,
  b: number,
  key?: readonly number[],
): number;
export declare function hasRealAlpha(image: RgbaImage): boolean;
export declare function keyOut(
  image: RgbaImage,
  options?: { low?: number; high?: number; key?: readonly number[]; despill?: boolean },
): RgbaImage;
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
export declare function estimateFieldColour(
  image: RgbaImage,
  options?: { expect?: readonly number[]; tolerance?: number; minShare?: number },
): { key: number[]; share: number };
export declare function estimateKeyColour(
  image: RgbaImage,
  options?: { minAgreement?: number; tolerance?: number },
): { key: number[]; agreement: number };
export declare function dropCastShadow(
  image: RgbaImage,
  options?: { minAspect?: number; minPx?: number; maxHeightFraction?: number },
): RgbaImage;
