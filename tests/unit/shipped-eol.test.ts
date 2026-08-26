import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readBytes } from '../../tools/gen/png.mjs';

/**
 * **No CRLF in a shipped text asset.** Criterion 10.9, and it was found the hard way.
 *
 * ## The measurement
 *
 * 10.9 (as amended) is *fresh clone → `npm ci` → `npm run build` → `dist/assets/**` byte-identical
 * to the main-tree build*. Run on 2026-08-26, that came back **61 of 62 files identical** and one
 * different: `assets/config/character-bounds-rust-scavenger.json`, 11,278 bytes here against 11,217
 * in the clone. The gap was **61 carriage returns**. Content identical after normalisation.
 *
 * ## Why nothing caught it, and why nothing could
 *
 * `.gitattributes` says `* text=auto eol=lf`, so a fresh checkout writes LF and the repository's
 * blob is LF. This working tree's copy had CRLF — and **`git status` reported the tree clean**,
 * because git's clean filter normalises CRLF to LF before hashing, so a CRLF working file matches an
 * LF blob exactly.
 *
 * `vite build` does not go through git. It copies the bytes on disk. So the deployed artifact from
 * this machine differed, byte for byte, from what a fresh clone — and therefore from what the
 * hosting provider's own build — would produce, and every tool in the project reported clean:
 *
 *   - `git status` — clean, by the filter above.
 *   - `verify-dist.mjs` — compares `dist/` against `public/`, both of which had the CRLF. A
 *     self-comparison cannot see a divergence they share.
 *   - the unit and e2e suites — the JSON parses identically either way.
 *
 * One file, one build, no behavioural difference. But *"the artifact I tested is the artifact that
 * ships"* is the claim the whole phase rests on, and it was false in one file until it was measured.
 *
 * ## What this gate is, and what it is not
 *
 * It is a **working-tree** check over the text files under `public/` — the only files whose on-disk
 * bytes are copied verbatim into `dist/`. It is not a substitute for the fresh-clone comparison,
 * which is the real 10.9 evidence and which sees things this cannot (a stale generated file, a
 * `.gitignore`d input, a tool that writes non-determinstically). It is the cheap continuous version
 * of the one failure that comparison actually found.
 */

/** Text under `public/`. Everything else there is PNG, WAV or OGG, where a CR byte means nothing. */
const TEXT_EXTENSIONS = ['.json', '.tmj', '.txt', '.html', '.css', '.svg'];

function textFilesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) textFilesUnder(path, out);
    else if (TEXT_EXTENSIONS.some((e) => entry.name.endsWith(e))) out.push(path);
  }
  return out;
}

describe('shipped text assets are LF', () => {
  const files = textFilesUnder('public');

  it('found text assets to check — the glob has not gone empty', () => {
    // Vacuity guard. A refactor that moved `public/assets/config/` would leave this file asserting
    // nothing over an empty list and reporting green, which is the failure mode this project has
    // been bitten by more than any other.
    expect(files.length, 'no text files found under public/ — this gate is measuring nothing').
      toBeGreaterThan(5);
  });

  it.each(files)('%s has no CRLF', (file) => {
    // `readBytes`, not `readFileSync` — the node shim types the latter as returning a STRING, and
    // a decoded string is exactly where a carriage return can go missing. Bytes are the subject.
    const bytes = readBytes(file);
    let crlf = 0;
    for (let i = 0; i < bytes.length - 1; i += 1) {
      if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) crlf += 1;
    }
    expect(
      crlf,
      `${file} has ${crlf} CRLF line ending(s) in the working tree. The repository stores it with ` +
        `LF (\`.gitattributes\`: \`* text=auto eol=lf\`) and \`git status\` will call this clean, ` +
        `because the clean filter normalises before hashing. But \`vite build\` copies the bytes on ` +
        `disk — so \`dist/\` built here would NOT match \`dist/\` built from a fresh clone, which is ` +
        `criterion 10.9. Rewrite the file with LF endings.`,
    ).toBe(0);
  });
});
