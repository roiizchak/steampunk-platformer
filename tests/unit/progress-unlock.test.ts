/**
 * The unlock rule, and the boot-level decision. Phase 8, criterion 8.3.
 *
 * `src/sim/progress.ts` is pure — no storage, no Phaser, no clock — so every case here is a
 * millisecond call rather than a browser round trip. `save-progress.test.ts` gates the bytes.
 *
 * ## 🔴 Why `resolveEntryLevel` gets most of the file
 *
 * It is the only function in the project that takes a **user-editable string** and turns it into the
 * level the game boots into. Two failure directions, and they pull opposite ways:
 *
 * - Too permissive, and `{ lastLevel: 'level-05', levels: {} }` — a well-formed save anyone can type
 *   into devtools — skips the entire progression. Nothing crashes; the game is just given away.
 * - Too trusting, and `lastLevel: 'level-09'` reaches `loadLevel` with no catalog entry, throws inside
 *   `GameScene.create()`, and leaves `ready:false` with `bootError:null`. That is the hang state
 *   `refuseToRoute` exists to prevent, and it is indistinguishable from a slow load.
 *
 * So the tests below are mostly hostile inputs, and every one of them asserts the result is an id that
 * is **in `order`** — not merely that nothing threw.
 */

import { describe, expect, it } from 'vitest';

import { isUnlocked, nextLevelId, resolveEntryLevel, unlockedIds } from '../../src/sim/progress';

const ORDER = ['level-01', 'level-02', 'level-03', 'level-04', 'level-05'] as const;
const order = [...ORDER];

const done = (...ids: string[]): Set<string> => new Set(ids);

describe('nextLevelId walks the catalog order', () => {
  it('returns the following level', () => {
    expect(nextLevelId('level-01', order)).toBe('level-02');
    expect(nextLevelId('level-04', order)).toBe('level-05');
  });

  it('returns null after the last level — "the game is finished" is a value, not an overflow', () => {
    expect(nextLevelId('level-05', order)).toBeNull();
  });

  it('returns null for an id that is not in the catalog', () => {
    expect(nextLevelId('level-09', order)).toBeNull();
    expect(nextLevelId('', order)).toBeNull();
  });

  /**
   * Order comes from the array, never from the digits in the id *(vault 3.3)*. A reordered
   * `index.json` must reorder progression with no code change — and this is the assertion that fails
   * if someone "simplifies" the lookup to `level-0${n + 1}`.
   */
  it('follows the array, not the number in the name', () => {
    expect(nextLevelId('level-03', ['level-03', 'level-01'])).toBe('level-01');
  });
});

describe('isUnlocked needs the level BEFORE it, specifically', () => {
  it('always unlocks the first level, so a fresh save has something to open', () => {
    expect(isUnlocked('level-01', done(), order)).toBe(true);
  });

  it('locks a level whose predecessor is not completed', () => {
    expect(isUnlocked('level-02', done(), order)).toBe(false);
    expect(isUnlocked('level-05', done('level-01', 'level-02'), order)).toBe(false);
  });

  it('unlocks a level once its predecessor is completed', () => {
    expect(isUnlocked('level-02', done('level-01'), order)).toBe(true);
  });

  /**
   * 🔴 The rule that a hand-edited save attacks. With `levels: { 'level-05': {completed:true} }`
   * written straight into storage, an "any completion unlocks the next" reading would open level-02
   * through level-06 at once — five levels earned by one line of JSON.
   */
  it('is not satisfied by SOME level being completed', () => {
    const completed = done('level-05');
    expect(isUnlocked('level-02', completed, order)).toBe(false);
    expect(isUnlocked('level-03', completed, order)).toBe(false);
    expect(isUnlocked('level-04', completed, order)).toBe(false);
  });

  it('never unlocks an id the catalog does not contain', () => {
    // The load-bearing line: `resolveEntryLevel` gets its whole "not in the catalog" rejection from
    // here, so the two rules cannot drift apart.
    const everything = done(...order);
    expect(isUnlocked('level-09', everything, order)).toBe(false);
    expect(isUnlocked('', everything, order)).toBe(false);
    expect(isUnlocked('__proto__', everything, order)).toBe(false);
  });
});

describe('unlockedIds reports what is playable, in catalog order', () => {
  it('is just the first level on a fresh save', () => {
    expect(unlockedIds(done(), order)).toEqual(['level-01']);
  });

  it('grows by one per completion', () => {
    expect(unlockedIds(done('level-01'), order)).toEqual(['level-01', 'level-02']);
    expect(unlockedIds(done('level-01', 'level-02'), order)).toEqual(['level-01', 'level-02', 'level-03']);
  });

  /**
   * A save with a HOLE in it — level-03 completed but level-02 not — is reachable by hand-editing, and
   * `unlockedIds` filters rather than walking forward until it hits a gap. So the lock screen shows
   * exactly what `isUnlocked` would allow, instead of stopping short of a level the player can start.
   */
  it('reports a hole honestly rather than stopping at it', () => {
    expect(unlockedIds(done('level-03'), order)).toEqual(['level-01', 'level-04']);
  });
});

describe('resolveEntryLevel is total, and never hands back an id the catalog lacks', () => {
  it('honours an explicit unlocked request', () => {
    expect(resolveEntryLevel('level-03', 'level-01', order, done('level-01', 'level-02'))).toBe('level-03');
  });

  it('falls back to the saved level when nothing was requested', () => {
    expect(resolveEntryLevel(null, 'level-02', order, done('level-01'))).toBe('level-02');
    expect(resolveEntryLevel(undefined, 'level-02', order, done('level-01'))).toBe('level-02');
  });

  it('falls back to the first level when neither is usable', () => {
    expect(resolveEntryLevel(null, null, order, done())).toBe('level-01');
  });

  /**
   * 🔴 The hang. `lastLevel: 'level-09'` has no catalog entry, so passing it through would throw inside
   * `GameScene.create()` — `ready:false`, `bootError:null`, and every e2e spec waiting on `ready`
   * hanging until its timeout with nothing to report.
   */
  it('refuses a level id that is not in the catalog', () => {
    expect(resolveEntryLevel('level-09', null, order, done(...order))).toBe('level-01');
    expect(resolveEntryLevel(null, 'level-09', order, done(...order))).toBe('level-01');
  });

  /** 🔴 The giveaway. A well-formed save, an unedited catalog, and the whole game skipped. */
  it('refuses a saved level that is LOCKED', () => {
    expect(resolveEntryLevel(null, 'level-05', order, done())).toBe('level-01');
  });

  it('refuses a locked explicit request too, and still lands somewhere playable', () => {
    // The level-select screen should never send a locked id, but "should never" is not a guard.
    expect(resolveEntryLevel('level-04', 'level-02', order, done('level-01'))).toBe('level-02');
  });

  it.each([
    ['an empty string', ''],
    ['a prototype key', '__proto__'],
    ['a constructor key', 'constructor'],
    ['whitespace', '   '],
    ['a path', '../level-01'],
  ])('refuses %s in both slots', (_label, hostile) => {
    expect(resolveEntryLevel(hostile, null, order, done(...order))).toBe('level-01');
    expect(resolveEntryLevel(null, hostile, order, done(...order))).toBe('level-01');
  });

  /**
   * `null` only for an empty catalog, and that case is left visible in the type rather than papered
   * over with a made-up id. `bootLevels.ts` refuses to route when the catalog is empty; a fabricated
   * `'level-01'` here would turn that clean refusal into a 404 three frames later.
   */
  it('returns null only when the catalog itself is empty', () => {
    expect(resolveEntryLevel('level-01', 'level-01', [], done('level-01'))).toBeNull();
  });

  it('never returns an id outside the catalog, across every combination above', () => {
    const hostile = [null, undefined, '', '__proto__', 'level-09', 'level-05', 'level-01'];
    const sets = [done(), done('level-01'), done(...order)];
    for (const requested of hostile) {
      for (const saved of hostile) {
        for (const completed of sets) {
          const got = resolveEntryLevel(requested, saved, order, completed);
          expect(order, `resolveEntryLevel(${String(requested)}, ${String(saved)}) escaped the catalog`).toContain(got);
          expect(
            isUnlocked(got!, completed, order),
            `resolveEntryLevel(${String(requested)}, ${String(saved)}) returned a LOCKED level`,
          ).toBe(true);
        }
      }
    }
  });
});
