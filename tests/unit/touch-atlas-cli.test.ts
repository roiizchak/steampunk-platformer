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

import { describe, expect, it } from 'vitest';

import { isCliEntry } from '../../tools/gen/buildTouchAtlas.mjs';

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
