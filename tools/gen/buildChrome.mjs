/**
 * The two isolated-object assets: the player's HUD assembly and the gear pickup.
 *
 * Split out of `build-world.mjs` in Phase 6, when adding the gear took that file to 411 lines
 * against a 400-line ceiling that permits exactly one offender — a slot spent by
 * `src/scenes/GameScene.ts`. These two belong together: both are a single subject on a chroma
 * field, both are keyed with a key measured from their OWN border rather than a shared constant,
 * and both refuse to build if more than one component comes back.
 *
 * The tileset and the parallax layers stayed behind, because they are grids and seams rather than
 * objects and share none of that.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePng } from './png.mjs';
import { estimateKeyColour, keyOut, removeSpecks } from './chroma.mjs';
import { detectFrames } from './sheets.mjs';
import { crop, downscale } from './resize.mjs';
import { raw } from './rawSource.mjs';

export function buildHud() {
  const image = raw('hud');
  const { key } = estimateKeyColour(image);
  const keyed = removeSpecks(keyOut(image, { key }));
  const rects = detectFrames(keyed, { minGap: 16, minExtent: 64 });
  if (rects.length !== 1) {
    throw new Error(
      `assets:world: expected ONE HUD assembly, detected ${rects.length}. STYLE.md's geometry ` +
        `constraint exists to guarantee a single row — a second component means it did not hold.`,
    );
  }
  const r = rects[0];
  const trimmed = crop(keyed, r.x, r.y, r.w, r.h);
  // The assembly draws at 1/8 of the 1080 viewport height, which puts the medallion at ~135 px.
  const target = 128;
  const scaled = downscale(trimmed, Math.round((r.w * target) / r.h), target);
  mkdirSync('public/assets/hud', { recursive: true });
  writeFileSync(
    'public/assets/hud/health-assembly.png',
    encodePng(scaled.width, scaled.height, scaled.data),
  );
  console.log(
    `ok  hud       1 assembly  ${r.w}x${r.h} -> ${scaled.width}x${scaled.height}  key(${key.join(',')})`,
  );
  return { width: scaled.width, height: scaled.height };
}

/**
 * The gear pickup — Phase 6.
 *
 * `GEAR_TARGET` is `GEAR_BOX.w * RENDER_SCALE` = 12 * 6. It is a literal here rather than parsed
 * out of `src/sim/pickups.ts` because that constant is an object literal, not the `export const NAME
 * = <int>;` form `runtimeConstant` reads. **`tests/unit/shipped-gear.test.ts` measures the shipped
 * PNG against the real constants**, so the two cannot drift while both look right in isolation —
 * the same protection, bought by measuring the artefact instead of parsing the source.
 *
 * Authored at exactly the size it draws at, like every other sprite in this project: at
 * `CAMERA_ZOOM` 1 there is no further scaling between the file and the screen, which is what makes
 * "readable at true sprite size" a testable claim rather than a range.
 */
export function buildGear() {
  const image = raw('gear');
  const { key } = estimateKeyColour(image);
  const keyed = removeSpecks(keyOut(image, { key }));
  const rects = detectFrames(keyed, { minGap: 16, minExtent: 64 });
  if (rects.length !== 1) {
    throw new Error(
      `assets:world: expected ONE gear, detected ${rects.length}. The prompt asks for a single ` +
        `centred gear; more than one component means it did not hold, and the pickup the player ` +
        `sees would be whichever one happened to be first.`,
    );
  }
  const r = rects[0];
  const GEAR_TARGET = 72;
  const trimmed = crop(keyed, r.x, r.y, r.w, r.h);
  const scaled = downscale(trimmed, GEAR_TARGET, GEAR_TARGET);
  mkdirSync('public/assets/objects', { recursive: true });
  writeFileSync(
    'public/assets/objects/gear.png',
    encodePng(scaled.width, scaled.height, scaled.data),
  );
  console.log(
    `ok  gear      1 object    ${r.w}x${r.h} -> ${scaled.width}x${scaled.height}  key(${key.join(',')})`,
  );
  return { width: scaled.width, height: scaled.height };
}
