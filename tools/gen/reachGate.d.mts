/** Typed view of `reachGate.mjs` — guard G5. See `png.d.mts` for why these are hand-written. */

import type { GateStatus } from './gates.d.mts';
import type { RgbaImage } from './png.d.mts';

export type Facing = 'left' | 'right';

export interface ReachProfileEntry {
  frame: number;
  /** `null` where no component cleared the noise floor that frame. Frame 0 is always `0`. */
  reach: number | null;
  componentPx: number;
  edgeX: number | null;
}

export interface ReachWindow {
  startup: number;
  active: number;
  openTick: number;
  closeTick: number;
}

export interface ReachResult {
  verdict: GateStatus;
  profile: ReachProfileEntry[];
  peakFrame: number | null;
  peakTick: number | null;
  window: ReachWindow;
  reason: string;
}

export declare const PLAY_LAG_TICKS: number;
export declare const DEFAULT_THRESHOLD: number;

export declare function gateReachWindow(
  frames: RgbaImage[],
  opts: {
    simTicks: number;
    startup: number;
    active: number;
    facing?: Facing;
    threshold?: number;
    minComponentPx?: number;
    playLagTicks?: number;
  },
): ReachResult;
