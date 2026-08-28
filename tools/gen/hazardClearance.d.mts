/** Typed view of `hazardClearance.mjs`. See `png.d.mts` for why these are hand-written. */

/** A rectangle in world pixels, top-left origin, `+y` down. `LevelData`'s shape. */
export interface ClearanceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export declare function describeClearanceProblem(level: {
  solids: readonly ClearanceRect[];
  hazards: readonly ClearanceRect[];
  tileSize: number;
  groundTopRow: number;
  /** `PLAYER_BOX.w * RENDER_SCALE` — passed in, never assumed. A tile is 96 and the player is 132. */
  playerWidthPx: number;
}): string | null;
