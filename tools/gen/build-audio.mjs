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

/**
 * Make-up gain applied to the two beds, and ONLY to them — 2026-08-29.
 *
 * 🔴 **The owner played the game and could barely hear it**, at volume 50, with their speakers at
 * 100 %. Measured with `ffmpeg -af volumedetect` against the shipped masters and the gains this file
 * had solved: `bed-music` reached the player at **−48.6 dBFS RMS** and `bed-ambience` at
 * **−45.2**, together about **−43.6**. Games and music master to roughly −16 to −20. The constant
 * background of this game was about a twentieth of normal amplitude.
 *
 * ## The cause is a UNIT MISMATCH in `MIX_DB`, not a bad number in it
 *
 * `MIX_DB` is documented as *"relative loudness per cue, in dB"*, and for the ten WAV cues it is
 * applied to a **peak-normalised** signal — so `-13` means "peaks 13 dB below the reference". The two
 * beds are OGG, `decodeWav` cannot read them, and `normalise` therefore falls back to **1**: their
 * weight is applied to whatever level the file happens to sit at. Same column, two different
 * meanings.
 *
 * The beds happen to be quiet and very dynamic — a measured **19 dB crest factor** — so a `-13`
 * "relative loudness" lands about 19 dB lower in the terms a listener hears than the same number
 * does on a peak-normalised one-shot. The table said 13 and 15 dB down. They were 32 and 34 down.
 *
 * ## Why this is a make-up constant and not a corrected `normalise`
 *
 * Peak-normalising the beds is the obvious repair and it is **not enough**: measured, it is worth
 * +5.5 dB on `bed-music` and **+0.0** on `bed-ambience`, which already peaks at full scale. With a
 * 19 dB crest a bed cannot reach a normal RMS by peak-normalising at all — its peaks would pass
 * 0 dBFS first. Beds are mixed by RMS; one-shots are mixed by peak. This constant is that
 * distinction, made explicit.
 *
 * ## Why the beds can afford it and the one-shots cannot
 *
 * Criterion 7.2 decodes the real files in a browser and measures the real worst-case stack — the
 * authority, unlike the constant-block model below. On 2026-08-29 it measured **−4.45 dBFS**
 * against its own −1.0 ceiling, and in that stack the two beds contributed **5.4 %** of the summed
 * peak: `bed-music` −29.49 dBFS and `bed-ambience` −25.77, against one-shots running −10.8 to −22.
 * The beds' own peaks also fall at 96.2 s and 17.8 s into 120 s loops, nowhere near a one-shot's
 * onset. So lifting the beds moves the stack very little, and lifting the one-shots would move it a
 * lot.
 *
 * ⚠️ **The figure is confirmed by re-running 7.2, never by arithmetic.** A naive peak-sum says the
 * stack sits at +3.92 dBFS; the browser says −4.45. `sumPeakDbfs` adds WAVEFORMS sample by sample,
 * and the peaks do not align — an 8.4 dB difference. Any future change to this number is measured
 * the same way or it is guessed.
 */
const BED_MAKEUP_DB = 11;
const BED_MAKEUP = 10 ** (BED_MAKEUP_DB / 20);

/**
 * The beds' own RMS, linear, as measured from the shipped masters.
 *
 * ```
 * ffmpeg -i _generated/audio/bed-music-<id>.ogg    -af volumedetect -f null -   # mean -24.6 dBFS
 * ffmpeg -i _generated/audio/bed-ambience-<id>.ogg -af volumedetect -f null -   # mean -19.2 dBFS
 * ```
 *
 * Recorded rather than computed, because Node cannot decode OGG — the same limit that caused the
 * unit mismatch `BED_MAKEUP_DB` documents. Re-measure with the commands above if a bed is re-shot.
 */
const BED_RMS = {
  'bed-music': 10 ** (-24.6 / 20),
  'bed-ambience': 10 ** (-19.2 / 20),
};

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
      // Beds: a constant block at their role weight, their make-up, and their MEASURED level.
      //
      // ⚠️ **This used to fill the block at FULL SCALE**, under a comment calling that a deliberate
      // over-statement in the safe direction. It is not safe once the beds carry a make-up gain: at
      // full scale the two blocks dominate the sum, the solved scalar collapses, and the make-up is
      // paid for by attenuating every one-shot. Measured on 2026-08-29: it pulled `footstep` from
      // 0.2983 to 0.2019 and still gave the beds only +8.6 dB of the +12 they were granted.
      //
      // A continuous source's contribution to a COINCIDENT peak is its instantaneous level, and the
      // expected value of that is its RMS — not its peak, which assumes an alignment that criterion
      // 7.2 exists to check for real, in a browser, against the real files. That gate is the
      // authority; this block only has to stop the solver being absurd.
      return [new Float32Array(stackFrames).fill(weight * BED_MAKEUP * BED_RMS[key])];
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
      // The beds carry the RMS make-up; the one-shots do not. See `BED_MAKEUP_DB`.
      gain: Number(
        Math.min(1, normalise * weight * headroom * (key.startsWith('bed-') ? BED_MAKEUP : 1)).toFixed(4),
      ),
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
