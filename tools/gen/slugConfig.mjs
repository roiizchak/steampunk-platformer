/**
 * Per-slug build paths and declared actions for `build-assets.mjs`.
 *
 * Extracted so a later task can namespace `build-assets.mjs` for three subjects without pushing it
 * past the 400-line ceiling (`tests/unit/file-size.test.ts`) — this file does the extraction only;
 * it does not change what `build-assets.mjs` builds for `brass-courier` today.
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
