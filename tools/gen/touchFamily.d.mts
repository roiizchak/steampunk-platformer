import type { RgbaImage } from './png.d.mts';

export const MAX_FACE_ROUNDNESS: number;
export const MIN_FACE_WARMTH: number;
export const MAX_ROUNDNESS_SPREAD: number;
export const MAX_BODY_LUMA_SPREAD: number;
export const MAX_WARMTH_SPREAD: number;
export const OUTER_R0: number;
export const OUTER_RINGS: number;
export const OUTER_SECTORS: number;
export const MIN_CELL_PX: number;
export const MAX_CELL_LUMA_DEVIATION: number;
export const MAX_CELL_WARMTH_DEVIATION: number;

type Cell = { n: number; luma: number; warmth: number };

export function faceFamily(face: RgbaImage): {
  roundness: number;
  bodyLuma: number;
  bodyWarmth: number;
  cells: Cell[];
};

export function familyFailures(faces: Map<string, RgbaImage>): string[];
