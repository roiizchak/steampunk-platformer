/** Typed view of `catalogTimings.mjs`. See `png.d.mts` for why these are hand-written. */

export declare const TICK_HZ: number;
export declare const IDLE_TICKS: number;
export declare const DEATH_TICKS: number;
export declare const SENTRY_FIRE_TICKS: number;
export declare const ATTACK_TOTAL_TICKS: number;
export declare const HURT_TICKS: number;
export declare const SCAVENGER_PATROL_SPEED: number;
export declare const SCAVENGER_CHASE_SPEED: number;

export declare function strideTicks(stridePx: number, speedPxPerTick: number): number;

export type CatalogTiming = {
  simTicks: number;
  loop: boolean;
  derivedFrom: 'sim' | 'measured' | 'authored';
};

export interface TimingContext {
  stridePxPerCycle?: number | null;
}

export declare function hasCatalogTiming(slug: string, action: string): boolean;

export declare function timingFor(slug: string, action: string, context?: TimingContext): CatalogTiming;

export declare function deriveFps(renderFrames: number, simTicks: number): number;

export interface CatalogRowInputs {
  url: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

export interface CatalogRow extends CatalogRowInputs {
  key: string;
  simTicks: number;
  fps: number;
  loop: boolean;
  derivedFrom: 'sim' | 'measured' | 'authored';
}

export declare function catalogRowFor(
  slug: string,
  action: string,
  sheet: CatalogRowInputs,
  context?: TimingContext,
): CatalogRow;
