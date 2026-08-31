import type { RgbaImage } from './png.d.mts';

export const MAX_FACE_ROUNDNESS: number;
export const MIN_FACE_WARMTH: number;
export const MAX_ROUNDNESS_SPREAD: number;
export const MAX_BODY_LUMA_SPREAD: number;
export const MAX_WARMTH_SPREAD: number;
export const MAX_BAND_LUMA_SPREAD: number;
export const MAX_BAND_WARMTH_SPREAD: number;

export function faceFamily(face: RgbaImage): {
  roundness: number;
  bodyLuma: number;
  bodyWarmth: number;
  bands: { n: number; luma: number; warmth: number }[];
};

export function familyFailures(faces: Map<string, RgbaImage>): string[];
