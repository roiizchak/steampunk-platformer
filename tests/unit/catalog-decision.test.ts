/**
 * The catalog write decision — the hole that shipped a stale row, and the check that could not fail.
 *
 * ## Codex plan review finding 2: the missing `else`
 *
 * `build-assets.mjs` wrote a catalog row inside `if (hasCatalogTiming(slug, action))` with **no
 * `else`**, and `upsertCatalogSheets` deliberately leaves keys it was not handed untouched. Together
 * those mean a sheet rebuilt **without** a timing rule keeps shipping the row describing its
 * PREVIOUS self — different frame count, different dimensions, same key. Silently. It bit
 * `brass-courier/idle` in play.
 *
 * The review also rejected the first proposed fix, a warning log, and was right to: the stale row
 * still ships, and one more line in a build that prints thirty is not a gate.
 *
 * ## Codex plan review finding 4: the tautological dimension check
 *
 * The other half of the plan compared a row's `frameWidth × frameCount` against dimensions
 * `sheetsPack.mjs` had just constructed **from those same numbers**. A check that reads its
 * expectation from the thing it is checking cannot fail, and `sheet-packing.test.ts` already covers
 * the packer's arithmetic. `validateCatalogRows` takes a `measure` function so the dimensions come
 * from somewhere independent — the real caller decodes the PNG off disk; the tests below hand it a
 * deliberately inconsistent object, which is the only reason this file can go red at all.
 */

import { describe, expect, it } from 'vitest';

import {
  decideCatalogRow,
  liftProfileEntry,
  sheetReportRow,
  validateCatalogRows,
} from '../../tools/gen/catalogDecision.mjs';

/** A row shaped like the ones `catalogRowFor` emits. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    key: 'rust-scavenger-chase',
    url: 'assets/characters/rust-scavenger/sheets/chase.png',
    frameWidth: 512,
    frameHeight: 384,
    frameCount: 12,
    ...overrides,
  };
}

describe('decideCatalogRow — a rebuilt sheet cannot leave a stale row behind', () => {
  it('writes the row when the pair has a timing rule', () => {
    expect(
      decideCatalogRow({
        slug: 'rust-scavenger',
        action: 'chase',
        hasTiming: true,
        hasExistingRow: true,
      }),
    ).toBe('write');
  });

  it('skips silently when there is no rule AND no row — nothing can go stale', () => {
    // The ordinary case for an action packed for inspection but not yet catalogued.
    expect(
      decideCatalogRow({
        slug: 'brass-courier',
        action: 'crouch',
        hasTiming: false,
        hasExistingRow: false,
      }),
    ).toBe('skip');
  });

  /** 🔴 The assertion this module exists for. */
  it('THROWS when a rebuilt sheet has no rule but a row is already shipping', () => {
    expect(() =>
      decideCatalogRow({
        slug: 'brass-courier',
        action: 'idle',
        hasTiming: false,
        hasExistingRow: true,
      }),
    ).toThrow(/no timing rule/);
  });

  it("names both the pair and the consequence, because the build's output is the only diagnosis", () => {
    let message = '';
    try {
      decideCatalogRow({
        slug: 'brass-courier',
        action: 'idle',
        hasTiming: false,
        hasExistingRow: true,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('brass-courier/idle');
    expect(message).toContain('catalogTimings.mjs');
    // The row it would have left behind, named — so the fix is obvious without reading the source.
    expect(message).toContain('brass-courier-idle');
  });

  it('refuses a call with no slug or no action rather than deciding on a blank', () => {
    expect(() => decideCatalogRow({ slug: '', action: 'idle', hasTiming: true })).toThrow(/slug/);
    expect(() => decideCatalogRow({ slug: 'x', action: '', hasTiming: true })).toThrow(/action/);
  });
});

describe('validateCatalogRows — measured independently, so it can actually go red', () => {
  /** The honest measurer: dimensions that agree with the row. */
  const agreeing = (r: { frameWidth: number; frameCount: number; frameHeight: number }) => ({
    width: r.frameWidth * r.frameCount,
    height: r.frameHeight,
  });

  it('passes a row whose PNG dimensions agree with it', () => {
    expect(validateCatalogRows([row()], agreeing)).toHaveLength(1);
  });

  /**
   * 🔴 The case the tautological version could not express: the PNG is a DIFFERENT size from what
   * the row claims. Phaser slices a sheet by these numbers, so the row wins and the game draws
   * sliced garbage — a defect that looks like bad art rather than bad data.
   */
  it('throws when the sheet is narrower than the row claims', () => {
    expect(() =>
      validateCatalogRows([row()], () => ({ width: 512 * 11, height: 384 })),
    ).toThrow(/12 frames of 512px/);
  });

  it('throws when the sheet is a different height', () => {
    expect(() => validateCatalogRows([row()], () => ({ width: 512 * 12, height: 288 }))).toThrow(
      /384px frames/,
    );
  });

  it('throws when the sheet cannot be measured at all — a row pointing at nothing must not ship', () => {
    expect(() => validateCatalogRows([row()], () => null)).toThrow(/could not measure/);
    expect(() => validateCatalogRows([row()], () => ({ width: Number.NaN, height: 384 }))).toThrow(
      /could not measure/,
    );
  });

  it('checks EVERY row, not just the first', () => {
    const rows = [row(), row({ key: 'rust-scavenger-walk', frameCount: 12 })];
    let calls = 0;
    expect(() =>
      validateCatalogRows(rows, (r: (typeof rows)[number]) => {
        calls += 1;
        return calls === 1 ? agreeing(r) : { width: 1, height: 1 };
      }),
    ).toThrow(/rust-scavenger-walk/);
    expect(calls).toBe(2);
  });

  it('refuses a non-function measurer rather than silently validating nothing', () => {
    // Without this, a call site that forgot the argument would pass every row unchecked — the
    // shape of failure this whole module exists to prevent, arriving one level up.
    expect(() => validateCatalogRows([row()], undefined as never)).toThrow(/must be a function/);
  });
});

describe('the extracted row shapes still produce what the build wrote before', () => {
  it('sheetReportRow flattens each gate verdict to "STATUS: reason"', () => {
    const built = sheetReportRow({
      slug: 'rust-scavenger',
      action: 'chase',
      frameWidth: 512,
      frameHeight: 384,
      frameCount: 12,
      loop: true,
      key: [0, 254, 0],
      agreement: 0.987654321,
      tallest: 255,
      widest: 260,
      verdicts: { motion: { status: 'PASS', reason: 'peak 0.05' } },
      summary: 'PASS',
    });

    expect(built.key).toBe('rust-scavenger-chase');
    expect(built.url).toBe('assets/characters/rust-scavenger/sheets/chase.png');
    expect(built.gates).toEqual({ motion: 'PASS: peak 0.05' });
    // Four decimals, as the committed reports carry — a report whose precision drifts makes every
    // historical diff unreadable.
    expect(built.borderAgreement).toBe(0.9877);
  });

  it('liftProfileEntry keeps every per-frame number, not a summary', () => {
    const built = liftProfileEntry({
      anchor: 'feet',
      scale: 0.56074766,
      scaleSource: 'config',
      deepestSourceY: 700,
      frames: [
        { index: 0, sourceMinY: 1, sourceMaxY: 2, sourceCentroidY: 1.23456, drawnHeight: 3, liftPx: 4 },
      ],
    });

    // The profile is committed so a bad regeneration is reviewable in a diff, and a summary cannot
    // show WHICH frame moved.
    expect(built.frames[0]).toEqual({
      index: 0,
      sourceMinY: 1,
      sourceMaxY: 2,
      sourceCentroidY: 1.235,
      drawnHeight: 3,
      liftPx: 4,
    });
  });
});
