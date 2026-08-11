/**
 * A packed sheet with no catalog row is a dead file — Phaser never loads it, `BootScene` never
 * registers its animation, and nothing that reads `public/assets/index.json` ever learns it exists.
 * `build-assets.mjs` now writes the catalog row itself (see `catalogTimings.mjs`/`catalogWrite.mjs`),
 * but a hand-authored PNG dropped under a slug's `sheets/` directory — or a slug the catalog writer
 * does not cover — would slip past that mechanism silently. This test reads the SHIPPED
 * directory listing and the SHIPPED catalog and asserts every sheet PNG has a matching row, the same
 * "assert against the shipped bytes, not the pipeline that produced them" rule
 * `tests/unit/shipped-sheets.test.ts` and `tilemap-data.test.ts` already apply (vault 3.1).
 *
 * File paths come from Vite's `import.meta.glob`, not `node:fs`: dependencies are frozen and
 * `@types/node` is deliberately not one of them — same technique `docs-contract.test.ts` and
 * `sim-boundary.test.ts` use. The glob is never awaited/imported, only its KEYS are read, so this
 * never has to decode a PNG.
 */

import { describe, expect, it } from 'vitest';
import catalog from '../../public/assets/index.json';

const SHEET_FILES = import.meta.glob('../../public/assets/characters/*/sheets/*.png');

/** `../../public/assets/characters/brass-courier/sheets/idle.png` -> `brass-courier-idle`. */
function keyFor(globPath: string): string {
  const match = globPath.match(/characters\/([^/]+)\/sheets\/([^/]+)\.png$/);
  if (!match) {
    throw new Error(`catalog-completeness: could not parse a slug/action out of "${globPath}"`);
  }
  const [, slug, action] = match;
  return `${slug}-${action}`;
}

describe('every packed sheet PNG has a catalog row', () => {
  it('found at least the shipped brass-courier sheets — an empty sweep proves nothing', () => {
    expect(Object.keys(SHEET_FILES).length).toBeGreaterThan(0);
  });

  it('every sheets/*.png on disk has a matching key in public/assets/index.json', () => {
    const catalogKeys = new Set(catalog.sheets.map((s) => s.key));
    const missing = Object.keys(SHEET_FILES)
      .map(keyFor)
      .filter((key) => !catalogKeys.has(key));
    expect(missing, `packed sheet(s) with no catalog row: ${missing.join(', ')}`).toEqual([]);
  });
});
