/**
 * Deterministic box-filter downscale, and the crop it is usually paired with.
 *
 * Two jobs, both load-bearing for this phase:
 *
 *  1. **Grid-exactness in post.** `nano-banana-pro` exposes no explicit `width`/`height` — only
 *     `aspect_ratio` and `resolution` — so a tileset is generated large, MEASURED off the file, then
 *     downscaled and sliced. SOURCE-ANALYSIS open question 7.
 *  2. **Readability at true sprite size** (criterion 4.1). *"A recipe that reads at 2752px can turn
 *     to mush at 128px."* The only way to know is to downscale to the real in-game size and look.
 *
 * **Box filter, not nearest.** Nearest-neighbour downscaling of a detailed source drops 90 % of the
 * pixels and aliases hard, which makes art look worse than it is and would fail a readability check
 * for a reason that is not the art's fault. A box filter averages every source pixel that lands in
 * the destination cell. Note this is the DOWNSCALE path only — the game still renders NEAREST, which
 * is a separate decision pinned by `assertFilteringPinned()` in BootScene.
 *
 * **Deterministic**: integer-weighted averaging in a fixed order, no floating-point accumulation
 * order that could vary. Same input, same output, which is what vault 4.15's byte-identical rebuild
 * needs from every step that is not the model itself.
 *
 * Alpha is averaged as a straight channel rather than premultiplied. Every image this touches is
 * either fully opaque (fresh from the model, which emits no alpha) or already keyed with hard edges
 * plus a narrow ramp, and premultiplying would darken that ramp against black.
 */

/** Average every source pixel falling inside each destination cell. */
export function downscale(image, targetWidth, targetHeight) {
  const { width, height, data } = image;
  if (!Number.isInteger(targetWidth) || targetWidth < 1) {
    throw new Error(`downscale: bad target width ${targetWidth}`);
  }
  if (!Number.isInteger(targetHeight) || targetHeight < 1) {
    throw new Error(`downscale: bad target height ${targetHeight}`);
  }
  if (targetWidth > width || targetHeight > height) {
    throw new Error(
      `downscale: ${width}x${height} -> ${targetWidth}x${targetHeight} is an UPSCALE. ` +
        `Upscaling generated art hides that the source was too small; regenerate instead.`,
    );
  }

  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let ty = 0; ty < targetHeight; ty += 1) {
    const y0 = Math.floor((ty * height) / targetHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * height) / targetHeight));
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const x0 = Math.floor((tx * width) / targetWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * width) / targetWidth));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * width + x) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          a += data[i + 3];
          n += 1;
        }
      }
      const o = (ty * targetWidth + tx) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}

/** Downscale by a ratio, preserving aspect. Convenience for previews. */
export function downscaleToWidth(image, targetWidth) {
  const targetHeight = Math.max(1, Math.round((image.height * targetWidth) / image.width));
  return downscale(image, targetWidth, targetHeight);
}

/** Extract a rectangle. Refuses an out-of-bounds crop rather than silently clamping it. */
export function crop(image, x, y, w, h) {
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > image.width || y + h > image.height) {
    throw new Error(
      `crop: ${w}x${h} at (${x},${y}) does not fit inside ${image.width}x${image.height}`,
    );
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const from = ((y + row) * image.width + x) * 4;
    out.set(image.data.subarray(from, from + w * 4), row * w * 4);
  }
  return { width: w, height: h, data: out };
}

/** Lay images out left-to-right on a transparent ground. Used for side-by-side comparisons. */
export function hstack(images, gap = 8) {
  const width = images.reduce((sum, im) => sum + im.width, 0) + gap * (images.length - 1);
  const height = Math.max(...images.map((im) => im.height));
  const data = new Uint8ClampedArray(width * height * 4);
  let x = 0;
  for (const im of images) {
    for (let row = 0; row < im.height; row += 1) {
      const from = row * im.width * 4;
      data.set(im.data.subarray(from, from + im.width * 4), (row * width + x) * 4);
    }
    x += im.width + gap;
  }
  return { width, height, data };
}
