/**
 * Typed view of `touchAtlasCli.mjs` — the builder's argv grammar and its source manifest.
 *
 * `parseTouchArgs` is typed as a discriminated union so a consumer that forgets `cell`'s `key` is a
 * compile error rather than an `undefined` two frames deeper.
 */

export const TOUCH_PLATE_SOURCE: string;
export const TOUCH_CELL_SOURCES: Readonly<Record<string, string>>;

export type TouchBuildArgs =
  | { mode: 'ink' }
  | { mode: 'adopt' }
  | { mode: 'cell'; key: string; source: string };

export function parseTouchArgs(argv: string[]): TouchBuildArgs;
