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

/**
 * 🔴 **The filter is INVERTED: everything is text unless it is known to be binary.**
 *
 * It was an allowlist — `.json .tmj .txt .html .css .svg` — and the criterion 10.9 gate owner
 * pointed out what that misses (brief A finding 10): three of those six match nothing under
 * `public/` today, and any future `.webmanifest`, `.xml`, `.frag`, `.csv`, `.md` or `.js` added
 * there is skipped **with no signal at all**. An allowlist over an evolving directory silently
 * shrinks; a denylist over one fails loudly the day a new binary type arrives, which is the
 * direction an error should point.
 */
// `.m4a` and friends joined on 2026-09-02 with the Safari audio alternates. A binary the walk
// does not know about is reported as a text file with no CRLF, which is true and useless.
const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.wav', '.ogg', '.oga', '.mp3', '.mp4', '.m4a', '.aac', '.caf', '.webm',
];

function textFilesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) textFilesUnder(path, out);
    else if (!BINARY_EXTENSIONS.some((e) => entry.name.toLowerCase().endsWith(e))) out.push(path);
  }
  return out;
}

/**
 * The measured set on 2026-08-26. An EQUALITY, not a floor.
 *
 * The floor was `> 5` over 18 files — losing twelve of them, `public/assets/config/` included,
 * still passed, and `public/assets/config/` is where the CRLF this gate exists for actually was.
 * A vacuity guard three times looser than its own subject is not a guard (brief B, finding 8).
 * Adding a shipped text file is a deliberate act and updating this number is part of it.
 */
const EXPECTED_TEXT_FILES = 19;

describe('shipped text assets are LF', () => {
  // ⚠️ `index.html` lives at the REPO ROOT, not under `public/` — it is the one shipped file Vite
  // TRANSFORMS rather than copies, and it was checked by neither half of 10.9 (brief B, finding 7).
  const files = [...textFilesUnder('public'), 'index.html'];

  it('checks the whole measured set — the walk has not silently shrunk', () => {
    expect(
      files.length,
      `expected ${EXPECTED_TEXT_FILES} shipped text files, found ${files.length}. If a file was ` +
        'deliberately added or removed, update EXPECTED_TEXT_FILES; if not, a walk that lost ' +
        'files is a gate measuring less than it claims.',
    ).toBe(EXPECTED_TEXT_FILES);
    expect(files, 'the level data is not in the checked set').toContain(
      join('public', 'assets', 'levels', 'level-01.tmj'),
    );
    expect(files).toContain('index.html');
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
