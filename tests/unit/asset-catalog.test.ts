/**
 * The catalog's recorded timings must equal the ones the simulation derives — criterion 4.7,
 * vault **4.22**.
 *
 * `public/assets/index.json` carries `fps` and `simTicks` per sheet, and its own `_sheets` note
 * says they are *recorded, not authoritative*: `src/render/animTiming.ts` derives them from the
 * live sim, and `GameScene.registerAnimations` hands Phaser the derived value, not the catalog's.
 * So the catalog number is documentation — and documentation that nothing compares is a number
 * that drifts silently.
 *
 * It drifted the first time it could. The Phase 4 scale change moved `stridePxPerCycle` x3 and
 * re-tuned `walkMax`/`runMax`, which changes `simTicks = round(stride / speed)` for both
 * locomotion clips. The catalog kept the old 19 and 15 while the game played 50 and 39. Nothing
 * was red: the game looked right, because the game does not read these fields.
 *
 * **Why it matters that they agree at all**, given the game ignores them: `simTicks` is what makes
 * the frame rate DERIVED rather than authored, and foot-slide is the observable defect when it is
 * wrong. A catalog claiming a different number is a claim that the art was cut for a different
 * speed — and it is the number a human reads when deciding whether a sheet needs regenerating.
 *
 * Every input here is read off a SHIPPED file. Retyping the strides or the frame counts would make
 * this a test of my arithmetic instead of a test of the pipeline.
 */

import { describe, expect, it } from 'vitest';
import { animTimings, type AnimName } from '../../src/render/animTiming';
import { derivedFeel } from '../../src/sim/derived';
import { ticksToMs } from '../../src/sim/index';
import { DEFAULT_TUNING } from '../../src/sim/player';

const CATALOG = import.meta.glob('../../public/assets/index.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BOUNDS = import.meta.glob('../../public/assets/config/character-bounds.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * EVERY slug's bounds file, not just the player's — because the frame cell is **per slug** as of
 * session 7's amendment to decision M3, and the courier's file can no longer answer for a sheet it
 * does not describe.
 *
 * The frame-size assertion below used to compare every row in the catalog — including enemy rows —
 * against the single courier bounds file. That held only while all three slugs happened to share one
 * global width, and it is the same latent single-slug assumption as R1/R2 and the
 * `shipped-sheets.test.ts` path bug: correct by coincidence, silent when the coincidence ends.
 *
 * Scoping the loop to courier rows would have made it pass again by **checking less**, which is the
 * forbidden move. Resolving each row against its OWN slug checks strictly more: it still catches
 * everything the old form caught, and it additionally catches a row whose width disagrees with the
 * file that actually cut it.
 */
const ALL_BOUNDS = import.meta.glob('../../public/assets/config/character-bounds*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface SheetRow {
  key: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  simTicks: number;
  loop: boolean;
  derivedFrom: string;
}

function only<T>(files: Record<string, string>, what: string): T {
  const paths = Object.keys(files);
  if (paths.length !== 1) {
    throw new Error(
      `asset-catalog: expected exactly one ${what}, found ${paths.length}. A glob that matches ` +
        `nothing makes every assertion below pass by running against an empty list.`,
    );
  }
  return JSON.parse(files[paths[0]!]!) as T;
}

const catalog = only<{ sheets: SheetRow[] }>(CATALOG, 'catalog');
const bounds = only<{
  slug: string;
  renderHeightPx: number;
  frameWidth: number;
  frameHeight: number;
  stridePxPerCycle: { walk: number; run: number };
}>(BOUNDS, 'character-bounds file');

/**
 * slug → its own declared cell. Keyed off each file's `slug` FIELD rather than its filename, so a
 * file renamed or a slug retyped shows up as a missing key instead of a silent mismatch.
 */
const boundsBySlug = new Map<string, { frameWidth: number; frameHeight: number }>(
  Object.values(ALL_BOUNDS).map((raw) => {
    const b = JSON.parse(raw) as { slug: string; frameWidth: number; frameHeight: number };
    return [b.slug, { frameWidth: b.frameWidth, frameHeight: b.frameHeight }];
  }),
);

/**
 * `animTimings` builds ONE table — the PLAYER's (`bounds.slug`, e.g. `brass-courier`) — so every
 * comparison against it must be scoped to that slug's rows only. `public/assets/index.json` now
 * also carries enemy sheets (`brass-sentry-idle` and onward); an enemy key sliced against
 * `bounds.slug`'s prefix is not even a valid `AnimName`, so it must never reach `catalogFrames`.
 */
const courierSheets = catalog.sheets.filter((s) => s.key.startsWith(`${bounds.slug}-`));

/** `brass-courier-walk` -> `walk`. The catalog key carries the slug; the timing table does not. */
function animOf(key: string): AnimName {
  return key.slice(`${bounds.slug}-`.length) as AnimName;
}

const catalogFrames = new Map<string, number>(
  courierSheets.map((s) => [animOf(s.key), s.frameCount]),
);

/**
 * Animations the timing table knows about but no sheet exists for yet.
 *
 * Phase 5 adds `attack`, `hurt` and `death` to the table when it builds the combat sim, and
 * generates their art later in the same phase — so between those two points the table legitimately
 * describes more animations than the catalog ships. **That gap is asserted rather than hidden**:
 * the list below must be empty by the end of Phase 5, and the test that reads it says so.
 *
 * The previous version cast a partial map with `as Record<AnimName, number>`, which turned a
 * missing sheet into `deriveFps(undefined, …)` and a thrown error deep inside the table — an
 * unhelpful failure for a legitimate intermediate state.
 */
// `hurt` LANDED in session 6 — it extracted clean from the existing unpadded clip and needed no
// purchase at all, which only a per-action sweep found. `attack` and `death` remain pending: their
// session-6 rounds were shot from the PADDED courier anchor and pack at 114 px against hurt's
// 288 px, because `scale` is per-slug and was derived from an unpadded clip. Both are being
// re-shot unpadded at 9:16, the courier anchor's matched ratio.
const PENDING_ART: readonly AnimName[] = ['attack', 'death'];

const derived = animTimings(
  derivedFeel(DEFAULT_TUNING, ticksToMs),
  // Frame counts come from the CATALOG rather than being retyped, so this compares the catalog's
  // timings against the sim for the sheets the catalog actually claims to have. Pending rows get a
  // placeholder purely so the table can be built; nothing below compares them.
  Object.fromEntries([
    ...catalogFrames.entries(),
    ...PENDING_ART.map((name) => [name, 1] as const),
  ]) as Record<AnimName, number>,
  bounds.stridePxPerCycle,
);

describe('the catalog records the timings the simulation derives (criterion 4.7, vault 4.22)', () => {
  it('found a non-empty catalog and a bounds file', () => {
    expect(catalog.sheets.length).toBeGreaterThan(0);
    // `derived` is the PLAYER's table only (see `courierSheets` above) — every derived row is
    // either shipped for the player's slug or explicitly pending, no third category, so a player
    // row cannot go missing from the catalog by being quietly forgotten. An enemy sheet (e.g.
    // `brass-sentry-idle`) is neither: it is out of scope for this count on purpose.
    expect(derived.length).toBe(courierSheets.length + PENDING_ART.length);
  });

  /**
   * **The Phase 5 completion gate for art.** `PENDING_ART` is the list of animations the sim needs
   * and the catalog does not yet ship. It must be empty before Phase 5 can be reported done — and
   * this test is what makes "we forgot to generate the hurt sheet" a red suite rather than a black
   * sprite discovered in a playtest.
   */
  it('names exactly which sheets are still awaiting art', () => {
    for (const name of PENDING_ART) {
      expect(catalogFrames.has(name), `${name} is in PENDING_ART but the catalog ships it — remove it from the list`).toBe(false);
    }
    for (const [name] of catalogFrames) {
      expect(PENDING_ART).not.toContain(name);
    }
  });

  it.each(['walk', 'run', 'jump', 'fall', 'idle'])('%s agrees on simTicks, fps and loop', (name) => {
    const row = courierSheets.find((s) => animOf(s.key) === name);
    const want = derived.find((d) => d.name === name);
    expect(row, `no catalog entry for ${name}`).toBeDefined();
    expect(want, `no derived timing for ${name}`).toBeDefined();

    expect(row!.simTicks, `${name} simTicks`).toBe(want!.simTicks);
    expect(row!.fps, `${name} fps`).toBeCloseTo(want!.fps, 6);
    expect(row!.loop, `${name} loop`).toBe(want!.loop);
    expect(row!.derivedFrom, `${name} provenance`).toBe(want!.derivedFrom);
  });

  it('fps is the derived quotient, never a hand-picked round number', () => {
    // `fps = renderFrames * TICK_HZ / simTicks`. Asserting the identity separately means a catalog
    // that happened to match a stale derivation still fails, and it names WHY.
    for (const row of catalog.sheets) {
      expect(row.fps, `${row.key} fps must equal ${row.frameCount} * 60 / ${row.simTicks}`)
        .toBeCloseTo((row.frameCount * 60) / row.simTicks, 6);
    }
  });

  it('every sheet declares the frame size ITS OWN slug bounds file cut it at', () => {
    // A sheet loaded with the wrong frameWidth registers a texture with correct DIMENSIONS and the
    // wrong number of frames — the single most likely way this phase ships something subtly wrong.
    // `BootScene.verifySheets` catches it at runtime; this catches it before the browser is opened.
    //
    // Per slug since session 7: `rust-scavenger` is cut at 512 for its death debris while the
    // courier and sentry stay at 288, so "every row matches the courier" is no longer the question.
    expect(boundsBySlug.size, 'slug bounds files found').toBeGreaterThan(1);

    for (const row of catalog.sheets) {
      const slug = [...boundsBySlug.keys()].find((s) => row.key.startsWith(`${s}-`));
      // An unresolvable row is a FAILURE, not a skip — silently passing over a row nobody owns is
      // how a sheet would escape this assertion entirely.
      expect(slug, `${row.key} resolves to a known slug`).toBeDefined();
      const own = boundsBySlug.get(slug!)!;
      expect(row.frameWidth, `${row.key} frameWidth vs ${slug}`).toBe(own.frameWidth);
      expect(row.frameHeight, `${row.key} frameHeight vs ${slug}`).toBe(own.frameHeight);
    }
  });

  it('idle is the only authored timing, for every slug — and says so', () => {
    // Vault 4.22 is satisfied for every non-idle clip and deliberately NOT for idle — no sim window
    // governs a breathing loop, for the player OR an enemy. The player's exception is recorded in
    // docs/qa/phase-04-art.md per C11; `brass-sentry-idle`'s matching one (its simTicks is also
    // `IDLE_TICKS`, src/render/animTiming.ts) is recorded in docs/qa/phase-05-combat.md's timing
    // table. `-idle` suffix rather than an exact key list is what lets a second slug's authored idle
    // stay legitimate here without this test losing the ability to catch a non-idle clip acquiring
    // an authored fps.
    const authored = catalog.sheets.filter((s) => s.derivedFrom === 'authored').map((s) => s.key);
    expect(authored.length).toBeGreaterThan(0);
    for (const key of authored) {
      expect(key.endsWith('-idle'), `${key} is authored but is not an idle animation`).toBe(true);
    }
    expect(authored, `the player's own idle (${bounds.slug}-idle) must be among the authored rows`).toContain(
      `${bounds.slug}-idle`,
    );
  });
});
