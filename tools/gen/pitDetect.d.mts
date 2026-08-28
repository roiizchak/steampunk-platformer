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
 * Per-column solidity.
 *
 * ⚠️ **`solidRows` is what `detectPits` actually reads**, and this declaration did not name it —
 * so a TypeScript caller could build a profile the compiler accepted and the detector crashed on.
 * Codex implementation review, finding 4. `png.d.mts`'s header says why these are hand-written; a
 * hand-written declaration is exactly the thing that can drift out of step with the runtime, and
 * this one did.
 *
 * - `surfaceRow[col]` — the topmost solid row, `null` where the column is bottomless.
 * - `reachesGround[col]` — false for a mass floating above the ground row. **No longer read by
 *   `detectPits`**: it was subsumed by `isWall()` when the rule went from five clauses to two. Kept
 *   because `columnProfile` still returns it and `level-pits.test.ts` reports it, and removing a
 *   returned field from a declaration is how the two drift apart in the other direction.
 * - `solidRows[col]` — every row the column has solid material in, which is the question
 *   `isWall()` asks.
 */
export interface ColumnProfile {
  surfaceRow: (number | null)[];
  reachesGround: boolean[];
  solidRows: ReadonlySet<number>[];
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
