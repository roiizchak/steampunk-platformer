/**
 * Hand-written typings for `motion.mjs`. Only the shape `tests/unit/clip-jobs.test.ts` reads —
 * `tools/` sits outside the tsconfig `include`, so `strict` needs a declaration to import it.
 */

import type { MotionSpec } from './motionCombat.d.mts';

export declare const VIDEO_MOTIONS: Record<string, MotionSpec>;

export declare function videoPrompt(
  template: unknown,
  action: string,
  blocks: { rendering: string; forbid: string },
): string;
