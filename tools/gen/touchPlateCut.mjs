/**
 * The plate -> six raw cells -> six 160 x 160 cut faces. Pure pixels, no filesystem, no argv.
 *
 * Split out of `buildTouchAtlas.mjs` when that file reached the 400-line ceiling - the same move
 * round 9 made for `touchInk.mjs`, and for the same reason: the builder is orchestration, and the
 * geometry has its own gate (`touch-atlas-cut.test.ts`) that never wants a directory.
 *
 * ## CELL POSITION, never detection order
 *
 * `detectFrames` projects opacity into row and column bands (`sheets.mjs:69-167`), so "the fourth
 * thing found" is a property of the pixels rather than of the layout - a plate with one face
 * slightly larger would silently rename two buttons. Every mapping here is `row, col` -> key, and
 * the grid is stated by the prompt that made the image.
 *
 * ## Decode first, measure, THEN crop
 *
 * `FAL-MODELS.md:115-122` forbids inferring a generated image's dimensions from its aspect label,
 * and the precedent is real: `nano-banana-pro` at `16:9 @ 2K` returns `2752 x 1536`, ratio 1.7917,
 * not 1.7778. So the size is read off the file. `splitGrid` throws unless both dimensions divide
 * exactly (`sheets.mjs:168-172`) - and 2048 % 3 = 2 - so the plate is centre-cropped to a
 * divisible size before it is split, and the post-crop divisibility is asserted rather than assumed.
 *
 * ## The model chose a 3 x 3, and this file is why that is survivable
 *
 * Three takes, three layouts: six buttons in 3/2/1, seven in 3/2/2, and finally nine in a clean
 * 3 x 3 - the six faces that were asked for, in the rows they were asked for, plus a duplicate of
 * the second row. The extra content is a whole repeated ROW, not an invented face, so every cell
 * read here is unambiguous. Rows 0 and 1 are read and row 2 ignored; `TOUCH_PLATE_SHEET_ROWS` is
 * the one place that decision lives.
 *
 * Recorded in `docs/generations/phase-12-touch-plate.md` with all three `request_id`s.
 */

import { keyOut } from './chromaKey.mjs';
import { components, removeSpecks, trimHalo } from './chromaComponents.mjs';
import { decodePng } from './png.mjs';
import { crop, downscale } from './resize.mjs';
import { figureMetrics, splitGrid } from './sheets.mjs';
import { TOUCH_PLATE_CELLS, TOUCH_PLATE_COLS } from './promptTouch.mjs';

/**
 * How many rows the SHEET has, which is not how many rows the LAYOUT has.
 *
 * The prompt asked for two and the model drew three, duplicating the second. Splitting by the real
 * row count is what keeps every cell aligned; `TOUCH_PLATE_CELLS` then names the two rows that are
 * read. A future plate that honours the prompt sets this to 2 and nothing else changes.
 */
export const TOUCH_PLATE_SHEET_ROWS = 3;

/** The shipped face size, in game pixels. `TOUCH_BOX_PX` — a plate fills its box. */
export const TOUCH_FACE_PX = 160;

/**
 * Aspect tolerance for a plate that asked for 1:1.
 *
 * Refuse rather than crop a plate that is not the shape the prompt asked for: a 16:9 sheet cut into
 * square cells is six squashed buttons, and squashed is exactly the failure a downscale hides.
 */
const ASPECT_TOLERANCE = 0.02;

/** A keyed cell must be one connected blob of at least this share of the cell, or it is refused. */
const MIN_FACE_SHARE = 0.15;

/**
 * Cut, key, validate and downscale one cell.
 *
 * @param {import('./png.d.mts').RgbaImage} cell
 * @param {string} key
 * @returns {import('./png.d.mts').RgbaImage}
 */
export function cutFace(cell, key) {
  const keyed = removeSpecks(trimHalo(keyOut(cell)));

  // 🔴 One component per cell is necessary and NOT sufficient, which is why the edge check below
  // exists: a face that crosses a cell divider is cut, and each half is still exactly one component
  // inside its own cell.
  // ⚠️ `components` returns `{ labels, sizes }`, not an array — `sizes` is one entry per blob. The
  // count is taken over blobs big enough to be a button; a stray keyed pixel is not a second face,
  // and `removeSpecks` has already dropped anything under `CHROMA.MIN_COMPONENT_PX`.
  const blobs = components(keyed).sizes.filter((n) => n >= (keyed.width * keyed.height) / 400);
  if (blobs.length !== 1) {
    throw new Error(`${key}: expected exactly one shape in the cell, found ${blobs.length}`);
  }

  const metrics = figureMetrics(keyed);
  if (!metrics) throw new Error(`${key}: the cell keyed out to nothing at all`);

  const share = metrics.pixels / (keyed.width * keyed.height);
  if (share < MIN_FACE_SHARE) {
    throw new Error(`${key}: the face covers ${(share * 100).toFixed(1)}% of its cell, too little to be a button`);
  }

  // ⚠️ No foreground pixel may touch a crop edge. A face flush to a boundary was cut by the split
  // and must be refused, never downscaled — the plan's rule, and the reason the prompt describes a
  // wide chroma margin as something that is THERE rather than negating the absence of one.
  if (
    metrics.minX <= 0 ||
    metrics.minY <= 0 ||
    metrics.maxX >= keyed.width - 1 ||
    metrics.maxY >= keyed.height - 1
  ) {
    throw new Error(`${key}: the face touches its cell edge, so the split cut it`);
  }

  // Crop to the face's own bounds and downscale to a square, so every button fills its plate
  // identically whatever the model's framing did.
  const w = metrics.maxX - metrics.minX + 1;
  const h = metrics.maxY - metrics.minY + 1;
  const side = Math.max(w, h);
  const x = Math.max(0, Math.round(metrics.minX - (side - w) / 2));
  const y = Math.max(0, Math.round(metrics.minY - (side - h) / 2));
  const square = crop(
    keyed,
    Math.min(x, keyed.width - side),
    Math.min(y, keyed.height - side),
    side,
    side,
  );
  return downscale(square, TOUCH_FACE_PX, TOUCH_FACE_PX);
}

/**
 * Decode the plate, assert its shape, and hand back the RAW cell behind each key.
 *
 * RAW means pre-keying, pre-crop, pre-downscale. Everything that wanted a plate cell used to reach
 * it through `cutFace`, which keys the chroma out, crops to the figure's bounds and resamples to
 * 160 px - right for a face about to ship, useless as a reference image for an image-to-image edit,
 * which wants the model's own pixels at the model's own resolution. Found by the Codex plan review
 * while planning the single-cell re-shoot: the plan named a full-resolution reference and nothing
 * in the repository could produce one.
 *
 * `cutPlate` composes this, so grid selection keeps exactly ONE definition - which is what M66
 * gates, and the reason that mutation exists is that mutating `grid[row * COLS + col]` instead of
 * the descriptor table rewrites both oracles in the same run.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cells: Map<string, import('./png.d.mts').RgbaImage>, width: number, height: number }}
 */
export function plateCells(bytes) {
  const decoded = decodePng(bytes);
  const { width, height } = decoded;

  const aspect = width / height;
  if (Math.abs(aspect - 1) > ASPECT_TOLERANCE) {
    throw new Error(
      `the plate is ${width} x ${height} (aspect ${aspect.toFixed(4)}), and the prompt asked for 1:1`,
    );
  }

  // Centre-crop to a size both grid dimensions divide, then ASSERT it - `splitGrid` throws
  // otherwise, and a throw two frames deeper is a worse error message than this one.
  const cropW = width - (width % TOUCH_PLATE_COLS);
  const cropH = height - (height % TOUCH_PLATE_SHEET_ROWS);
  const plate = crop(
    { width, height, data: decoded.data },
    Math.floor((width - cropW) / 2),
    Math.floor((height - cropH) / 2),
    cropW,
    cropH,
  );
  if (plate.width % TOUCH_PLATE_COLS !== 0 || plate.height % TOUCH_PLATE_SHEET_ROWS !== 0) {
    throw new Error(`the cropped plate ${plate.width} x ${plate.height} does not divide the grid`);
  }

  const grid = splitGrid(plate, TOUCH_PLATE_COLS, TOUCH_PLATE_SHEET_ROWS);
  const cells = new Map();
  for (const cell of TOUCH_PLATE_CELLS) {
    const image = grid[cell.row * TOUCH_PLATE_COLS + cell.col];
    if (!image) throw new Error(`${cell.key}: no cell at row ${cell.row}, column ${cell.col}`);
    cells.set(cell.key, image);
  }
  return { cells, width, height };
}

/**
 * One raw plate cell, at the plate's own resolution - the reference an editing endpoint is given.
 *
 * @param {Uint8Array} bytes
 * @param {string} key
 * @returns {import('./png.d.mts').RgbaImage}
 */
export function extractPlateCell(bytes, key) {
  const cell = plateCells(bytes).cells.get(key);
  if (!cell) throw new Error(`${key} is not one of the plate's cells`);
  return cell;
}

/**
 * Every plate cell, keyed, validated and downscaled to a shippable face.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cells: Map<string, import('./png.d.mts').RgbaImage>, width: number, height: number }}
 */
export function cutPlate(bytes) {
  const { cells, width, height } = plateCells(bytes);
  const cut = new Map();
  for (const [key, image] of cells) cut.set(key, cutFace(image, key));
  return { cells: cut, width, height };
}
