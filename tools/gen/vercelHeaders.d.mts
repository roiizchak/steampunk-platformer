// Types for `vercelHeaders.mjs`. Same convention as every other `tools/gen/*.d.mts`: the
// implementation stays plain `.mjs` (no build step for tools) and the declaration is what lets
// `vite.config.ts` import it under the app's `tsc --noEmit`, which has `allowJs` off.
//
// ⚠️ `tsconfig.build.json` checks the `.mjs` BODY as well, via `allowJs`/`checkJs`. Both files are
// in that program on purpose: this declaration is the contract `vite.config.ts` compiles against,
// and the body is what actually runs. Before 2026-08-26 only the declaration existed in any
// program, so a drifted `.mjs` was checked by nothing at all.

/** The one `headers[].source` this project declares. */
export const CATCH_ALL_SOURCE: '/(.*)';

/** A `vercel.json` shaped just enough for the header lookup. */
export interface VercelHeaderDoc {
  headers?: { source: string; headers: { key: string; value: string }[] }[];
}

/**
 * The catch-all rule's headers, from an already-parsed document. Throws — rather than guessing —
 * if the rule is missing or if any rule has a `source` this project does not know how to match.
 */
export function headersFrom(vercel: VercelHeaderDoc): Record<string, string>;

/** The catch-all rule's headers, read from the shipped `vercel.json`. */
export function productionHeaders(): Record<string, string>;
