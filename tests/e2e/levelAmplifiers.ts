/**
 * **The three mutations that red-prove criterion 8.7's frame bounds** — split out of `levelPerf.ts`
 * on 2026-08-25 under the 400-line rule (it reached 475). A flat sibling, per the project precedent.
 *
 * Each is applied through `sampleLevel`'s `mutate` hook, so it lands in ONE arm of a pair. None of
 * them enters `src/`, so none can leak into `dist/` however `verify-dist` is written.
 *
 * | amplifier | reddens | and nothing else, because |
 * |---|---|---|
 * | `addGroundLayerCopies` | `MAX_LEVEL_GPU_DELTA_MS` | it is fragment work, not main-thread work |
 * | `installFrameSpike` | `MAX_LEVEL_WORK_P95_MS` | one frame in ten is invisible to a median |
 * | `addGameScrims` | *(superseded)* | kept as the generic-overdraw control |
 */

import type { Page } from '@playwright/test';
/**
 * The amplifier that red-proves the bound above: N full-viewport alpha-blended rectangles, drawn on
 * the **Game** scene of whichever arm this is applied to.
 *
 * 🔴 **On the Game scene, not the UI scene, and that is the whole point.** `scrimMutation.ts`'s
 * `addScrims` draws on `UI`, which is a parallel scene that survives every `scene.start` — so it
 * would sit in BOTH arms of the pair and cancel in the delta exactly as criterion 7.7's first audio
 * toggle did. The Game scene is rebuilt per `sampleLevel`, so cost added here belongs to one arm.
 *
 * Alpha forces the blend, full-viewport makes the cost fill-rate rather than geometry count. This is
 * a real GPU cost with a real on-screen consequence — which is what `skipCull` was not.
 */
export async function addGameScrims(page: Page, count: number): Promise<number> {
  return page.evaluate((n) => {
    const game = (
      window as unknown as {
        __phaserGame: {
          scene: { getScene(k: string): unknown };
          scale: { gameSize: { width: number; height: number } };
        };
      }
    ).__phaserGame;
    const scene = game.scene.getScene('Game') as {
      children: { length: number };
      add: {
        rectangle(
          x: number,
          y: number,
          w: number,
          h: number,
          colour: number,
          alpha: number,
        ): { setScrollFactor(v: number): { setDepth(d: number): void } };
      };
    };
    const { width, height } = game.scale.gameSize;
    const before = scene.children.length;
    for (let i = 0; i < n; i += 1) {
      scene.add
        .rectangle(width / 2, height / 2, width, height, 0x2255ff, 0.5)
        .setScrollFactor(0)
        .setDepth(9000 + i);
    }
    // Returned, not assumed. A `getScene` that handed back a stale or wrong scene would add nothing
    // and the caller would read a flat delta as "the mutation did not cost anything" rather than as
    // "the mutation never happened" — a burst of zero particles, one level up.
    return scene.children.length - before;
  }, count);
}

/**
 * **The red proof's amplifier: N extra copies of the level's OWN ground layer, drawn on-screen.**
 *
 * 🔴 **This replaced `addGameScrims`, and the Codex implementation review is why.** Scrims are
 * generic overdraw. They prove the timer can see extreme fill-rate work; they do **not** prove that a
 * regression in *level-05's tile geometry or culling* can cross the bound — and
 * `MAX_LEVEL_GPU_DELTA_MS` is a claim about exactly that. Asserting "extra rasteriser time appeared"
 * and calling it proof of a level-size bound is the convenient-stand-in failure C1 forbids.
 *
 * What this draws instead is the level's real painted tiles: the same `.tmj`, the same tileset, the
 * same camera-culled cells, N more times at the same position. Every extra fragment is a tile
 * fragment from the level under test. If tile rasterisation ever stops being nearly free on this box —
 * a bigger tileset, an alpha-blended tile, a shader — that is the cost this bound is about, and this
 * is the mutation that simulates it.
 *
 * Built from the level key rather than by cloning `groundLayer`, because a Phaser `Tilemap` holds one
 * live layer instance per layer index: `createLayer` on the scene's own map would collide with the
 * layer the scene is already drawing.
 *
 * Returns the number of layers actually added. **A flat delta from an amplifier that never drew is
 * indistinguishable from a bound that cannot fire**, so the caller asserts this rather than assuming.
 */
export async function addGroundLayerCopies(page: Page, count: number): Promise<number> {
  return page.evaluate((n) => {
    const game = (
      window as unknown as {
        __phaserGame: { scene: { getScene(k: string): unknown } };
      }
    ).__phaserGame;
    const scene = game.scene.getScene('Game') as {
      levelKey: string;
      groundLayer: { depth: number };
      make: { tilemap(cfg: { key: string }): TilemapLike };
    };

    let added = 0;
    for (let i = 0; i < n; i += 1) {
      const map = scene.make.tilemap({ key: scene.levelKey });
      const tilesetName = map.tilesets[0]?.name;
      if (tilesetName === undefined) break;
      // Same arguments `drawLevelLayer` uses, resolved by POSITION exactly as it does — a rename
      // must not make this amplifier quietly draw nothing.
      const tileset = map.addTilesetImage(tilesetName, 'tiles-industrial', 96, 96);
      if (tileset === null) break;
      const layer = map.createLayer(0, tileset, 0, 0);
      if (layer === null) break;
      // Above the real layer so the fragments are not discarded, and below everything else.
      layer.setDepth(scene.groundLayer.depth + 0.001 * (i + 1));
      added += 1;
    }
    return added;
  }, count);
}

/** The shape of the Phaser tilemap surface this amplifier uses, named so the evaluate stays typed. */
interface TilemapLike {
  tilesets: { name?: string }[];
  addTilesetImage(name: string, key: string, w: number, h: number): unknown | null;
  createLayer(index: number, tileset: unknown, x: number, y: number): { setDepth(d: number): void } | null;
}

/**
 * **A minority-frame main-thread spike, for the ONE bound nothing else can redden.**
 *
 * `MAX_LEVEL_WORK_P95_MS` shipped in Phase 8 with no red proof, and the phase's QA log covered that
 * with a blanket *"every bound red-proved."* Named by the Codex implementation review, which is right
 * that a gate admitted to have no red proof is a gate that has not been shown to work *(C2)*.
 *
 * 🔴 **The point is that it reddens the p95 and NOTHING else.** The other three frame bounds are
 * medians, and a cost paid on one frame in ten is invisible to a median — which is precisely why
 * `workP95Ms` exists as a separate statistic. `phase-09-perf.spec.ts`'s `p95spike` is the same shape
 * for the same reason; this is its level-perf sibling.
 *
 * It hooks `requestAnimationFrame` rather than a scene method, so it needs nothing from `src/` and
 * cannot leak into `dist/`. Every scene start reinstalls nothing — the hook is on the window, so the
 * caller applies it through `sampleLevel`'s `mutate` and it lives until the page reloads.
 *
 * Returns the hook's own frame counter object so the caller can assert it actually FIRED. A spike
 * that never ran and a bound that cannot fire produce the same green.
 */
export async function installFrameSpike(page: Page, ms: number, everyN: number, onlyLevel: string): Promise<void> {
  await page.evaluate(
    ([cost, every, level]) => {
      const w = window as unknown as {
        requestAnimationFrame(cb: FrameRequestCallback): number;
        __spike?: { fired: number };
        __game: { levelId: string | null };
      };
      if (w.__spike) return;
      const state = { fired: 0 };
      w.__spike = state;
      const raf = w.requestAnimationFrame.bind(w);
      let n = 0;
      w.requestAnimationFrame = (cb: FrameRequestCallback): number =>
        raf((t: number) => {
          cb(t);
          // AFTER the callback, so the spike is charged to the NEXT frame's `now - frameStart` the
          // way a real late-arriving cost would be — not to the sample that is measuring it.
          // 🔴 Gated on the level under test. The hook lives on the WINDOW and survives every
          // `scene.start`, so without this it burns in BOTH arms of every pair after the first —
          // contaminating the control and cancelling in exactly the ratio the proof leans on. The
          // same "it lands in one arm" property `addGroundLayerCopies` gets from the scene rebuild.
          if (w.__game.levelId === level && n % every === every - 1) {
            const until = performance.now() + cost;
            while (performance.now() < until) {
              /* busy */
            }
            state.fired += 1;
          }
          n += 1;
        });
    },
    [ms, everyN, onlyLevel] as const,
  );
}

/** How many times `installFrameSpike`'s hook actually burned. Zero means the amplifier never ran. */
export async function frameSpikesFired(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __spike?: { fired: number } }).__spike?.fired ?? -1);
}
