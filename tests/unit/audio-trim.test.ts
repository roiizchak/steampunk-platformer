/**
 * Trimming a generated cue down to its event — vault 7.1.
 *
 * *"Trim each cue to its first event — but a cue with a wind-up needs the trim to reach back before
 * the loudest moment."* Both halves are load-bearing and they pull in opposite directions, which is
 * why this is a function with a test rather than nine hand-picked timestamps.
 *
 * The masters make the problem concrete. Price is flat per generation, so every cue was generated at
 * 8 seconds and the event sits wherever the model put it — measured onsets across the nine range from
 * **29 ms to 691 ms**. Shipping them untrimmed would mean a jump cue that starts 270 ms after the
 * player pressed jump, which reads as broken input rather than as late audio.
 *
 * ## The two ways this goes wrong
 *
 * **Cutting at the onset clips the attack.** A transient's first cycle is part of its character; a
 * cut exactly on the threshold crossing removes the leading edge and turns a strike into a thump. So
 * the trim reaches back by a fixed pre-roll — that is vault 7.1's "before the loudest moment".
 *
 * **Cutting on a non-zero sample adds a click.** A hard edit at an arbitrary amplitude is a step
 * discontinuity, which is broadband noise — an artefact indistinguishable from the impact the cue is
 * supposed to be. The tail gets a short fade to zero, asserted below.
 */

import { describe, expect, it } from 'vitest';

import { encodeWav, trimToEvent } from '../../tools/gen/wav.mjs';
import { decodeWav } from '../../tools/gen/wav.mjs';
import { peakDbfs } from '../../tools/gen/audioGate.mjs';

const RATE = 44100;

/** Write a decaying burst of `burstMs` at `amplitude`, starting at `atMs`. */
function burstInto(channel: Float32Array, atMs: number, burstMs: number, amplitude: number): void {
  const start = Math.round((atMs / 1000) * RATE);
  const length = Math.round((burstMs / 1000) * RATE);
  for (let i = 0; i < length && start + i < channel.length; i += 1) {
    // Alternating sign so the peak is a real waveform, not a DC step.
    const decay = amplitude * (1 - i / length);
    channel[start + i] = i % 2 === 0 ? decay : -decay;
  }
}

/** Silence for `leadMs`, then a decaying burst — the shape every master actually has. */
function masterWith(leadMs: number, burstMs = 200, amplitude = 1): Float32Array[] {
  const channel = new Float32Array(Math.round(((leadMs + burstMs) / 1000) * RATE) + RATE);
  burstInto(channel, leadMs, burstMs, amplitude);
  return [channel, Float32Array.from(channel)];
}

/**
 * 🔴 What the masters ACTUALLY look like, and what the first version of this file did not.
 *
 * Price is flat per generation, so every cue was asked for at 8 seconds — and the model filled the
 * time. Measured on the shipped masters: `hurt` decays to −67 dB and then returns to **0 dB at
 * 1.85 s**; `land` does the same at 1.5 s. They are not one event with a tail, they are two or three
 * separate takes in one file, over a noise floor that never falls more than about 40 dB below peak.
 *
 * The original fixture here was a clean burst followed by digital zero. Every trim assertion passed
 * against it while the real trim produced **6.3-second cues** — a gate that could not go red for the
 * defect it existed to prevent *(vault C2)*. This fixture is that defect, committed.
 */
function masterWithSecondTake(): Float32Array[] {
  const channel = new Float32Array(RATE * 4);
  // A noise floor under everything, at about -40 dB, exactly as the generator produces.
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = (i % 7 < 3 ? 1 : -1) * 0.01;
  }
  burstInto(channel, 200, 250, 1); // the first event, the one we want
  burstInto(channel, 2000, 250, 1); // a second take, 1.75 s later, just as loud
  return [channel, Float32Array.from(channel)];
}

describe('trimToEvent', () => {
  it('removes the leading silence a flat-priced 8-second generation leaves in front of the event', () => {
    const trimmed = trimToEvent(masterWith(500), RATE);

    // 500 ms of lead is gone; what remains starts within the pre-roll of the event.
    expect(trimmed.frames).toBeLessThan(Math.round(0.5 * RATE));
    expect(trimmed.channels[0]!.length).toBe(trimmed.frames);
  });

  it('reaches back BEFORE the loudest moment, so the attack is not clipped', () => {
    // 🔴 Vault 7.1's second half. A trim that starts exactly at the threshold crossing removes the
    // leading edge of the transient. There must be silence in front of the peak in the output.
    const trimmed = trimToEvent(masterWith(500), RATE);
    const channel = trimmed.channels[0]!;

    let peakAt = 0;
    let peak = 0;
    for (let i = 0; i < channel.length; i += 1) {
      if (Math.abs(channel[i]!) > peak) {
        peak = Math.abs(channel[i]!);
        peakAt = i;
      }
    }
    expect(peakAt).toBeGreaterThan(0);
  });

  it('keeps the event itself at full level — a trim must not become an attenuation', () => {
    const before = peakDbfs(masterWith(500));
    const after = peakDbfs(trimToEvent(masterWith(500), RATE).channels);
    expect(after).toBeCloseTo(before, 1);
  });

  it('ends on silence, so the cut cannot click', () => {
    const trimmed = trimToEvent(masterWith(500), RATE);
    const channel = trimmed.channels[0]!;
    // A hard edit at a non-zero amplitude is a step discontinuity: broadband noise that sounds
    // exactly like the impact the cue is meant to be.
    expect(Math.abs(channel[channel.length - 1]!)).toBeLessThan(1e-3);
  });

  it('handles an event that starts immediately, without cutting into it', () => {
    const trimmed = trimToEvent(masterWith(0), RATE);
    expect(peakDbfs(trimmed.channels)).toBeCloseTo(peakDbfs(masterWith(0)), 1);
  });

  it('refuses a master that is silent end to end rather than emitting an empty cue', () => {
    // Vault 7.1's original failure: "very short and clean" returned -37.9 dBFS of nothing. A trimmer
    // that quietly returns zero frames turns that into a cue that loads, plays and is inaudible.
    const silent = [new Float32Array(RATE), new Float32Array(RATE)];
    expect(() => trimToEvent(silent, RATE)).toThrow(/silent/i);
  });

  it('preserves channel count', () => {
    expect(trimToEvent(masterWith(300), RATE).channels).toHaveLength(2);
  });

  /**
   * The regression that the clean-tail fixture could not express. Vault 7.1 says trim to the FIRST
   * event; the masters contain two or three.
   */
  it('keeps only the FIRST event when the master contains a second take', () => {
    const trimmed = trimToEvent(masterWithSecondTake(), RATE);

    // The second take starts at 2.0 s and the first ends by ~0.45 s. Anything over about a second
    // means the trim ran through the gap and swallowed both.
    expect(trimmed.frames / RATE).toBeLessThan(1.0);
  });

  it('is not defeated by a noise floor that never reaches digital silence', () => {
    // The end-of-cue test cannot be "the samples got quiet enough" in absolute terms: this master
    // never does. It has to be "quiet RELATIVE to this event, and stayed that way".
    const trimmed = trimToEvent(masterWithSecondTake(), RATE);
    expect(trimmed.frames).toBeGreaterThan(RATE * 0.1); // and it did not cut the event off either
  });

  it('never emits a cue longer than the cap, whatever the master does', () => {
    // A master that is loud end to end has no quiet window to cut on. A one-shot game cue that runs
    // for eight seconds is wrong regardless, so there is a ceiling and it is stated rather than
    // emergent.
    const loudThroughout = [new Float32Array(RATE * 8), new Float32Array(RATE * 8)];
    for (const channel of loudThroughout) {
      for (let i = 0; i < channel.length; i += 1) channel[i] = i % 2 === 0 ? 0.9 : -0.9;
    }
    expect(trimToEvent(loudThroughout, RATE).frames / RATE).toBeLessThanOrEqual(2.0);
  });
});

describe('encodeWav round-trips through decodeWav', () => {
  it('what is written is what is read back', () => {
    const source = trimToEvent(masterWith(400), RATE);
    const decoded = decodeWav(encodeWav(source.channels, RATE));

    expect(decoded.sampleRate).toBe(RATE);
    expect(decoded.channels).toHaveLength(2);
    expect(decoded.frames).toBe(source.frames);
    // 16-bit quantisation, so not exact — but the peak must survive, or the gate measures the
    // encoder rather than the cue.
    expect(peakDbfs(decoded.channels)).toBeCloseTo(peakDbfs(source.channels), 1);
  });

  it('writes a file the decoder recognises as 16-bit PCM', () => {
    const bytes = encodeWav([Float32Array.from([0, 0.5, -0.5, 0])], RATE);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });

  it('clamps rather than wrapping, so an over-unity sample cannot become its own negative', () => {
    // Integer overflow on encode turns a hot sample into a loud opposite-sign one: the single worst
    // artefact this pipeline could ship, and silent in every peak measurement taken before the write.
    const decoded = decodeWav(encodeWav([Float32Array.from([1.5, -1.5])], RATE));
    expect(decoded.channels[0]![0]).toBeGreaterThan(0.99);
    expect(decoded.channels[0]![1]).toBeLessThan(-0.99);
  });
});
