/**
 * The touch-atlas builder's COMMAND LINE and its SOURCE MANIFEST — where the bytes come from.
 *
 * `buildTouchAtlas.mjs` owns how bytes become faces. This file owns which bytes, and how an argv
 * says so. The dependency runs one way — the builder imports this module, this module imports only
 * `promptTouch.mjs` for the key list — because the obvious alternative (a manifest in the builder,
 * a parser that reads it) is an import cycle waiting to happen.
 *
 * ## 🔴 Why the modes exist at all
 *
 * The six PNGs under `tests/fixtures/touch-cut/` are the ORACLE every shipped-bytes gate measures
 * against: `shipped-touch.test.ts` re-runs the two pure ink passes over them and demands the
 * shipped bytes back, and `shipped-touch-contrast.test.ts` discovers the mark mask from them rather
 * than from the file under test. An oracle the ordinary build rewrites is not an oracle — a change
 * to `keyOut`, the crop or the downscale would re-baseline the fixture and the shipped face in one
 * run, and every gate would follow the change.
 *
 * Codex round 13 asked for this split and it was recorded as applied. **It was not.** `82fe755`
 * added `assets:touch:adopt` to `package.json` and changed the builder not at all: `main()` read no
 * argv, so both scripts cut the plate and rewrote both directories. The commit message, the review
 * record and the handoff all said otherwise for a day. Found on 2026-08-31 by reading the diff.
 *
 * | invocation | mode | writes |
 * |---|---|---|
 * | *(no flags)* | `ink` | `outDir` only — the committed cuts are read, never written |
 * | `--adopt` | `adopt` | both, and sweeps both |
 * | `--cell=<key> --source=<path>` | `cell` | one key's cut and face; **no sweep** |
 */

import { TOUCH_PLATE_CELLS } from './promptTouch.mjs';

/**
 * The adopted plate. Take 3 — `docs/generations/phase-12-touch-plate.md`.
 *
 * Gitignored and 3.8 MB, which is why the 160 px cuts are what the repository commits.
 */
export const TOUCH_PLATE_SOURCE =
  '_generated/phase-12-touch/take-3-01a05115-d226-72b2-ae41-8998a11940cf.png';

/**
 * Per-key source overrides — a cell that came from its own generation rather than from the plate.
 *
 * 🔴 **Empty is the correct starting state, and the map is what makes `--adopt` safe after a
 * single-cell re-shoot.** Without it, `npm run assets:touch:adopt` recuts `TOUCH_PLATE_SOURCE` and
 * silently reinstates the superseded cell over a newer one. The guard is not this comment: `adopt`
 * has to reproduce all six shipped PNGs byte for byte, which it can only do while every key's
 * recorded source is the one its shipped bytes actually came from.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TOUCH_CELL_SOURCES = Object.freeze({});

/**
 * Which file a key's pixels come from.
 *
 * @param {string} key
 * @returns {string}
 */
export function sourceFor(key) {
  return TOUCH_CELL_SOURCES[key] ?? TOUCH_PLATE_SOURCE;
}

/** Every key the plate descriptors name, for validating `--cell`. */
const CELL_KEYS = new Set(TOUCH_PLATE_CELLS.map((cell) => cell.key));

/**
 * Parse the builder's argv into a validated, discriminated mode.
 *
 * 🔴 **Every rejection happens here, before the builder opens a single file.** A half-validated
 * argv that fails partway through leaves one directory new and the other old, which is the state
 * the whole oracle argument exists to prevent.
 *
 * @param {string[]} argv arguments after the script name
 * @returns {{ mode: 'ink' } | { mode: 'adopt' } | { mode: 'cell', key: string, source: string }}
 */
export function parseTouchArgs(argv) {
  let adopt = false;
  /** @type {string | undefined} */ let key;
  /** @type {string | undefined} */ let source;

  for (const arg of argv) {
    if (arg === '--adopt') {
      if (adopt) throw new Error('--adopt given twice');
      adopt = true;
      continue;
    }
    const named = /^--(cell|source)=(.*)$/.exec(arg);
    if (!named) {
      // A bare `--cell` with no `=value` lands here too, and saying so beats "unknown flag".
      if (arg === '--cell' || arg === '--source') throw new Error(`${arg} needs a value: ${arg}=…`);
      throw new Error(`unknown argument ${arg}`);
    }
    const [, name, value] = named;
    if (!value) throw new Error(`--${name} was given an empty value`);
    if (name === 'cell') {
      if (key !== undefined) throw new Error('--cell given twice');
      key = value;
    } else {
      if (source !== undefined) throw new Error('--source given twice');
      source = value;
    }
  }

  if (key !== undefined && source === undefined) throw new Error('--cell needs --source=<path>');
  if (source !== undefined && key === undefined) throw new Error('--source needs --cell=<key>');
  if (key !== undefined && adopt) {
    // Not a nicety. `--adopt` sweeps and `--cell` must not, so a run that meant both would delete
    // the five faces it was told not to touch.
    throw new Error('--cell and --adopt are different modes; give one');
  }
  if (key !== undefined) {
    if (!CELL_KEYS.has(key)) {
      throw new Error(`--cell=${key} is not one of ${[...CELL_KEYS].join(', ')}`);
    }
    return { mode: 'cell', key, source: /** @type {string} */ (source) };
  }
  return adopt ? { mode: 'adopt' } : { mode: 'ink' };
}
