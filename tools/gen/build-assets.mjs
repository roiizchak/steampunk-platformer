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
  const files = readdirSync(GENERATED).filter(
    (f) => f.startsWith(`${action}-`) && f.endsWith('.png'),
  );
  if (files.length === 0) {
    throw new Error(
      `assets:build: no source sheet for declared animation "${action}" in ${GENERATED}. ` +
        `A declared input that cannot be found fails the build; it is never substituted ` +
        `(vault 4.16).`,
    );
  }
  // **An ambiguous prefix is refused, never resolved by picking the first.** This was `.find()`,
  // which silently returns whichever entry `readdirSync` happened to list first — so a directory
  // holding both a superseded generation and its replacement builds one of them at random, and
  // `idle-preview.png` is a match for `idle-` too. `raw()` in build-world.mjs had the identical bug
  // and caught a `-preview.png` on its first run after being hardened. Same fix, same reason.
  if (files.length > 1) {
    throw new Error(
      `assets:build: "${action}" matches ${files.length} sheets in ${GENERATED} ` +
        `(${files.join(', ')}). Move the superseded ones into ${GENERATED}/superseded/ — picking ` +
        `the first would silently ship whichever the filesystem listed first.`,
    );
  }
  return join(GENERATED, files[0]);
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
    // The target height is read from the config rather than written here. It was a literal `96`,
    // which went stale the moment RENDER_SCALE moved 2 -> 6 and `renderHeightPx` became 288 — and a
    // deriver that prints a number for the wrong target is worse than no deriver, because its output
    // is meant to be pasted straight into the file it disagrees with.
    const renderHeight = loadConfig().renderHeightPx;
    const scale = deriveScale(standing, renderHeight);
    console.log(`idle frame heights: ${heights.join(', ')}`);
    const spread = Math.max(...heights) - Math.min(...heights);
    console.log(
      `mean standing height: ${standing} source px  (spread ${spread} px, ` +
        `${((spread / standing) * 100).toFixed(1)}% — this is the frame-to-frame size pop)`,
    );
    console.log(`scale for a ${renderHeight} px render height: ${scale.toFixed(8)}`);
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
    let cells = framesOf(keyed);

    /**
     * **Ping-pong: play the poses out and back, so the wrap is a real step by construction.**
     *
     * Requested for `idle` in `character-bounds.json`, and it is an animation-design statement
     * rather than a workaround for a bad sheet. A breathing loop genuinely IS a there-and-back —
     * the chest rises and falls through the same positions — while a walk cycle is not, because
     * a reversed stride is a character moonwalking. So this is opt-in per animation, never
     * automatic, and never applied because a gate went red.
     *
     * It is also the fix that works. The regenerated 8-pose idle failed `gateLoopWrap` with a wrap
     * of 0.0356 against a 0.0152 budget, and no shorter prefix closed either: measured back to
     * frame 1, frames 5 through 8 all sit 0.037-0.038 away, so the model drifted off the neutral
     * pose partway through and never returned. Re-rolling is a coin flip on a model STYLE.md §3
     * records as NOT seed-deterministic. Mirroring is deterministic and free, and it is exactly
     * what `mirrorLoop` already does for the parallax seams — which went FAIL -> PASS on the same
     * reasoning.
     *
     * Interior frames only (`1..n` then `n-1..2`), so neither endpoint is duplicated and every
     * step in the loop is a step the artist actually drew.
     */
    if (config.animations?.[action]?.pingPong) {
      cells = [...cells, ...cells.slice(1, -1).reverse()];
    }

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

    /**
     * **No cell may be blank or a fragment**, checked before the gates rather than by them.
     *
     * This exists because it happened: `detectFrames`'s fixed 8 px `minGap` segmented a swinging
     * arm as its own column band on the much larger video frames, so `walk` packed 15 cells for 12
     * sampled frames with **three of them empty**, and `fall` 7 for 6. Every gate passed it —
     * `gateMotionFloor` and `gateLoopWrap` are difference metrics, and a blank frame is a large,
     * perfectly consistent difference. On screen it is a character vanishing for a frame.
     *
     * A gate that cannot see a blank frame is decoration *(C2)*, and the honest fix is a check that
     * asks the question directly. The height test catches the near-miss too: a cell holding only a
     * detached boot is not empty, but it is not a frame either.
     */
    const drawnHeights = frames.map((f) => f.drawnHeight);
    const medianHeight = [...drawnHeights].sort((a, b) => a - b)[drawnHeights.length >> 1];
    frames.forEach((f, i) => {
      if (f.drawnHeight <= 0 || f.drawnWidth <= 0) {
        throw new Error(
          `assets:build: "${action}" packed an EMPTY cell at index ${i} of ${frames.length}. ` +
            `That is a blank frame in the animation. It means the sheet segmented into more bands ` +
            `than there are figures — usually a limb split off by detectFrames' minGap.`,
        );
      }
      if (f.drawnHeight < medianHeight / 2) {
        throw new Error(
          `assets:build: "${action}" cell ${i} of ${frames.length} is ${f.drawnWidth}x` +
            `${f.drawnHeight} against a median height of ${medianHeight} — that is a fragment, ` +
            `not a frame. Same cause as an empty cell, caught one step earlier.`,
        );
      }
    });

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
