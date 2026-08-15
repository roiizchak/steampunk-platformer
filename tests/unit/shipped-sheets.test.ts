import { describe, expect, it } from 'vitest';
import { readBytes, readPng } from '../../tools/gen/png.mjs';
import { FAIL, gateAlpha, gateDimensions, gateLoopWrap, gateMotionFloor, PASS } from '../../tools/gen/gates.mjs';
import type { RgbaImage } from '../../tools/gen/png.d.mts';
import catalog from '../../public/assets/index.json';

/**
 * Loop-wrap failures that are RECORDED ART DEFECTS, not test bugs — confirmed independently by
 * `node tools/gen/build-assets.mjs <slug> <action>` printing the same FAIL. Per the project rule
 * that a gate is corrected by changing what it MEASURES, never what it TOLERATES, a sheet never
 * leaves the normal PASS-only loop below by being added here quietly: this set exists so the
 * failure stays a named, asserted, permanently-red-if-fixed fact instead of a silently skipped one.
 * See docs/qa/phase-05-combat.md.
 */
const KNOWN_LOOP_WRAP_FAILURES = new Set(['brass-sentry-idle']);

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

/**
 * Read from the path, exactly as `sheet-packing.test.ts` does.
 *
 * Vite's `?arraybuffer` glob query does NOT return decodable bytes under vitest — it was tried
 * first and every gate threw `not a PNG (signature mismatch)`, which is a loud failure rather than
 * a silent one, but a failure of the loader, not of the art. `readPng` takes a path and does its
 * own file read inside `tools/gen/`, which is outside the typecheck program, so this needs no
 * `@types/node` — the constraint that made the glob look necessary in the first place.
 *
 * The path comes from the catalog row's own `url` field, never reconstructed from the key plus a
 * hardcoded slug directory — that reconstruction is what sent `brass-sentry-idle` looking for
 * `brass-courier/sheets/brass-sentry-idle.png` and got ENOENT (R1/R2: read the declared value,
 * never infer it from a naming convention).
 */
function stripFor(url: string): RgbaImage {
  return readPng(`public/${url}`) as RgbaImage;
}

function bytesFor(url: string): Uint8Array {
  return readBytes(`public/${url}`);
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
  it('the catalog declares the fifteen animations these assertions cover', () => {
    // Vault 4.16: a declared sheet with no file must FAIL, not be skipped. Iterating the catalog
    // rather than a directory listing is what makes a missing PNG a red test.
    expect(catalog.sheets.map((s) => s.key).sort()).toEqual([
      // Session 7: the padded round, packed at its OWN per-action scale (0.6) instead of the slug
      // default — draws 289px against hurt's 288, not the 114px the slug-default scale produced.
      'brass-courier-attack',
      // Session 10: the last courier animation to land, and the only one that needed the cell
      // widened (288 -> 336) before `packStrip` would take it — a falling body is wider than a
      // standing one, and vault 4.14 says widen the cell rather than rescale the animation. Until
      // it shipped, dying held the player on whatever frame they were on and read as a freeze.
      'brass-courier-death',
      'brass-courier-fall',
      // Session 6: extracted clean from the EXISTING unpadded clip — no purchase, found only by a
      // per-action sweep. The first Phase 5 combat sheet to ship.
      'brass-courier-hurt',
      'brass-courier-idle',
      'brass-courier-jump',
      'brass-courier-run',
      'brass-courier-walk',
      /**
       * Session 10: the sentry's K.O. and its firing pose — the last two of the six enemy
       * animations, and the pair that completed `enemyAnimKeys()`.
       *
       * **$0 of new art was needed and $2.38 was spent proving that.** Both clips were bought in
       * session 6 and had sat unpacked because G6 failed them. Session 10 measured *where*: the
       * machine is complete in both (`fire` at L232 T278 B244, `death` at L226 R200 B244), and
       * what crosses the edge is the muzzle discharge and a detached steam plume respectively.
       * Two single-variable re-shoots from a larger padded anchor failed to move either, because
       * padding scales a subject and cannot scale an effect that exists to leave the scene.
       *
       * They ship under a narrow, pinned exception — `tools/gen/edgeExceptions.mjs`, locked by
       * `tests/unit/edge-exceptions.test.ts` to this exact filename and this exact edge. No G6
       * threshold moved. Until these landed, a killed sentry looped its `idle` at 0.35 alpha
       * forever, because `playIfChanged` no-ops on a key the catalog never registered.
       */
      'brass-sentry-death',
      'brass-sentry-fire',
      'brass-sentry-idle',
      // Session 9: blocked for TWO sessions on an unmeasured stride, and it never needed one. A
      // looping animation's cadence is authored now, so `chase` resolved the moment that rule
      // changed — see character-bounds-rust-scavenger.json's `_loopFps`. Adopting it also dissolves
      // finding T10, which recorded that 5.3's chase commitment was unobservable on screen.
      'rust-scavenger-chase',
      // Session 9: the enemy KO animation, and the first sheet packed through the DECLARED cell
      // pitch rather than re-detected bands. It could not pack before for two independent reasons,
      // both fixed rather than tolerated: a 64px chunk of the dying scavenger flew clear of its
      // body and `detectFrames` read the 46px gap behind it as a frame boundary (12 bands for 10
      // frames), and the fragment guard then measured HEIGHT, which a collapsing figure loses
      // legitimately. $0 — the clip was bought in session 4 and had sat unadopted since.
      'rust-scavenger-death',
      /**
       * Session 11, $1.19, **first take adopted** — `request_id 01a003ac-ba90-7fd1-acf6-ec8e8c32a81d`.
       *
       * The state existed before the art did. `scavengerAnim` returned a gait from `chasing` alone,
       * so a scavenger held still by its dead zone, a ledge veto or a patrol clamp **ran its cycle
       * on the spot**. The sim fix (`moving`, a readback of `x`) landed first at $0 and changed
       * nothing on screen by itself: `playAnim.ts` no-ops on an unregistered key, so the sprite kept
       * playing `chase`. This sheet is what made the fix visible.
       *
       * Bought against a measured risk — a cyclic idle from this endpoint had failed two different
       * ways before (`rust-scavenger/walk` r2 failed extraction outright; `brass-sentry/idle`
       * extracts but ships under a `gateLoopWrap` exception). It passed both first try, with the
       * **tightest loop wrap of any scavenger sheet**: 0.00545 within 0.01857, against walk's
       * 0.01088 and chase's 0.01371.
       */
      'rust-scavenger-idle',
      // D1 (session 7): the frame cell widened 288 -> 384 and this sheet's row resolved.
      'rust-scavenger-walk',
    ]);
  });

  for (const sheet of catalog.sheets) {
    describe(sheet.key, () => {
      const buffer = () => bytesFor(sheet.url);

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
        const strip = stripFor(sheet.url);
        const frames = Array.from({ length: sheet.frameCount }, (_u, i) =>
          sliceFrame(strip, i, sheet.frameWidth, sheet.frameHeight),
        );
        const verdict = gateMotionFloor(frames);
        expect(verdict.status, `${sheet.key}: ${verdict.reason}`).toBe(PASS);
      });

      // `brass-sentry-idle` is a KNOWN, RECORDED loop-wrap failure (see the set above) — asserted
      // separately below instead of here, so this loop stays PASS-only for every other sheet and
      // cannot be quietly widened to tolerate a second failure by editing this condition.
      if (sheet.loop && !KNOWN_LOOP_WRAP_FAILURES.has(sheet.key)) {
        it('4.9 — the loop wraps: the seam is no bigger than a step the clip already takes', () => {
          const strip = stripFor(sheet.url);
          const frames = Array.from({ length: sheet.frameCount }, (_u, i) =>
            sliceFrame(strip, i, sheet.frameWidth, sheet.frameHeight),
          );
          const verdict = gateLoopWrap(frames);
          expect(verdict.status, `${sheet.key}: ${verdict.reason}`).toBe(PASS);
        });
      }
    });
  }

  describe('recorded art defects — kept visible, never silenced (docs/qa/phase-05-combat.md)', () => {
    it('brass-sentry-idle STILL FAILS 4.9 loop-wrap: the wrap snaps past the clip\'s own largest step', () => {
      const sheet = catalog.sheets.find((s) => s.key === 'brass-sentry-idle');
      expect(sheet, 'brass-sentry-idle must stay in the catalog for this defect to stay observable').toBeDefined();
      const strip = stripFor(sheet!.url);
      const frames = Array.from({ length: sheet!.frameCount }, (_u, i) =>
        sliceFrame(strip, i, sheet!.frameWidth, sheet!.frameHeight),
      );
      const verdict = gateLoopWrap(frames);
      // Confirmed independently by `node tools/gen/build-assets.mjs brass-sentry idle`, which
      // printed `loop: FAIL — wrap 0.02437 exceeds 0.02032 — it snaps`. If this ever turns PASS,
      // the art was fixed — remove the key from KNOWN_LOOP_WRAP_FAILURES above rather than leaving
      // this assertion red.
      expect(verdict.status, `expected this known defect to still FAIL; it PASSED: ${verdict.reason}`).toBe(
        FAIL,
      );
    });
  });
});
