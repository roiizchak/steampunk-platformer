/**
 * The pit hurts on the exact tick the feet cross **its** rectangle — nothing else's.
 *
 * ## Why this is a sim test and not an e2e one
 *
 * Codex plan review round 2, finding 8. The claim under test is *"damage fires on the tick the feet
 * cross the pit rect"*, and `window.__game` cannot express it: the surface is closed at eight
 * aggregate fields by a Phase 1 ruling (`src/debug/globals.ts`) and carries no `TickEvents`, no
 * previous position and no hazard identity — widening it is a STOP-and-ask. `GameScene` publishes
 * only the final world state after a whole batch of ticks, and `advanceSplit()` ORs its events
 * together, so a hp drop observed from a browser cannot name the tick that produced it or the
 * rectangle that did. E2E is left the arc it can actually see: fall → damage → death → respawn.
 *
 * ## Why "hp went down" is not the assertion
 *
 * Codex plan review round 1, finding 7, against the earlier level-02 target: a scavenger patrols
 * near the pit, and `applyWorldDamage()` collapses every source into `{ hurt, died }`. A test that
 * only watched hp would stay green after the spikes were deleted, killed instead by an enemy. So
 * enemies are off, and attribution is asserted **three** ways, of which the third is the real one:
 *
 * 1. the hurt tick's own swept segment crosses the pit rect;
 * 2. no earlier tick's segment crossed **any** hazard, so nothing else got there first;
 * 3. 🔴 removing that one rectangle from the world — and changing nothing else — makes the identical
 *    drive finish unharmed. That is the counterfactual, and it is the only form of this claim that a
 *    fall, a wall, a kill plane or a second hazard cannot satisfy by accident.
 *
 * ## ⚠️ What this file does NOT gate, measured rather than assumed
 *
 * **The sweep.** `applyWorldDamage` sweeps the player origin from last tick's position to this
 * one's so a 40 px spike strip crossed at `maxFallSpeed` cannot be tunnelled — and replacing that
 * with a bare point test at the tick's end position leaves every assertion below **green**. Measured,
 * not guessed: the mutation was applied and this file stayed 6/6. The player comes to rest inside
 * this particular pit's band, so the pit cannot distinguish the two. The tunnelling property has its
 * own discriminating gate in `tests/unit/hazards.test.ts`, with the non-vacuity pair beside it;
 * this file must not be read as a second proof of it.
 *
 * ## Nothing here is typed twice
 *
 * The pit's columns are not written down. `detectPits` finds them from the level's own collision
 * rectangles — the same function `levelBuilder.mjs` derives the spikes with and
 * `level-pits.test.ts` checks the shipped bytes with *(vault 5.3)* — and the hazard is then matched
 * to it. Fill the pit in and this test does not silently pass against a level with no pit: it fails
 * at `PIT`, saying so.
 */

import { describe, expect, it } from 'vitest';

import { RENDER_SCALE } from '../../src/game/constants';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { HAZARD_DAMAGE, hazardHit } from '../../src/sim/hazards';
import { createSnapshot } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, Rect, World } from '../../src/sim/types';
import { columnProfile, detectPits } from '../../tools/gen/pitDetect.mjs';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const LEVEL_ID = 'level-03';

const LEVEL: LevelData = parseLevel(
  LEVEL_ID,
  JSON.parse(SHIPPED_ENTRIES.find(([id]) => id === LEVEL_ID)![1]) as unknown,
);

/** The walking surface, measured from the spawn rather than assumed. See `level-pits.test.ts`. */
const GROUND_TOP_ROW = LEVEL.spawn.y / LEVEL.tileHeight;

/**
 * The one pit left in the game, found rather than typed.
 *
 * The other four were **filled in** by owner decision this session: all four sat exactly where a
 * descent lands, and `level-hazard-free.test.ts` records why that is unsurvivable — the avoidance
 * policy only reacts while grounded, so a hazard under a landing is unavoidable at any width.
 */
const PITS = detectPits(
  columnProfile(LEVEL.solids, LEVEL.widthTiles, LEVEL.tileWidth, GROUND_TOP_ROW),
  GROUND_TOP_ROW,
);

const PIT = PITS[0];

/** The hazard rectangle sitting in that pit — matched to the pit, never written down. */
function pitHazard(): Rect {
  const left = PIT.fromCol * LEVEL.tileWidth;
  const right = (PIT.toCol + 1) * LEVEL.tileWidth;
  const found = LEVEL.hazards.find((h) => h.x < right && h.x + h.w > left);
  expect(found, `${LEVEL_ID} has a pit at cols ${PIT.fromCol}-${PIT.toCol} with no hazard in it`)
    .toBeDefined();
  return found!;
}

/** One tick of the drive: where the feet were, where they went, and what the sim said about it. */
interface Step {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hurt: boolean;
  died: boolean;
  hp: number;
}

/**
 * Walk right off the ledge into the pit, recording every tick's swept segment.
 *
 * `hazards` is a parameter so the counterfactual run differs from the real one in **exactly** one
 * rectangle — same level, same geometry, same start, same input, same tick count.
 */
function driveIntoPit(hazards: readonly Rect[]): Step[] {
  const world: World = createWorld({
    seed: 1,
    scale: RENDER_SCALE,
    solids: LEVEL.solids,
    hazards: [...hazards],
    bounds: { widthPx: LEVEL.widthPx, heightPx: LEVEL.heightPx },
    // Two columns left of the pit's left wall, on top of it — a plain walk off the edge, which is
    // how a player meets this pit. `y` is the surface the wall's own top presents.
    spawn: { x: (PIT.fromCol - 3) * LEVEL.tileWidth, y: LEVEL.spawn.y },
    // 🔴 Enemies OFF. Round 1 finding 7: `applyWorldDamage` collapses every source into
    // `{ hurt, died }`, so a scavenger landing a hit would keep this green with no spikes at all.
    enemies: undefined,
  });

  const input: InputSnapshot = createSnapshot();
  input.right = true;

  const steps: Step[] = [];
  for (let i = 0; i < 240; i += 1) {
    const fromX = world.player.x;
    const fromY = world.player.y;
    const events = tick(world, input);
    steps.push({
      fromX,
      fromY,
      toX: world.player.x,
      toY: world.player.y,
      hurt: events.playerHurt,
      died: events.playerDied,
      hp: world.player.hp,
    });
    if (events.playerHurt || events.playerDied) break;
  }
  return steps;
}

describe(`${LEVEL_ID}'s pit damages on the tick the feet cross its rectangle`, () => {
  it('still has exactly one pit — this whole file is about that pit', () => {
    expect(
      PITS.map((p) => `${p.fromCol}-${p.toCol}`),
      'the pit set changed; retarget this test or delete it, but do not let it pass vacuously',
    ).toEqual(['65-69']);
  });

  it('the pit carries a hazard, and it is the one this test attributes damage to', () => {
    const hazard = pitHazard();
    expect(hazard.y + hazard.h, 'the spikes sit on the row the feet pass through').toBe(
      GROUND_TOP_ROW * LEVEL.tileHeight,
    );
  });

  it('hurts, and the swept segment of THAT tick crosses THAT rectangle', () => {
    const steps = driveIntoPit(LEVEL.hazards);
    const last = steps[steps.length - 1]!;

    expect(last.hurt || last.died, 'the player walked off the ledge and was never damaged').toBe(
      true,
    );

    // The claim, stated as the sim states it: `applyWorldDamage` sweeps the player's ORIGIN from
    // last tick's position to this one's, which is why a 40 px spike strip crossed at 51.6 px/tick
    // cannot be tunnelled. Assert the same segment against the pit rect ALONE.
    expect(
      hazardHit(last.fromX, last.fromY, last.toX, last.toY, [pitHazard()]),
      'the damaging tick swept somewhere other than the pit rect',
    ).not.toBeNull();
  });

  it('and no earlier tick touched any hazard at all, so nothing else got there first', () => {
    const steps = driveIntoPit(LEVEL.hazards);
    const earlier = steps.slice(0, -1);
    const touched = earlier.filter(
      (s) => hazardHit(s.fromX, s.fromY, s.toX, s.toY, LEVEL.hazards) !== null,
    );
    expect(touched.length, 'a hazard was crossed before the tick the sim reported damage on').toBe(
      0,
    );
    expect(
      earlier.some((s) => s.hurt || s.died),
      'damage fired on a tick with no hazard crossing under it',
    ).toBe(false);
  });

  it('costs exactly one hazard contact, not a hit per tick spent in the spikes', () => {
    const steps = driveIntoPit(LEVEL.hazards);
    const last = steps[steps.length - 1]!;
    expect(last.hp).toBe(100 - HAZARD_DAMAGE);
  });

  /**
   * 🔴 The counterfactual, and the only assertion here a fall could not fake.
   *
   * Everything above is consistent with a world where the damage came from the drop itself, the kill
   * plane, or the second hazard 40 columns west. Take that ONE rectangle out and change nothing
   * else: if the drive still hurts, this file has been measuring the wrong thing all along.
   */
  it('and takes nothing at all once that one rectangle is removed', () => {
    const hazard = pitHazard();
    const without = LEVEL.hazards.filter((h) => h !== hazard);
    expect(without.length, 'the filter removed nothing — object identity is not holding').toBe(
      LEVEL.hazards.length - 1,
    );

    const steps = driveIntoPit(without);
    expect(
      steps.some((s) => s.hurt || s.died),
      'the player was damaged falling into a pit whose spikes had been removed, so the damage this ' +
        'file attributes to the pit does not actually come from it',
    ).toBe(false);
  });
});
