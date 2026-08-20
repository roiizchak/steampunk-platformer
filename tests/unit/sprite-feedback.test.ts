/**
 * Per-sprite impact feedback — the DECISION half. Engine-free *(vault 2.12)*.
 *
 * The transforms applied to an existing sprite: the flinch, the hit flash, the landing squash and the
 * i-frame flicker, plus the measured `ATTACK_CONTACT_FRAME_INDEX`. Split out of `effects.test.ts` for
 * the 400-line rule, along the same seam the source is split on — the emitter half lives there.
 *
 * The force-settle tests (`flinchOffset`, `landSquash`) are `toBe`, never `toBeCloseTo`. A transform
 * that settles at 1e-17 instead of 0 leaves the sprite permanently, invisibly displaced, and nothing
 * downstream can tell that apart from correct.
 *
 * 🔴 **`iframeAlpha` never returning 0** is the other load-bearing one. Alpha 0 is how the vault's
 * blocker shipped invisible menu cards with a fully green suite, and 45 ticks of an invisible player
 * loses positional tracking.
 *
 * Two of the gates here exist because the first version of them did not gate anything: the neutral
 * return values were a shared mutable object a consumer could poison, and the feel constants
 * (`FLINCH_LIFT`, `FLINCH_RETURN_TICKS`, `LAND_SQUASH_SX`) could all be neutralised at once with the
 * suite green. Taste is exactly the case that needs a literal — a retune should be a visible edit.
 */

import { describe, expect, it } from 'vitest';
import {
  ATTACK_CONTACT_FRAME_INDEX,
  flinchOffset,
  hitFlashAlpha,
  iframeAlpha,
  landSquash,
  ticksSinceHit,
} from '../../src/render/effects';
import { HITSTOP_TICKS, type Freezable, type ImpactClass } from '../../src/sim/hitstop';
import { IFRAME_TICKS } from '../../src/sim/combat';

const IMPACTS: ImpactClass[] = ['light', 'lethal', 'playerHurt'];

const neverHit = (): Freezable => ({ hitstopUntil: -1, lastHitTick: -1 });

/**
 * The SHIPPED catalog, read the way every other catalog test in this suite reads it — Vite's `?raw`
 * glob rather than `node:fs`, so the Global Constraints' frozen dependency list is not disturbed and
 * the suite still runs with Phaser uninstalled (criterion 1.3).
 *
 * `ATTACK_CONTACT_FRAME_INDEX` is a measurement taken against this file. Reading the clip length back
 * out of it is what makes a regenerated sheet able to turn the assertion red — a hard-coded frame
 * count cannot, which is precisely the re-measurement trigger the constant exists to provide.
 */
const CATALOG = import.meta.glob('../../public/assets/index.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface SheetEntry {
  key: string;
  frameCount: number;
  simTicks: number;
}

const ATTACK_CLIP = (
  JSON.parse(Object.values(CATALOG)[0] as string) as { sheets: SheetEntry[] }
).sheets.find((sheet) => sheet.key === 'brass-courier-attack') as SheetEntry;

describe('ticksSinceHit', () => {
  it('is null for a body that was never hit — the -1 sentinel', () => {
    expect(ticksSinceHit(neverHit(), 0)).toBe(null);
    expect(ticksSinceHit(neverHit(), 5000)).toBe(null);
  });

  it('counts from the hit tick, and keeps counting past the end of the freeze', () => {
    const body: Freezable = { hitstopUntil: 100 + HITSTOP_TICKS.lethal, lastHitTick: 100 };
    expect(ticksSinceHit(body, 100)).toBe(0);
    expect(ticksSinceHit(body, 109)).toBe(9);
    expect(ticksSinceHit(body, 400)).toBe(300);
  });
});

describe('flinchOffset force-settles', () => {
  it('is neutral for a body that was never hit', () => {
    expect(flinchOffset(null, 'light', 1)).toEqual({ dx: 0, dy: 0 });
  });

  it('holds a STEP for the whole freeze, mirrored by facing', () => {
    for (const impact of IMPACTS) {
      const held = flinchOffset(0, impact, 1);
      expect(held.dx).toBeGreaterThan(0);
      for (let t = 0; t <= HITSTOP_TICKS[impact]; t += 1) {
        expect(flinchOffset(t, impact, 1)).toEqual(held);
      }
      expect(flinchOffset(0, impact, -1).dx).toBe(-held.dx);
    }
  });

  it('pins the step, the LIFT and the return length as literals', () => {
    // The phase's entire visible output is these numbers, and taste is exactly the case that needs a
    // literal: a retune should be a visible edit, not a silent one. `dy` is asserted because nothing
    // else in this file looks at it, so `FLINCH_LIFT` could go to 0 — no vertical component at all —
    // with the suite green.
    expect(flinchOffset(0, 'light', 1)).toEqual({ dx: 6, dy: -1.5 });
    expect(flinchOffset(0, 'lethal', 1)).toEqual({ dx: 10, dy: -2.5 });
    expect(flinchOffset(0, 'playerHurt', 1)).toEqual({ dx: 8, dy: -2 });

    // The return is exactly 6 ticks, asserted on BOTH sides of its last tick rather than by a loose
    // upper bound that a doubled length would still satisfy.
    expect(flinchOffset(HITSTOP_TICKS.lethal + 5, 'lethal', 1)).not.toEqual({ dx: 0, dy: 0 });
    expect(flinchOffset(HITSTOP_TICKS.lethal + 6, 'lethal', 1)).toEqual({ dx: 0, dy: 0 });
  });

  it('returns a FROZEN neutral that a consumer cannot poison', () => {
    // The neutral is a shared module-level object. Unfrozen, a scene writing
    // `const o = flinchOffset(...); o.dx *= RENDER_SCALE;` permanently poisons it, and every enemy
    // that was never hit is drawn off its collision box forever — with this suite green, because
    // nothing here mutates. Freezing makes that a throw at runtime and `Readonly<>` makes it a
    // typecheck failure, which is the earlier of the two.
    const neutral = flinchOffset(null, 'light', 1);
    expect(Object.isFrozen(neutral)).toBe(true);
    expect(() => {
      (neutral as { dx: number }).dx = 42;
    }).toThrow();
    expect(flinchOffset(null, 'lethal', -1)).toEqual({ dx: 0, dy: 0 });
    expect(flinchOffset(999, 'lethal', -1)).toEqual({ dx: 0, dy: 0 });
  });

  it('overshoots past zero on the way back — a small one', () => {
    const step = flinchOffset(0, 'lethal', 1).dx;
    const past = [];
    for (let t = HITSTOP_TICKS.lethal + 1; t < HITSTOP_TICKS.lethal + 20; t += 1) {
      past.push(flinchOffset(t, 'lethal', 1).dx);
    }
    expect(past.some((dx) => dx < 0)).toBe(true);
    expect(Math.min(...past)).toBeGreaterThan(-step * 0.3);
  });

  it('returns to EXACTLY 0 and STAYS 0, for every impact class and both facings', () => {
    // The force-settle property applied to the one thing this phase animates in the world.
    for (const impact of IMPACTS) {
      for (const facing of [1, -1] as const) {
        let settledAt: number | null = null;
        for (let t = 0; t <= 600; t += 1) {
          const { dx, dy } = flinchOffset(t, impact, facing);
          if (settledAt !== null) {
            expect(dx).toBe(0);
            expect(dy).toBe(0);
          } else if (dx === 0 && dy === 0 && t > HITSTOP_TICKS[impact]) {
            settledAt = t;
          }
        }
        expect(settledAt).not.toBe(null);
        expect(settledAt as number).toBeLessThan(HITSTOP_TICKS[impact] + 12);
      }
    }
  });
});

describe('hitFlashAlpha', () => {
  it('is 0 for a body that was never hit', () => {
    for (const impact of IMPACTS) {
      expect(hitFlashAlpha(null, impact)).toBe(0);
    }
  });

  it('DECAYS a light hit to exactly 0, and stays there', () => {
    expect(hitFlashAlpha(0, 'light')).toBe(1);
    expect(hitFlashAlpha(1, 'light')).toBeLessThan(1);
    expect(hitFlashAlpha(2, 'light')).toBeLessThan(hitFlashAlpha(1, 'light'));
    expect(hitFlashAlpha(HITSTOP_TICKS.light, 'light')).toBe(0);
    expect(hitFlashAlpha(HITSTOP_TICKS.light + 50, 'light')).toBe(0);
  });

  it('HOLDS a lethal or playerHurt flash blown out for the whole freeze', () => {
    for (const impact of ['lethal', 'playerHurt'] as const) {
      for (let t = 0; t < HITSTOP_TICKS[impact]; t += 1) {
        expect(hitFlashAlpha(t, impact)).toBe(1);
      }
      expect(hitFlashAlpha(HITSTOP_TICKS[impact], impact)).toBe(0);
      expect(hitFlashAlpha(HITSTOP_TICKS[impact] + 1, impact)).toBe(0);
    }
  });
});

describe('landSquash', () => {
  it('is neutral when nothing landed', () => {
    expect(landSquash(null)).toEqual({ sx: 1, sy: 1 });
  });

  it('squashes on the landing tick and is roughly area-preserving throughout', () => {
    const first = landSquash(0);
    expect(first.sx).toBeGreaterThan(1);
    expect(first.sy).toBeLessThan(1);
    for (let t = 0; t <= 5; t += 1) {
      const { sx, sy } = landSquash(t);
      expect(sx * sy).toBeCloseTo(1, 10);
    }
  });

  it('runs for 3 ticks and returns to EXACTLY 1 — both sides of the boundary', () => {
    // 2 ticks reads as a glitch at 60 Hz; this is the reason the boundary is where it is.
    expect(landSquash(2).sx).toBeGreaterThan(1);
    expect(landSquash(3)).toEqual({ sx: 1, sy: 1 });
    expect(landSquash(4)).toEqual({ sx: 1, sy: 1 });
    expect(landSquash(900)).toEqual({ sx: 1, sy: 1 });
  });

  it('pins the squash peak and every tick of its relaxation as literals', () => {
    // `LAND_SQUASH_SX` 1.18 -> 1.0001 is a 0.01 % squash — invisible, and "greater than 1" accepts
    // it. Taste needs a literal for exactly this reason.
    expect(landSquash(0).sx).toBeCloseTo(1.18, 12);
    expect(landSquash(1).sx).toBeCloseTo(1.12, 12);
    expect(landSquash(2).sx).toBeCloseTo(1.06, 12);
  });

  it('returns a FROZEN neutral, for the same reason flinchOffset does', () => {
    const neutral = landSquash(null);
    expect(Object.isFrozen(neutral)).toBe(true);
    expect(() => {
      (neutral as { sx: number }).sx = 42;
    }).toThrow();
    expect(landSquash(900)).toEqual({ sx: 1, sy: 1 });
  });

  it('relaxes monotonically back toward 1', () => {
    expect(landSquash(0).sx).toBeGreaterThan(landSquash(1).sx);
    expect(landSquash(1).sx).toBeGreaterThan(landSquash(2).sx);
  });
});

describe('iframeAlpha', () => {
  it('NEVER returns 0 across the whole 45-tick i-frame window', () => {
    // Alpha 0 is exactly how the vault's blocker shipped invisible menu cards with a fully green
    // suite. 45 ticks of an invisible player is three quarters of a second of lost positional
    // tracking, and the flicker is supposed to say "invulnerable", not "gone".
    for (let counter = 0; counter < IFRAME_TICKS; counter += 1) {
      expect(
        iframeAlpha(counter, IFRAME_TICKS),
        `iframeAlpha returned 0 at counter ${counter}. The floor is 0.35 and never 0.`,
      ).toBeGreaterThanOrEqual(0.35);
    }
  });

  it('alternates on a 6-tick period, 3 on and 3 off — asserted at every phase boundary', () => {
    expect(iframeAlpha(0, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(2, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(3, IFRAME_TICKS)).toBe(0.35);
    expect(iframeAlpha(5, IFRAME_TICKS)).toBe(0.35);
    expect(iframeAlpha(6, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(8, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(9, IFRAME_TICKS)).toBe(0.35);
  });

  it('is fully opaque once the window has lapsed — both sides of the boundary', () => {
    // 41 is the last DIM tick inside the window; 47 has the same phase and is outside it. If the
    // window guard were missing, 47 would come back at 0.35 — so this pair is the boundary.
    expect(iframeAlpha(41, IFRAME_TICKS)).toBe(0.35);
    expect(iframeAlpha(IFRAME_TICKS - 1, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(IFRAME_TICKS, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(IFRAME_TICKS + 1, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(47, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(9999, IFRAME_TICKS)).toBe(1);
  });

  it('closes the window at exactly iframeTicks, whatever the flicker phase', () => {
    // The guard is `counter >= iframeTicks` — the negation of `windowOpen`'s `counter < knob`
    // (vault 5.5). An off-by-one to `>` grants one extra tick, and that extra tick is only VISIBLE
    // when it lands on the dim half of the period. `iframeAlpha(0, 0)` cannot see it (0 % 6 = 0 is
    // the lit half, so both versions return 1) — which is what the previous version of this test
    // claimed to catch and could not. A window whose length is itself a dim-phase counter can:
    // 3 % 6 = 3 and 45 % 6 = 3 both land on the dim half.
    expect(iframeAlpha(3, 3)).toBe(1);
    expect(iframeAlpha(IFRAME_TICKS, IFRAME_TICKS)).toBe(1);
    // A zero-length window still accepts nothing, which is the knob-of-0 branch itself.
    expect(iframeAlpha(0, 0)).toBe(1);
  });
});

describe('a state that never happened draws nothing', () => {
  it('is neutral end to end for a body that was never hit', () => {
    const body = neverHit();
    const since = ticksSinceHit(body, 1234);
    expect(since).toBe(null);
    expect(flinchOffset(since, 'lethal', 1)).toEqual({ dx: 0, dy: 0 });
    expect(hitFlashAlpha(since, 'lethal')).toBe(0);
    expect(landSquash(null)).toEqual({ sx: 1, sy: 1 });
  });
});

describe('the attack contact frame', () => {
  it('is the measured texture frame 4, inside the clip the CATALOG actually ships', () => {
    // A measurement traced on 2026-08-20 against the shipped sheet, not a preference.
    //
    // The clip length is read back out of `public/assets/index.json` rather than hard-coded, so a
    // regenerated sheet at a different frame count turns this red — which is the whole point of the
    // constant. `sheetGates.mjs`'s G5 will still pass on such a sheet, because it only asks whether
    // contact falls inside the active window, and a mid-wind-up frame inside the window is exactly
    // the defect this constant exists to fix.
    expect(ATTACK_CONTACT_FRAME_INDEX).toBe(4);
    expect(Number.isInteger(ATTACK_CONTACT_FRAME_INDEX)).toBe(true);
    expect(ATTACK_CONTACT_FRAME_INDEX).toBeGreaterThanOrEqual(0);
    expect(
      ATTACK_CONTACT_FRAME_INDEX,
      `the shipped brass-courier-attack clip has ${ATTACK_CLIP.frameCount} texture frames, so ` +
        `frame ${ATTACK_CONTACT_FRAME_INDEX} is outside it. Re-measure the contact frame against ` +
        `the regenerated sheet — do not just move this number.`,
    ).toBeLessThan(ATTACK_CLIP.frameCount);
    // The swing length the contact tick was traced against, pinned from the same source.
    expect(ATTACK_CLIP.simTicks).toBe(20);
  });
});
