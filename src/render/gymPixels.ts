/**
 * Read a loaded texture's RGBA bytes off a scratch canvas, for `GymScene.boundsFor` to measure.
 * Split out of `GymScene` (HANDOFF §4 step 6a / W7) to keep that file under the 400-line ceiling.
 *
 * Not Phaser — it takes the source image `getSourceImage()` already returned, not a texture
 * object — but not usefully unit-testable either: `HTMLCanvasElement.getContext('2d')` needs a
 * real DOM, which the project's `node` test environment does not provide. Isolating it is still
 * worth doing for the file-size budget, and it is the same readback `boundsFor`'s own docstring
 * describes: of the TEXTURE Phaser loaded, not the file on disk, so what is measured is what is
 * drawn.
 */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function readRgba(source: HTMLImageElement | HTMLCanvasElement): RgbaImage {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('gymPixels: no 2d context — the visual footprint cannot be measured');
  }
  context.drawImage(source, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data, width: canvas.width, height: canvas.height };
}
