import { describe, expect, it } from 'vitest';

import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { createSnapshot } from '../../src/sim/input';
import { MIN_STALL_TICKS, createStallDetector } from '../../src/sim/stallAnalysis';
import { advance, createWorld } from '../../src/sim/tick';
import { observeTicks } from '../../src/sim/trace';
import type { StallIncident } from '../../src/sim/stallAnalysis';
import type { InputSnapshot } from '../../src/sim/types';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

/**
 * # The detector must catch the pins we can already prove, or it cannot be believed when it is quiet
 *
 * This is the gate that lets the live probe be trusted. Two flush-seam pins were located by a static
 * sweep of the shipped `.tmj` files and confirmed by hand-simulating `resolveCollisions`: level-02 at
 * feet `(8190, 1632)` and level-03 at `(10686, 1536)`. Both are invisible — the blocking rectangle's
 * top is flush with the floor being stood on, inside a visually continuous platform.
 *
 * If the detector cannot name those two, its silence anywhere else means nothing. And if it fires on
 * open ground, its noise means nothing either. Both directions are asserted, with bounded
 * coordinates rather than "a clean stretch".
 */

const LEVELS = new Map<string, LevelData>(
  SHIPPED_ENTRIES.map(([id, raw]) => [id, parseLevel(id, JSON.parse(raw) as unknown)]),
);

function level(id: string): LevelData {
  const found = LEVELS.get(id);
  if (!found) throw new Error(`fixture ${id} missing`);
  return found;
}

function heldRight(): InputSnapshot {
  const input = createSnapshot();
  input.right = true;
  return input;
}

/** Stand the player on a known surface and hold right, collecting whatever the detector reports. */
function walkFrom(id: string, x: number, y: number, ticks: number): StallIncident[] {
  const data = level(id);
  const world = createWorld({
    seed: 1,
    scale: 6,
    solids: data.solids,
    bounds: { widthPx: data.widthPx, heightPx: data.heightPx },
    spawn: { x, y },
  });
  const detector = createStallDetector();
  const hits: StallIncident[] = [];
  const dispose = observeTicks(world, (trace) => {
    const hit = detector.observe(trace);
    if (hit !== null) hits.push(hit);
  });
  try {
    for (let i = 0; i < ticks; i += 1) {
      advance(world, heldRight(), 1);
    }
  } finally {
    dispose();
  }
  return hits;
}

describe('the detector fires on the two pins we can prove', () => {
  it('level-02: the flush seam at feet x=8190 on the y=1632 floor', () => {
    const hits = walkFrom('level-02', 8100, 1632, 200);

    expect(hits.length, 'the known level-02 seam pin was not detected').toBeGreaterThan(0);
    const hit = hits[0]!;
    expect(hit.x).toBeCloseTo(8190, 1);
    expect(hit.y).toBeCloseTo(1632, 1);
    expect(hit.cause).toBe('geometry');
    expect(hit.dir).toBe(1);
    expect(hit.ticks).toBeGreaterThanOrEqual(MIN_STALL_TICKS);
  });

  it('level-03: the flush seam at feet x=10686 on the y=1536 floor', () => {
    const hits = walkFrom('level-03', 10600, 1536, 200);

    expect(hits.length, 'the known level-03 seam pin was not detected').toBeGreaterThan(0);
    const hit = hits[0]!;
    expect(hit.x).toBeCloseTo(10686, 1);
    expect(hit.y).toBeCloseTo(1536, 1);
    expect(hit.cause).toBe('geometry');
  });
});

describe('the detector stays quiet where there is nothing to report', () => {
  /**
   * Bounded on purpose. "A clean stretch of level-01" is not a test — it cannot be re-run by anyone
   * who did not write it, and it cannot be shown to have covered anything.
   */
  it('level-01: x=1000 to x=2400 on the y=1920 floor produces no incident', () => {
    const hits = walkFrom('level-01', 1000, 1920, 200);
    expect(hits, `unexpected incident: ${JSON.stringify(hits)}`).toEqual([]);
  });

  it('a player who is not asking to move is not stalled', () => {
    const data = level('level-01');
    const world = createWorld({
      seed: 1,
      scale: 6,
      solids: data.solids,
      bounds: { widthPx: data.widthPx, heightPx: data.heightPx },
      spawn: { x: 1000, y: 1920 },
    });
    const detector = createStallDetector();
    const hits: StallIncident[] = [];
    const dispose = observeTicks(world, (t) => {
      const hit = detector.observe(t);
      if (hit !== null) hits.push(hit);
    });
    // Standing still for four times the threshold. Holding no key is not evidence of anything.
    for (let i = 0; i < MIN_STALL_TICKS * 4; i += 1) advance(world, createSnapshot(), 1);
    dispose();

    expect(hits).toEqual([]);
  });
});
