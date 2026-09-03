/**
 * Typed view of `auditionDocument.mjs`, hand-written.
 *
 * The implementation is `.mjs` under `tools/`, outside the tsconfig `include`, so its `node:fs`
 * import never drags `@types/node` into a project whose dependencies are frozen. This file is what
 * lets `tests/unit/*.test.ts` import it under `strict` without `allowJs` — the same arrangement
 * `audioFade.d.mts` and `png.d.mts` document.
 */

/** The three template parts, in document order. Not alphabetical. */
export declare const TEMPLATE_PARTS: readonly string[];
/** The three parts read off disk and concatenated with the EMPTY string. */
export declare function buildBaseDocument(): string;
