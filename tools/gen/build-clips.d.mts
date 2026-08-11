/** Typed view of `build-clips.mjs`. See `png.d.mts` for why these declarations are hand-written. */

import type { WorkItem } from './slugConfig.d.mts';

export declare const GUTTER: number;
export declare function gateSheetEdges(
  sheetPath: string,
  action: string,
  cellCount: number,
  clipWidth: number,
  clipHeight: number,
): void;
export declare function resolveWorkList(argv?: string[]): WorkItem[];
