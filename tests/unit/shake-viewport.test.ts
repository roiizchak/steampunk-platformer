import { describe, expect, it } from 'vitest';
import { SHAKE, shakeOffset, shakeSafeMargin } from '../../src/render/screenShake';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { build } from './effects-fixtures';

/**
 * # The shake cannot uncover the page background (inventory 2b.7)
 *
 * `applyShake` moves the camera with `setPosition`, which moves the **viewport rectangle on the
 * canvas** rather than the world scroll. A viewport exactly the size of the screen therefore
 * uncovers a strip of raw page background at whichever edge the shake moves it away from —
 * measured at the design size, up to **9.6 px** horizontally (`lethal.ax` 0.005 × 1920) and 7.6 px
 * vertically (`playerHurt.ay` 0.007 × 1080). Small, and unmissable once seen: a bright seam that
 * appears only on impact.
 *
 * **The mutation this names:** drop the `setSize` call from `attachEffects`, restoring a viewport
 * exactly the size of the screen.
 */
describe('the shaken viewport always covers the screen (2b.7)', () => {
  it('the margin is derived from the SHAKE table, not authored', () => {
    // A hardcoded margin is silently wrong the first time someone tunes `ax`. Asserted against the
    // table's own maxima rather than against the literals it produces today.
    const peakAx = Math.max(...Object.values(SHAKE).map((c) => c.ax));
    const peakAy = Math.max(...Object.values(SHAKE).map((c) => c.ay));
    const margin = shakeSafeMargin(GAME_WIDTH, GAME_HEIGHT);
    expect(margin.x).toBe(Math.ceil(peakAx * GAME_WIDTH));
    expect(margin.y).toBe(Math.ceil(peakAy * GAME_HEIGHT));
  });

  it('the margin covers EVERY shake in the table, at its worst tick', () => {
    // The property that matters, swept rather than reasoned: no command, at any tick, may move the
    // camera further than the slack it has.
    const margin = shakeSafeMargin(GAME_WIDTH, GAME_HEIGHT);
    let worstX = 0;
    let worstY = 0;
    for (const cmd of Object.values(SHAKE)) {
      for (let tick = 0; tick < 240; tick += 1) {
        const { x, y } = shakeOffset(cmd, tick, GAME_WIDTH, GAME_HEIGHT);
        worstX = Math.max(worstX, Math.abs(x));
        worstY = Math.max(worstY, Math.abs(y));
      }
    }
    expect(worstX, `a shake reaches ${worstX}px against ${margin.x}px of slack`).toBeLessThanOrEqual(
      margin.x,
    );
    expect(worstY, `a shake reaches ${worstY}px against ${margin.y}px of slack`).toBeLessThanOrEqual(
      margin.y,
    );
  });

  it('the margin is not vacuously huge — it is the tightest that works', () => {
    // The counter-fixture. `{ x: 9999, y: 9999 }` satisfies every assertion above and makes the
    // camera render a screen-and-a-half of world for nothing.
    const margin = shakeSafeMargin(GAME_WIDTH, GAME_HEIGHT);
    expect(margin.x).toBeLessThan(GAME_WIDTH * 0.02);
    expect(margin.y).toBeLessThan(GAME_HEIGHT * 0.02);
    expect(margin.x).toBeGreaterThan(0);
    expect(margin.y).toBeGreaterThan(0);
  });

  it('attachEffects GROWS the viewport and offsets it — not just one or the other', () => {
    // Growing without offsetting leaves the seam on the right and bottom instead of the left and
    // top; offsetting without growing is the defect itself. Both, or neither works.
    const { camera } = build();
    const margin = shakeSafeMargin(GAME_WIDTH, GAME_HEIGHT);
    expect(camera.width, 'the viewport was not grown — a shake will uncover an edge').toBe(
      GAME_WIDTH + margin.x * 2,
    );
    expect(camera.height).toBe(GAME_HEIGHT + margin.y * 2);
    expect([camera.x, camera.y], 'the viewport was grown but not re-centred').toEqual([
      -margin.x,
      -margin.y,
    ]);
  });

  it('and the covered rectangle contains the whole screen at every shake tick', () => {
    // The end-to-end property, stated as the thing a player would notice: for every command and
    // every tick, the viewport's edges stay outside the screen's edges.
    const margin = shakeSafeMargin(GAME_WIDTH, GAME_HEIGHT);
    const w = GAME_WIDTH + margin.x * 2;
    const h = GAME_HEIGHT + margin.y * 2;
    for (const cmd of Object.values(SHAKE)) {
      for (let tick = 0; tick < 120; tick += 1) {
        const { x, y } = shakeOffset(cmd, tick, GAME_WIDTH, GAME_HEIGHT);
        const left = -margin.x + x;
        const top = -margin.y + y;
        expect(left, `left edge exposed at tick ${tick}`).toBeLessThanOrEqual(0);
        expect(top, `top edge exposed at tick ${tick}`).toBeLessThanOrEqual(0);
        expect(left + w, `right edge exposed at tick ${tick}`).toBeGreaterThanOrEqual(GAME_WIDTH);
        expect(top + h, `bottom edge exposed at tick ${tick}`).toBeGreaterThanOrEqual(GAME_HEIGHT);
      }
    }
  });
});
