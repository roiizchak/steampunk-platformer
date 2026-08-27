/** Typed view of `pitDetect.mjs` — the pit rule. See `png.d.mts` for why these are hand-written. */

/** A collision rectangle in world pixels, top-left origin, `+y` down. `LevelData.solids`'s shape. */
export interface PitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A column run, inclusive at both ends — the same convention the layout files use. */
export interface ColumnRun {
  fromCol: number;
  toCol: number;
}

/** A spike run: a column range on one row. `row` is the row the spikes are PAINTED on. */
export interface SpikeRun extends ColumnRun {
  row: number;
}

/**
 * Per-column solidity. `surfaceRow[col]` is `null` where the column is bottomless;
 * `reachesGround[col]` is false for a mass that floats above the ground row.
 */
export interface ColumnProfile {
  surfaceRow: (number | null)[];
  reachesGround: boolean[];
}

export declare const MIN_PIT_COLS: number;
export declare const MIN_WALL_TILES: number;

export declare function columnProfile(
  rects: readonly PitRect[],
  widthTiles: number,
  tileSize: number,
  groundTopRow: number,
): ColumnProfile;

export declare function detectPits(profile: ColumnProfile, groundTopRow: number): ColumnRun[];

export declare function mergeSpikeRuns(runs: readonly SpikeRun[]): SpikeRun[];

/** A thing that must not be standing in a hazard: a gear body, an enemy's swept beat, the goal. */
export interface PitBlocker extends PitRect {
  label: string;
}

export declare function describePitProblem(level: {
  solids: readonly PitRect[];
  hazards: readonly PitRect[];
  widthTiles: number;
  tileSize: number;
  groundTopRow: number;
  blockers?: readonly PitBlocker[];
}): string | null;

export declare function pitSpikeRuns(
  solids: readonly PitRect[],
  widthTiles: number,
  tileSize: number,
  groundTopRow: number,
): SpikeRun[];
