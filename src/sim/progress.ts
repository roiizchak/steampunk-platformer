/**
 * Which levels are unlocked, and which one the game boots into. Phase 8, criterion 8.3.
 *
 * Pure and storage-free by the same rule the rest of `src/sim/` follows: no `localStorage`, no
 * Phaser, no clock. `src/game/save.ts` owns the bytes; this owns the *meaning* of them. That split is
 * what makes the unlock rule a millisecond unit test instead of a browser round trip — and it is why
 * a corrupt save cannot reach the unlock logic as anything other than "not completed".
 *
 * ## The order comes from the caller, never from the id
 *
 * Nothing here parses `'level-03'` into the number 3. The sequence is the array the catalog publishes,
 * so a reordered `index.json` reorders progression with no code change, and an id that is not in the
 * catalog has no position at all — which is exactly the property `resolveEntryLevel` leans on.
 * *(vault 3.3: behaviour from data, never from a name.)*
 *
 * ## 🔴 Why `resolveEntryLevel` exists
 *
 * `lastLevel` is the one input to the boot path that a **user can edit by hand** and that survives a
 * deploy. Two ways that ends badly, both of them silent:
 *
 * - `lastLevel: 'level-09'` — no catalog entry, so `loadLevel` throws inside `GameScene.create()`,
 *   which leaves `ready:false` with `bootError:null`. That is the indistinguishable hang state
 *   `refuseToRoute` was written to prevent, and `audioSettings.ts`'s header says the same thing about
 *   the same storage.
 * - `{ lastLevel: 'level-05', levels: {} }` — a perfectly well-formed save that boots straight into
 *   the last level with nothing completed. Not a crash; just the whole progression skipped.
 *
 * So the function is **total**: it never throws, and it never returns an id that is not in `order`.
 * Every rejected value falls back one step, and the last step is the first level.
 */

/**
 * The ids of the levels the player has finished.
 *
 * A `Set` rather than the save file's `Record`, for two reasons. It keeps this module ignorant of the
 * save schema — `bestGears` is not an unlock input and should not be visible here. And a `Record`
 * reached with `completed[id]` answers for `'__proto__'`, `'constructor'` and `'toString'` on an
 * object literal, so a hand-edited save naming one of them would read as completed. `Set.has` does
 * not have that hole.
 */
export type CompletedLevels = ReadonlySet<string>;

/**
 * The level after `id`, or `null` at the end of the run.
 *
 * `null` is the signal `gameComplete.ts` routes to the level-select screen on, so "the game is
 * finished" is a value rather than an out-of-range index nobody checks.
 */
export function nextLevelId(id: string, order: readonly string[]): string | null {
  const at = order.indexOf(id);
  if (at < 0) return null;
  return order[at + 1] ?? null;
}

/**
 * Is `id` playable?
 *
 * The first level always is — otherwise a fresh save has nothing to open and the game is unplayable
 * out of the box. Every other level needs the one **before it in `order`** completed, not merely some
 * level completed: with `levels: { 'level-05': ... }` hand-written into the save, an "any completion
 * unlocks the next" rule would open level-02 through level-06 at once.
 *
 * An id absent from `order` is never unlocked. That is the load-bearing half — `resolveEntryLevel`
 * gets its "not in the catalog" rejection from this one line, so the two rules cannot disagree.
 */
export function isUnlocked(id: string, completed: CompletedLevels, order: readonly string[]): boolean {
  const at = order.indexOf(id);
  if (at < 0) return false;
  if (at === 0) return true;
  return completed.has(order[at - 1]!);
}

/**
 * Every playable level, in catalog order.
 *
 * Built by filtering `order` rather than by walking forward until a gap, so a save with a hole in it
 * (`level-01` and `level-03` completed, `level-02` not — reachable by hand-editing) reports exactly
 * the levels the rule allows instead of stopping at the hole. The lock screen and the unlock gate
 * therefore agree by construction.
 */
export function unlockedIds(completed: CompletedLevels, order: readonly string[]): string[] {
  return order.filter((id) => isUnlocked(id, completed, order));
}

/**
 * Decide which level to boot into. Total: never throws, never returns an id outside `order`.
 *
 * Three tiers, each tested the same two ways — **in the catalog** and **unlocked**:
 *
 * 1. `requested` — an explicit choice, from the level-select screen or from `startDevScene`.
 * 2. `saved` — `lastLevel` off the save file. Untrusted; see this file's header.
 * 3. `order[0]` — the first level, which `isUnlocked` guarantees is always playable.
 *
 * Returns `null` only for an empty `order`, which means the catalog published no levels at all. That
 * is not something to paper over with a made-up id: `bootLevels.ts` refuses to route on it, and a
 * `null` here keeps the "there is nothing to play" case visible in the type instead of turning into a
 * `loadLevel('undefined')` failure three frames later.
 *
 * ⚠️ Note what is deliberately *not* here: no "highest unlocked level" search. Resuming means the
 * level you were last on, and inferring it from the completion set would send a player who quit
 * halfway through level-03 back to level-04 — a level they have not seen — because level-02 was the
 * last thing they finished.
 */
export function resolveEntryLevel(
  requested: string | null | undefined,
  saved: string | null | undefined,
  order: readonly string[],
  completed: CompletedLevels,
): string | null {
  for (const candidate of [requested, saved]) {
    if (typeof candidate === 'string' && isUnlocked(candidate, completed, order)) {
      return candidate;
    }
  }
  return order[0] ?? null;
}
