/**
 * Per-slug build paths and declared actions for `build-assets.mjs`.
 *
 * Extracted so a later task can namespace `build-assets.mjs` for three subjects without pushing it
 * past the 400-line ceiling (`tests/unit/file-size.test.ts`). `motionKeyFor` below is that
 * namespacing: it maps a (slug, action) pair to its `VIDEO_MOTIONS`/clip-filename key, bare for the
 * five legacy `brass-courier` actions and `slug/action` for everything else (work item A-T4, R1/R2).
 *
 * `reportPath` is per-slug on purpose. Today's single shared `_generated/sheet-report.json` means
 * a second slug's build would silently overwrite the first slug's evidence — see the header note
 * on `_generated/sheet-report.json` in `build-assets.mjs`.
 *
 * `brass-sentry`'s `actions` deliberately omits `fire-elevated`: that art has not been bought yet,
 * and `build-assets.mjs` fails the build on a declared-but-missing input rather than substituting
 * one (vault 4.16) — which is exactly why it must stay undeclared until it is bought.
 */

export const SLUGS = ['brass-courier', 'brass-sentry', 'rust-scavenger'];

const GENERATED = '_generated/sheets';

const TABLE = {
  'brass-courier': {
    generated: GENERATED,
    outDir: 'public/assets/characters/brass-courier/sheets',
    config: 'public/assets/config/character-bounds.json',
    liftProfile: 'public/assets/config/lift-profile.json',
    reportPath: '_generated/sheet-report-brass-courier.json',
    actions: ['idle', 'walk', 'run', 'jump', 'fall', 'attack', 'hurt', 'death'],
    looping: new Set(['idle', 'walk', 'run']),
  },
  'brass-sentry': {
    generated: GENERATED,
    outDir: 'public/assets/characters/brass-sentry/sheets',
    config: 'public/assets/config/character-bounds-brass-sentry.json',
    liftProfile: 'public/assets/config/lift-profile-brass-sentry.json',
    reportPath: '_generated/sheet-report-brass-sentry.json',
    actions: ['idle', 'fire', 'death'],
    looping: new Set(['idle']),
  },
  'rust-scavenger': {
    generated: GENERATED,
    outDir: 'public/assets/characters/rust-scavenger/sheets',
    config: 'public/assets/config/character-bounds-rust-scavenger.json',
    liftProfile: 'public/assets/config/lift-profile-rust-scavenger.json',
    reportPath: '_generated/sheet-report-rust-scavenger.json',
    actions: ['walk', 'chase', 'death'],
    looping: new Set(['walk', 'chase']),
  },
};

/** Throws on a slug the table does not carry — never resolved by falling back to a default. */
export function configFor(slug) {
  const entry = TABLE[slug];
  if (!entry) {
    throw new Error(`slugConfig: unknown slug "${slug}". Known slugs: ${SLUGS.join(', ')}`);
  }
  return entry;
}

/** The five legacy actions shot before the `slug/action` naming convention existed (Phase 4). */
const LEGACY_BARE_ACTIONS = new Set(['idle', 'walk', 'run', 'jump', 'fall']);

/**
 * `(slug, action)` -> the matching `VIDEO_MOTIONS` key (`motion.mjs`/`motionCombat.mjs`), which is
 * also the key `clipStem` (`clipJobs.mjs`) turns into the on-disk `-clip.png` stem. `brass-courier`'s
 * five legacy actions map to their own bare key; everything else is namespaced `slug/action` — no
 * exceptions, so a newly declared action never needs a new case here (work item A-T4, R1/R2).
 */
export function motionKeyFor(slug, action) {
  if (slug === 'brass-courier' && LEGACY_BARE_ACTIONS.has(action)) {
    return action;
  }
  return `${slug}/${action}`;
}

/**
 * The ordered `{ slug, action, motionKey }` work list for one slug — what `build-clips.mjs` and
 * `build-assets.mjs` actually iterate, instead of every `VIDEO_MOTIONS` key or every declared action
 * unconditionally (work item A-T5). Defaults to `configFor(slug).actions` when `actions` is omitted
 * or empty; an explicit list is validated against that same array so a typo THROWS rather than
 * silently doing nothing. Stays a leaf: no import of `motion.mjs` here, so `VIDEO_MOTIONS` is never
 * consulted — a caller that needs the motion spec looks it up itself via `motionKey`.
 */
export function workListFor(slug, actions) {
  const declared = configFor(slug).actions;
  const requested = actions && actions.length > 0 ? actions : declared;
  return requested.map((action) => {
    if (!declared.includes(action)) {
      throw new Error(
        `slugConfig: "${slug}" has no action "${action}". Declared actions: ${declared.join(', ')}`,
      );
    }
    return { slug, action, motionKey: motionKeyFor(slug, action) };
  });
}
