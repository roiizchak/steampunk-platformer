/**
 * The opaque-figure measurement. **A leaf: this module imports nothing.**
 *
 * ## Why it is here and not in `sheets.mjs` — inventory 5.25
 *
 * It lived there. When the packer crossed the 400-line rule its half moved to `sheetsPack.mjs`,
 * `sheets.mjs` kept re-exporting the moved names so no importer had to change — and `sheetsPack.mjs`
 * still needed `figureMetrics`, which stayed behind. That closed an import cycle, the same accident
 * that `gates.mjs` / `gatesBrassCap.mjs` made independently and that `phase-05-impl.md:72` recorded
 * against `motion.mjs` / `motionCombat.mjs`. Three occurrences, one cause: **a 400-line split plus a
 * compatibility re-export, where the moved half still reaches back for a primitive.**
 *
 * The repair is always the same — the primitive moves DOWN to a leaf both sides import, so neither
 * has to be evaluated first. `tests/unit/gen-import-cycles.test.ts` is what makes it stay repaired.
 *
 * ⚠️ **Nothing may be imported into this file.** A leaf's entire value is having no evaluation order
 * to get wrong.
 */

/**
 * Opaque bounding box, centroid and pixel count.
 *
 * `alphaFloor` is 8 rather than 1 on purpose: the keying ramp leaves a band of very low alpha at
 * the silhouette edge, and counting those as "the figure" makes the bounds a few pixels larger than
 * anything a player can see.
 */
export function figureMetrics(image, alphaFloor = 8) {
  const { width, height, data } = image;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] >= alphaFloor) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
  }
  if (count === 0) {
    return null;
  }
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    centroidX: sumX / count,
    /** Vertical centre of mass — the landmark the `centroid` vertical anchor tracks. */
    centroidY: sumY / count,
    pixels: count,
  };
}
