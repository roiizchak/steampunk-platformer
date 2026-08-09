/**
 * Criterion 3.4 — the camera follows inside the map and never shows outside it.
 *
 * The decisions under test are engine-free *(vault 2.12)*: Phaser owns `setBounds`, `setZoom` and
 * `startFollow`, and this module decides what to hand them plus the two predicates that say
 * whether the result is correct. Both predicates are imported by `tests/e2e/phase-03-tilemap.spec.ts`
 * as well, so the criterion is asserted against ONE definition rather than a unit-test version and
 * a subtly different e2e version.
 *
 * `cameraSetup` throwing on a level no larger than the view is vault 3.2 mechanised. That lesson is
 * a shipped side-scroller with 10 px of scroll room — a bug nobody notices until the level design
 * phase, because a camera with nothing to scroll to looks exactly like a camera that works.
 */

import { describe, expect, it } from 'vitest';
import { CAMERA_ZOOM, GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import type { LevelData } from '../../src/game/tilemap';
import { cameraSetup, tracksTarget, viewFits } from '../../src/render/cameraRig';
import type { Rect } from '../../src/sim/types';

/** A level of an arbitrary pixel size. Only the fields `cameraSetup` reads are meaningful. */
function levelOf(widthPx: number, heightPx: number): LevelData {
  return {
    id: 'fixture',
    widthTiles: widthPx / 32,
    heightTiles: heightPx / 32,
    tileWidth: 32,
    tileHeight: 32,
    widthPx,
    heightPx,
    solids: [{ x: 0, y: heightPx - 32, w: widthPx, h: 32 }],
    spawn: { x: 64, y: heightPx - 32 },
    // The camera reads neither, and they are spelled out rather than spread from a partial so a
    // future field is a typecheck error here too — that seam is why this literal is not a cast.
    hazards: [],
    enemies: [],
  };
}

const VIEW_W = GAME_WIDTH / CAMERA_ZOOM;
const VIEW_H = GAME_HEIGHT / CAMERA_ZOOM;

describe('cameraSetup (criterion 3.4)', () => {
  it('derives bounds from the level, so the camera cannot be told a size the level does not have', () => {
    const setup = cameraSetup(levelOf(5760, 1536), GAME_WIDTH, GAME_HEIGHT);

    expect(setup.bounds).toEqual({ x: 0, y: 0, w: 5760, h: 1536 });
    expect(setup.zoom).toBe(CAMERA_ZOOM);
  });

  it('publishes the zoom from the single runtime source, not a local copy (Codex P8)', () => {
    // If cameraRig ever grows its own CAMERA_ZOOM literal, this is what notices. Three sources for
    // one number — two modules and ASSET-PIPELINE.md — is three chances to drift.
    expect(cameraSetup(levelOf(5760, 1536), GAME_WIDTH, GAME_HEIGHT).zoom).toBe(CAMERA_ZOOM);
  });

  it('lerps on both axes, so following is smoothed rather than snapped', () => {
    const setup = cameraSetup(levelOf(5760, 1536), GAME_WIDTH, GAME_HEIGHT);

    for (const lerp of [setup.lerpX, setup.lerpY]) {
      expect(lerp).toBeGreaterThan(0);
      expect(lerp).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Vault 3.2, as a hard failure. Each axis is asserted INDEPENDENTLY: a rule that only fires when
   * both axes are short would pass a level that is 5760 px wide and exactly 1080 px tall, which is
   * the "no vertical scroll room at all" half of the original defect.
   */
  it('REJECTS a level no larger than the view — on either axis alone (vault 3.2)', () => {
    expect(() => cameraSetup(levelOf(VIEW_W, 1536), GAME_WIDTH, GAME_HEIGHT)).toThrow();
    expect(() => cameraSetup(levelOf(5760, VIEW_H), GAME_WIDTH, GAME_HEIGHT)).toThrow();
    expect(() => cameraSetup(levelOf(VIEW_W - 1, 1536), GAME_WIDTH, GAME_HEIGHT)).toThrow();
    expect(() => cameraSetup(levelOf(5760, VIEW_H - 1), GAME_WIDTH, GAME_HEIGHT)).toThrow();

    // And the boundary the other way: one pixel of scroll room on each axis is legal. Without
    // this the rule could be ">= 2x the view" and every assertion above would still pass.
    expect(() => cameraSetup(levelOf(VIEW_W + 1, VIEW_H + 1), GAME_WIDTH, GAME_HEIGHT)).not.toThrow();
  });

  it('names the axis and both numbers when it rejects — a bare throw is not a diagnosis', () => {
    expect(() => cameraSetup(levelOf(VIEW_W, 1536), GAME_WIDTH, GAME_HEIGHT)).toThrow(/width/i);
    expect(() => cameraSetup(levelOf(5760, VIEW_H), GAME_WIDTH, GAME_HEIGHT)).toThrow(/height/i);
  });
});

describe('viewFits (criterion 3.4 — never shows outside the map)', () => {
  const bounds: Rect = { x: 0, y: 0, w: 5760, h: 1536 };

  it('accepts a view fully inside the bounds, including flush against each edge', () => {
    expect(viewFits(bounds, { x: 100, y: 100, w: VIEW_W, h: VIEW_H })).toBe(true);
    expect(viewFits(bounds, { x: 0, y: 0, w: VIEW_W, h: VIEW_H })).toBe(true);
    expect(viewFits(bounds, { x: 5760 - VIEW_W, y: 1536 - VIEW_H, w: VIEW_W, h: VIEW_H })).toBe(true);
  });

  /**
   * Every edge tested separately. A predicate that only checked the left and top would pass three
   * of these, and "the camera never shows past the RIGHT edge of the map" is exactly the failure a
   * follow camera produces at the end of a level.
   */
  it('rejects a view past each of the four edges, one pixel is enough', () => {
    expect(viewFits(bounds, { x: -1, y: 0, w: VIEW_W, h: VIEW_H })).toBe(false);
    expect(viewFits(bounds, { x: 0, y: -1, w: VIEW_W, h: VIEW_H })).toBe(false);
    expect(viewFits(bounds, { x: 5760 - VIEW_W + 1, y: 0, w: VIEW_W, h: VIEW_H })).toBe(false);
    expect(viewFits(bounds, { x: 0, y: 1536 - VIEW_H + 1, w: VIEW_W, h: VIEW_H })).toBe(false);
  });

  it('rejects a view larger than the bounds, which no amount of scrolling can fix', () => {
    expect(viewFits(bounds, { x: 0, y: 0, w: 5761, h: VIEW_H })).toBe(false);
    expect(viewFits(bounds, { x: 0, y: 0, w: VIEW_W, h: 1537 })).toBe(false);
  });
});

/**
 * `tracksTarget` is what stops criterion 3.4 passing on a camera that merely MOVES.
 *
 * Codex plan-review P6: containment plus "scrollX increased" is satisfied by a scripted pan that
 * ignores the player entirely. The thing actually being claimed is that the player stays on
 * screen, so that is what is asserted — inside the view, inset by a margin, on every sampled
 * frame. The inset is what makes it fail before the player is literally off screen.
 *
 * Note this is deliberately NOT "the player is at the view centre". Phaser clamps scroll at the
 * map edges, so at spawn the player is legitimately far off centre and a centring assertion would
 * fail on a correct camera.
 */
describe('tracksTarget (criterion 3.4 — following, not merely moving)', () => {
  const view: Rect = { x: 1000, y: 200, w: VIEW_W, h: VIEW_H };

  it('accepts a target inside the view by more than the inset', () => {
    expect(tracksTarget(view, 1000 + VIEW_W / 2, 200 + VIEW_H / 2, 200)).toBe(true);
  });

  it('rejects a target that has drifted into the inset margin on any side', () => {
    expect(tracksTarget(view, 1000 + 199, 200 + VIEW_H / 2, 200)).toBe(false);
    expect(tracksTarget(view, 1000 + VIEW_W - 199, 200 + VIEW_H / 2, 200)).toBe(false);
    expect(tracksTarget(view, 1000 + VIEW_W / 2, 200 + 199, 200)).toBe(false);
    expect(tracksTarget(view, 1000 + VIEW_W / 2, 200 + VIEW_H - 199, 200)).toBe(false);
  });

  it('rejects a target fully outside the view — the camera stopped following', () => {
    expect(tracksTarget(view, 1000 + VIEW_W + 500, 200 + VIEW_H / 2, 200)).toBe(false);
  });

  it('is not vacuously true: a zero inset still rejects a target outside the view', () => {
    expect(tracksTarget(view, 999, 200 + VIEW_H / 2, 0)).toBe(false);
    expect(tracksTarget(view, 1001, 200 + VIEW_H / 2, 0)).toBe(true);
  });

  /**
   * The clamped-edge rule, added in Phase 4 after criterion 3.4 went red on a CORRECT camera.
   *
   * The shipped level's walking surface sits 192 px above the world's bottom edge, so a grounded
   * player can never be 200 px clear of a view that `viewFits` pins to that edge. The two
   * predicates 3.4 asserts together were jointly unsatisfiable, and it failed on 200 of 200
   * sampled frames. Where the camera has no freedom, the only claim it can be held to is that the
   * player is on screen; everywhere else the full inset still applies.
   */
  describe('a side flush against the map drops its inset — but only that side', () => {
    // A view pinned to the bottom-right of a map exactly one view bigger in each direction.
    const map: Rect = { x: 0, y: 0, w: VIEW_W * 2, h: VIEW_H * 2 };
    const pinned: Rect = { x: VIEW_W, y: VIEW_H, w: VIEW_W, h: VIEW_H };

    it('accepts a target inside the inset on the two flush sides', () => {
      // 10 px from the right edge and 10 px from the bottom edge — both clamped, both excused.
      const x = pinned.x + VIEW_W - 10;
      const y = pinned.y + VIEW_H - 10;
      expect(tracksTarget(pinned, x, y, 200, map)).toBe(true);
      // ...and without the map it is still rejected, so the old meaning is intact.
      expect(tracksTarget(pinned, x, y, 200)).toBe(false);
    });

    it('still rejects a target inside the inset on a side the camera COULD have moved', () => {
      // Left and top are NOT flush here — the camera has a whole view of travel available — so
      // drifting into the margin there is a real tracking failure and stays red.
      expect(tracksTarget(pinned, pinned.x + 10, pinned.y + VIEW_H / 2, 200, map)).toBe(false);
      expect(tracksTarget(pinned, pinned.x + VIEW_W / 2, pinned.y + 10, 200, map)).toBe(false);
    });

    it('never excuses a target that is off screen entirely, even on a flush side', () => {
      expect(tracksTarget(pinned, pinned.x + VIEW_W + 1, pinned.y + VIEW_H / 2, 200, map)).toBe(
        false,
      );
      expect(tracksTarget(pinned, pinned.x + VIEW_W / 2, pinned.y + VIEW_H + 1, 200, map)).toBe(
        false,
      );
    });
  });
});
