/**
 * **The BUILDER refuses an out-of-family set, on every path that writes.**
 *
 * 🔴 The decision function had six gates and its production seam had none: deleting the check in
 * `runBuild` left every case in `touch-family.test.ts` green while the builder adopted anything at
 * all — a decision function with an ungated caller, which is the same defect as one with no caller,
 * one layer up. Codex round 17, finding 1.
 *
 * ⚠️ **And a throw is not proof that nothing was written.** A builder that wrote three faces and
 * then refused the fourth throws exactly the same error and leaves half the shipped art replaced,
 * so the output directory must be empty and every staged cut byte-unchanged. Codex round 18,
 * finding 4.
 *
 * Split out of `touch-family.test.ts` when that file crossed the 400-line rule.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TOUCH_CUT_DIR, main } from '../../tools/gen/buildTouchAtlas.mjs';
import { decodePng, encodePng, readBytes } from '../../tools/gen/png.mjs';
import { TOUCH_PLATE_CELLS } from '../../tools/gen/promptTouch.mjs';

type Rgba = { width: number; height: number; data: Uint8ClampedArray };

/** The six faces as they will be cut, which is what the builder hands the gate. */
function shippedCuts(): Map<string, Rgba> {
  return new Map(
    TOUCH_PLATE_CELLS.map((cell) => [
      cell.key,
      decodePng(readBytes(`${TOUCH_CUT_DIR}/${cell.key}.png`)) as Rgba,
    ]),
  );
}

/** A copy of `face` with every opaque pixel shifted by `(dr, dg, db)`. */
function reTone(face: Rgba, dr: number, dg: number, db: number): Rgba {
  const data = new Uint8ClampedArray(face.data);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 250) continue;
    data[i] = data[i]! + dr;
    data[i + 1] = data[i + 1]! + dg;
    data[i + 2] = data[i + 2]! + db;
  }
  return { width: face.width, height: face.height, data };
}

describe('the BUILDER refuses an out-of-family set', () => {
  /**
   * 🔴 The decision function had a gate and its production seam did not. Deleting the block in
   * `runBuild` left all the cases above red-capable while the builder adopted anything at all —
   * the same defect as a decision function with no consumer, one layer up. Codex round 17,
   * finding 1.
   */
  it('throws before writing anything, when a staged cut is out of family', () => {
    const root = mkdtempSync(join(tmpdir(), 'touch-family-'));
    const dirs = { outDir: join(root, 'ui'), cutDir: join(root, 'cut') };
    mkdirSync(dirs.outDir, { recursive: true });
    mkdirSync(dirs.cutDir, { recursive: true });

    const cuts = shippedCuts();
    const spoiled = [...cuts.keys()][4]!;
    const staged = new Map<string, Uint8Array>();
    for (const [key, face] of cuts) {
      const out =
        key === spoiled ? reTone(face, -120, 0, 120) : (face as { data: Uint8ClampedArray });
      const bytes =
        key === spoiled
          ? encodePng((out as Rgba).width, (out as Rgba).height, (out as Rgba).data)
          : readBytes(`${TOUCH_CUT_DIR}/${key}.png`);
      writeFileSync(join(dirs.cutDir, `${key}.png`), bytes);
      staged.set(`${key}.png`, bytes);
    }

    // `ink` — the ORDINARY build, which is the path a bad committed cut would reach production by.
    expect(
      () => main([], dirs),
      'the builder adopted a set it can measure as out of family',
    ).toThrow(/not one family/);

    // 🔴 **"Before writing" is a claim about the FILESYSTEM, and throwing does not establish it.**
    // A builder that wrote three faces and then refused the fourth throws exactly this error and
    // leaves a half-written output directory — which for `ink` is the shipped art. The refusal has
    // to happen before the first byte, so the directory it writes into must still be empty. Found
    // by Codex mid-round-18.
    expect(
      readdirSync(dirs.outDir),
      'the builder wrote faces before refusing the set — a partial write of the shipped art',
    ).toEqual([]);
    // And the CUTS it read are byte-for-byte what they were. An empty output directory alone would
    // still permit a builder that re-baselined the oracle on its way to refusing.
    for (const [file, bytes] of staged) {
      expect(
        readBytes(join(dirs.cutDir, file)),
        `${file} was rewritten by a run that refused the set`,
      ).toEqual(bytes);
    }
  });
});
