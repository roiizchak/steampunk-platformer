/**
 * The three Node built-ins a Playwright spec needs, declared rather than installed.
 *
 * 🔴 **`@types/node` is not a dependency and must not become one.** CLAUDE.md §3 freezes the tree at
 * `phaser` plus `vite` / `typescript` / `vitest` / `@playwright/test`, and records that Phase 1
 * needed `@types/node` twice and solved it without adding it. This is that solution, once, in the
 * one directory that runs in Node instead of a browser — `tests/e2e/*.spec.ts` already declares
 * `process` inline for the same reason.
 *
 * Deliberately MINIMAL: exactly the members `phase-09-draw.spec.ts` calls, with the signatures it
 * calls them at. A fuller shim would be an unmaintained copy of a package this project has chosen
 * not to depend on, and the day it drifts it would type a call that does not work.
 *
 * `package.json` sets `"type": "module"`, so specs are ESM and `require` does not exist — these are
 * reached with `await import('node:fs')` and friends, which is why each shim below is a module
 * declaration rather than a global.
 */

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}

declare module 'node:module' {
  export function createRequire(url: string): { resolve(id: string): string };
}
