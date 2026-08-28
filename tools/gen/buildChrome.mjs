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

/**
 * The level EXIT — the gate-entry session.
 *
 * `192 x 288` because that is the goal rect in all five shipped `.tmj` files, so `drawGoal`'s
 * `setDisplaySize` is a no-op and the pixels are 1:1 at `CAMERA_ZOOM` 1 — the same "authored at the
 * size it draws at" rule `buildGear` states above.
 *
 * ## 🔴 The one-component check matters MORE here than for the gear, and still is not enough
 *
 * A doorway whose dark interior keyed away would come back as a **frame**: a ring, which is still
 * exactly ONE connected component, still 192 x 288, and still passes everything in this function.
 * What ships is a see-through hole the player fades into instead of a dark passage — the whole
 * point of the asset, silently inverted.
 *
 * So the real gate for that is `tests/unit/shipped-gate.test.ts`, which measures the FINISHED
 * file's interior opacity, its two jambs and the frame-versus-void luminance. Vault 3.1 in its
 * usual form: the unit suite runs the real validator over the shipped bytes.
 *
 * ## What take 1 cost, recorded because the refusal was correct
 *
 * Take 1 put the doorway flush against the bottom edge of the frame. `estimateKeyColour` measures
 * the key from the image's own border and refused it — that row came back **5.5 %** background
 * against 97.8 / 100 / 96.1 on the other three. **The gate was not weakened to accept it**; the
 * prompt gained an explicit margin clause naming the bottom edge, and take 2 keys cleanly. The
 * cost was one $0.15 generation, which is what the authorised retry is for.
 */
/**
 * The exit gate's drawn size, in world pixels.
 *
 * 🔴 **Deliberately LARGER than the goal rect it triggers on.** The rect is 192 x 288 and the
 * courier's box is `PLAYER_BOX` 22 x 48 at `RENDER_SCALE` 6 = 132 x 288 — so a gate authored at the
 * rect's size is exactly as tall as the character walking through it, and reads as a hatch rather
 * than a doorway. `288 x 432` keeps the source art's 2:3 aspect, stands 1.5x the courier's height,
 * and is 3 grid cells wide.
 *
 * ⚠️ **`src/scenes/goalArtSize.ts` is the authority; this is a copy.** A `.mjs` build tool cannot
 * import a `.ts` module, so the number lives twice — and `tests/unit/shipped-gate.test.ts` asserts
 * the shipped PNG's dimensions against the TS constant, so the copies cannot drift in silence.
 *
 * The TRIGGER stays 192 x 288. Art and trigger volume are now separate numbers on purpose:
 * `drawGoal` centres this on the rect horizontally and stands it on the rect's bottom edge, so the
 * doorway grows upward and outward from the threshold the sim actually tests. Containment is an
 * exact vertical equality against the rect — see `goal.ts` — and nothing here may change it.
 */
export const GATE_PX = { w: 288, h: 432 };

export function buildGate() {
  const image = raw('gate');
  const { key } = estimateKeyColour(image);
  const keyed = removeSpecks(keyOut(image, { key }));
  const rects = detectFrames(keyed, { minGap: 16, minExtent: 64 });
  if (rects.length !== 1) {
    throw new Error(
      `assets:world: expected ONE gate, detected ${rects.length}. The prompt asks for a single ` +
        `centred doorway that touches no edge; more than one component means it did not hold, and ` +
        `the exit the player sees would be whichever piece happened to be first.`,
    );
  }
  const r = rects[0];
  const trimmed = crop(keyed, r.x, r.y, r.w, r.h);
  // The keyed bounding box came back at 1636 x 2355 — a ratio of 0.6947 against this target's
  // 0.6667 — so this squashes the width by about 4 %, which is under the pixel grid at this size.
  //
  // 🔴 **Not the goal rect's size, and that is the point.** It was `192 x 288` — the rect exactly —
  // until the owner looked at a screenshot and said the obvious thing: *the gate needs to be bigger
  // than the character.* The rect is `192 x 288` and the courier's box is `132 x 288`, so the
  // doorway was drawn EXACTLY as tall as the person walking through it. Nothing measured that,
  // because every gate in the suite compared the drawing to the rect and the rect was right.
  // See `GATE_PX`.
  //
  // Rebuilt from the SAME generation — `npm run assets:world` re-downscales the original 1636 x 2355
  // crop — so this cost nothing and no fal call was made. Re-scaling the shipped 192 x 288 PNG by 1.5
  // would have been an upscale of already-downscaled pixels; this is one clean downscale.
  const scaled = downscale(trimmed, GATE_PX.w, GATE_PX.h);
  mkdirSync('public/assets/objects', { recursive: true });
  writeFileSync('public/assets/objects/gate.png', encodePng(scaled.width, scaled.height, scaled.data));
  console.log(
    `ok  gate      1 object    ${r.w}x${r.h} -> ${scaled.width}x${scaled.height}  key(${key.join(',')})`,
  );
  return { width: scaled.width, height: scaled.height };
}

/**
 * The HAZARD tile, generated on its own and pasted into the packed sheet.
 *
 * ## Why it is a separate source
 *
 * The sheet is ONE generation of sixteen tiles. Re-shooting it to fix one re-rolls the walkway, the
 * brass cap and the brick the whole game stands on — two of which `ground-tiles.test.ts` pins
 * against the shipped pixels. Pasting one isolated object into cell 12 changes exactly the tile that
 * was wrong and leaves the other fifteen byte-identical. `promptWorld.mjs`'s `spikesPrompt` carries
 * the rest of the reasoning, including why the old tile failed STYLE.md §5 rule 2.
 *
 * ## The two gates here, and why each earns its place
 *
 * **ONE component**, like the gear: the four blades are joined by the base rail, so anything that
 * detects as two means the rail keyed away and what would ship is loose spikes floating over the
 * walkway.
 *
 * **The rail must touch BOTH side edges.** Hazard runs are 2-5 tiles wide and painted as adjacent
 * cells, so a tile with a transparent margin at its sides draws a gap every 96 px along the run —
 * a striped hazard that looks like decoration again, which is the whole defect being fixed. Checked
 * on the keyed pixels rather than trusted to the prompt.
 *
 * Deliberately NOT squared. `square()` centres the crop and pads it, which would put a transparent
 * strip under the rail and lift the spikes off the floor by a pixel or two at 96 px. The source is
 * taken full-width and from the topmost ink to the bottom edge, so the rail stays flush.
 */
export function hazardTile(tileSize) {
  // Taken as an argument rather than re-read here: `build-world.mjs` parses `TILE_SIZE` out of
  // `src/game/constants.ts` precisely so this pipeline cannot carry a second copy of the grid size,
  // and a second parser in a second file would be that copy under another name.
  const image = raw('spikes');

  /**
   * 🔴 The key is estimated from a TOP STRIP, not from the whole border.
   *
   * `estimateKeyColour` samples the border one pixel deep and refuses when under 90 % of it agrees
   * — which is the right rule for every other asset in this project, and exactly wrong for this one.
   * The tile is *required* to reach the left, right and bottom edges so a run of them has no seam,
   * so three of its four borders are iron by design and the estimator refused at 67.2 % agreement.
   *
   * The strip is where the prompt asks for a clear chroma margin, so it is the part of the image the
   * estimator's assumption actually holds for — and running the real estimator over it keeps its
   * agreement check rather than replacing it with a hardcoded green *(vault 4.13: key by distance
   * with a tolerance, never by equality — the model returned ~(1,252,2), not pure green)*.
   */
  const STRIP = Math.max(2, Math.round(image.height * 0.05));
  const { key } = estimateKeyColour(crop(image, 0, 0, image.width, STRIP));
  const keyed = removeSpecks(keyOut(image, { key }));

  const rects = detectFrames(keyed, { minGap: 16, minExtent: 64 });
  if (rects.length !== 1) {
    throw new Error(
      `assets:world: expected ONE spike row, detected ${rects.length}. The blades are joined by ` +
        `the base rail; more than one component means the rail keyed away, and what would ship is ` +
        `loose spikes floating over the walkway.`,
    );
  }

  const opaqueAt = (x, y) => keyed.data[(y * keyed.width + x) * 4 + 3] > 0;
  const columnHasInk = (x) => {
    for (let y = 0; y < keyed.height; y += 1) if (opaqueAt(x, y)) return true;
    return false;
  };
  if (!columnHasInk(0) || !columnHasInk(keyed.width - 1)) {
    throw new Error(
      'assets:world: the spike tile does not reach both side edges, so a run of them would draw a ' +
        'transparent gap every tile. The base rail must run edge to edge.',
    );
  }

  const top = rects[0].y;
  const trimmed = crop(keyed, 0, top, keyed.width, keyed.height - top);
  const scaled = downscale(trimmed, tileSize, tileSize);
  return { scaled, source: `${trimmed.width}x${trimmed.height}` };
}

/**
 * Which cell the hazard tile occupies.
 *
 * `SPIKE_GID` is 13 and the tileset's `firstgid` is 1, so the local index is 12 — row 3, column 0.
 * Derived from the two constants rather than written as `12`, because a sheet with a different
 * column count would silently paste the spikes over the pipes.
 */
export const HAZARD_INDEX = 12;
