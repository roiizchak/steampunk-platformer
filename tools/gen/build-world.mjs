/**
 * `npm run assets:world` — tileset, parallax layers and HUD from raw model output to shipped assets.
 *
 * The tileset is the interesting one. `nano-banana-pro` exposes no explicit `width`/`height`, so a
 * 32 px grid cannot be requested — SOURCE-ANALYSIS open question 7. It is achieved in post instead:
 * the model is asked for separated tiles on a chroma field, the tiles are **detected from the
 * pixels** with the same projection used for sprite sheets, each is squared and downscaled to
 * exactly `TILE_SIZE`, and the result is packed into a strict grid with no padding. Grid exactness
 * is then a property of the packer rather than a hope about the prompt, and `gateGridExact` proves
 * it on the written file *(criterion 4.23)*.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';
import { estimateFieldColour, estimateKeyColour, keyOut, removeSpecks } from './chroma.mjs';
import { detectFrames } from './sheets.mjs';
import { crop, downscale, mirrorLoop } from './resize.mjs';
import { gateGridExact, gateSeam, regionStats, PASS, WARM } from './gates.mjs';

/**
 * Read `TILE_SIZE` out of the runtime constants rather than declaring a second copy.
 *
 * It was a literal `32` here, which is the same "two sources for one number" defect Codex named in
 * the Phase 3 plan review (P8) for `CAMERA_ZOOM`. It went unnoticed until `TILE_SIZE` moved to 96
 * and this script cheerfully packed a 128x128 sheet for a 384x384 grid — a build that succeeds and
 * ships tiles at a quarter of the size the game indexes them at.
 *
 * Parsing the `.ts` is the same trick `prompt.mjs` uses to take the §4 template verbatim out of
 * STYLE.md: the source of truth stays where it belongs and this file cannot drift from it. It
 * throws rather than defaulting, because a default is how the wrong number gets used silently.
 */
function runtimeTileSize() {
  const src = readFileSync('src/game/constants.ts', 'utf8');
  const match = /export const TILE_SIZE = (\d+);/.exec(src);
  if (!match) {
    throw new Error(
      'assets:world: could not read TILE_SIZE from src/game/constants.ts. That file is the one ' +
        'source for the grid; this script must not carry its own copy.',
    );
  }
  return Number(match[1]);
}

const TILE_SIZE = runtimeTileSize();
const RAW = '_generated/world';

function raw(prefix) {
  // Model output is `<prefix>-<request_id>.png`, and the request id is what makes a generation
  // citable in GENERATION-LOG.md. Matching it explicitly also excludes this script's own
  // `-preview.png` output, which lands in the same folder and is not a source.
  const files = readdirSync(RAW).filter((f) =>
    new RegExp(`^${prefix}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png$`)
      .test(f),
  );
  if (files.length === 0) {
    throw new Error(
      `assets:world: no source for "${prefix}" in ${RAW}. A declared input that cannot be found ` +
        `fails the build and is never substituted (vault 4.16).`,
    );
  }
  if (files.length > 1) {
    // `.find()` used to sit here, which silently takes whichever name readdir returns first.
    // Regenerating an asset leaves BOTH the old and the new file in place — the filename carries
    // the request_id — so the build would keep using the superseded image and every gate would
    // pass on it. That is the stale-asset failure this phase has already paid for twice, and an
    // ambiguous input is not a resolvable one: move the superseded file out of `${RAW}/`.
    throw new Error(
      `assets:world: "${prefix}" is ambiguous — ${files.length} candidates in ${RAW}:\n` +
        files.map((f) => `  ${f}`).join('\n') +
        `\nThe build refuses to guess which generation is current.`,
    );
  }
  return decodePng(readFileSync(`${RAW}/${files[0]}`));
}

/** Square a tile about its centre before downscaling, so nothing is stretched. */
function square(image) {
  const side = Math.max(image.width, image.height);
  const out = new Uint8ClampedArray(side * side * 4);
  const ox = Math.floor((side - image.width) / 2);
  const oy = Math.floor((side - image.height) / 2);
  for (let y = 0; y < image.height; y += 1) {
    const from = y * image.width * 4;
    out.set(image.data.subarray(from, from + image.width * 4), ((oy + y) * side + ox) * 4);
  }
  return { width: side, height: side, data: out };
}

function buildTileset() {
  const sheet = raw('tileset');
  const { key } = estimateKeyColour(sheet);
  const keyed = removeSpecks(keyOut(sheet, { key }));
  const rects = detectFrames(keyed, { minGap: 12, minExtent: 48 });

  const cols = 4;
  const rows = Math.ceil(rects.length / cols);
  const width = cols * TILE_SIZE;
  const height = rows * TILE_SIZE;
  const data = new Uint8ClampedArray(width * height * 4);

  rects.forEach((r, i) => {
    // Cut from the KEYED copy, not the original.
    //
    // The first version cut from the original on the reasoning that "a solid tile must stay solid"
    // and keying was only needed to locate the tiles. That was wrong, and it shipped a bright green
    // floor: the tiles are not square, so squaring one pads it with whatever surrounded it — which
    // is chroma green — and `detectFrames` bounds are tight rather than exact, so a rim of green
    // survives on every edge. Keying cannot damage a tile interior here because nothing in the
    // palette is near chroma green; brass, brick and iron are all far outside the threshold.
    const tile = downscale(square(crop(keyed, r.x, r.y, r.w, r.h)), TILE_SIZE, TILE_SIZE);
    const cx = (i % cols) * TILE_SIZE;
    const cy = Math.floor(i / cols) * TILE_SIZE;
    for (let y = 0; y < TILE_SIZE; y += 1) {
      const from = y * TILE_SIZE * 4;
      data.set(tile.data.subarray(from, from + TILE_SIZE * 4), ((cy + y) * width + cx) * 4);
    }
  });

  const packed = { width, height, data };
  const grid = gateGridExact(packed, TILE_SIZE);
  if (grid.status !== PASS) {
    throw new Error(`assets:world: tileset failed the grid gate — ${grid.reason}`);
  }

  mkdirSync('public/assets/tiles', { recursive: true });
  writeFileSync('public/assets/tiles/industrial.png', encodePng(width, height, data));

  // The single tile the shipped level references. Extracted from the packed sheet rather than
  // re-sliced, so the two can never disagree.
  const first = crop(packed, 0, 0, TILE_SIZE, TILE_SIZE);
  writeFileSync(
    'public/assets/tiles/walkway.png',
    encodePng(TILE_SIZE, TILE_SIZE, first.data),
  );

  console.log(
    `ok  tileset   ${rects.length} tiles detected  ->  ${width}x${height} ` +
      `(${grid.value.cols}x${grid.value.rows} @ ${TILE_SIZE}px)  ${grid.status}`,
  );
  return rects.length;
}

/**
 * Which layers must end up with transparency, and how much of each is expected to key away.
 *
 * `far` is the backdrop — it fills the frame and keys nothing. `mid` and `near` are drawn on a
 * chroma field precisely so the layers behind them are visible, which is the whole difference
 * between a parallax and three pictures stacked back to front.
 *
 * Phase 4 shipped the second version. All three layers measured 100.0 % opaque, so `near` covered
 * `mid` and `far` completely and the two of them were downloaded, processed, gated, loaded and
 * drawn without ever being seen. Every gate in the pipeline was green: none of them asked whether
 * a layer had any transparency at all.
 *
 * The bounds are wide on purpose. They are not an art critique — they are there to catch the two
 * failures that actually happen: **nothing keyed** (the model ignored the chroma instruction, or
 * `estimateKeyColour` locked onto the wrong colour) and **everything keyed** (it returned a mostly
 * flat frame). Both have happened on this model already.
 */
const KEYED_LAYERS = { far: null, mid: [0.15, 0.75], near: [0.3, 0.9] };

function buildParallax() {
  mkdirSync('public/assets/backgrounds', { recursive: true });
  const out = [];
  for (const depth of ['far', 'mid', 'near']) {
    const source = raw(`parallax-${depth}`);
    const before = gateSeam(source);
    const stats = regionStats(source);
    const expected = KEYED_LAYERS[depth];

    // Key BEFORE downscaling. The other order looks equivalent and is not: a box filter averages
    // a chroma-green pixel into its opaque neighbours, so downscaling first leaves a green fringe
    // baked into the colour of every edge, which no later keying can reach.
    //
    // `keepLargestComponent` is deliberately NOT used here, for the same reason vault 4.13 gives
    // for `jump` and `fall`: a background layer is legitimately dozens of disconnected pieces, and
    // keeping only the largest would delete the ladder, the cables and every gauge.
    let image = source;
    let keyedFraction = 0;
    if (expected) {
      // `estimateFieldColour`, not `estimateKeyColour` — see that function's header. These layers
      // are scenes with structure on their edges, so the field is found by colour, not by position.
      const { key, share } = estimateFieldColour(source);
      image = removeSpecks(keyOut(source, { key }));
      keyedFraction = transparentFraction(image);
      const [min, max] = expected;
      if (keyedFraction < min || keyedFraction > max) {
        throw new Error(
          `assets:world: ${depth} keyed ${(keyedFraction * 100).toFixed(1)}% of its pixels away, ` +
            `outside the expected ${min * 100}-${max * 100}% (key ${key.join(',')}, field ` +
            `${(share * 100).toFixed(1)}% of the frame). 0% means the chroma field never arrived ` +
            `and this layer would silently hide everything behind it; near 100% means the frame ` +
            `came back flat.`,
        );
      }
    }

    // Downscale to the viewport height (1080) so the layer is not four times larger than it draws,
    // THEN mirror. Mirroring first would double the work for an identical result.
    const target = 1080;
    const scaled = downscale(image, Math.round((image.width * target) / image.height), target);

    // Crop to half the viewport width (960) BEFORE mirroring, so `mirrorLoop` yields exactly one
    // screen (1920x1080) instead of ~2.65 screens. The TileSprite this feeds draws at 1:1 into a
    // 1920-wide window (GameScene.ts ~548-554), so the sharpness-preserving move is a crop, never
    // a second resample. Centred on the scaled strip: nothing about the crop's *width* is
    // scene-specific, so there is no principled edge to prefer over the middle. This throws away
    // ~62% of each layer's horizontal content (2546 -> 960 px, roughly) to cut the shipped texture
    // from 5092x1080 to 1920x1080 — the trade the 64%-of-frame-budget measurement calls for, not
    // an accident of a round number.
    const cropWidth = 960;
    const cropX = Math.floor((scaled.width - cropWidth) / 2);
    const cropped = crop(scaled, cropX, 0, cropWidth, scaled.height);
    const looped = mirrorLoop(cropped);
    const after = gateSeam(looped);
    if (after.status !== PASS) {
      throw new Error(
        `assets:world: ${depth} still fails the seam gate after mirroring — ${after.reason}. ` +
          `A background that tears at the wrap is a visible defect on every pass of the camera.`,
      );
    }
    writeFileSync(
      `public/assets/backgrounds/${depth}.png`,
      encodePng(looped.width, looped.height, looped.data),
    );
    console.log(
      `ok  bg-${depth.padEnd(5)} ${source.width}x${source.height} -> ` +
        `${looped.width}x${looped.height}  sat ${stats.saturation.toFixed(3)}  warm ` +
        `${(warmFraction(looped) * 100).toFixed(2)}%  keyed ` +
        `${expected ? `${(keyedFraction * 100).toFixed(1)}%` : 'n/a (backdrop)'}` +
        `  seam ${before.status} -> ${after.status}`,
    );
    out.push({
      depth,
      width: looped.width,
      height: looped.height,
      seam: after.status,
      keyedFraction: expected ? keyedFraction : null,
      warmFraction: warmFraction(looped),
    });
  }
  return out;
}

/** Fraction of pixels the key removed. Read off the alpha channel's VALUES *(vault 4.12)*. */
function transparentFraction(image) {
  let clear = 0;
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] === 0) clear += 1;
  }
  return clear / (image.data.length / 4);
}

/**
 * Fraction of the layer's OPAQUE pixels that are warm — STYLE.md §5 RULE TWO as a number.
 *
 * Recorded rather than asserted. The rule is hash-locked and says "no warm colour anywhere behind",
 * but the honest place to enforce it is the prompt, and turning it into a build-breaking threshold
 * here would just invite someone to tune the threshold. `WARM` is shared with `gateBrassCap`, so
 * "warm" means one thing across the whole pipeline.
 */
function warmFraction(image) {
  let opaque = 0;
  let warm = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] <= WARM.MIN_ALPHA) continue;
    opaque += 1;
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    if (r >= WARM.MIN_RED && r - b >= WARM.RED_OVER_BLUE && g - b >= WARM.GREEN_OVER_BLUE) {
      warm += 1;
    }
  }
  return opaque === 0 ? 0 : warm / opaque;
}

function buildHud() {
  const image = raw('hud');
  const { key } = estimateKeyColour(image);
  const keyed = removeSpecks(keyOut(image, { key }));
  const rects = detectFrames(keyed, { minGap: 16, minExtent: 64 });
  if (rects.length !== 1) {
    throw new Error(
      `assets:world: expected ONE HUD assembly, detected ${rects.length}. STYLE.md's geometry ` +
        `constraint exists to guarantee a single row — a second component means it did not hold.`,
    );
  }
  const r = rects[0];
  const trimmed = crop(keyed, r.x, r.y, r.w, r.h);
  // The assembly draws at 1/8 of the 1080 viewport height, which puts the medallion at ~135 px.
  const target = 128;
  const scaled = downscale(trimmed, Math.round((r.w * target) / r.h), target);
  mkdirSync('public/assets/hud', { recursive: true });
  writeFileSync(
    'public/assets/hud/health-assembly.png',
    encodePng(scaled.width, scaled.height, scaled.data),
  );
  console.log(
    `ok  hud       1 assembly  ${r.w}x${r.h} -> ${scaled.width}x${scaled.height}  key(${key.join(',')})`,
  );
  return { width: scaled.width, height: scaled.height };
}

const tiles = buildTileset();
const backgrounds = buildParallax();
const hud = buildHud();
writeFileSync(
  '_generated/world-report.json',
  `${JSON.stringify({ tiles, backgrounds, hud }, null, 2)}\n`,
);
console.log('\nwrote tiles, backgrounds and hud into public/assets/');
