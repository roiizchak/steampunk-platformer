/**
 * WORK ITEM A-T3 — pad an anchor onto a larger square chroma canvas to buy headroom.
 *
 * ## Why this exists
 *
 * Seedance 2 crops the subject at the frame edge, and the live schema exposes neither a
 * negative-prompt field nor a seed — only the anchor image and the prompt text change what it
 * does. `brass-courier` stands at 91.8% of its 1536x2752 canvas height, 5.1% top margin, and a
 * jump raises the arms above that with almost no room to absorb it. Padding is the only lever
 * that changes the fill fraction.
 *
 * **A translation-only blit adds canvas, it does not shrink the figure.** Padding a 1536x2752
 * image onto a 2752x2752 canvas adds WIDTH ONLY — the figure stays exactly as many pixels tall as
 * it was, so its fraction of a now-taller-relative-to-width canvas is unchanged unless the canvas
 * also grows past the original height. The only way to lower the fill fraction is to grow the
 * canvas past what padding width alone can reach, which is why the canvas here is sized off the
 * figure's height and `fill`, not off the source dimensions.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { borderKey, keyOut } from './chroma.mjs';
import { decodePng, encodePng, readBytes } from './png.mjs';

export const DEFAULT_FILL = 0.65;

/**
 * The keyed, fully-opaque bounding box of the subject.
 *
 * The raw anchor is opaque everywhere (chroma green background, no real alpha), so a bbox off the
 * FILE's own alpha channel would just be the whole canvas. Keying first with the image's own
 * `borderKey` is what turns "opaque" into "subject" — `alpha === 255` after `keyOut` is the
 * subject's solid core, deliberately excluding the despill ramp at its edge.
 */
function subjectBounds(image, key) {
  const keyed = keyOut(image, { key });
  const { width, height, data } = keyed;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 255) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxY < 0) {
    throw new Error('subjectBounds: no fully-opaque pixel survived keying — nothing to measure');
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Pad `image` onto a square canvas so the subject occupies `fill` of the canvas height.
 *
 * Throws rather than silently producing a canvas that cannot fit the source — the exact arithmetic
 * error this tool exists to make impossible (see the header).
 */
export function padToFill(image, { fill = DEFAULT_FILL } = {}) {
  if (!(fill > 0 && fill < 1)) {
    throw new Error(`padToFill: fill must be between 0 and 1 (exclusive), got ${fill}`);
  }
  const key = borderKey(image);
  const bounds = subjectBounds(image, key);

  let canvas = Math.round(bounds.height / fill);
  if (canvas % 2 !== 0) canvas += 1; // square canvas, kept even so the centring offset is exact

  if (canvas < image.width || canvas < image.height) {
    throw new Error(
      `padToFill: a ${canvas}x${canvas} canvas cannot hold the ${image.width}x${image.height} ` +
        `source. A translation-only blit only WIDENS the canvas around the figure — it cannot make ` +
        `the figure smaller — so a canvas below either source dimension is the padding-adds-width-` +
        `only arithmetic error, not a valid target. Choose a larger fill.`,
    );
  }

  const out = new Uint8ClampedArray(canvas * canvas * 4);
  for (let p = 0; p < canvas * canvas; p += 1) {
    out[p * 4] = key[0];
    out[p * 4 + 1] = key[1];
    out[p * 4 + 2] = key[2];
    out[p * 4 + 3] = 255;
  }

  const offsetX = Math.floor((canvas - image.width) / 2);
  const offsetY = Math.floor((canvas - image.height) / 2);
  for (let row = 0; row < image.height; row += 1) {
    const from = row * image.width * 4;
    const to = ((offsetY + row) * canvas + offsetX) * 4;
    out.set(image.data.subarray(from, from + image.width * 4), to);
  }

  return { width: canvas, height: canvas, data: out };
}

/** Figure size and margins as fractions of the canvas, for the CLI's before/after print. */
function measureGeometry(image) {
  const key = borderKey(image);
  const bounds = subjectBounds(image, key);
  const marginTop = bounds.minY;
  const marginBottom = image.height - 1 - bounds.maxY;
  const marginLeft = bounds.minX;
  const marginRight = image.width - 1 - bounds.maxX;
  const pct = (px, of) => `${px}px (${((px / of) * 100).toFixed(1)}%)`;
  return {
    canvas: `${image.width}x${image.height}`,
    figureW: pct(bounds.width, image.width),
    figureH: pct(bounds.height, image.height),
    marginTop: pct(marginTop, image.height),
    marginBottom: pct(marginBottom, image.height),
    marginLeft: pct(marginLeft, image.width),
    marginRight: pct(marginRight, image.width),
  };
}

function printGeometry(label, image) {
  const g = measureGeometry(image);
  console.log(`${label}: canvas ${g.canvas}`);
  console.log(`  figure: width ${g.figureW}, height ${g.figureH}`);
  console.log(
    `  margins: top ${g.marginTop}, bottom ${g.marginBottom}, left ${g.marginLeft}, ` +
      `right ${g.marginRight}`,
  );
}

/** CLI: `node tools/gen/padAnchor.mjs <slug> [--fill 0.65]`. */
function main(argv) {
  const slug = argv[0];
  if (!slug || slug.startsWith('--')) {
    console.error('usage: node tools/gen/padAnchor.mjs <slug> [--fill 0.65]');
    process.exit(1);
  }
  const fillIndex = argv.indexOf('--fill');
  const fill = fillIndex >= 0 ? Number(argv[fillIndex + 1]) : DEFAULT_FILL;

  const srcPath = `public/assets/characters/${slug}/anchor.png`;
  const image = decodePng(readBytes(srcPath));
  printGeometry('before', image);

  const padded = padToFill(image, { fill });
  printGeometry('after', padded);

  const outDir = '_generated/anchors-padded';
  mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/${slug}-padded.png`;
  writeFileSync(outPath, encodePng(padded.width, padded.height, padded.data));
  console.log(`wrote ${outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
