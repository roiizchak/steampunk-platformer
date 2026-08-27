import { describe, expect, it } from 'vitest';

import { MS_PER_TICK } from '../../src/game/constants';
import { FOLLOW_LERP_PER_TICK, followLerpForFrame } from '../../src/render/cameraRig';
import { DEFAULT_TUNING } from '../../src/sim/player';

/**
 * **The camera must behave the same on a 60 Hz screen as on the 240 Hz box it was tuned on.**
 *
 * ## The defect, found by PLAYING — which is the whole point
 *
 * Phaser's `Camera.preRender` does `scrollX += (target - scrollX) * lerp.x` **once per rendered
 * frame**. `cameraRig` shipped a constant `0.12`, so the camera's time constant was `frameMs /
 * 0.12` — 35 ms at 240 Hz, **139 ms at 60 Hz**. Every tuning decision in this project was made on
 * a box that renders at ~240 fps, so the shipped camera was four times less responsive than the
 * one anybody had looked at.
 *
 * The owner played the production build on a 60 Hz screen and reported it *"not smooth … blurry or
 * smeared while moving"*. Modelled against `DEFAULT_TUNING`, before the fix:
 *
 * | display | trails a running player | character swing per jump |
 * |---|---|---|
 * | 240 Hz | 16.5 px | 96 px (8.9 % of screen height) |
 * | 60 Hz | **65.9 px** | **264 px (24.5 %)** |
 *
 * The character is the one object the eye is locked onto, and it drifted a quarter of the screen
 * every jump while the world scrolled underneath. **No gate in this repository could have caught
 * it** — they all run at ~240 fps, where the bug is four times smaller and invisible. That is
 * vault C4 with a measurement attached: *a hands-on criterion never closes on automated evidence*.
 *
 * ## What this file asserts
 *
 * Not "the constant is 0.12" — that pins the defect. The property is **rate independence**: the
 * same wall-clock elapsed time closes the same fraction of the distance, whatever the frame rate
 * that delivered it. The 240 Hz case is asserted exactly, because reproducing the tuned feel bit
 * for bit is what makes this a fix rather than a retune nobody approved.
 */

const closesOver = (deltaMs: number, frames: number): number => {
  const perFrame = followLerpForFrame(deltaMs);
  return 1 - (1 - perFrame) ** frames;
};

describe('followLerpForFrame — the camera closes the same fraction per unit TIME', () => {
  it('reproduces the tuned 0.12 exactly at 240 Hz, so the approved feel is preserved', () => {
    expect(
      followLerpForFrame(MS_PER_TICK / 4),
      'the fix must not silently retune the camera on the box every look at it was taken on',
    ).toBeCloseTo(0.12, 12);
  });

  it('closes the same distance in one 60 Hz tick, however many frames delivered it', () => {
    const inOneTick = [
      closesOver(MS_PER_TICK, 1), // 60 Hz — one frame per tick
      closesOver(MS_PER_TICK / 2, 2), // 120 Hz
      closesOver(MS_PER_TICK / 4, 4), // 240 Hz
      closesOver(MS_PER_TICK / 8, 8), // 480 Hz
    ];
    for (const closed of inOneTick) {
      expect(closed, `rate dependence: ${inOneTick.map((c) => c.toFixed(6)).join(' vs ')}`).toBeCloseTo(
        FOLLOW_LERP_PER_TICK,
        10,
      );
    }
  });

  it('🔴 the OLD constant fails that same property — the gate can go red', () => {
    // The shipped behaviour, restated: a fixed per-frame lerp closes wildly different fractions.
    const OLD = 0.12;
    const oldOverOneTick = (frames: number) => 1 - (1 - OLD) ** frames;
    expect(oldOverOneTick(1)).toBeCloseTo(0.12, 6); // 60 Hz
    expect(oldOverOneTick(4)).toBeCloseTo(0.4003, 4); // 240 Hz
    expect(
      Math.abs(oldOverOneTick(4) - oldOverOneTick(1)),
      'if this ever reaches zero the old constant was rate-independent after all, and this whole ' +
        'file is measuring nothing',
    ).toBeGreaterThan(0.25);
  });

  it('is monotonic in elapsed time and never exceeds 1 — a long frame must not overshoot', () => {
    let previous = -1;
    for (const deltaMs of [1, 4, 8, MS_PER_TICK, 33, 100, 500, 5000]) {
      const lerp = followLerpForFrame(deltaMs);
      expect(lerp, `${deltaMs}ms went backwards`).toBeGreaterThan(previous);
      expect(lerp, `${deltaMs}ms overshoots the target — a visible SNAP on a stalled frame`).toBeLessThanOrEqual(1);
      previous = lerp;
    }
  });

  it('🔴 rejects the naive multiply, which is the obvious wrong fix', () => {
    // `L * deltaMs / MS_PER_TICK` is a first-order approximation of the same curve. It agrees near
    // zero and diverges as the frame lengthens — and past ~2.5 ticks it exceeds 1, which makes the
    // camera jump PAST its target in exactly the conditions where a jump is most visible.
    const naive = (deltaMs: number) => FOLLOW_LERP_PER_TICK * (deltaMs / MS_PER_TICK);
    expect(naive(MS_PER_TICK * 3)).toBeGreaterThan(1);
    expect(followLerpForFrame(MS_PER_TICK * 3)).toBeLessThanOrEqual(1);
  });

  it('treats a non-finite or negative delta as no movement, never as NaN', () => {
    // Phaser hands out NaN deltas after a tab restore. A NaN scroll blanks the view silently,
    // which is the failure direction this project refuses — same guard as `drainTicks`.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
      expect(Number.isFinite(followLerpForFrame(bad)), `${bad} produced a non-finite lerp`).toBe(true);
      expect(followLerpForFrame(bad)).toBe(0);
    }
  });
});

describe('the defect, in the units the player sees', () => {
  /** Steady-state distance the camera trails a target moving `pxPerTick`, at a given frame rate. */
  const steadyLag = (pxPerTick: number, hz: number, lerpFor: (ms: number) => number): number => {
    const period = 1000 / hz;
    const perFrame = lerpFor(period);
    const pxPerFrame = pxPerTick * (period / MS_PER_TICK);
    let scroll = 0;
    let target = 0;
    for (let f = 0; f < hz * 4; f++) {
      target += pxPerFrame;
      scroll += (target - scroll) * perFrame;
    }
    return target - scroll;
  };

  /**
   * ⚠️ **A residual difference survives the fix, and it is not a bug — it is sampling.**
   *
   * Measured: 16.5 px at 240 Hz against 13.5 px at 60 Hz, an 18 % spread where the shipped
   * constant gave 300 %. The cause is the zero-order hold, not the lerp: within one frame the
   * target jumps its whole frame's travel and *then* the camera closes a fraction of the gap, so
   * a rarer, larger step settles at a different phase than four smaller ones. Exactly:
   * `pxPerFrame x (1 - L) / L` — 9 x 1.498 = 13.5 at 60 Hz, 2.25 x 7.333 = 16.5 at 240 Hz.
   *
   * Removing it entirely needs the camera integrated against sub-frame time rather than lerped
   * once per frame, which is a bigger change than the defect justifies. **3 px at `RENDER_SCALE`
   * 6 is half a source art pixel**, against the 49 px the fix removes.
   *
   * The bound is therefore set at the achievable property — the ratio, not equality — and the
   * number it is set against is written down above so a future reader can tell a loosened bound
   * from a measured one. It is NOT a bound chosen by running the test until it passed: the
   * closed form is derivable and matches to three figures.
   */
  it('the run lag no longer depends on the display — 300 % spread down to 18 %', () => {
    const at240 = steadyLag(DEFAULT_TUNING.runMax, 240, followLerpForFrame);
    const at60 = steadyLag(DEFAULT_TUNING.runMax, 60, followLerpForFrame);
    const ratio = Math.max(at60, at240) / Math.min(at60, at240);
    expect(
      ratio,
      `the camera still trails very differently by display: ${at240.toFixed(1)}px at 240 Hz vs ` +
        `${at60.toFixed(1)}px at 60 Hz. Anything near the old 4x means the per-frame lerp is back.`,
    ).toBeLessThan(1.25);
    expect(
      Math.abs(at60 - at240),
      'the residual is the zero-order hold and is bounded by one frame of travel; a bigger gap ' +
        'is a different defect',
    ).toBeLessThan(DEFAULT_TUNING.runMax);
  });

  it('🔴 and the OLD behaviour is measurably the bug that was reported', () => {
    const old = (_ms: number) => 0.12;
    const at240 = steadyLag(DEFAULT_TUNING.runMax, 240, old);
    const at60 = steadyLag(DEFAULT_TUNING.runMax, 60, old);
    expect(at60 / at240, 'the reported defect was a ~4x difference; this is the measurement').toBeGreaterThan(3.5);
    expect(at60, 'the character sat this far off centre while running, on a 60 Hz screen').toBeGreaterThan(60);

    // And the fix is measured against it in the same units, in one place, so "it is better" is a
    // number rather than a claim.
    const fixedAt60 = steadyLag(DEFAULT_TUNING.runMax, 60, followLerpForFrame);
    expect(
      at60 - fixedAt60,
      'the fix must actually remove the drift it was written for, not merely normalise it',
    ).toBeGreaterThan(45);
  });
});

/**
 * **Does the decision actually reach the camera?** *(CLAUDE.md § 2 — every `src/render/` module
 * owes a draw-path gate)*
 *
 * `followLerpForFrame` is a pure function. It can be perfect, fully tested, and have no effect
 * whatsoever on the shipped game — which is exactly what `spriteFeedback.ts` was in Phase 9: 221
 * source lines, a 306-line test file, zero production consumers, and blanking all four function
 * bodies left the game byte-identical on screen with the suite green.
 *
 * This gate is source-text rather than behavioural because the consumer is a `Phaser.Scene`
 * method: no unit test can instantiate one, and the assertion it needs — *the value is written
 * onto `cameras.main.lerp` every frame* — is one line inside `update()`. Comments are stripped
 * first, because two source-text gates in this repository were once satisfied by a COMMENT and
 * fixing it in one place and not the others is how a lesson stays local.
 */
const GAME_SCENE = Object.values(
  import.meta.glob('../../src/scenes/GameScene.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)[0] as string;

/** Line and block comments out; string contents left alone. */
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');

describe('the camera lerp reaches the camera — the draw path', () => {
  const code = stripComments(GAME_SCENE);

  it('GameScene imports followLerpForFrame from cameraRig', () => {
    expect(
      /import\s*\{[^}]*followLerpForFrame[^}]*\}\s*from\s*'\.\.\/render\/cameraRig'/.test(code),
      'GameScene no longer imports followLerpForFrame, so the frame-rate fix is dead code and the ' +
        'camera is back on whatever constant startFollow was seeded with.',
    ).toBe(true);
  });

  it('calls it with the frame delta and writes the result onto the camera EVERY frame', () => {
    const update = code.slice(code.indexOf('update(_time: number, delta: number)'));
    expect(update.length, 'GameScene.update signature changed; this gate is now scanning nothing').toBeGreaterThan(200);
    expect(
      /followLerpForFrame\(\s*delta\s*\)/.test(update),
      'followLerpForFrame is not called with the frame delta inside update(). Calling it once in ' +
        'create() would set a lerp for one frame rate and leave it there.',
    ).toBe(true);
    expect(
      /cameras\.main\.lerp\.set\(/.test(update),
      'nothing writes the computed lerp onto cameras.main.lerp. Phaser reads `lerp` during the ' +
        'render step AFTER update(), so this write is the entire mechanism — without it the ' +
        'function is a pure calculation nobody consumes.',
    ).toBe(true);
  });

  it('🔴 and the old per-frame constant is gone from cameraRig', () => {
    const rig = Object.values(
      import.meta.glob('../../src/render/cameraRig.ts', { query: '?raw', import: 'default', eager: true }),
    )[0] as string;
    const rigCode = stripComments(rig);
    expect(
      /lerpX:\s*FOLLOW_LERP\s*,/.test(rigCode),
      'cameraSetup is handing Phaser the raw per-frame constant again — that is the defect.',
    ).toBe(false);
    expect(/FOLLOW_LERP_PER_TICK/.test(rigCode), 'the per-tick constant is gone').toBe(true);
  });
});
