/** Typed view of `catalogTimings.mjs`. See `png.d.mts` for why these are hand-written. */

export declare const TICK_HZ: number;
export declare const IDLE_TICKS: number;
export declare const DEATH_TICKS: number;
export declare const SENTRY_FIRE_TICKS: number;

export type CatalogTiming = {
  simTicks: number;
  loop: boolean;
  derivedFrom: 'sim' | 'measured' | 'authored';
};

export declare function timingFor(slug: string, action: string): CatalogTiming;

export declare function deriveFps(renderFrames: number, simTicks: number): number;

export declare const CATALOG_TIMING_SLUGS: ReadonlySet<string>;

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
): CatalogRow;
