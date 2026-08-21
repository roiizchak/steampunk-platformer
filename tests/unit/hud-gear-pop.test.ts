/**
 * `src/scenes/hudGearPop.ts` — criterion 9.4's OBSERVABLE force-settle.
 *
 * ## Why the gear pop is the subject and the level-complete fade is not
 *
 * 9.4 is "a tween's end value is written even when the tween is stopped early". `hudFade.ts` force-
 * settles too, and that settle is **not independently observable**: on its only call path
 * (`UIScene.levelComplete(null)` at shutdown) the targets are destroyed on the next two lines, so an
 * assertion about their final alpha would be an assertion about an object nobody can ever see again.
 * That is decoration, and this project treats decoration as a defect. The gear icon is drawn every
 * frame and **survives its own tween**, so its settle is a fact about the running game.
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
  stop(): void;
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

function fakeScene(icon: { scale: number }) {
  const added: AddedTween[] = [];
  const scene = {
    tweens: {
      add(cfg: TweenConfig): AddedTween {
        const handle: AddedTween = {
          cfg,
          scaleAtAdd: icon.scale,
          stop() {
            cfg.onStop?.();
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
    const { added, scaleCalls, clears, pop } = build();
    pop.pop();
    added[0].stop();

    expect(scaleCalls.at(-1)).toBe(BASE);
    expect(clears()).toBe(1);
  });

  it('run to completion settles to the same end state', () => {
    const { added, scaleCalls, clears, pop } = build();
    pop.pop();
    added[0].cfg.onComplete?.();

    expect(scaleCalls.at(-1)).toBe(BASE);
    expect(clears()).toBe(1);
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
    const { scaleCalls, clears, pop } = build();
    pop.pop();
    pop.destroy();

    expect(scaleCalls.at(-1)).toBe(BASE);
    expect(clears()).toBe(1);
    expect(() => pop.destroy()).not.toThrow();
  });

  it('the duration is ticksToMs(7) — ticks, never a millisecond literal', () => {
    const { added, pop } = build();
    pop.pop();

    expect(POP_TICKS).toBe(7);
    expect(added[0].cfg.duration).toBe(ticksToMs(7));
  });
});
