/**
 * Typed view of `catalogDecision.mjs`, hand-written.
 *
 * The implementation is `.mjs` under `tools/`, which is outside the tsconfig `include`, so its
 * `node:` imports never drag `@types/node` into a project whose dependencies are frozen. This file
 * is what lets `tests/unit/catalog-decision.test.ts` import it under `strict` without `allowJs` —
 * the same pattern `png.d.mts` and `edgeExceptions.d.mts` already follow.
 */

/** A catalog row as `catalogRowFor` emits it. Only the fields the validator reads are required. */
export interface CatalogRowLike {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

/** Dimensions measured from a source INDEPENDENT of the row — see the module header. */
export interface MeasuredSheet {
  width: number;
  height: number;
}

export declare function decideCatalogRow(input: {
  slug: string;
  action: string;
  hasTiming: boolean;
  hasExistingRow?: boolean;
}): 'write' | 'skip';

export declare function validateCatalogRows<T extends CatalogRowLike>(
  rows: T[],
  measure: (row: T) => MeasuredSheet | null | undefined,
): T[];

export interface GateVerdict {
  status: string;
  reason: string;
}

export declare function sheetReportRow(input: {
  slug: string;
  action: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  loop: boolean;
  key: number[];
  agreement: number;
  tallest: number;
  widest: number;
  verdicts: Record<string, GateVerdict>;
  summary: string;
}): {
  action: string;
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  loop: boolean;
  measuredKey: number[];
  borderAgreement: number;
  tallest: number;
  widest: number;
  gates: Record<string, string>;
  summary: string;
};

export interface LiftFrame {
  index: number;
  sourceMinY: number;
  sourceMaxY: number;
  sourceCentroidY: number;
  drawnHeight: number;
  liftPx: number;
}

export declare function liftProfileEntry(input: {
  anchor: string;
  scale: number;
  scaleSource: string;
  deepestSourceY: number;
  frames: LiftFrame[];
}): {
  anchor: string;
  scale: number;
  scaleSource: string;
  deepestSourceY: number;
  frames: LiftFrame[];
};
