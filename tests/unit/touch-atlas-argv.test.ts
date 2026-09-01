/**
 * **The command line: when the builder runs, what it sweeps, and every argv it refuses.**
 *
 * 🔴 The entry-point guard is the reason this file exists. `buildTouchAtlas.mjs` compared
 * `new URL(import.meta.url).pathname` — which keeps the space in "Steampunk Platformer"
 * percent-encoded as `%20` — against `process.argv[1]`, which does not. They can never be equal, so
 * `main()` never ran for the whole life of the adopted art: the script printed nothing and exited
 * 0, which is indistinguishable from success, and the six shipped faces were cut by hand. Reverting
 * the repair left unit, build and e2e verification green. Found by the Codex round-8 review.
 *
 * Split out of `touch-atlas-cli.test.ts` when that file crossed the 400-line rule. This half never
 * touches the filesystem; the other half is all behaviour against staged directories.
 */

import { describe, expect, it } from 'vitest';

import { isCliEntry, staleFaces } from '../../tools/gen/buildTouchAtlas.mjs';
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

