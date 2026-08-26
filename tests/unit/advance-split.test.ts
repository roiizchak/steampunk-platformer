/**
 * The split batch a render frame runs — and the events it used to throw away.
 *
 * **REPRODUCTION (red→green), all of it.** `GameScene.update()` discarded the return value of
 * `advance(world, input, ticks - 1)` and kept only the last tick's events, so every edge produced by
 * the earlier ticks of a multi-tick frame vanished. At 30 Hz — two ticks a frame, routine — that is
 * half of all events. Codex's Phase 6 plan review found it by reading (finding F8).
 *
 * The scene could not be unit-tested, which is why the bug survived Phase 5. Extracting the split
 * into `src/sim/advanceSplit.ts` is what makes these assertions possible at all *(vault 2.12)*.
 */

import { describe, expect, it } from 'vitest';
import { advanceSplit, createWorld, mergeEvents, noEvents } from '../../src/sim';
import type { InputSnapshot, World } from '../../src/sim';
import { RENDER_SCALE } from '../../src/game/constants';

const idle: InputSnapshot = {
  left: false,
  right: false,
  jumpHeld: false,
  jumpPressed: false,
  walkHeld: false,
  attackPressed: false,
};

/** A gear sitting exactly where the grey-box player spawns, so tick 1 of any batch collects it. */
function worldWithGearAtSpawn(): World {
  const world = createWorld({ seed: 1, scale: RENDER_SCALE, gears: [{ x: 470, y: 760 }] });
  world.player.x = 470;
  world.player.y = 780;
  return world;
}

describe('advanceSplit — events from the whole frame', () => {
  it('REPRODUCTION: an edge from the FIRST batch survives a multi-tick frame', () => {
    const world = worldWithGearAtSpawn();

    // Five ticks: the gear is collected on tick 1, which lands in the discarded `ticks - 1` half.
    const events = advanceSplit(world, idle, 5, () => {});

    expect(typeof events.gearCollected).toBe('boolean');
    expect(events.gearCollected).toBe(true);
    expect(world.gearsCollected).toBe(1);
  });

  it('the snapshot callback runs exactly once, between the two halves', () => {
    const world = worldWithGearAtSpawn();
    const tickCountsWhenCalled: number[] = [];

    advanceSplit(world, idle, 4, () => tickCountsWhenCalled.push(world.tickCount));

    // Called after 3 ticks and before the 4th — that is what "immediately before the last tick"
    // means, and it is the whole reason the batch is split rather than run in one call.
    expect(tickCountsWhenCalled).toEqual([3]);
    expect(world.tickCount).toBe(4);
  });

  it('a single-tick frame still snapshots, and still reports its events', () => {
    const world = worldWithGearAtSpawn();
    let called = 0;

    const events = advanceSplit(world, idle, 1, () => {
      called += 1;
    });

    expect(called).toBe(1);
    expect(world.tickCount).toBe(1);
    expect(events.gearCollected).toBe(true);
  });

  it('a zero-tick frame runs no ticks and does NOT snapshot', () => {
    const world = worldWithGearAtSpawn();
    let called = 0;

    const events = advanceSplit(world, idle, 0, () => {
      called += 1;
    });

    expect(called).toBe(0);
    expect(world.tickCount).toBe(0);
    expect(events.gearCollected).toBe(false);
  });

  it('runs exactly the ticks it was asked for', () => {
    for (const ticks of [1, 2, 3, 5]) {
      const world = createWorld({ seed: 1, scale: RENDER_SCALE });
      advanceSplit(world, idle, ticks, () => {});
      expect(world.tickCount).toBe(ticks);
    }
  });
});

describe('mergeEvents', () => {
  it('ORs every declared field, so a new edge cannot be forgotten', () => {
    const empty = noEvents();
    const keys = Object.keys(empty) as (keyof typeof empty)[];
    expect(keys.length).toBeGreaterThan(0);

    // Each field, one at a time: set only that one on the left and confirm it survives the merge.
    for (const key of keys) {
      const left = { ...empty, [key]: true };
      const merged = mergeEvents(left, empty);
      expect(merged[key], `mergeEvents dropped "${key}"`).toBe(true);

      const mergedOther = mergeEvents(empty, left);
      expect(mergedOther[key], `mergeEvents dropped "${key}" from the right side`).toBe(true);
    }
  });

  it('returns a new record rather than mutating either input', () => {
    const a = noEvents();
    const b = { ...noEvents(), jumped: true };

    const merged = mergeEvents(a, b);

    expect(merged.jumped).toBe(true);
    expect(a.jumped).toBe(false);
    expect(merged).not.toBe(a);
    expect(merged).not.toBe(b);
  });
});

/**
 * **The committed red proof for criterion 10.12 still applies to this file.**
 *
 * `tests/fixtures/dead-sim.patch` neuters `advance()`'s loop so no tick runs, and it is the only
 * evidence that the production completion predicate can go red. A patch pins its context lines
 * verbatim: reformat that loop header — prettier, a rename, a `for...of` — and the fixture stops
 * applying, silently, because nothing consumed it. *"A red proof nobody can re-run is a claim, not
 * evidence"* is the patch's own line 10, and until now nothing enforced it (criterion 10.12 gate
 * owner, brief B, finding 14).
 *
 * This asserts the two lines the patch anchors on, not the patch's whole content — the point is to
 * fail on the *edit that would break it*, in the file being edited, at the moment it is made.
 */
describe('the dead-sim red proof is still applicable', () => {
  const SOURCE = Object.values(
    import.meta.glob('../../src/sim/advanceSplit.ts', {
      eager: true,
      query: '?raw',
      import: 'default',
    }),
  )[0] as string;

  const FIXTURE = Object.values(
    import.meta.glob('../../tests/fixtures/dead-sim.patch', {
      eager: true,
      query: '?raw',
      import: 'default',
    }),
  )[0] as string;

  it('still contains the exact loop header the patch anchors on', () => {
    // The `-` line of the diff, i.e. what the patch expects to find here.
    const removed = FIXTURE.split('\n')
      .filter((l) => l.startsWith('-') && !l.startsWith('---'))
      .map((l) => l.slice(1));
    expect(removed.length, 'the fixture no longer removes exactly one line').toBe(1);
    expect(
      SOURCE,
      `tests/fixtures/dead-sim.patch expects this file to contain "${removed[0]?.trim()}" and it ` +
        'does not. `git apply` will refuse, and criterion 10.12 loses the only red proof it has.',
    ).toContain(removed[0]);
  });
});
