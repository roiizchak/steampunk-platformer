/**
 * **How many rows of buttons does this sheet have, and are they a grid at all?**
 *
 * Split out of `touchPlateCut.mjs` when that file crossed the 400-line rule. One question, its
 * thresholds and the two refusals it can raise; `touchPlateCut.mjs` imports `measurePlateRows` and
 * decides nothing about rows itself.
 */

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
