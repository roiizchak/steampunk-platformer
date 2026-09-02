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
import { CAMERA_ZOOM, GAME_HEIGHT, GAME_WIDTH, MAX_GAME_WIDTH } from '../../src/game/constants';
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
    // The camera reads none of these, and they are spelled out rather than spread from a partial so a
    // future field is a typecheck error here too — that seam is why this literal is not a cast. It
    // worked exactly as designed in Phase 8: adding `goal` to LevelData failed this file, and this was
    // the ONLY synthetic LevelData in the repo, so the compiler found the whole blast radius.
    goal: { x: widthPx - 96, y: heightPx - 128, w: 64, h: 96 },
    hazards: [],
    enemies: [],
    gears: [],
  };
}

/** The five shipped levels, measured from their `.tmj` by `tilemap-data.test.ts`. */
const SHIPPED_EXTENTS: ReadonlyArray<readonly [string, number, number]> = [
  ['level-01', 9216, 2208],
  ['level-02', 10752, 2304],
  ['level-03', 12288, 2400],
  ['level-04', 13824, 2496],
  ['level-05', 15360, 2688],
];

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

/**
 * **The guards must be asked at the WIDEST view the game will draw, not at the design width.**
 *
 * 🔴 `Phaser.Scale.EXPAND` (2026-09-01) makes the live view up to `MAX_GAME_WIDTH` wide. Both
 * production call sites — `gameCamera.ts` and `bootLevels.ts` — validated at `GAME_WIDTH`, so the
 * "a side-scroller that cannot scroll" refusal *(vault 3.2)* was a statement about a view the game
 * no longer uses. The Codex plan review named it: the safety margin was prose the guards never saw.
 *
 * ⚠️ **A boundary fixture is not a mutation, and on its own it proves nothing here.** A level that
 * simply fails everywhere would red whatever width was passed. The fixture below is chosen to sit
 * BETWEEN the two widths — wide enough to scroll at 1920, not wide enough at 2560 — so it is
 * exactly the level that separates a correct call site from a reverted one. `M116` and `M117`
 * revert the two call sites independently, because one reverting must not hide behind the other.
 */
describe('the level guards see the widest live view', () => {
  /** Scrolls at the design width, does NOT scroll at the ceiling. The whole point of the fixture. */
  const BETWEEN_W = (GAME_WIDTH + MAX_GAME_WIDTH) / 2;

  it('the fixture really does straddle the two widths, or it separates nothing', () => {
    expect(BETWEEN_W, 'the fixture must scroll at the design width').toBeGreaterThan(GAME_WIDTH);
    expect(BETWEEN_W, 'the fixture must NOT scroll at the ceiling').toBeLessThan(MAX_GAME_WIDTH);
    // Passes at the design width...
    expect(() => cameraSetup(levelOf(BETWEEN_W, 4000), GAME_WIDTH, GAME_HEIGHT)).not.toThrow();
    // ...and refuses at the ceiling, which is the view production actually draws.
    expect(() => cameraSetup(levelOf(BETWEEN_W, 4000), MAX_GAME_WIDTH, GAME_HEIGHT)).toThrow(
      /cannot scroll/,
    );
  });

  it('every SHIPPED level still clears the ceiling, with room to spare', () => {
    // The reassurance half: the ceiling is a guard, not a constraint anyone meets. The narrowest
    // shipped level is 9216 px against a 2560 px view.
    for (const [id, widthPx, heightPx] of SHIPPED_EXTENTS) {
      expect(
        () => cameraSetup(levelOf(widthPx, heightPx), MAX_GAME_WIDTH, GAME_HEIGHT),
        `${id} no longer scrolls at the widest live view`,
      ).not.toThrow();
    }
  });
});

/**
 * **Both production call sites really do pass the ceiling — the boundary fixture cannot see this.**
 *
 * 🔴 The Codex plan review, round 2: *"a boundary fixture is not a mutation and will remain green if
 * `gameCamera.ts` or `bootLevels.ts` is reverted to `GAME_WIDTH`"*. Exactly so. Everything above
 * calls `cameraSetup` directly with a width the test chooses; nothing above notices which width
 * PRODUCTION chooses. Two call sites, two rows (M116, M117), because one reverting must not hide
 * behind the other.
 *
 * Source text rather than behaviour: `gameCamera.ts` value-imports Phaser and cannot be constructed
 * under `environment: 'node'`. The comment-stripping helper keeps a match from coming out of the
 * paragraph that explains the choice — the notes at both call sites name `GAME_WIDTH` to say why it
 * is wrong, which a naive `includes` would read as the code still using it.
 */
describe('the guards are wired to the ceiling in production', () => {
  const SOURCES = import.meta.glob(
    ['../../src/scenes/gameCamera.ts', '../../src/scenes/bootLevels.ts'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>;

  /** Strip block and line comments, so prose naming `GAME_WIDTH` cannot satisfy or break a claim. */
  function code(file: string): string {
    const key = Object.keys(SOURCES).find((k) => k.endsWith(file));
    if (key === undefined) throw new Error(`${file} is not in the glob — this gate scans nothing`);
    return SOURCES[key]!.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it.each([['gameCamera.ts'], ['bootLevels.ts']])(
    '%s validates at MAX_GAME_WIDTH, not the design width',
    (file) => {
      const src = code(file);
      expect(src, `${file} does not call cameraSetup at all — this gate scans nothing`).toContain(
        'cameraSetup(',
      );
      // Line-based, not a single regex: `bootLevels` nests `parseLevel(...)` inside the call, so a
      // `[^)]*` window stops at the inner paren and never reaches the width argument.
      const calls = src
        .split(String.fromCharCode(10))
        .filter((line) => line.includes('cameraSetup(') && !line.includes('import'));
      expect(calls.length, `${file} has no cameraSetup CALL — this gate scans nothing`).toBe(1);
      expect(
        calls[0],
        `${file} validates levels at the design width while production draws up to the ceiling`,
      ).toContain('MAX_GAME_WIDTH');
      expect(calls[0], `${file} still passes the design width to cameraSetup`).not.toMatch(
        /[^_]GAME_WIDTH/,
      );
    },
  );
});
