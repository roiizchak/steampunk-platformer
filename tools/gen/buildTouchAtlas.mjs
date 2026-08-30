/**
 * The touch-control plate → six 160 × 160 PNGs.
 *
 * `npm run assets:touch`. Reads the generated plate named by `TOUCH_PLATE_SOURCE`, cuts it by KNOWN
 * GEOMETRY, keys the chroma field out of each cell, validates it, downscales it, and writes one PNG
 * per control into `public/assets/ui/`.
 *
 * ## 🔴 Cell position, never detection order
 *
 * `detectFrames` projects opacity into row and column bands (`sheets.mjs:69-167`), so "the fourth
 * thing found" is a property of the pixels rather than of the layout — a plate with one face
 * slightly larger would silently rename two buttons. Every mapping here is `row, col` → key, and the
 * grid is stated by the prompt that made the image.
 *
 * ## 🔴 Decode first, measure, THEN crop
 *
 * `FAL-MODELS.md:115-122` forbids inferring a generated image's dimensions from its aspect label,
 * and the precedent is real: `nano-banana-pro` at `16:9 @ 2K` returns `2752 × 1536`, ratio 1.7917,
 * not 1.7778. So the size is read off the file. `splitGrid` throws unless both dimensions divide
 * exactly (`sheets.mjs:168-172`) — and **2048 % 3 = 2** — so the plate is centre-cropped to a
 * divisible size before it is split, and the post-crop divisibility is asserted rather than assumed.
 *
 * ## ⚠️ The model chose a 3 × 3, and this file is why that is survivable
 *
 * Three takes, three layouts: six buttons in 3/2/1, seven in 3/2/2, and finally **nine in a clean
 * 3 × 3** — the six faces that were asked for, in the rows they were asked for, plus a duplicate of
 * the second row. That is a very different failure from the first two: the extra content is a whole
 * repeated ROW, not an invented face, so every cell this file reads is unambiguous. It reads rows 0
 * and 1 and ignores row 2, and `ROWS` is the one place that decision lives.
 *
 * Recorded in `docs/generations/phase-12-touch-plate.md` with all three `request_id`s.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { keyOut } from './chromaKey.mjs';
import { bakePlateAlpha, keylineMarks } from './touchInk.mjs';
import { components, removeSpecks, trimHalo } from './chromaComponents.mjs';
import { decodePng, encodePng, readBytes } from './png.mjs';
import { crop, downscale } from './resize.mjs';
import { figureMetrics, splitGrid } from './sheets.mjs';
import { TOUCH_PLATE_CELLS, TOUCH_PLATE_COLS } from './promptTouch.mjs';

/** The adopted plate. Take 3 — `docs/generations/phase-12-touch-plate.md`. */
export const TOUCH_PLATE_SOURCE =
  '_generated/phase-12-touch/take-3-01a05115-d226-72b2-ae41-8998a11940cf.png';

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

/** Where the faces ship. One file per control, keyed in `public/assets/index.json`. */
export const TOUCH_OUT_DIR = 'public/assets/ui';

/**
 * Where the CUT faces go — the downscaled cell as the plate gave it, before `keylineMarks` and
 * `bakePlateAlpha`.
 *
 * 🔴 **Committed, and the reason is that every shipped-bytes gate was otherwise reading its own
 * oracle off the mutated file.** The alpha invariant decided what was "ink" by luminance and the
 * contrast gate decided where the "mark" was by opacity — both discovered from the very bytes
 * under test, so a mutation that erased the engraving and left two ink cells standing simply moved
 * the mask with it and scored 3.09:1. Codex round-11. The plate itself is 3.8 MB and gitignored;
 * these six 160 px faces are ~30 KB each and are the smallest thing that says, independently of
 * the result, what the result was supposed to be.
 */
export const TOUCH_CUT_DIR = 'tests/fixtures/touch-cut';

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
 * Decode the plate, assert its shape, and cut it into the cells the layout names.
 *
 * @param {Uint8Array} bytes
 * @returns {{ cells: Map<string, import('./png.d.mts').RgbaImage>, width: number, height: number }}
 */
export function cutPlate(bytes) {
  const decoded = decodePng(bytes);
  const { width, height } = decoded;

  const aspect = width / height;
  if (Math.abs(aspect - 1) > ASPECT_TOLERANCE) {
    throw new Error(
      `the plate is ${width} x ${height} (aspect ${aspect.toFixed(4)}), and the prompt asked for 1:1`,
    );
  }

  // Centre-crop to a size both grid dimensions divide, then ASSERT it — `splitGrid` throws
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
    cells.set(cell.key, cutFace(image, cell.key));
  }
  return { cells, width, height };
}

/**
 * The keys the GAME will ask the texture manager for, read from the catalog it loads.
 *
 * 🔴 Independent of `TOUCH_PLATE_CELLS`, and that is the entire point. The first version of
 * the count guard compared `cells.size` with the length of the array that built `cells` — delete a
 * descriptor and five equals five, the sixth PNG stays on disk from an earlier run, and
 * `shipped-touch.test.ts` happily reads that stale committed file. Codex round-7. The catalog is
 * the other end of the contract: a face that is not in it is a file the game will never load.
 *
 * @returns {string[]}
 */
function catalogTouchKeys() {
  const catalog = JSON.parse(fs.readFileSync('public/assets/index.json', 'utf8'));
  return catalog.images
    .map((/** @type {{key: string}} */ image) => image.key)
    .filter((/** @type {string} */ key) => key.startsWith('touch-'))
    .sort();
}

function main() {
  const source = path.resolve(TOUCH_PLATE_SOURCE);
  if (!fs.existsSync(source)) {
    throw new Error(`no plate at ${TOUCH_PLATE_SOURCE} — generate it first, see docs/generations/`);
  }
  const { cells, width, height } = cutPlate(readBytes(source));

  // The contract, checked BEFORE anything is written: what this run produced against what the game
  // will look for. Neither side is derived from the other.
  const produced = [...cells.keys()].sort();
  const wanted = catalogTouchKeys();
  if (produced.join(',') !== wanted.join(',')) {
    throw new Error(
      `cut [${produced.join(', ')}] but the catalog asks for [${wanted.join(', ')}] — ` +
        'add or remove the index.json rows and the cell descriptors together',
    );
  }

  fs.mkdirSync(TOUCH_OUT_DIR, { recursive: true });
  fs.mkdirSync(TOUCH_CUT_DIR, { recursive: true });
  for (const [key, cut] of cells) {
    // The CUT face — everything the plate gave us, before either ink pass. Committed, because it
    // is the only independent statement of where the engraving is: `shipped-touch.test.ts` re-runs
    // the two pure passes over it and demands the shipped bytes back. See TOUCH_CUT_DIR.
    fs.writeFileSync(path.join(TOUCH_CUT_DIR, `${key}.png`), encodePng(cut.width, cut.height, cut.data));

    const { image: inked, mark } = keylineMarks(cut);
    const image = bakePlateAlpha(inked, mark);
    const out = path.join(TOUCH_OUT_DIR, `${key}.png`);
    fs.writeFileSync(out, encodePng(image.width, image.height, image.data));
    console.log(`${out}  ${image.width} x ${image.height}`);
  }

  for (const dir of [TOUCH_OUT_DIR, TOUCH_CUT_DIR]) {
    for (const file of staleFaces(fs.readdirSync(dir), cells)) {
      fs.rmSync(path.join(dir, file));
      console.log(`removed stale ${path.join(dir, file)}`);
    }
  }
  console.log(
    `\ncut ${cells.size} faces from a MEASURED ${width} x ${height} plate ` +
      `(${TOUCH_PLATE_COLS} x ${TOUCH_PLATE_SHEET_ROWS} grid, rows 0-1 used)`,
  );
}

/**
 * Which files in the output directory this run did NOT produce and should therefore delete.
 *
 * ⚠️ A key dropped from the cells leaves its PNG on disk from an earlier run, committed, and
 * every gate downstream reads that stale file as though this run had made it. Sweeping is the fix.
 *
 * 🔴 **`touch-` FIRST, and pure so it can be driven.** Without the prefix test this deletes
 * every `.png` in the directory — dormant today because the directory holds only faces, destructive
 * the moment an unrelated UI image lands there. It was inline in `main()` with no gate, so the
 * mutation that dropped the prefix stayed green (M53). Codex round-8.
 *
 * @param {string[]} files
 * @param {{ has(key: string): boolean }} produced
 * @returns {string[]}
 */
export function staleFaces(files, produced) {
  return files.filter(
    (file) => file.startsWith('touch-') && file.endsWith('.png') && !produced.has(file.slice(0, -4)),
  );
}

/**
 * Is this module being RUN, rather than imported?
 *
 * 🔴 `fileURLToPath`, never `new URL(...).pathname`. A URL keeps the space in "Steampunk
 * Platformer" percent-encoded as `%20`, so the comparison was `.../Steampunk%20Platformer/...`
 * against `.../Steampunk Platformer/...` — never equal, and `main()` never ran. `npm run
 * assets:touch` printed nothing and exited 0, which is indistinguishable from success; the six
 * faces in `public/assets/ui/` were cut by calling `cutPlate` by hand. Found by the Codex round-6
 * review, and confirmed by the fact that this script had never once produced its own output.
 *
 * ⚠️ Exported so it can be DRIVEN. The repair had no gate of its own — reverting it to the
 * broken comparison left unit, build and e2e verification green, because nothing runs the CLI.
 * Codex round-8. `touch-atlas-cli.test.ts` passes it a path with a space in it, which is the whole
 * bug in one argument.
 *
 * @param {string | undefined} argv1
 * @param {string} moduleUrl
 * @returns {boolean}
 */
export function isCliEntry(argv1, moduleUrl) {
  return Boolean(argv1) && path.resolve(/** @type {string} */ (argv1)) === fileURLToPath(moduleUrl);
}

if (isCliEntry(process.argv[1], import.meta.url)) {
  main();
}
