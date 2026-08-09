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

/** `brass-courier-walk` -> `walk`. The catalog key carries the slug; the timing table does not. */
function animOf(key: string): AnimName {
  return key.slice(`${bounds.slug}-`.length) as AnimName;
}

const derived = animTimings(
  derivedFeel(DEFAULT_TUNING, ticksToMs),
  // Frame counts come from the CATALOG rather than being retyped, so this compares the catalog's
  // timings against the sim for the sheets the catalog actually claims to have.
  Object.fromEntries(
    catalog.sheets.map((s) => [animOf(s.key), s.frameCount]),
  ) as Record<AnimName, number>,
  bounds.stridePxPerCycle,
);

describe('the catalog records the timings the simulation derives (criterion 4.7, vault 4.22)', () => {
  it('found a non-empty catalog and a bounds file', () => {
    expect(catalog.sheets.length).toBeGreaterThan(0);
    expect(derived.length).toBe(catalog.sheets.length);
  });

  it.each(['walk', 'run', 'jump', 'fall', 'idle'])('%s agrees on simTicks, fps and loop', (name) => {
    const row = catalog.sheets.find((s) => animOf(s.key) === name);
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

  it('every sheet declares the frame size the bounds file cut it at', () => {
    // A sheet loaded with the wrong frameWidth registers a texture with correct DIMENSIONS and the
    // wrong number of frames — the single most likely way this phase ships something subtly wrong.
    // `BootScene.verifySheets` catches it at runtime; this catches it before the browser is opened.
    for (const row of catalog.sheets) {
      expect(row.frameWidth, `${row.key} frameWidth`).toBe(bounds.frameWidth);
      expect(row.frameHeight, `${row.key} frameHeight`).toBe(bounds.frameHeight);
    }
  });

  it('idle is the only authored timing, and says so', () => {
    // Vault 4.22 is satisfied for four of five clips and deliberately NOT for idle — no sim window
    // governs a breathing loop. The exception is recorded in docs/qa/phase-04-art.md per C11; this
    // asserts it cannot quietly spread to a clip that does have a window.
    const authored = catalog.sheets.filter((s) => s.derivedFrom === 'authored').map((s) => s.key);
    expect(authored).toEqual([`${bounds.slug}-idle`]);
  });
});
