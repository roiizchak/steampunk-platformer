/**
 * The loudness instrument — criteria 7.2 and 7.3.
 *
 * Pure arithmetic over `Float32Array` channels. It never reads a file and never knows a container
 * format, which is what lets **one** implementation serve both sample sources:
 *
 *   - **Node**, for the WAV cues: `readWav()` from `wav.mjs`, in the unit suite.
 *   - **The browser**, for the OGG beds and for criterion 7.2's combined stack:
 *     `AudioContext.decodeAudioData` returns `Float32Array` per channel, under Playwright, measuring
 *     the exact bytes that ship.
 *
 * 🔴 That split is why the arithmetic is here rather than inside either caller. The first draft of
 * the plan measured WAV in Node and OGG in the browser and **never combined them** — two correct
 * halves that never meet do not measure the whole, and criterion 7.2's stack mixes both containers.
 * Codex plan review F2.
 *
 * ## Everything is float, and that is vault 7.3
 *
 * *"A +2.00 dBFS master decoded as 16-bit integer reports its peak as exactly 0.0 — the instrument
 * saturates at the value it is supposed to detect."* Nothing here clamps to ±1 and nothing
 * accumulates into an integer. `sumPeakDbfs` can and does return positive dBFS; a stack that clips
 * must be able to SAY it clips, or the gate is decoration.
 */

/**
 * The value reported for digital silence.
 *
 * A real `20*log10(0)` is `-Infinity`, which propagates through every later comparison and formats
 * as `-Infinity` in a report. A finite sentinel keeps criterion 7.3's "no cue is silent" failure
 * readable, and is far below any floor a real recording reaches — the silent generation vault 7.1
 * records measured **−37.9 dBFS**, which is 260 dB above this.
 */
export const SILENCE_FLOOR_DBFS = -300;

/**
 * Amplitude → dBFS.
 *
 * Exported only so criterion 7.2's Playwright spec can transport `sumPeakDbfs` into the page by
 * `Function.prototype.toString()` — `sumPeakDbfs` closes over this, and a closure that is not
 * carried across becomes a `ReferenceError` in the browser. Transporting the real source is what
 * keeps 7.2 asserted against **one** definition of the arithmetic rather than two that agree on the
 * happy path; the spec additionally checks the transported copy against this one on a fixture.
 *
 * @param {number} amplitude
 * @returns {number}
 */
export function toDbfs(amplitude) {
  if (!(amplitude > 0)) {
    return SILENCE_FLOOR_DBFS;
  }
  return 20 * Math.log10(amplitude);
}

/**
 * Largest absolute sample across every channel, as dBFS.
 *
 * Across channels, not just the first: a cue panned hard right is silent on the left, and measuring
 * only channel 0 would report it as broken.
 *
 * @param {Float32Array[]} channels
 * @returns {number} dBFS; `SILENCE_FLOOR_DBFS` for digital silence. May exceed 0 for a hot buffer.
 */
export function peakDbfs(channels) {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const magnitude = Math.abs(channel[i]);
      if (magnitude > peak) {
        peak = magnitude;
      }
    }
  }
  return toDbfs(peak);
}

/**
 * Peak of the worst-case simultaneous mix — criterion 7.2.
 *
 * Sums every cue **frame-aligned from sample zero**, which is the honest worst case: cues triggered
 * on the same tick start together, and their transients — the loudest part of a percussive cue, by
 * construction — therefore land on top of each other. Aligning any other way would measure a mix the
 * game does not produce.
 *
 * Channel count and length are handled by extension rather than by rejection: a mono cue contributes
 * to every channel of the stack, and a cue that ends early simply stops contributing. Reading past a
 * short cue's end is how a sum acquires a `NaN` that then formats as a passing number.
 *
 * @param {Float32Array[][]} cues  One entry per simultaneous sound; each is its own channel array.
 * @returns {number} dBFS of the summed peak. **Positive means it clips.**
 */
export function sumPeakDbfs(cues) {
  if (cues.length === 0) {
    return SILENCE_FLOOR_DBFS;
  }

  const channelCount = Math.max(...cues.map((cue) => cue.length));
  const frames = Math.max(...cues.map((cue) => Math.max(...cue.map((c) => c.length), 0)), 0);
  if (channelCount === 0 || frames === 0) {
    return SILENCE_FLOOR_DBFS;
  }

  let peak = 0;
  for (let channel = 0; channel < channelCount; channel += 1) {
    for (let frame = 0; frame < frames; frame += 1) {
      let sum = 0;
      for (const cue of cues) {
        // A mono cue plays into every channel; it is not silent on the right.
        const samples = cue[channel] ?? cue[0];
        if (samples !== undefined && frame < samples.length) {
          sum += samples[frame];
        }
      }
      const magnitude = Math.abs(sum);
      if (magnitude > peak) {
        peak = magnitude;
      }
    }
  }
  return toDbfs(peak);
}

/**
 * Peak and floor for one cue, the shape criterion 7.3 reports.
 *
 * `floorDbfs` is the QUIETEST non-silent moment, not the mean: vault 7.1's failure was a cue that was
 * silence end to end, and a mean is dragged upward by one click. A cue whose floor equals its peak is
 * a constant tone; a cue whose peak equals `SILENCE_FLOOR_DBFS` is nothing at all.
 *
 * @param {Float32Array[]} channels
 * @returns {{ peakDbfs: number, floorDbfs: number }}
 */
export function measureCue(channels) {
  let quietest = Infinity;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const magnitude = Math.abs(channel[i]);
      if (magnitude > 0 && magnitude < quietest) {
        quietest = magnitude;
      }
    }
  }
  return {
    peakDbfs: peakDbfs(channels),
    floorDbfs: quietest === Infinity ? SILENCE_FLOOR_DBFS : toDbfs(quietest),
  };
}

/**
 * The sources that can sound on ONE tick, plus both beds — criterion 7.2's worst case.
 *
 * 🔴 **Here, rather than in either consumer, because it was written out twice.** The gain solver
 * (`build-audio.mjs`) and the gate that checks its work (`phase-07-clipping.spec.ts`) each carried
 * their own copy with nothing asserting the two agreed. A future combat change adding a ninth
 * simultaneous source could be applied to one list and not the other, and both would stay green
 * while the solver optimised a mix the gate no longer measured — the same "two correct halves that
 * never meet" shape Codex plan review F2 caught one level down, in the arithmetic. The gate owner's
 * brief caught it one level up, in the list.
 *
 * Names are bare cue names; the catalog prefixes the one-shots with `sfx-`.
 *
 * ⚠️ `hit` is in this list because `kill` is. `strike()` increments the hit count on the killing
 * blow like any other, so `enemyKilled` is never raised without `hitLanded` (`playerAttack.ts`).
 *
 * `jump`, `attack` and `death` are absent, each for a reason rather than by oversight: a jump leaves
 * the ground so it cannot also land or footstep on the same tick, an attack that connects started
 * ticks earlier, and death replaces hurt rather than accompanying it (`worldDamage.ts` returns one
 * or the other, never both).
 *
 * ⚠️ The list is over-conservative in two places and should stay that way: `land + footstep` and
 * `hurt + footstep` are both unreachable, because `advanceStride` zeroes the counter unless the
 * state resolved to `walk` or `run`, which neither a landing nor a hurt tick does. Over-stating the
 * worst case errs in the safe direction; do not "fix" it.
 */
export const WORST_CASE_STACK = [
  // 🔴 `complete` joins the stack — inventory 3.6, 2026-08-23. It fires once per level, but not in
  // isolation: `levelCompleted` arrives while the player is still walking into the gate, so a
  // footstep and a landing are both live on that tick, and a gear collected on the same tick as the
  // goal is reachable. A worst case should OVER-state — the same argument this file already makes
  // about the beds — so it is counted rather than argued away.
  'complete',
  'land',
  'footstep',
  'hurt',
  'hit',
  'kill',
  'pickup',
  'bed-music',
  'bed-ambience',
];
