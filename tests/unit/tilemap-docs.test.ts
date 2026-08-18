/**
 * Criteria 3.6 and 3.6b — ASSET-PIPELINE.md publishes exactly what the code implements.
 *
 * Split out of `tilemap-data.test.ts` in Phase 8, which sat at exactly 400 lines and had to add
 * goal-object assertions and a five-level reach sweep. The two halves answer different questions and
 * separating them is not merely a size move: everything here pins a **document** against the code,
 * while everything left behind pins the **shipped level bytes** against the parser. `docExpectations()`
 * and `PIPELINE_DOC` are used only here.
 *
 * ⚠️ Phase 8 replaces level-01, so the camera-travel needle below moves with it. That is the point —
 * `docExpectations()` builds the needle from `LEVEL_01.widthPx`, so redesigning the level turns this
 * file red until the prose in ASSET-PIPELINE.md is updated to match. A red here is a doc that drifted,
 * never something to clear by editing the assertion.
 */

import { describe, expect, it } from 'vitest';
import { CAMERA_ZOOM, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../../src/game/constants';
import { ticksToMs } from '../../src/sim/index';
import { derivedFeel } from '../../src/sim/derived';
import { DEFAULT_TUNING, PLAYER_BOX } from '../../src/sim/player';
import { LEVEL_01, PIPELINE_DOC, docExpectations } from './tilemap-data-fixtures';

/**
 * Criteria 3.6 and 3.6b were "doc review" only, which Codex flagged (P8): a published number that
 * lives in a document and again in code can drift while both look right in isolation. Phase 4
 * spends real money against these, so they are pinned mechanically.
 */
describe('ASSET-PIPELINE.md publishes exactly what the code implements (3.6, 3.6b)', () => {
  it('the doc was actually found — otherwise every needle below matches nothing', () => {
    // Anti-vacuity (C2). This guard lived in tilemap-data.test.ts's sweep check before the split and
    // would have been left behind with it, making the `it.each` below pass on an empty document.
    expect(Object.keys(PIPELINE_DOC)).toHaveLength(1);
    expect(docExpectations().length).toBeGreaterThan(0);
  });

  // Markdown emphasis, table pipes and backticks stripped, whitespace collapsed. The lock is on
  // the published NUMBERS, not on whether they sit in a table or a sentence — otherwise a purely
  // editorial reflow of the document reads as a contract change.
  const doc = Object.values(PIPELINE_DOC)[0]!.replace(/[*|`]/g, ' ').replace(/\s+/g, ' ');

  // Table extracted to docExpectations() (tilemap-data-fixtures.ts): built from the same runtime
  // constants the doc is checked against, so the other rows interpolate rather than hand-type.
  it.each(docExpectations())('publishes the %s', (_what, needle) => {
    expect(doc).toContain(needle);
  });

  it('publishes the camera travel, derived from the shipped level', () => {
    // Codex (P10 follow-up): the travel figures were published but not pinned, so the doc could
    // drift from the level while every other row stayed green.
    const travelX = LEVEL_01.widthPx - GAME_WIDTH / CAMERA_ZOOM;
    const travelY = LEVEL_01.heightPx - GAME_HEIGHT / CAMERA_ZOOM;
    expect(doc).toContain(`Camera travel ${travelX} × ${travelY} px`);
  });

  it('no longer carries the PROPOSED marker on the grid cell size (criterion 3.6)', () => {
    expect(doc).not.toContain('PROPOSED, not yet published');
  });

  /**
   * THE SENSOR THE PHASE 2 SUITE DOES NOT HAVE.
   *
   * The code-reviewer gate owner (brief 2) pointed out that every movement assertion in
   * `player-movement.test.ts` derives its expectation from `world.tuning.*` — so multiplying all
   * eight distance knobs by the same factor is the single perturbation that suite is structurally
   * incapable of noticing. Even the anti-vacuity guard gets *easier* to satisfy, because doubling
   * `v` and `g` doubles the discrete-versus-continuous gap it demands.
   *
   * That is precisely the change Phase 4 made. So the character contract is pinned as absolute
   * numbers here, where a re-tune has to come and edit them deliberately.
   */
  it('pins the character contract in absolute pixels, not in knob-relative terms', () => {
    const feel = derivedFeel(DEFAULT_TUNING, ticksToMs);
    const bodyHeightPx = PLAYER_BOX.h * RENDER_SCALE;

    // EDITED DELIBERATELY in Phase 4, which is exactly what this test exists to force. The scale
    // change (RENDER_SCALE 2 -> 6) is the perturbation described above, and this was the only
    // assertion in the repository that could see it.
    expect(bodyHeightPx).toBe(288);
    expect(PLAYER_BOX.w * RENDER_SCALE).toBe(132);
    expect(feel.apexPx).toBeCloseTo(449.5, 1);

    // 🔴 REVERSED 2026-08-15: 37/18/18 -> 73/36/36, apexPx 461.7 -> 449.5. These carried a note
    // claiming the tick contract made airtime unfree; it does not. Full record, in ONE place
    // rather than restated per file: `tests/unit/foot-plant.test.ts`.
    expect(feel.airtimeTicks).toBe(73);
    expect(feel.riseTicks).toBe(36);
    expect(feel.fallTicks).toBe(36);

    // Jump height in body heights — the ratio that actually describes how the game feels, and the
    // one number a uniform scaling of every knob does NOT leave alone. It moved on purpose: 3.13
    // body heights was 28 % of the screen at the old scale and would have been 84 % at this one.
    // 1.60 -> 1.56 with the 2026-08-15 airborne-window change, from discretisation alone.
    expect(feel.apexPx / bodyHeightPx).toBeCloseTo(1.56, 2);
    /**
     * Top speed in body heights per second — the measure the user's "moves too fast" was about,
     * and the one a pure re-scale leaves at 6.5 no matter how big the character gets.
     *
     * **6.5 → 2.5 (Phase 4) → 1.875 (session 10).** The last move is not another preference dial:
     * it is what the ART dictates. Zero foot-slide requires `ticksPerFrame × topSpeed` to equal the
     * measured foot travel per drawn frame (22.5 px on run), and `ticksPerFrame` must be a whole
     * number or session 9's judder returns. At 2 ticks per frame that fixes `runMax` at exactly
     * 9.0 px/tick — 540 px/s over a 288 px character. The run sheet was resampled 12 -> 15 frames to reach it: with 12 frames the only planted speeds were 7.5 and 11.25, and the user rejected both. See `tests/unit/foot-plant.test.ts`, which
     * is the gate; this line only records the consequence for the published contract.
     */
    expect((feel.topSpeed * 60) / bodyHeightPx).toBeCloseTo(1.875, 3);
    // And the character's share of the screen, which is what Phase 4 generates art against.
    expect((bodyHeightPx / GAME_HEIGHT) * 100).toBeCloseTo(26.67, 2);
  });
});
