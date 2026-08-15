/**
 * Hand-written typings for `catalogWrite.mjs`.
 *
 * `tools/` sits outside the tsconfig `include`, so the unit suite can only import this module under
 * `strict` if the shape is declared here. Written by hand rather than emitted, because emitting it
 * would need `@types/node` — a dependency the Global Constraints freeze.
 */

export interface SheetRow {
  key: string;
  [field: string]: unknown;
}

/** One `sheets` entry's key, upserted by key into `public/assets/index.json`. */
export declare function upsertCatalogSheets(path: string, rows: readonly SheetRow[]): void;

/** One animation's committed lift-profile entry — see `sheets.mjs`'s `PackedFrame`. */
export interface LiftProfileAnimation {
  anchor: 'feet' | 'centroid';
  /** Resolved per `(slug, action)`: an action override if declared, else the slug default. */
  scale: number;
  /** Which of those two the `scale` above came from — what the one-scale guard binds on. */
  scaleSource: 'action' | 'slug';
  deepestSourceY: number;
  frames: readonly Record<string, unknown>[];
}

/**
 * Upsert `build-assets.mjs`'s per-action lift-profile entries into `<slug>`'s
 * `lift-profile*.json`, merging by action key. `readFile`/`writeFile` are injectable so the unit
 * suite can exercise the merge and its guard on an in-memory store — no real disk, no `node:fs`
 * import in a `strict`-typed test file.
 */
export declare function upsertLiftProfile(
  path: string,
  args: {
    comment: string;
    slug: string;
    /** The slug's own default scale — the top-level field, not necessarily every entry's. */
    scale: number;
    animations: Record<string, LiftProfileAnimation>;
  },
  deps?: {
    readFile?: (path: string, encoding: string) => string;
    writeFile?: (path: string, data: string) => void;
  },
): void;
