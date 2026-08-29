import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import {
  TOUCH_BOX_PX,
  TOUCH_EDGE_PX,
  TOUCH_GAP_PX,
  TOUCH_IDS,
  TOUCH_MIN_CSS_PX,
  TOUCH_MENU_BOTTOM_PX,
  TOUCH_MENU_TOP_PX,
  TOUCH_MIN_GAP_CSS_PX,
  cssScaleFor,
  touchLayout,
  touchMenuLayout,
  touchTargetsDisjoint,
  touchTargetsFit,
} from '../../src/render/touchLayout';

/**
 * The layout half of the touch controls, and the two predicates production and acceptance share
 * ONE definition of — the `cameraRig.ts` `viewFits` / `tracksTarget` shape *(vault 2.12)*.
 *
 * 🔴 **The predicates are production-only oracles, and that is deliberate.** The Codex plan review
 * (round 1, finding 7) was right that a pure layout predicate used as its own acceptance oracle
 * cannot fail: it stays green with nothing drawn, or with everything drawn 400 px away. So this
 * file gates the ARITHMETIC, `tests/unit/touch-draw-path.test.ts` gates that a scene applies it, and
 * criteria 12.8/12.9 measure the LIVE objects against the LIVE canvas rect in a browser. Three
 * different questions; do not collapse them.
 *
 * ## Why the numbers are what they are
 *
 * `Phaser.Scale.FIT` holds the backing store at 1920x1080 at every viewport and DPR
 * (`docs/ENGINE-NOTES.md:305-331`, measured), and restyles only the canvas CSS size. So a button
 * declared in GAME pixels arrives on the player's screen at `gamePx * cssWidth / 1920`, and the
 * accessibility floor is a CSS-pixel floor. At the worst viewport this phase supports — iPhone SE
 * in landscape, 667x375, where FIT yields a 667 px wide canvas — that ratio is **0.347**.
 *
 * `TOUCH_BOX_PX` 160 * 0.347 = **55.6 CSS px** against a 44 px floor.
 * `TOUCH_GAP_PX` 32 * 0.347 = **11.1 CSS px** against an 8 px floor.
 *
 * The floor itself is cited, not invented: `ui-ux-pro-max`'s `ux-guidelines.csv`, Touch ->
 * *Touch Target Size* (*"Minimum 44x44px touch targets"*, severity High) and Touch ->
 * *Touch Spacing* (*"Minimum 8px gap between touch targets"*, severity Medium).
 */

/** The design-size layout, which is what production always gets under FIT. */
const design = () => touchLayout(GAME_WIDTH, GAME_HEIGHT);

const byId = (id: string) => {
  const found = design().find((t) => t.id === id);
  if (!found) throw new Error(`no target with id ${id}`);
  return found;
};

describe('touchLayout', () => {
  it('places one target per action and no others', () => {
    expect(design().map((t) => t.id).sort()).toEqual([...TOUCH_IDS].sort());
  });

  it('sizes every box at TOUCH_BOX_PX square', () => {
    for (const t of design()) {
      expect([t.id, t.w, t.h]).toEqual([t.id, TOUCH_BOX_PX, TOUCH_BOX_PX]);
    }
  });

  it('keeps every target inside the view', () => {
    for (const t of design()) {
      expect(t.x, `${t.id} starts left of the view`).toBeGreaterThanOrEqual(0);
      expect(t.y, `${t.id} starts above the view`).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w, `${t.id} runs past the right edge`).toBeLessThanOrEqual(GAME_WIDTH);
      expect(t.y + t.h, `${t.id} runs past the bottom edge`).toBeLessThanOrEqual(GAME_HEIGHT);
    }
  });

  it('anchors the movement pair to the bottom-left and the action pair to the bottom-right', () => {
    expect(byId('left').x).toBe(TOUCH_EDGE_PX);
    expect(byId('right').x).toBe(TOUCH_EDGE_PX + TOUCH_BOX_PX + TOUCH_GAP_PX);
    expect(byId('jump').x + TOUCH_BOX_PX).toBe(GAME_WIDTH - TOUCH_EDGE_PX);
    expect(byId('attack').x + TOUCH_BOX_PX).toBe(GAME_WIDTH - TOUCH_EDGE_PX - TOUCH_BOX_PX - TOUCH_GAP_PX);
    for (const id of ['left', 'right', 'attack', 'jump']) {
      expect(byId(id).y + TOUCH_BOX_PX, `${id} is not on the bottom row`).toBe(GAME_HEIGHT - TOUCH_EDGE_PX);
    }
  });

  it('puts pause in the top-right, clear of the top-left HUD plate', () => {
    const pause = byId('pause');
    expect(pause.y).toBe(TOUCH_EDGE_PX);
    expect(pause.x + TOUCH_BOX_PX).toBe(GAME_WIDTH - TOUCH_EDGE_PX);
    // The HUD plate is 413 x 128 at a 24 px top-left margin (`render/hud.ts:45,48`). A pause button
    // overlapping the health bar would be unusable and would also make 12.8's disjointness claim
    // true while the screen was wrong, because the plate is not a touch target.
    expect(pause.x, 'pause overlaps the HUD plate').toBeGreaterThan(24 + 413);
  });

  it('scales with the view rather than hardcoding the design size', () => {
    // Vault 6.2: a second camera created at an explicit size never auto-resizes, and the HUD learned
    // this by cropping a whole plate off a phone. FIT means production always passes 1920x1080, so
    // this can only be proved by asking for something else.
    const half = touchLayout(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    expect(half.map((t) => t.id)).toEqual(design().map((t) => t.id));
    for (const [i, t] of half.entries()) {
      expect([t.id, t.w]).toEqual([t.id, TOUCH_BOX_PX / 2]);
      expect(t.x).toBeCloseTo(design()[i].x / 2, 9);
      expect(t.y).toBeCloseTo(design()[i].y / 2, 9);
    }
  });

  it('refuses a view size that is not a positive finite number', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => touchLayout(bad, GAME_HEIGHT), `width ${bad}`).toThrow(/touchLayout/);
      expect(() => touchLayout(GAME_WIDTH, bad), `height ${bad}`).toThrow(/touchLayout/);
    }
  });
});

describe('cssScaleFor', () => {
  it('is the ratio FIT actually produces at the worst supported viewport', () => {
    // iPhone SE in landscape: 667x375 is wider than 16:9, so FIT is height-limited and the canvas
    // comes out 667 px wide. 667 / 1920 = 0.3474.
    expect(cssScaleFor(667, GAME_WIDTH)).toBeCloseTo(0.3474, 4);
  });

  it('is 1 at the design size', () => {
    expect(cssScaleFor(GAME_WIDTH, GAME_WIDTH)).toBe(1);
  });

  it('returns 0 for a canvas that is absent or collapsed', () => {
    // A 0 px canvas must read as "does not fit" rather than throwing or dividing by zero — the
    // rotate prompt is the safe answer to a geometry we do not understand.
    for (const bad of [0, -10, Number.NaN]) expect(cssScaleFor(bad, GAME_WIDTH)).toBe(0);
  });
});

describe('touchTargetsFit', () => {
  const at = (cssWidth: number) => touchTargetsFit(design(), cssScaleFor(cssWidth, GAME_WIDTH));

  it('accepts every viewport this phase supports', () => {
    // canvas CSS widths, from the plan's measured table
    expect(at(667), 'iPhone SE landscape').toBe(true);
    expect(at(693), 'iPhone 14 landscape').toBe(true);
    expect(at(732), 'Pixel 7 landscape').toBe(true);
    expect(at(852), 'the declared minimum viewport').toBe(true);
    expect(at(1024), 'iPad landscape').toBe(true);
    expect(at(768), 'iPad PORTRAIT — playable, and must not prompt').toBe(true);
    expect(at(1920), 'the design size').toBe(true);
  });

  it('rejects phone portrait, which is what puts the rotate prompt on screen', () => {
    expect(at(390), 'iPhone 14 portrait').toBe(false);
    expect(at(412), 'Pixel 7 portrait').toBe(false);
  });

  it('turns over exactly at the 44 CSS px floor', () => {
    const exact = TOUCH_MIN_CSS_PX / TOUCH_BOX_PX;
    expect(touchTargetsFit(design(), exact)).toBe(true);
    expect(touchTargetsFit(design(), exact * 0.999)).toBe(false);
  });

  it('rejects a gap under the 8 CSS px floor even when every box is large enough', () => {
    // 🔴 The size floor and the gap floor are separate claims. A layout of huge buttons jammed
    // together passes the first and fails the second, and a caller that checked only sizes would
    // ship exactly that.
    const jammed = design().map((t, i) => (i === 1 ? { ...t, x: design()[0].x + TOUCH_BOX_PX + 1 } : t));
    const scale = TOUCH_MIN_GAP_CSS_PX / 2; // 1 game px gap is well under 8 CSS px here
    expect(touchTargetsFit(jammed, scale)).toBe(false);
  });

  it('refuses to call an empty target list a passing layout', () => {
    // Otherwise "every target is big enough" is vacuously true with no controls at all, which is
    // precisely the deletion the whole gate exists to catch.
    expect(touchTargetsFit([], 1)).toBe(false);
  });
});

describe('touchTargetsDisjoint', () => {
  it('accepts the shipped layout', () => {
    expect(touchTargetsDisjoint(design())).toBe(true);
  });

  it('rejects any pair that overlaps', () => {
    const stacked = design().map((t, i) => (i === 1 ? { ...t, x: design()[0].x, y: design()[0].y } : t));
    expect(touchTargetsDisjoint(stacked)).toBe(false);
  });

  it('accepts targets that touch exactly, and rejects one pixel of overlap', () => {
    const [a] = design();
    const flush = [a, { ...a, id: 'right' as const, x: a.x + a.w }];
    const over = [a, { ...a, id: 'right' as const, x: a.x + a.w - 1 }];
    expect(touchTargetsDisjoint(flush)).toBe(true);
    expect(touchTargetsDisjoint(over)).toBe(false);
  });

  it('refuses to call an empty target list disjoint', () => {
    expect(touchTargetsDisjoint([])).toBe(false);
  });
});

describe('touchMenuLayout', () => {
  // 🔴 `LevelSelectScene`'s keyboard `ROW_HEIGHT` is 68 game px = 23.6 CSS px at 0.347, under half
  // the floor. This layout is what replaces it on a touch device; these are its two claims.
  const WORST_SCALE = 667 / GAME_WIDTH;
  const CATALOG_LEVELS = 5;

  it('gives every row a target that clears the floor at the worst in-scope viewport', () => {
    const rows = touchMenuLayout(CATALOG_LEVELS, GAME_WIDTH, GAME_HEIGHT);
    expect(rows).toHaveLength(CATALOG_LEVELS);
    expect(touchTargetsFit(rows, WORST_SCALE), 'a level row is too small or too close to hit').toBe(
      true,
    );
  });

  it('keeps the rows disjoint, which widening the keyboard rows in place could not', () => {
    expect(touchTargetsDisjoint(touchMenuLayout(CATALOG_LEVELS, GAME_WIDTH, GAME_HEIGHT))).toBe(true);
  });

  it('stays inside the band, leaving the heading above and the hint below', () => {
    const rows = touchMenuLayout(CATALOG_LEVELS, GAME_WIDTH, GAME_HEIGHT);
    for (const row of rows) {
      expect(row.y, `${row.id} runs over the heading`).toBeGreaterThanOrEqual(TOUCH_MENU_TOP_PX);
      expect(row.y + row.h, `${row.id} runs over the hint line`).toBeLessThanOrEqual(
        GAME_HEIGHT - TOUCH_MENU_BOTTOM_PX,
      );
    }
  });

  it('shrinks the rows to fit a longer catalog rather than overflowing the band', () => {
    // The honest failure direction: a twelve-level catalog gets rows that FIT the screen and are
    // then correctly reported too small, rather than rows drawn off the bottom of it.
    const many = touchMenuLayout(12, GAME_WIDTH, GAME_HEIGHT);
    expect(many).toHaveLength(12);
    expect(many.at(-1)!.y + many.at(-1)!.h).toBeLessThanOrEqual(GAME_HEIGHT - TOUCH_MENU_BOTTOM_PX);
    expect(touchTargetsDisjoint(many)).toBe(true);
  });

  it('scales off the view instead of the design size', () => {
    const half = touchMenuLayout(CATALOG_LEVELS, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    const full = touchMenuLayout(CATALOG_LEVELS, GAME_WIDTH, GAME_HEIGHT);
    expect(half[0].h * 2).toBeCloseTo(full[0].h, 6);
    expect(half[0].y * 2).toBeCloseTo(full[0].y, 6);
  });

  it('returns nothing for a catalog with no levels, rather than one row of NaN', () => {
    expect(touchMenuLayout(0, GAME_WIDTH, GAME_HEIGHT)).toEqual([]);
    expect(touchMenuLayout(-1, GAME_WIDTH, GAME_HEIGHT)).toEqual([]);
  });
});
