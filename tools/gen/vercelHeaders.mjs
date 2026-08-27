/**
 * **The production response headers, in ONE implementation.** Criterion 10.6.
 *
 * ## Why this file exists — a claim that was false when it was written
 *
 * `vite.config.ts` said *"`tools/dev/prod-server.mjs` reads the same import"* and
 * `prod-server.mjs` said *"both this server and `vite.config.ts`'s `preview.headers` import it."*
 * **Neither was true.** The config imported `vercel.json` through `resolveJsonModule`; the server
 * did its own `JSON.parse(readFileSync('vercel.json'))` with its own `CATCH_ALL_SOURCE` constant
 * shadowing the exported one. The catch-all lookup existed **twice** — once typechecked, once not —
 * under two comments claiming it existed once. Found by the criterion 10.5 gate owner (brief A,
 * finding 2).
 *
 * The single-source property survived by luck: both really did read `vercel.json`, so the CSP
 * *value* could not drift. The *logic* around it could, and the prose describing it already had.
 *
 * So the lookup lives here, once, and both callers import it. `.mjs` because
 * `tools/dev/prod-server.mjs` is a Node script that cannot import a `.ts` file at runtime — which is
 * the whole reason the duplication happened in the first place.
 *
 * ## Why it REFUSES rather than guesses
 *
 * If `vercel.json` grows a rule whose `source` is anything but the catch-all, this throws instead of
 * applying a best guess. A local substrate that quietly applied different headers from production
 * would be a gate reporting green about a page nobody serves — and that is the one failure the
 * single-source arrangement exists to prevent.
 *
 * ## No `@types/node`
 *
 * `tools/gen/node-shims.d.mts` declares exactly the members used here, the same zero-dependency
 * answer `tests/e2e/node-shims.d.ts` already uses for the e2e suite. CLAUDE.md §3 freezes the
 * dependency list; `@types/node` is a STOP-and-ask.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The one `headers[].source` this project declares. Exported so callers assert against it. */
export const CATCH_ALL_SOURCE = '/(.*)';

/**
 * Resolved from THIS module's URL, not from `process.cwd()`.
 *
 * `prod-server.mjs` used a bare `'vercel.json'`, which is correct only while the server is launched
 * from the repository root. Playwright's `webServer` happens to do that; a future caller need not.
 */
const VERCEL_JSON = fileURLToPath(new URL('../../vercel.json', import.meta.url));

/**
 * The catch-all rule's headers as a plain `{ name: value }` map, from an already-parsed document.
 *
 * 🔴 Split from `productionHeaders()` so the two refusals below can be **watched failing**. The
 * criterion 10.5 gate owner (brief B, finding 6) found that neither throw had ever been exercised:
 * no test constructs a `vercel.json` without a catch-all rule, and the file-reading wrapper cannot
 * be handed one. A guard nobody has seen fire is decoration *(vault C1, C2)*.
 * `tests/unit/build-program.test.ts` fires both.
 *
 * @param {{ headers?: { source: string, headers: { key: string, value: string }[] }[] }} vercel
 * @returns {Record<string, string>}
 */
export function headersFrom(vercel) {
  const rules = vercel.headers ?? [];

  const unknown = rules.filter((r) => r.source !== CATCH_ALL_SOURCE);
  if (unknown.length > 0) {
    throw new Error(
      `vercel.json has ${unknown.length} headers rule(s) whose source is not "${CATCH_ALL_SOURCE}": ` +
        `${unknown.map((r) => JSON.stringify(r.source)).join(', ')}. The local production ` +
        'substrate applies the catch-all rule only and refuses to guess at route matching — a ' +
        'local check that applied different headers from production would be worse than none.',
    );
  }

  const catchAll = rules.find((r) => r.source === CATCH_ALL_SOURCE);
  if (catchAll === undefined) {
    throw new Error(
      `vercel.json has no headers rule with source "${CATCH_ALL_SOURCE}"; the local production ` +
        'substrate cannot reproduce what Vercel would serve, so it refuses to guess.',
    );
  }
  return Object.fromEntries(catchAll.headers.map((h) => [h.key, h.value]));
}

/**
 * The catch-all rule's headers, read from the shipped `vercel.json`.
 *
 * @returns {Record<string, string>}
 */
export function productionHeaders() {
  return headersFrom(JSON.parse(readFileSync(VERCEL_JSON, 'utf8')));
}
