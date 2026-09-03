import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readPng, encodePng } from './png.mjs';

/**
 * The browser-tab icon, cut from the game's own collectible gear.
 *
 * 🔴 **The page shipped for thirteen phases with no favicon at all** — no `<link rel="icon">`
 * anywhere in `index.html`, so every tab showed the browser's default globe and every bookmark was
 * unidentifiable. Found 2026-09-03 when the owner asked for one.
 *
 * ⚠️ **No new art was generated for this.** `public/assets/objects/gear.png` is 72x72, already
 * through the style lock, already shipped, and fills its own frame edge to edge (ink bbox 0,0-71,71,
 * 3226 of 5184 pixels carrying alpha). Generating an icon instead would have been an art task under
 * a `$60` ceiling with **$2.25** left on it, plus a STYLE.md-conformant prompt and a gate. A
 * downscale of a shipped sprite is none of those things.
 *
 * **The downscale premultiplies alpha and the reason is not cosmetic.** Averaging straight RGBA
 * across a transparent edge weights fully-transparent pixels' colour — usually black — into the
 * result, which draws a dark fringe around every rim of the gear at 32 px, where the whole icon is
 * rim. Premultiply, average, un-premultiply.
 */
const root = join(fileURLToPath(new URL('../../', import.meta.url)), '/');

/** Sizes the tab, the bookmark bar and Windows actually ask for. 180 (iOS) would be an UPSCALE. */
export const ICON_SIZES = [32, 48];

/** Box-filter downscale of an RGBA image, alpha-correct. `size` must divide nothing evenly. */
export function downscale(src, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  const scale = src.width / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx0 = Math.floor(x * scale);
      const sy0 = Math.floor(y * scale);
      const sx1 = Math.min(src.width, Math.ceil((x + 1) * scale));
      const sy1 = Math.min(src.height, Math.ceil((y + 1) * scale));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const al = src.data[i + 3] / 255;
          r += src.data[i] * al;
          g += src.data[i + 1] * al;
          b += src.data[i + 2] * al;
          a += src.data[i + 3];
          n++;
        }
      }
      const o = (y * size + x) * 4;
      const meanA = a / n;
      // Un-premultiply. A fully transparent cell has no colour to recover and stays at zero.
      const k = meanA > 0 ? 255 / meanA : 0;
      out[o] = (r / n) * k;
      out[o + 1] = (g / n) * k;
      out[o + 2] = (b / n) * k;
      out[o + 3] = meanA;
    }
  }
  return { width: size, height: size, data: out };
}

/**
 * An `.ico` whose entries are whole PNG files. Every browser since IE11 reads this form, and it is
 * the only one worth writing by hand — the alternative is a BMP with a separate 1-bit AND mask.
 */
export function buildIco(pngs) {
  const dir = Buffer.alloc(6 + 16 * pngs.length);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type: icon
  dir.writeUInt16LE(pngs.length, 4);
  let offset = dir.length;
  pngs.forEach(({ size, bytes }, i) => {
    const e = 6 + 16 * i;
    dir.writeUInt8(size >= 256 ? 0 : size, e); // 0 means 256
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt8(0, e + 2); // palette count
    dir.writeUInt8(0, e + 3); // reserved
    dir.writeUInt16LE(1, e + 4); // colour planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(bytes.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += bytes.length;
  });
  return Buffer.concat([dir, ...pngs.map((p) => Buffer.from(p.bytes))]);
}

const src = readPng(join(root, 'public/assets/objects/gear.png'));
const pngs = ICON_SIZES.map((size) => {
  const img = downscale(src, size);
  const bytes = encodePng(img.width, img.height, img.data);
  writeFileSync(join(root, `public/favicon-${size}.png`), bytes);
  return { size, bytes };
});
writeFileSync(join(root, 'public/favicon.ico'), buildIco(pngs));
console.log(
  'wrote',
  pngs.map((p) => `public/favicon-${p.size}.png (${p.bytes.length}B)`).join(', '),
  `and public/favicon.ico (${buildIco(pngs).length}B)`,
);
