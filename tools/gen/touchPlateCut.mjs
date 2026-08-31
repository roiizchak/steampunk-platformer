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
 * read here is unambiguous. Rows 0 and 1 are read and row 2 ignored.

 * ⚠️ **`TOUCH_PLATE_SHEET_ROWS` is no longer the decision** — it is the record of what take 3 drew.
 * `plateCells` calls `measurePlateRows` and splits by what the sheet actually has, because the
 * redesign asks for two rows and may not get them. Codex round 19, finding 7.
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
 * What take 3 DREW: three rows, where the prompt asked for two and the model duplicated the second.
 *
 * ⚠️ **This is a record, not a decision, and it used to be the decision.** `plateCells` measures the
 * sheet with `measurePlateRows` and splits by that. Kept because the adopted plate's own layout is
 * worth stating, and because a disagreement between it and a measurement is worth noticing.
 */
export const TOUCH_PLATE_SHEET_ROWS = 3;

/**
 * A gap this many rows of pixels or wider separates two ROWS of buttons rather than two parts of
 * one. Take 3's gaps are 18-19 px on a 2048 px plate; a button's own interior never opens a
 * full-width transparent band at all, because the bezel is solid.
 */
const ROW_GAP_PX = 6;

/**
 * How far a row's spacing may sit from the mean before the sheet is refused rather than gridded.
 *
 * Take 3's steps are 686 and 676 px — 0.7 % apart. 15 % admits real drawing variation and refuses
 * the sheet that skips a row, whose steps differ by a whole cell.
 */
const MAX_PITCH_DRIFT = 0.15;

/**
 * The share of the image width a scanline must carry before it counts as part of a row.
 *
 * 🔴 One alpha-qualified pixel used to make a scanline "occupied", so a stray speck between two rows
 * started a third run and a dust mote could re-grid the whole sheet. Codex round 20, finding 7. A
 * button spans a third of the width; half a percent of it is far below any real row and far above
 * any speck the keyer leaves behind.
 */
const MIN_ROW_SHARE = 0.005;

/**
 * How far the leftover margin may sit from a whole number of rows before the sheet is refused.
 *
 * A quarter of a cell: the flush-to-the-top-edge case in the row tests overshoots by 0.20 of one and
 * is a legitimate three-row sheet; a two-row sheet with a deep bottom margin is 0.67 out and has no
 * honest row count at all.
 */
const MAX_MARGIN_DRIFT = 0.25;

/**
 * The largest number of cells one gap between drawn rows may span.
 *
 * The redesign plate leaves its middle band empty on purpose, so start-to-start is two cells. Three
 * is the honest ceiling for a six-button sheet: past it, "the rows are far apart" stops being a
 * layout and starts being a licence to invent a grid.
 */
const MAX_PITCH_MULTIPLE = 3;

/** A drawn row fills at least this share of the cell height it is assigned. */
const MIN_ROW_FILL = 0.5;

/**
 * **How many rows of buttons this plate actually has**, counted from the keyed image.
 *
 * 🔴 `TOUCH_PLATE_SHEET_ROWS` is what take 3 drew, and the whole grid was split by it. The prompt
 * asked for two rows and the model drew three; a redesign asking for two may well draw two, or four
 * — and splitting a two-row sheet into three cuts every button in half while every downstream gate
 * measures the halves happily. Codex round 15, finding 4, as a precondition on the redesign.
 *
 * Counted by runs of image rows carrying any opaque pixel after keying, which is a property of the
 * picture rather than of what anyone expected.
 *
 * @param {import('./png.d.mts').RgbaImage} keyed
 * @returns {number}
 */
export function measurePlateRows(keyed) {
  const { width: w, height: h, data: d } = keyed;

  /** Where each run of occupied image rows begins, and how tall the runs are. */
  const starts = [];
  const ends = [];
  let inRun = false;
  let gap = 0;
  for (let y = 0; y < h; y += 1) {
    let lit = 0;
    for (let x = 0; x < w; x += 1) {
      if (d[(y * w + x) * 4 + 3] >= 128) lit += 1;
    }
    if (lit >= Math.max(3, Math.ceil(w * MIN_ROW_SHARE))) {
      if (!inRun || gap >= ROW_GAP_PX) starts.push(y);
      ends[starts.length - 1] = y;
      inRun = true;
      gap = 0;
    } else {
      gap += 1;
      if (gap >= ROW_GAP_PX) inRun = false;
    }
  }

  if (starts.length < 2) {
    throw new Error(
      `the plate draws ${starts.length} row(s) of buttons — a grid cannot be inferred from fewer ` +
        'than two, so the sheet layout is not measurable',
    );
  }

  // 🔴 The PITCH, not the count of drawn rows. A sheet can leave its last row empty — the synthetic
  // plates in the unit tests do exactly that, two rows drawn in a three-row grid — and counting
  // drawn rows would then split a three-row sheet into two and cut every button in half. The pitch
  // is the cell height, and the grid is however many of those fit the image.
  const steps = [];
  for (let i = 1; i < starts.length; i += 1) steps.push(starts[i] - starts[i - 1]);
  const pitch = steps.reduce((a, b) => a + b, 0) / steps.length;

  // 🔴 **An average turns an irregular sheet into a confident wrong answer.** Rows at 0, 300 and 900
  // average to a pitch of 450 that describes no row on the plate, and the cutter would then slice
  // every button with it. A sheet whose spacing is not near-uniform is REFUSED, because a number a
  // human can argue with beats a number that silently halves six buttons.
  // Codex round 19, finding 4.
  const drift = Math.max(...steps.map((v) => Math.abs(v - pitch))) / pitch;
  if (drift > MAX_PITCH_DRIFT) {
    throw new Error(
      `the plate's rows are spaced ${steps.join(', ')} px apart — uneven by ` +
        `${(drift * 100).toFixed(0)}%, over ${(MAX_PITCH_DRIFT * 100).toFixed(0)}%, so this sheet ` +
        'is not a grid and cannot be split like one',
    );
  }

  // 🔴 **A row is never invented from margin.** With only two runs there is ONE step, so its
  // deviation from its own mean is zero by construction and the drift check above cannot fire —
  // and `round(h / pitch)` then reads a deep bottom margin as an empty grid row, splitting a
  // two-row sheet as three. Codex round 20, finding 4.
  //
  // The first repair inferred the count from the leftover margin, and the REDESIGN then showed it
  // refusing a sheet that was exactly what the prompt asked for: take 14 draws its six buttons in
  // two rows spanning the whole height, with the empty middle band the prompt asks for, and no grid
  // of equal cells with a whole-number margin describes that. The redesign was the held-out set the
  // bounds were promised to, and it failed the rule rather than the art.
  //
  // So the count is what the sheet DRAWS. Trailing sheet is margin, and margin is padded away
  // before the split rather than counted as rows. What is still checked is that the drawn rows are
  // a grid at all: evenly spaced (above) and of a consistent height (here).
  const heights = starts.map((y, i) => ends[i] - y + 1);
  const meanHeight = heights.reduce((a, b) => a + b, 0) / heights.length;
  const heightDrift = Math.max(...heights.map((v) => Math.abs(v - meanHeight))) / meanHeight;
  if (heightDrift > MAX_PITCH_DRIFT) {
    throw new Error(
      `the plate's rows are ${heights.join(', ')} px tall — uneven by ` +
        `${(heightDrift * 100).toFixed(0)}%, over ${(MAX_PITCH_DRIFT * 100).toFixed(0)}%, so these ` +
        'are not equal rows of one grid',
    );
  }

  return starts.length;
}

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

  // 🔴 MEASURED, not assumed. The grid is split by the number of rows the model actually drew.
  // A plate asked for two rows and drawn with three - which is what happened - split by two cuts
  // every button in half, and nothing downstream compares a face to anything that would notice.
  const rows = measurePlateRows(keyOut({ width, height, data: decoded.data }));
  const wanted = Math.max(...TOUCH_PLATE_CELLS.map((c) => c.row)) + 1;
  if (rows < wanted) {
    throw new Error(
      `the plate draws ${rows} row(s) of buttons and the descriptors name ${wanted} - ` +
        'the sheet is missing a row the cell table expects',
    );
  }

  // 🔴 **Padded before it is cropped, on any side the art touches.** Every take of the redesign
  // drew its bottom row flush to the bottom edge of the image — the requirement was in the prompt
  // four times, last on its own with a number, and the model drew it flush anyway. `cutFace` then
  // refuses the face, correctly, because a face on a boundary is a face something cut.
  //
  // Nothing cut it here: the sheet simply has no margin, and a margin is free. The pad is plain
  // transparency, so it cannot add a pixel to any face, any mark or any measurement; it only gives
  // the split somewhere to put the boundary. Refusing good art for the want of 100 px of empty
  // sheet would be the gate serving itself.
  const padded = padToClearEdges(keyOut({ width, height, data: decoded.data }));

  // Centre-crop to a size both grid dimensions divide, then ASSERT it - `splitGrid` throws
  // otherwise, and a throw two frames deeper is a worse error message than this one.
  const cropW = padded.width - (padded.width % TOUCH_PLATE_COLS);
  const cropH = padded.height - (padded.height % rows);
  const plate = crop(
    padded,
    Math.floor((padded.width - cropW) / 2),
    Math.floor((padded.height - cropH) / 2),
    cropW,
    cropH,
  );
  if (plate.width % TOUCH_PLATE_COLS !== 0 || plate.height % rows !== 0) {
    throw new Error(`the cropped plate ${plate.width} x ${plate.height} does not divide the grid`);
  }

  const grid = splitGrid(plate, TOUCH_PLATE_COLS, rows);
  const cells = new Map();
  for (const cell of TOUCH_PLATE_CELLS) {
    const image = grid[cell.row * TOUCH_PLATE_COLS + cell.col];
    if (!image) throw new Error(`${cell.key}: no cell at row ${cell.row}, column ${cell.col}`);
    cells.set(cell.key, image);
  }
  return { cells, width, height };
}

/**
 * The share of a dimension added as clear sheet on any side the art touches.
 *
 * Enough that a face has room between itself and a grid boundary, small enough that it cannot move
 * a row out of the band it was drawn in. Take 14's bottom row needs 1 px and gets 61.
 */
const EDGE_PAD_SHARE = 0.03;

/**
 * Pad a keyed sheet with transparency on any side its art touches.
 *
 * @param {import('./png.d.mts').RgbaImage} keyed
 * @returns {import('./png.d.mts').RgbaImage}
 */
export function padToClearEdges(keyed) {
  const { width: w, height: h, data: d } = keyed;
  const lit = (/** @type {number} */ x, /** @type {number} */ y) => d[(y * w + x) * 4 + 3] >= 128;
  let top = false;
  let bottom = false;
  let left = false;
  let right = false;
  for (let x = 0; x < w; x += 1) {
    if (lit(x, 0)) top = true;
    if (lit(x, h - 1)) bottom = true;
  }
  for (let y = 0; y < h; y += 1) {
    if (lit(0, y)) left = true;
    if (lit(w - 1, y)) right = true;
  }
  if (!top && !bottom && !left && !right) return keyed;

  const padX = Math.ceil(w * EDGE_PAD_SHARE);
  const padY = Math.ceil(h * EDGE_PAD_SHARE);
  const l = left ? padX : 0;
  const r = right ? padX : 0;
  const t = top ? padY : 0;
  const b = bottom ? padY : 0;
  const width = w + l + r;
  const height = h + t + b;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < h; y += 1) {
    const from = y * w * 4;
    data.set(d.subarray(from, from + w * 4), ((y + t) * width + l) * 4);
  }
  return { width, height, data };
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
