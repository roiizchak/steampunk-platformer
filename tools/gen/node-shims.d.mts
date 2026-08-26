/**
 * The Node built-ins the BUILD program's `.mjs` files use, declared rather than installed.
 *
 * 🔴 **`@types/node` is not a dependency and must not become one** (CLAUDE.md §3). Phase 1 needed it
 * twice and solved it without adding it; `tests/e2e/node-shims.d.ts` is that solution for the e2e
 * suite, and this is the same answer for `tsconfig.build.json`'s program.
 *
 * ## Why the build program needs it at all
 *
 * The criterion 10.5 gate owner (brief A, finding 1) found that `tsconfig.build.json` claimed *"the
 * plugin IS typechecked here, through its declaration"* — and that **the plugin body was in no
 * program at all**. Only 18 lines of hand-written assertions *about* it were checked. Worse, the
 * header's justification was circular: it argued no Node types were needed, while
 * `devSeamGate.mjs:73-74` imports `node:fs` and `node:path`. The Node-types need had not been
 * removed; the Node-using file had been excluded from the program.
 *
 * Every other `tools/gen/*.d.mts` is backed by a unit test that EXECUTES its `.mjs`, so a drifted
 * declaration dies at runtime in vitest. `devSeamGate.mjs` has zero test consumers — its only
 * exercise is `vite build`. That is exactly the file that most needed checking.
 *
 * So `tsconfig.build.json` turns on `allowJs`/`checkJs`, includes the `.mjs` files themselves, and
 * this supplies the types. An unmet half recorded as met is the one failure C11 exists to catch.
 *
 * Deliberately MINIMAL: exactly the members those files call, at the signatures they call them at.
 * A fuller shim would be an unmaintained copy of a package this project has chosen not to depend on.
 */

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

/**
 * `URL` is a WHATWG global, not a Node module export — and `lib: ["ES2022"]` does not carry it, so
 * `new URL('../../vercel.json', import.meta.url)` has nowhere to resolve from in the build program.
 * Adding `"DOM"` to `lib` would pull an entire browser surface into a Node-script program to obtain
 * one constructor; two members is the smaller lie.
 */
declare class URL {
  constructor(url: string, base?: string | URL);
  readonly href: string;
}

/**
 * `TextDecoder` is a global in Node and in browsers alike, and in `lib: ["ES2022"]` in neither.
 * `devSeamGate.mjs` needs it to read an emitted ASSET's bytes — `dist/index.html` arrives as a
 * `Uint8Array`, and `String(bytes)` would yield comma-separated integers that silently never match
 * a sentinel.
 */
declare class TextDecoder {
  decode(input: Uint8Array): string;
}
