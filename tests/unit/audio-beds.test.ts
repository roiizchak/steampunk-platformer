import { describe, expect, it } from 'vitest';
import { BED_KEYS, bedsMissing, bedsToStart } from '../../src/game/audioBeds';

/**
 * # The looping beds survive a level boundary (session inventory 1b.2)
 *
 * `GameScene.create()` calls `createAudio`, which destroyed its predecessor and started both beds
 * from zero — so **music and ambience cut back to bar 1 at every level transition.**
 * `docs/qa/phase-07-audio-02-gate-owners.md:78` recorded it as harmless because *"no level
 * transition exists yet; it becomes real in Phase 8"*, and **Phase 8 shipped five levels and
 * transitions**. The reason expired by its own terms and nobody re-read it.
 *
 * ## Why the rule lives in a module of its own
 *
 * `audio.ts` imports `Phaser` as a **value**, so no unit test can import it without breaking
 * `npm run test:sim-isolated`, which runs the unit suite with Phaser uninstalled. That is why
 * `createAudio` had **no unit test at all** before this file — the only place in `tests/` that named
 * it was `file-size.test.ts`, counting its lines.
 *
 * So the decision moved to `audioBeds.ts`, pure, and the Phaser-touching code only applies it —
 * `src/render/`'s pattern *(vault 2.12)*, one layer over.
 *
 * ## The constraint that shapes the fix
 *
 * Criterion **7.5** counts `sound.sounds`, and vault 7.5 names the failure exactly: *"a stopped
 * track is still in `sound.sounds`, so a scene round-trip that stops and re-adds grows the list
 * every time."* **Beds accumulating is a worse bug than beds restarting**, so "just don't tear them
 * down" is not the fix — "start only what is not already playing" is, which keeps the live set at
 * one of each while letting a bed outlive the manager that created it.
 */

describe('bedsToStart — which beds a new manager should start (inventory 1b.2)', () => {
  const allCatalogued = (): boolean => true;

  it('starts both beds on a fresh boot, in declaration order', () => {
    expect(bedsToStart(allCatalogued, [])).toEqual([...BED_KEYS]);
  });

  it('starts NOTHING when both are already looping — the level-boundary case', () => {
    // The whole defect in one assertion. Before this, a level transition returned both keys and the
    // music restarted.
    expect(bedsToStart(allCatalogued, [...BED_KEYS])).toEqual([]);
  });

  it('starts only the one that stopped, not both', () => {
    // A bed whose loop was somehow lost is restarted without disturbing the one still running. A
    // fix that returned `[]` whenever ANY bed was playing would pass the test above and leave
    // ambience silent for the rest of the session.
    expect(bedsToStart(allCatalogued, ['bed-music'])).toEqual(['bed-ambience']);
    expect(bedsToStart(allCatalogued, ['bed-ambience'])).toEqual(['bed-music']);
  });

  it('never starts a bed the cache does not hold', () => {
    const onlyMusic = (key: string): boolean => key === 'bed-music';
    expect(bedsToStart(onlyMusic, [])).toEqual(['bed-music']);
    expect(bedsMissing(onlyMusic)).toEqual(['bed-ambience']);
    expect(bedsMissing(allCatalogued)).toEqual([]);
  });

  it('ignores keys that are not beds — a stray playing cue cannot suppress a bed', () => {
    // `playCues` fires and forgets, so `sound.sounds` carries footsteps and jumps. If the "already
    // playing" set were matched loosely, a jump cue could stop the music ever starting.
    expect(bedsToStart(allCatalogued, ['sfx-jump', 'sfx-footstep'])).toEqual([...BED_KEYS]);
  });

  it('declares exactly the two beds, so a third cannot be added without a decision', () => {
    // `BED_KEYS` moved here from `audio.ts` so the rule and its subject live together *(vault 5.3)*.
    // Two lists of bed keys would agree until the day someone adds a third.
    expect([...BED_KEYS]).toEqual(['bed-music', 'bed-ambience']);
  });
});

/**
 * The draw-path gate. CLAUDE.md §2: *"a decision function with no consumer is the same defect as a
 * burst of zero particles — it satisfies every assertion about itself and draws nothing."* Phase 9
 * shipped 221 source lines and a 306-line test file with **zero** production consumers.
 *
 * Source text rather than behaviour, and the reason is the same one that put the decision in its own
 * module: `audio.ts` cannot be imported here at all. This is the weaker of the two shapes CLAUDE.md
 * allows and it is the only one reachable — recorded rather than glossed.
 */
describe('the decision has a consumer (CLAUDE.md §2 draw-path gate)', () => {
  // `?raw` through the bundler, not `node:fs` — `@types/node` is not a dependency and CLAUDE.md
  // records that Phase 1 needed it twice and solved it without adding it. Same pattern as
  // `dev-guard-census.test.ts`.
  //
  // ⚠️ vitest caches `?raw` glob results, so touch this file as well as `audio.ts` when re-running
  // after an edit — a landed change has already reported green that way once in this project.
  const sources = import.meta.glob('../../src/game/audio.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;
  const source = Object.values(sources)[0] ?? '';

  it('the source was actually read — an empty glob would make every assertion below vacuous', () => {
    expect(source.length).toBeGreaterThan(1000);
  });

  it('audio.ts imports the decision and calls both halves', () => {
    expect(source).toContain("from './audioBeds'");
    expect(source, 'nothing decides which beds to start').toContain('bedsToStart(');
    expect(source, 'a missing bed would no longer be reported').toContain('bedsMissing(');
  });

  it('audio.ts no longer holds a second list of bed keys', () => {
    // The duplicate this replaced. A local `BED_KEYS` here would be a second definition that agrees
    // until it does not *(vault 5.3)*.
    expect(source).not.toContain("const BED_KEYS = [");
  });

  it('the beds outlive a manager swap — they are module-scope, not per-manager', () => {
    // `liveBeds` is what makes adoption possible at all. A refactor that moved it back inside
    // `createAudio` would restore the defect while every assertion above stayed green.
    expect(source, 'the beds went back inside createAudio, so a swap restarts them').toContain(
      'const liveBeds',
    );
    expect(source, 'createAudio destroys its predecessor again instead of retiring it').toContain(
      'retireCurrent()',
    );
  });
});
