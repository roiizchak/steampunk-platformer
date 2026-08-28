import { describe, expect, it } from 'vitest';

import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { createSnapshot } from '../../src/sim/input';
import { createStallDetector } from '../../src/sim/stallAnalysis';
import { advance, createWorld } from '../../src/sim/tick';
import { observeTicks } from '../../src/sim/trace';
import type { InputSnapshot } from '../../src/sim/types';
import { mergeStrips } from '../../tools/gen/mergeStrips.mjs';
import type { Strip } from '../../tools/gen/mergeStrips.d.mts';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

/**
 * # No two solids may share a top edge and touch
 *
 * ## The defect
 *
 * Two collision rectangles with the same top edge that abut exactly draw as one continuous platform
 * and collide as two. Walking across the join, the player is snapped back and `vx` zeroed **every
 * tick, permanently** — because while grounded the body sits `0.675 px` inside its own floor when the
 * horizontal pass runs, and `wasLeft`'s comparison is closed. The player stops dead on open floor in
 * the `idle` pose and only a jump gets them past.
 *
 * Reported "FOUR times" — the owner's own words at the time of what was in fact the fifth report.
 * Either count is defensible; what matters is that three fixes shipped and none of them was it.
 * Fixes shipped against other mechanisms before this one was
 * seen on screen, at level-02 feet `(8190, 1632)` and level-03 `(10686, 1536)` — coordinates read
 * off the pin probe, not inferred.
 *
 * ## Why it appeared
 *
 * A previous session widened two platforms to sit flush against their spike runs, so the player had
 * somewhere to stand instead of being pinned in the spikes. That fix was correct and is kept. It
 * also made those platforms touch their neighbours exactly, creating the first flush seams in any
 * shipped level — `main` had zero. `mergeStrips.mjs` now merges them at build time.
 *
 * ## Why this file is not redundant with the builder
 *
 * ⚠️ The builder merges only strips that share a top edge **and** a height. A same-top pair with
 * different heights cannot be fused without inventing collision, so the builder leaves it — and this
 * gate fails the suite instead of letting it ship. Hand-authored geometry and future generators are
 * covered too, because this reads the **shipped bytes**, not the builder's intent.
 *
 * **Do not delete this because "the builder handles it now."** The builder handling it is exactly
 * what this proves, and the resolver latch underneath is still live.
 */

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

describe('shipped level geometry has no flush seam', () => {
  it('the fixture set is not empty — this sweep is not vacuous', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(5);
    expect(LEVELS.every(([, l]) => l.solids.length > 0)).toBe(true);
  });

  it.each(LEVELS)('%s: no two solids share a top edge and touch', (id, level) => {
    const seams: string[] = [];
    for (const a of level.solids) {
      for (const b of level.solids) {
        if (a === b || a.y !== b.y) continue;
        if (a.x + a.w === b.x) {
          seams.push(`x=${b.x} topY=${a.y} (${a.x},${a.y},${a.w},${a.h} | ${b.x},${b.y},${b.w},${b.h})`);
        }
      }
    }
    expect(
      seams,
      `${id} has a flush collision seam. It draws as one platform and pins the player permanently. ` +
        `Merge the rects (see tools/gen/mergeStrips.mjs) — do not delete this assertion.`,
    ).toEqual([]);
  });
});

/**
 * The behavioural half. The geometry rule above is the cheap check; this one proves the thing the
 * owner actually experiences is gone, by walking the real sim across both confirmed coordinates.
 */
describe('the two confirmed pin sites are walkable', () => {
  function heldRight(): InputSnapshot {
    const input = createSnapshot();
    input.right = true;
    return input;
  }

  /**
   * ⚠️ The window is bounded to the seam, not "walk as far as you can".
   *
   * The first version ran 200 ticks and went red at level-02 `(8862, 1632)` — which is the NEXT
   * obstacle, a 288 px step-up the player is supposed to jump. Walking past the thing under test
   * into authored geometry turns a fix into a false red. 60 ticks is ~520 px: comfortably past the
   * former seam and comfortably short of that wall.
   */
  const SITES: [string, number, number][] = [
    ['level-02', 8100, 1632],
    ['level-03', 10600, 1536],
  ];

  it.each(SITES)('%s: walking right from x=%d covers ground and reports no stall', (id, x, y) => {
    const level = LEVELS.find(([lid]) => lid === id)?.[1];
    expect(level, `${id} fixture missing`).toBeDefined();
    const world = createWorld({
      seed: 1,
      scale: 6,
      solids: level!.solids,
      bounds: { widthPx: level!.widthPx, heightPx: level!.heightPx },
      spawn: { x, y },
    });
    const detector = createStallDetector();
    const stalls: string[] = [];
    const dispose = observeTicks(world, (t) => {
      const hit = detector.observe(t);
      if (hit !== null) stalls.push(`${hit.cause} at (${hit.x}, ${hit.y})`);
    });
    try {
      for (let i = 0; i < 60; i += 1) advance(world, heldRight(), 1);
    } finally {
      dispose();
    }

    expect(stalls, `${id} still pins the player`).toEqual([]);
    // 60 ticks at runMax 9 is ~520 px, and the former seam sat 156 px ahead of the start. Anything
    // near zero means still pinned.
    expect(world.player.x - x).toBeGreaterThan(400);
  });
});

/**
 * The merger's own invariants — the ones the shipped data happens to satisfy, asserted so they stop
 * being a happy accident.
 *
 * 🔴 The Codex implementation review found the code weaker than its own docstring: the first
 * version merged only when `out[i]` was geometrically LEFT of `out[j]`, so a right-hand strip
 * appearing EARLIER in the array was the one deleted, and the survivor's index depended on
 * geometry rather than order. Safe on shipped data purely because strip 0 begins at `x=0` and
 * nothing of positive width can abut it from the left — an accident that stops holding the day
 * someone authors a level differently. `phase-03-element-editor.spec.ts` asserts `spawnStrip === 0`.
 */
describe('mergeStrips keeps the lower-indexed strip, whatever order it is given', () => {
  const LEFT: Strip = { x: 0, y: 10, w: 100, h: 20 };
  const RIGHT: Strip = { x: 100, y: 10, w: 50, h: 20 };
  const UNRELATED: Strip = { x: 9, y: 99, w: 1, h: 1 };

  it('produces the same merged strip at index 0 from either input order', () => {
    const forward = mergeStrips([LEFT, UNRELATED, RIGHT]);
    const reversed = mergeStrips([RIGHT, UNRELATED, LEFT]);
    expect(forward[0]).toEqual({ x: 0, y: 10, w: 150, h: 20 });
    expect(reversed[0], 'the survivor moved when the input was permuted').toEqual(forward[0]);
    expect(reversed).toEqual(forward);
  });

  it('does not mutate the array it was given, or the objects in it', () => {
    const input: Strip[] = [{ ...LEFT }, { ...RIGHT }];
    const snapshot = JSON.stringify(input);
    mergeStrips(input);
    expect(JSON.stringify(input), 'mergeStrips wrote through to its caller').toBe(snapshot);
  });

  it('leaves a same-top DIFFERENT-height pair alone — fusing it would invent collision', () => {
    const tall: Strip = { x: 100, y: 10, w: 50, h: 400 };
    expect(mergeStrips([LEFT, tall])).toHaveLength(2);
  });

  it('leaves a gap and an overlap alone', () => {
    expect(mergeStrips([LEFT, { x: 101, y: 10, w: 50, h: 20 }])).toHaveLength(2);
    expect(mergeStrips([LEFT, { x: 99, y: 10, w: 50, h: 20 }])).toHaveLength(2);
  });
});
