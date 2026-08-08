/**
 * `npm run assets:clips` — Seedance `.mp4` → the grid sheet the rest of the pipeline already eats.
 *
 * This is the one new step the video path needs. Everything downstream of it is unchanged:
 * `build-assets.mjs` still keys the sheet against its own measured background, still detects the
 * frame layout from the pixels, still packs at the ONE saved scale, and still gates before writing.
 * The sheet this produces is simply a strip of sampled video frames separated by a chroma gutter,
 * which `detectFrames` splits exactly the way it splits a generated grid — *(vault 4.11)*, read the
 * geometry off the file.
 *
 * ## Three things it refuses to do
 *
 * **It never trusts the clip's declared frame rate.** `ffprobe` is run and its counted frame total
 * recorded, because `r_frame_rate` is a container field and the thing that matters is how many
 * frames actually exist. Probe A's clip measured 24 fps / 97 frames *counted*, and the number that
 * was in the docs beforehand was right by luck rather than by measurement.
 *
 * **It never samples a cyclic clip evenly across the whole four seconds.** `simTicks` is the
 * duration of ONE cycle, so a sheet holding two strides halves the derived fps and puts the
 * foot-slide straight back. The motion briefs ask for exactly two cycles and the model delivered
 * 4.0, 6.1 and 2.6 — so `sampler.mjs` measures the cycle length off the clip and cuts exactly one.
 *
 * **It never samples a one-shot clip from frame 0 either.** Every clip opens on the anchor pose,
 * because the anchor is the start image, so the courier stands still for the first stretch. Six
 * frames spread evenly across the whole thing spend one or two on a standing figure — inside an
 * 18-tick jump that is a third of the animation. Sampling runs from the measured motion onset.
 *
 * **It fails on a missing clip and never substitutes** *(vault 4.16)*. `_generated/` is gitignored,
 * so absence is the default state on a fresh clone — the exact situation in which a quiet fallback
 * ships the wrong art.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIDEO_MOTIONS } from './motion.mjs';
import {
  LIFT_OFF_FRACTION,
  chooseCycleWindow,
  liftOffOnset,
  motionOnset,
  windowIndices,
} from './sampler.mjs';

const VIDEO_DIR = '_generated/video';
const SHEET_DIR = '_generated/sheets';

/**
 * Working resolution for the difference matrix that picks the sampled frames.
 *
 * Small on purpose: the sampler asks *"has the pose come back around"*, which is a silhouette
 * question, and 120 x 214 answers it in a second where full res takes minutes. The frames that get
 * EXTRACTED are always full resolution — this size only decides which indices are chosen.
 */
const PROBE_W = 120;
const PROBE_H = 214;

/** The gutter between sampled frames, in px of chroma green. */
const GUTTER = 48;
const CHROMA = '0x00FF00';

/**
 * `detectFrames` splits on runs of empty columns at least `minGap` (8 px) wide. A video frame has
 * green margin either side of the figure already, but a running character can reach the edge — so
 * the gutter is added explicitly rather than assumed. 48 px is six times the minimum, which leaves
 * room for the chroma key's tolerance band to eat a few columns at each edge without merging two
 * figures into one cell.
 */
function ffprobe(path) {
  const out = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-count_frames',
      '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames',
      '-show_entries', 'format=duration',
      '-of', 'default=nw=1',
      path,
    ],
    { encoding: 'utf8' },
  );
  return Object.fromEntries(
    out
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split('=')),
  );
}

function findClip(action) {
  if (!existsSync(VIDEO_DIR)) {
    throw new Error(
      `assets:clips: ${VIDEO_DIR} does not exist. Raw model output is gitignored by design — ` +
        `re-fetch it from the request ids in docs/GENERATION-LOG.md. This build does NOT ` +
        `substitute a placeholder (vault 4.16).`,
    );
  }
  const files = readdirSync(VIDEO_DIR).filter(
    (f) => f === `${action}.mp4` || (f.startsWith(`${action}-`) && f.endsWith('.mp4')),
  );
  if (files.length === 0) {
    throw new Error(
      `assets:clips: no clip for declared animation "${action}" in ${VIDEO_DIR}. A declared input ` +
        `that cannot be found fails the build; it is never substituted (vault 4.16).`,
    );
  }
  // An ambiguous prefix is a silent way to ship a superseded generation — the same trap `raw()` in
  // build-world.mjs hit on its first run. Refuse rather than pick.
  if (files.length > 1) {
    throw new Error(
      `assets:clips: "${action}" matches ${files.length} clips in ${VIDEO_DIR} ` +
        `(${files.join(', ')}). Delete the superseded ones — picking the first would silently ` +
        `ship whichever the directory happened to list first.`,
    );
  }
  return join(VIDEO_DIR, files[0]);
}

/**
 * Every source frame of the clip, as a silhouette mask at probe resolution.
 *
 * "Silhouette" is decided by the chroma field rather than by a keyed alpha channel: the real key
 * runs later, in `build-assets`, against a colour it measures for itself. This is a coarser test on
 * purpose — it only has to be good enough to say whether two poses are the same.
 */
/** Topmost and lowest occupied rows of a silhouette mask — the head line and the foot line. */
function maskRows(mask) {
  let head = -1;
  let foot = -1;
  for (let y = 0; y < PROBE_H; y += 1) {
    for (let x = 0; x < PROBE_W; x += 1) {
      if (mask[y * PROBE_W + x]) {
        if (head < 0) head = y;
        foot = y;
        break;
      }
    }
  }
  return { head, foot };
}

function silhouettes(clip) {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', clip, '-vf', `scale=${PROBE_W}:${PROBE_H}`, '-f', 'rawvideo',
     '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1 << 29 },
  );
  const px = PROBE_W * PROBE_H;
  const count = Math.floor(raw.length / (px * 3));
  return Array.from({ length: count }, (_, f) => {
    const mask = new Uint8Array(px);
    const base = f * px * 3;
    for (let p = 0; p < px; p += 1) {
      const r = raw[base + p * 3];
      const g = raw[base + p * 3 + 1];
      const b = raw[base + p * 3 + 2];
      mask[p] = g > 90 && g > r + 40 && g > b + 40 ? 0 : 1;
    }
    return mask;
  });
}

/** Fraction of the frame whose silhouette membership differs. Symmetric, zero on the diagonal. */
function differ(masks) {
  const px = PROBE_W * PROBE_H;
  const cache = new Map();
  return (i, j) => {
    if (i === j) return 0;
    const key = i < j ? `${i},${j}` : `${j},${i}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let d = 0;
    for (let p = 0; p < px; p += 1) if (masks[i][p] !== masks[j][p]) d += 1;
    const value = d / px;
    cache.set(key, value);
    return value;
  };
}

/** Pull exactly these source frames, full resolution, gutter them, and lay them out in one row. */
function extract(clip, indices, out) {
  const select = indices.map((n) => `eq(n\\,${n})`).join('+');
  execFileSync(
    'ffmpeg',
    [
      '-y', '-v', 'error',
      '-i', clip,
      '-vf',
      `select='${select}',pad=iw+${GUTTER}:ih+${GUTTER}:${GUTTER / 2}:${GUTTER / 2}:${CHROMA},` +
        `tile=${indices.length}x1`,
      '-vsync', '0',
      '-frames:v', '1',
      '-pix_fmt', 'rgb24',
      out,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
}

function main() {
  mkdirSync(SHEET_DIR, { recursive: true });
  const report = [];

  for (const [action, spec] of Object.entries(VIDEO_MOTIONS)) {
    const clip = findClip(action);
    const probe = ffprobe(clip);
    const sourceFrames = Number(probe.nb_read_frames);
    const { frames, cyclic } = spec;

    let indices;
    let chosen = null;
    let onset = 0;
    const diff = differ(silhouettes(clip));
    if (cyclic) {
      // The cycle length is measured off the clip, never taken from the prompt: these briefs asked
      // for exactly two cycles and the model delivered 2.7 (walk) and 6.1 (run). A sheet holding
      // more than one cycle halves the derived fps and puts foot-slide back (vault 4.22).
      chosen = chooseCycleWindow(diff, { sourceFrames, frames });
      if (!chosen) {
        throw new Error(
          `assets:clips: "${action}" is declared cyclic but no window of it closes — no sampling ` +
            `of this clip yields a loop. That is an INDETERMINATE, not a licence to fall back to ` +
            `even sampling (vault 4.18); regenerate the clip.`,
        );
      }
      indices = chosen.indices;
    } else {
      // One-shot motions never return to their starting pose, so there is no cycle to find. But the
      // clip is NOT the animation either: it opens on the anchor pose, because the anchor is the
      // start image, so the courier stands still for the first stretch of it. Six frames spread
      // across the whole clip spend one or two on a standing figure, which inside an 18-tick jump
      // is a third of the animation. Sampling runs from the measured motion onset to the end.
      /**
       * Take-off is measured from the FEET, not from the silhouette — see `liftOffOnset`.
       * `motionOnset` remains the fallback for a one-shot that is not airborne at all (there are
       * none today, but `attack` in Phase 5 will be exactly that).
       */
      const masks = silhouettes(clip);
      const bands = masks.map((m) => maskRows(m));
      const lift = liftOffOnset(
        bands.map((b) => b.foot),
        bands.map((b) => b.head),
      );
      if (lift === null) {
        throw new Error(
          `assets:clips: "${action}" is an airborne one-shot but its feet never leave the ground — ` +
            `no frame has them ${Math.round(LIFT_OFF_FRACTION * 100)}% of a standing height above ` +
            `where they started. That is an INDETERMINATE, not a licence to sample from frame 0 ` +
            `(vault 4.18); the clip did not perform the motion and must be regenerated.`,
        );
      }
      onset = lift;
      indices = windowIndices(onset, sourceFrames - 1 - onset, frames);
    }

    const out = join(SHEET_DIR, `${action}-clip.png`);
    extract(clip, indices, out);

    report.push({
      action,
      clip,
      cyclic,
      sourceFrames,
      clipWidth: Number(probe.width),
      clipHeight: Number(probe.height),
      clipFps: probe.r_frame_rate,
      clipDuration: Number(probe.duration),
      indices,
      cyclePeriodFrames: chosen?.length ?? null,
      cyclesInClip: chosen ? Number((sourceFrames / chosen.length).toFixed(2)) : null,
      motionOnsetFrame: cyclic ? null : onset,
      wrapOverStep: chosen ? Number(chosen.ratio.toFixed(3)) : null,
      sheet: out,
    });

    const how = chosen
      ? `cycle ${chosen.length} frames (${(sourceFrames / chosen.length).toFixed(1)} in clip), ` +
        `wrap/step ${chosen.ratio.toFixed(2)}`
      : `one-shot, from motion onset at frame ${onset}`;
    console.log(`ok  ${action.padEnd(5)} ${frames} frames from ${sourceFrames} — ${how}`);
  }

  writeFileSync('_generated/clip-report.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nwrote ${report.length} sheets to ${SHEET_DIR} and _generated/clip-report.json`);
}

main();
