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
import { ticksToMs } from '../../src/sim/index';
import { derivedFeel } from '../../src/sim/derived';
import { DEFAULT_TUNING, PLAYER_BOX } from '../../src/sim/player';
// Fixtures extracted to a sibling module when this file crossed 400 lines — DATA and SETUP only,
// every `expect` stays here. See tilemap-data-fixtures.ts.
import {
  BAD_LEVELS,
  CATALOG,
  idOf,
  LEVEL_01,
  NO_SOLID_PROPERTY,
  PIPELINE_DOC,
  SHIPPED,
  SHIPPED_ENTRIES,
  TINY_MAP,
  docExpectations,
} from './tilemap-data-fixtures';

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
    const level = parseLevel('tiny', TINY_MAP);
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

    expect(level.widthTiles).toBe(90);
    expect(level.heightTiles).toBe(22);
    expect(level.widthPx).toBe(8640);
    expect(level.heightPx).toBe(2112);
    expect(level.widthPx - GAME_WIDTH / CAMERA_ZOOM).toBe(6720);
    expect(level.heightPx - GAME_HEIGHT / CAMERA_ZOOM).toBe(1032);
  });

  /**
   * **Every raised platform must be reachable by the jump the sim actually produces.**
   *
   * This is the assertion whose absence would have shipped an unplayable level. The Phase 4 scale
   * change moved the apex from 9.4 tiles to 4.81, and the shipped layout had platforms a 7-tile
   * rise apart. The level still parsed, still drew, still had camera travel, and every gate in the
   * suite stayed green — the player simply could not get up, which no measurement here was asking
   * about.
   *
   * Both sides are derived: the apex from `derivedFeel` running the real sim, the rises from the
   * shipped `.tmj`'s own collision rectangles. A literal on either side would let a re-tune drift
   * back into the same hole.
   */
  it('level-01 keeps every solid surface within reach of the measured jump', () => {
    const level = parseLevel('level-01', JSON.parse(SHIPPED['../../public/assets/levels/level-01.tmj']!) as unknown);
    const feel = derivedFeel(DEFAULT_TUNING, ticksToMs);

    // Distinct surface heights, top-most first. A player climbs them in order.
    const tops = [...new Set(level.solids.map((s) => s.y))].sort((a, b) => b - a);
    expect(tops.length).toBeGreaterThan(1);

    for (let i = 1; i < tops.length; i += 1) {
      const rise = tops[i - 1]! - tops[i]!;
      expect(
        rise,
        `a ${rise}px rise (${(rise / TILE_SIZE).toFixed(2)} tiles) exceeds the measured ` +
          `${feel.apexPx}px apex (${(feel.apexPx / TILE_SIZE).toFixed(2)} tiles) — unreachable`,
      ).toBeLessThanOrEqual(feel.apexPx);
    }
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

    // The catalog KEY must be the file's basename, not just the url. The Element Editor downloads
    // `${key}.tmj` and its save note tells you to drop that file into public/assets/levels/ — so a
    // key of "lvl1" against a url of ".../level-01.tmj" makes the editor emit a file that
    // overwrites nothing and an edit that silently evaporates. Found by the code-reviewer gate
    // owner (brief 2); the download filename assertion in the e2e only passes today because the
    // two happen to coincide.
    for (const entry of catalog.levels!) {
      expect(entry.key, `catalog key must match the filename in ${entry.url}`).toBe(idOf(entry.url));
    }

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

  // Table extracted to docExpectations() (tilemap-data-fixtures.ts): built from the same runtime
  // constants the doc is checked against, so the other rows interpolate rather than hand-type.
  it.each(docExpectations())('publishes the %s', (_what, needle) => {
    expect(doc).toContain(needle);
  });

  it('publishes the camera travel, derived from the shipped level', () => {
    // Codex (P10 follow-up): the travel figures were published but not pinned, so the doc could
    // drift from the level while every other row stayed green.
    const travelX = LEVEL_01.widthPx - GAME_WIDTH / CAMERA_ZOOM;
    const travelY = LEVEL_01.heightPx - GAME_HEIGHT / CAMERA_ZOOM;
    expect(doc).toContain(`Camera travel ${travelX} × ${travelY} px`);
  });

  it('no longer carries the PROPOSED marker on the grid cell size (criterion 3.6)', () => {
    expect(doc).not.toContain('PROPOSED, not yet published');
  });

  /**
   * THE SENSOR THE PHASE 2 SUITE DOES NOT HAVE.
   *
   * The code-reviewer gate owner (brief 2) pointed out that every movement assertion in
   * `player-movement.test.ts` derives its expectation from `world.tuning.*` — so multiplying all
   * eight distance knobs by the same factor is the single perturbation that suite is structurally
   * incapable of noticing. Even the anti-vacuity guard gets *easier* to satisfy, because doubling
   * `v` and `g` doubles the discrete-versus-continuous gap it demands.
   *
   * That is precisely the change this phase made. So the character contract is pinned as absolute
   * numbers here, where a re-tune has to come and edit them deliberately.
   */
  it('pins the character contract in absolute pixels, not in knob-relative terms', () => {
    const feel = derivedFeel(DEFAULT_TUNING, ticksToMs);
    const bodyHeightPx = PLAYER_BOX.h * RENDER_SCALE;

    // EDITED DELIBERATELY in Phase 4, which is exactly what this test exists to force. The scale
    // change (RENDER_SCALE 2 -> 6) is the perturbation described above, and this was the only
    // assertion in the repository that could see it.
    expect(bodyHeightPx).toBe(288);
    expect(PLAYER_BOX.w * RENDER_SCALE).toBe(132);
    expect(feel.apexPx).toBeCloseTo(461.7, 1);

    // UNCHANGED, and the reason the re-tune scaled `jumpVelocity` and `gravity` together rather
    // than picking them freely: `tick.ts`'s numbered order is declared authoritative and Phase 5's
    // combat windows are written against it, so airtime is not a free variable.
    expect(feel.airtimeTicks).toBe(37);
    expect(feel.riseTicks).toBe(18);
    expect(feel.fallTicks).toBe(18);

    // Jump height in body heights — the ratio that actually describes how the game feels, and the
    // one number a uniform scaling of every knob does NOT leave alone. It moved on purpose: 3.13
    // body heights was 28 % of the screen at the old scale and would have been 84 % at this one.
    expect(feel.apexPx / bodyHeightPx).toBeCloseTo(1.6, 2);
    /**
     * Top speed in body heights per second — the measure the user's "moves too fast" was about,
     * and the one a pure re-scale leaves at 6.5 no matter how big the character gets.
     *
     * **6.5 → 2.5 (Phase 4) → 1.875 (session 10).** The last move is not another preference dial:
     * it is what the ART dictates. Zero foot-slide requires `ticksPerFrame × topSpeed` to equal the
     * measured foot travel per drawn frame (22.5 px on run), and `ticksPerFrame` must be a whole
     * number or session 9's judder returns. At 2 ticks per frame that fixes `runMax` at exactly
     * 9.0 px/tick — 540 px/s over a 288 px character. The run sheet was resampled 12 -> 15 frames to reach it: with 12 frames the only planted speeds were 7.5 and 11.25, and the user rejected both. See `tests/unit/foot-plant.test.ts`, which
     * is the gate; this line only records the consequence for the published contract.
     */
    expect((feel.topSpeed * 60) / bodyHeightPx).toBeCloseTo(1.875, 3);
    // And the character's share of the screen, which is what Phase 4 generates art against.
    expect((bodyHeightPx / GAME_HEIGHT) * 100).toBeCloseTo(26.67, 2);
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
