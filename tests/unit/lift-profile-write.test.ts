/**
 * `upsertLiftProfile`'s merge and its scale guard — no unit test existed for this function before
 * this file, though it has already destroyed data once (session 6: a wholesale rewrite cut five
 * animation entries to one — see `catalogWrite.mjs`'s header) and its guard changed shape again here
 * to let a padded and an unpadded generation of one character coexist (user decision D2,
 * 2026-08-12). Split out rather than added to `sheet-packing.test.ts`, which is already at the
 * 400-line ceiling.
 *
 * Every scenario runs against an in-memory store (`readFile`/`writeFile` injected), never real disk
 * — the same DI pattern `clipSource.mjs` uses for the same reason: `tests/` is `tsconfig`-strict and
 * `@types/node` is a frozen-out dependency, so a test file cannot import `node:fs` itself.
 */

import { describe, expect, it } from 'vitest';
import { upsertLiftProfile } from '../../tools/gen/catalogWrite.mjs';

/** A fresh in-memory "disk" per test, plus the `readFile`/`writeFile` pair to inject. */
function memoryFs(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    readFile: (path: string) => {
      const v = store.get(path);
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return v;
    },
    writeFile: (path: string, data: string) => {
      store.set(path, data);
    },
  };
}

function seedProfile(slug: string, animations: Record<string, unknown>) {
  return JSON.stringify({ _comment: 'seed', slug, scale: 0.5, animations });
}

describe('upsertLiftProfile — the merge (session-6 regression: a wholesale rewrite destroyed data)', () => {
  it('merges a new action alongside existing ones rather than replacing the file', () => {
    const fs = memoryFs({
      '/lp.json': seedProfile('brass-courier', {
        idle: { anchor: 'feet', scale: 0.5, scaleSource: 'slug', deepestSourceY: 10, frames: [] },
      }),
    });
    upsertLiftProfile(
      '/lp.json',
      {
        comment: 'c',
        slug: 'brass-courier',
        scale: 0.5,
        animations: {
          walk: { anchor: 'feet', scale: 0.5, scaleSource: 'slug', deepestSourceY: 20, frames: [] },
        },
      },
      fs,
    );
    const written = JSON.parse(fs.store.get('/lp.json')!);
    expect(Object.keys(written.animations).sort()).toEqual(['idle', 'walk']);
    expect(written.animations.idle.deepestSourceY).toBe(10);
  });

  it('writes a fresh profile when none exists yet — absence is legitimate', () => {
    const fs = memoryFs();
    upsertLiftProfile(
      '/new.json',
      {
        comment: 'c',
        slug: 'brass-courier',
        scale: 0.5,
        animations: {
          idle: { anchor: 'feet', scale: 0.5, scaleSource: 'slug', deepestSourceY: 1, frames: [] },
        },
      },
      fs,
    );
    expect(JSON.parse(fs.store.get('/new.json')!).animations.idle).toBeDefined();
  });
});

describe('upsertLiftProfile — the narrowed guard accepts a declared per-action override', () => {
  it('a slug-sourced entry and an action-sourced entry at DIFFERENT scales coexist', () => {
    const fs = memoryFs({
      '/lp.json': seedProfile('brass-courier', {
        idle: { anchor: 'feet', scale: 0.5, scaleSource: 'slug', deepestSourceY: 1, frames: [] },
      }),
    });
    // The exact shape a padded round produces: its own declared scale, tagged 'action'.
    upsertLiftProfile(
      '/lp.json',
      {
        comment: 'c',
        slug: 'brass-courier',
        scale: 0.5,
        animations: {
          attack: { anchor: 'feet', scale: 0.99, scaleSource: 'action', deepestSourceY: 2, frames: [] },
        },
      },
      fs,
    );
    const written = JSON.parse(fs.store.get('/lp.json')!);
    expect(written.animations.idle.scale).toBe(0.5);
    expect(written.animations.attack.scale).toBe(0.99);
  });
});

describe('upsertLiftProfile — RED-A: slug-sourced drift, real fixture (C1)', () => {
  it('throws when two SLUG-sourced entries disagree on scale', () => {
    const fs = memoryFs({
      '/lp.json': seedProfile('brass-courier', {
        idle: { anchor: 'feet', scale: 0.5, scaleSource: 'slug', deepestSourceY: 1, frames: [] },
      }),
    });
    expect(() =>
      upsertLiftProfile(
        '/lp.json',
        {
          comment: 'c',
          slug: 'brass-courier',
          // character-bounds.json's slug scale changed and only ONE slug-sourced action was rebuilt.
          scale: 0.6,
          animations: {
            walk: { anchor: 'feet', scale: 0.6, scaleSource: 'slug', deepestSourceY: 2, frames: [] },
          },
        },
        fs,
      ),
    ).toThrow(/disagree on scale/);
  });
});

describe('upsertLiftProfile — RED-B: undeclared scale/scaleSource, real fixture (C1)', () => {
  it('throws on a null scale', () => {
    const fs = memoryFs();
    expect(() =>
      upsertLiftProfile(
        '/lp.json',
        {
          comment: 'c',
          slug: 'brass-courier',
          scale: 0.5,
          animations: {
            attack: {
              anchor: 'feet',
              scale: null as unknown as number,
              scaleSource: 'action',
              deepestSourceY: 1,
              frames: [],
            },
          },
        },
        fs,
      ),
    ).toThrow(/no valid scale/);
  });

  it('throws on a missing scaleSource', () => {
    const fs = memoryFs();
    expect(() =>
      upsertLiftProfile(
        '/lp.json',
        {
          comment: 'c',
          slug: 'brass-courier',
          scale: 0.5,
          animations: {
            attack: {
              anchor: 'feet',
              scale: 0.9,
              scaleSource: undefined as unknown as 'action',
              deepestSourceY: 1,
              frames: [],
            },
          },
        },
        fs,
      ),
    ).toThrow(/scaleSource/);
  });
});

describe('upsertLiftProfile — RED-C: cross-slug merge, real fixture (C1) — impossible to trigger before this change', () => {
  it('throws when the incoming slug does not match the file already on disk', () => {
    const fs = memoryFs({
      '/lp.json': seedProfile('brass-courier', {
        idle: { anchor: 'feet', scale: 0.5, scaleSource: 'slug', deepestSourceY: 1, frames: [] },
      }),
    });
    expect(() =>
      upsertLiftProfile(
        '/lp.json',
        {
          comment: 'c',
          slug: 'brass-sentry',
          scale: 0.28915663,
          animations: {
            fire: { anchor: 'feet', scale: 0.28915663, scaleSource: 'slug', deepestSourceY: 1, frames: [] },
          },
        },
        fs,
      ),
    ).toThrow(/is "brass-courier"'s profile/);
  });
});
