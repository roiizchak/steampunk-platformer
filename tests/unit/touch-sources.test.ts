/**
 * **The production sources, and the claim that adoption reproduces the shipped bytes.**
 *
 * 🔴 The `--adopt` gate next door injects a synthetic plate, which proves the mode runs, the
 * override is honoured and the output is deterministic — but it compares one execution against
 * another execution of the same code, so a deterministic crop, routing or transform defect affects
 * both sides identically. And the *production* reproduction claim was manual evidence in a
 * generation log, tied to no particular bytes: a clone cannot know which file it was made against.
 * Codex round 16, finding 6.
 *
 * Two things, therefore:
 *
 * - **Always**: every source the manifest names carries a pinned SHA-256. That much is a property
 *   of the repository and runs on any clone.
 * - **Per source that is present**: it still hashes to its pin. Checked one file at a time, not
 *   all-or-nothing — a partial cache used to leave every file it DID hold unconstrained.
 * - **When the whole set is present**: `main(['--adopt'])` from those exact bytes reproduces the
 *   committed cuts byte for byte.
 *
 * ⚠️ **The second half is conditional and says so.** That is not the defect round 15 finding 3
 * named — there the *only* behavioural test skipped itself; here the always-runs gate is the one
 * next door, and this adds evidence on top of it rather than standing in for it.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TOUCH_CUT_DIR, main } from '../../tools/gen/buildTouchAtlas.mjs';
import { readBytes } from '../../tools/gen/png.mjs';
import {
  TOUCH_CELL_SOURCES,
  TOUCH_PLATE_SOURCE,
  TOUCH_SOURCE_HASHES,
} from '../../tools/gen/touchAtlasCli.mjs';

const sources = [TOUCH_PLATE_SOURCE, ...Object.values(TOUCH_CELL_SOURCES)];

/**
 * The sources that are on THIS machine, checked one by one.
 *
 * 🔴 This used to be a single all-or-nothing `present`, so a partial cache holding three of the
 * four sources had every one of them unconstrained — the very state a half-finished download or a
 * selectively cleaned `_generated/` leaves behind. Codex round 17, finding 7. Only the
 * reproduction test needs the complete set, because it cuts all six faces.
 */
const onDisk = sources.filter((f) => existsSync(f));
const complete = onDisk.length === sources.length;

function sha256(file: string): string {
  return createHash('sha256').update(readBytes(file)).digest('hex');
}

describe('the recorded generation sources', () => {
  it('pins a hash for every source the manifest names', () => {
    for (const file of sources) {
      expect(
        TOUCH_SOURCE_HASHES[file],
        `${file} is adopted from but has no pinned hash — the reproduction claim names no bytes`,
      ).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(
      Object.keys(TOUCH_SOURCE_HASHES).sort(),
      'the pin map names a file the manifest does not adopt from, or misses one it does',
    ).toEqual([...sources].sort());
  });

  it.runIf(onDisk.length > 0)('still holds those exact bytes, for every source present', () => {
    for (const file of onDisk) {
      expect(sha256(file), `${file} is not the file the adoption claim was made against`).toBe(
        TOUCH_SOURCE_HASHES[file],
      );
    }
  });

  it.runIf(complete)(
    'reproduces the committed cuts byte for byte from the production sources',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'touch-adopt-real-'));
      const dirs = { outDir: join(root, 'ui'), cutDir: join(root, 'cut') };
      mkdirSync(dirs.outDir, { recursive: true });
      mkdirSync(dirs.cutDir, { recursive: true });

      main(['--adopt'], dirs);

      const committed = readdirSync(TOUCH_CUT_DIR).sort();
      expect(readdirSync(dirs.cutDir).sort(), 'adopt produced a different set of cuts').toEqual(
        committed,
      );
      for (const file of committed) {
        expect(
          readBytes(join(dirs.cutDir, file)),
          `${file} does not reproduce — the committed oracle is not what this pipeline cuts`,
        ).toEqual(readBytes(join(TOUCH_CUT_DIR, file)));
      }
    },
    60_000,
  );
});
