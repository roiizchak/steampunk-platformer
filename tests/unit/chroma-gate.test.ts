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
  estimateKeyColour,
  components,
  dropCastShadow,
  hasRealAlpha,
  keepLargestComponent,
  keyDistance,
  keyOut,
  multiComponentStates,
  removeSpecks,
  trimHalo,
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

  it('despills a green rim that sits OUTSIDE the ramp band', () => {
    // The defect this pass exists for. A blend of chroma green and a dark blue-grey wall lands
    // far beyond HIGH, so it is correctly kept as subject — and it is still visibly green. On the
    // regenerated parallax layers that produced a bright green outline around every keyed element.
    const green: readonly number[] = [0, 255, 0];
    const rim = fill(blank(4, 4, [0, 0, 0, 255]), 0, 0, 4, 4, [60, 150, 80, 255]);
    expect(keyDistance(60, 150, 80, green)).toBeGreaterThan(CHROMA.HIGH); // outside the band
    const out = keyOut(rim, { key: green });
    expect(out.data[3]).toBe(255); // still fully opaque — alpha is not what was wrong
    expect(out.data[1]).toBeLessThanOrEqual(Math.max(out.data[0], out.data[2]));
    expect(Array.from(out.data.slice(0, 3))).toEqual([60, 80, 80]);
  });

  it('raising HIGH would have damaged the subject instead of fixing it', () => {
    // Without this the despill pass looks like a redundant tolerance tweak, so state what widening
    // the band actually costs. Measured on the real layer, taking HIGH from 120 to 320 moved the
    // green-dominant share of opaque pixels only from 3.69% to 3.21% — and it does that by pulling
    // solid pixels INTO the alpha ramp. A solid wall becoming translucent is a worse defect than
    // the rim it was meant to cure.
    const green: readonly number[] = [0, 255, 0];
    const rim = fill(blank(4, 4, [0, 0, 0, 255]), 0, 0, 4, 4, [60, 150, 80, 255]);
    const widened = keyOut(rim, { key: green, high: 320, despill: false });
    expect(widened.data[3]).toBeGreaterThan(0);
    expect(widened.data[3]).toBeLessThan(255); // an opaque wall pixel, now see-through
  });

  it('skips the despill when the key has no single dominant channel', () => {
    // Magenta is (255,0,255): red and blue tie. "The dominant channel" is undefined, and picking
    // one destroys real colour — the first version of the despill turned a legitimate warm
    // (180,140,60) into (140,140,60). Guarding the ambiguity is why that suite went green again.
    const subject = fill(blank(4, 4, [0, 0, 0, 255]), 0, 0, 4, 4, [180, 140, 60, 255]);
    expect(Array.from(keyOut(subject, { key: MAGENTA }).data.slice(0, 3))).toEqual([180, 140, 60]);
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

describe('the key colour is MEASURED from the image, not assumed from the prompt', () => {
  /**
   * Measured on the first real batch. Three anchors, one prompt clause — "one flat uniform chroma
   * green field, RGB 0 255 0" — and three different greens came back. Two at `~(1,252,1)`, L1
   * distance 4-30 from pure. The third at **(0,195,64)**, distance 124-144, which is ABOVE the HIGH
   * threshold, so it was classified as subject and 0% of the image keyed away.
   *
   * Widening LOW to cover 144 would eat a dark green coat. Measuring per image is the same rule as
   * vault 4.11 — read it off the file, never off the label — where here the label is the prompt.
   */
  const backdrop = (rgb: [number, number, number]) => {
    const image = blank(64, 64, [rgb[0], rgb[1], rgb[2], 255]);
    fill(image, 20, 20, 24, 24, [180, 140, 60, 255]); // a subject that does not touch the border
    return image;
  };

  it('recovers the off-target green that broke the assumed key', () => {
    const { key, agreement } = estimateKeyColour(backdrop([0, 195, 64]));
    expect(key).toEqual([0, 195, 64]);
    expect(agreement).toBe(1);
  });

  it('keying with the measured key clears a background the assumed key leaves untouched', () => {
    const image = backdrop([0, 195, 64]);
    const assumed = keyOut(image); // default key: pure green
    const measured = keyOut(image, { key: estimateKeyColour(image).key });
    const clear = (im: { data: Uint8ClampedArray }) =>
      Array.from(im.data).filter((_, i) => i % 4 === 3 && im.data[i] === 0).length;
    expect(clear(assumed)).toBe(0);
    expect(clear(measured)).toBeGreaterThan(0);
  });

  it('is robust to a subject touching one edge — median, not mean', () => {
    const image = backdrop([0, 250, 0]);
    fill(image, 0, 30, 3, 4, [200, 30, 30, 255]); // subject bleeding onto the left border
    expect(estimateKeyColour(image).key).toEqual([0, 250, 0]);
  });

  it('REFUSES a non-chroma image rather than cutting into the subject (vault 4.16)', () => {
    const photo = blank(64, 64, [0, 0, 0, 255]);
    for (let x = 0; x < 64; x += 1) {
      fill(photo, x, 0, 1, 64, [x * 4, 255 - x * 4, 128, 255]);
    }
    expect(() => estimateKeyColour(photo)).toThrow(/does not have a uniform chroma background/);
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

/**
 * `trimHalo` — the soft glow a video codec leaves around a figure on saturated chroma.
 *
 * This is the defect that made the character float above the tiles and bob while running: the halo
 * counted as figure, so `packStrip` aligned the HALO's lowest row to the cell bottom instead of the
 * boots. Measured on the shipped strips, walk's boots sat 4-8 px high and run's 5-20 px, varying per
 * frame.
 *
 * The fixtures below pin the distinction the function is built on — anti-aliasing is 1-2 px from
 * solid ink, halo is far from it — in BOTH directions, so widening the distance cannot quietly make
 * the function a no-op.
 */
describe('trimHalo removes a distant haze and keeps a real anti-aliased edge', () => {
  /**
   * A solid core (d <= 10), a 1 px anti-aliased ring at alpha 128 (d == 11), a deliberate 2 px void,
   * then a wide faint halo at alpha 40 (d 14..20). The void makes the fixture unambiguous: with the
   * default `maxDistance` of 2 the AA ring is adjacent to solid ink and the halo is not, so nothing
   * sits on the boundary and the expectations below cannot pass by luck.
   */
  const withHalo = () => {
    const img = blank(64, 64, [0, 0, 0, 0]);
    const set = (x: number, y: number, a: number) => {
      const p = (y * 64 + x) * 4;
      img.data[p] = 180; img.data[p + 1] = 140; img.data[p + 2] = 60; img.data[p + 3] = a;
    };
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const d = Math.max(Math.abs(x - 32), Math.abs(y - 32));
        if (d <= 10) set(x, y, 255);
        else if (d === 11) set(x, y, 128);
        else if (d >= 14 && d <= 20) set(x, y, 40);
      }
    }
    return img;
  };

  const alphaAt = (img: { width: number; data: Uint8ClampedArray }, x: number, y: number) =>
    img.data[(y * img.width + x) * 4 + 3];

  it('keeps the anti-aliased edge pixel one step outside solid ink', () => {
    const out = trimHalo(withHalo());
    expect(alphaAt(out, 32, 21)).toBe(128); // d === 11, adjacent to the solid core
  });

  it('erases the halo that is nowhere near a solid pixel', () => {
    const out = trimHalo(withHalo());
    expect(alphaAt(withHalo(), 32, 15)).toBe(40); // d === 17, present before
    expect(alphaAt(out, 32, 15)).toBe(0); //           and gone after
  });

  it('leaves the solid core untouched', () => {
    const out = trimHalo(withHalo());
    expect(alphaAt(out, 32, 32)).toBe(255);
  });

  it('moves the lowest opaque row up to the real edge — the bug that floated the character', () => {
    const lowest = (img: { width: number; height: number; data: Uint8ClampedArray }) => {
      let y = -1;
      for (let yy = 0; yy < img.height; yy += 1) {
        for (let xx = 0; xx < img.width; xx += 1) if (alphaAt(img, xx, yy) >= 8) y = yy;
      }
      return y;
    };
    expect(lowest(withHalo())).toBe(52); // the halo's bottom, 20 px from centre
    expect(lowest(trimHalo(withHalo()))).toBe(43); // the drawn edge, 11 px from centre
  });

  it('a distance wide enough to reach the halo would keep it — so the gate can go red', () => {
    // Guards against "fixing" a future halo by loosening maxDistance until nothing is trimmed.
    const out = trimHalo(withHalo(), { maxDistance: 12 });
    expect(alphaAt(out, 32, 15)).toBe(40);
  });

  it('does not erase a semi-transparent region that HAS a solid core nearby', () => {
    const img = blank(32, 32, [0, 0, 0, 0]);
    for (let y = 10; y < 22; y += 1) {
      for (let x = 10; x < 22; x += 1) {
        const p = (y * 32 + x) * 4;
        img.data[p + 3] = x < 16 ? 255 : 90;
      }
    }
    const out = trimHalo(img);
    expect(alphaAt(out, 17, 15)).toBe(90);
  });
});

/**
 * `dropCastShadow` — the dark ellipse the model draws under an airborne character.
 *
 * The airborne prompts forbid a shadow and explain why; the model mostly complies and then draws one
 * anyway on the odd frame. The regenerated `fall` has one on frame 5: 108 x 10 px, 695 px in area,
 * sitting 7 px below the boots. It is the lowest opaque thing in that cell, so it captures the foot
 * line, drags the centroid down, and renders as a disc floating under a character who is in mid-air.
 *
 * **The point of these fixtures is what must NOT be removed.** At this scale a boot is about 600 px
 * and this shadow is 695, so no area threshold separates them — and vault **4.13** forbids
 * keep-largest-component on precisely `jump` and `fall`, because an airborne pose legitimately
 * splits when a chroma-key gap severs a trailing boot. So the discriminator is shape AND position,
 * and the second test is the one that stops this becoming a boot-eater.
 */
describe('dropCastShadow removes a flat blob under the figure, and nothing else (vault 4.13)', () => {
  const figure = () => {
    const img = blank(200, 200, [0, 0, 0, 0]);
    fill(img, 60, 20, 80, 120, [180, 140, 60, 255]); // the body: 80 x 120, ends at y 139
    return img;
  };
  const sizes = (img: Parameters<typeof components>[0]) =>
    components(img).sizes.filter((s) => s > 0).sort((a, b) => b - a);

  it('erases a wide flat ellipse lying below the boots', () => {
    const img = figure();
    fill(img, 50, 160, 100, 10, [20, 20, 20, 255]); // 1000 px, 10:1, entirely below
    expect(sizes(img)).toEqual([9600, 1000]);
    expect(sizes(dropCastShadow(img))).toEqual([9600]);
  });

  it('KEEPS a detached boot below the figure — the thing vault 4.13 protects', () => {
    const img = figure();
    fill(img, 80, 150, 26, 24, [180, 140, 60, 255]); // 624 px, roughly square, also entirely below
    expect(sizes(dropCastShadow(img))).toEqual([9600, 624]);
  });

  it('keeps a flat blob that is NOT below the figure', () => {
    const img = figure();
    fill(img, 10, 60, 40, 6, [180, 140, 60, 255]); // an outflung arm: flat, but alongside
    expect(sizes(dropCastShadow(img))).toEqual([9600, 240]);
  });

  it('leaves a single-component frame untouched', () => {
    const img = figure();
    expect(dropCastShadow(img)).toBe(img);
  });

  it('an area threshold could not tell the shadow from the boot — why shape is used', () => {
    // The anti-vacuity check. If these two were separable by size, `removeSpecks` would already
    // have done the job and this function would be dead weight.
    const shadowPx = 1000;
    const bootPx = 624;
    expect(Math.abs(shadowPx - bootPx)).toBeLessThan(shadowPx); // same order of magnitude
    expect(bootPx).toBeGreaterThan(CHROMA.MIN_COMPONENT_PX); // and both survive the speck floor
  });
});
