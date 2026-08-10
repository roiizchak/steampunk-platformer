/**
 * The Gym's screen-space geometry for one drawn frame — zoom, cell placement, footprint and
 * collision box in screen pixels. Split out of `GymScene.refresh` (HANDOFF §4 step 6a / W7) to
 * keep that file under the 400-line ceiling; **engine-free** like the rest of `src/render/`, so
 * the clamp and rect math are reachable from a unit test rather than only from a screenshot.
 */

import { boundsRect, type Bounds } from './gymBounds';

export interface GymGeometry {
  /** Clamped to the largest offered zoom whose whole cell still fits above the ground line. */
  zoom: number;
  cellLeft: number;
  cellTop: number;
  /** The measured footprint in screen space. `null` when the frame's bounds are INDETERMINATE. */
  screenRect: [number, number, number, number] | null;
  /** The read-only collision box (`PLAYER_BOX x RENDER_SCALE`) in screen space. */
  boxRect: [number, number, number, number];
}

export interface GymGeometryInput {
  frameWidth: number;
  frameHeight: number;
  /** Magnifications offered, e.g. `[1, 2, 4]`; index by `zoomStep`. */
  zooms: readonly number[];
  zoomStep: number;
  groundY: number;
  centreX: number;
  offsetPx: number;
  bounds: Bounds | null;
  collisionW: number;
  collisionH: number;
}

export function computeGymGeometry(input: GymGeometryInput): GymGeometry {
  const { frameWidth, frameHeight, zooms, zoomStep, groundY, centreX, offsetPx, bounds, collisionW, collisionH } =
    input;

  // Clamp to the largest zoom whose whole cell fits above the ground line: at 4x a 384 px cell is
  // 1536 px tall against a 1080 px view, so an unclamped zoom cuts the character's head off at the
  // exact magnification an anatomy check is for.
  const asked = zooms[zoomStep];
  const fits = zooms.filter((z) => frameHeight * z <= groundY);
  const zoom = asked <= (fits[fits.length - 1] ?? 1) ? asked : (fits[fits.length - 1] ?? 1);

  // The cell's LAST ROW is the contact line, so putting it on the ground line is what makes the
  // drawn feet and the drawn floor comparable by eye. `offsetPx` is applied here exactly as the
  // renderer applies `footOffsetPx`.
  const cellLeft = centreX - (frameWidth * zoom) / 2;
  const cellTop = groundY - frameHeight * zoom - offsetPx * zoom;

  const rect = bounds ? boundsRect(bounds) : null;
  const screenRect: [number, number, number, number] | null = rect
    ? [cellLeft + rect.x * zoom, cellTop + rect.y * zoom, rect.w * zoom, rect.h * zoom]
    : null;

  const boxW = collisionW * zoom;
  const boxH = collisionH * zoom;
  const boxRect: [number, number, number, number] = [centreX - boxW / 2, groundY - boxH, boxW, boxH];

  return { zoom, cellLeft, cellTop, screenRect, boxRect };
}
