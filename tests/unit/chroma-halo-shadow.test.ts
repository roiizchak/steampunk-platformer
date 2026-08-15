import { describe, expect, it } from 'vitest';
import { CHROMA, components, dropCastShadow, trimHalo } from '../../tools/gen/chroma.mjs';
import { fill } from '../../tools/gen/gates.mjs';
import { blank } from '../../tools/gen/png.mjs';

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
    // 4 px tall against a 120 px body = 3.3%, which is the proportion a real cast shadow has:
    // the shipped `fall` shadow was 10 px under a ~1200 px figure, i.e. 0.8%. The fixture used to
    // be 10 px against the same 120 px body — 8.3%, which is a BOOT's proportion, not a shadow's,
    // and it stopped passing when the height guard was added. The guard was right and the fixture
    // was unrepresentative; corrected rather than the guard loosened.
    fill(img, 50, 160, 100, 4, [20, 20, 20, 255]); // 400 px, 25:1, entirely below
    expect(sizes(img)).toEqual([9600, 400]);
    expect(sizes(dropCastShadow(img))).toEqual([9600]);
  });

  it('KEEPS a severed boot below the figure — the case vault 4.13 exists for', () => {
    // The discriminating fixture, and the reason the height guard was added at all. A chroma-key
    // gap can sever a trailing boot on an airborne frame; two boots severed together, or one raked
    // back, is a wide flat blob lying wholly below the torso — which cleared BOTH original tests
    // (below the main mass, and 4:1 or wider). `dropCastShadow` would then have committed exactly
    // the deletion `keepLargestComponent` is forbidden from committing on these states, under a
    // different name and with no `assertComponentPolicy` on the stack.
    //
    // Raised by the `voltagent-qa-sec:code-reviewer` gate owner, brief 2.
    const img = figure();
    fill(img, 40, 150, 120, 12, [90, 60, 40, 255]); // 1440 px, 10:1 wide, but 10% of the body
    expect(sizes(img)).toEqual([9600, 1440]);
    expect(sizes(dropCastShadow(img)), 'a severed boot was deleted').toEqual([9600, 1440]);
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
