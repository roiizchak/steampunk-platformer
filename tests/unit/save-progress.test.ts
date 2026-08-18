/**
 * The save file's bytes — criteria 8.3 and 8.4. `progress-unlock.test.ts` gates what they mean.
 *
 * ## 🔴 The format is asserted against a hand-written string, not a round trip
 *
 * A `read`/`write` pair that agree on a wrong encoding passes every round-trip test ever written. And
 * the reload half of criterion 8.3 *is* a round trip — through the real browser, where the only thing
 * that carries between the two halves is the string in `localStorage`. So the exact bytes are pinned
 * once, and every hand-written fixture below is typed out as JSON rather than produced by `write`.
 *
 * ## 🔴 A corrupt entry must fail LOCKED
 *
 * The validator that coerces garbage into the schema "loses no data" and unlocks the game:
 * `levels: { 'level-04': 'banana' }` becomes a completed level-04 and hands the player level-05. So
 * these tests assert the opposite direction — a corrupt entry is **dropped**, `completedIds` shrinks,
 * and the valid entries beside it survive. Criterion 8.4 is that second half.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  PROGRESS_KEY,
  PROGRESS_VERSION,
  bestGears,
  completedIds,
  emptyProgress,
  readProgress,
  recordCompletion,
  resetProgressCache,
  writeProgress,
} from '../../src/game/save';
import { unlockedIds } from '../../src/sim/progress';

/**
 * ⚠️ `writeProgress` keeps an unwritable save in module state, so a test that writes through a
 * refused storage would otherwise make every later `readProgress` in this file return that save
 * instead of reading its fixture. It is the price of the fallback and it is paid here, once.
 */
beforeEach(resetProgressCache);

const ORDER = ['level-01', 'level-02', 'level-03', 'level-04', 'level-05'];

/** A `Storage`-shaped fake. vitest runs in Node, so there is no real `localStorage` here. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    /** Test-only view of what was actually persisted. */
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

describe('the stored format is exactly this', () => {
  /**
   * 🔴 The one assertion that cannot be satisfied by a self-consistent reader/writer pair. If the
   * encoding changes, this is the test that says so — and it is the encoding, not the round trip, that
   * has to survive the browser reload in criterion 8.3.
   */
  it('writes the version, the resume point and the per-level record, in that shape', () => {
    const storage = fakeStorage();
    const save = emptyProgress();
    save.lastLevel = 'level-02';
    save.levels['level-01'] = { completed: true, bestGears: 3 };
    writeProgress(storage, save);

    expect(storage.raw().get(PROGRESS_KEY)).toBe(
      '{"version":1,"lastLevel":"level-02","levels":{"level-01":{"completed":true,"bestGears":3}}}',
    );
  });

  it('reads that same hand-typed string back', () => {
    const save = readProgress(
      seeded('{"version":1,"lastLevel":"level-02","levels":{"level-01":{"completed":true,"bestGears":3}}}'),
    );
    expect(save.lastLevel).toBe('level-02');
    expect(save.levels['level-01']).toEqual({ completed: true, bestGears: 3 });
    expect(completedIds(save)).toEqual(new Set(['level-01']));
  });

  it('stores nothing but the declared fields, even if a caller hangs extras on the object', () => {
    const storage = fakeStorage();
    const save = emptyProgress() as unknown as Record<string, unknown>;
    save.sneaky = 'cheat';
    writeProgress(storage, save as never);
    expect(storage.raw().get(PROGRESS_KEY)).toBe('{"version":1,"lastLevel":null,"levels":{}}');
  });

  it('declares version 1 — a bump is a migration decision, not a passing detail', () => {
    expect(PROGRESS_VERSION).toBe(1);
  });
});

describe('readProgress survives everything a user can type into devtools', () => {
  it('returns an empty save when nothing has ever been stored', () => {
    const save = readProgress(fakeStorage());
    expect(save).toEqual({ version: 1, lastLevel: null, levels: {} });
    expect(completedIds(save).size).toBe(0);
  });

  it.each([
    ['not JSON at all', 'banana'],
    ['JSON that is not an object', '42'],
    ['JSON null', 'null'],
    ['an array', '[{"completed":true}]'],
    ['an empty object', '{}'],
    ['a future schema version', '{"version":2,"lastLevel":"level-05","levels":{"level-01":{"completed":true,"bestGears":0}}}'],
    ['a missing version', '{"lastLevel":"level-05","levels":{"level-01":{"completed":true,"bestGears":0}}}'],
    ['levels as a string', '{"version":1,"lastLevel":null,"levels":"all of them"}'],
  ])('treats %s as no save at all', (_label, raw) => {
    const save = readProgress(seeded(raw));
    expect(save.version).toBe(1);
    expect(completedIds(save).size).toBe(0);
    expect(unlockedIds(completedIds(save), ORDER)).toEqual(['level-01']);
  });

  it('never throws when storage itself refuses — the getter, the reader and the writer', () => {
    // A blocked origin raises on `getItem`, not only on the `window.localStorage` property access that
    // `safeLocalStorage()` guards. Both hazards are real and they are not the same hazard.
    expect(() => readProgress(hostileStorage)).not.toThrow();
    expect(readProgress(hostileStorage)).toEqual({ version: 1, lastLevel: null, levels: {} });
    expect(() => writeProgress(hostileStorage, emptyProgress())).not.toThrow();
    expect(() => readProgress(null)).not.toThrow();
    expect(() => writeProgress(null, emptyProgress())).not.toThrow();
  });

  it.each([
    ['a number', '7'],
    ['an object', '{"id":"level-03"}'],
    ['true', 'true'],
  ])('drops a lastLevel that is %s', (_label, encoded) => {
    const save = readProgress(seeded(`{"version":1,"lastLevel":${encoded},"levels":{}}`));
    expect(save.lastLevel).toBeNull();
  });

  /**
   * `lastLevel` is NOT validated against the catalog here, on purpose. This module owns the bytes;
   * `resolveEntryLevel` owns whether the id is playable, and it is the function on the boot path. A
   * second catalog check here would be a second place to keep in step with the first.
   */
  it('keeps a syntactically valid lastLevel even when it names no real level', () => {
    expect(readProgress(seeded('{"version":1,"lastLevel":"level-09","levels":{}}')).lastLevel).toBe('level-09');
  });
});

describe('a corrupt entry fails LOCKED, and takes nothing else with it', () => {
  const CORRUPT =
    '{"version":1,"lastLevel":"level-03","levels":{' +
    '"level-01":{"completed":true,"bestGears":5},' +
    '"level-02":{"completed":true,"bestGears":2},' +
    '"level-03":"banana"}}';

  it('keeps the valid entries — criterion 8.4', () => {
    const save = readProgress(seeded(CORRUPT));
    expect(save.levels['level-01']).toEqual({ completed: true, bestGears: 5 });
    expect(save.levels['level-02']).toEqual({ completed: true, bestGears: 2 });
  });

  /** 🔴 Dropped, not repaired. The absence IS `completed: false`. */
  it('drops the corrupt one rather than coercing it to completed', () => {
    const save = readProgress(seeded(CORRUPT));
    expect(save.levels['level-03']).toBeUndefined();
    expect(completedIds(save).has('level-03')).toBe(false);
  });

  /**
   * 🔴 The direction that matters. A validator that guessed `{completed:true}` would leave
   * `unlockedIds` five long and the mistake invisible — the player just finds the game already open.
   * Asserted as a SHRINK against the same file with the entry intact, so the claim is comparative
   * rather than a number that could be right by accident.
   */
  it('shrinks the unlocked set compared with the same save uncorrupted', () => {
    const intact = CORRUPT.replace('"banana"', '{"completed":true,"bestGears":1}');
    const withGoodEntry = unlockedIds(completedIds(readProgress(seeded(intact))), ORDER);
    const withBadEntry = unlockedIds(completedIds(readProgress(seeded(CORRUPT))), ORDER);

    expect(withGoodEntry, 'premise: the intact fixture must unlock further, or the shrink proves nothing').toEqual([
      'level-01',
      'level-02',
      'level-03',
      'level-04',
    ]);
    expect(withBadEntry).toEqual(['level-01', 'level-02', 'level-03']);
    expect(withBadEntry.length).toBeLessThan(withGoodEntry.length);
  });

  it.each([
    ['completed missing', '{"bestGears":3}'],
    ['completed as a string', '{"completed":"yes","bestGears":3}'],
    ['completed as 1', '{"completed":1,"bestGears":3}'],
    ['bestGears missing', '{"completed":true}'],
    ['bestGears as a string', '{"completed":true,"bestGears":"3"}'],
    ['bestGears negative', '{"completed":true,"bestGears":-1}'],
    ['bestGears fractional', '{"completed":true,"bestGears":2.5}'],
    ['bestGears null', '{"completed":true,"bestGears":null}'],
    ['an array', '[true,3]'],
    ['a bare true', 'true'],
  ])('rejects an entry whose %s', (_label, entry) => {
    const save = readProgress(seeded(`{"version":1,"lastLevel":null,"levels":{"level-01":${entry}}}`));
    expect(save.levels['level-01']).toBeUndefined();
    expect(completedIds(save).size).toBe(0);
  });

  /**
   * `JSON.parse('{"__proto__":{}}')` produces an **own** property named `__proto__`, so a `levels`
   * built as an object literal would run the inherited setter instead of storing it — and then answer
   * `levels['__proto__']` truthily for a level that is not in the file. `Object.create(null)` has no
   * such answer to give.
   */
  it('cannot be tricked by a prototype key', () => {
    const save = readProgress(
      seeded('{"version":1,"lastLevel":null,"levels":{"__proto__":{"completed":true,"bestGears":9}}}'),
    );
    expect(Object.getPrototypeOf(save.levels)).toBeNull();
    // The entry is syntactically valid, so it is stored as an ordinary key — and `isUnlocked` refuses
    // it anyway because it is not in the catalog. What must NOT happen is it leaking onto every lookup.
    expect(save.levels['level-01']).toBeUndefined();
    expect(unlockedIds(completedIds(save), ORDER)).toEqual(['level-01']);
  });
});

describe('recordCompletion keeps the BEST gear count, not the latest', () => {
  it('marks the level completed and stores the run', () => {
    const save = recordCompletion(emptyProgress(), 'level-01', 5, 7);
    expect(save.levels['level-01']).toEqual({ completed: true, bestGears: 5 });
    expect(save.lastLevel).toBe('level-01');
  });

  it('does not lower the record when a replay collects fewer', () => {
    const save = recordCompletion(emptyProgress(), 'level-01', 5, 7);
    recordCompletion(save, 'level-01', 2, 7);
    expect(save.levels['level-01']!.bestGears, 'a replay lowered the best gear count').toBe(5);
    expect(save.levels['level-01']!.completed).toBe(true);
  });

  it('raises the record when a replay collects more', () => {
    const save = recordCompletion(emptyProgress(), 'level-01', 5, 7);
    recordCompletion(save, 'level-01', 7, 7);
    expect(save.levels['level-01']!.bestGears).toBe(7);
  });

  it('clamps an impossible count to what the level holds', () => {
    const save = recordCompletion(emptyProgress(), 'level-01', 99, 7);
    expect(save.levels['level-01']!.bestGears).toBe(7);
  });

  it('never un-completes a level, so an unlock cannot be lost by playing badly', () => {
    const save = recordCompletion(emptyProgress(), 'level-01', 7, 7);
    recordCompletion(save, 'level-01', 0, 7);
    expect(save.levels['level-01']!.completed).toBe(true);
  });

  it('advances the resume point, which is what a reload comes back to', () => {
    const save = recordCompletion(emptyProgress(), 'level-01', 1, 7);
    recordCompletion(save, 'level-02', 1, 7);
    expect(save.lastLevel).toBe('level-02');
    expect(unlockedIds(completedIds(save), ORDER)).toEqual(['level-01', 'level-02', 'level-03']);
  });
});

describe('bestGears is clamped where it is READ', () => {
  /**
   * A stored `bestGears` outlives the level it describes. Re-author level-03 with five gears instead
   * of nine and an untouched save makes the completion overlay read "9 / 5".
   */
  it('never reports more gears than the level currently holds', () => {
    const save = readProgress(seeded('{"version":1,"lastLevel":null,"levels":{"level-03":{"completed":true,"bestGears":9}}}'));
    expect(bestGears(save, 'level-03', 5)).toBe(5);
  });

  it('leaves the stored value alone, so a level that grows back shows the real score', () => {
    const save = readProgress(seeded('{"version":1,"lastLevel":null,"levels":{"level-03":{"completed":true,"bestGears":9}}}'));
    expect(bestGears(save, 'level-03', 5)).toBe(5);
    expect(bestGears(save, 'level-03', 9), 'the clamp overwrote the stored record').toBe(9);
  });

  it('reads zero for a level with no record', () => {
    expect(bestGears(emptyProgress(), 'level-04', 7)).toBe(0);
  });
});
