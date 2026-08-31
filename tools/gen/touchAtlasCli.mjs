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
export const TOUCH_CELL_SOURCES = Object.freeze({
  // Re-shot 2026-08-31 through `nano-banana-pro/edit`, take 5. Take 3's wrench carried
  // interior shading that split into four sub-3:1 fragments at 48 CSS px; this one is a
  // solid filled silhouette and all three of its strokes reach 3.32:1 / 3.85:1.
  // `docs/generations/phase-12-touch-plate.md` carries both `request_id`s.
  // Re-shot again 2026-08-31, take 8. Take 5's wrench was three pieces and the smallest measured
  // 2.740:1 at 47 CSS px while reading 3.318:1 at 44 and 48 — `resize.mjs`'s box filter is
  // `Math.floor`-partitioned and not monotonic in output size, so one size proved nothing about its
  // neighbours. One closed silhouette has no fragment to fall through.
  'touch-attack': '_generated/phase-12-touch/take-8-01a056c7-347a-7691-b105-8c3cbbc43daf.png',
  // Re-shot 2026-08-31, take 6. The cogwheel said SETTINGS, not pause, at any size — both
  // `ui-ux-tester` briefs independently — and its thin teeth were also the only strokes in the set
  // that missed 3:1 at the 44 CSS px floor where a control is still live (2.905:1). Two heavy
  // upright bars answer both at once.
  // Re-shot again 2026-08-31, take 9, and an HONESTY fix rather than a legibility one: the pause
  // bars promised "this suspends play" while `touchControlsLayer.ts:381` routes the control to
  // `openLevelSelect()`, a hard teardown that abandons the run. A grid of squares says *the level
  // menu*, which is where the button actually goes. Both round-2 briefs, independently.
  'touch-pause': '_generated/phase-12-touch/take-9-01a056c7-9d04-7fd2-bc7a-47c65b946658.png',
  // Re-shot 2026-08-31, take 7. Two stacked horizontal bars read as an "equals" and evoked nothing
  // about locomotion. A laced boot is the conventional pictograph for travelling on foot.
  'touch-walk': '_generated/phase-12-touch/take-7-01a056b2-442f-7690-b0b8-4c6a46954279.png',
});

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

/**
 * **SHA-256 of every recorded source, pinned.**
 *
 * 🔴 The sources are gitignored 4 MB plates, so *"adoption reproduces the six shipped PNGs byte for
 * byte"* was manual evidence with nothing tying it to particular bytes: a clone has no way to know
 * WHICH file the claim was made against, and a file replaced in place would carry the claim with
 * it. Codex round 16, finding 6.
 *
 * `tests/unit/touch-sources.test.ts` asserts the map covers every source in the manifest, and —
 * when a source is on this machine — that the file still hashes to its pin and that
 * `main(['--adopt'])` from those exact bytes reproduces the committed cuts. On a clone without the
 * sources the pins remain the record of what was used.
 *
 * Measured 2026-08-31.
 */
export const TOUCH_SOURCE_HASHES = Object.freeze({
  [TOUCH_PLATE_SOURCE]: '7d6429ba353f6cd7f5627912d6a89ecbd7c4cb49314f7f5fcb5127ac7f52906a',
  '_generated/phase-12-touch/take-8-01a056c7-347a-7691-b105-8c3cbbc43daf.png':
    '496ac302cb4b6cc413413947113e0f56f95b989dd404b8959d7b2072de027821',
  '_generated/phase-12-touch/take-9-01a056c7-9d04-7fd2-bc7a-47c65b946658.png':
    '94551e5f63faf4230919f22fc9e86674df8882493ce8d207bb6814c752408973',
  '_generated/phase-12-touch/take-7-01a056b2-442f-7690-b0b8-4c6a46954279.png':
    'ca6626428a1705e132059f50423a1105dc439273f3de3067a303bd57c8f17e3d',
});
