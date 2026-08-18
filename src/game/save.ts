/**
 * The save file — unlocks, the level to resume, and the best gear count per level. Criteria 8.3, 8.4.
 *
 * Deliberately a near-copy of `audioSettings.ts`, down to the injected 2-method storage and the
 * "nothing here can throw" rule, because it is the same hazard: `localStorage` is the one input to this
 * game a *user* can edit by hand, that survives a deploy, and that no build step validates. A
 * `JSON.parse` throw would land inside `GameScene.create()`, which leaves `ready:false` with
 * `bootError:null` — the indistinguishable hang state `refuseToRoute` exists to prevent. **Access
 * itself can throw too**, before any `try` in this file is reached, which is why `safeLocalStorage()`
 * is imported rather than reimplemented: there is one place that knows the `window.localStorage`
 * getter is dangerous, and it is over there.
 *
 * The meaning of the data lives in `src/sim/progress.ts`. This file owns only the bytes.
 *
 * ## 🔴 A corrupt entry fails LOCKED
 *
 * The tempting validator coerces whatever it finds into the schema's shape so that "no data is lost".
 * Applied to `levels`, that turns `levels: { 'level-04': 'banana' }` into a completed level-04 and
 * hands the player level-05. A save file is not authoritative about what the player has earned; it is
 * a *claim*, and an unreadable claim is not a claim. So an entry that does not validate is **dropped**,
 * and absence means `completed: false` everywhere that reads it.
 *
 * Dropped **one entry at a time**, though. Discarding the whole file because `level-04` is malformed
 * would delete a valid level-01 and level-02 beside it, which is criterion 8.4's actual subject.
 *
 * ## Why `bestGears` is clamped at the point it is read
 *
 * A stored `bestGears` outlives the level it describes. Re-author level-03 with five gears instead of
 * nine and an untouched save makes the completion overlay read "9 / 5". `bestGears()` takes the
 * level's current total and clamps to it, so the number shown is always sayable about the level that
 * shipped — and the stored value is left alone, because the level might grow back.
 */

import { safeLocalStorage, type SettingsStorage } from './audioSettings';

export { safeLocalStorage };
export type { SettingsStorage };

/** The one key. Namespaced, because `localStorage` is shared across the whole origin. */
export const PROGRESS_KEY = 'steampunk.progress';

/**
 * The schema version.
 *
 * An unrecognised version is treated as no save at all — see `readProgress`. There is no migration
 * path yet and inventing one for a version that has never shipped would be code with no caller.
 */
export const PROGRESS_VERSION = 1;

export interface LevelProgress {
  completed: boolean;
  /** The most gears collected in any single run of this level. Never decreases. */
  bestGears: number;
}

export interface SaveData {
  version: number;
  /** The level to resume into. Untrusted — `resolveEntryLevel` is what makes it safe to use. */
  lastLevel: string | null;
  levels: Record<string, LevelProgress>;
}

/**
 * A fresh save: nothing completed, nothing to resume.
 *
 * A function rather than a frozen constant because every caller mutates the object it gets back, and a
 * shared literal would let a completed level-01 leak into the next test in the file.
 *
 * `Object.create(null)` for `levels`, and that is not decoration. `JSON.parse('{"__proto__":{}}')`
 * produces an **own** property named `__proto__`, so copying entries into an object literal would run
 * the inherited setter instead of storing them — and a hand-edited save naming `__proto__`,
 * `constructor` or `toString` would otherwise answer `true` to `levels[id]` for a level that is not in
 * the file at all. A prototype-less object has no such answers to give.
 */
export function emptyProgress(): SaveData {
  return { version: PROGRESS_VERSION, lastLevel: null, levels: Object.create(null) as Record<string, LevelProgress> };
}

/**
 * The save that could not be persisted, held for the rest of the session.
 *
 * 🔴 Without this, a refused or full `localStorage` **silently regresses the player**. Nothing in this
 * game caches the save: `gameLevelPick.pickLevel`, `gameComplete.onLevelCompleted` and
 * `LevelSelectScene.create` each re-read storage. So when `setItem` throws, finishing level-01 shows a
 * panel reading `ENTER — level-02`, and ENTER starts `Game` with `levelId: 'level-02'`, and
 * `resolveEntryLevel` finds level-02 still locked in the storage it re-reads and hands back level-01.
 * Forever. The old comment in `writeProgress` claimed "progress still applies for this session" — it
 * did not, and a comment that is wrong is worse than no comment at all *(vault C9)*.
 *
 * One module-level fallback rather than a cache threaded through three call sites: it is the single
 * seam every reader already passes through, and it engages only on the failure path.
 *
 * ⚠️ Once a write has failed, storage is known-broken and this wins over it outright. Reconciling with
 * another tab is not a question worth asking about an origin that refuses writes.
 */
let unwritten: SaveData | null = null;

/** A deep-enough copy: callers mutate what `readProgress` hands them (`recordCompletion` does). */
function cloneSave(save: SaveData): SaveData {
  const copy = emptyProgress();
  copy.lastLevel = save.lastLevel;
  for (const [id, entry] of Object.entries(save.levels)) {
    copy.levels[id] = { completed: entry.completed, bestGears: entry.bestGears };
  }
  return copy;
}

/**
 * Forget the unwritten save. **Tests only** — a suite that makes one write fail would otherwise poison
 * every later test in the file, and module state that only a failure path sets has no other way out.
 */
export function resetProgressCache(): void {
  unwritten = null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A gear count that can be stored: a non-negative whole number. */
function isUsableGears(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

/**
 * Validate one `levels` entry, field by field. `null` for anything that does not fit.
 *
 * Both fields are required rather than defaulted. A `{ bestGears: 3 }` with no `completed` is not a
 * half-valid record to be filled in — it is a file this code did not write, and guessing the missing
 * half is exactly the "coerce it into shape" move the header rejects.
 */
function readEntry(value: unknown): LevelProgress | null {
  if (!isPlainObject(value)) return null;
  const { completed, bestGears } = value;
  if (typeof completed !== 'boolean') return null;
  if (!isUsableGears(bestGears)) return null;
  return { completed, bestGears };
}

/**
 * Read the save. Returns usable data for every input, and never throws.
 *
 * @param storage typically `safeLocalStorage()`; a fake in tests; `null` where storage is refused.
 */
export function readProgress(storage: SettingsStorage | null): SaveData {
  // The failure path first — see `unwritten`. A copy, because the caller mutates what it gets.
  if (unwritten !== null) return cloneSave(unwritten);

  let stored: unknown;
  try {
    const raw = storage?.getItem(PROGRESS_KEY) ?? null;
    if (raw === null) return emptyProgress();
    stored = JSON.parse(raw);
  } catch {
    // Either the origin refuses storage or the value is not JSON. Neither is worth a boot failure.
    return emptyProgress();
  }

  if (!isPlainObject(stored)) return emptyProgress();
  // A version this build does not understand is not partially trusted. Reading `levels` out of a
  // future schema would be guessing at a layout that has not been designed.
  if (stored.version !== PROGRESS_VERSION) return emptyProgress();

  const save = emptyProgress();
  if (typeof stored.lastLevel === 'string') save.lastLevel = stored.lastLevel;

  if (isPlainObject(stored.levels)) {
    for (const [id, value] of Object.entries(stored.levels)) {
      const entry = readEntry(value);
      // Dropped, not repaired. Absence reads as `completed: false`, so a corrupt entry costs the
      // player that level's unlock and costs the levels beside it nothing.
      if (entry !== null) save.levels[id] = entry;
    }
  }

  return save;
}

/** Persist the save. Never throws — a full quota is not a crash. */
export function writeProgress(storage: SettingsStorage | null, save: SaveData): void {
  // ⚠️ A `null` storage is the same failure as a throwing one, and `storage?.setItem` would have
  // short-circuited into the success path. `safeLocalStorage()` returns `null` on a blocked origin,
  // so this is the case where the whole game runs with no disk at all — and it must still advance
  // past level-01.
  if (storage === null) {
    unwritten = cloneSave(save);
    return;
  }
  try {
    // Re-serialised field by field rather than stringifying `save` directly, so a caller that hung an
    // extra field on the object does not quietly widen the stored schema.
    const levels: Record<string, LevelProgress> = {};
    for (const [id, entry] of Object.entries(save.levels)) {
      levels[id] = { completed: entry.completed, bestGears: entry.bestGears };
    }
    storage?.setItem(
      PROGRESS_KEY,
      JSON.stringify({ version: PROGRESS_VERSION, lastLevel: save.lastLevel, levels }),
    );
    // It landed, so storage is authoritative again and any earlier fallback is stale.
    unwritten = null;
  } catch {
    // Quota, private mode, a disabled origin. Hold it in memory so progress really does apply for the
    // rest of the session — it just will not survive a reload. See `unwritten`: the version of this
    // comment that made that claim without the fallback behind it was false, and the player was sent
    // back to level-01 every time they finished one.
    unwritten = cloneSave(save);
  }
}

/**
 * The completed level ids, as the set `src/sim/progress.ts` wants.
 *
 * The conversion lives here rather than there because it is the only place the save *schema* and the
 * unlock *rule* meet, and `progress.ts` stays free of both storage and this file's shape.
 */
export function completedIds(save: SaveData): Set<string> {
  const done = new Set<string>();
  for (const [id, entry] of Object.entries(save.levels)) {
    if (entry.completed) done.add(id);
  }
  return done;
}

/**
 * The best gear count to *show* for a level, clamped to what the level currently holds.
 *
 * See the header: the stored number outlives the level it describes, and re-authoring a level with
 * fewer gears must not produce "9 / 5". Clamped on the way out, never on the way in, because a level
 * that grows back should show the score the player actually earned.
 */
export function bestGears(save: SaveData, levelId: string, gearsInLevel: number): number {
  const stored = save.levels[levelId]?.bestGears ?? 0;
  return Math.min(stored, Math.max(0, gearsInLevel));
}

/**
 * Record a finished run. Mutates and returns `save`, so the caller can hand it straight to
 * `writeProgress`.
 *
 * `bestGears` is **monotonic**: a replay that collects fewer gears does not lower the record, which is
 * what makes it a *best* rather than a *latest*. It is also clamped to `gearsInLevel` on the way in as
 * well as out, so a caller that miscounts cannot store an impossible number in the first place.
 *
 * `completed` is only ever set to `true` here. There is no path that un-completes a level, and adding
 * one would mean a player could lose an unlock by replaying a level badly.
 */
export function recordCompletion(
  save: SaveData,
  levelId: string,
  gearsCollected: number,
  gearsInLevel: number,
): SaveData {
  const earned = Math.min(Math.max(0, Math.floor(gearsCollected)), Math.max(0, gearsInLevel));
  const previous = save.levels[levelId];
  save.levels[levelId] = {
    completed: true,
    bestGears: Math.max(previous?.bestGears ?? 0, earned),
  };
  save.lastLevel = levelId;
  return save;
}
