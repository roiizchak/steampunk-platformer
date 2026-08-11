/** Typed view of `sheetGates.mjs`. See `png.d.mts` for why these are hand-written. */

import type { VerticalDrift } from './driftGate.d.mts';
import type { RgbaImage } from './png.d.mts';
import type { ReachResult } from './reachGate.d.mts';

export declare const ATTACK_STARTUP_TICKS: number;
export declare const ATTACK_ACTIVE_TICKS: number;

export interface AttackWindow {
  startup: number;
  active: number;
  simTicks: number;
}

export declare function attackWindowFor(slug: string, action: string): AttackWindow | null;

export declare function driftAllowanceFor(slug: string, action: string): number;

export declare function runGates(
  frames: RgbaImage[],
  opts?: {
    g4Opts?: {
      minAlpha?: number;
      maxDriftPx?: number;
      allowancePx?: number;
      key?: readonly [number, number, number];
      low?: number;
      high?: number;
    };
    g5Opts?: AttackWindow | null;
  },
): { g4: VerticalDrift; g5: ReachResult | null };

export declare function runSheetGates(
  slug: string,
  action: string,
): { lines: string[]; exitCode: number; g4: VerticalDrift; g5: ReachResult | null };
