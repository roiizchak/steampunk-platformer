/**
 * Every pit in every shipped level has spikes in it.
 *
 * ## The defect
 *
 * The owner played the production build and reported that in levels 2, 3 and 4 *"there is a place
 * where the character can fall through tiles"* and nothing happens. Both halves of that are true and
 * they are not the same bug.
 *
 * A **bottomless gap** already kills: `belowKillPlane` (`src/sim/hazards.ts:59`) fires the tick the
 * feet pass `heightPx`. A **pit** — a run of ground walled in by raised masses on both sides — has a
 * bottom, so you land on it, take nothing, and climb out. Five ship. **Four had no spikes.** The
 * fifth, level-03 cols 65-69, did: hand-typed, which is what makes the other four an omission rather
 * than a design.
 *
 * ## Why the rule is computed and not four more list entries
 *
 * Spikes were a per-level hand-written array and **nothing in the suite ever compared that array to
 * the geometry it was supposed to cover**. `level-hazards.test.ts` is existential — at least one
 * hazard per level must hurt a walking player — and says nothing about the pit on the other side of
 * the map. `level-completable.test.ts`'s auto-player tanks damage and finishes anyway.
 * `level-reach.test.ts` ignores hazards outright. So four unspiked pits shipped with a green suite,
 * and a fifth authored tomorrow would ship the same way.
 *
 * `tools/gen/pitDetect.mjs` owns the rule; `levelBuilder.mjs` derives the spikes from it and this
 * file checks the **shipped bytes** against the same function *(vault 3.1, vault 5.3)*.
 *
 * ## 🔴 Why the shipped levels cannot be this gate's only fixtures
 *
 * Codex plan review round 2, finding 6, and it is the sharpest thing either round found: **a far
 * broader detector returns the same five pits.** Drop the minimum width, drop the two-tile wall
 * depth, drop the map-edge exclusion, drop the bottomless-neighbour exclusion — the shipped maps
 * contain no case that separates any of those from the real rule, so a gate resting on them alone
 * would happily accept an implementation that had quietly lost every narrowing clause.
 *
 * So `tests/fixtures/pit-levels/` holds one committed fixture per clause *(vault C2: a gate that
 * cannot go red is decoration)*, and each is a shape the rule must **not** call a pit.
 *
 * ## What is deliberately NOT checked here
 *
 * **Enemy beats.** `describePlacementProblem` (`src/game/tiledPlacement.ts:139`) already refuses an
 * enemy whose *swept* beat crosses a hazard, and it knows the body height that `EnemySpawn` does
 * not carry. Re-checking it here against a cruder rectangle would be a second definition that agrees
 * with the first on every easy case and diverges on the hard one. Gears and the goal are the new
 * coverage, because `tiledEntities.ts` checks gears against solids only and `tiledGoal.ts` checks
 * the goal against solids, spawn and ground only — a gear authored inside a derived spike run is
 * seen by nothing at all.
 */

import { describe, expect, it } from 'vitest';

import { GEAR_BOX } from '../../src/sim/pickups';
import { RENDER_SCALE } from '../../src/game/constants';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import {
  columnProfile,
  describePitProblem,
  detectPits,
} from '../../tools/gen/pitDetect.mjs';
import type { PitBlocker } from '../../tools/gen/pitDetect.d.mts';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

/**
 * The pits that ship, named so a change has to come and edit this table deliberately.
 *
 * A layout edit that adds an unspiked pit fails the coverage test **and** this one; a layout edit
 * that silently deletes a pit fails only this one, which is why both exist.
 */
const EXPECTED_PITS: Record<string, string[]> = {
  'level-01': [],
  'level-02': [],
  'level-03': ['65-69'],
  'level-04': [],
  'level-05': [],
};

/**
 * The walking surface, MEASURED from the file rather than assumed to be row 20.
 *
 * The spawn's `y` is the sole the player starts standing on, so it is the ground row by definition.
 * ⚠️ Assuming 20 was wrong: **level-05's ground row is 21**, and a hardcoded 20 read its whole floor
 * as a raised mass. Derived, the five levels report 20, 20, 20, 20, 21.
 */
function groundTopRow(level: LevelData): number {
  return level.spawn.y / level.tileHeight;
}

/** The things that must not be standing in spikes. See the header for why enemies are absent. */
function blockersOf(level: LevelData): PitBlocker[] {
  const gears = level.gears.map((gear, index) => ({
    label: `gear #${index}`,
    x: gear.x + GEAR_BOX.x * RENDER_SCALE,
    y: gear.y + GEAR_BOX.y * RENDER_SCALE,
    w: GEAR_BOX.w * RENDER_SCALE,
    h: GEAR_BOX.h * RENDER_SCALE,
  }));
  return [
    ...gears,
    { label: 'the goal', x: level.goal.x, y: level.goal.y, w: level.goal.w, h: level.goal.h },
  ];
}

function pitsOf(level: LevelData): string[] {
  const row = groundTopRow(level);
  const profile = columnProfile(level.solids, level.widthTiles, level.tileWidth, row);
  return detectPits(profile, row).map((pit) => `${pit.fromCol}-${pit.toCol}`);
}

describe('the shipped levels', () => {
  it.each(LEVELS)('%s has exactly the pits this table names', (id, level) => {
    expect(pitsOf(level), `${id}'s pit set changed — a layout edit added or removed one`).toEqual(
      EXPECTED_PITS[id],
    );
  });

  it.each(LEVELS)('%s spikes every pit floor, end to end', (id, level) => {
    expect(
      describePitProblem({
        solids: level.solids,
        hazards: level.hazards,
        widthTiles: level.widthTiles,
        tileSize: level.tileWidth,
        groundTopRow: groundTopRow(level),
        blockers: blockersOf(level),
      }),
      `${id} — you can fall into this and take nothing`,
    ).toBeNull();
  });

  it('covers every level the catalog ships, so a new one cannot skip the rule', () => {
    expect(LEVELS.map(([id]) => id).sort()).toEqual(Object.keys(EXPECTED_PITS).sort());
  });
});

interface PitFixture {
  why: string;
  tileSize: number;
  widthTiles: number;
  groundTopRow: number;
  solids: { x: number; y: number; w: number; h: number }[];
  hazards?: { x: number; y: number; w: number; h: number }[];
  blockers?: PitBlocker[];
  expectPits: { fromCol: number; toCol: number }[];
  expectProblem?: string | null;
}

const FIXTURE_SOURCES = import.meta.glob('../fixtures/pit-levels/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FIXTURES: [string, PitFixture][] = Object.keys(FIXTURE_SOURCES)
  .sort()
  .map((path) => [
    path.split('/').pop()!.replace(/\.json$/, ''),
    JSON.parse(FIXTURE_SOURCES[path]!) as PitFixture,
  ]);

/**
 * Vault C2. Committed geometry, one defect or one clause each — never an assertion about an
 * assertion. Every fixture states its own expectation, so the fixture and the rule are read
 * together and a fixture that stops discriminating is visible in its own file.
 */
describe('the committed pit fixtures (vault C2)', () => {
  it('has one, and the suite knows how many', () => {
    expect(FIXTURES.length).toBe(12);
  });

  it.each(FIXTURES)('%s — detects the pits its file declares', (_name, fixture) => {
    const profile = columnProfile(
      fixture.solids,
      fixture.widthTiles,
      fixture.tileSize,
      fixture.groundTopRow,
    );
    expect(detectPits(profile, fixture.groundTopRow), fixture.why).toEqual(fixture.expectPits);
  });

  it.each(FIXTURES.filter(([, f]) => f.expectProblem !== undefined))(
    '%s — the rule reports what its file declares',
    (_name, fixture) => {
      const problem = describePitProblem({
        solids: fixture.solids,
        hazards: fixture.hazards ?? [],
        widthTiles: fixture.widthTiles,
        tileSize: fixture.tileSize,
        groundTopRow: fixture.groundTopRow,
        blockers: fixture.blockers ?? [],
      });
      if (fixture.expectProblem === null) {
        expect(problem, fixture.why).toBeNull();
      } else {
        expect(problem, fixture.why).toContain(fixture.expectProblem);
      }
    },
  );

  it('every narrowing clause has a fixture that would fail without it', () => {
    // Named rather than counted: a clause deleted from the rule must leave a fixture with no owner,
    // and a fixture deleted from the directory must leave a clause with no proof.
    expect(FIXTURES.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'notch-one-column',
        'walls-one-tile',
        'map-edge-left',
        'goal-apron-right',
        'bottomless-neighbour',
        'floating-platform-wall',
        'raised-platform-floor',
      ]),
    );
  });
});
