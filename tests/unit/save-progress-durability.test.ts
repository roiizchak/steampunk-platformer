/**
 * The save file's DURABILITY — what survives a write that cannot land, and what a write must not
 * destroy. Criterion 8.4's "no data loss", both halves.
 *
 * Split from `save-progress.test.ts` when that file reached the 400-line limit. That file owns the
 * ENCODING and the validator; this one owns the two failure paths the Phase 8 gate owners found, and
 * both of them are about what happens to bytes the game did not expect.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  PROGRESS_KEY,
  completedIds,
  emptyProgress,
  readProgress,
  recordCompletion,
  resetProgressCache,
  writeProgress,
} from '../../src/game/save';
import { unlockedIds } from '../../src/sim/progress';

/** See `save-progress.test.ts`: module state set only on the failure path needs clearing between tests. */
beforeEach(resetProgressCache);

const ORDER = ['level-01', 'level-02', 'level-03', 'level-04', 'level-05'];

/** A `Storage`-shaped fake. vitest runs in Node, so there is no real `localStorage` here. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    raw: () => map,
  };
}

/** Storage that fails the way a blocked origin does: on every call, not on construction. */
const hostileStorage = {
  getItem(): string | null {
    throw new DOMException('The operation is insecure.');
  },
  setItem(): void {
    throw new DOMException('QuotaExceededError');
  },
};

const seeded = (json: string) => fakeStorage({ [PROGRESS_KEY]: json });

/**
 * 🔴 A write that cannot land must not silently regress the player.
 *
 * Nothing in this game caches the save: `pickLevel`, `onLevelCompleted` and `LevelSelectScene` each
 * re-read storage. So on a refused or full `localStorage` the old code finished level-01, showed a
 * panel reading `ENTER — level-02`, started `Game` with `levelId: 'level-02'`, and `resolveEntryLevel`
 * re-read the unchanged storage, found level-02 still locked, and handed back level-01. Forever. The
 * comment in `writeProgress` claimed "progress still applies for this session"; it did not, and a
 * comment that is wrong is worse than no comment *(vault C9)*. Found by the Phase 8 code-reviewer.
 *
 * These are the gate on the fallback that makes that comment true. Both failure shapes are covered
 * because they are different code paths: a storage that THROWS, and no storage at all — the second
 * would have short-circuited `storage?.setItem` straight into the success branch.
 */
describe('a save that cannot be written survives in memory for the session', () => {
  const earned = () => recordCompletion(emptyProgress(), 'level-01', 3, 7);

  it.each([
    ['storage that throws on write', hostileStorage],
    ['no storage at all', null],
  ])('reads back what was written through %s', (_label, storage) => {
    writeProgress(storage as never, earned());
    const save = readProgress(storage as never);
    expect(completedIds(save), 'the completion was lost, so the player is sent back to level-01').toEqual(
      new Set(['level-01']),
    );
    expect(unlockedIds(completedIds(save), ORDER)).toContain('level-02');
    expect(save.levels['level-01']!.bestGears).toBe(3);
  });

  it('hands out a COPY, so a caller mutating the save cannot corrupt the fallback', () => {
    writeProgress(null, earned());
    const first = readProgress(null);
    first.levels['level-05'] = { completed: true, bestGears: 99 };
    first.lastLevel = 'level-05';
    expect(completedIds(readProgress(null)), 'the cached save was mutated through a reader').toEqual(
      new Set(['level-01']),
    );
  });

  it('stops winning once a write really lands — storage is authoritative again', () => {
    writeProgress(null, earned());
    const disk = fakeStorage();
    writeProgress(disk, emptyProgress());
    expect(
      completedIds(readProgress(disk)),
      'a successful write did not clear the fallback, so the session is stuck on stale progress',
    ).toEqual(new Set());
  });

  /**
   * ⚠️ And it must not invent progress. A read with no write before it is still an empty save — the
   * fallback is a memory of what THIS session earned, not a way to be generous about it.
   */
  it('is not a source of progress on its own', () => {
    expect(completedIds(readProgress(hostileStorage)).size).toBe(0);
  });
});

/**
 * 🔴 A dropped entry is IGNORED, not ERASED — criterion 8.4's actual words are "no data loss".
 *
 * `readProgress` drops what it cannot validate, and `writeProgress` re-serialises only what survived.
 * The next write is never far away: `pickLevel` writes on every level start where the resume point
 * moves, and `gameComplete` writes on every completion. So one hand-edited `bestGears: 3.5` used to
 * cost that level's record permanently, seconds later, with nothing said. Found by the Phase 8
 * code-reviewer's adversarial brief.
 */
describe('a write does not erase the entries the read dropped', () => {
  const CORRUPT =
    '{"version":1,"lastLevel":"level-01","levels":{' +
    '"level-01":{"completed":true,"bestGears":2},' +
    '"level-04":{"completed":true,"bestGears":3.5}}}';

  it('carries a dropped entry through untouched', () => {
    const storage = seeded(CORRUPT);
    const save = readProgress(storage);
    expect(save.levels['level-04'], 'premise: level-04 must be dropped, or this proves nothing').toBeUndefined();

    writeProgress(storage, recordCompletion(save, 'level-02', 1, 8));

    const onDisk = JSON.parse(storage.raw().get(PROGRESS_KEY)!) as { levels: Record<string, unknown> };
    expect(
      onDisk.levels['level-04'],
      'finishing a level erased the record of a level whose entry could not be parsed',
    ).toEqual({ completed: true, bestGears: 3.5 });
    expect(onDisk.levels['level-02']).toEqual({ completed: true, bestGears: 1 });
    expect(onDisk.levels['level-01']).toEqual({ completed: true, bestGears: 2 });
  });

  /** ⚠️ And it stays UNREADABLE. Keeping the bytes is not the same as honouring the claim in them. */
  it('the carried entry still unlocks nothing', () => {
    const storage = seeded(CORRUPT);
    writeProgress(storage, recordCompletion(readProgress(storage), 'level-02', 1, 8));
    const reread = readProgress(storage);
    expect(reread.levels['level-04']).toBeUndefined();
    expect(unlockedIds(completedIds(reread), ORDER)).not.toContain('level-05');
  });

  /** A valid entry the caller genuinely rewrote is replaced, not resurrected. */
  it('does not resurrect an entry the save legitimately updated', () => {
    const storage = seeded('{"version":1,"lastLevel":"level-01","levels":{"level-01":{"completed":true,"bestGears":2}}}');
    writeProgress(storage, recordCompletion(readProgress(storage), 'level-01', 6, 7));
    const onDisk = JSON.parse(storage.raw().get(PROGRESS_KEY)!) as { levels: Record<string, unknown> };
    expect(onDisk.levels['level-01']).toEqual({ completed: true, bestGears: 6 });
  });
});

/**
 * 🔴 A save this build refuses to READ must not be laundered into one it believes.
 *
 * `readProgress` rejects an unknown `version` wholesale — it will not guess at a layout that has not
 * been designed. But `carriedOver` runs against the raw bytes, and without a version check every entry
 * in a version-2 file was copied out and re-stamped as version 1 by the very next write. That write is
 * one ordinary boot away: `pickLevel` records the resume point. Verified by seeding exactly this and
 * reading storage back — `{"version":2,...,"level-04":{completed:true}}` became a version-1 completion
 * and unlocked level-05. Found by Codex's implementation review.
 */
describe('carrying entries over never launders a save the reader refused', () => {
  it('drops the entries of a FUTURE schema instead of re-stamping them', () => {
    const storage = seeded(
      '{"version":2,"lastLevel":"level-05","levels":{"level-04":{"completed":true,"bestGears":1}}}',
    );
    writeProgress(storage, recordCompletion(readProgress(storage), 'level-01', 1, 7));

    const onDisk = JSON.parse(storage.raw().get(PROGRESS_KEY)!) as {
      version: number;
      levels: Record<string, unknown>;
    };
    expect(onDisk.version).toBe(1);
    expect(
      onDisk.levels['level-04'],
      'a version-2 entry was re-stamped as version 1, which unlocks level-05 from a file this build ' +
        'declared itself unable to read',
    ).toBeUndefined();
    expect(unlockedIds(completedIds(readProgress(storage)), ORDER)).toEqual(['level-01', 'level-02']);
  });

  /**
   * 🔴 And a carried entry named `__proto__` survives the write.
   *
   * It is an OWN property of the parsed object, so copying it into an object LITERAL runs the
   * inherited setter and it silently disappears — the exact loss `carriedOver` exists to prevent,
   * reintroduced by the accumulator. `Object.create(null)` is the fix, and it is the same care
   * `emptyProgress` already took.
   */
  it('carries an entry named __proto__ rather than dropping it through the setter', () => {
    const storage = seeded(
      '{"version":1,"lastLevel":null,"levels":{"__proto__":{"completed":true,"bestGears":1}}}',
    );
    writeProgress(storage, recordCompletion(readProgress(storage), 'level-01', 1, 7));
    expect(
      storage.raw().get(PROGRESS_KEY),
      'the __proto__ entry was lost through the prototype setter',
    ).toContain('__proto__');
  });
});

/**
 * 🔴 The unwritable save is MERGED with disk, not substituted for it.
 *
 * The draft returned `unwritten` outright once any write had failed, on the reasoning that such a
 * storage is known-broken. Codex's implementation review pointed out that this contradicts
 * `gameComplete.onLevelCompleted`'s own comment — it re-reads storage precisely so a level finished in
 * another tab is not rolled back — and that a refused WRITE is not proof the next READ will fail.
 */
describe('the unwritable save does not hide newer bytes on disk', () => {
  it('takes the union: this session AND whatever else landed', () => {
    resetProgressCache();
    // This session earns level-01 but cannot persist it.
    writeProgress(hostileStorage, recordCompletion(emptyProgress(), 'level-01', 3, 7));

    // Meanwhile a working storage already holds level-02, finished elsewhere.
    const disk = fakeStorage({
      [PROGRESS_KEY]: '{"version":1,"lastLevel":"level-02","levels":{"level-02":{"completed":true,"bestGears":8}}}',
    });
    const merged = readProgress(disk);
    expect(
      completedIds(merged),
      'the in-memory save hid a completion that was already on disk',
    ).toEqual(new Set(['level-01', 'level-02']));
    expect(merged.levels['level-01']!.bestGears).toBe(3);
    expect(merged.levels['level-02']!.bestGears).toBe(8);
  });

  it('keeps the better gear count when both sides have the same level', () => {
    resetProgressCache();
    writeProgress(hostileStorage, recordCompletion(emptyProgress(), 'level-01', 2, 7));
    const disk = fakeStorage({
      [PROGRESS_KEY]: '{"version":1,"lastLevel":null,"levels":{"level-01":{"completed":true,"bestGears":6}}}',
    });
    expect(readProgress(disk).levels['level-01']!.bestGears, 'the merge lowered a best score').toBe(6);
  });
});
