// Types for `devSeamAst.mjs` — the parser half of the dev-seam gate, owner-authorised 2026-08-27.

/** One `devSeam('__DEVSEAM_…__')` call, with where it sits and whether a DEV guard dominates it. */
export interface SentinelSite {
  token: string;
  site: string;
  guarded: boolean;
  line: number;
}

/** Files whose every export is DEV-only, so the guard lives at the call site. */
export declare const DEV_ONLY_MODULES: Set<string>;

/** Every sentinel call in one source file. `filePath` is repo-relative with forward slashes. */
export declare function sentinelSites(source: string, filePath: string): SentinelSite[];
