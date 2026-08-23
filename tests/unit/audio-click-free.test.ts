import { describe, expect, it } from 'vitest';
import { readBytes } from '../../tools/gen/png.mjs';
import { firstSampleMagnitude } from '../../tools/gen/audioFade.mjs';

/**
 * # No shipped cue starts with a step — inventory 2b.8
 *
 * A waveform whose first sample is far from zero is a step discontinuity, and a step is a **click**.
 * Measured across all nine shipped cues on 2026-08-23:
 *
 * | cue | first sample |
 * |---|---|
 * | `jump` | **0.0888** ← the defect |
 * | `hurt` | 0.0073 |
 * | `death` | 0.0045 |
 * | `kill` | 0.0012 |
 * | `hit`, `land` | 0.0005 |
 * | `attack`, `footstep`, `pickup` | ≤0.0003 |
 *
 * `jump` was **twelve times** its nearest neighbour, on the cue the player triggers more than any
 * other. Fixed with a 2 ms linear fade-in (`tools/gen/audioFade.mjs`) rather than a trim: trimming
 * to the first zero crossing throws away the transient that makes a jump read as a jump, while a
 * ramp removes the step and keeps it. Peak stayed at 0.789 — the cue is unchanged apart from its
 * first 88 samples.
 *
 * ⚠️ **This gate is over the SHIPPED bytes**, so it also catches a regenerated cue arriving with the
 * same defect — which is how `jump` got here in the first place. The threshold is set an order of
 * magnitude above the eight good cues and an order below the bad one, so it is a real bound rather
 * than a line drawn under today's numbers.
 *
 * **The mutation this names:** restore `jump.wav` from before the fade.
 */

/** An order of magnitude above the worst clean cue (0.0073), an order below the defect (0.0888). */
const MAX_FIRST_SAMPLE = 0.02;

const CUES = [
  'attack',
  'death',
  'footstep',
  'hit',
  'hurt',
  'jump',
  'kill',
  'land',
  'pickup',
] as const;

describe('shipped cues open without a click (2b.8)', () => {
  it('reads every cue — a missing file would make the loop below vacuous', () => {
    for (const cue of CUES) {
      const bytes = readBytes(`public/assets/audio/${cue}.wav`);
      expect(bytes.length, `${cue}.wav is empty or missing`).toBeGreaterThan(1000);
    }
  });

  for (const cue of CUES) {
    it(`${cue}.wav starts at silence`, () => {
      const first = firstSampleMagnitude(readBytes(`public/assets/audio/${cue}.wav`));
      expect(first, `${cue}.wav is not 16-bit PCM — this gate cannot read it`).not.toBeNull();
      expect(
        first!,
        `${cue}.wav opens at ${first!.toFixed(4)}, over ${MAX_FIRST_SAMPLE}. That is a step ` +
          `discontinuity and it clicks. Run \`node tools/gen/audioFade.mjs ` +
          `public/assets/audio/${cue}.wav\` — do NOT raise this bound.`,
      ).toBeLessThanOrEqual(MAX_FIRST_SAMPLE);
    });
  }

  it('the bound is meaningful — the clean cues sit well under it', () => {
    // The counter-fixture. A bound of 1.0 would pass everything; this asserts the eight cues that
    // never had the defect are an order of magnitude clear, so the threshold is a real separation.
    const worstClean = Math.max(
      ...CUES.filter((c) => c !== 'jump').map(
        (c) => firstSampleMagnitude(readBytes(`public/assets/audio/${c}.wav`)) ?? 1,
      ),
    );
    expect(worstClean).toBeLessThan(MAX_FIRST_SAMPLE / 2);
  });
});
