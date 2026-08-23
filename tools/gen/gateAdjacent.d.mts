import type { RgbaImage, Verdict } from './gates.mjs';

export declare const ADJACENT_FLOOR: number;
/** A pose repeat this project has measured and decided to live with. See `ACCEPTED_POSE_REPEATS`. */
export interface AcceptedPoseRepeat {
  pair: string;
  measured: number;
}
export declare const ACCEPTED_POSE_REPEATS: Readonly<Record<string, AcceptedPoseRepeat>>;
export declare function gateAdjacentDistinct(
  frames: RgbaImage[],
  floor?: number,
  accepted?: AcceptedPoseRepeat | null,
): Verdict<number | null>;
