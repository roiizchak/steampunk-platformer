/**
 * Which looping beds a freshly-created `AudioManager` should START.
 *
 * ## Why this is a separate module, and pure
 *
 * `audio.ts` imports `Phaser` as a **value** (`Phaser.Sound.Events.UNLOCKED`), so nothing in the
 * unit suite can import it without breaking `npm run test:sim-isolated`, which runs with Phaser
 * uninstalled. That is why `createAudio` had **no unit test at all** — the only file in `tests/`
 * that even names it is `file-size.test.ts`.
 *
 * So the decision is pulled out of the Phaser-touching code and the caller only applies the result,
 * which is the same shape `src/render/`'s decision functions use and for the same reason
 * *(vault 2.12)*.
 *
 * ⚠️ **A decision function with no consumer is the same defect as a burst of zero particles**
 * (CLAUDE.md §2). `tests/unit/audio-beds.test.ts` owns the behaviour; the call site in
 * `audio.ts`'s `startBeds` is what makes it real.
 *
 * ## The defect this exists to fix — inventory 1b.2
 *
 * `GameScene.create()` calls `createAudio`, which destroyed its predecessor and started both beds
 * from zero. So **music and ambience cut back to bar 1 at every level boundary.**
 * `docs/qa/phase-07-audio-02-gate-owners.md:78` recorded it as harmless because *"no level
 * transition exists yet; it becomes real in Phase 8"* — and **Phase 8 shipped five levels and
 * transitions.** The reason expired by its own terms and nobody re-read it.
 *
 * ## What must NOT be broken while fixing it
 *
 * Criterion **7.5** counts `sound.sounds` and vault 7.5 names the failure precisely: *"a stopped
 * track is still in `sound.sounds`, so a scene round-trip that stops and re-adds grows the list
 * every time."* Beds accumulating is the bug the teardown exists to prevent, and it is a worse bug
 * than a restart.
 *
 * Hence the shape below: a bed is started only if it is **catalogued and not already playing**. One
 * set of beds exists at any moment, exactly as before — they simply are not torn down and rebuilt
 * for a level change that never left the boot. `destroyAudio`, which `BootScene.init()` calls on
 * every boot, restart and refusal, still removes them for real.
 */

/**
 * The looping tracks, in start order. Moved here from `audio.ts` so the rule and its subject live
 * together *(vault 5.3)* — two lists of bed keys would agree until the day someone adds a third.
 */
export const BED_KEYS = ['bed-music', 'bed-ambience'] as const;

export type BedKey = (typeof BED_KEYS)[number];

/**
 * The beds to start now.
 *
 * @param isCatalogued does the audio cache hold this key? A missing bed is skipped rather than
 *   thrown on — Boot refuses to route on a catalogued asset that did not load, so reaching here with
 *   one missing means the catalog and the cache disagree, which is worth not crashing over and worth
 *   not pretending about either.
 * @param playing keys of beds already looping from a previous manager in this same boot.
 */
export function bedsToStart(
  isCatalogued: (key: string) => boolean,
  playing: readonly string[],
): BedKey[] {
  const live = new Set(playing);
  return BED_KEYS.filter((key) => isCatalogued(key) && !live.has(key));
}

/**
 * The beds that are catalogued but could not be started, so the caller can say so once.
 *
 * Separated from `bedsToStart` because "skipped because it is already playing" and "skipped because
 * it is missing" are different events and only the second is worth a warning. Folding them together
 * is how a level transition would start logging a bed warning on every boundary.
 */
export function bedsMissing(isCatalogued: (key: string) => boolean): BedKey[] {
  return BED_KEYS.filter((key) => !isCatalogued(key));
}
