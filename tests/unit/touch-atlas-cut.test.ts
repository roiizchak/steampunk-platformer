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

import { TOUCH_FACE_PX, cutPlate } from '../../tools/gen/buildTouchAtlas.mjs';
import { encodePng } from '../../tools/gen/png.mjs';
import { TOUCH_PLATE_CELLS, TOUCH_PLATE_COLS } from '../../tools/gen/promptTouch.mjs';

/** Cell side in the synthetic plate: big enough that a 0.35-radius disc is over 160 px and `downscale` is not asked to upscale. */
const CELL = 300;
/** Chroma green, the field the prompt asks the model for and `keyOut` removes. */
const FIELD = [0, 255, 0];

/**
 * One disc per occupied cell, each a different grey, on a chroma field.
 *
 * The radius clears both of `cutFace`'s refusals with room: the disc covers 38 % of its cell
 * against a 15 % floor, and stops 45 px short of every cell edge, so it is neither "too little to
 * be a button" nor "cut by the split".
 */
function syntheticPlate(greys: number[]): Uint8Array {
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
    const cy = cell.row * CELL + CELL / 2;
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
