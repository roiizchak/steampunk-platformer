/**
 * Apply the named `PERF_MUTATION` to a booted, stormed page — every fixture the 9.5 gate can install,
 * in the one order that makes them work.
 *
 * Split out of `phase-09-perf.spec.ts` on 2026-08-24 (the 400-line rule, CLAUDE.md §3). The seam is a
 * real one: the ordering constraints below belong to the *fixtures*, not to the assertions, and
 * `tests/unit/perf-mutation-routing.test.ts` is what keeps the spec and the registry in step.
 *
 * ⚠️ **Call it AFTER `installStorm` and BEFORE any `setStorm` builds a population.** Both halves of
 * that are load-bearing and both are argued at the call sites below.
 */

import type { Page } from '@playwright/test';
import { setEmitterScale, setEnemyScale, setParticleScale } from './effectMutation';
import type { NamedMutation } from './effectMutation';
import { installBurstFixture, installCostLawFixture } from './effectSweep';
import { stallSimulation } from './windowStall';

export async function applyPerfMutation(page: Page, mutation: NamedMutation | ''): Promise<void> {
  if (mutation === 'stall') {
    await stallSimulation(page);
  }
  // 🔴 Both drawing mutations are applied HERE too, not only in the 9.6 test. Guard 0 in the spec is
  // 9.6's statistic standing in front of that file's milliseconds, and a guard never run against the
  // mutation it exists for is decoration. Under `scale0` every window still holds its full
  // population, still reports it alive, and draws none of it — which makes each arm CHEAPER and every
  // bound easier. Under `fleetscale0` the twenty enemies the headline assertion NAMES go undrawn,
  // which is the same defect one layer out.
  if (mutation === 'scale0') {
    await setEmitterScale(page, 0);
  }
  // 🔴 BEFORE any `setStorm` builds a population, and that ordering is the mutation working at all:
  // a constant scale op is emit-only, so it governs particles emitted after it and never the ones
  // already flying. `setParticleScale`'s docstring has the two wrong levers that went green first.
  if (mutation === 'particlescale0') {
    await setParticleScale(page, 0);
  }
  if (mutation === 'fleetscale0') {
    await setEnemyScale(page, 0);
  }
  // Guard 3's red proof: a per-frame cost independent of the particle count, with every particle
  // still emitted, alive and drawn. `installCostLawFixture` argues why that is the named mutation.
  if (mutation === 'flatcost') {
    await installCostLawFixture(page, 0);
  }
  // 🔴 The ONE mutation here that reddens a single bound and nothing else. It pays its cost on a
  // tenth of the frames, which `workP95Ms` sees and the three medians cannot — see
  // `installBurstFixture` for why that isolation is not available to the other three bounds.
  if (mutation === 'p95spike') {
    await installBurstFixture(page);
  }
}
