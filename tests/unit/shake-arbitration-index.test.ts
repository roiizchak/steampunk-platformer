/**
 * D8 — **shake arbitration must judge the shake it DRAWS**, not the one the world is on.
 *
 * ## The defect
 *
 * `applyShake(camera, tick - 1)` draws the offset for index `tick - 1`, because the frame reporting
 * `tick` has not run index `tick` yet. Inventory 3.1 aligned `applyShake` and `landSquash` to that
 * and **left `shouldPreempt` reading `tick`** — so arbitration measured a running shake as one tick
 * more decayed than it was on screen, and a more decayed shake is easier to preempt.
 *
 * Found by the Phase 9 close round's `code-reviewer` brief (finding F2 → D8), confirmed independently
 * by the Codex implementation review, and fixed on 2026-08-24 as an **owner-approved balance change**
 * — it changes which shakes truncate which at the window boundary, which is why it was not fixed
 * silently when it was found.
 *
 * ## Two tests, because one of them cannot fail on its own
 *
 * **The first is the decision test**: it proves the index is *observable at all* — that
 * `shouldPreempt` genuinely answers differently at `tick` and `tick - 1` on a real boundary case.
 * Without it, the source gate below would be pinning a distinction that makes no difference, which is
 * the "gate for a burst of zero particles" shape.
 *
 * **The second is the source gate**: it pins which index the scene actually passes. `arm` lives
 * inside `attachEffects`'s closure and takes the tick from `render`, so there is no seam to call it
 * through — the same reason the sibling draw-path gates read source text. A behavioural test would be
 * the stronger of the two *(CLAUDE.md §2)* and there is nowhere to attach one.
 *
 * Together they say: the choice matters, and this is the choice that ships.
 */

import { describe, expect, it } from 'vitest';
import { SHAKE, shakeEnergy, shouldPreempt, type ShakeState } from '../../src/render/screenShake';

const GAME_EFFECTS: string = Object.entries(
  import.meta.glob('../../src/scenes/gameEffects.ts', { query: '?raw', import: 'default', eager: true }),
)[0]![1] as string;

describe('D8 — the arbitration index is observable', () => {
  it('shouldPreempt answers DIFFERENTLY at tick and tick - 1 on a boundary case', () => {
    // A running `land` shake, and a candidate whose peak sits between the energy at two adjacent
    // ticks. That is exactly the window where the off-by-one changed the outcome — and it is the
    // reason this fix is a balance change rather than a tidy-up.
    const started = 100;
    const running: ShakeState = { startedTick: started, cmd: SHAKE.land };
    const span = SHAKE.land.durationTicks;

    const differing = [];
    for (let t = started + 1; t <= started + span; t += 1) {
      const eNow = shakeEnergy(running, t);
      const eDrawn = shakeEnergy(running, t - 1);
      if (eNow === eDrawn) continue;
      // A candidate peak strictly between the two energies is preempted under one index and not the
      // other. `shouldPreempt` is `peak >= energy`, and energy at `t - 1` is the LARGER of the two.
      // `shakePeak` is `hypot(ax, ay)`, so `ax = between, ay = 0` builds a command of exactly that
      // peak — the peak is derived, never stored, and inventing a `peak` field would test nothing.
      const between = (eNow + eDrawn) / 2;
      const candidate = { durationTicks: SHAKE.land.durationTicks, ax: between, ay: 0 };
      const asDrawn = shouldPreempt(running, candidate, t - 1);
      const asWorld = shouldPreempt(running, candidate, t);
      if (asDrawn !== asWorld) differing.push({ t, eNow, eDrawn });
    }
    expect(
      differing.length,
      'shouldPreempt gives the same answer at every tick and tick-1 in a live window — then the ' +
        'index below is pinning a distinction with no consequence, and this gate is decoration.',
    ).toBeGreaterThan(0);
  });

  it('a running shake reads as MORE energetic at the drawn index — the direction of the fix', () => {
    // Energy decays, so reading one tick earlier reads higher, so preemption becomes HARDER. That is
    // the safe direction and the one the preemption rule in `screenShake.ts`'s header argues for:
    // small events must not truncate big ones.
    const running: ShakeState = { startedTick: 100, cmd: SHAKE.land };
    expect(shakeEnergy(running, 101)).toBeGreaterThan(shakeEnergy(running, 102));
  });
});

describe('D8 — and the scene passes the DRAWN index', () => {
  it('gameEffects arms through shouldPreempt(…, tick - 1)', () => {
    expect(
      GAME_EFFECTS,
      'arbitration is reading the world tick again while applyShake draws tick - 1 — D8 is back. ' +
        'A running shake then measures one tick more decayed than it appears, and a small event ' +
        'truncates a big one it should not reach.',
    ).toContain('shouldPreempt(shake, cmd, tick - 1)');
  });

  it('and draws at the same index it arbitrates on — the two must not drift apart again', () => {
    // The pair is the point. 3.1 moved one reader and left the other; naming both here means the
    // next move has to touch this line.
    expect(GAME_EFFECTS).toContain('applyShake(camera, tick - 1)');
  });
});
