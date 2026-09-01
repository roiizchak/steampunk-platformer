import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH, MAX_GAME_WIDTH } from '../../src/game/constants';
import { installViewFill, liveViewWidth, type ViewScaleLike } from '../../src/game/viewSize';

/**
 * **The view width, and the loop that keeps it matched to the viewport.**
 *
 * The decision is one pure function, so it is tested as arithmetic. The attachment is tested
 * against a fake ScaleManager that behaves like the real one in the single way that matters:
 * `setGameSize` ends in `refresh()`, which emits `resize` — back into the handler that called it.
 */

/**
 * A ScaleManager that re-enters, because Phaser's does.
 *
 * ⚠️ `setGameSize` here emits `resize` synchronously, exactly as `ScaleManager.js:799` → `:993`
 * does. `budget` is what turns the recursion into a NAMED failure instead of a hung worker: without
 * it, removing the equality guard in `installViewFill` fails as a timeout, and a timeout is not
 * evidence about which line broke.
 */
function makeScale(parentWidth: number, parentHeight: number, budget = 8) {
  const listeners: (() => void)[] = [];
  const calls: { width: number; height: number }[] = [];
  const scale: ViewScaleLike = {
    parentSize: { width: parentWidth, height: parentHeight },
    gameSize: { width: GAME_WIDTH, height: GAME_HEIGHT },
    setGameSize(width, height) {
      calls.push({ width, height });
      if (calls.length > budget) throw new Error(`setGameSize ran ${calls.length} times — recursing`);
      scale.gameSize = { width, height };
      for (const fn of [...listeners]) fn();
    },
    on(_event, fn) {
      listeners.push(fn);
    },
    off(_event, fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const emitResize = (): void => {
    for (const fn of [...listeners]) fn();
  };
  return { scale, calls, listeners, emitResize };
}

describe('the view width for a viewport', () => {
  it('is the design width at exactly 16:9, and a DIFFERENT width at every other aspect', () => {
    // Non-vacuity first: a function returning GAME_WIDTH always would satisfy the case below.
    const widths = [
      liveViewWidth(1024, 576),
      liveViewWidth(900, 405),
      liveViewWidth(2400, 1000),
      liveViewWidth(390, 844),
    ];
    expect(new Set(widths).size, 'the aspects collapsed to one width — nothing is being computed')
      .toBeGreaterThan(2);
    expect(liveViewWidth(1024, 576)).toBe(GAME_WIDTH);
  });

  it('gives a landscape phone the viewport aspect, which is the black bars gone', () => {
    // 900x405 is 2.22 — a 20:9 phone. 1080 * 2.22 = 2400, and 2400x1080 fitted into 900x405 has
    // no slack on either axis. Under the old fixed 1920x1080 view this left 17.9 % of the width
    // black, which is the defect the owner reported.
    expect(liveViewWidth(900, 405)).toBe(2400);
  });

  it('clamps at the ceiling rather than growing without bound', () => {
    expect(liveViewWidth(1040, 400)).toBe(MAX_GAME_WIDTH); // 2.60, past 2.37
    expect(liveViewWidth(10_000, 400)).toBe(MAX_GAME_WIDTH);
  });

  it('never goes below the design width, so a portrait phone does not shrink the world', () => {
    expect(liveViewWidth(390, 844)).toBe(GAME_WIDTH);
    expect(liveViewWidth(1400, 900)).toBe(GAME_WIDTH); // 1.56, narrower than 16:9
  });

  it('falls back to the design width rather than dividing by a zero parent', () => {
    expect(liveViewWidth(0, 0)).toBe(GAME_WIDTH);
    expect(liveViewWidth(900, 0)).toBe(GAME_WIDTH);
    expect(liveViewWidth(Number.NaN, 405)).toBe(GAME_WIDTH);
  });
});

describe('keeping the view matched to the viewport', () => {
  it('sizes the view on install, without waiting for a resize that may never come', () => {
    const { scale, calls } = makeScale(900, 405);
    installViewFill(scale);
    expect(calls, 'the view was left at the design size until the first resize').toEqual([
      { width: 2400, height: GAME_HEIGHT },
    ]);
  });

  it('re-sizes when the viewport changes, and STOPS — the re-entrant resize is a no-op', () => {
    const { scale, calls, emitResize } = makeScale(900, 405);
    installViewFill(scale);
    scale.parentSize.width = 1040;
    scale.parentSize.height = 400;
    emitResize();
    expect(calls).toEqual([
      { width: 2400, height: GAME_HEIGHT },
      { width: MAX_GAME_WIDTH, height: GAME_HEIGHT },
    ]);
  });

  it('does nothing when the viewport changes but the view width does not', () => {
    // Two viewports past the ceiling clamp to the same width. Resizing between them must not
    // churn the whole display list for a size that did not move.
    const { scale, calls, emitResize } = makeScale(1040, 400);
    installViewFill(scale);
    scale.parentSize.width = 2000;
    scale.parentSize.height = 400;
    emitResize();
    expect(calls).toHaveLength(1);
  });

  it('detaches, so a torn-down game stops resizing itself', () => {
    const { scale, calls, listeners, emitResize } = makeScale(900, 405);
    installViewFill(scale)();
    expect(listeners).toHaveLength(0);
    scale.parentSize.height = 400;
    scale.parentSize.width = 1040;
    emitResize();
    expect(calls).toHaveLength(1);
  });
});

describe('the production wiring, which no behavioural test can reach', () => {
  // `main.ts` names Phaser VALUES, so `npm run test:sim-isolated` cannot import it and the only
  // available gate is its source text — the weaker of the two shapes CLAUDE.md names, used here
  // because the stronger one is not reachable. The cases above carry the logic; this carries the
  // composition, and without it every one of them is green on a game that never installs the loop.
  const main = readFileSync('src/main.ts', 'utf8');

  /**
   * ⚠️ A word-boundary scan, NOT `toContain`. `toContain('installViewFill(')` survives renaming the
   * call to `NOT_CALLED_installViewFill(`, because the mutation's own name contains the needle — a
   * gate that cannot go red is decoration *(C2)*. Escape-free on purpose: counting an identifier
   * followed by `(` needs no regex, and every attempt to write one through this project's shells
   * mangled the backslash.
   */
  const calls = (name: string): number => {
    let n = 0;
    for (let at = main.indexOf(name + '('); at !== -1; at = main.indexOf(name + '(', at + 1)) {
      const prev = at === 0 ? '' : main[at - 1]!;
      if (!/[A-Za-z0-9_$]/.test(prev)) n += 1;
    }
    return n;
  };

  it('installs the view-fill loop, or the game letterboxes on every phone', () => {
    expect(
      calls('installViewFill'),
      'main.ts never installs the view-fill loop: the view stays 1920x1080 and the black bars the ' +
        'owner reported are back, with every test in this file still green',
    ).toBe(1);
  });

  it('installs it against the ScaleManager, before anything lays out against the view', () => {
    // The order is load-bearing: every scene reads `scale.gameSize` in `create()`, and a view
    // resized after that draws a menu centred on the old width.
    expect(main).toContain('installViewFill(game.scale);');
    expect(
      main.indexOf('installViewFill(game.scale);'),
      'the view is sized after the game has already been built around the design width',
    ).toBeLessThan(main.indexOf('installFullscreenOnTap('));
  });
});
