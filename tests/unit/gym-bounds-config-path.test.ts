/**
 * Pins the two definitions of "where a slug's bounds config lives" equal.
 *
 * `tools/gen/slugConfig.mjs` (`configFor(slug).config`) is the PRODUCER — the build WRITES the file
 * there. `src/render/gymBounds.ts` (`configPathFor(slug)`) is the CONSUMER — the Gym READS the file
 * from there and names its save download after it. Two conventions for one file is vault 5.3, and it
 * really happened here: the build wrote `character-bounds-brass-sentry.json` while the Gym fetched
 * `brass-sentry-bounds.json` — the Gym would load a file the build never wrote, and save edits to a
 * filename the build never reads.
 *
 * Both modules are plain-JS/TS importable from a vitest test (unlike `reachGate.mjs`'s
 * `PLAY_LAG_TICKS`, which mirrors a `src/sim` constant because `tools/gen/*.mjs` cannot import
 * TypeScript at all) — so this test imports both real functions directly rather than restating
 * either convention, and compares BASENAMES: `configFor(slug).config` is a filesystem path rooted at
 * `public/`, `configPathFor(slug)` is a URL rooted at the web root, and that prefix difference is
 * correct on purpose (see both modules' doc comments). Only the filename must agree.
 */

import { describe, expect, it } from 'vitest';
import { SLUGS, configFor } from '../../tools/gen/slugConfig.mjs';
import { configPathFor } from '../../src/render/gymBounds';

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

describe('bounds-config filename — producer and consumer must agree', () => {
  it('every slug resolves to the same basename in slugConfig.mjs and gymBounds.ts', () => {
    for (const slug of SLUGS) {
      expect(basename(configPathFor(slug)), slug).toBe(basename(configFor(slug).config));
    }
  });
});
