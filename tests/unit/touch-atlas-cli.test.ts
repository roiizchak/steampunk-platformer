/**
 * **`npm run assets:touch` has to actually run something.**
 *
 * 🔴 It did not, for the whole life of the adopted art. `buildTouchAtlas.mjs`'s entry-point guard
 * compared `new URL(import.meta.url).pathname` — which keeps the space in "Steampunk Platformer"
 * percent-encoded as `%20` — against `process.argv[1]`, which does not. They can never be equal, so
 * `main()` never ran: the script printed nothing and exited 0, which is indistinguishable from
 * success, and the six shipped faces were cut by calling `cutPlate` by hand.
 *
 * ⚠️ **And the repair had no gate.** Reverting it left unit, build and e2e verification green,
 * because nothing anywhere runs the CLI path. Found by the Codex round-8 review. This drives the
 * comparison directly, with the space that is the entire bug.
 */

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TOUCH_CUT_DIR, main } from '../../tools/gen/buildTouchAtlas.mjs';
import { encodePng, readBytes } from '../../tools/gen/png.mjs';
import { TOUCH_PLATE_COLS } from '../../tools/gen/promptTouch.mjs';
import { TOUCH_PLATE_SHEET_ROWS } from '../../tools/gen/touchPlateCut.mjs';


/** A one-cell source image: a grey disc on the chroma field, framed the way `cutFace` demands. */
function syntheticCell(grey: number): Uint8Array {
  const side = 300;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i + 1] = 255;
    data[i + 3] = 255;
  }
  const c = side / 2;
  const r = side * 0.35;
  for (let y = c - r; y <= c + r; y += 1) {
    for (let x = c - r; x <= c + r; x += 1) {
      if ((x - c) ** 2 + (y - c) ** 2 > r * r) continue;
      const i = (Math.round(y) * side + Math.round(x)) * 4;
      data[i] = grey;
      data[i + 1] = grey;
      data[i + 2] = grey;
    }
  }
  return encodePng(side, side, data);
}

/** The key whose source is overridden, standing in for a re-shot cell. */
const OVERRIDE_KEY = 'touch-attack';

/**
 * A synthetic plate in the sheet's real shape: `TOUCH_PLATE_COLS` x `TOUCH_PLATE_SHEET_ROWS` cells,
 * each a disc of its own grey so no two cells can be confused for one another, and square overall
 * because `plateCells` refuses anything else.
 */
function syntheticPlate(): Uint8Array {
  const cell = 300;
  const w = cell * TOUCH_PLATE_COLS;
  const h = cell * TOUCH_PLATE_SHEET_ROWS;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i + 1] = 255;
    data[i + 3] = 255;
  }
  for (let row = 0; row < TOUCH_PLATE_SHEET_ROWS; row += 1) {
    for (let col = 0; col < TOUCH_PLATE_COLS; col += 1) {
      familyCellPixels(w, h, col * cell, row * cell, row * TOUCH_PLATE_COLS + col, data);
    }
  }
  return encodePng(w, h, data);
}

/**
 * Write a plate and one override cell beside a staged run, and return the injection for `dirs`.
 *
 * The override's grey is deliberately outside the plate's ramp, so a face cut from the plate can
 * never coincide with one cut from the override.
 */
function syntheticSources(root: string): { plateSource: string; cellSources: Record<string, string> } {
  const plateSource = join(root, '..', 'plate.png');
  const override = join(root, '..', 'override.png');
  writeFileSync(plateSource, syntheticPlate());
  // Mark 8 is a position no plate cell uses, so a face cut from the plate can never coincide
  // with one cut from the override — and its BODY is the same brass, so the family gate passes.
  writeFileSync(override, syntheticFamilyCell(8));
  return { plateSource, cellSources: { [OVERRIDE_KEY]: override } };
}

/**
 * A brass disc carrying one distinguishing mark, framed the way `cutFace` demands.
 *
 * 🔴 **Warm and identical in body tone across every cell, distinguished by the MARK.** The
 * family gate (`touchFamily.mjs`) refuses a set whose body luminance or warmth disagree, so a
 * synthetic plate that varied its cells by grey level would be rejected by a real invariant for a
 * reason that has nothing to do with what the test is asking. The mark is inside the disc, so the
 * cell is still exactly one keyed component.
 */
function syntheticFamilyCell(mark: number): Uint8Array {
  const side = 300;
  return encodePng(side, side, familyCellPixels(side, side, 0, 0, mark));
}

/** Paints one brass disc with its mark into an RGBA buffer at cell offset `(ox, oy)`. */
function familyCellPixels(
  w: number,
  h: number,
  ox: number,
  oy: number,
  mark: number,
  into?: Uint8ClampedArray,
): Uint8ClampedArray {
  const data = into ?? new Uint8ClampedArray(w * h * 4);
  if (!into) {
    for (let i = 0; i < data.length; i += 4) {
      data[i + 1] = 255;
      data[i + 3] = 255;
    }
  }
  const cell = 300;
  const cx = ox + cell / 2;
  const cy = oy + cell / 2;
  const r = cell * 0.35;
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (Math.round(y) * w + Math.round(x)) * 4;
      // Brass: warm, and the same brass in every cell.
      data[i] = 200;
      data[i + 1] = 150;
      data[i + 2] = 60;
      data[i + 3] = 255;
    }
  }
  // The mark: a dark square whose position is the cell's identity. Inside the disc, so the cell
  // stays one component — and well inside `OUTER_R0`, so it never reaches the annulus the family
  // gate compares. Real glyphs sit centrally for the same reason; a synthetic mark placed out at
  // 0.4r spilled past 0.5r once downscaled and read as a lighting disagreement, which was the
  // fixture misbehaving and not the gate.
  const angle = (mark * 2 * Math.PI) / 9;
  const mx = cx + Math.cos(angle) * r * 0.15;
  const my = cy + Math.sin(angle) * r * 0.15;
  for (let y = my - 12; y <= my + 12; y += 1) {
    for (let x = mx - 12; x <= mx + 12; x += 1) {
      const i = (Math.round(y) * w + Math.round(x)) * 4;
      data[i] = 30;
      data[i + 1] = 22;
      data[i + 2] = 9;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('the default build reads the cut faces and does not rewrite them', () => {
  /** A temp pair seeded with the six committed cuts, plus the bytes they started as. */
  function stage(): { dirs: { outDir: string; cutDir: string }; before: Map<string, Uint8Array> } {
    const root = mkdtempSync(join(tmpdir(), 'touch-atlas-'));
    const dirs = { outDir: join(root, 'ui'), cutDir: join(root, 'cut') };
    mkdirSync(dirs.outDir, { recursive: true });
    mkdirSync(dirs.cutDir, { recursive: true });
    const before = new Map<string, Uint8Array>();
    for (const file of readdirSync(TOUCH_CUT_DIR)) {
      const bytes = readBytes(join(TOUCH_CUT_DIR, file));
      writeFileSync(join(dirs.cutDir, file), bytes);
      before.set(file, bytes);
      // 🔴 Seed `outDir` TOO, and this is the repair. Staging only the cut directory left the
      // shipped side empty, so a mutation that swept the other five faces out of `outDir` had
      // nothing to delete and passed — the single-cell mode's whole promise, ungated. Codex round
      // 14, finding 11. The bytes differ from the shipped faces (these are cuts, not inked faces)
      // and that is fine: the claim is that five files SURVIVE untouched, not what they contain.
      writeFileSync(join(dirs.outDir, file), bytes);
    }
    return { dirs, before };
  }

  it('writes only into the output directory, and leaves every cut byte-identical', () => {
    // 🔴 The WRITE SET, not the filesystem afterwards. "The ordinary build does not rewrite the
    // oracle" is a claim about what was written; a test that only inspects files after the fact
    // cannot tell a file rewritten identically from one that was never opened. That is precisely
    // how the missing repair hid: `assets:touch` and `assets:touch:adopt` produced identical bytes
    // for a day while doing completely different things.
    const { dirs, before } = stage();
    const written = main([], dirs);

    expect(written.length, 'one inked face per control').toBe(before.size);
    expect(
      readdirSync(dirs.outDir).sort(),
      'the default build did not write one face per control',
    ).toHaveLength(before.size);
    for (const p of written) {
      expect(
        p.startsWith(dirs.outDir),
        `the default build wrote ${p}, which is outside the output directory`,
      ).toBe(true);
    }
    for (const [file, bytes] of before) {
      expect(
        readBytes(join(dirs.cutDir, file)),
        `${file} changed — the ordinary build re-baselined the oracle every gate measures against`,
      ).toEqual(bytes);
    }
  });

  it('CUTS in --cell mode, writing one key into both directories and sweeping neither', () => {
    // The positive half. Without a mode that does write `cutDir`, the assertion above passes on a
    // builder that can no longer cut at all.
    //
    // 🔴 **Staged as a self-consistent SYNTHETIC family, not the shipped cuts.** `--cell` is now
    // judged against the five faces it is joining (Codex round 18, finding 1), so dropping a plain
    // grey disc beside five real brass buttons is correctly refused — the gate working, not the
    // routing failing. An `--adopt` from the synthetic sources populates both directories with six
    // faces that ARE one family, and the candidate is another cell of the same synthetic family.
    const base = mkdtempSync(join(tmpdir(), 'touch-atlas-cell-'));
    const dirs = {
      outDir: join(base, 'ui'),
      cutDir: join(base, 'cut'),
      ...syntheticSources(join(base, 'cut')),
    };
    mkdirSync(dirs.outDir, { recursive: true });
    mkdirSync(dirs.cutDir, { recursive: true });
    main(['--adopt'], dirs);
    const before = new Map<string, Uint8Array>();
    for (const file of readdirSync(dirs.cutDir)) {
      before.set(file, readBytes(join(dirs.cutDir, file)));
    }

    const source = join(base, 'candidate.png');
    writeFileSync(source, syntheticFamilyCell(5));

    const written = main([`--cell=touch-attack`, `--source=${source}`], dirs);

    expect(written).toEqual([
      join(dirs.cutDir, 'touch-attack.png'),
      join(dirs.outDir, 'touch-attack.png'),
    ]);
    // 🔴 No sweep, in EITHER directory, and both are checked. The `outDir` half was unstaged and
    // therefore untested: a mutation sweeping the five shipped faces the single-cell mode exists to
    // spare passed a green suite. Codex round 14, finding 11.
    for (const [dir, what] of [
      [dirs.cutDir, 'cut'],
      [dirs.outDir, 'shipped'],
    ] as const) {
      expect(readdirSync(dir).sort(), `the other five ${what} faces were swept away`).toHaveLength(6);
    }
    // And the five that were not asked for are byte-for-byte what they were.
    for (const [file, bytes] of before) {
      if (file === 'touch-attack.png') continue;
      expect(
        readBytes(join(dirs.cutDir, file)),
        `${file}'s cut changed — --cell touched a cut it was not given`,
      ).toEqual(bytes);
    }
  });

  it('REFUSES a --cell run when a neighbouring cut is missing', () => {
    // 🔴 The family check reads the other five off disk. Loading them "if they happen to be there"
    // meant a directory missing four cuts judged a family of two and wrote the candidate anyway —
    // the check passing because there was nothing left to disagree with it. Codex round 19,
    // finding 1. `requireFile` is what refuses, and this is what drives it.
    const base = mkdtempSync(join(tmpdir(), 'touch-atlas-partial-'));
    const dirs = {
      outDir: join(base, 'ui'),
      cutDir: join(base, 'cut'),
      ...syntheticSources(join(base, 'cut')),
    };
    mkdirSync(dirs.outDir, { recursive: true });
    mkdirSync(dirs.cutDir, { recursive: true });
    main(['--adopt'], dirs);
    rmSync(join(dirs.cutDir, 'touch-jump.png'));

    const source = join(base, 'candidate.png');
    writeFileSync(source, syntheticFamilyCell(5));

    expect(
      () => main([`--cell=touch-attack`, `--source=${source}`], dirs),
      'a partial set was judged as a family, and the candidate was written',
    ).toThrow(/touch-jump/);
  });

  it('REFUSES a --cell candidate that is out of family with the five it joins', () => {
    // 🔴 The single-cell path OVERWRITES the cut oracle and the shipped face, and it is the
    // documented workflow every re-shoot in this phase went through — so it was the one path an
    // out-of-family button could take into production and sit there until some later full build
    // noticed. It was exempt on the reasoning that a set of one is a family by construction, which
    // is true and beside the point. Codex round 18, finding 1.
    const base = mkdtempSync(join(tmpdir(), 'touch-atlas-cellbad-'));
    const dirs = {
      outDir: join(base, 'ui'),
      cutDir: join(base, 'cut'),
      ...syntheticSources(join(base, 'cut')),
    };
    mkdirSync(dirs.outDir, { recursive: true });
    mkdirSync(dirs.cutDir, { recursive: true });
    main(['--adopt'], dirs);
    const before = readBytes(join(dirs.cutDir, 'touch-attack.png'));

    // A grey disc — the same shape and the same mark, and not this family's brass.
    const source = join(base, 'grey.png');
    writeFileSync(source, syntheticCell(120));

    expect(
      () => main([`--cell=touch-attack`, `--source=${source}`], dirs),
      'an out-of-family single cell was written straight over the oracle',
    ).toThrow(/not one family/);

    expect(
      readBytes(join(dirs.cutDir, 'touch-attack.png')),
      'the refused candidate still overwrote the cut it was replacing',
    ).toEqual(before);
  });

  it('SWEEPS both directories in --adopt mode, writing every key', () => {
    // 🔴 Nothing drove `main(['--adopt'])` at all; only the flag parser was tested. The mode that
    // re-cuts every face from its recorded source — and so the mode that can silently reinstate a
    // superseded glyph if the override map is dropped — had no behavioural gate. Codex round 14,
    // finding 11.
    //
    // 🔴 And the first version of this test **passed when adoption never ran**. The recorded
    // sources are gitignored 4 MB plates, so it caught its own ENOENT and returned green — a gate
    // whose subject was absent on any fresh clone, and which asserted only a write count even when
    // the sources happened to be there. Codex round 15, finding 3. The sources are injected now,
    // so adoption ALWAYS runs, and every one of the twelve files is compared byte for byte.
    const { dirs: base } = stage();
    const dirs = { ...base, ...syntheticSources(base.cutDir) };
    // 🔴 Named `touch-*.png`, because `staleFaces` sweeps only that prefix — deliberately, so the
    // build cannot delete a neighbour's asset (M53). A file called `stale-extra.png` would survive
    // by design and the assertion would be testing the wrong thing.
    writeFileSync(join(dirs.cutDir, 'touch-superseded.png'), syntheticCell(10));
    writeFileSync(join(dirs.outDir, 'touch-superseded.png'), syntheticCell(10));

    const written = main(['--adopt'], dirs);

    expect(written.length, 'adopt writes a cut and a face for every control').toBe(12);
    for (const dir of [dirs.cutDir, dirs.outDir]) {
      expect(
        readdirSync(dir).includes('touch-superseded.png'),
        `adopt did not sweep ${dir} — a superseded file survived into the oracle`,
      ).toBe(false);
    }

    // Byte for byte, all twelve, against a second run into a fresh pair. Adoption that is not
    // reproducible is not an oracle: the committed cuts every shipped-bytes gate measures against
    // are whatever the last run happened to emit.
    const secondBase = stage().dirs;
    const second = { ...secondBase, ...syntheticSources(secondBase.cutDir) };
    const again = main(['--adopt'], second);
    expect(again.length, 'the second adopt run wrote a different number of files').toBe(12);
    for (const file of written) {
      const twin = file.replace(dirs.outDir, second.outDir).replace(dirs.cutDir, second.cutDir);
      expect(
        readBytes(twin),
        `${file} is not reproducible — two adopt runs from the same sources disagree`,
      ).toEqual(readBytes(file));
    }

    // 🔴 The OVERRIDE was honoured, which is the property that keeps a re-shot cell from being
    // silently recut out of the plate. `touch-attack`'s source here is a disc no cell of the
    // synthetic plate carries, so the face it produced can only have come from the override.
    const overridden = readBytes(join(dirs.outDir, `${OVERRIDE_KEY}.png`));
    const plateOnly = { ...stage().dirs };
    const plateOnlyDirs = {
      ...plateOnly,
      ...syntheticSources(plateOnly.cutDir),
      cellSources: {},
    };
    main(['--adopt'], plateOnlyDirs);
    expect(
      readBytes(join(plateOnlyDirs.outDir, `${OVERRIDE_KEY}.png`)),
      `${OVERRIDE_KEY} came out identical with and without its override — adopt recut it from the ` +
        'plate and the re-shoot is gone',
    ).not.toEqual(overridden);
  }, 60_000);
});
