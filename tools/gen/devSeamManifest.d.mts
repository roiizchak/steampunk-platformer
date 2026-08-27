// Types for `devSeamManifest.mjs` — the file→token and token→site records the dev-seam gate checks
// against. In `tsconfig.build.json`'s program the `.mjs` BODY is checked too; this is what
// `vite.config.ts` compiles against, and the two must agree.

/** Which sentinel lives in which file. Adding a dev seam means adding it here, deliberately. */
export declare const SENTINEL_MANIFEST: Record<string, string[]>;

/** Which FUNCTION each sentinel sits in. `'<module>'` for module scope. */
export declare const SENTINEL_SITES: Record<string, string>;
