/**
 * Minimal PNG decode/encode, written out rather than installed.
 *
 * **Why this file exists at all.** Dependencies are frozen (PRD Global Constraints): runtime
 * `phaser@4.2.1`, dev `vite` / `typescript` / `vitest` / `@playwright/test`, and anything else is a
 * STOP-and-ask. Phase 1 needed `@types/node` twice and solved it without adding it. A PNG is
 * zlib-compressed filtered scanlines and `node:zlib` is built in, so the decoder is ~120 lines and
 * costs nothing. This is a pipeline utility, not a general-purpose codec, and it says so by
 * REFUSING everything it does not handle instead of guessing.
 *
 * It lives in `tools/gen/` as `.mjs` for the same reason `verify-dist.mjs` does: `tools/` is outside
 * the tsconfig `include`, so a `node:zlib` import here never drags `@types/node` into the project.
 * A hand-written `png.d.mts` gives the unit suite a typed view of exactly this surface.
 *
 * **Everything it refuses, it refuses loudly** *(vault 4.16 — a declared input that cannot be found
 * must fail, never substitute)*. A decoder that silently returns a blank image on an interlaced PNG
 * is how a build ships an empty sprite that every downstream metric happily measures.
 */

import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Decode a PNG off disk, given a path relative to the repository root.
 *
 * It lives here rather than in a test because the unit suite has no way to reach the filesystem:
 * the dependency list is frozen, so there is no `@types/node`, and `node:fs` cannot be imported
 * from a `.ts` file under `strict`. `.mjs` sits outside the tsconfig `include`, so this module
 * already imports `node:zlib` without dragging types into the project — `readFileSync` rides the
 * same bridge, and `png.d.mts` is what makes it callable from a test.
 *
 * Every other unit test reads shipped files through `import.meta.glob(..., { query: '?raw' })`,
 * which is correct for text and lossy for a PNG: `?raw` decodes the bytes as UTF-8 and every
 * byte above 0x7F becomes a replacement character.
 */
export function readPng(path) {
  return decodePng(readFileSync(path));
}

/**
 * The same bridge, one step earlier: the raw file bytes.
 *
 * `gateDimensions` and `gateAlpha` take a buffer rather than a decoded image, because reading the
 * IHDR and the colour type is the whole point of them — a decoded image has already lost the
 * distinction between "no alpha channel" and "an alpha channel that is entirely 255". A test
 * cannot call `readFileSync` itself (`@types/node` is deliberately not a dependency, and `tests/`
 * is inside the typecheck program), so it comes through here.
 */
export function readBytes(path) {
  return readFileSync(path);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Channels per pixel, by PNG colour type. `null` means we do not handle it. */
const CHANNELS = { 0: 1, 2: 3, 3: null, 4: 2, 6: 4 };

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG buffer to `{ width, height, data, sourceHadAlphaChannel }`.
 *
 * `data` is always RGBA, 4 bytes per pixel, so downstream code has one layout to reason about.
 * `sourceHadAlphaChannel` reports whether the FILE carried an alpha channel — which is a different
 * question from whether any pixel is transparent, and vault **4.12** is about not confusing them.
 */
export function decodePng(input) {
  if (!ArrayBuffer.isView(input)) {
    throw new Error('decodePng: expected a Uint8Array or Buffer');
  }
  // Accept any Uint8Array. `Buffer` is a Uint8Array subclass, so callers holding either work, and
  // the wrap is a view rather than a copy. The typed declaration in `png.d.mts` says Uint8Array;
  // an implementation stricter than its own contract is a bug waiting for a caller.
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input.buffer, input.byteOffset, input.byteLength);

  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('decodePng: not a PNG (signature mismatch)');
  }

  let offset = 8;
  let ihdr = null;
  const idat = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error(`decodePng: chunk "${type}" runs past the end of the buffer`);
    }

    if (type === 'IHDR') {
      ihdr = {
        width: buffer.readUInt32BE(dataStart),
        height: buffer.readUInt32BE(dataStart + 4),
        bitDepth: buffer[dataStart + 8],
        colorType: buffer[dataStart + 9],
        interlace: buffer[dataStart + 12],
      };
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!ihdr) {
    throw new Error('decodePng: no IHDR chunk');
  }
  if (ihdr.bitDepth !== 8) {
    throw new Error(`decodePng: only 8-bit channels are handled, got ${ihdr.bitDepth}`);
  }
  if (ihdr.interlace !== 0) {
    throw new Error('decodePng: interlaced PNGs are not handled');
  }
  const channels = CHANNELS[ihdr.colorType];
  if (!channels) {
    throw new Error(`decodePng: colour type ${ihdr.colorType} is not handled`);
  }
  if (idat.length === 0) {
    throw new Error('decodePng: no IDAT data');
  }

  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (raw.length < expected) {
    throw new Error(`decodePng: inflated ${raw.length} bytes, expected ${expected}`);
  }

  // Un-filter, scanline by scanline. Each line is prefixed with its filter byte.
  const lines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src + i];
      const a = i >= channels ? lines[dst + i - channels] : 0;
      const b = y > 0 ? lines[up + i] : 0;
      const c = y > 0 && i >= channels ? lines[up + i - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + ((a + b) >> 1); break;
        case 4: value = x + paeth(a, b, c); break;
        default: throw new Error(`decodePng: unknown filter ${filter} on row ${y}`);
      }
      lines[dst + i] = value & 0xff;
    }
  }

  // Widen to RGBA so every caller sees one layout.
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels;
    const d = p * 4;
    if (channels === 1) {
      data[d] = lines[s]; data[d + 1] = lines[s]; data[d + 2] = lines[s]; data[d + 3] = 255;
    } else if (channels === 2) {
      data[d] = lines[s]; data[d + 1] = lines[s]; data[d + 2] = lines[s]; data[d + 3] = lines[s + 1];
    } else if (channels === 3) {
      data[d] = lines[s]; data[d + 1] = lines[s + 1]; data[d + 2] = lines[s + 2]; data[d + 3] = 255;
    } else {
      data[d] = lines[s]; data[d + 1] = lines[s + 1];
      data[d + 2] = lines[s + 2]; data[d + 3] = lines[s + 3];
    }
  }

  return {
    width,
    height,
    data,
    colorType: ihdr.colorType,
    sourceHadAlphaChannel: ihdr.colorType === 4 || ihdr.colorType === 6,
  };
}

function chunk(type, payload) {
  const out = Buffer.alloc(payload.length + 12);
  out.writeUInt32BE(payload.length, 0);
  out.write(type, 4, 'ascii');
  payload.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + payload.length)), 8 + payload.length);
  return out;
}

/**
 * Encode RGBA to a PNG buffer. Always colour type 6, filter 0, deflate level 9.
 *
 * **Deterministic by construction** — the same pixels produce the same bytes, on any machine, which
 * is what makes the byte-identical rebuild contract *(vault 4.15)* checkable at all. No timestamp,
 * no `tEXt`, no adaptive filter heuristic that could change between zlib versions.
 */
export function encodePng(width, height, data) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error(`encodePng: bad dimensions ${width}x${height}`);
  }
  if (data.length !== width * height * 4) {
    throw new Error(`encodePng: expected ${width * height * 4} bytes of RGBA, got ${data.length}`);
  }

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let i = 0; i < stride; i += 1) {
      raw[y * (stride + 1) + 1 + i] = data[y * stride + i];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A blank RGBA image, used by the gate self-tests to build synthetic fixtures. */
export function blank(width, height, rgba = [0, 0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    data[p * 4] = rgba[0];
    data[p * 4 + 1] = rgba[1];
    data[p * 4 + 2] = rgba[2];
    data[p * 4 + 3] = rgba[3];
  }
  return { width, height, data };
}
