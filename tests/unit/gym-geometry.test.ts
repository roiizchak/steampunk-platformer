import { describe, expect, it } from 'vitest';
import { computeGymGeometry } from '../../src/render/gymGeometry';

/**
 * `computeGymGeometry` — the Gym's screen-space zoom clamp, cell placement, footprint and
 * collision rects, split out of `GymScene.refresh` (HANDOFF §4 step 6a / W7).
 */

const BASE = {
  frameWidth: 288,
  frameHeight: 384,
  zooms: [1, 2, 4] as const,
  zoomStep: 0,
  groundY: 880,
  centreX: 1250,
  offsetPx: 0,
  bounds: null,
  collisionW: 132,
  collisionH: 288,
};

describe('computeGymGeometry', () => {
  it('uses the asked zoom when the cell fits above the ground line', () => {
    // 384 * 2 = 768 <= 880: fits.
    expect(computeGymGeometry({ ...BASE, zoomStep: 1 }).zoom).toBe(2);
  });

  it('clamps to the largest zoom that fits, rather than cutting the head off', () => {
    // 384 * 4 = 1536 > 880: does not fit; clamp to the largest that does (2).
    expect(computeGymGeometry({ ...BASE, zoomStep: 2 }).zoom).toBe(2);
  });

  it('places the cell centred on centreX and its floor on groundY, offset applied', () => {
    const g = computeGymGeometry({ ...BASE, zoomStep: 0, offsetPx: 5 });
    expect(g.zoom).toBe(1);
    expect(g.cellLeft).toBe(1250 - 288 / 2);
    // cellTop = groundY - frameHeight*zoom - offsetPx*zoom
    expect(g.cellTop).toBe(880 - 384 - 5);
  });

  it('returns a null screenRect when bounds are INDETERMINATE', () => {
    expect(computeGymGeometry({ ...BASE, bounds: null }).screenRect).toBeNull();
  });

  it('maps bounds into screen space at the given zoom', () => {
    const g = computeGymGeometry({
      ...BASE,
      zoomStep: 0,
      bounds: { minX: 10, minY: 20, maxX: 19, maxY: 39 },
    });
    // rect = { x: 10, y: 20, w: 10, h: 20 }; cellLeft = 1250-144 = 1106, cellTop = 880-384 = 496.
    expect(g.screenRect).toEqual([1106 + 10, 496 + 20, 10, 20]);
  });

  it('centres the collision box on centreX with its floor on groundY', () => {
    const g = computeGymGeometry(BASE);
    const [x, y, w, h] = g.boxRect;
    expect(w).toBe(132);
    expect(h).toBe(288);
    expect(x).toBe(1250 - 132 / 2);
    expect(y).toBe(880 - 288);
  });

  it('scales the collision box with zoom', () => {
    const g = computeGymGeometry({ ...BASE, zoomStep: 1 });
    expect(g.boxRect[2]).toBe(132 * 2);
    expect(g.boxRect[3]).toBe(288 * 2);
  });
});
