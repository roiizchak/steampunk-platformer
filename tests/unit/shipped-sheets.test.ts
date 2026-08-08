import { describe, expect, it } from 'vitest';
import { readBytes, readPng } from '../../tools/gen/png.mjs';
import { gateAlpha, gateDimensions, gateLoopWrap, gateMotionFloor, PASS } from '../../tools/gen/gates.mjs';
import type { RgbaImage } from '../../tools/gen/png.d.mts';
import catalog from '../../public/assets/index.json';

/**
 * Criteria 4.3, 4.4 and 4.9, run against the **shipped bytes** — which is where they were not.
 *
 * ## Why this file exists
 *
 * All three criteria were satisfied at BUILD time and nowhere else. `gateDimensions` and
 * `gateAlpha` are not even imported by `build-assets.mjs` — the only code that ever read a real
 * asset's dimensions and alpha channel was the one-off gate-0 probe, on a different, earlier image,
 * whose result was then hard-coded as policy. `gateMotionFloor` and `gateLoopWrap` ARE called per
 * sheet by the build, but their verdicts are written to stdout and to
 * `_generated/sheet-report.json`, which is **gitignored** — so from a clean clone there is no
 * evidence any of it ever passed, and no way to notice if it stops.
 *
 * That is the shape vault 3.1 already forbids for levels: *a test must load the SHIPPED bytes the
 * player loads.* `tilemap-data.test.ts` does it for `.tmj`; nothing did it for the PNGs. Raised by
 * the `voltagent-qa-sec:qa-expert` gate owner, brief 2 — the adversarial pass, which asked how each
 * criterion could read PASS while the thing it names is broken, and answered: because the evidence
 * lives in a file nobody commits.
 *
 * The gates themselves are imported rather than reimplemented, so this suite and the build assert
 * one definition rather than two that agree on the happy path.
 */

const SHEETS = 'public/assets/characters/brass-courier/sheets';

/**
 * Read from the path, exactly as `sheet-packing.test.ts` does.
 *
 * Vite's `?arraybuffer` glob query does NOT return decodable bytes under vitest — it was tried
 * first and every gate threw `not a PNG (signature mismatch)`, which is a loud failure rather than
 * a silent one, but a failure of the loader, not of the art. `readPng` takes a path and does its
 * own file read inside `tools/gen/`, which is outside the typecheck program, so this needs no
 * `@types/node` — the constraint that made the glob look necessary in the first place.
 */
function stripFor(action: string): RgbaImage {
  return readPng(`${SHEETS}/${action}.png`) as RgbaImage;
}

function bytesFor(action: string): Uint8Array {
  return readBytes(`${SHEETS}/${action}.png`);
}

function sliceFrame(strip: RgbaImage, index: number, w: number, h: number): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const from = (y * strip.width + index * w) * 4;
    data.set(strip.data.subarray(from, from + w * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}

describe('the shipped character sheets, read from the files the player loads', () => {
  it('the catalog declares the five animations these assertions cover', () => {
    // Vault 4.16: a declared sheet with no file must FAIL, not be skipped. Iterating the catalog
    // rather than a directory listing is what makes a missing PNG a red test.
    expect(catalog.sheets.map((s) => s.key).sort()).toEqual([
      'brass-courier-fall',
      'brass-courier-idle',
      'brass-courier-jump',
      'brass-courier-run',
      'brass-courier-walk',
    ]);
  });

  for (const sheet of catalog.sheets) {
    describe(sheet.key, () => {
      const action = sheet.key.replace('brass-courier-', '');
      const buffer = () => bytesFor(action);

      it('4.3 — dimensions read from the FILE match the catalog', () => {
        // Not config-vs-catalog, which is what `asset-catalog.test.ts` compares. This decodes the
        // PNG header, so a catalog that disagrees with the bytes is caught rather than a catalog
        // that disagrees with another document.
        const verdict = gateDimensions(buffer(), {
          width: sheet.frameWidth * sheet.frameCount,
          height: sheet.frameHeight,
        });
        expect(verdict.status, `${sheet.key}: ${verdict.reason}`).toBe(PASS);
        expect(verdict.value.width).toBe(sheet.frameWidth * sheet.frameCount);
        expect(verdict.value.height).toBe(sheet.frameHeight);
      });

      it('4.4 — the alpha channel is present AND carries real transparency', () => {
        // Two separate facts, per vault 4.12: an opaque RGBA image has a channel and no
        // transparency, and reporting only "has alpha" would call a chroma-key failure a pass.
        const verdict = gateAlpha(buffer());
        expect(verdict.value.channelPresent).toBe(true);
        expect(verdict.value.realTransparency, `${sheet.key} is fully opaque — keying failed`).toBe(
          true,
        );
      });

      it('4.9 — every frame carries motion above the floor, measured on the shipped strip', () => {
        const strip = stripFor(action);
        const frames = Array.from({ length: sheet.frameCount }, (_u, i) =>
          sliceFrame(strip, i, sheet.frameWidth, sheet.frameHeight),
        );
        const verdict = gateMotionFloor(frames);
        expect(verdict.status, `${sheet.key}: ${verdict.reason}`).toBe(PASS);
      });

      if (sheet.loop) {
        it('4.9 — the loop wraps: the seam is no bigger than a step the clip already takes', () => {
          const strip = stripFor(action);
          const frames = Array.from({ length: sheet.frameCount }, (_u, i) =>
            sliceFrame(strip, i, sheet.frameWidth, sheet.frameHeight),
          );
          const verdict = gateLoopWrap(frames);
          expect(verdict.status, `${sheet.key}: ${verdict.reason}`).toBe(PASS);
        });
      }
    });
  }
});
