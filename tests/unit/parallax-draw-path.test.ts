import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { parallaxLayers } from '../../src/render/parallaxRig';
import { createParallax, renderParallax } from '../../src/scenes/gameParallax';

/**
 * # The parallax rig's draw path (session inventory 1b.4 — T13)
 *
 * `docs/qa/phase-05-combat-05-gate-08.md:104`, recorded LOW and never done:
 *
 * > The six modules extracted from `GameScene.ts` have **no tests**. `parallaxRig.ts` returning
 * > `100 + i` instead of `-100 + i` would draw all three backgrounds *over* the player and every
 * > gate would stay green.
 *
 * Its own disposition names the class: *"the same defect as 'deleting `renderPlayer()` left every
 * Phase 2 test green' — reintroduced by a split."* Splitting a file to satisfy the 400-line rule
 * moves code out of whatever coverage the original had, and nothing notices.
 *
 * CLAUDE.md §2: **every module in `src/render/` owes a draw-path gate.** `parallaxRig.ts` had none.
 *
 * ## Behavioural, not source text — the stronger of the two shapes
 *
 * `gameParallax.ts` takes Phaser as a **type-only** import, so the whole path can be driven against
 * a fake scene: the `enemy-feedback.test.ts` idiom, which CLAUDE.md prefers precisely because a
 * behavioural assertion beats a text one. That matters here — the defect T13 names is not a missing
 * call, it is a **number reaching `setDepth` with the wrong sign**, and no source scan sees that.
 *
 * ## The two mutations this file names
 *
 * 1. `depth: -100 + i` → `100 + i` in `parallaxRig.ts` — the backgrounds draw over the player.
 * 2. `image.tilePositionX = …` → `image.x = …` in `gameParallax.ts` — the layer slides off its own
 *    edges instead of scrolling its texture, which is the black-band defect that file's own comment
 *    records having already shipped once.
 */

/** What a fake `TileSprite` recorded, so an assertion can read the value that actually arrived. */
interface FakeTileSprite {
  key: string;
  depth: number | null;
  originX: number | null;
  scrollFactor: number | null;
  tilePositionX: number;
  x: number;
  y: number;
  width: number;
  height: number;
  setOrigin(x: number, y: number): FakeTileSprite;
  setScrollFactor(value: number): FakeTileSprite;
  setDepth(value: number): FakeTileSprite;
}

function makeFakeScene(): { scene: Phaser.Scene; made: FakeTileSprite[] } {
  const made: FakeTileSprite[] = [];
  const scene = {
    add: {
      tileSprite(x: number, y: number, width: number, height: number, key: string): FakeTileSprite {
        const sprite: FakeTileSprite = {
          key,
          depth: null,
          originX: null,
          scrollFactor: null,
          tilePositionX: 0,
          x,
          y,
          width,
          height,
          setOrigin(ox) {
            sprite.originX = ox;
            return sprite;
          },
          setScrollFactor(value) {
            sprite.scrollFactor = value;
            return sprite;
          },
          setDepth(value) {
            sprite.depth = value;
            return sprite;
          },
        };
        made.push(sprite);
        return sprite;
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, made };
}

describe('parallaxLayers — the engine-free decision (inventory 1b.4)', () => {
  const layers = parallaxLayers();

  it('returns three layers, so an empty list cannot pass as a clean rig', () => {
    expect(layers.length).toBe(3);
  });

  it('EVERY depth is negative — gameplay sits at depth 0 and up', () => {
    // T13's mutation verbatim. `100 + i` puts all three backgrounds over the player, and before this
    // file nothing in the repository would have noticed.
    for (const layer of layers) {
      expect(
        layer.depth,
        `layer "${layer.key}" draws at depth ${layer.depth}, which is not behind gameplay`,
      ).toBeLessThan(0);
    }
  });

  it('depths ascend in list order, so the three keep their relative stacking', () => {
    const depths = layers.map((l) => l.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(new Set(depths).size, 'two layers share a depth — their order is then undefined').toBe(3);
  });

  it('a further layer scrolls slower — the factors are what make it parallax at all', () => {
    const factors = layers.map((l) => l.factor);
    expect(factors).toEqual([...factors].sort((a, b) => a - b));
    for (const factor of factors) {
      // A factor of 0 pins a layer to the camera; 1 makes it move with the world. Neither is
      // parallax, and both would look like a bug rather than throw.
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThan(1);
    }
  });

  it('the keys are distinct and are the three shipped backgrounds', () => {
    expect(layers.map((l) => l.key)).toEqual(['bg-far', 'bg-mid', 'bg-near']);
  });
});

describe('createParallax / renderParallax — the draw path (CLAUDE.md §2)', () => {
  it('the decided depth is the depth that reaches the sprite', () => {
    const { scene, made } = makeFakeScene();
    const built = createParallax(scene);

    expect(built.length, 'nothing was built, so nothing below means anything').toBe(3);
    expect(made.length).toBe(3);

    // The whole point of a draw-path gate: the decision function could be perfect and this call
    // could still pass a literal, or the wrong field, or nothing at all.
    const decided = parallaxLayers();
    for (const [i, sprite] of made.entries()) {
      expect(sprite.key).toBe(decided[i]!.key);
      expect(sprite.depth, `layer "${sprite.key}" reached setDepth with ${sprite.depth}`).toBe(
        decided[i]!.depth,
      );
      // Pinned to the camera, origin at the corner — the two settings that make the hand-applied
      // scroll below correct rather than double-applied.
      expect(sprite.scrollFactor).toBe(0);
      expect(sprite.originX).toBe(0);
    }
  });

  it('carries each layer FACTOR through, so renderParallax has something to scale by', () => {
    const { scene } = makeFakeScene();
    const built = createParallax(scene);
    expect(built.map((b) => b.factor)).toEqual(parallaxLayers().map((l) => l.factor));
  });

  it('scrolling moves the TEXTURE offset, and does not move the object', () => {
    const { scene, made } = makeFakeScene();
    const built = createParallax(scene);

    renderParallax(built, 1000);

    for (const [i, sprite] of made.entries()) {
      expect(sprite.tilePositionX).toBe(1000 * built[i]!.factor);
      // `gameParallax.ts` records this exact defect as already shipped once: setting position
      // instead of texture offset double-applies the scroll and slides the layer off the viewport,
      // "which showed up as a black band above a strip of background".
      expect(sprite.x, 'the layer object moved — the scroll is being double-applied').toBe(0);
      expect(sprite.y).toBe(0);
    }
  });

  it('a further layer really does move less than a nearer one', () => {
    // The observable meaning of "parallax", asserted on drawn values rather than on the spec table.
    const { scene, made } = makeFakeScene();
    renderParallax(createParallax(scene), 1000);

    const offsets = made.map((s) => s.tilePositionX);
    expect(offsets[0]!).toBeLessThan(offsets[1]!);
    expect(offsets[1]!).toBeLessThan(offsets[2]!);
  });

  it('zero scroll leaves every layer at its origin', () => {
    const { scene, made } = makeFakeScene();
    renderParallax(createParallax(scene), 0);
    expect(made.map((s) => s.tilePositionX)).toEqual([0, 0, 0]);
  });
});
