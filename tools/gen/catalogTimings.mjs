/**
 * Enemy sheet timing -> catalog provenance, for `build-assets.mjs`'s catalog rows.
 *
 * **`tools/gen/*.mjs` cannot import TypeScript anywhere in this repo** (`tools/gen` is outside
 * tsconfig's include). `tools/gen/reachGate.mjs` hit this exact wall for `PLAY_LAG_TICKS` and solved
 * it by MIRRORING the constant and pinning the mirror equal to the real TS export with a dedicated
 * test — this module follows the same pattern rather than inventing a third approach.
 * `tests/unit/catalog-timings.test.ts` pins every constant below equal to its real export in
 * `src/render/animTiming.ts`, `src/sim/combat.ts` and `src/render/enemyView.ts`.
 *
 * `fps` is DERIVED, never authored (vault 4.22): `deriveFps` mirrors
 * `src/render/animTiming.ts`'s function of the same name and the same test pins the two equal.
 */

/** Simulation rate. Mirrors `TICK_HZ` (`src/game/constants.ts`). */
export const TICK_HZ = 60;

/** Mirrors `IDLE_TICKS` (`src/render/animTiming.ts`) — the authored breathing cycle. */
export const IDLE_TICKS = 90;

/** Mirrors `DEATH_TICKS` (`src/sim/combat.ts`). */
export const DEATH_TICKS = 45;

/** Mirrors `SENTRY_FIRE_TICKS` (`src/render/enemyView.ts`). */
export const SENTRY_FIRE_TICKS = 18;

/**
 * Fixed (non-measured) timing rows, by slug and action. `walk`/`chase` (rust-scavenger) are
 * deliberately absent: those are 'measured' provenance in `src/render/animTiming.ts`'s
 * `enemyAnimTimings` (`strideTicks(stride, patrolSpeed|chaseSpeed)`), and no clip exists yet to
 * measure a stride off — see `character-bounds-rust-scavenger.json`'s `_stride` note. Adding them
 * here needs the stride measurement wired up first, not a guessed number.
 */
const FIXED_TIMINGS = {
  'brass-sentry': {
    idle: { simTicks: IDLE_TICKS, loop: true, derivedFrom: 'authored' },
    fire: { simTicks: SENTRY_FIRE_TICKS, loop: false, derivedFrom: 'sim' },
    death: { simTicks: DEATH_TICKS, loop: false, derivedFrom: 'sim' },
  },
  'rust-scavenger': {
    death: { simTicks: DEATH_TICKS, loop: false, derivedFrom: 'sim' },
  },
};

/** `(slug, action)` -> `{ simTicks, loop, derivedFrom }`. Throws rather than guessing a timing. */
export function timingFor(slug, action) {
  const entry = FIXED_TIMINGS[slug]?.[action];
  if (!entry) {
    throw new Error(
      `catalogTimings: no fixed timing for "${slug}/${action}". If this is a 'measured' ` +
        `locomotion row (walk/chase), it needs a stride measurement wired up first — see this ` +
        `module's header.`,
    );
  }
  return entry;
}

/** `renderFrames * TICK_HZ / simTicks`. Mirrors `deriveFps` in `src/render/animTiming.ts`. */
export function deriveFps(renderFrames, simTicks) {
  if (!Number.isInteger(renderFrames) || renderFrames < 1) {
    throw new Error(`deriveFps: renderFrames must be a positive integer, got ${renderFrames}`);
  }
  if (!Number.isInteger(simTicks) || simTicks < 1) {
    throw new Error(`deriveFps: simTicks must be a positive integer, got ${simTicks}`);
  }
  return (renderFrames * TICK_HZ) / simTicks;
}

/** Slugs `timingFor` can resolve every declared action for. `brass-courier`'s rows predate this
 *  module and are out of scope here — see this module's header. */
export const CATALOG_TIMING_SLUGS = new Set(Object.keys(FIXED_TIMINGS));

/**
 * One `public/assets/index.json` `sheets` row (see `src/game/assetCatalog.ts`'s `SheetEntry`),
 * built from what `build-assets.mjs` measured off the packed strip plus the timing this module
 * mirrors. The single place a catalog row is assembled, so a sheet cannot acquire a hand-typed
 * `fps` or `simTicks` on its way into the catalog.
 */
export function catalogRowFor(slug, action, sheet) {
  const { simTicks, loop, derivedFrom } = timingFor(slug, action);
  return {
    key: `${slug}-${action}`,
    url: sheet.url,
    frameWidth: sheet.frameWidth,
    frameHeight: sheet.frameHeight,
    frameCount: sheet.frameCount,
    simTicks,
    fps: deriveFps(sheet.frameCount, simTicks),
    loop,
    derivedFrom,
  };
}
