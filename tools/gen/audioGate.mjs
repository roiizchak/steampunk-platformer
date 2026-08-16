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

function toDbfs(amplitude) {
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
