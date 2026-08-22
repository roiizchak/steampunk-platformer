/**
 * The three Node built-ins a Playwright spec needs, declared rather than installed.
 *
 * 🔴 **`@types/node` is not a dependency and must not become one.** CLAUDE.md §3 freezes the tree at
 * `phaser` plus `vite` / `typescript` / `vitest` / `@playwright/test`, and records that Phase 1
 * needed `@types/node` twice and solved it without adding it. This is that solution, once, for the
 * test code that runs in Node instead of a browser — `tests/e2e/*.spec.ts` already declares
 * `process` inline for the same reason.
 *
 * Deliberately MINIMAL: exactly the members `phase-09-draw.spec.ts` calls, with the signatures it
 * calls them at. A fuller shim would be an unmaintained copy of a package this project has chosen
 * not to depend on, and the day it drifts it would type a call that does not work.
 *
 * ⚠️ These are AMBIENT module declarations and `tsconfig.json` includes all of `tests/`, so they
 * also cover `tests/unit/engine-literals.test.ts`, which reads the same vendored Phaser sources from
 * the unit suite. The file stays here because this is where the need was paid for; if a third
 * consumer appears, move it up to `tests/` rather than copying it.
 *
 * `package.json` sets `"type": "module"`, so specs are ESM and `require` does not exist — these are
 * reached with `await import('node:fs')` and friends, which is why each shim below is a module
 * declaration rather than a global.
 */

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  /**
   * Needed by `engine-literals.test.ts` to tell "Phaser is uninstalled" from "the read failed",
   * which a bare `try`/`catch` around `readFileSync` cannot: one is a skip, the other is a bug.
   */
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}

declare module 'node:module' {
  export function createRequire(url: string): { resolve(id: string): string };
}
