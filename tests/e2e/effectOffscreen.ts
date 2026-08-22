/**
 * 9.6's THIRD red proof: a storm the camera can only **half** see — `PERF_MUTATION=halfoffscreen`.
 *
 * ## Why a third fixture exists at all
 *
 * `on.inView` was `toBeGreaterThan(0)` under the message *"every submitted particle was outside the
 * camera"* (gate finding **L1**): 95 of 96 particles emitted off-camera passed it, so the message
 * named the only failure the assertion could not detect. It is now a COUNT —
 * `>= MIN_DRAWN_AT_PEAK` — and a strengthened bound proved only against a mutation the WEAK form
 * also caught has not been shown to be worth its own existence *(vault C2)*. The scratch fixture
 * that round used moved the whole storm to `view.x - 4000`, which takes `inView` to **0**: the old
 * `> 0` reds on that too. This is the fixture that lives in the gap between the two forms.
 *
 * ## What it does, and why the split is 48/48 rather than tuned
 *
 * It offsets the storm's emit point **per kind**, by `OFFSCREEN_DX` for `OFFSCREEN_KINDS` and by
 * nothing for the rest. `sparks` (32) and `dust` (16) go out; `steam` (48) stays. So:
 *
 *  - `drawn` stays at the shipped 96 — Phaser's particle renderer performs **no per-particle cull**,
 *    which is why `drawn` is 9.6's load-bearing statistic and `inView` its companion. The
 *    `drawn >= MIN_DRAWN_AT_PEAK` assertion therefore PASSES here, and that is the point: the only
 *    thing this fixture changes is where the particles are.
 *  - `inView` reads `steam`'s population, ~48 — comfortably **above 0** and comfortably **below 64**.
 *
 * The margin is structural rather than fitted. The counts come from `EMITTER_SPECS`'s own
 * `maxAliveParticles`, so the split cannot drift with the harness, the frame rate or the box; and
 * `steam` is the kind left in view deliberately, because its 45-tick lifespan is the longest of the
 * three and its held population is therefore the steadiest between top-ups.
 *
 * `OFFSCREEN_DX` is not tuned either: the view is 1920 px wide at zoom 1, so a 4000 px offset puts
 * the emit point more than two view-widths out, against a per-particle drift bounded by
 * `speedMax * lifespanTicks` — 9 px/tick over 18 ticks for `sparks`, 162 px. Nothing can wander back.
 *
 * ## Ordering, and why it is the same trap `particlescale0` fell into twice
 *
 * The offset governs particles emitted AFTER it. Applied to a full population it changes nothing
 * until the old particles expire, and a run that reads the counts before that reports `inView 96`
 * and passes — a mutation that did nothing. So the caller applies it **before** `setStorm` builds
 * the population, exactly as the spec orders `setParticleScale`, and `setStorm`'s `killAll` is what
 * makes the whole population inherit it.
 *
 * ## Scope: 9.6 only
 *
 * This is a placement fixture, not a cost one. `phase-09-perf.spec.ts` wires it nowhere and would
 * run clean under it — 9.5's budget is about how many particles the frame carried, and an
 * off-camera particle costs exactly as much as an on-camera one. That is the same fact `inView`
 * exists to keep honest, pointing the other way.
 */

import type { EffectKind } from '../../src/render/effects';

type Page = import('@playwright/test').Page;

/** Two view-widths out at zoom 1 — see the header for why this is a bound and not a tuning. */
export const OFFSCREEN_DX = 4000;

/** The kinds pushed out: 32 + 16 of the 96, leaving `steam`'s 48 the only ones the camera can see. */
export const OFFSCREEN_KINDS: readonly EffectKind[] = ['sparks', 'dust'];

/**
 * Set the storm's per-kind emit offset. Pass `[]` to restore every kind to the view centre.
 *
 * Reaches the same `window.__fxStorm` handle `installStorm` publishes, so the emitters, the caps and
 * the top-up loop are untouched: the ONLY thing that differs between a clean run and this one is the
 * x the shipped `explode` is called with.
 */
export async function setStormOffscreen(
  page: Page,
  kinds: readonly EffectKind[],
): Promise<void> {
  await page.evaluate(
    ({ kinds, dx }: { kinds: string[]; dx: number }) => {
      const w = window as unknown as { __fxStorm?: { offsets: Record<string, number> } };
      if (w.__fxStorm === undefined) {
        throw new Error('setStormOffscreen before installStorm — the top-up loop is not running');
      }
      const offsets: Record<string, number> = {};
      for (const kind of kinds) {
        offsets[kind] = dx;
      }
      w.__fxStorm.offsets = offsets;
    },
    { kinds: [...kinds] as string[], dx: OFFSCREEN_DX },
  );
}
