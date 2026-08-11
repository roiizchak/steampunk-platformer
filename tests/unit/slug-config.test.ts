/**
 * `tools/gen/slugConfig.mjs` — the per-slug path/action table that makes room for three subjects
 * in `build-assets.mjs` without pushing it over the 400-line ceiling.
 *
 * `brass-courier` is the slug already shipping. Its `generated`/`outDir`/`config`/`liftProfile`/
 * `looping` must resolve to exactly today's hardcoded constants — that is the no-regression
 * assertion, so this file hardcodes the expected literal strings rather than importing them from
 * `build-assets.mjs` (which would make the test tautological). `reportPath` is deliberately NOT
 * checked against today's shared `_generated/sheet-report.json`: it moves to a per-slug path on
 * purpose, so every slug's build stops overwriting the previous slug's evidence.
 */

import { describe, expect, it } from 'vitest';
import { SLUGS, configFor } from '../../tools/gen/slugConfig.mjs';
import { enemyAnimKeys } from '../../src/render/enemyView';

const EXPECTED_ACTIONS: Record<string, string[]> = {
  'brass-courier': ['idle', 'walk', 'run', 'jump', 'fall', 'attack', 'hurt', 'death'],
  'brass-sentry': ['idle', 'fire', 'death'],
  'rust-scavenger': ['walk', 'chase', 'death'],
};

describe('slugConfig — per-slug build paths', () => {
  it('declares exactly the three combat-phase subjects', () => {
    expect(SLUGS).toEqual(['brass-courier', 'brass-sentry', 'rust-scavenger']);
  });

  it('brass-courier resolves to exactly today\'s literal constants (no-regression)', () => {
    const cfg = configFor('brass-courier');
    expect(cfg.generated).toBe('_generated/sheets');
    expect(cfg.outDir).toBe('public/assets/characters/brass-courier/sheets');
    expect(cfg.config).toBe('public/assets/config/character-bounds.json');
    expect(cfg.liftProfile).toBe('public/assets/config/lift-profile.json');
    expect(cfg.looping).toEqual(new Set(['idle', 'walk', 'run']));
  });

  it('every slug declares exactly the actions the combat phase prescribes, no more', () => {
    for (const slug of SLUGS) {
      expect(configFor(slug).actions, slug).toEqual(EXPECTED_ACTIONS[slug]);
    }
  });

  it('does NOT declare brass-sentry/fire-elevated — that art is unbought (vault 4.16)', () => {
    expect(configFor('brass-sentry').actions).not.toContain('fire-elevated');
  });

  it('resolves DISTINCT outDir, config, liftProfile and reportPath across all three slugs', () => {
    const fields: Array<'outDir' | 'config' | 'liftProfile' | 'reportPath'> = [
      'outDir',
      'config',
      'liftProfile',
      'reportPath',
    ];
    for (const field of fields) {
      const values = SLUGS.map((slug) => configFor(slug)[field]);
      const unique = new Set(values);
      expect(unique.size, `${field}: ${JSON.stringify(values)}`).toBe(values.length);
    }
  });

  it('reportPath is per-slug, not the shared _generated/sheet-report.json', () => {
    for (const slug of SLUGS) {
      const { reportPath } = configFor(slug);
      expect(reportPath, slug).not.toBe('_generated/sheet-report.json');
      expect(reportPath, slug).toContain(slug);
    }
  });

  it('throws on an unknown slug', () => {
    expect(() => configFor('brass-butler')).toThrow();
  });

  /**
   * R9: what the build makes (`slugConfig.mjs`'s `actions`) must agree with what the game plays
   * (`enemyView.ts`'s `ANIMS_BY_SLUG`, via `enemyAnimKeys()`), or an anim gets played that no sheet
   * was ever built for and `enemyLayer` silently falls back to a Rectangle.
   */
  it('agrees with enemyView.ts on the two enemy slugs\' action lists', () => {
    const keys = enemyAnimKeys();
    for (const slug of ['brass-sentry', 'rust-scavenger'] as const) {
      const fromView = keys
        .filter((k) => k.startsWith(`${slug}-`))
        .map((k) => k.slice(slug.length + 1));
      expect(configFor(slug).actions, slug).toEqual(fromView);
    }
  });
});
