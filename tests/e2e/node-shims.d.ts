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
 * also cover unit tests: `engine-literals.test.ts` reads the same vendored Phaser sources, and
 * `touch-atlas-cli.test.ts` drives the atlas builder's real writes into a temp directory. The file
 * stays here because this is where the need was paid for — it is `tests/`-wide despite the path,
 * and a copy under `tests/unit/` would be two shims to drift apart rather than one.
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
  /**
   * Needed by `shipped-eol.test.ts` to walk `public/` for text assets. `withFileTypes` is not
   * optional in this shim on purpose: the string-returning overload would make `entry.isDirectory()`
   * a type error at the call site rather than a runtime one, and a minimal shim's job is to type
   * exactly the call that is made.
   */
  export function readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): { name: string; isDirectory(): boolean }[];
  /** The plain overload, for a directory known to hold only files. `touch-atlas-cli.test.ts`. */
  export function readdirSync(path: string): string[];
  export function mkdirSync(path: string, options: { recursive: true }): string | undefined;
  /**
   * A temp directory per test, so the builder's REAL writes can be observed without touching the
   * committed cut faces the whole gate is about.
   */
  export function mkdtempSync(prefix: string): string;
  export function writeFileSync(path: string, data: Uint8Array): void;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}

declare module 'node:module' {
  export function createRequire(url: string): { resolve(id: string): string };
}
