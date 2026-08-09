/**
 * Hazards, the kill plane and the world's edges — criterion 5.15.
 *
 * **This whole file exists because of Codex plan review C6.** The plan said hazards and the kill
 * plane would sit in step 4 at "one tick of latency, which is acceptable", and Codex pointed out
 * three things: nothing in the QA gate tested hazard or kill-plane timing at all, the plan
 * contradicted itself about which step the boundary clamp lives in, and — the real one — **a thin
 * hazard can be tunnelled entirely between two per-tick samples.**
 *
 * At `maxFallSpeed` 51.6 px/tick a spike strip 40 px tall can be jumped clean over by a falling
 * player without a single tick sampling inside it. A point test would report "no contact" and be
 * wrong. So contact is a SWEPT test: the segment from last tick's feet to this tick's, against the
 * rectangle. Phase 2 already recorded this failure class (`docs/qa/phase-02-player.md:349`).
 *
 * The paired non-vacuity check matters as much as the tunnelling one: a swept test that returns
 * `true` for everything also passes the tunnelling case.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_TUNING } from '../../src/sim/player';
import { belowKillPlane, clampToBounds, segmentHitsRect } from '../../src/sim/hazards';
import type { Rect } from '../../src/sim/types';

/** A spike strip thinner than one tick of travel at terminal velocity. */
const THIN: Rect = { x: 0, y: 1000, w: 400, h: 40 };

describe('segmentHitsRect — the tunnelling case', () => {
  it('catches a hazard crossed entirely between two ticks', () => {
    // Above it on one tick, below it on the next. No tick ever samples inside.
    const fromY = 990;
    const toY = fromY + DEFAULT_TUNING.maxFallSpeed; // 1041.6 — past the far edge at 1040
    expect(toY).toBeGreaterThan(THIN.y + THIN.h);
    expect(fromY).toBeLessThan(THIN.y);

    expect(segmentHitsRect(200, fromY, 200, toY, THIN)).toBe(true);
  });

  it('a point test at either endpoint would have missed it — the defect, pinned', () => {
    const fromY = 990;
    const toY = fromY + DEFAULT_TUNING.maxFallSpeed;
    const inside = (y: number) => y >= THIN.y && y <= THIN.y + THIN.h;
    expect(inside(fromY)).toBe(false);
    expect(inside(toY)).toBe(false);
  });

  /**
   * **Non-vacuity.** A swept test that says `true` for everything also passes the case above, so
   * the misses are asserted just as hard as the hits.
   */
  it('does not fire for a path that stays clear of the hazard', () => {
    expect(segmentHitsRect(200, 800, 200, 900, THIN)).toBe(false); // stops short
    expect(segmentHitsRect(200, 1100, 200, 1200, THIN)).toBe(false); // starts past it
    expect(segmentHitsRect(900, 990, 900, 1100, THIN)).toBe(false); // right x, wrong column
  });

  it('fires when the feet come to rest inside the hazard', () => {
    expect(segmentHitsRect(200, 990, 200, 1020, THIN)).toBe(true);
  });

  it('fires on a purely horizontal walk into the hazard', () => {
    expect(segmentHitsRect(-50, 1020, 50, 1020, THIN)).toBe(true);
  });

  it('fires when the player is already standing in it and does not move', () => {
    expect(segmentHitsRect(200, 1020, 200, 1020, THIN)).toBe(true);
  });
});

describe('belowKillPlane', () => {
  const bounds = { widthPx: 8640, heightPx: 2112 };

  it('fires the tick the feet pass the world floor, not a tick later', () => {
    expect(belowKillPlane(bounds.heightPx - 1, bounds)).toBe(false);
    expect(belowKillPlane(bounds.heightPx, bounds)).toBe(false);
    expect(belowKillPlane(bounds.heightPx + 1, bounds)).toBe(true);
  });

  it('is false anywhere inside the world, including the very top', () => {
    expect(belowKillPlane(0, bounds)).toBe(false);
    expect(belowKillPlane(-500, bounds)).toBe(false);
  });
});

describe('clampToBounds — the three edges that are collision, not death', () => {
  const bounds = { widthPx: 8640, heightPx: 2112 };
  const halfWidth = 66; // PLAYER_BOX.w / 2 * RENDER_SCALE at scale 6

  it('stops the player at the left edge instead of letting them integrate forever', () => {
    const p = { x: -200, y: 500, vx: -12 };
    clampToBounds(p, bounds, halfWidth);
    expect(p.x).toBe(halfWidth);
    // Velocity is killed too. Leaving it negative means the player presses left and stays pinned
    // with a live velocity that fights every other force — and it re-triggers the clamp every tick.
    expect(p.vx).toBe(0);
  });

  it('stops the player at the right edge', () => {
    const p = { x: bounds.widthPx + 200, y: 500, vx: 12 };
    clampToBounds(p, bounds, halfWidth);
    expect(p.x).toBe(bounds.widthPx - halfWidth);
    expect(p.vx).toBe(0);
  });

  it('leaves a player inside the world completely alone', () => {
    const p = { x: 4000, y: 500, vx: 7 };
    clampToBounds(p, bounds, halfWidth);
    expect(p.x).toBe(4000);
    expect(p.vx).toBe(7);
  });

  /**
   * The bottom is NOT clamped — it is the kill plane. Clamping all four edges was considered and
   * rejected: a pit you cannot fall into is not a platformer.
   */
  it('does not clamp the bottom — falling out is a death, not a wall', () => {
    const p = { x: 4000, y: bounds.heightPx + 500, vx: 0 };
    clampToBounds(p, bounds, halfWidth);
    expect(p.y).toBe(bounds.heightPx + 500);
  });
});
