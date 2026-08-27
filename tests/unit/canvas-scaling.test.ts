import { describe, expect, it } from 'vitest';

import { CRISP_IMAGE_RENDERING } from '../../src/game/constants';
import { SMOOTH_IMAGE_RENDERING, canvasRendering, isIntegerScale } from '../../src/render/canvasScaling';

/**
 * **The second resample** — how the finished canvas is scaled onto the screen, which `pixelArt`
 * does not govern and which nothing in this project checked until 2026-08-27.
 *
 * `Phaser.Scale.FIT` leaves the canvas backing store at 1920x1080 and restyles only its CSS size,
 * so the browser rescales it at whatever ratio the window implies. With `image-rendering:
 * pixelated` that is nearest-neighbour, which drops and duplicates whole pixel columns — and
 * **which columns are dropped shifts every frame the world scrolls**. Sharp when still, mush in
 * motion. Reported by the owner from the shipped production build, after a genuine camera fix had
 * already landed and helped: two defects wearing one symptom.
 *
 * ⚠️ **A Phase 1 decision reopened** *(vault 1.5)*, unlocked by the owner. Texture sampling is
 * untouched — `pixelArt`, `antialias: false`, NEAREST, `roundPixels` all stand. Only the canvas ->
 * screen step is conditional, and only where it is already lossy.
 */

const CRISP = CRISP_IMAGE_RENDERING[CRISP_IMAGE_RENDERING.length - 1]; // 'pixelated'

describe('isIntegerScale', () => {
  it('accepts a 1:1 canvas — the fullscreen-at-native case', () => {
    expect(isIntegerScale(1920, 1080, 1920, 1080)).toBe(true);
  });

  it('accepts whole multiples in BOTH directions', () => {
    expect(isIntegerScale(1920, 1080, 3840, 2160), 'a 2x upscale is exact').toBe(true);
    expect(isIntegerScale(1920, 1080, 960, 540), 'a 1/2 downscale is exact too').toBe(true);
  });

  it('🔴 REJECTS the window sizes that actually produce the defect', () => {
    // Every one of these is a plausible browser viewport. None is an exact multiple of 1920x1080.
    const real: [number, number][] = [
      [1600, 900],
      [1536, 864],
      [1366, 768],
      [1280, 720],
      [1707, 960],
      [1920, 950], // maximised on a 1080p screen: browser chrome eats the height
    ];
    for (const [w, h] of real) {
      expect(isIntegerScale(1920, 1080, w, h), `${w}x${h} was treated as an integer scale`).toBe(false);
    }
  });

  it('tolerates sub-pixel float noise, or every integer scale reads as fractional', () => {
    // `getBoundingClientRect()` returns floats and `autoRound` floors the style size, so a scale
    // that is 1.0 in intent arrives as 0.9999999999. An exact === test would make this an
    // unconditional smoothing switch — a fix that looks like it worked and is not the rule.
    expect(isIntegerScale(1920, 1080, 1919.9999999, 1079.9999999)).toBe(true);
    expect(isIntegerScale(1920, 1080, 1920.0000001, 1080.0000001)).toBe(true);
  });

  it('🔴 but does NOT tolerate a real one-pixel difference', () => {
    // The tolerance is 1e-4 of the ratio, not "close enough looking". 1919 in 1920 is 0.99948 —
    // outside it, and genuinely fractional.
    expect(isIntegerScale(1920, 1080, 1919, 1079)).toBe(false);
  });

  it('requires BOTH axes, so a stretched canvas is not called integral', () => {
    expect(isIntegerScale(1920, 1080, 1920, 900), 'x integral, y not').toBe(false);
    expect(isIntegerScale(1920, 1080, 1600, 1080), 'y integral, x not').toBe(false);
  });

  it('treats nonsense geometry as fractional rather than throwing', () => {
    // Called before first layout, or against a detached canvas. The safe answer to "I do not
    // understand this geometry" is the one that cannot churn.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isIntegerScale(1920, 1080, bad, 1080), `css width ${bad}`).toBe(false);
      expect(isIntegerScale(bad, 1080, 1920, 1080), `buffer width ${bad}`).toBe(false);
    }
  });
});

describe('canvasRendering — the rule', () => {
  it('keeps Phaser crisp value at an integer scale, unchanged from Phase 1', () => {
    expect(canvasRendering(CRISP, 1920, 1080, 1920, 1080)).toBe(CRISP);
    expect(canvasRendering(CRISP, 1920, 1080, 3840, 2160)).toBe(CRISP);
  });

  it('🔴 smooths ONLY where nearest-neighbour cannot be exact', () => {
    expect(canvasRendering(CRISP, 1920, 1080, 1600, 900)).toBe(SMOOTH_IMAGE_RENDERING);
    expect(canvasRendering(CRISP, 1920, 1080, 1366, 768)).toBe(SMOOTH_IMAGE_RENDERING);
  });

  it("returns whatever crisp value THIS browser settled on, not a hardcoded one", () => {
    // Chromium keeps `pixelated`, Firefox `-moz-crisp-edges`. The caller reads it back off the
    // canvas and passes it in, so the crisp branch is byte-identical to what Phaser would have
    // left there — which is what the boot gate compares against.
    for (const value of CRISP_IMAGE_RENDERING) {
      expect(canvasRendering(value, 1920, 1080, 1920, 1080)).toBe(value);
    }
  });

  it('🔴 the OLD unconditional rule is what this replaces — and it fails the fractional case', () => {
    // Restating the shipped behaviour so the gate is shown discriminating rather than asserted to.
    const OLD = (): string => CRISP;
    expect(OLD()).toBe(CRISP);
    expect(
      canvasRendering(CRISP, 1920, 1080, 1600, 900),
      'if this ever equals the old rule again, the conditional has been removed and the defect is back',
    ).not.toBe(OLD());
  });
});

/**
 * **Does the rule reach the canvas?** *(CLAUDE.md § 2 — every `src/render/` module owes a
 * draw-path gate)*
 *
 * `canvasRendering` is pure. It can be correct, fully tested, and never called — which is exactly
 * what `spriteFeedback.ts` was in Phase 9. Source-text, because the consumer is `main.ts` wiring a
 * Phaser event; comments are stripped first, because two source-text gates in this repository were
 * once satisfied by a comment.
 */
const MAIN = Object.values(
  import.meta.glob('../../src/main.ts', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

const FILTER = Object.values(
  import.meta.glob('../../src/game/canvasFilter.ts', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

const strip = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');

describe('the scaling rule reaches the canvas — the draw path', () => {
  it('main.ts installs the filter on the real game', () => {
    const code = strip(MAIN);
    expect(
      /import\s*\{[^}]*installCanvasFilter[^}]*\}\s*from\s*'\.\/game\/canvasFilter'/.test(code),
      'main.ts no longer imports installCanvasFilter, so the rule is dead code and the canvas keeps ' +
        'whatever Phaser set — which is the defect.',
    ).toBe(true);
    expect(
      /installCanvasFilter\(\s*game\s*\)/.test(code),
      'installCanvasFilter is never called with the game.',
    ).toBe(true);
  });

  it('the filter consults canvasRendering and writes image-rendering', () => {
    const code = strip(FILTER);
    expect(/canvasRendering\(/.test(code), 'the decision function is not consulted').toBe(true);
    expect(
      /setProperty\(\s*'image-rendering'/.test(code),
      'nothing writes image-rendering, so the decision has no effect on the page',
    ).toBe(true);
  });

  it("🔴 re-applies on RESIZE, not once at boot — the 'only sometimes' bug", () => {
    // Dragging between a 4K and a 1080p monitor, entering fullscreen, or opening dev tools all
    // change the scale, and the right answer DEPENDS on the scale. Deciding once at boot is
    // correct until the first time anybody moves the window.
    expect(
      /scale\.on\(\s*'resize'/.test(strip(FILTER)),
      'the filter is not re-applied on resize; it would be right at boot and wrong forever after ' +
        'the window moved to a different display',
    ).toBe(true);
  });
});
