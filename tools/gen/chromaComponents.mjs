/**
 * Connected-component analysis and the policies built on it — the "components" half of
 * chroma.mjs, split out to keep that file under the 400-line limit. See `chroma.mjs` for the
 * module-level vault 4.13 context, including why `keepLargestComponent` must refuse `jump`,
 * `fall`, `attack`, `hurt` and `death`.
 */

import { CHROMA } from './chromaKey.mjs';

/** States whose art may legitimately be more than one connected component (vault 4.13). */
const MULTI_COMPONENT_STATES = Object.freeze(['jump', 'fall', 'attack', 'hurt', 'death']);

/**
 * Label connected components of opaque pixels, 4-connected, iteratively.
 *
 * Iterative on purpose: a recursive flood fill blows the stack on a 2752 px image, and the failure
 * mode is a crash halfway through a build rather than a wrong number, which is at least honest but
 * still stops the pipeline.
 */
export function components(image, minAlpha = 1) {
  const { width, height, data } = image;
  const labels = new Int32Array(width * height).fill(-1);
  const sizes = [];
  const stack = [];

  for (let start = 0; start < width * height; start += 1) {
    if (labels[start] !== -1 || data[start * 4 + 3] < minAlpha) {
      continue;
    }
    const label = sizes.length;
    let size = 0;
    stack.push(start);
    labels[start] = label;

    while (stack.length > 0) {
      const p = stack.pop();
      size += 1;
      const x = p % width;
      const y = (p - x) / width;
      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && labels[n] === -1 && data[n * 4 + 3] >= minAlpha) {
          labels[n] = label;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }

  return { labels, sizes };
}

/**
 * Erase the soft HALO a video codec leaves around a figure on a saturated chroma field.
 *
 * ## The defect, measured
 *
 * The Seedance clips come back with a broad soft glow around the courier — chroma bleed at a
 * high-contrast edge against saturated green, which the LOW/HIGH tolerance ramp resolves into a wide
 * band of partial alpha rather than removing. Rendered as brightness it is unmistakable: an
 * elliptical haze reaching 20–40 px past the silhouette on every side.
 *
 * It broke two things at once, and neither was obvious from the sheet:
 *
 * ```
 *          lowest row with alpha>=8   lowest row with alpha>=128   gap
 *   idle          335                        335                     0
 *   walk          335                        327 - 331             4 - 8
 *   run           335                        315 - 330             5 - 20
 * ```
 *
 * `packStrip` aligns on the figure's lowest opaque row, because `playerView` draws at origin
 * `(0.5, 1)` on the player's feet *(vault 2.10)*. With the halo counted as figure, it aligned the
 * HALO to the ground — so the visible boots hung 4–20 px above the tiles, and because the halo's
 * depth varies per frame, the character also bobbed vertically by up to 15 px while running.
 * "Doesn't look like they stand on the tiles" and "still not smooth" were one defect.
 *
 * **The measurement above is per-FRAME because that is what the packer did when it was taken.** It
 * now takes one baseline per SHEET — the deepest frame reaches the cell's last row and every other
 * frame keeps its measured lift *(see `sheets.mjs`)* — which changes nothing about why the halo had
 * to go: whichever frame is deepest, a halo under it defines a contact line it has no business
 * defining, and it moves the whole sheet rather than one cell.
 *
 * ## Why the test is geometric and not chromatic
 *
 * The obvious guess — residual green — is wrong, and measuring said so: **0 %** of the halo is
 * green-dominant, because `keyOut`'s despill has already neutralised its colour. It is not a colour
 * that needs keying, it is an alpha that should never have survived.
 *
 * An alpha floor alone cannot separate it either: the halo runs up to alpha 127, well into the range
 * a genuine anti-aliased edge occupies, so any floor high enough to erase it would harden every
 * silhouette. What actually distinguishes them is DISTANCE. Real edge anti-aliasing is 1–2 px from
 * solid ink. Halo is 5–40 px from anything solid. So a partial-alpha pixel is kept only if it is
 * within `maxDistance` of a genuinely solid one, and dropped otherwise — which preserves edge quality
 * exactly while removing a haze that is nowhere near the figure.
 *
 * **What this would eat, stated rather than discovered:** a feature that is thin AND entirely
 * semi-transparent everywhere — a wisp of smoke, a single-pixel cable — has no solid core to be near,
 * so it goes. At this source resolution (the courier stands 1209 px) every real feature has one. If a
 * later asset does not, that asset needs a different cleanup, not a looser distance.
 */
export function trimHalo(image, { solidAlpha = 192, maxDistance = 2 } = {}) {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data);
  const solid = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p += 1) solid[p] = data[p * 4 + 3] >= solidAlpha ? 1 : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const alpha = data[p * 4 + 3];
      if (alpha === 0 || solid[p]) continue;
      let near = false;
      for (let dy = -maxDistance; dy <= maxDistance && !near; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -maxDistance; dx <= maxDistance; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (solid[yy * width + xx]) { near = true; break; }
        }
      }
      if (!near) {
        out[p * 4] = 0; out[p * 4 + 1] = 0; out[p * 4 + 2] = 0; out[p * 4 + 3] = 0;
      }
    }
  }
  return { width, height, data: out };
}

/**
 * Erase components smaller than `MIN_COMPONENT_PX`.
 *
 * **Judged by AREA, never by `alpha > 0`** *(vault 4.13)*. The self-test fixture is a four-pixel
 * speck that an `alpha > 0` check scores as a whole second figure.
 */
/**
 * Drop a cast SHADOW: a detached blob lying wholly below the figure, far wider than it is tall.
 *
 * The airborne prompts say *"nothing casts a shadow"* and name the reason — a figure implied to be
 * above something grows a surface for it. The model mostly obeys and then draws one anyway on the
 * odd frame: the shipped `fall` has one on frame 5, a 108 x 10 ellipse 695 px in area, sitting 7 px
 * under the boots.
 *
 * It is not cosmetic. It is the lowest opaque thing in the cell, so it captures the foot line, drags
 * the centroid down, and renders as a dark disc floating under an airborne character — the same
 * class of defect as the chroma halo, which also defined a contact line it had no business defining.
 * Under per-SHEET anchoring it is worse, not better: if the shadowed frame is the deepest one it
 * sets the baseline for **every** frame in the sheet, so one stray ellipse lifts all twelve.
 *
 * **An area threshold cannot do this job**, which is why `removeSpecks` is not simply turned up. At
 * this scale a boot is roughly 600 px and this shadow is 695, and vault **4.13** forbids
 * keep-largest-component on exactly these two animations because an airborne pose legitimately
 * splits when a chroma-key gap severs a trailing boot. Raising `minPx` past 695 would therefore eat
 * the very thing 4.13 exists to protect.
 *
 * The discriminating axes are SHAPE and POSITION, and a shadow is unambiguous on both: it lies
 * entirely below the main mass and it is a flat smear. A detached boot is neither — it sits within
 * or beside the figure's vertical span, and it is not 10:1 wide. Both conditions must hold.
 */
export function dropCastShadow(image, { minAspect = 4, minPx = 40, maxHeightFraction = 0.04 } = {}) {
  const { labels, sizes } = components(image);
  if (sizes.length < 2) return image;

  const box = sizes.map(() => ({ minX: Infinity, maxX: -1, minY: Infinity, maxY: -1 }));
  for (let p = 0; p < labels.length; p += 1) {
    const label = labels[p];
    if (label < 0) continue;
    const b = box[label];
    const x = p % image.width;
    const y = (p - x) / image.width;
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y;
    if (y > b.maxY) b.maxY = y;
  }

  let main = 0;
  for (let i = 1; i < sizes.length; i += 1) if (sizes[i] > sizes[main]) main = i;

  const doomed = new Set();
  for (let i = 0; i < sizes.length; i += 1) {
    if (i === main || sizes[i] < minPx) continue;
    const b = box[i];
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    // THREE conditions, and the third was added after the code-reviewer gate owner's adversarial
    // brief pointed out that this function is the unguarded twin of `keepLargestComponent`.
    //
    // 4.6 forbids keep-largest-component on airborne states because a chroma-key gap legitimately
    // severs a trailing boot, and this function deletes a non-largest component on every airborne
    // cell without ever calling `assertComponentPolicy`. It passed 4.6 on the letter while being
    // able to commit exactly the deletion 4.6 exists to prevent — two boots severed together, or
    // one raked back, is a wide flat blob below the torso and clears both original tests.
    //
    // A shadow is a SMEAR; a boot has real vertical extent. Measured against the MAIN MASS rather
    // than the image, so it is scale-invariant: the courier stands ~1200 source px, a boot is
    // ~100 px (8% of him), and the shipped cast shadow was 10 px (0.8%). 4% sits an order of
    // magnitude clear of both, and unlike the aspect ratio it does not depend on how many boots
    // were severed at once — two boots side by side is a wide flat blob and clears 4:1 easily.
    const mainHeight = box[main].maxY - box[main].minY + 1;
    const tooTallToBeAShadow = h > mainHeight * maxHeightFraction;
    if (b.minY > box[main].maxY && w >= h * minAspect && !tooTallToBeAShadow) doomed.add(i);
  }
  if (doomed.size === 0) return image;

  const out = new Uint8ClampedArray(image.data);
  for (let p = 0; p < labels.length; p += 1) {
    if (doomed.has(labels[p])) {
      out[p * 4] = 0; out[p * 4 + 1] = 0; out[p * 4 + 2] = 0; out[p * 4 + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, data: out };
}

export function removeSpecks(image, minPx = CHROMA.MIN_COMPONENT_PX) {
  const { labels, sizes } = components(image);
  const out = new Uint8ClampedArray(image.data);
  for (let p = 0; p < labels.length; p += 1) {
    const label = labels[p];
    if (label >= 0 && sizes[label] < minPx) {
      out[p * 4] = 0; out[p * 4 + 1] = 0; out[p * 4 + 2] = 0; out[p * 4 + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, data: out };
}

/**
 * THE policy gate for `keepLargestComponent` — criterion 4.6.
 *
 * Throws for any state whose art may legitimately be multi-component. A comment asking callers to
 * remember this is not enforcement; a function they cannot bypass is, which is the same reasoning
 * `enterState()` is built on.
 */
export function assertComponentPolicy(state) {
  if (MULTI_COMPONENT_STATES.includes(state)) {
    throw new Error(
      `keepLargestComponent must not be applied to "${state}" (vault 4.13): an airborne or ` +
        `attacking figure is legitimately more than one connected component, and keeping only ` +
        `the largest silently deletes a trailing coat, a raised arm or a weapon in flight.`,
    );
  }
}

/** Keep only the largest component. Refuses the states vault 4.13 forbids it for. */
export function keepLargestComponent(image, state) {
  assertComponentPolicy(state);
  const { labels, sizes } = components(image);
  if (sizes.length === 0) {
    return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  }
  let biggest = 0;
  for (let i = 1; i < sizes.length; i += 1) {
    if (sizes[i] > sizes[biggest]) biggest = i;
  }
  const out = new Uint8ClampedArray(image.data);
  for (let p = 0; p < labels.length; p += 1) {
    if (labels[p] !== biggest) {
      out[p * 4] = 0; out[p * 4 + 1] = 0; out[p * 4 + 2] = 0; out[p * 4 + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, data: out };
}

/** States this module refuses `keepLargestComponent` for. Exported so the test asserts the list. */
export function multiComponentStates() {
  return [...MULTI_COMPONENT_STATES];
}
