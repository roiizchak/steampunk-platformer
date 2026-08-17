/**
 * The `[5.11]` report line — every number criterion 5.11 measured, printed pass or fail.
 *
 * Split out of `phase-05-perf.spec.ts` on 2026-08-17, when the absolute frame-work bound the Codex
 * implementation review asked for carried that file past the 400-line rule. Pure formatting: it
 * asserts nothing and decides nothing, which is what makes it the right thing to move rather than
 * the docstrings that explain why each bound has the value it has.
 *
 * ⚠️ It prints on PASS as well as on failure, deliberately. **Every threshold in `perfBudget.ts` was
 * derived from these lines being readable in a GREEN run** — the burst table, the ms-per-tick spread,
 * the GPU medians. A gate whose numbers can only be read by breaking it cannot be re-derived, and
 * this session had to re-derive four of them.
 */

import type { Sample } from './perfSampler';

export function frameBudgetReport(args: {
  sampleTicks: number;
  baseline: Sample;
  fleet: Sample;
  before: { bodies: number };
  after: { bodies: number; inView: number };
  msPerTickOf: (s: Sample) => number;
  perTickMs: number;
}): string {
  const { sampleTicks, baseline, fleet, before, after, msPerTickOf, perTickMs } = args;
  const ratio = fleet.workMedianMs / baseline.workMedianMs;
  const fleetMsPerTick = msPerTickOf(fleet);
  const msPerTickRatio = fleetMsPerTick / msPerTickOf(baseline);
  const gpuRatio = fleet.gpuMedianMs / baseline.gpuMedianMs;
  const gpuBurstRatio = fleet.gpuP95Ms / baseline.gpuP95Ms;

  return (
    `[5.11] ${sampleTicks}-tick interleaved pair (>= 2 sentry volleys each), same page, real GPU.\n` +
    `       baseline ${before.bodies} bodies: work median ${baseline.workMedianMs.toFixed(2)}ms, ` +
    `p95 ${baseline.workP95Ms.toFixed(2)}ms over ${baseline.frames} frames / ${baseline.ticks} ticks, ` +
    `interval ${baseline.intervalMs.toFixed(2)}ms, ${baseline.loafCount} frames over 50ms\n` +
    `       fleet    ${after.bodies} bodies (${after.inView} in view): work median ` +
    `${fleet.workMedianMs.toFixed(2)}ms, p95 ${fleet.workP95Ms.toFixed(2)}ms over ${fleet.frames} ` +
    `frames / ${fleet.ticks} ticks, interval ${fleet.intervalMs.toFixed(2)}ms, ` +
    `${fleet.loafCount} frames over 50ms, peak ${fleet.maxProjectiles} bolts in flight\n` +
    `       ratios: median ${ratio.toFixed(2)}x, p95 ${gpuBurstRatio.toFixed(2)}x is GPU; work p95 ` +
    `${(fleet.workP95Ms / baseline.workP95Ms).toFixed(2)}x (REPORTED, not gated — see perfBudget.ts), ` +
    `for ${(after.bodies / before.bodies).toFixed(1)}x the enemies\n` +
    `       wall ms per sim tick: baseline ${msPerTickOf(baseline).toFixed(2)}ms, fleet ` +
    `${fleetMsPerTick.toFixed(2)}ms, ratio ${msPerTickRatio.toFixed(3)}x, against a ` +
    `${perTickMs.toFixed(2)}ms tick; fleet median frame ${fleet.workMedianMs.toFixed(2)}ms\n` +
    `       GPU: baseline median ${baseline.gpuMedianMs.toFixed(3)}ms / p95 ` +
    `${baseline.gpuP95Ms.toFixed(3)}ms over ${baseline.gpuSamples} samples ` +
    `(${baseline.gpuDisjointFrames} disjoint, ${baseline.gpuAbandoned} abandoned); fleet median ` +
    `${fleet.gpuMedianMs.toFixed(3)}ms / p95 ${fleet.gpuP95Ms.toFixed(3)}ms over ` +
    `${fleet.gpuSamples} samples (${fleet.gpuDisjointFrames} disjoint, ${fleet.gpuAbandoned} ` +
    `abandoned); ratios median ${gpuRatio.toFixed(2)}x, p95 ${gpuBurstRatio.toFixed(2)}x`
  );
}
