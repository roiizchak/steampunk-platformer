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

/** Mirrors `attackTotalTicks(ATTACK)` (`src/sim/combat.ts`) — startup 6 + active 4 + recovery 10. */
export const ATTACK_TOTAL_TICKS = 20;

/** Mirrors `HURT_TICKS` (`src/sim/combat.ts`). */
export const HURT_TICKS = 18;

/** Mirrors `SCAVENGER.patrolSpeed` (`src/sim/enemyScavenger.ts`), px/tick. */
export const SCAVENGER_PATROL_SPEED = 2.5;

/** Mirrors `SCAVENGER.chaseSpeed` (`src/sim/enemyScavenger.ts`), px/tick. */
export const SCAVENGER_CHASE_SPEED = 8;

/**
 * Ticks one locomotion cycle occupies, from the art's stride and the sim's speed. Mirrors
 * `strideTicks` (`src/render/animTiming.ts`) — rounded to an integer, never the raw quotient, for
 * the same reason as the original: every duration here is an integer tick count.
 */
export function strideTicks(stridePx, speedPxPerTick) {
  if (!(stridePx > 0) || !Number.isFinite(stridePx)) {
    throw new Error(`strideTicks: stridePx must be a finite number > 0, got ${stridePx}`);
  }
  if (!(speedPxPerTick > 0) || !Number.isFinite(speedPxPerTick)) {
    throw new Error(`strideTicks: speed must be a finite number > 0, got ${speedPxPerTick}`);
  }
  return Math.max(1, Math.round(stridePx / speedPxPerTick));
}

/**
 * Fixed (non-measured) timing rows, by slug and action. Only the actions THIS PHASE packs a
 * catalog row for — `idle/walk/run/jump/fall` already have Phase-4 rows and are out of scope here.
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
  'brass-courier': {
    attack: { simTicks: ATTACK_TOTAL_TICKS, loop: false, derivedFrom: 'sim' },
    hurt: { simTicks: HURT_TICKS, loop: false, derivedFrom: 'sim' },
    death: { simTicks: DEATH_TICKS, loop: false, derivedFrom: 'sim' },
  },
};

/**
 * 🔴 **Looping locomotion rows, whose cadence is AUTHORED (session 9).**
 *
 * These used to be "measured": `simTicks = round(stridePxPerCycle / speed)`. That made a number
 * nobody can measure load-bearing, and it shipped as visible foot-slide — the user's report was
 * "moves too fast, like a ghost", and the planted foot was slipping 17 % of every step on the
 * player's run. Four independent methods put the true strides 20 % apart, which is vault 4.18's
 * INDETERMINATE condition. Full reasoning in `src/render/animTiming.ts`'s header and in
 * `character-bounds.json`'s `_loopFps`.
 *
 * A loop has no simulation window to outrun, which is the same reason `idle` has always been
 * authored. The cadence now comes from `animations.<action>.fps` in the slug's bounds file, set by
 * a human watching the character. **`chase` becomes packable for the first time because of this**:
 * it was blocked for two sessions purely on an unmeasured stride.
 */
const AUTHORED_LOOPS = {
  'brass-courier': ['walk', 'run'],
  'rust-scavenger': ['walk', 'chase'],
};

/**
 * Is `(slug, action)` a pair this module has ANY timing rule for — fixed or measured — regardless
 * of whether `timingFor` can resolve it right now? This is the per-(slug, action) gate
 * `build-assets.mjs` writes a catalog row against, replacing a per-SLUG check that silently
 * skipped `brass-courier`'s combat rows (only some of its actions have timings) and would have
 * thrown PARTWAY through a build that gated on the slug alone.
 */
export function hasCatalogTiming(slug, action) {
  return Boolean(FIXED_TIMINGS[slug]?.[action]) || Boolean(AUTHORED_LOOPS[slug]?.includes(action));
}

/**
 * `(slug, action)` -> `{ simTicks, loop, derivedFrom }`. Throws rather than guessing a timing —
 * including for a known-but-unmeasured MEASURED_TIMINGS pair with no `stridePxPerCycle` in
 * `context`. A guessed stride is the exact failure this module exists to prevent.
 */
export function timingFor(slug, action, context = {}) {
  const fixed = FIXED_TIMINGS[slug]?.[action];
  if (fixed) {
    return fixed;
  }

  if (AUTHORED_LOOPS[slug]?.includes(action)) {
    const { authoredFps, renderFrames } = context;
    if (authoredFps == null) {
      throw new Error(
        `catalogTimings: "${slug}/${action}" is a looping locomotion row and needs an authored ` +
          `cadence — set animations.${action}.fps in character-bounds-${slug}.json. It is a ` +
          `number a human picks by WATCHING the character, not one derived from the art; see this ` +
          `module's AUTHORED_LOOPS note for why that changed.`,
      );
    }
    if (!Number.isInteger(renderFrames) || renderFrames < 1) {
      throw new Error(
        `catalogTimings: "${slug}/${action}" needs its packed frame count to turn an authored ` +
          `cadence into simTicks, got ${renderFrames}.`,
      );
    }
    return { simTicks: cadenceTicks(renderFrames, authoredFps), loop: true, derivedFrom: 'authored' };
  }

  throw new Error(
    `catalogTimings: no fixed timing for "${slug}/${action}". If this is a looping locomotion ` +
      `row (walk/chase), it needs an authored cadence in the slug's bounds file — see this ` +
      `module's header.`,
  );
}

/**
 * Ticks a LOOPING cycle occupies, from an authored cadence. Mirrors `cadenceTicks` in
 * `src/render/animTiming.ts`, and `catalog-timings.test.ts` pins the two equal.
 */
export function cadenceTicks(renderFrames, authoredFps) {
  if (!Number.isInteger(renderFrames) || renderFrames < 1) {
    throw new Error(`cadenceTicks: renderFrames must be a positive integer, got ${renderFrames}`);
  }
  if (!(authoredFps > 0) || !Number.isFinite(authoredFps)) {
    throw new Error(`cadenceTicks: authored fps must be a finite number > 0, got ${authoredFps}`);
  }
  return Math.max(1, Math.round((renderFrames * TICK_HZ) / authoredFps));
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

/**
 * One `public/assets/index.json` `sheets` row (see `src/game/assetCatalog.ts`'s `SheetEntry`),
 * built from what `build-assets.mjs` measured off the packed strip plus the timing this module
 * mirrors. The single place a catalog row is assembled, so a sheet cannot acquire a hand-typed
 * `fps` or `simTicks` on its way into the catalog. `context` carries a measured row's stride (see
 * `timingFor`); a fixed row ignores it.
 */
export function catalogRowFor(slug, action, sheet, context = {}) {
  const { simTicks, loop, derivedFrom } = timingFor(slug, action, context);
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
