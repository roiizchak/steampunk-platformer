/**
 * Criteria 3.3 and 3.5 — every shipped `.tmj` loads, and the world width is measured off it.
 *
 * ## Why this reads `public/assets/levels/`
 *
 * Vault 3.1 is a blocker and it is specific: **a test must load the shipped `.tmj` the player
 * loads.** A fixture suite and a registry suite answer different questions, and only one of them
 * can see a defect in shipped data — last time a roster-wide trim edited shipped JSON and the
 * tests stayed green through a controller dealing zero damage for a whole round.
 *
 * The Codex plan review (P1, blocker) caught this plan getting it wrong: the level was going to
 * live in a root-level `levels/`, which Vite never copies into `dist/`. The unit sweep would have
 * been green against a file the shipped build did not contain — source-data coverage wearing
 * shipped-data coverage's clothes. `public/` is copied verbatim, so the bytes globbed here are the
 * bytes the browser fetches and the bytes in `dist/`. PRD.md's file structure was amended to match.
 *
 * `import.meta.glob` with `?raw` is the only way to read files here: vitest runs with
 * `environment: 'node'` and the project deliberately has no `@types/node` *(sim-boundary)*.
 */

import { describe, expect, it } from 'vitest';
import { CAMERA_ZOOM, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, TILE_SIZE } from '../../src/game/constants';
import { describeLevelProblem, parseLevel } from '../../src/game/tilemap';
import { PLAYER_BOX } from '../../src/sim/player';

const SHIPPED = import.meta.glob('../../public/assets/levels/*.tmj', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BAD_LEVELS = import.meta.glob('../fixtures/bad-levels/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CATALOG = import.meta.glob('../../public/assets/index.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PIPELINE_DOC = import.meta.glob('../../docs/ASSET-PIPELINE.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** `../../public/assets/levels/level-01.tmj` -> `level-01`. */
function idOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.tmj$/, '');
}

const SHIPPED_ENTRIES = Object.keys(SHIPPED).map((path) => [idOf(path), SHIPPED[path]!] as const);

/**
 * The one rejection reason the vault 3.3 tests are about.
 *
 * Pinned this precisely because mutation M20 survived a `/solid/i` assertion: a parser that
 * invented solidity from object names produced a DIFFERENT rejection ("solid #6 has a non-positive
 * size", from the zero-size spawn point it had just decided was solid) which also contains the
 * word. An assertion that accepts the right answer for the wrong reason is not a gate.
 */
const NO_SOLID_PROPERTY = /no object carries the `solid` property/;

/** The shipped level, parsed once, so published-number checks can be derived rather than typed. */
const LEVEL_01 = parseLevel(
  'level-01',
  JSON.parse(SHIPPED['../../public/assets/levels/level-01.tmj']!) as unknown,
);

describe('shipped level data (criterion 3.3, vault 3.1 — blocker)', () => {
  it('the sweep is not vacuous: shipped levels and bad fixtures were both found', () => {
    // Without this, a glob that silently matched nothing would make every `it.each` below pass by
    // running zero times — the exact shape of failure vault 3.1 is about.
    expect(SHIPPED_ENTRIES.length).toBeGreaterThan(0);
    expect(Object.keys(BAD_LEVELS).length).toBeGreaterThan(0);
    expect(Object.keys(CATALOG)).toHaveLength(1);
    expect(Object.keys(PIPELINE_DOC)).toHaveLength(1);
  });

  it.each(SHIPPED_ENTRIES)('%s is valid JSON and the real parser accepts it', (_id, raw) => {
    const parsed: unknown = JSON.parse(raw);
    // The SAME function BootScene gates on. A parallel validator in the test would answer a
    // different question than "will the game load this".
    expect(describeLevelProblem(parsed)).toBeNull();
  });

  it.each(SHIPPED_ENTRIES)('%s has a usable collision layer and a spawn', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);

    expect(level.solids.length).toBeGreaterThan(0);
    for (const solid of level.solids) {
      expect(solid.w).toBeGreaterThan(0);
      expect(solid.h).toBeGreaterThan(0);
      expect(Number.isFinite(solid.x)).toBe(true);
      expect(Number.isFinite(solid.y)).toBe(true);
    }

    // The spawn must be inside the map and standing on something, or the level opens with the
    // player falling out of the world and every downstream e2e measures the wrong thing.
    expect(level.spawn.x).toBeGreaterThan(0);
    expect(level.spawn.x).toBeLessThan(level.widthPx);
    expect(level.spawn.y).toBeGreaterThan(0);
    expect(level.spawn.y).toBeLessThanOrEqual(level.heightPx);
    const standingOn = level.solids.filter(
      (s) => s.y === level.spawn.y && level.spawn.x > s.x && level.spawn.x < s.x + s.w,
    );
    expect(standingOn.length, `spawn of ${id} is not on top of any solid`).toBeGreaterThan(0);
  });

  it.each(SHIPPED_ENTRIES)('%s uses the published grid cell size', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);

    expect(level.tileWidth).toBe(TILE_SIZE);
    expect(level.tileHeight).toBe(TILE_SIZE);
  });
});

/**
 * Criterion 3.5, and vault 3.2 — the lesson of a side-scroller that shipped with 10 px of scroll
 * room because its world width came from an aspect LABEL instead of a measurement.
 *
 * Phase 3 has no background art, so the measurement here is the map's own `width x tilewidth`.
 * The rule re-binds in Phase 4 against real background pixels.
 */
describe('world extent, measured not assumed (criterion 3.5, vault 3.2)', () => {
  it.each(SHIPPED_ENTRIES)('%s reports the extent its own FILE declares', (id, raw) => {
    const json = JSON.parse(raw) as {
      width: number;
      height: number;
      tilewidth: number;
      tileheight: number;
    };
    const level = parseLevel(id, JSON.parse(raw) as unknown);

    // Against the FILE's fields, not against `parseLevel`'s own outputs. The previous version read
    // `level.widthPx === level.widthTiles * level.tileWidth`, which is `parseLevel` checked against
    // itself and cannot go red for any input — flagged independently by both gate owners.
    expect(level.widthPx).toBe(json.width * json.tilewidth);
    expect(level.heightPx).toBe(json.height * json.tileheight);
    expect(level.widthTiles).toBe(json.width);
    expect(level.tileWidth).toBe(json.tilewidth);
  });

  /**
   * The hardcode test, and it needs a SECOND map to exist at all.
   *
   * The qa-expert gate owner (brief 2) constructed the surviving mutant: with exactly one shipped
   * level, `widthPx: 5760` hardcoded into `parseLevel` passes every assertion above — the pinned
   * literal directly, and the self-consistency check by coincidence, because 180 × 32 really is
   * 5760. Nothing in a single-file sweep can separate "derived" from "constant".
   *
   * This is deliberately NOT shipped data. Shipped-data coverage and derivation coverage are
   * different questions and vault 3.1 is about not mistaking one for the other; this is the second
   * one, so a synthetic map with different dimensions is exactly right.
   */
  it('derives the extent from the data, rather than returning a constant', () => {
    const tiny = {
      width: 7,
      height: 5,
      tilewidth: 16,
      tileheight: 16,
      layers: [
        { type: 'tilelayer', name: 'g', data: [...new Array(34).fill(0), 1] },
        {
          type: 'objectgroup',
          name: 'c',
          objects: [
            {
              x: 0,
              y: 64,
              width: 112,
              height: 16,
              properties: [{ name: 'solid', type: 'bool', value: true }],
            },
            {
              x: 56,
              y: 64,
              width: 0,
              height: 0,
              point: true,
              properties: [{ name: 'spawn', type: 'bool', value: true }],
            },
          ],
        },
      ],
    };

    const level = parseLevel('tiny', tiny);
    expect(level.widthPx).toBe(112);
    expect(level.heightPx).toBe(80);
    expect(level.tileWidth).toBe(16);
  });

  it.each(SHIPPED_ENTRIES)('%s has at least a full viewport of scroll room on both axes', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);
    const viewW = GAME_WIDTH / CAMERA_ZOOM;
    const viewH = GAME_HEIGHT / CAMERA_ZOOM;

    // "Larger than the view" is the minimum cameraSetup enforces. This is the stronger design
    // rule: a level with 10 px of travel technically scrolls and is still the vault 3.2 defect.
    expect(level.widthPx - viewW, `${id} has no horizontal camera travel`).toBeGreaterThanOrEqual(viewW);
    expect(level.heightPx - viewH, `${id} has no vertical camera travel`).toBeGreaterThan(0);
  });

  it('level-01 measures exactly the extent published for Phase 4', () => {
    const level = parseLevel('level-01', JSON.parse(SHIPPED['../../public/assets/levels/level-01.tmj']!) as unknown);

    expect(level.widthTiles).toBe(180);
    expect(level.heightTiles).toBe(48);
    expect(level.widthPx).toBe(5760);
    expect(level.heightPx).toBe(1536);
    expect(level.widthPx - GAME_WIDTH / CAMERA_ZOOM).toBe(3840);
    expect(level.heightPx - GAME_HEIGHT / CAMERA_ZOOM).toBe(456);
  });
});

/**
 * Vault 3.3, a blocker: derive behaviour from DATA, never from a name.
 *
 * The check is behavioural rather than a code read. Rename the object layer and every object in a
 * parsed copy, re-parse, and the solids must be byte-identical — which is only possible if nothing
 * in the parser ever looked at a name. Grepping for the identifier would not catch a parser that
 * fell back to a name when the property was absent.
 */
describe('solidity comes from data, not names (vault 3.3 — blocker)', () => {
  it.each(SHIPPED_ENTRIES)('%s parses identically with every layer and object renamed', (id, raw) => {
    const original = parseLevel(id, JSON.parse(raw) as unknown);

    const renamed = JSON.parse(raw) as { layers: { name: string; objects?: { name?: string }[] }[] };
    for (const [i, layer] of renamed.layers.entries()) {
      layer.name = `renamed-layer-${i}`;
      for (const [j, object] of (layer.objects ?? []).entries()) {
        object.name = `renamed-object-${j}`;
      }
    }

    const after = parseLevel(id, renamed);
    expect(after.solids).toEqual(original.solids);
    expect(after.spawn).toEqual(original.spawn);
  });

  it.each(SHIPPED_ENTRIES)('%s loses its solids when the `solid` PROPERTY is removed', (_id, raw) => {
    // The other half of the rule, and the one that can go red. If the parser secretly keyed off a
    // layer name, stripping the property would change nothing and the test above would be
    // satisfied by a parser that ignores data entirely.
    const stripped = JSON.parse(raw) as {
      layers: { objects?: { properties?: { name: string }[] }[] }[];
    };
    for (const layer of stripped.layers) {
      for (const object of layer.objects ?? []) {
        object.properties = (object.properties ?? []).filter((p) => p.name !== 'solid');
      }
    }

    // Matched against the SPECIFIC reason, not merely /solid/i. Mutation M20 proved the loose
    // version vacuous: several unrelated rejection reasons also contain the word "solid", so the
    // assertion passed for a parser that had failed in a completely different way.
    expect(describeLevelProblem(stripped)).toMatch(NO_SOLID_PROPERTY);
  });

  /**
   * ADDED AFTER MUTATION M20 SURVIVED. The two tests above did not catch a parser that falls back
   * to `object.name` when the properties array is ABSENT — because every object in the shipped
   * level has a properties array, so the fallback branch is never reached by renaming alone.
   *
   * That is the case vault 3.3 is actually about: not "does it read the name when the data is
   * there", but "does it invent an answer from the name when the data is missing". So this deletes
   * the data and puts the answer in the name and the type, which is the exact shape of the mutant.
   */
  it.each(SHIPPED_ENTRIES)('%s does not read a name when the property array is GONE', (_id, raw) => {
    const trap = JSON.parse(raw) as {
      layers: { objects?: Record<string, unknown>[] }[];
    };
    for (const layer of trap.layers) {
      for (const object of layer.objects ?? []) {
        delete object.properties;
        object.name = 'solid';
        object.type = 'solid';
        object.class = 'solid';
      }
    }

    expect(describeLevelProblem(trap)).toMatch(NO_SOLID_PROPERTY);
  });
});

describe('the shipped catalog and the shipped levels agree', () => {
  it('index.json lists every .tmj in public/assets/levels/', () => {
    const catalog = JSON.parse(Object.values(CATALOG)[0]!) as { levels?: { key: string; url: string }[] };

    // `levels` is REQUIRED, not optional (Codex P3). An optional list is how "zero expectations
    // satisfy themselves" — a typo'd key would ship a catalog with no levels and a boot that is
    // perfectly happy about it.
    expect(Array.isArray(catalog.levels)).toBe(true);
    expect(catalog.levels!.length).toBeGreaterThan(0);

    const listed = new Set(catalog.levels!.map((entry) => idOf(entry.url)));
    const onDisk = new Set(SHIPPED_ENTRIES.map(([id]) => id));
    expect([...onDisk].filter((id) => !listed.has(id)), 'shipped but not in the catalog').toEqual([]);
    expect([...listed].filter((id) => !onDisk.has(id)), 'in the catalog but not shipped').toEqual([]);
  });
});

/**
 * Criteria 3.6 and 3.6b were "doc review" only, which Codex flagged (P8): a published number that
 * lives in a document and again in code can drift while both look right in isolation. Phase 4
 * spends real money against these, so they are pinned mechanically.
 */
describe('ASSET-PIPELINE.md publishes exactly what the code implements (3.6, 3.6b)', () => {
  // Markdown emphasis, table pipes and backticks stripped, whitespace collapsed. The lock is on
  // the published NUMBERS, not on whether they sit in a table or a sentence — otherwise a purely
  // editorial reflow of the document reads as a contract change.
  const doc = Object.values(PIPELINE_DOC)[0]!.replace(/[*|`]/g, ' ').replace(/\s+/g, ' ');

  it.each([
    ['grid cell size', `Grid cell size ${TILE_SIZE} × ${TILE_SIZE} px`],
    ['camera zoom', `Camera zoom ${CAMERA_ZOOM}`],
    ['viewport', `Viewport / world view ${GAME_WIDTH} × ${GAME_HEIGHT} px`],
    // Derived from the shipped level, not hand-typed. The other rows all interpolate a runtime
    // constant; this one used to be a bare string, so the doc and the literal could agree with
    // each other while both drifted from the file that actually loads (qa-expert brief 2).
    ['world extent', `World extent (level-01) ${LEVEL_01.widthPx} × ${LEVEL_01.heightPx} px`],
    [
      'character collision box',
      `Character collision box ${PLAYER_BOX.w * RENDER_SCALE} × ${PLAYER_BOX.h * RENDER_SCALE} px`,
    ],
    ['character render height', `Character render height ${PLAYER_BOX.h * RENDER_SCALE} px`],
    ['render scale', `Render scale RENDER_SCALE ${RENDER_SCALE}`],
  ])('publishes the %s', (_what, needle) => {
    expect(doc).toContain(needle);
  });

  it('no longer carries the PROPOSED marker on the grid cell size (criterion 3.6)', () => {
    expect(doc).not.toContain('PROPOSED, not yet published');
  });
});

/**
 * Vault C2 — a gate that cannot go red is decoration. These are committed broken levels, one
 * defect each, and every rejection reason is asserted to fire at least once, so a rule weakened
 * into something that matches nothing turns this red instead of silently losing coverage.
 */
describe('REJECTS the committed bad levels (vault C2)', () => {
  const entries = Object.entries(BAD_LEVELS);

  it.each(entries)('%s is rejected', (_path, raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Malformed JSON is a legitimate defect for a fixture to carry; the loader hits it first.
      return;
    }
    expect(describeLevelProblem(parsed)).not.toBeNull();
  });

  it('every fixture fails for its OWN distinct reason', () => {
    const reasons = entries
      .map(([, raw]) => {
        try {
          return describeLevelProblem(JSON.parse(raw));
        } catch {
          return 'malformed json';
        }
      })
      .filter((r): r is string => r !== null);

    expect(reasons.length).toBe(entries.length);
    expect(new Set(reasons).size, `duplicate reasons: ${JSON.stringify(reasons)}`).toBe(reasons.length);
  });
});
