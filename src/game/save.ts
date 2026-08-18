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
  const onDisk = readFromStorage(storage);
  // 🔴 MERGED with the unwritable save, not replaced by it — see `mergeSaves`.
  return unwritten === null ? onDisk : mergeSaves(onDisk, unwritten);
}

/**
 * Combine what storage holds with what this session could not persist.
 *
 * ⚠️ The draft returned `unwritten` outright, on the reasoning that a storage which refused a write is
 * known-broken and reconciling with another tab is not worth asking about. Codex's implementation
 * review pointed out that this contradicts `gameComplete.onLevelCompleted`'s own comment, which
 * re-reads storage precisely so a level finished in another tab is not rolled back — and a refused
 * write is not proof that storage will refuse the NEXT read: quota can be freed, and a second tab
 * writes through its own successful path.
 *
 * A union is the honest combination because completion only ever accumulates: `recordCompletion` sets
 * `completed` to true and never to false, and `bestGears` is a running maximum. So neither side can
 * hold a value the other should overrule, and taking the better of each loses nothing from either.
 *
 * `lastLevel` is the one field that is an INTENT rather than an achievement, so this session's wins.
 */
function mergeSaves(onDisk: SaveData, memory: SaveData): SaveData {
  const merged = cloneSave(onDisk);
  for (const [id, entry] of Object.entries(memory.levels)) {
    const seen = merged.levels[id];
    merged.levels[id] = {
      completed: entry.completed || (seen?.completed ?? false),
      bestGears: Math.max(entry.bestGears, seen?.bestGears ?? 0),
    };
  }
  merged.lastLevel = memory.lastLevel ?? onDisk.lastLevel;
  return merged;
}

function readFromStorage(storage: SettingsStorage | null): SaveData {
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

/**
 * The entries already on disk that `readProgress` DROPPED, carried through a write untouched.
 *
 * 🔴 Without this, a corrupt entry is not merely ignored — it is **erased**. `readProgress` drops what
 * fails validation, `writeProgress` re-serialises only what survived, and the next write happens on
 * the very next level start (`gameLevelPick`) or completion (`gameComplete`). So one hand-edited
 * `bestGears: 3.5` cost that level's record permanently, three seconds later, silently. The header
 * above said the entry was "dropped" and that it cost "that level's unlock"; it did not say the loss
 * was then made permanent, which made the comment gentler than the code *(vault C9)*. Found by the
 * Phase 8 code-reviewer's adversarial brief, and criterion 8.4's words are **no data loss**.
 *
 * ⚠️ It re-reads storage rather than remembering, because `readProgress` returns the parsed shape and
 * this needs the raw values it could not parse. Nothing here interprets them: an unreadable claim is
 * still not a claim, so a carried-over entry unlocks nothing and shows as locked. It is only kept.
 *
 * There is no path that legitimately removes a level entry — `recordCompletion` only ever adds — so a
 * key on disk that is absent from `save.levels` is exactly a dropped one.
 */
function carriedOver(storage: SettingsStorage, save: SaveData): Record<string, unknown> {
  // `Object.create(null)`, for the reason `emptyProgress` gives: a stored entry named `__proto__` is an
  // OWN property of the parsed object, and copying it into an object literal runs the inherited setter
  // instead of storing it — so it silently vanishes from the write, which is the exact loss this
  // function exists to prevent. Found by Codex's implementation review.
  const kept: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  try {
    const raw = storage.getItem(PROGRESS_KEY);
    if (raw === null) return kept;
    const stored = JSON.parse(raw) as unknown;
    if (!isPlainObject(stored) || !isPlainObject(stored.levels)) return kept;
    /**
     * 🔴 **Only from a save of THIS version**, and this is the line that makes the difference between
     * preserving data and laundering it.
     *
     * `readProgress` refuses a future schema wholesale — it will not guess at a layout that has not
     * been designed. But `carriedOver` runs against the RAW bytes, and without this check a
     * `{"version":2, levels:{"level-04":{completed:true}}}` had every entry copied out and
     * re-stamped as version 1 by the write two lines below, because `save.levels` was empty and so
     * nothing was "already there". One ordinary boot — `pickLevel` writes the resume point — and a
     * save this build refuses to read has become a save it believes, unlocking level-05. Verified by
     * seeding exactly that and reading storage back; found by Codex's implementation review.
     */
    if (stored.version !== PROGRESS_VERSION) return kept;
    for (const [id, value] of Object.entries(stored.levels)) {
      if (!(id in save.levels)) kept[id] = value;
    }
  } catch {
    // Unparseable bytes carry no entries to keep. The write replaces them, which is the only thing a
    // writer can do with a file it cannot read at all.
  }
  return kept;
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
    const levels: Record<string, unknown> = carriedOver(storage, save);
    // (`carriedOver` returns a prototype-less object, so the assignments below cannot hit a setter.)
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
