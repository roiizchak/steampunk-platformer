/**
 * Typed view of `buildTouchAtlas.mjs` — which bytes become which files, and where.
 *
 * `isCliEntry` is exported and typed so a unit test can drive the entry-point comparison with a
 * path containing a space, which is the defect that made `npm run assets:touch` a silent no-op.
 */

export const TOUCH_OUT_DIR: string;
export const TOUCH_CUT_DIR: string;

export function staleFaces(
  files: string[],
  produced: { has(key: string): boolean },
): string[];
export function isCliEntry(argv1: string | undefined, moduleUrl: string): boolean;

export const DEFAULT_DIRS: { outDir: string; cutDir: string };

export function runBuild(
  args: import('./touchAtlasCli.d.mts').TouchBuildArgs,
  dirs: { outDir: string; cutDir: string },
): string[];

/** Parse, then build. Exported because this composition is the seam a mutation has to break. */
export function main(argv: string[], dirs?: { outDir: string; cutDir: string }): string[];
