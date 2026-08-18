import { expect } from '@playwright/test';

import type { hudDrawState } from './hudHelpers';

type Probe = Awaited<ReturnType<typeof hudDrawState>>;

/**
 * Every assertion that the HUD was really DRAWING across a measured window — criterion 6.9's
 * non-vacuity half, and the reason its budget is a statement about the HUD rather than about
 * nothing.
 *
 * Split out of `phase-06-perf.spec.ts` on 2026-08-18, when the AB/BA restructure and the GPU-delta
 * statistic pushed that spec past the 400-line rule. Nothing here changed in the move; the guards
 * and their reasons are Phase 6's and the gate owners' who found each one.
 *
 * Called at BOTH edges of every HUD-on window, because a HUD that stopped drawing halfway through
 * leaves an entry check green and quietly cheapens the half being measured.
 */
export function assertHudWasDrawing(enter: Probe, exit: Probe, window: number): void {
  /**
   * 🔴 **The guard the ratio cannot make.** Asserted at BOTH edges of the window, because a HUD
   * that stopped drawing halfway through leaves an entry check green and quietly cheapens the
   * half being measured — the same reason 5.11 re-reads `opaque` after its fleet window.
   */
  for (const [when, probe] of [
    ['entering', enter],
    ['leaving', exit],
  ] as const) {
    expect(probe.uiActive, `the UI scene was not active ${when} HUD-on window ${window}`).toBe(true);
    expect(
      probe.plateWillRender,
      `the HUD plate would not render ${when} HUD-on window ${window}`,
    ).toBe(true);
    expect(
      probe.counterWillRender,
      `the gear counter would not render ${when} HUD-on window ${window}`,
    ).toBe(true);
    expect(
      probe.barWillRender,
      `the health bar would not render ${when} HUD-on window ${window}. A hidden bar still ` +
        `QUEUES its rectangle, so the command-buffer check below cannot see this — and a ` +
        `hidden object is CHEAPER, so the budget would pass more easily for it.`,
    ).toBe(true);
    expect(
      probe.gearIconWillRender,
      `the gear icon would not render ${when} HUD-on window ${window}`,
    ).toBe(true);
    expect(
      probe.barWidestRect,
      `the health bar queued styling but FILLED NOTHING ${when} HUD-on window ${window}. ` +
        `Deleting the fillRect while leaving the fillStyle keeps the command buffer non-empty ` +
        `and the alpha healthy while painting no pixels at all.`,
    ).toBeGreaterThan(0);
    expect(
      probe.barCommands,
      `the health bar had ZERO Graphics commands queued ${when} HUD-on window ${window}. The ` +
        `HUD is not drawing, so the ratio below would be comparing "nothing" against ` +
        `"nothing" and would PASS. This is the assertion that stops a broken HUD reading as a ` +
        `cheap one (vault 9.4).`,
    ).toBeGreaterThan(0);

    /**
     * 🔴 Alpha, because none of the four probes above can see it. `willRender` ignores alpha
     * entirely, and `fillStyle(colour, 0)` still fills the command buffer — so a HUD faded to
     * nothing satisfies every check above, draws no visible pixel, and costs LESS, which reads
     * as a pass. Found by the performance owner's adversarial brief.
     */
    for (const [what, alpha] of [
      ['plate', probe.plateAlpha],
      ['counter', probe.counterAlpha],
      ['health bar fill', probe.barFillAlpha],
      ['gear icon', probe.gearIconAlpha],
    ] as const) {
      expect(
        alpha,
        `the ${what} is at alpha ${alpha} ${when} HUD-on window ${window} — it is submitted to ` +
          `the renderer and paints nothing a player can see, which is CHEAPER and would pass ` +
          `the budget below for exactly the wrong reason (vault 9.4).`,
      ).toBeGreaterThan(0);
    }
  }
}
