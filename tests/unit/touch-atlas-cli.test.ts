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
    const { dirs } = stage();
    const source = join(dirs.outDir, '..', 'candidate.png');
    writeFileSync(source, syntheticCell(120));

    const written = main([`--cell=touch-attack`, `--source=${source}`], dirs);

    expect(written).toEqual([
      join(dirs.cutDir, 'touch-attack.png'),
      join(dirs.outDir, 'touch-attack.png'),
    ]);
    // 🔴 No sweep. A sweep here would delete the five faces the single-cell mode exists to spare.
    expect(readdirSync(dirs.cutDir).sort(), 'the other five cuts were swept away').toHaveLength(6);
  });
});
