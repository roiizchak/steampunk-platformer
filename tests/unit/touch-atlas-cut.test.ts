/**
 * `cutPlate()` drives the plate → key binding, and until round 13 nothing drove `cutPlate()`.
 *
 * 🔴 **A literal pinning `TOUCH_PLATE_CELLS` is only half the contract.** The descriptors say
 * `touch-left` is row 0, column 0; the builder is what turns that into `grid[row * COLS + col]`.
 * Mutate the expression instead of the table — `col` → `COLS - 1 - col`, say — and the descriptors
 * are untouched, both the cut fixture and the shipped face are rewritten in the same run, and
 * reproduction, contrast and distinctness all follow the wrong binding while the left button ships
 * a right-pointing arrow. Codex round-13, M66.
 *
 * So this builds a plate whose six cells are individually identifiable and asserts which cell came
 * out under which key. Nothing here reads the generated art: the whole point is a plate whose
 * answer is known before the pipeline runs.
 */

import { describe, expect, it } from 'vitest';

import { TOUCH_FACE_PX, cutPlate, extractPlateCell, plateCells } from '../../tools/gen/touchPlateCut.mjs';
import { encodePng } from '../../tools/gen/png.mjs';
import { TOUCH_PLATE_CELLS, TOUCH_PLATE_COLS } from '../../tools/gen/promptTouch.mjs';

/** Cell side in the synthetic plate: big enough that a 0.35-radius disc is over 160 px and `downscale` is not asked to upscale. */
const CELL = 300;
/** Chroma green, the field the prompt asks the model for and `keyOut` removes. */
const FIELD = [0, 255, 0];
/** As many rows as the descriptors name — what `measurePlateRows` will count off this plate. */
const PLATE_ROWS = Math.max(...TOUCH_PLATE_CELLS.map((c) => c.row)) + 1;
/** A grid cell's height on the synthetic plate. Square cells are not promised; square PLATES are. */
const CELL_H = (CELL * TOUCH_PLATE_COLS) / PLATE_ROWS;

/**
 * One disc per occupied cell, each a different grey, on a chroma field.
 *
 * The radius clears both of `cutFace`'s refusals with room: the disc covers 38 % of its cell
 * against a 15 % floor, and stops 45 px short of every cell edge, so it is neither "too little to
 * be a button" nor "cut by the split".
 */
function syntheticPlate(greys: number[]): Uint8Array {
  // 🔴 As many rows as the descriptors name, not a square. The plate used to be `COLS x COLS`,
  // which was a three-row sheet with its last row empty — and `measurePlateRows` counted three
  // because it inferred rows from the leftover margin. It counts what is DRAWN now, so a square
  // fixture is a two-row sheet of 450 px cells and every disc straddles a boundary.
  const side = CELL * TOUCH_PLATE_COLS;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = FIELD[0]!;
    data[i + 1] = FIELD[1]!;
    data[i + 2] = FIELD[2]!;
    data[i + 3] = 255;
  }
  TOUCH_PLATE_CELLS.forEach((cell, index) => {
    const cx = cell.col * CELL + CELL / 2;
    // 🔴 Centred in its GRID cell, which is `side / ROWS` tall and not `CELL`. The plate has to stay
    // square — `cutFace` refuses any other aspect, because a 3:2 sheet cut into squares is six
    // squashed buttons — while the descriptors name two rows, so a cell is 300 x 450 here. Drawing
    // at `row * CELL` put the second row across a boundary and `cutFace` found two shapes in a cell.
    const cy = (cell.row + 0.5) * (side / PLATE_ROWS);
    const r = CELL * 0.35;
    const grey = greys[index]!;
    for (let y = cy - r; y <= cy + r; y += 1) {
      for (let x = cx - r; x <= cx + r; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = (Math.round(y) * side + Math.round(x)) * 4;
        data[i] = grey;
        data[i + 1] = grey;
        data[i + 2] = grey;
        data[i + 3] = 255;
      }
    }
  });
  return encodePng(side, side, data);
}

describe('cutPlate routes each cell to the control the descriptors name', () => {
  // Six greys far enough apart that no downscale blend can be mistaken for its neighbour, and all
  // between INK_DARK_MAX and INK_LIGHT_MIN so none of them reads as ink to the passes downstream.
  const GREYS = [60, 85, 110, 135, 160, 185];

  it('hands each key the cell at ITS row and column, not the one beside it', () => {
    const { cells } = cutPlate(syntheticPlate(GREYS));
    expect([...cells.keys()]).toEqual(TOUCH_PLATE_CELLS.map((cell) => cell.key));

    TOUCH_PLATE_CELLS.forEach((cell, index) => {
      const face = cells.get(cell.key)!;
      expect([face.width, face.height], `${cell.key} is not a face-sized square`).toEqual([
        TOUCH_FACE_PX,
        TOUCH_FACE_PX,
      ]);
      // The centre pixel of a face cut from a solid disc IS that disc's grey.
      const middle = ((TOUCH_FACE_PX / 2) * TOUCH_FACE_PX + TOUCH_FACE_PX / 2) * 4;
      expect(
        face.data[middle],
        `${cell.key} was cut from the wrong cell — it carries grey ${face.data[middle]}, ` +
          `and row ${cell.row} column ${cell.col} holds ${GREYS[index]}`,
      ).toBe(GREYS[index]);
    });
  });

  it('refuses a plate whose sixth cell is empty rather than cutting five faces and a field', () => {
    // The other half of the routing claim: a descriptor pointing at a cell with nothing in it must
    // throw, not hand back a keyed-to-nothing face that every downstream gate would then measure.
    const side = CELL * TOUCH_PLATE_COLS;
    const data = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = FIELD[0]!;
      data[i + 1] = FIELD[1]!;
      data[i + 2] = FIELD[2]!;
      data[i + 3] = 255;
    }
    expect(() => cutPlate(encodePng(side, side, data))).toThrow();
  });
});

describe('extractPlateCell hands back the RAW cell, at the plate resolution', () => {
  // The reference an image-to-image edit is given has to be the model's own pixels at the model's
  // own resolution. Every other path here has already keyed the chroma out, cropped to the figure
  // and resampled to 160 px, so a plan that named a full-resolution reference had nothing that
  // could produce one. Codex plan review, round 3.
  const GREYS = [60, 85, 110, 135, 160, 185];

  it('returns a full-size cell that still carries its chroma field', () => {
    const cell = extractPlateCell(syntheticPlate(GREYS), 'touch-attack');

    // CELL px on a side, not TOUCH_FACE_PX: nothing has been downscaled.
    expect([cell.width, cell.height], 'the cell was resampled, so it is not raw').toEqual([
      CELL,
      CELL_H,
    ]);
    // The corner is backing sheet. `cutFace` would have keyed it to transparent and cropped it
    // away entirely, which is exactly the difference this seam exists for.
    expect(
      [cell.data[0], cell.data[1], cell.data[2], cell.data[3]],
      'the corner was keyed out, so this went through cutFace after all',
    ).toEqual([FIELD[0], FIELD[1], FIELD[2], 255]);
    const middle = (Math.floor(CELL_H / 2) * CELL + CELL / 2) * 4;
    expect(cell.data[middle], 'the wrong cell came back').toBe(GREYS[3]);
  });

  it('routes by key, and refuses a key the descriptors do not name', () => {
    // Same binding claim as the cut path above, one level lower — `cutPlate` composes this, so a
    // mutation to `grid[row * COLS + col]` has to red here as well as there.
    const raw = plateCells(syntheticPlate(GREYS));
    TOUCH_PLATE_CELLS.forEach((cell, index) => {
      const middle = (Math.floor(CELL_H / 2) * CELL + CELL / 2) * 4;
      expect(raw.cells.get(cell.key)!.data[middle], `${cell.key} read the wrong cell`).toBe(
        GREYS[index],
      );
    });
    expect(() => extractPlateCell(syntheticPlate(GREYS), 'touch-nope')).toThrow();
  });
});
