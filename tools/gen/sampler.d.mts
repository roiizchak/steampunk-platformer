/**
 * Hand-written typings for `sampler.mjs`.
 *
 * `tools/` sits outside the tsconfig `include`, so the unit suite can only import these modules
 * under `strict` if the shapes are declared here. Written by hand rather than emitted, because
 * emitting them would need `@types/node` — a dependency the Global Constraints freeze.
 */

export declare const WRAP_SLACK: number;
export declare const MIN_MEDIAN_STEP: number;

export declare function windowIndices(start: number, length: number, frames: number): number[];

export interface WindowScore {
  step: number;
  wrap: number;
  excursion: number;
  ratio: number;
  returned: number;
}

export interface CycleWindow extends WindowScore {
  start: number;
  length: number;
  indices: number[];
}

export declare function scoreWindow(
  diff: (i: number, j: number) => number,
  indices: number[],
): WindowScore | null;

export declare function chooseCycleWindow(
  diff: (i: number, j: number) => number,
  options: { sourceFrames: number; frames: number; slack?: number },
): CycleWindow | null;

export declare const MAX_WRAP_OVER_EXCURSION: number;

export declare const ONSET_FRACTION: number;
export declare const LIFT_OFF_FRACTION: number;
export declare function liftOffOnset(
  footRows: readonly number[],
  headRows: readonly number[],
  fraction?: number,
): number | null;
export declare function motionOnset(
  diff: (i: number, j: number) => number,
  sourceFrames: number,
  fraction?: number,
): number;

export declare function oneShotOnset(
  action: string,
  spec: { airborne?: boolean; [key: string]: unknown },
  deps: {
    diff: (i: number, j: number) => number;
    sourceFrames: number;
    footRows: readonly number[];
    headRows: readonly number[];
  },
): number;
