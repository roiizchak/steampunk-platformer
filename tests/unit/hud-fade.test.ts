/**
 * 🔴 Criterion 9.4's NAMED subject: *"a fade force-settles its end value on stop as well as on
 * complete"*.
 *
 * ## Why this file did not exist, and why that was the finding
 *
 * Phase 9 substituted the HUD gear pop as 9.4's observable subject, on the argument that
 * `hudFade.ts`'s settle is not independently observable — its only call path,
 * `UIScene.levelComplete(null)`, destroys the fade and the text on the next two lines, so an
 * assertion about their final alpha would be an assertion about objects nobody can ever see again.
 * The argument is honest and `hudFade.ts:157-161` made it in the open.
 *
 * It was still a hole. Deleting **both** `onStop` settles left 2073/2073 green; `hudFade` occurred
 * in `tests/` exactly once, as prose; `showLevelComplete` and `FADE_ALPHA` occurred in no test at
 * all. The criterion says *a fade*, and the fade was ungated.
 *
 * **The answer to "not observable in production" is a fake scene, not a substitution.** The module
 * was one `import type` away from being drivable — it names no Phaser value — and the objection
 * evaporates the moment the objects are ones this file owns rather than ones `UIScene` is about to
 * destroy.
 *
 * ## The three exits, per the vendored engine
 *
 * `stop()` dispatches `onStop` **only while the tween is live**; natural completion dispatches
 * `onComplete` and writes the end value itself (`TweenData.js` assigns `target[key] = current`
 * before its `if (complete)` branch); `BaseTween.destroy()`, which `TweenManager.shutdown()` reaches
 * through `killAll()`, nulls `callbacks` and dispatches nothing. The fake below obeys all three.
 */

import { describe, expect, it } from 'vitest';
import { FADE_ALPHA, FADE_MS, FADE_TICKS, showLevelComplete } from '../../src/scenes/hudFade';
import { ticksToMs } from '../../src/sim';

interface TweenConfig {
  targets: unknown;
  alpha?: number;
  duration?: number;
  onStop?: () => void;
  onComplete?: () => void;
  [key: string]: unknown;
}

interface FakeTween {
  cfg: TweenConfig;
  stop(): void;
  complete(): void;
  destroy(): void;
}

/** A drawn object, recording only what `hudFade.ts` writes to it. */
function fakeObject(kind: 'rect' | 'text') {
  const obj = {
    kind,
    alpha: 1,
    destroyed: false,
    /** Set by the fake scene when a tween writes this object's final value. */
    setOrigin: () => obj,
    setScrollFactor: () => obj,
    setDepth: () => obj,
    setAlpha: (a: number) => {
      obj.alpha = a;
      return obj;
    },
    destroy: () => {
      obj.destroyed = true;
    },
  };
  return obj;
}

function fakeScene() {
  const objects: ReturnType<typeof fakeObject>[] = [];
  const tweens: FakeTween[] = [];
  /** Every call that mattered, in order — the destroy() ordering assertion reads this. */
  const log: string[] = [];

  const record = <T extends ReturnType<typeof fakeObject>>(o: T): T => {
    objects.push(o);
    const inner = o.destroy;
    o.destroy = () => {
      log.push(`destroy:${o.kind}`);
      inner();
    };
    return o;
  };

  const scene = {
    scale: { width: 1920, height: 1080 },
    add: {
      // Identity matters: `hudFade` holds the object the chain returns, so `o` itself is returned
      // and its `destroy` is wrapped in place — never a spread copy, which would leave the module
      // writing alpha to one object while this file asserts about another.
      rectangle: () => record(fakeObject('rect')),
      text: () => record(fakeObject('text')),
    },
    tweens: {
      add(cfg: TweenConfig): FakeTween {
        let live = true;
        const t: FakeTween = {
          cfg,
          stop() {
            if (!live) return;
            live = false;
            log.push('stop');
            cfg.onStop?.();
          },
          complete() {
            if (!live) return;
            live = false;
            // Phaser writes the end value itself at v = 1, then dispatches. Modelled, so a test
            // that only checks the final alpha cannot pass because the FAKE wrote it.
            cfg.onComplete?.();
          },
          destroy() {
            live = false;
          },
        };
        tweens.push(t);
        return t;
      },
    },
  };

  return { scene, objects, tweens, log };
}

const INFO = {
  title: 'LEVEL COMPLETE',
  gears: '5 / 7 gears',
  best: 'best 6 / 7',
  prompt: 'press any key',
};

function build() {
  const fake = fakeScene();
  const overlay = showLevelComplete(
    fake.scene as unknown as Parameters<typeof showLevelComplete>[0],
    INFO,
  );
  return { ...fake, overlay };
}

describe('the fade actually animates — otherwise every settle below is decoration', () => {
  it('starts at alpha 0 and tweens to a DIFFERENT value', () => {
    const { overlay, tweens } = build();

    // 🔴 The non-vacuity check. A fade built at `FADE_ALPHA` and tweened to `FADE_ALPHA` satisfies
    // "the fade ended at FADE_ALPHA" while dimming nothing at all, which is the exact shape of
    // every gate this phase found measuring nothing.
    expect(overlay.fade.alpha, 'the fade must start transparent').toBe(0);
    expect(tweens).toHaveLength(2);
    expect(tweens[0].cfg.alpha).toBe(FADE_ALPHA);
    expect(tweens[0].cfg.alpha).not.toBe(0);
    expect(FADE_ALPHA).toBeGreaterThan(0);
    expect(FADE_ALPHA).toBeLessThan(1);
  });

  it('starts the four overlay lines transparent and tweens them to 1', () => {
    const { overlay, tweens } = build();
    expect(overlay.lines).toHaveLength(4);
    for (const line of overlay.lines) {
      expect(line.alpha).toBe(0);
    }
    expect(tweens[1].cfg.alpha).toBe(1);
  });

  it('expresses both durations in TICKS, never a millisecond literal', () => {
    const { tweens } = build();
    expect(FADE_TICKS).toBe(25);
    expect(FADE_MS).toBe(ticksToMs(25));
    expect(tweens[0].cfg.duration).toBe(FADE_MS);
    expect(tweens[1].cfg.duration).toBe(FADE_MS);
    // The panel's head start is 12 ticks and not `FADE_MS / 2` — 12.5 ticks is not a tick.
    expect(tweens[1].cfg.delay).toBe(ticksToMs(12));
  });
});

describe('9.4 — the end value is written when the tween is STOPPED early', () => {
  it('a fade stopped a third of the way through still ends at FADE_ALPHA', () => {
    const { overlay, tweens } = build();
    // A third of the way: this is the state Phaser leaves the target in, and it is what makes the
    // whole criterion necessary — `stop()` writes nothing.
    overlay.fade.setAlpha(FADE_ALPHA / 3);

    tweens[0].stop();

    expect(overlay.fade.alpha, 'the fade stayed a third dark forever').toBe(FADE_ALPHA);
  });

  it('overlay text stopped mid-fade still ends fully opaque — EVERY line, not just the first', () => {
    const { overlay, tweens } = build();
    for (const line of overlay.lines) line.setAlpha(0.4);

    tweens[1].stop();

    for (const [i, line] of overlay.lines.entries()) {
      expect(line.alpha, `line ${i} was left part-faded`).toBe(1);
    }
  });

  it('and on natural completion too', () => {
    const { overlay, tweens } = build();
    overlay.fade.setAlpha(0.1);
    for (const line of overlay.lines) line.setAlpha(0.1);

    tweens[0].complete();
    tweens[1].complete();

    expect(overlay.fade.alpha).toBe(FADE_ALPHA);
    for (const line of overlay.lines) expect(line.alpha).toBe(1);
  });
});

describe('9.3 — the tweens are stopped by handle BEFORE their targets are destroyed', () => {
  it('destroy() stops both tweens first, then destroys every object', () => {
    // The Phase 6 incident: a tween still running against a destroyed target throws inside Phaser's
    // update loop, and a throw there stops every scene after it. The ORDER is the requirement, and
    // it survived the change from `killTweensOf` to two handle stops — this is what says so.
    const { overlay, log } = build();

    overlay.destroy();

    const firstDestroy = log.findIndex((e) => e.startsWith('destroy:'));
    const lastStop = log.lastIndexOf('stop');
    expect(log.filter((e) => e === 'stop'), 'both tweens must be stopped').toHaveLength(2);
    expect(firstDestroy, 'nothing was destroyed at all').toBeGreaterThan(-1);
    expect(lastStop, 'a target was destroyed before its tween was stopped').toBeLessThan(
      firstDestroy,
    );
  });

  it('destroy() leaves nothing on the display list', () => {
    const { overlay, objects } = build();
    overlay.destroy();
    for (const o of objects) {
      expect(o.destroyed, `a ${o.kind} survived destroy()`).toBe(true);
    }
  });
});
