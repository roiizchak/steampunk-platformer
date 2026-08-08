/**
 * `npm run assets:build` — raw model output → shipped sprite strips + catalog entries.
 *
 * Reads `_generated/sheets/`, keys each sheet against its own measured background, detects the frame
 * layout from the pixels, packs a uniform-cell strip, and writes both the PNG and the catalog rows.
 *
 * ## What this script refuses to do
 *
 * **It never derives the scale.** The scale lives in `public/assets/config/character-bounds.json`,
 * which is tracked and only rewritten deliberately. Vault **A5**: a global constant derived from a
 * single regenerable frame means regenerating that frame silently rescales every other animation and
 * moves every measured bound. Run with `--derive-scale` to compute and print a new one; the build
 * itself will not.
 *
 * **It fails on a missing declared input, and never substitutes** *(vault 4.16)*. `_generated/` is
 * gitignored, so absence is the DEFAULT state on a fresh clone — which is exactly the situation in
 * which a silent fallback ships the wrong art. The vault's evidence is a missing start-image
 * override that quietly substituted the standing idle and produced the worst art defect in that
 * project.
 *
 * **It writes deterministically.** Same inputs, same bytes — `encodePng` uses a fixed filter and
 * fixed deflate level, and every position is integer-rounded. That is what makes the byte-identical
 * rebuild contract *(vault 4.15)* checkable at all.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, encodePng } from './png.mjs';
import { estimateKeyColour, keyOut, removeSpecks } from './chroma.mjs';
import { detectFrames, figureMetrics, packStrip, deriveScale } from './sheets.mjs';
import { gateLoopWrap, gateMotionFloor, summarise, PASS } from './gates.mjs';

const SLUG = 'brass-courier';
const GENERATED = '_generated/sheets';
const OUT_DIR = `public/assets/characters/${SLUG}/sheets`;
const CONFIG = 'public/assets/config/character-bounds.json';

/** Every animation the sim publishes. A missing one fails the build rather than shipping four. */
const ACTIONS = ['idle', 'walk', 'run', 'jump', 'fall'];

/** Which actions loop, and which the component filter must not be applied to (vault 4.13). */
const LOOPING = new Set(['idle', 'walk', 'run']);

function findSource(action) {
  if (!existsSync(GENERATED)) {
    throw new Error(
      `assets:build: ${GENERATED} does not exist. Raw model output is gitignored by design — ` +
        `run \`npm run assets:fetch\` to re-fetch it from the request ids in ` +
        `docs/GENERATION-LOG.md. This build does NOT substitute a placeholder (vault 4.16).`,
    );
  }
  const file = readdirSync(GENERATED).find((f) => f.startsWith(`${action}-`) && f.endsWith('.png'));
  if (!file) {
    throw new Error(
      `assets:build: no source sheet for declared animation "${action}" in ${GENERATED}. ` +
        `A declared input that cannot be found fails the build; it is never substituted ` +
        `(vault 4.16).`,
    );
  }
  return join(GENERATED, file);
}

function loadConfig() {
  if (!existsSync(CONFIG)) {
    throw new Error(
      `assets:build: ${CONFIG} not found. Run with --derive-scale to produce one, then commit it. ` +
        `The scale is deliberately NOT derived during a build (vault A5).`,
    );
  }
  return JSON.parse(readFileSync(CONFIG, 'utf8'));
}

/** Key a whole sheet and return it plus the measured key colour. */
function keySheet(path) {
  const decoded = decodePng(readFileSync(path));
  const { key, agreement } = estimateKeyColour(decoded);
  const keyed = removeSpecks(keyOut(decoded, { key }));
  return { decoded, keyed, key, agreement };
}

/** Cut the detected frame rectangles out of the keyed sheet. */
function framesOf(keyed) {
  return detectFrames(keyed).map((r) => {
    const data = new Uint8ClampedArray(r.w * r.h * 4);
    for (let y = 0; y < r.h; y += 1) {
      const from = ((r.y + y) * keyed.width + r.x) * 4;
      data.set(keyed.data.subarray(from, from + r.w * 4), y * r.w * 4);
    }
    return { width: r.w, height: r.h, data };
  });
}

function main() {
  const deriveOnly = process.argv.includes('--derive-scale');

  if (deriveOnly) {
    // The canonical standing height comes from `idle`, the only genuinely neutral upright pose.
    const { keyed } = keySheet(findSource('idle'));
    const heights = framesOf(keyed).map((f) => figureMetrics(f)?.height ?? 0);
    const standing = Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
    const scale = deriveScale(standing, 96);
    console.log(`idle frame heights: ${heights.join(', ')}`);
    console.log(`mean standing height: ${standing} source px`);
    console.log(`scale for a 96 px render height: ${scale.toFixed(8)}`);
    console.log(`\nWrite this into ${CONFIG} deliberately. The build will not derive it (vault A5).`);
    return;
  }

  const config = loadConfig();
  const { scale, frameWidth, frameHeight } = config;
  if (!(scale > 0) || !frameWidth || !frameHeight) {
    throw new Error(`assets:build: ${CONFIG} is missing scale/frameWidth/frameHeight`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];

  for (const action of ACTIONS) {
    const source = findSource(action);
    const { keyed, key, agreement } = keySheet(source);
    const cells = framesOf(keyed);

    // Feet on the LAST row of the cell: `playerView` draws at origin (0.5, 1) on the player's feet
    // position, and PLAYER_BOX is authored +y up from the feet (vault 2.10). Any gap below the feet
    // here sinks the character into the ground by exactly that many pixels.
    const { strip, frames } = packStrip(cells, {
      scale,
      frameWidth,
      frameHeight,
      baselineY: frameHeight,
    });

    const tallest = Math.max(...frames.map((f) => f.drawnHeight));
    const widest = Math.max(...frames.map((f) => f.drawnWidth));
    if (tallest > frameHeight || widest > frameWidth) {
      throw new Error(
        `assets:build: "${action}" needs ${widest}x${tallest} but the cell is ` +
          `${frameWidth}x${frameHeight}. Enlarge the cell in ${CONFIG} — do NOT rescale one ` +
          `animation to fit, which is exactly what vault 4.14 forbids.`,
      );
    }

    // Gate the packed frames before writing them, not after — a sheet that fails its motion floor
    // should be visible at build time, not discovered in the Gym.
    const perFrame = frames.map((_, i) => sliceFrame(strip, i, frameWidth, frameHeight));
    const verdicts = { motion: gateMotionFloor(perFrame) };
    if (LOOPING.has(action)) {
      verdicts.loop = gateLoopWrap(perFrame);
    }
    const summary = summarise(verdicts);

    const out = join(OUT_DIR, `${action}.png`);
    writeFileSync(out, encodePng(strip.width, strip.height, strip.data));

    rows.push({
      action,
      key: `${SLUG}-${action}`,
      url: `assets/characters/${SLUG}/sheets/${action}.png`,
      frameWidth,
      frameHeight,
      frameCount: frames.length,
      loop: LOOPING.has(action),
      measuredKey: key,
      borderAgreement: Number(agreement.toFixed(4)),
      tallest,
      widest,
      gates: Object.fromEntries(
        Object.entries(verdicts).map(([k, v]) => [k, `${v.status}: ${v.reason}`]),
      ),
      summary: summary.status,
    });

    const flag = summary.status === PASS ? 'ok  ' : '⚠   ';
    console.log(
      `${flag}${action.padEnd(5)} ${frames.length} frames  ${frameWidth}x${frameHeight}  ` +
        `drawn ${widest}x${tallest}  key(${key.join(',')})  ${summary.status}`,
    );
    for (const [name, v] of Object.entries(verdicts)) {
      console.log(`      ${name}: ${v.status} — ${v.reason}`);
    }
  }

  writeFileSync('_generated/sheet-report.json', `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`\nwrote ${rows.length} strips to ${OUT_DIR} and _generated/sheet-report.json`);
}

/** Pull frame `i` back out of a packed strip, for gating. */
function sliceFrame(strip, index, frameWidth, frameHeight) {
  const data = new Uint8ClampedArray(frameWidth * frameHeight * 4);
  for (let y = 0; y < frameHeight; y += 1) {
    const from = (y * strip.width + index * frameWidth) * 4;
    data.set(strip.data.subarray(from, from + frameWidth * 4), y * frameWidth * 4);
  }
  return { width: frameWidth, height: frameHeight, data };
}

main();
