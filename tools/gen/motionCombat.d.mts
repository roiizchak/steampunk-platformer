/**
 * Hand-written typings for `motionCombat.mjs`. Only the shape `tests/unit/clip-jobs.test.ts` reads
 * — `tools/` sits outside the tsconfig `include`, so `strict` needs a declaration to import it.
 */

export interface MotionSpec {
  cyclic: boolean;
  [key: string]: unknown;
}

export declare const COMBAT_MOTIONS: Record<string, MotionSpec>;
