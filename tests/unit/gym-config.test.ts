import { afterEach, describe, expect, it, vi } from 'vitest';
import { configFilenameFor, configPathFor, slugFromSheetKey } from '../../src/render/gymBounds';
import { loadBoundsConfig } from '../../src/render/gymConfigLoader';

/**
 * The Gym's per-slug config plumbing (HANDOFF §4 step 6a / W7): which slug a sheet key implies,
 * where that slug's config lives, and what fetching it produces. Split out of `GymScene` so this
 * — previously only reachable by running the dev scene — is reachable from a unit test.
 */

describe('slugFromSheetKey', () => {
  it('recovers a two-word slug from a courier sheet key', () => {
    expect(slugFromSheetKey('brass-courier-idle')).toBe('brass-courier');
    expect(slugFromSheetKey('brass-courier-run')).toBe('brass-courier');
  });

  it('recovers each enemy slug — same action word, different owner', () => {
    // The exact collision `actionFromKey`'s own docstring warns about: "run" is not unique to one
    // character, so the guess must key off the WHOLE trailing action word, not assume one slug.
    expect(slugFromSheetKey('brass-sentry-fire')).toBe('brass-sentry');
    expect(slugFromSheetKey('rust-scavenger-chase')).toBe('rust-scavenger');
    expect(slugFromSheetKey('rust-scavenger-death')).toBe('rust-scavenger');
  });

  it('returns null for a key ending in no known action, rather than guessing', () => {
    expect(slugFromSheetKey('brass-courier-somersault')).toBeNull();
    expect(slugFromSheetKey('idle')).toBeNull();
  });
});

describe('configPathFor / configFilenameFor', () => {
  it('keeps the shipped courier file at its historical, un-renamed path', () => {
    expect(configPathFor('brass-courier')).toBe('assets/config/character-bounds.json');
    expect(configFilenameFor('brass-courier')).toBe('character-bounds.json');
  });

  it('gives every other slug the producer\'s character-bounds-<slug>.json convention', () => {
    expect(configPathFor('brass-sentry')).toBe('assets/config/character-bounds-brass-sentry.json');
    expect(configFilenameFor('rust-scavenger')).toBe('character-bounds-rust-scavenger.json');
  });

  it('load and save always agree on the filename for a given slug', () => {
    for (const slug of ['brass-courier', 'brass-sentry', 'rust-scavenger']) {
      expect(configPathFor(slug).endsWith(configFilenameFor(slug))).toBe(true);
    }
  });
});

describe('loadBoundsConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the slug-specific path and derives edits from what comes back', async () => {
    const raw = { slug: 'brass-sentry', animations: { fire: { footOffsetPx: -2, activeFrames: [1] } } };
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('assets/config/character-bounds-brass-sentry.json');
      return { ok: true, json: async () => raw } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadBoundsConfig('brass-sentry');
    expect(result.error).toBeNull();
    expect(result.rawConfig).toEqual(raw);
    expect(result.edits).toEqual({ footOffsetPx: { fire: -2 }, activeFrames: { fire: [1] } });
  });

  it('reports a non-ok response as an error rather than throwing, with empty edits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }) as Response),
    );

    const result = await loadBoundsConfig('unknown-slug');
    expect(result.error).toMatch(/404/);
    expect(result.rawConfig).toBeNull();
    expect(result.edits).toEqual({ footOffsetPx: {}, activeFrames: {} });
  });

  it('reports a network failure as an error rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const result = await loadBoundsConfig('brass-courier');
    expect(result.error).toMatch(/network down/);
    expect(result.rawConfig).toBeNull();
  });
});
