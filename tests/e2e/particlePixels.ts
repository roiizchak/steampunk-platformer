/**
 * Read the PIXELS of a generated particle texture — the boundary every Phase 9 gate stopped short of.
 *
 * ## The mutation that proved it was needed
 *
 * `pen.fillStyle(spec.tint, 1)` -> `pen.fillStyle(spec.tint, 0)` in `particleTexture.ts`. Every
 * generated particle becomes fully transparent, every particle in the game is invisible, and the
 * whole suite stays green: run on a real GPU, criterion 9.6 reported `drawn 96 inView 96` and
 * PASSED. Codex named it as the next green mutation in the Phase 9 implementation review (finding 2)
 * and the integrator ran it before this file existed.
 *
 * Nothing could see it because nothing read the texture:
 *
 *  - `effects-draw-path.test.ts` asserted that the SOURCE of `ensureParticleTexture` contains the
 *    string `spec.tint`. It still does under the mutation — only the alpha argument changed.
 *  - `effectCounts.ts` transcribes the renderer's submission predicates: emitter alpha, particle
 *    alpha, particle scale, `willRender`. A fully transparent TEXTURE passes all four, because
 *    Phaser submits the quad and the transparency is the fragment shader's problem.
 *  - `phase-09-draw.spec.ts`'s real-trigger test counts alive particles and `willRender`. Same.
 *
 * So the whole phase measured *"would Phaser draw this"* and never *"is there anything to draw"*.
 *
 * ## Why this reads a canvas and not the framebuffer
 *
 * `Graphics.generateTexture(key, w, h)` with a string key calls `TextureManager.createCanvas` and
 * runs the CANVAS renderer into that context (`Graphics.js:1532-1590`) — the generated texture is
 * canvas-backed on both backends. `TextureManager.getPixel` then requires exactly that
 * (`source.isCanvas || isVideo || HTMLImageElement`, `TextureManager.js:1509-1546`) and returns
 * non-premultiplied RGBA through a 1x1 scratch context.
 *
 * That makes this assertion **renderer-independent**, which is the point: the reason
 * `particleTexture.ts` bakes three coloured textures instead of tinting one white dot is that tint
 * is WebGL-only in Phaser 4 and this game runs `Phaser.AUTO` with a live Canvas fallback. A gate on
 * the baked colour that itself needed WebGL would not cover the case the baking exists for.
 *
 * ⚠️ It reads the texture, not the screen. A particle drawn behind an opaque wall still has opaque
 * pixels here; criterion 9.8's hands-on pass is where someone looks at the screen *(vault 9.3)*.
 */

import { EMITTER_SPECS, type EffectKind } from '../../src/render/effects';
import { PARTICLE_TEXTURE_PREFIX } from '../../src/scenes/particleTexture';

type Page = import('@playwright/test').Page;

/** One texture's two samples: the centre of the dot, and a corner that must be outside it. */
export interface ParticlePixels {
  key: string;
  width: number;
  height: number;
  /** `[r, g, b, a]`, 0-255, non-premultiplied, at the texture's centre. */
  centre: [number, number, number, number];
  /** The same at `(0, 0)` — outside a circle inscribed in the frame. */
  corner: [number, number, number, number];
}

/**
 * Sample every generated particle texture through Phaser's own `TextureManager.getPixel`.
 *
 * Throws rather than returns a sentinel when a texture or a sample is missing: a probe that
 * silently returned zeros would red the opacity assertion for the wrong reason and read as the
 * defect it exists to find.
 */
export async function particlePixels(page: Page): Promise<Record<EffectKind, ParticlePixels>> {
  // Keyed by KIND on the way out, so the spec never rebuilds the texture key and cannot drift from
  // the prefix `ensureParticleTexture` actually uses.
  const kinds = Object.keys(EMITTER_SPECS) as EffectKind[];
  const keys = kinds.map((kind) => `${PARTICLE_TEXTURE_PREFIX}${kind}`);
  const byKey = await page.evaluate((textureKeys: string[]) => {
    // Structurally typed, like every other probe in this directory: the browser context has no
    // Phaser namespace, and naming only what is called keeps the shape the assertion depends on
    // visible at the read rather than buried in an engine `.d.ts`.
    const game = (
      window as unknown as {
        __phaserGame?: {
          textures: {
            exists(key: string): boolean;
            getFrame(key: string): { width: number; height: number };
            getPixel(
              x: number,
              y: number,
              key: string,
            ): { red: number; green: number; blue: number; alpha: number } | null;
          };
        };
      }
    ).__phaserGame;
    if (game === undefined) {
      throw new Error('particlePixels: window.__phaserGame is absent — this is a dev build only');
    }
    const out: Record<string, ParticlePixels> = {};
    for (const key of textureKeys) {
      if (!game.textures.exists(key)) {
        throw new Error(`particlePixels: no texture "${key}" — attachEffects never generated it`);
      }
      const frame = game.textures.getFrame(key);
      const cx = Math.floor(frame.width / 2);
      const cy = Math.floor(frame.height / 2);
      const read = (x: number, y: number): [number, number, number, number] => {
        const px = game.textures.getPixel(x, y, key);
        if (px === null) {
          throw new Error(`particlePixels: getPixel(${x}, ${y}, "${key}") returned null`);
        }
        return [px.red, px.green, px.blue, px.alpha];
      };
      out[key] = {
        key,
        width: frame.width,
        height: frame.height,
        centre: read(cx, cy),
        corner: read(0, 0),
      };
    }
    return out;
  }, keys);
  return Object.fromEntries(
    kinds.map((kind) => [kind, byKey[`${PARTICLE_TEXTURE_PREFIX}${kind}`]]),
  ) as Record<EffectKind, ParticlePixels>;
}

/** The spec's `tint` split into the three channels `getPixel` reports. */
export function tintChannels(kind: EffectKind): [number, number, number] {
  const tint = EMITTER_SPECS[kind].tint;
  return [(tint >> 16) & 0xff, (tint >> 8) & 0xff, tint & 0xff];
}
