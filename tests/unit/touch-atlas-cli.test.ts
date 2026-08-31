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

import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TOUCH_CUT_DIR, isCliEntry, main, staleFaces } from '../../tools/gen/buildTouchAtlas.mjs';
import { encodePng, readBytes } from '../../tools/gen/png.mjs';
import { parseTouchArgs } from '../../tools/gen/touchAtlasCli.mjs';
import { TOUCH_PLATE_COLS } from '../../tools/gen/promptTouch.mjs';
import { TOUCH_PLATE_SHEET_ROWS } from '../../tools/gen/touchPlateCut.mjs';

/** A directory with a space in it, which is this repository's own situation. */
const DIR = 'C:/Claude/Steampunk Platformer/tools/gen';
const URL_WITH_SPACE = `file:///${DIR.replace(/ /g, '%20')}/buildTouchAtlas.mjs`;

describe('the atlas builder knows when it is being run', () => {
  it('matches its own path even when the path contains a space', () => {
    // The one assertion the old guard could not pass. `new URL(...).pathname` returns
    // `/C:/Claude/Steampunk%20Platformer/...`, which resolves to a directory that does not exist.
    expect(isCliEntry(`${DIR}/buildTouchAtlas.mjs`, URL_WITH_SPACE)).toBe(true);
  });

  it('does not match a different script, or none', () => {
    expect(isCliEntry(`${DIR}/promptTouch.mjs`, URL_WITH_SPACE)).toBe(false);
    expect(isCliEntry(undefined, URL_WITH_SPACE)).toBe(false);
    expect(isCliEntry('', URL_WITH_SPACE)).toBe(false);
  });
});

describe('the atlas builder sweeps only what it owns', () => {
  const produced = new Set(['touch-left', 'touch-right']);

  it('removes a face this run did not produce', () => {
    // The stale-file case: a control dropped from the cells leaves its PNG behind, committed, and
    // `shipped-touch.test.ts` then reads it as though this run had made it.
    expect(staleFaces(['touch-left.png', 'touch-right.png', 'touch-walk.png'], produced)).toEqual([
      'touch-walk.png',
    ]);
  });

  it('does NOT remove a file that was never a touch face', () => {
    // 🔴 Without the `touch-` test this deletes every `.png` in `public/assets/ui/`. Dormant
    // while the directory holds only faces, destructive the moment any other UI image lands there
    // — and `npm run assets:touch` would do it silently. Codex round-8; M53 reds here.
    expect(
      staleFaces(['touch-left.png', 'touch-right.png', 'hud-frame.png', 'logo.png'], produced),
      'the sweep ate a file that is not a touch face',
    ).toEqual([]);
  });

  it('ignores anything that is not a PNG', () => {
    expect(staleFaces(['touch-left.png', 'touch-notes.md', 'touch-old.webp'], produced)).toEqual([]);
  });
});

describe('parseTouchArgs — the grammar, and every way it is refused', () => {
  it('reads the three modes', () => {
    expect(parseTouchArgs([])).toEqual({ mode: 'ink' });
    expect(parseTouchArgs(['--adopt'])).toEqual({ mode: 'adopt' });
    expect(parseTouchArgs(['--cell=touch-attack', '--source=take.png'])).toEqual({
      mode: 'cell',
      key: 'touch-attack',
      source: 'take.png',
    });
  });

  // 🔴 Every rejection happens BEFORE the builder opens a file. A half-validated argv that fails
  // partway through leaves one directory new and the other old, which is the exact state the cut
  // fixtures exist to make impossible.
  it.each([
    ['an unknown flag', ['--nope']],
    ['a flag with no value', ['--cell']],
    ['an empty value', ['--cell=', '--source=x.png']],
    ['a key the descriptors do not name', ['--cell=touch-nope', '--source=x.png']],
    ['--cell without --source', ['--cell=touch-attack']],
    ['--source without --cell', ['--source=x.png']],
    ['--cell repeated', ['--cell=touch-attack', '--cell=touch-jump', '--source=x.png']],
    ['--source repeated', ['--cell=touch-attack', '--source=a.png', '--source=b.png']],
    ['--adopt repeated', ['--adopt', '--adopt']],
    // Not a nicety: `--adopt` sweeps and `--cell` must not, so a run meaning both would delete the
    // five faces the single-cell mode exists to leave alone.
    ['--cell together with --adopt', ['--adopt', '--cell=touch-attack', '--source=x.png']],
  ])('refuses %s', (_why, argv) => {
    expect(() => parseTouchArgs(argv)).toThrow();
  });
});

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
  const r = cell * 0.35;
  for (let row = 0; row < TOUCH_PLATE_SHEET_ROWS; row += 1) {
    for (let col = 0; col < TOUCH_PLATE_COLS; col += 1) {
      const grey = 20 + (row * TOUCH_PLATE_COLS + col) * 15;
      const cx = col * cell + cell / 2;
      const cy = row * cell + cell / 2;
      for (let y = cy - r; y <= cy + r; y += 1) {
        for (let x = cx - r; x <= cx + r; x += 1) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const i = (Math.round(y) * w + Math.round(x)) * 4;
          data[i] = grey;
          data[i + 1] = grey;
          data[i + 2] = grey;
        }
      }
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
  writeFileSync(override, syntheticCell(220));
  return { plateSource, cellSources: { [OVERRIDE_KEY]: override } };
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
    const { dirs, before } = stage();
    const source = join(dirs.outDir, '..', 'candidate.png');
    writeFileSync(source, syntheticCell(120));

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
        readBytes(join(dirs.outDir, file)),
        `${file} changed — --cell touched a face it was not given`,
      ).toEqual(bytes);
      expect(
        readBytes(join(dirs.cutDir, file)),
        `${file}'s cut changed — --cell touched a cut it was not given`,
      ).toEqual(bytes);
    }
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
