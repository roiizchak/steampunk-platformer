// Types for `devSeamGate.mjs`. Same convention as every other `tools/gen/*.d.mts` in this
// directory: the implementation stays plain `.mjs` (no build step for tools), and the declaration
// is what lets `vite.config.ts` import it under `tsc --noEmit`.
//
// `Plugin` is imported from `vite` rather than restated, so a Vite major that changes the plugin
// shape fails the typecheck here instead of at runtime on a build box.

import type { Plugin } from 'vite';

/** The criterion 10.2 bundle gate. Production builds only (`apply: 'build'`). */
export function devSeamGate(): Plugin;

/**
 * How many `__DEVSEAM_*__` sentinels exist under `root`, excluding `devSeam.ts` itself.
 * Exported so the gate can report its own size — "no sentinel leaked" is vacuously true of a
 * repository with no sentinels.
 */
export function countSentinelsInSource(root?: string): number;
