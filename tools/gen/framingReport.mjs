/**
 * Work item A-T2 — does edge crop come from RE-FRAMING (anchor ratio != output ratio) or from
 * MOTION (the subject moves outside its anchor's static margin)? This is the measurement, not the
 * spend decision — it must be honest, and a result that weakens either hypothesis is the valuable
 * outcome, not a bug.
 *
 * Reuses the pipeline's own primitives rather than re-implementing them (vault 5.3: one definition
 * of "subject bounding box", not two that agree on the happy path): `borderKey`/`keyOut` from
 * `chroma.mjs` do the keying, and `gateEdgeBleed` from `edgeGate.mjs` does the alpha-255 bounding
 * box and margin arithmetic — the same call `build-clips.mjs`'s G6 makes. `measureFraming` below is
 * only the glue: raw chroma-background image in, margins (px and %) out.
 *
 * Every anchor and every video frame this module reads is OPAQUE with a chroma-green background
 * (confirmed: `hasRealAlpha` is false on all three shipped anchors) — never a pre-keyed alpha
 * channel — so both anchors and extracted clip frames go through the identical
 * borderKey -> keyOut -> gateEdgeBleed pipeline. One function, two callers.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readPng } from './png.mjs';
import { borderKey, keyOut } from './chroma.mjs';
import { gateEdgeBleed } from './edgeGate.mjs';
import { SLUGS } from './slugConfig.mjs';
import { printAnchorTable, printClipTable, printAnswer } from './framingTable.mjs';

/** Every clip named without a `slug-` prefix belongs to the courier — the five legacy Phase 4
 * actions plus the `jump-r2` reshoot, all shot before the `slug-action` naming convention. */
const BARE_CLIP_NAMES = new Set(['idle', 'walk', 'run', 'jump', 'fall', 'jump-r2']);

export const EXPECTED_CLIP_COUNT = 17;
export const FRAMES_PER_CLIP = 6;
const VIDEO_DIRS = ['_generated/video', '_generated/phase05/video'];
const SCRATCH_DIR = '_generated/framing-frames';

/** Ratios within this relative tolerance are "the same" — a 720x1280 render of a 0.558 anchor
 * lands at 0.5625, a container-rounding artefact, not a reframe. Anything wider is a real reframe. */
const RATIO_MATCH_TOLERANCE = 0.02;

/** Bare name -> `brass-courier`; `<slug>-<action...>` -> `<slug>`. Throws on anything else — a
 * silently-unmapped clip is exactly the false green this item exists to prevent. */
export function slugForClip(name) {
  if (BARE_CLIP_NAMES.has(name)) return 'brass-courier';
  for (const slug of SLUGS) {
    if (name === slug || name.startsWith(`${slug}-`)) return slug;
  }
  throw new Error(
    `slugForClip: cannot map clip "${name}" to a known character slug (${SLUGS.join(', ')})`,
  );
}

/** `n` evenly-spaced frame indices across `[0, total)`. Not `total - 1` inclusive on both ends —
 * `floor(i * total / n)` is what the discovery self-check (jump.mp4 / jump-r2.mp4) was measured
 * against; the alternative that also touches the last frame moved jump-r2's top-edge count off the
 * known 5-of-6 result. */
export function sampleIndices(total, n = FRAMES_PER_CLIP) {
  if (!Number.isInteger(total) || total < n) {
    throw new Error(`sampleIndices: need at least ${n} frames, got ${total}`);
  }
  return Array.from({ length: n }, (_, i) => Math.floor((i * total) / n));
}

/** Fails loudly rather than silently reporting whatever it found — a report over/under the known
 * clip count is the specific false-green this work item must not produce. */
export function assertClipCount(clips, expected = EXPECTED_CLIP_COUNT) {
  if (clips.length !== expected) {
    throw new Error(
      `assertClipCount: discovered ${clips.length} clip(s), expected exactly ${expected}. ` +
        `Found: ${clips.map((c) => c.path).join(', ') || '(none)'}`,
    );
  }
}

/**
 * THE margin function. `image` is a raw, opaque, chroma-background frame (anchor or video frame
 * alike). Keys it with the frame's OWN measured background (never the assumed pure green — a real
 * generation measures off-key, see `chroma.mjs`), then hands the keyed result to `gateEdgeBleed`
 * for the alpha-255 bounding box and margins. Throws if nothing survives keying.
 */
export function measureFraming(image) {
  const key = borderKey(image);
  const keyed = keyOut(image, { key });
  const edge = gateEdgeBleed(keyed, { marginPx: 0 });
  if (edge.value === null) {
    throw new Error('measureFraming: no subject survived keying — nothing to measure');
  }
  const { width, height, margins, bounds } = edge.value;
  const pct = (px, span) => Number(((px / span) * 100).toFixed(1));
  return {
    key,
    width,
    height,
    bounds,
    margins,
    marginsPct: {
      left: pct(margins.left, width),
      right: pct(margins.right, width),
      top: pct(margins.top, height),
      bottom: pct(margins.bottom, height),
    },
    figure: {
      wFrac: Number((((bounds.maxX - bounds.minX + 1) / width) * 100).toFixed(1)),
      hFrac: Number((((bounds.maxY - bounds.minY + 1) / height) * 100).toFixed(1)),
    },
  };
}

function ffprobeDims(path) {
  const out = execFileSync(
    'ffprobe',
    [
      '-v', 'error', '-select_streams', 'v:0', '-count_frames',
      '-show_entries', 'stream=width,height,nb_read_frames',
      '-of', 'default=nw=1', path,
    ],
    { encoding: 'utf8' },
  );
  const fields = Object.fromEntries(out.trim().split(/\r?\n/).map((l) => l.split('=')));
  return { width: Number(fields.width), height: Number(fields.height), frames: Number(fields.nb_read_frames) };
}

/** Extract exactly `indices.length` frames, in order, to `outDir/f<n>.png`. */
function extractFrames(clip, indices, outDir) {
  mkdirSync(outDir, { recursive: true });
  const select = indices.map((n) => `eq(n\\,${n})`).join('+');
  execFileSync(
    'ffmpeg',
    ['-y', '-v', 'error', '-i', clip, '-vf', `select='${select}'`, '-vsync', '0',
      '-frames:v', String(indices.length), join(outDir, 'f%d.png')],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return indices.map((_, i) => join(outDir, `f${i + 1}.png`));
}

function discoverClips() {
  const found = [];
  for (const dir of VIDEO_DIRS) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // _generated/ is gitignored; a missing directory is absence, not an error.
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.mp4')) continue;
      const name = entry.name.slice(0, -4);
      found.push({ name, slug: slugForClip(name), path: join(dir, entry.name) });
    }
  }
  return found;
}

function measureAnchor(slug) {
  const image = readPng(`public/assets/characters/${slug}/anchor.png`);
  return { slug, ratio: Number((image.width / image.height).toFixed(3)), ...measureFraming(image) };
}

function measureClip(clip) {
  const { width, height, frames: sourceFrames } = ffprobeDims(clip.path);
  const indices = sampleIndices(sourceFrames);
  const outDir = join(SCRATCH_DIR, `${clip.name}`);
  const framePaths = extractFrames(clip.path, indices, outDir);
  const perFrame = framePaths.map((p, i) => ({ index: indices[i], ...measureFraming(readPng(p)) }));
  const min = (edge) => Math.min(...perFrame.map((f) => f.margins[edge]));
  const minMargins = { left: min('left'), right: min('right'), top: min('top'), bottom: min('bottom') };
  const zeroEdges = Object.entries(minMargins).filter(([, v]) => v === 0).map(([e]) => e);
  return {
    ...clip,
    outputWidth: width,
    outputHeight: height,
    outputRatio: Number((width / height).toFixed(3)),
    sourceFrames,
    perFrame,
    minMargins,
    zeroEdges,
  };
}

function main() {
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
  const clips = discoverClips();
  assertClipCount(clips);

  const anchors = Object.fromEntries(SLUGS.map((slug) => [slug, measureAnchor(slug)]));
  printAnchorTable(anchors);

  const results = clips.map((clip) => {
    const measured = measureClip(clip);
    const anchorRatio = anchors[clip.slug].ratio;
    const diff = Math.abs(measured.outputRatio - anchorRatio) / anchorRatio;
    return {
      ...measured,
      anchorRatio,
      anchorMarginsPct: anchors[clip.slug].marginsPct,
      reframed: diff > RATIO_MATCH_TOLERANCE,
    };
  });
  printClipTable(results);
  printAnswer(results);

  writeFileSync(
    '_generated/framing-report.json',
    `${JSON.stringify({ anchors, clips: results }, null, 2)}\n`,
  );
  console.log(`\nwrote _generated/framing-report.json (${results.length} clips)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
