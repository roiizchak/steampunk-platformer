import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * 🔴 **This module exists because a source-text gate over the concatenation could not go red.**
 *
 * The template was one 442-line file until Codex round 21, finding 7; it is three parts now, joined
 * with nothing between them. `tests/unit/audition-template.test.ts` pinned that split by reading
 * `build-audition.mjs`'s own text — and round 22, finding 3, showed all six of its cases passed with
 * the map callback returning `''`. A seventh case was added that required `readFileSync`, the part
 * name and the write of `html` to appear in the callback, and **round 23, finding 2, defeated that
 * too**: appending `.slice(0, 0)` keeps every token the regex looks for and still builds an empty
 * page.
 *
 * A regex over source text cannot tell a read from a discarded read. So the concatenation moved
 * HERE, where a test can just run it — `buildBaseDocument()` reads the real files and returns the
 * real string, and every mutation of the join, the order, the part names or the read itself changes
 * what it returns. That is the behavioural shape this project prefers, and the reason the weaker one
 * was chosen first (the builder writes a 20 MB artifact from every audio file in the catalog) does
 * not apply to three small HTML files.
 */
export const TEMPLATE_PARTS = ['style', 'body', 'script'];

const root = join(fileURLToPath(new URL('../../', import.meta.url)), '/');

/**
 * The audition page before its `__TOKEN__` substitutions: the three parts in document order,
 * concatenated with the EMPTY string. A separator here would change the generated page silently.
 */
export function buildBaseDocument() {
  return TEMPLATE_PARTS.map((part) =>
    readFileSync(join(root, `tools/gen/audition-template.${part}.html`), 'utf8'),
  ).join('');
}
