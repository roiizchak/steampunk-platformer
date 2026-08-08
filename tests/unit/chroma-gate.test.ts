/**
 * The chroma keying module — criteria 4.4, 4.5, 4.6; vault **4.13** (blocker).
 *
 * Four claims, each with a fixture that fails if the claim stops being true:
 *
 *  1. **Key by L1 distance with a tolerance, never equality.** Asked for `#FF00FF`, got
 *     `~(252,1,252)` — only 0.004 % of pixels were exactly pure. An equality test removes almost
 *     nothing and leaves the sprite on a coloured rectangle.
 *  2. **Judge specks by connected-component AREA, minimum 256 px** — never `alpha > 0`. The vault's
 *     evidence is a 4-pixel speck scoring as a whole second figure.
 *  3. **`keepLargestComponent` must NOT be applied to `jump`, `fall` or `attack`.** An airborne
 *     figure is legitimately multi-component; keeping only the largest deletes a trailing coat or a
 *     raised arm, and the result still looks like a sprite, which is why it survives review. This is
 *     criterion 4.6, and it is enforced by a function that throws rather than by a comment.
 *  4. **One shared module.** The Gym and the build read the same thresholds, so an overlay cannot
 *     disagree with the pixels it is drawn over.
 */

import { describe, expect, it } from 'vitest';
import {
  CHROMA,
  assertComponentPolicy,
  chromaThresholds,
  components,
  hasRealAlpha,
  keepLargestComponent,
  keyDistance,
  keyOut,
  multiComponentStates,
  removeSpecks,
} from '../../tools/gen/chroma.mjs';
import { fill } from '../../tools/gen/gates.mjs';
import { blank } from '../../tools/gen/png.mjs';

const MAGENTA: readonly number[] = [255, 0, 255];

describe('keying is by L1 distance with tolerance, never equality (vault 4.13)', () => {
  it('removes the near-miss the model actually returns, not only the pure colour asked for', () => {
    const nearMiss = fill(blank(4, 4, [0, 0, 0, 255]), 0, 0, 4, 4, [252, 1, 252, 255]);
    const out = keyOut(nearMiss, { key: MAGENTA });
    expect(out.data[3]).toBe(0);
  });

  it('an equality test would NOT have removed it — the fixture is discriminating', () => {
    // The whole reason tolerance exists: (252,1,252) is not (255,0,255).
    expect(keyDistance(252, 1, 252, MAGENTA)).toBeGreaterThan(0);
    expect(keyDistance(252, 1, 252, MAGENTA)).toBeLessThanOrEqual(CHROMA.LOW);
  });

  it('leaves subject pixels alone', () => {
    const subject = fill(blank(4, 4, [0, 0, 0, 255]), 0, 0, 4, 4, [180, 140, 60, 255]);
    const out = keyOut(subject, { key: MAGENTA });
    expect(out.data[3]).toBe(255);
    expect(Array.from(out.data.slice(0, 3))).toEqual([180, 140, 60]);
  });

  it('ramps alpha in the band between LOW and HIGH rather than cutting hard', () => {
    // A colour deliberately placed between the two thresholds.
    const mid = Math.round((CHROMA.LOW + CHROMA.HIGH) / 2);
    const image = fill(blank(2, 2, [0, 0, 0, 255]), 0, 0, 2, 2, [255 - mid, 0, 255, 255]);
    const out = keyOut(image, { key: MAGENTA });
    expect(out.data[3]).toBeGreaterThan(0);
    expect(out.data[3]).toBeLessThan(255);
  });

  it('refuses a threshold pair that is not ordered', () => {
    expect(() => keyOut(blank(2, 2), { low: 100, high: 50 })).toThrow(/must exceed/);
  });
});

describe('specks are judged by AREA, not by alpha > 0 (vault 4.13)', () => {
  const withSpeck = () => {
    const image = blank(64, 64, [0, 0, 0, 0]);
    fill(image, 0, 0, 32, 32, [200, 200, 200, 255]); // 1024 px figure
    fill(image, 60, 60, 2, 2, [200, 200, 200, 255]); // 4 px speck
    return image;
  };

  it('erases a 4px speck and keeps a 1024px figure', () => {
    const out = removeSpecks(withSpeck());
    const sizes = components(out).sizes.filter((s) => s > 0);
    expect(sizes).toEqual([1024]);
  });

  it('an alpha>0 test would have kept both — which is the failure being guarded', () => {
    const before = components(withSpeck()).sizes.filter((s) => s > 0).sort((a, b) => b - a);
    expect(before).toEqual([1024, 4]);
  });

  it('the floor is the documented 256px', () => {
    expect(CHROMA.MIN_COMPONENT_PX).toBe(256);
  });

  it('a component just under the floor goes and just over stays', () => {
    const under = fill(blank(64, 64, [0, 0, 0, 0]), 0, 0, 15, 17, [255, 255, 255, 255]); // 255 px
    const over = fill(blank(64, 64, [0, 0, 0, 0]), 0, 0, 16, 16, [255, 255, 255, 255]); // 256 px
    expect(components(removeSpecks(under)).sizes.filter((s) => s > 0)).toEqual([]);
    expect(components(removeSpecks(over)).sizes.filter((s) => s > 0)).toEqual([256]);
  });
});

describe('keepLargestComponent is refused for airborne and attacking states (criterion 4.6)', () => {
  it.each(['jump', 'fall', 'attack', 'hurt', 'death'])('refuses "%s"', (state) => {
    expect(() => assertComponentPolicy(state)).toThrow(/vault 4\.13/);
    expect(() => keepLargestComponent(blank(8, 8), state)).toThrow(/must not be applied/);
  });

  it.each(['idle', 'walk', 'run'])('allows "%s"', (state) => {
    expect(() => assertComponentPolicy(state)).not.toThrow();
  });

  it('actually keeps only the largest component for a state where it is allowed', () => {
    const image = blank(64, 64, [0, 0, 0, 0]);
    fill(image, 0, 0, 20, 20, [255, 255, 255, 255]); // 400 px
    fill(image, 40, 40, 18, 18, [255, 255, 255, 255]); // 324 px
    const out = keepLargestComponent(image, 'idle');
    expect(components(out).sizes.filter((s) => s > 0)).toEqual([400]);
  });

  it('the forbidden list is the documented one, so shrinking it is visible in a diff', () => {
    expect(multiComponentStates().sort()).toEqual(['attack', 'death', 'fall', 'hurt', 'jump']);
  });
});

describe('real alpha is read from the channel values (vault 4.12)', () => {
  it('an image whose alpha is 255 everywhere has no real transparency', () => {
    expect(hasRealAlpha(blank(8, 8, [1, 2, 3, 255]))).toBe(false);
  });

  it('one transparent pixel is enough to say it does', () => {
    expect(hasRealAlpha(fill(blank(8, 8, [1, 2, 3, 255]), 0, 0, 1, 1, [0, 0, 0, 254]))).toBe(true);
  });
});

describe('one shared module (vault 4.13)', () => {
  it('exposes the thresholds so the Gym and the build cannot drift apart', () => {
    const t = chromaThresholds();
    expect(t.LOW).toBe(CHROMA.LOW);
    expect(t.HIGH).toBe(CHROMA.HIGH);
    expect(t.MIN_COMPONENT_PX).toBe(CHROMA.MIN_COMPONENT_PX);
  });

  it('pins the documented working pair 40 / 120', () => {
    expect(CHROMA.LOW).toBe(40);
    expect(CHROMA.HIGH).toBe(120);
  });

  it('hands out a copy, so a caller cannot mutate the shared thresholds', () => {
    const t = chromaThresholds();
    t.LOW = 999;
    expect(CHROMA.LOW).toBe(40);
  });
});
