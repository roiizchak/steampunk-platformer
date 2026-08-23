/**
 * Masters in `_generated/audio/` → shipped cues in `public/assets/audio/` + catalog rows.
 *
 * Run with `npm run assets:audio`. Idempotent: re-running with the same masters produces the same
 * bytes and the same numbers.
 *
 * Three things happen here, and only the first is obvious.
 *
 * **1. Trim.** Price is flat per generation, so every SFX master was generated at 8 seconds and the
 * event sits wherever the model put it — measured onsets range from 29 ms to 691 ms. `trimToEvent`
 * cuts each down to its event, reaching back before the loudest moment *(vault 7.1)*. The two beds
 * are not trimmed: they loop whole, which is why they could be requested as OGG directly.
 *
 * **2. Solve the mix.** 🔴 This is the part vault 7.4 exists for, and it is not a preference.
 *
 * Every master peaks between −9.2 and 0.00 dBFS, most of them AT full scale. Six cues and two beds
 * can sound on one tick — land, footstep, hurt, hit, kill and pickup, over both beds — and eight
 * full-scale sources sum to about **+19 dBFS**. The Phase 4 vault records three cues summing to
 * +3.9 dBFS *"on the game's most important moment"*; this is the same failure with a bigger stack.
 *
 * So each cue's gain is `(1 / its own peak) × its role weight × one solved headroom scalar`:
 *
 *   - **Normalising by the master's own peak** makes the role weights mean something. Without it
 *     `attack` at −9.2 dBFS would sit 9 dB below `hurt` at 0.0 for no reason anybody chose.
 *   - **Role weights are a design decision** and are written down as one, below.
 *   - **The headroom scalar is SOLVED, not picked.** The stack is summed with the weights applied,
 *     and the scalar is whatever puts that sum at `TARGET_STACK_DBFS`. That is the half vault 7.4
 *     insists on being measured — and criterion 7.2 then re-measures the result against a ceiling
 *     chosen from what is correct (standard headroom below 0 dBFS), not fitted to our files.
 *
 * Gain is written into the catalog rather than baked into the samples. The shipped WAV therefore
 * stays exactly what the model produced — so the gate measures the cue, not the build step — and one
 * number in one place feeds the manager, the unit gate and the e2e stack.
 *
 * **3. Catalog.** A top-level `audio` array in `public/assets/index.json`, merged rather than
 * rewritten, the same way `upsertCatalogSheets` treats `sheets`.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WORST_CASE_STACK, peakDbfs, sumPeakDbfs } from './audioGate.mjs';
import { fadeInChannels } from './audioFade.mjs';
import { decodeWav, encodeWav, trimToEvent } from './wav.mjs';

const MASTERS = '_generated/audio';
const SHIPPED = 'public/assets/audio';
const CATALOG = 'public/assets/index.json';

/**
 * Relative loudness per cue, in dB, before the solved headroom scalar.
 *
 * **A design decision, stated as one.** 0 is the reference; everything is at or below it.
 *
 *   - `death`, `kill`, `hurt` at 0 — the three moments the player must not miss. Two are about their
 *     own survival and the third is the reward for the only offensive action in the game.
 *   - `hit`, `jump`, `land` at −3 — constant, deliberate, and already visible on screen.
 *   - `attack`, `pickup` at −5 — `attack` fires on every swing including the ones that miss, and
 *     `pickup` is pure reward with no failure mode attached.
 *   - `footstep` at −11 — the most frequent sound in the game by an order of magnitude. Anything
 *     louder becomes the thing you hear instead of the game.
 *   - The beds far below everything, because they are the only sources that are ALWAYS sounding and
 *     therefore appear in every stack. `ambience` under `music` so place sits behind mood.
 */
const MIX_DB = {
  death: 0,
  kill: 0,
  hurt: 0,
  hit: -3,
  jump: -3,
  land: -3,
  attack: -5,
  pickup: -5,
  /**
   * The level-complete sting — **inventory 3.6**, added 2026-08-23.
   *
   * At −2, the loudest cue in the game after the three at 0, and deliberately: it fires **once per
   * level**, at the only moment the player has unambiguously succeeded, and nothing else is
   * competing for attention — `levelCompleted` arrives after the courier has faded and the
   * completion overlay is going up. A reward cue that has to be listened for is not a reward.
   *
   * Not 0, because the three at 0 are about survival — death, kill, hurt — and a success sting
   * shouting over them would flatten the only hierarchy this mix has.
   */
  complete: -2,
  footstep: -11,
  'bed-music': -13,
  'bed-ambience': -15,
};

/**
 * Where the solved worst-case stack is aimed.
 *
 * −3.0, not the −1.0 criterion 7.2 requires. The gate's ceiling is the pass/fail line; aiming at it
 * exactly would leave a mix that fails on any future re-tune, and a number with no margin is a
 * number that will be edited under pressure. 2 dB of room is the difference between a budget and a
 * coincidence.
 */
const TARGET_STACK_DBFS = -3.0;

// `WORST_CASE_STACK` is imported from `audioGate.mjs` — see its docstring for what is in it and
// why. It used to be declared here AND in the e2e gate, with nothing keeping the two in step.

/** Masters are named `<cue>-<request_id>.<ext>`; the probe generation is the `hit` cue. */
function masterFor(cue) {
  const wanted = cue === 'hit' ? 'probe-hit' : cue;
  const match = readdirSync(MASTERS).find((file) => file.startsWith(`${wanted}-`));
  if (!match) {
    throw new Error(
      `build-audio: no master for "${cue}" in ${MASTERS}/. Masters are gitignored and regenerated ` +
        'from the request ids in docs/GENERATION-LOG.md — a missing input must fail the build, ' +
        'never substitute (vault 4.16).',
    );
  }
  return join(MASTERS, match);
}

function main() {
  mkdirSync(SHIPPED, { recursive: true });

  /** @type {Record<string, { channels: Float32Array[], peak: number, url: string, frames: number, rate: number }>} */
  const cues = {};

  // --- 1. Trim the nine SFX, and read the two beds for measurement only. ---
  for (const key of Object.keys(MIX_DB)) {
    const isBed = key.startsWith('bed-');
    const master = masterFor(key);

    if (isBed) {
      // OGG: shipped verbatim, because it loops whole and needs no local edit — which is also why it
      // could be requested as OGG in the first place. Node cannot decode it, so its level is measured
      // in the browser by the e2e gate, against the exact bytes below.
      const url = `assets/audio/${key}.ogg`;
      copyFileSync(master, join('public', url));
      cues[key] = { channels: null, peak: null, url, frames: null, rate: null };
      continue;
    }

    const decoded = decodeWav(new Uint8Array(readFileSync(master)));
    const trimmed = trimToEvent(decoded.channels, decoded.sampleRate);
    // 🔴 **The trim is what creates the click** *(inventory 2b.8)*. `trimToEvent` cuts back to just
    // before the loudest moment, and that cut lands on whatever sample is there — not a zero
    // crossing. Measured across the nine cues: `jump` opened at **0.0888** where six others were
    // under 0.0013, i.e. twelve times its nearest neighbour, on the most-triggered cue in the game.
    //
    // Faded HERE rather than on the shipped file, because a post-hoc edit to `public/assets/audio/`
    // is undone by the next `assets:audio` run — silently, with the click back and every gate green.
    fadeInChannels(trimmed.channels, decoded.sampleRate);
    const url = `assets/audio/${key}.wav`;
    writeFileSync(join('public', url), encodeWav(trimmed.channels, decoded.sampleRate));

    cues[key] = {
      channels: trimmed.channels,
      peak: peakDbfs(trimmed.channels),
      url,
      frames: trimmed.frames,
      rate: decoded.sampleRate,
    };
  }

  // --- 2. Solve the headroom scalar against the worst-case stack. ---
  //
  // Beds contribute to the stack but cannot be decoded here, so they are represented by a
  // constant block at their role weight. That OVER-states them — a real bed is not at full scale
  // for its whole length — which is the correct direction for a worst case to err in.
  const stackFrames = Math.max(...WORST_CASE_STACK.map((k) => cues[k].frames ?? 0), 1);
  const weighted = WORST_CASE_STACK.map((key) => {
    const weight = 10 ** (MIX_DB[key] / 20);
    if (cues[key].channels === null) {
      return [new Float32Array(stackFrames).fill(weight)];
    }
    const normalise = 1 / 10 ** (cues[key].peak / 20);
    return cues[key].channels.map((channel) => {
      const out = new Float32Array(channel.length);
      for (let i = 0; i < channel.length; i += 1) out[i] = channel[i] * normalise * weight;
      return out;
    });
  });

  const unscaled = sumPeakDbfs(weighted);
  const headroomDb = TARGET_STACK_DBFS - unscaled;
  const headroom = 10 ** (headroomDb / 20);

  // --- 3. Catalog rows, merged into whatever else index.json already holds. ---
  const rows = Object.keys(MIX_DB).map((key) => {
    const weight = 10 ** (MIX_DB[key] / 20);
    const normalise = cues[key].peak === null ? 1 : 1 / 10 ** (cues[key].peak / 20);
    return {
      key: `sfx-${key}`.replace('sfx-bed-', 'bed-'),
      url: cues[key].url,
      // Rounded to four places: the difference is inaudible and an unrounded float in a committed
      // JSON file re-writes itself on every build, which makes every diff noise.
      gain: Number(Math.min(1, normalise * weight * headroom).toFixed(4)),
      loop: key.startsWith('bed-'),
    };
  });

  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const byKey = new Map((catalog.audio ?? []).map((row, index) => [row.key, index]));
  catalog.audio = catalog.audio ?? [];
  for (const row of rows) {
    const existing = byKey.get(row.key);
    if (existing !== undefined) catalog.audio[existing] = row;
    else catalog.audio.push(row);
  }
  writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);

  // --- 4. Report. Every number, so the QA log is a copy rather than a re-derivation. ---
  const gainOf = (key) => rows.find((r) => r.url.endsWith(`/${key}.wav`) || r.url.endsWith(`/${key}.ogg`)).gain;
  const scaled = WORST_CASE_STACK.map((key, i) =>
    weighted[i].map((channel) => {
      const out = new Float32Array(channel.length);
      for (let j = 0; j < channel.length; j += 1) out[j] = channel[j] * headroom;
      return out;
    }),
  );

  console.log('cue'.padEnd(14), 'master dBFS'.padStart(12), 'gain'.padStart(8), 'frames'.padStart(8));
  for (const key of Object.keys(MIX_DB)) {
    console.log(
      key.padEnd(14),
      (cues[key].peak === null ? 'ogg (browser)' : cues[key].peak.toFixed(2)).padStart(12),
      String(gainOf(key)).padStart(8),
      String(cues[key].frames ?? '—').padStart(8),
    );
  }
  console.log('');
  console.log(`worst-case stack, unscaled : ${unscaled.toFixed(2)} dBFS`);
  console.log(`headroom scalar solved     : ${headroomDb.toFixed(2)} dB`);
  console.log(`worst-case stack, shipped  : ${sumPeakDbfs(scaled).toFixed(2)} dBFS  (target ${TARGET_STACK_DBFS})`);
  console.log(`wrote ${rows.length} rows to ${CATALOG}`);
}

if (!existsSync(MASTERS)) {
  throw new Error(`build-audio: ${MASTERS}/ is absent. Re-fetch the masters from the request ids in docs/GENERATION-LOG.md.`);
}
main();
