/**
 * **What the bundle actually emitted** — criterion 10.3's instrument, and criterion 10.4's.
 *
 * `node tools/gen/measure-bundle.mjs [dist ...]`
 *
 * ## Why a syntax census and not just a byte count
 *
 * Vault 10.1: *after a toolchain upgrade, diff the OUTPUTS, not the changelog.* A `build.target`
 * is a promise about emitted syntax, and the only way to check a promise about emitted syntax is
 * to read the emitted syntax. `vite.config.ts`'s reversal instructions name this file, so it has
 * to exist for those instructions to be followable.
 *
 * ## 🔴 And the measurement that corrects criterion 10.4's own method
 *
 * 10.4 says *"bundle size change explained via raw-vs-gzip ratio"*. Run as a three-arm A/B on
 * 2026-08-26 — Vite 8 defaults, the pinned target, and `target: 'es2015'` — the ratio said
 * **nothing**:
 *
 * | arm | raw | gzip | ratio | `?.` | `??` | `??=` |
 * |---|---|---|---|---|---|---|
 * | Vite 8 defaults | 1,441,653 | 377,486 | 3.819 | 70 | 48 | 18 |
 * | pinned (shipped) | 1,441,653 | 377,486 | 3.819 | 70 | 48 | 18 |
 * | `target: 'es2015'` | 1,446,448 | 378,656 | **3.820** | **19** | **0** | **0** |
 *
 * 🔴 **This table read `??` = 66 until 2026-08-26**, contradicting `vite.config.ts`'s 48 for the
 * same two arms **inside the same commit**. Found by the criterion 10.4 gate owner (brief A,
 * finding 6), and the census is what settles it: the `??` row's regex is `/\?\?[^=]/g`, which
 * **cannot match `??=`**, so 66 was `??` + `??=` summed by hand into a row that counts only the
 * first. Re-measured live against the shipped chunk — 48 and 18. The `??=` column now exists so
 * the two numbers cannot be silently re-merged.
 *
 * Downlevelling every `??` in the bundle and two thirds of the optional chaining moved the ratio
 * by **0.001**. The raw size moved 0.33 %. So the ratio is not a discriminator for a target
 * change on this bundle — vault 10.2's own warning, arriving in the phase named after it. The
 * syntax census is; that is why this prints both and why the QA log reports both.
 *
 * *(The first two arms being byte-identical is the other half of the result: the pinned values ARE
 * Vite 8.2.0's current defaults, so pinning changed nothing today. Its whole value is that a Vite
 * major can no longer move the contract silently — which is exactly what vault 10.1 describes.)*
 *
 * ## What the census is and is not
 *
 * It is a **regex count over the emitted text**, not a parse. It cannot tell a `?.` in code from
 * one inside a string literal, and it does not try. That is fine for the question it answers —
 * *did this syntax survive to the output, in roughly what quantity* — and it would not be fine for
 * anything finer. `@babel/parser` is approved **test-only** (CLAUDE.md §3); using it at build time
 * would be a change to an approved decision, i.e. a STOP-and-ask.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The features worth counting, each with the ES version that introduced it. A target at or above
 * that version should leave them alone; below it, they should vanish into helpers.
 */
const SYNTAX = [
  ['optional chaining `?.`', /\?\./g, 'ES2020'],
  ['nullish `??`', /\?\?[^=]/g, 'ES2020'],
  ['logical assignment `??=`', /\?\?=/g, 'ES2021'],
  ['exponent `**`', /[^*]\*\*[^*]/g, 'ES2016'],
  ['arrow `=>`', /=>/g, 'ES2015'],
  ['`class`', /\bclass\b/g, 'ES2015'],
  ['`let`/`const`', /\b(?:let|const)\b/g, 'ES2015'],
  ['spread `...`', /\.\.\./g, 'ES2015'],
  ['template literal', /`/g, 'ES2015'],
];

/** Every emitted `.js` chunk under `<dir>/assets`, concatenated size-wise but censused as one. */
export function measureBundle(dir) {
  const assets = join(dir, 'assets');
  const chunks = readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .sort();
  if (chunks.length === 0) throw new Error(`no .js chunk under ${assets} — was the build run?`);

  let raw = 0;
  let gzip = 0;
  let code = '';
  for (const name of chunks) {
    const bytes = readFileSync(join(assets, name));
    raw += bytes.length;
    gzip += gzipSync(bytes, { level: 9 }).length;
    code += bytes.toString('utf8');
  }
  return {
    dir,
    chunks: chunks.length,
    raw,
    gzip,
    ratio: raw / gzip,
    syntax: SYNTAX.map(([label, pattern, since]) => ({
      label,
      since,
      count: (code.match(pattern) ?? []).length,
    })),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dirs = process.argv.slice(2);
  const targets = dirs.length > 0 ? dirs : ['dist'];
  for (const dir of targets) {
    const m = measureBundle(dir);
    console.log(
      `${m.dir}: ${m.chunks} chunk(s), raw ${m.raw.toLocaleString()} B, ` +
        `gzip ${m.gzip.toLocaleString()} B, raw/gzip ${m.ratio.toFixed(3)}`,
    );
    for (const s of m.syntax) {
      console.log(`  ${String(s.count).padStart(6)}  ${s.label.padEnd(26)} (${s.since})`);
    }
  }
}
