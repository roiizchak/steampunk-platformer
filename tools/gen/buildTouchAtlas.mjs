/**
 * The touch-control faces -> six 160 x 160 PNGs in `public/assets/ui/`.
 *
 * Orchestration only: which bytes, which directories, what gets written. The pixels are
 * `touchPlateCut.mjs` (plate -> cut face) and `touchInk.mjs` (cut face -> shipped face); the argv
 * and the source manifest are `touchAtlasCli.mjs`.
 *
 * ## THREE MODES, and the default one does NOT cut
 *
 * `npm run assets:touch` reads the committed cut faces in `tests/fixtures/touch-cut/` and inks
 * them. `npm run assets:touch:adopt` is the only path that cuts a plate and rewrites those cuts.
 * The grammar and the reasoning live in `touchAtlasCli.mjs`; the short version is that the cuts are
 * the oracle every shipped-bytes gate measures against, and a build that rewrites its own oracle
 * proves nothing.
 *
 * Recorded in `docs/generations/phase-12-touch-plate.md` with every `request_id`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bakePlateAlpha, keylineMarks } from './touchInk.mjs';
import { decodePng, encodePng, readBytes, readPng } from './png.mjs';
import { TOUCH_PLATE_CELLS } from './promptTouch.mjs';
import { cutFace, cutPlate } from './touchPlateCut.mjs';
import { TOUCH_CELL_SOURCES, TOUCH_PLATE_SOURCE, parseTouchArgs } from './touchAtlasCli.mjs';

/** Where the faces ship. One file per control, keyed in `public/assets/index.json`. */
export const TOUCH_OUT_DIR = 'public/assets/ui';

/**
 * Where the CUT faces go — the downscaled cell as the plate gave it, before `keylineMarks` and
 * `bakePlateAlpha`.
 *
 * 🔴 **Committed, and the reason is that every shipped-bytes gate was otherwise reading its own
 * oracle off the mutated file.** The alpha invariant decided what was "ink" by luminance and the
 * contrast gate decided where the "mark" was by opacity — both discovered from the very bytes
 * under test, so a mutation that erased the engraving and left two ink cells standing simply moved
 * the mask with it and scored 3.09:1. Codex round-11. The plate itself is 3.8 MB and gitignored;
 * these six 160 px faces are ~30 KB each and are the smallest thing that says, independently of
 * the result, what the result was supposed to be.
 */
export const TOUCH_CUT_DIR = 'tests/fixtures/touch-cut';

/**
 * The keys the GAME will ask the texture manager for, read from the catalog it loads.
 *
 * 🔴 Independent of `TOUCH_PLATE_CELLS`, and that is the entire point. The first version of
 * the count guard compared `cells.size` with the length of the array that built `cells` — delete a
 * descriptor and five equals five, the sixth PNG stays on disk from an earlier run, and
 * `shipped-touch.test.ts` happily reads that stale committed file. Codex round-7. The catalog is
 * the other end of the contract: a face that is not in it is a file the game will never load.
 *
 * @returns {string[]}
 */
function catalogTouchKeys() {
  const catalog = JSON.parse(fs.readFileSync('public/assets/index.json', 'utf8'));
  return catalog.images
    .map((/** @type {{key: string}} */ image) => image.key)
    .filter((/** @type {string} */ key) => key.startsWith('touch-'))
    .sort();
}

/** Where the three modes look for their cut faces. Injected so a test can drive real writes. */
export const DEFAULT_DIRS = { outDir: TOUCH_OUT_DIR, cutDir: TOUCH_CUT_DIR };

/**
 * The cut faces this run will ink, and where they came from.
 *
 * 🔴 `adopt` decodes the plate ONCE and then replaces only overridden keys, each from its own
 * file. Cutting per key would decode a 3.8 MB plate six times for no gain; replacing after the cut
 * is what lets a single re-shot cell coexist with five that still come from the plate.
 *
 * @param {import('./touchAtlasCli.d.mts').TouchBuildArgs} args
 * @param {{ outDir: string, cutDir: string }} dirs
 * @returns {Map<string, import('./png.d.mts').RgbaImage>}
 */
function sourceCells(args, dirs) {
  if (args.mode === 'ink') {
    // The committed oracle, read and never written. This is the ordinary build.
    return new Map(
      TOUCH_PLATE_CELLS.map((cell) => [cell.key, readPng(path.join(dirs.cutDir, `${cell.key}.png`))]),
    );
  }
  if (args.mode === 'cell') {
    return new Map([[args.key, cutFace(decodePng(readBytes(requireFile(args.source))), args.key)]]);
  }
  const cells = cutPlate(readBytes(requireFile(TOUCH_PLATE_SOURCE))).cells;
  for (const [key, file] of Object.entries(TOUCH_CELL_SOURCES)) {
    cells.set(key, cutFace(decodePng(readBytes(requireFile(file))), key));
  }
  return cells;
}

/**
 * @param {string} file
 * @returns {string}
 */
function requireFile(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    throw new Error(`no image at ${file} — generate it first, see docs/generations/`);
  }
  return resolved;
}

/**
 * Cut, ink and write, returning EVERY path written.
 *
 * ⚠️ The return value is the point. *"The default mode does not rewrite the oracle"* is a claim
 * about a write set, and a test that can only inspect the filesystem afterwards cannot tell a file
 * that was rewritten identically from one that was left alone.
 *
 * @param {import('./touchAtlasCli.d.mts').TouchBuildArgs} args
 * @param {{ outDir: string, cutDir: string }} dirs
 * @returns {string[]}
 */
export function runBuild(args, dirs) {
  const cells = sourceCells(args, dirs);

  // The contract, checked BEFORE anything is written: what this run produced against what the game
  // will look for. Neither side is derived from the other. `cell` produces one key on purpose, so
  // it asks the containment question that full-set equality cannot express.
  const produced = [...cells.keys()].sort();
  const wanted = catalogTouchKeys();
  if (args.mode === 'cell') {
    if (!wanted.includes(args.key)) {
      throw new Error(`the catalog has no ${args.key} — a face it does not name is never loaded`);
    }
  } else if (produced.join(',') !== wanted.join(',')) {
    throw new Error(
      `cut [${produced.join(', ')}] but the catalog asks for [${wanted.join(', ')}] — ` +
        'add or remove the index.json rows and the cell descriptors together',
    );
  }

  fs.mkdirSync(dirs.outDir, { recursive: true });
  if (args.mode !== 'ink') fs.mkdirSync(dirs.cutDir, { recursive: true });

  const written = [];
  for (const [key, cut] of cells) {
    if (args.mode !== 'ink') {
      // The CUT face — everything the source gave us, before either ink pass. Committed, because
      // it is the only independent statement of where the engraving is. See TOUCH_CUT_DIR.
      const cutPath = path.join(dirs.cutDir, `${key}.png`);
      fs.writeFileSync(cutPath, encodePng(cut.width, cut.height, cut.data));
      written.push(cutPath);
    }

    const { image: inked, mark } = keylineMarks(cut);
    const image = bakePlateAlpha(inked, mark);
    const out = path.join(dirs.outDir, `${key}.png`);
    fs.writeFileSync(out, encodePng(image.width, image.height, image.data));
    written.push(out);
    console.log(`${out}  ${image.width} x ${image.height}`);
  }

  // 🔴 `cell` never sweeps. It produces one key, so a sweep would delete the five faces the whole
  // single-cell mode exists to leave alone.
  const swept = args.mode === 'adopt' ? [dirs.outDir, dirs.cutDir] : args.mode === 'ink' ? [dirs.outDir] : [];
  for (const dir of swept) {
    for (const file of staleFaces(fs.readdirSync(dir), cells)) {
      fs.rmSync(path.join(dir, file));
      console.log(`removed stale ${path.join(dir, file)}`);
    }
  }
  console.log(`
${args.mode}: ${cells.size} face(s), ${written.length} file(s) written`);
  return written;
}

/**
 * Parse, then build. **Exported and driven by a test**, because this composition is the seam.
 *
 * A parser tested alone proves only that it parses; the defect this replaces was a `main()` that
 * never consulted argv at all, and a gate over a pure selector would not have seen it.
 *
 * @param {string[]} argv
 * @param {{ outDir: string, cutDir: string }} [dirs]
 * @returns {string[]}
 */
export function main(argv, dirs = DEFAULT_DIRS) {
  return runBuild(parseTouchArgs(argv), dirs);
}

/**
 * Which files in the output directory this run did NOT produce and should therefore delete.
 *
 * ⚠️ A key dropped from the cells leaves its PNG on disk from an earlier run, committed, and
 * every gate downstream reads that stale file as though this run had made it. Sweeping is the fix.
 *
 * 🔴 **`touch-` FIRST, and pure so it can be driven.** Without the prefix test this deletes
 * every `.png` in the directory — dormant today because the directory holds only faces, destructive
 * the moment an unrelated UI image lands there. It was inline in `main()` with no gate, so the
 * mutation that dropped the prefix stayed green (M53). Codex round-8.
 *
 * @param {string[]} files
 * @param {{ has(key: string): boolean }} produced
 * @returns {string[]}
 */
export function staleFaces(files, produced) {
  return files.filter(
    (file) => file.startsWith('touch-') && file.endsWith('.png') && !produced.has(file.slice(0, -4)),
  );
}

/**
 * Is this module being RUN, rather than imported?
 *
 * 🔴 `fileURLToPath`, never `new URL(...).pathname`. A URL keeps the space in "Steampunk
 * Platformer" percent-encoded as `%20`, so the comparison was `.../Steampunk%20Platformer/...`
 * against `.../Steampunk Platformer/...` — never equal, and `main()` never ran. `npm run
 * assets:touch` printed nothing and exited 0, which is indistinguishable from success; the six
 * faces in `public/assets/ui/` were cut by calling `cutPlate` by hand. Found by the Codex round-6
 * review, and confirmed by the fact that this script had never once produced its own output.
 *
 * ⚠️ Exported so it can be DRIVEN. The repair had no gate of its own — reverting it to the
 * broken comparison left unit, build and e2e verification green, because nothing runs the CLI.
 * Codex round-8. `touch-atlas-cli.test.ts` passes it a path with a space in it, which is the whole
 * bug in one argument.
 *
 * @param {string | undefined} argv1
 * @param {string} moduleUrl
 * @returns {boolean}
 */
export function isCliEntry(argv1, moduleUrl) {
  return Boolean(argv1) && path.resolve(/** @type {string} */ (argv1)) === fileURLToPath(moduleUrl);
}

if (isCliEntry(process.argv[1], import.meta.url)) {
  main(process.argv.slice(2));
}
