/**
 * **How many rows of buttons does this sheet have?**
 *
 * 🔴 `TOUCH_PLATE_SHEET_ROWS = 3` is what take 3 drew, and the whole grid was split by it. The
 * prompt asked for **two** rows and the model drew three; the redesign asks for two again and may
 * draw two, or four. Splitting a two-row sheet into three cuts every button in half, and every
 * downstream gate measures the halves happily — alpha band, contrast, distinctness, all of them
 * compare a face to itself. Codex round 15, finding 4, as a precondition on the redesign.
 *
 * ⚠️ **And the estimator arrived with no direct caller.** Every fixture in the suite happened to be
 * a three-row sheet, so a mutation returning a hard-coded `3` passed all of them — the defect the
 * estimator exists to remove, reproduced in the gate for it. Codex round 19, finding 4.
 *
 * The cases below are built, not asserted about: genuine two-row and four-row sheets, an uneven gap,
 * a row drawn flush to the top edge, and a stray speck that must not be read as a row.
 */

import { describe, expect, it } from 'vitest';

import { keyOut } from '../../tools/gen/chromaKey.mjs';
import { decodePng, encodePng } from '../../tools/gen/png.mjs';
import { measurePlateRows } from '../../tools/gen/touchPlateCut.mjs';

const CELL = 300;
const COLS = 3;

/**
 * A sheet of `rows` cell-heights with a disc in each row of `drawn`, on a chroma field.
 *
 * `gaps` optionally shifts individual rows, so a sheet with uneven spacing can be built.
 */
function sheet(
  rows: number,
  drawn: number[],
  shift: Record<number, number> = {},
  radius = 0.35,
  extraHeight = 0,
  specks: [number, number][] = [],
) {
  const w = CELL * COLS;
  const h = CELL * rows + extraHeight;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i + 1] = 255;
    data[i + 3] = 255;
  }
  const r = CELL * radius;
  for (const row of drawn) {
    for (let col = 0; col < COLS; col += 1) {
      const cx = col * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2 + (shift[row] ?? 0);
      for (let y = cy - r; y <= cy + r; y += 1) {
        for (let x = cx - r; x <= cx + r; x += 1) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          if (y < 0 || y >= h) continue;
          const i = (Math.round(y) * w + Math.round(x)) * 4;
          data[i] = 200;
          data[i + 1] = 150;
          data[i + 2] = 60;
          data[i + 3] = 255;
        }
      }
    }
  }
  for (const [sx, sy] of specks) {
    const i = (sy * w + sx) * 4;
    data[i] = 200;
    data[i + 1] = 150;
    data[i + 2] = 60;
    data[i + 3] = 255;
  }
  return keyOut(decodePng(encodePng(w, h, data)));
}

/** Two rows whose discs differ in height by more than the drift the grid check permits. */
function unevenHeights() {
  const w = CELL * COLS;
  const h = CELL * 2;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i + 1] = 255;
    data[i + 3] = 255;
  }
  for (const [row, radius] of [
    [0, 0.35],
    [1, 0.2],
  ] as const) {
    const r = CELL * radius;
    for (let col = 0; col < COLS; col += 1) {
      const cx = col * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;
      for (let y = cy - r; y <= cy + r; y += 1) {
        for (let x = cx - r; x <= cx + r; x += 1) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const i = (Math.round(y) * w + Math.round(x)) * 4;
          data[i] = 200;
          data[i + 1] = 150;
          data[i + 2] = 60;
          data[i + 3] = 255;
        }
      }
    }
  }
  return keyOut(decodePng(encodePng(w, h, data)));
}

describe('measurePlateRows reads the sheet rather than a constant', () => {
  it('reads a THREE-row sheet as three', () => {
    expect(measurePlateRows(sheet(3, [0, 1, 2]))).toBe(3);
  });

  it('reads a TWO-row sheet as two — the layout the redesign prompt asks for', () => {
    // 🔴 The case a hard-coded `3` fails and every pre-existing fixture missed.
    expect(measurePlateRows(sheet(2, [0, 1]))).toBe(2);
  });

  it('reads a FOUR-row sheet as four', () => {
    expect(measurePlateRows(sheet(4, [0, 1, 2, 3]))).toBe(4);
  });

  it('reads a three-row grid with its last row left empty as TWO, not three', () => {
    // 🔴 This case asserted THREE for two rounds, and the redesign proved it wrong.
    //
    // The old rule inferred a row count from the leftover margin, so an empty trailing band counted
    // as a row. That is inventing a row from empty sheet, and the redesign plate — six buttons in
    // two rows spanning the whole height, exactly as the prompt asks — was REFUSED by it, because
    // no grid of equal cells with a whole-number margin describes that sheet.
    //
    // A row is what the sheet draws. Trailing sheet is margin, and `padToClearEdges` gives the split
    // room instead of the count absorbing it.
    expect(measurePlateRows(sheet(3, [0, 1]))).toBe(2);
  });

  it('refuses a sheet it cannot infer a grid from', () => {
    expect(() => measurePlateRows(sheet(3, [1]))).toThrow(/fewer than two|not measurable/);
  });

  it('refuses UNEVEN row spacing rather than inventing a grid', () => {
    // 🔴 Averaging start-to-start distances turns an irregular sheet into a confident wrong answer.
    // A model that draws its rows at 0, 300 and 900 is not drawing a grid, and the honest result is
    // a refusal a human reads — not a number the cutter then slices every button with.
    expect(() => measurePlateRows(sheet(4, [0, 1, 3]))).toThrow(/uneven|not measurable|pitch/i);
  });

  it('is not fooled by a stray SPECK between the rows', () => {
    // 🔴 One alpha-qualified pixel on a scanline used to make that scanline an occupied row, so a
    // speck in the gutter started a third run and re-gridded the sheet. Codex round 20, finding 7.
    // The docstring above promised this case for two rounds before it existed.
    const clean = measurePlateRows(sheet(2, [0, 1]));
    expect(clean).toBe(2);
    expect(measurePlateRows(sheet(2, [0, 1], {}, 0.35, 0, [[450, 299]]))).toBe(clean);
  });

  it('reads a TWO-run sheet with a deep bottom margin as two, and does not invent a third', () => {
    // 🔴 The other half of the same reversal. This asserted a REFUSAL, on the reasoning that two
    // runs give one step whose deviation from its own mean is zero, so the sheet was ambiguous.
    // Codex round 20, finding 4 — and the finding was right about the danger and the first repair
    // was wrong about the remedy: refusing is no safer than miscounting when the sheet is a
    // perfectly ordinary two-row plate with a generous margin.
    //
    // Nothing about this sheet is ambiguous once rows are counted rather than derived: it draws two.
    expect(measurePlateRows(sheet(2, [0, 1], {}, 0.35, 200))).toBe(2);
  });

  it('REFUSES rows of visibly different heights, which are not one grid', () => {
    // What replaces the margin rule as the two-run safety check: a grid has rows of one height.
    expect(() => measurePlateRows(unevenHeights())).toThrow(/uneven by|not equal rows/i);
  });

  it('is not fooled by a row drawn flush to the top edge', () => {
    expect(measurePlateRows(sheet(3, [0, 1, 2], { 0: -CELL * 0.14 }))).toBe(3);
  });
});
