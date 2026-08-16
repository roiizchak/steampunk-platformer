import { expect, test } from '@playwright/test';

import { SILENCE_FLOOR_DBFS, sumPeakDbfs, toDbfs } from '../../tools/gen/audioGate.mjs';

/**
 * Phase 7 — criterion 7.2, and it is the criterion Codex plan review F2 was written about.
 *
 * *"The worst-case simultaneous stack peaks at or below −1.0 dBFS, summed in **one** calculation
 * over both containers."*
 *
 * ## 🔴 Why this is a browser spec and not a unit test
 *
 * The stack mixes **WAV cues and OGG beds**. The first draft of the plan measured the WAV half in
 * Node and the OGG half in the browser — two correct halves that never meet. Each could pass while
 * the mixed stack was never summed at all, which is precisely the shape of a gate that cannot go red.
 *
 * `AudioContext.decodeAudioData` is the one decoder that handles both containers, so 7.2 is computed
 * here, once, over all eight sources, from **the bytes the server actually serves**.
 *
 * ## 🔴 And why the arithmetic is transported rather than rewritten
 *
 * `sumPeakDbfs` is carried into the page by `Function.prototype.toString()`, not reimplemented in a
 * `page.evaluate` body. A second implementation would agree with the first on every case anyone
 * thought to check and diverge on the one nobody did. `transportAgrees` below pins the transported
 * copy against the Node original on a fixture, so a transport that silently broke fails as a
 * transport failure rather than as a passing measurement.
 *
 * The alternative — decode in the page and ship the samples back to Node — moves ~90 MB of
 * `Float32Array` across CDP for the two 120-second beds alone.
 */

/** Criterion 7.2's ceiling. Digital full scale is 0; −1.0 dBFS leaves the mix one dB of room. */
const MAX_STACK_DBFS = -1.0;

/**
 * The worst case, and `hit` is in it because of Codex plan review F1.
 *
 * An enemy kill runs through `strike()`, which increments `hits` on the **killing** blow too
 * (`src/sim/playerAttack.ts:109-110`), so `hitLanded` is necessarily true whenever `enemyKilled` is.
 * The first draft of this list omitted `sfx-hit` and therefore measured a mix the game cannot
 * produce — quieter than reality, on the game's most important moment.
 *
 * Both beds are included because both are **always** sounding: they are the floor every cue lands on
 * top of, not an optional layer.
 *
 * The plausible one-frame coincidence: the player lands from a fall onto a gear while a scavenger's
 * contact damage registers and the same swing kills it.
 */
const WORST_CASE_STACK = [
  'sfx-land',
  'sfx-footstep',
  'sfx-hurt',
  'sfx-hit',
  'sfx-kill',
  'sfx-pickup',
  'bed-music',
  'bed-ambience',
] as const;

/**
 * `sumPeakDbfs` plus the closure it needs, as source text for `new Function`.
 *
 * `SILENCE_FLOOR_DBFS` is inlined as a literal and `toDbfs` is carried whole; `sumPeakDbfs` reads
 * both. Built once at module scope so the same string is used by the fixture check and by the
 * measurement.
 */
const GATE_SOURCE = [
  `const SILENCE_FLOOR_DBFS = ${SILENCE_FLOOR_DBFS};`,
  toDbfs.toString(),
  sumPeakDbfs.toString(),
  'return sumPeakDbfs;',
].join('\n');

interface StackMeasurement {
  stackDbfs: number;
  perSource: { key: string; gain: number; peakDbfs: number; seconds: number; channels: number }[];
  transportAgrees: boolean;
  sampleRate: number;
}

test.describe('Phase 7 — 7.2 the worst-case simultaneous stack does not clip', () => {
  test('eight sources, both containers, one calculation, at or below -1.0 dBFS', async ({
    page,
  }) => {
    await page.goto('/');

    const measured: StackMeasurement = await page.evaluate(
      async ({ gateSource, wanted, ceiling }) => {
        const sum = new Function(gateSource)() as (cues: Float32Array[][]) => number;

        // 🔴 The transported arithmetic, pinned against the Node original before it is trusted.
        // Two DC buffers at 0.5 sum to exactly 1.0, which is 0 dBFS — a value chosen because it is
        // the boundary this criterion is about, so a transport that lost a sign or a channel cannot
        // land on it by accident.
        const half = () => [Float32Array.from([0.5, 0.5, 0.5])];
        const transportAgrees = Math.abs(sum([half(), half()]) - 0) < 1e-9;

        const catalog = (await (await fetch('/assets/index.json')).json()) as {
          audio: { key: string; url: string; gain: number }[];
        };

        // A shared context, so every source decodes at ONE sample rate. Decoding the beds on a
        // different context than the cues would resample them differently and the frame-aligned sum
        // would silently compare samples that do not represent the same instant.
        const context = new AudioContext();
        const perSource: StackMeasurement['perSource'] = [];
        const stack: Float32Array[][] = [];

        for (const key of wanted) {
          const row = catalog.audio.find((entry) => entry.key === key);
          if (!row) {
            throw new Error(`catalog has no audio row "${key}"`);
          }
          const bytes = await (await fetch(`/${row.url}`)).arrayBuffer();
          const buffer = await context.decodeAudioData(bytes);

          const channels: Float32Array[] = [];
          let peak = 0;
          for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            // `getChannelData` hands back the live array, so the gain is applied in place rather
            // than into a copy — the two beds alone are ~90 MB of Float32 at 120 seconds each.
            const samples = buffer.getChannelData(channel);
            for (let i = 0; i < samples.length; i += 1) {
              samples[i] *= row.gain;
              const magnitude = Math.abs(samples[i]);
              if (magnitude > peak) peak = magnitude;
            }
            channels.push(samples);
          }

          stack.push(channels);
          perSource.push({
            key,
            gain: row.gain,
            peakDbfs: peak > 0 ? 20 * Math.log10(peak) : -300,
            seconds: buffer.duration,
            channels: buffer.numberOfChannels,
          });
        }

        void ceiling;
        const result: StackMeasurement = {
          stackDbfs: sum(stack),
          perSource,
          transportAgrees,
          sampleRate: context.sampleRate,
        };
        await context.close();
        return result;
      },
      { gateSource: GATE_SOURCE, wanted: [...WORST_CASE_STACK], ceiling: MAX_STACK_DBFS },
    );

    // Type before value, and transport before measurement. A `NaN` compares false against every
    // bound, so a broken sum would otherwise read as a clean pass.
    expect(measured.transportAgrees, 'the transported sumPeakDbfs disagrees with the Node one').toBe(
      true,
    );
    expect(Number.isFinite(measured.stackDbfs)).toBe(true);
    expect(measured.perSource, 'not every source in the worst case was measured').toHaveLength(
      WORST_CASE_STACK.length,
    );

    // 🔴 Non-vacuity, and it is what stops this from being decoration. A stack of eight silent files
    // sums to silence and clears any ceiling; so does a fetch that 404'd into an empty buffer. The
    // measurement has to prove it HEARD something before its upper bound means anything — the same
    // trap Phase 6 hit with a ratio, where "does it cost much" passes trivially when nothing runs.
    for (const source of measured.perSource) {
      expect(source.peakDbfs, `${source.key} contributed silence`).toBeGreaterThan(-40);
      expect(source.seconds, `${source.key} decoded to nothing`).toBeGreaterThan(0.05);
    }
    expect(measured.stackDbfs, 'the whole stack measured as near-silence').toBeGreaterThan(-30);

    const report = measured.perSource
      .map((s) => `${s.key} ${s.peakDbfs.toFixed(2)} dBFS ×${s.gain}`)
      .join(' | ');
    expect(
      measured.stackDbfs,
      `stack ${measured.stackDbfs.toFixed(2)} dBFS at ${measured.sampleRate} Hz — ${report}`,
    ).toBeLessThanOrEqual(MAX_STACK_DBFS);
  });
});
