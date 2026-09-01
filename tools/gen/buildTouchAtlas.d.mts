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

/**
 * Where a run writes, and — for `adopt` only — what it reads.
 *
 * `plateSource` and `cellSources` default to the recorded manifest in `touchAtlasCli.mjs`, so
 * production never passes them. They exist because the recorded sources are gitignored 4 MB
 * plates: without injection the only `--adopt` test that could be written caught its own ENOENT
 * and returned green having adopted nothing. Codex round 15, finding 3.
 */
export type TouchBuildDirs = {
  outDir: string;
  cutDir: string;
  plateSource?: string;
  cellSources?: Record<string, string>;
};

export function runBuild(
  args: import('./touchAtlasCli.d.mts').TouchBuildArgs,
  dirs: TouchBuildDirs,
): string[];

/** Parse, then build. Exported because this composition is the seam a mutation has to break. */
export function main(argv: string[], dirs?: TouchBuildDirs): string[];
