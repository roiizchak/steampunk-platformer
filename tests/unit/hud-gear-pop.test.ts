/**
 * `src/scenes/hudGearPop.ts` — criterion 9.4's OBSERVABLE force-settle.
 *
 * ## The fade is gated too — this is one of two files, not a substitute for the other
 *
 * 9.4's own wording is *"a fade"*, and an earlier version of this header argued that the gear pop
 * should stand in for it because `hudFade.ts`'s settle is not independently observable. The
 * substitution was accepted and then it was the finding: deleting **both** of `hudFade.ts`'s
 * `onStop` settles left 2073/2073 green, so the criterion's named subject had no gate at all while
 * its stand-in had a good one. `tests/unit/hud-fade.test.ts` now covers the fade directly — the
 * observability objection was real, and the answer to it was a fake scene, not a substitution.
 *
 * ## Why a hand-written fake and not Phaser
 *
 * `npm run test:sim-isolated` uninstalls Phaser and runs this suite. Nothing here may import it —
 * which is also the reason `hudGearPop.ts` takes `Phaser` as a TYPE-only import. The fake carries
 * exactly the four surfaces the module touches and nothing else, so it cannot drift into a mock of
 * an engine.
 *
 * ## Every assertion below is written to fail if the module does nothing
 *
 * A `setScale(baseScale)` that was never moved off `baseScale` satisfies "the icon ended at
 * `baseScale`" while drawing no pop at all. So the pop's own reach is asserted first — the tween
 * config must name a scale that is NOT `baseScale`, and a tint must actually be applied — and the
 * settle assertions are read from the LAST recorded call, after that reach.
 */

import { describe, expect, it } from 'vitest';
import { attachGearPop, POP_TICKS } from '../../src/scenes/hudGearPop';
import { ticksToMs } from '../../src/sim';

/** Only what the module touches. Every call is recorded in order. */
interface TweenConfig {
  targets: unknown;
  duration: number;
  onStop?: () => void;
  onComplete?: () => void;
  scale?: { from: number; to: number };
  [key: string]: unknown;
}

interface AddedTween {
  cfg: TweenConfig;
  /** The icon's scale AT THE MOMENT `tweens.add` was called — see the fourth test. */
  scaleAtAdd: number;
  /** Phaser's `stop()`: dispatches `onStop` **only if the tween is still live**. */
  stop(): void;
  /** Natural completion: dispatches `onComplete`, then the tween is removed. */
  complete(): void;
  /** `TweenManager.shutdown()` → `killAll()` → `BaseTween.destroy()`: dispatches NOTHING. */
  destroy(): void;
}

function fakeIcon() {
  const scaleCalls: number[] = [];
  const tintCalls: number[] = [];
  let cleared = 0;
  const icon = {
    scale: 0,
    setScale(v: number) {
      scaleCalls.push(v);
      icon.scale = v;
      return icon;
    },
    setTint(v: number) {
      tintCalls.push(v);
      return icon;
    },
    clearTint() {
      cleared += 1;
      return icon;
    },
  };
  return { icon, scaleCalls, tintCalls, clears: () => cleared };
}

/**
 * 🔴 The fake tween obeys Phaser 4.2.1's ACTUAL dispatch contract, and it did not.
 *
 * `stop()` used to invoke `cfg.onStop?.()` unconditionally. Real Phaser guards it:
 * `tweens/tween/BaseTween.js`'s `stop()` returns early unless the tween is live
 * (`!isRemoved() && !isPendingRemove() && !isDestroyed()`), and `destroy()` — which
 * `TweenManager.shutdown()` reaches through `killAll()` — sets `this.callbacks = null` and so
 * dispatches nothing at all.
 *
 * A fake that is more generous than the engine hides exactly the cases a force-settle exists for: a
 * `stop()` on an already-COMPLETED tween is silent, and a scene shutdown is a stop path with **no
 * callback whatsoever**. `hudGearPop.destroy()` used to lean on `onStop` for its settle, which is
 * why it now settles directly — a fix this fake could not have motivated and could not have proved.
 */
function fakeScene(icon: { scale: number }) {
  const added: AddedTween[] = [];
  const scene = {
    tweens: {
      add(cfg: TweenConfig): AddedTween {
        let live = true;
        const handle: AddedTween = {
          cfg,
          scaleAtAdd: icon.scale,
          stop() {
            if (!live) return;
            live = false;
            cfg.onStop?.();
          },
          complete() {
            if (!live) return;
            live = false;
            cfg.onComplete?.();
          },
          destroy() {
            live = false;
          },
        };
        added.push(handle);
        return handle;
      },
    },
  };
  return { scene, added };
}

/** Deliberately not 1: `addGearObject` sizes with `setDisplaySize`, so the icon's scale is derived. */
const BASE = 0.667;

function build() {
  const fake = fakeIcon();
  fake.icon.scale = BASE;
  const { scene, added } = fakeScene(fake.icon);
  const pop = attachGearPop(
    scene as unknown as Parameters<typeof attachGearPop>[0],
    fake.icon as unknown as Parameters<typeof attachGearPop>[1],
    BASE,
  );
  return { ...fake, added, pop };
}

describe('hudGearPop', () => {
  it('the pop actually reaches somewhere — otherwise every settle assertion below is decoration', () => {
    const { added, tintCalls, pop } = build();
    pop.pop();

    expect(added).toHaveLength(1);
    const scale = added[0].cfg.scale;
    expect(scale).toBeDefined();
    // The `from` is the passed-in base, never a literal 1 (`UIScene.ts:344-353`'s recorded bug).
    expect(scale?.from).toBe(BASE);
    // 🔴 The whole file rests on this: a tween whose `to` equals `baseScale` would satisfy "the icon
    // ended at baseScale" while drawing nothing at all.
    expect(scale?.to).not.toBe(BASE);
    expect(scale?.to).toBeGreaterThan(BASE);
    // And the tint the settle clears must have been applied in the first place.
    expect(tintCalls).toHaveLength(1);
  });

  it('stopped mid-pop settles to baseScale and clears the tint', () => {
    const { added, icon, scaleCalls, clears, pop } = build();
    pop.pop();
    // Mid-pop: the running tween has driven the icon somewhere else entirely. Without this the
    // "ended at BASE" assertion below is satisfied by an icon that never moved.
    icon.setScale(BASE * 1.31);
    added[0].stop();

    expect(icon.scale).toBe(BASE);
    expect(scaleCalls.at(-1)).toBe(BASE);
    // The END STATE, not a call count: `stopAndSettle` settles directly AND `onStop` settles again,
    // deliberately (see `settle`'s exit 3), so counting invocations would pin the belt-and-braces
    // rather than the behaviour.
    expect(clears()).toBeGreaterThanOrEqual(1);
  });

  it('run to completion settles to the same end state', () => {
    const { added, icon, scaleCalls, clears, pop } = build();
    pop.pop();
    icon.setScale(BASE * 1.31);
    added[0].complete();

    expect(icon.scale).toBe(BASE);
    expect(scaleCalls.at(-1)).toBe(BASE);
    expect(clears()).toBeGreaterThanOrEqual(1);
  });

  it('destroy() AFTER a completed pop still settles — Phaser dispatches nothing there', () => {
    // 🔴 The case the old fake could not express. Real `stop()` is a no-op on a tween that has
    // already completed or been removed, and `hudGearPop` never nulls its handle on completion — so
    // a `destroy()` that trusted `onStop` to settle would silently do nothing. `UIScene.applyLayout`
    // calls `destroy()` on every resize, which is very often exactly this state.
    const { added, icon, pop } = build();
    pop.pop();
    added[0].complete();
    // Something else moves the icon after the pop finished — a stale tween, a resize mid-frame.
    icon.setScale(BASE * 2);

    pop.destroy();

    expect(icon.scale, 'destroy() after completion left the icon off baseScale').toBe(BASE);
  });

  it('settles even when Phaser destroys the tween without dispatching anything', () => {
    // `TweenManager.shutdown()` → `killAll()` → `BaseTween.destroy()` nulls `callbacks`, so neither
    // `onStop` nor `onComplete` runs. The module must not depend on either.
    const { added, icon, pop } = build();
    pop.pop();
    icon.setScale(BASE * 1.31);
    added[0].destroy();

    pop.destroy();

    expect(icon.scale, 'a callback-free teardown left the icon off baseScale').toBe(BASE);
  });

  it('a second pop stops the first, and the icon is back at baseScale before the second config is read', () => {
    const { added, icon, pop } = build();
    pop.pop();
    // Mid-pop: the running tween has driven the icon somewhere else entirely.
    icon.setScale(BASE * 1.4);

    pop.pop();

    expect(added).toHaveLength(2);
    // 🔴 The point of the force-settle: the second tween's `from` is read off a settled icon.
    expect(added[1].scaleAtAdd).toBe(BASE);
    expect(added[1].cfg.scale?.from).toBe(BASE);
  });

  it('destroy() stops the running tween and settles, and is safe to call twice', () => {
    const { icon, scaleCalls, clears, pop } = build();
    pop.pop();
    icon.setScale(BASE * 1.31);
    pop.destroy();

    expect(icon.scale).toBe(BASE);
    expect(scaleCalls.at(-1)).toBe(BASE);
    expect(clears()).toBeGreaterThanOrEqual(1);
    expect(() => pop.destroy()).not.toThrow();
  });

  it('destroy() with NOTHING running still settles — the common case on every resize', () => {
    // `UIScene.applyLayout` runs `this.gearPop?.destroy()` on build and on every resize, almost
    // always with no pop in flight. The branch that handled it used to be the only one that settled
    // directly, and it had no fixture at all; the branch is gone now and this is what says so.
    const { icon, pop } = build();
    icon.setScale(BASE * 3);

    pop.destroy();

    expect(icon.scale, 'destroy() with no tween running did not settle').toBe(BASE);
  });

  it('the duration is ticksToMs(7) — ticks, never a millisecond literal', () => {
    const { added, pop } = build();
    pop.pop();

    expect(POP_TICKS).toBe(7);
    expect(added[0].cfg.duration).toBe(ticksToMs(7));
  });
});
