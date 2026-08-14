import { expect, test } from '@playwright/test';
import { parseLevel } from '../../src/game/tilemap';
import { BRICK_GID, SURFACE_GID } from '../../src/render/groundTiles';
import { TILE_SIZE } from '../../src/game/constants';
import { bootToGame, readPlayer, waitTicks } from './gameHarness';
import { DEFAULT_TUNING } from '../../src/sim/player';

/**
 * One gravity step, world px/tick. Imported from the live knob, never retyped: it is the slack a
 * per-frame `|vy|` bound needs because the sample can land either side of step 6's integration.
 */
const GRAVITY_PX = DEFAULT_TUNING.gravity;

/**
 * Phase 4 — criteria 4.23 and 4.24, plus catalog/texture agreement.
 *
 * ## What this spec exists to catch that the unit suite cannot
 *
 * `sheet-packing.test.ts` proves the SHIPPED BYTES carry the right per-frame lift. It cannot prove
 * the running game draws them: the texture is loaded by Phaser, the frame is chosen by an animation
 * whose fps is derived at boot, and the sprite is placed by `playerView`. Every one of those steps
 * is downstream of the bytes and upstream of what the player sees, and Phase 2 already proved that
 * gap is real — deleting `renderPlayer()` left the whole Phase 2 suite green, because everything
 * else read `__game`, which the scene writes directly.
 *
 * ## The sampling rule, which has already produced a false green in this repo
 *
 * **A wait expressed in ticks cannot bound a sampling window.** `waitTicks(N)` guarantees *at
 * least* N ticks, and under parallel workers a single round trip has overshot an entire 65-tick
 * jump arc between polls — passing WITH a mutation applied, and failing on correct code, in the
 * same suite. So every window here is sampled INSIDE the page, once per animation frame, and
 * returns an aggregate. Nothing is read once and compared.
 */

interface LiftFrame {
  index: number;
  drawnHeight: number;
  liftPx: number;
}

/**
 * The lift profile and the catalog, fetched over HTTP from the running dev server.
 *
 * Fetched, not imported. Playwright runs these specs through Node's ESM loader, where a bare JSON
 * import needs an import attribute — but that is only the reason it cannot be an import, not the
 * reason it should be a fetch. The reason is vault 3.1: this way the spec asserts against the same
 * bytes the browser loads, and the failure mode where a config never reached the server shows up as
 * a red spec instead of as a green one reading the repo behind its back. Same idiom, same
 * rationale, as `phase-03-tilemap.spec.ts` fetching the shipped level.
 */
async function shippedJson<T>(
  page: import('@playwright/test').Page,
  url: string,
): Promise<T> {
  const response = await page.request.get(url);
  expect(response.ok(), `${url} did not load over HTTP`).toBe(true);
  return (await response.json()) as T;
}

/** The surface the player spawns on, read from the shipped level rather than restated here. */
async function groundTopAtSpawn(page: import('@playwright/test').Page): Promise<number> {
  const level = parseLevel(
    'level-01',
    await shippedJson<unknown>(page, '/assets/levels/level-01.tmj'),
  );
  const strip = level.solids.find(
    (s) => s.y === level.spawn.y && level.spawn.x > s.x && level.spawn.x < s.x + s.w,
  );
  expect(strip, 'no collision strip under the spawn point').toBeDefined();
  return strip!.y;
}

interface Sample {
  simY: number;
  /** Sim vertical speed, px/tick. Bounds how far interpolation may place the drawing from the sim. */
  simVy: number;
  drawnBottom: number;
  drawnY: number;
  frameIndex: number;
  state: string;
  originY: number;
}

/**
 * Sample the drawn sprite and the sim together, once per animation frame, for `frames` frames.
 *
 * Both halves are read in the SAME callback so they describe the same moment. Reading them in two
 * evaluates would let a tick land between them and turn a correct renderer into a divergence.
 */
async function sampleDrawnVsSim(
  page: import('@playwright/test').Page,
  frames: number,
): Promise<Sample[]> {
  return page.evaluate(
    (count) =>
      new Promise<Sample[]>((resolve) => {
        const out: Sample[] = [];
        const scene = (
          window as unknown as {
            __phaserGame: { scene: { getScene(k: string): unknown } };
          }
        ).__phaserGame.scene.getScene('Game') as {
          children: { list: Record<string, unknown>[] };
        };

        const step = () => {
          // The player is the only child carrying a brass-courier texture. Found by texture key
          // rather than by size: the grey-box finder Phase 2 used matched on the collision box's
          // dimensions, and the sprite is now 288 x 384, which is the CELL, not the box.
          const drawn = scene.children.list.find((o) => {
            const key = (o.texture as { key?: string } | undefined)?.key;
            return typeof key === 'string' && key.startsWith('brass-courier-');
          }) as
            | {
                y: number;
                originY: number;
                getBounds(): { bottom: number };
                frame: { name: string };
              }
            | undefined;
          const sim = window.__game?.player as
            | { y?: number; vy?: number; state?: string }
            | null
            | undefined;

          if (drawn && sim && typeof sim.y === 'number') {
            out.push({
              simY: sim.y,
              // Sampled so the divergence bound below can be THIS frame's vertical speed rather
              // than a blanket constant. See the assertion for why that matters.
              simVy: typeof sim.vy === 'number' ? sim.vy : 0,
              drawnY: drawn.y,
              drawnBottom: drawn.getBounds().bottom,
              frameIndex: Number(drawn.frame.name),
              state: String(sim.state),
              originY: drawn.originY,
            });
          }
          if (out.length >= count) {
            resolve(out);
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}

test.describe('4.23 — the drawn feet meet the surface', () => {
  test('the sprite is drawn from its feet, and its bottom never leaves the sim feet y', async ({
    page,
  }) => {
    await bootToGame(page);
    await waitTicks(page, 10);

    // Run right and jump, so the window contains a takeoff, an airborne arc and a landing — the
    // states where a vertical-anchor defect actually shows. A standing-only sample would pass on
    // art that concertinas the moment it leaves the ground, which is the defect this phase fixed.
    await page.keyboard.down('ArrowRight');
    const running = await sampleDrawnVsSim(page, 30);
    await page.keyboard.down('Space');
    const airborne = await sampleDrawnVsSim(page, 60);
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');
    const landing = await sampleDrawnVsSim(page, 40);

    const all = [...running, ...airborne, ...landing];
    // Assert the type before the value (vault C1), and that the window was not vacuous.
    expect(all.length).toBeGreaterThanOrEqual(120);
    expect(typeof all[0].simY).toBe('number');
    expect(typeof all[0].drawnBottom).toBe('number');

    // The origin is the mechanism. `playerView` returns originY 1 and the scene applies it; if that
    // ever regresses to Phaser's 0.5 default the character floats half its height above the floor.
    expect([...new Set(all.map((s) => s.originY))]).toEqual([1]);

    /**
     * 🔴 **Amended in session 9 for render interpolation — and made TIGHTER, not looser.**
     *
     * The sprite is now drawn between the last two ticks (`src/render/interpolate.ts`), so while
     * the player is moving vertically the drawn bottom trails the sim's feet by a fraction of one
     * tick's fall. Exact equality on every frame is no longer the right claim.
     *
     * The lazy amendment would be a blanket tolerance of `maxFallSpeed` (51.6 px) — nearly a fifth
     * of the character's height, wide enough for a genuinely broken vertical anchor to pass. So the
     * bound is THIS FRAME's actual vertical speed instead: interpolation can never place the
     * drawing further from the sim than one tick of travel, and one tick of travel is `|vy|`, plus
     * one `gravity` step for the sample landing either side of the integration.
     *
     * Where the player is NOT moving vertically the assertion stays EXACT, which is most of the
     * window and is where a vertical-anchor defect would show anyway.
     */
    const grounded = all.filter((s) => s.simVy === 0);
    expect(grounded.length, 'no vertically-still samples — the exact claim below is vacuous').toBeGreaterThan(10);
    expect(
      Math.max(...grounded.map((s) => Math.abs(s.drawnBottom - s.simY))),
      'the drawn bottom left the sim feet y while NOT moving vertically — interpolation cannot excuse this',
    ).toBe(0);

    const worst = Math.max(
      ...all.map((s) => Math.abs(s.drawnBottom - s.simY) - (Math.abs(s.simVy) + GRAVITY_PX)),
    );
    expect(worst, 'the drawn bottom trailed the sim feet by more than one tick of fall').toBeLessThanOrEqual(0);
    expect(
      Math.max(...all.map((s) => Math.abs(s.drawnY - s.simY) - (Math.abs(s.simVy) + GRAVITY_PX))),
    ).toBeLessThanOrEqual(0);

    // ...and the window really did contain flight, so "never diverged" is not a claim about a
    // character that never left the ground.
    expect(
      all.some((s) => s.state === 'jump' || s.state === 'fall'),
      'no airborne sample — the window proves nothing about flight',
    ).toBe(true);
  });

  test('the player comes to rest exactly on the ground surface', async ({ page }) => {
    await bootToGame(page);
    await waitTicks(page, 30);

    const groundTop = await groundTopAtSpawn(page);
    const player = await readPlayer(page);
    expect(player.state).toBe('idle');
    // The ground solid's top, straight out of the shipped level. Not "about" — the whole point of
    // resolving collision in the sim is that a resting position is exact.
    expect(player.y).toBe(groundTop);
    expect(player.vy).toBe(0);
  });
});

test.describe('4.24 — the torso rises at the run flight phase', () => {
  /**
   * Head height above the feet, for one packed frame.
   *
   * The sprite is drawn from its feet, so the top of the drawn figure sits `liftPx + drawnHeight`
   * above the sprite's y. Under the OLD per-frame packer every `liftPx` was 0 by construction, so
   * this reduced to `drawnHeight` — and because a run's flight pose is vertically more compact than
   * its contact pose, the head DROPPED at exactly the moment the character leaves the ground. That
   * is the inverted bob, and this expression is what separates the two packers.
   */
  const headAboveFeet = (frame: LiftFrame) => frame.liftPx + frame.drawnHeight;

  test('the running character cycles frames whose heads are not all at one height', async ({
    page,
  }) => {
    await bootToGame(page);
    const liftProfile = await shippedJson<{
      animations: Record<string, { frames: LiftFrame[] }>;
    }>(page, '/assets/config/lift-profile.json');
    await waitTicks(page, 10);

    await page.keyboard.down('ArrowRight');
    // Long enough to cross the run's 27-tick cycle several times over, sampled per animation frame.
    const samples = await sampleDrawnVsSim(page, 120);
    await page.keyboard.up('ArrowRight');

    const running = samples.filter((s) => s.state === 'run');
    expect(running.length, 'never reached the run state — nothing was measured').toBeGreaterThan(20);

    const observed = [...new Set(running.map((s) => s.frameIndex))].sort((a, b) => a - b);
    // An animation that is not playing samples one frame forever and would otherwise satisfy every
    // assertion below vacuously.
    expect(observed.length, 'the run animation is not advancing').toBeGreaterThan(4);

    const runFrames = liftProfile.animations.run.frames;
    for (const index of observed) {
      expect(runFrames[index], `frame ${index} is not in the lift profile`).toBeDefined();
    }

    const heights = observed.map((index) => headAboveFeet(runFrames[index]));
    const rise = Math.max(...heights) - Math.min(...heights);
    // The shipped run spans 278 at its lowest head and 284 at its highest. Asserting a POSITIVE
    // rise is the discriminating claim: the old packer produced a NEGATIVE one, the head sinking
    // 15 game px across the cycle, and every existence-style assertion passed straight through it.
    expect(rise, 'every frame draws the head at one height — the cycle carries no vertical motion')
      .toBeGreaterThan(0);

    // The frame with the greatest lift is a flight frame, and its head is above the contact
    // frame's. Stated as an ordering rather than a magnitude so re-shot art does not need a new
    // number here, only a correctly packed sheet.
    const deepest = observed.reduce((a, b) => (runFrames[a].liftPx <= runFrames[b].liftPx ? a : b));
    const highest = observed.reduce((a, b) => (runFrames[a].liftPx >= runFrames[b].liftPx ? a : b));
    expect(runFrames[deepest].liftPx).toBe(0);
    expect(headAboveFeet(runFrames[highest])).toBeGreaterThan(headAboveFeet(runFrames[deepest]));
  });
});

test.describe('catalog and texture agree', () => {
  test('every sheet loaded into Phaser matches its catalog entry', async ({ page }) => {
    await bootToGame(page);
    const catalog = await shippedJson<{
      sheets: { key: string; frameWidth: number; frameHeight: number; frameCount: number }[];
    }>(page, '/assets/index.json');

    const actual = await page.evaluate(() => {
      const game = (
        window as unknown as {
          __phaserGame: {
            textures: { get(k: string): { getSourceImage(): { width: number; height: number } } };
            anims: { get(k: string): { frames: unknown[] } | undefined };
          };
        }
      ).__phaserGame;
      const keys = ['idle', 'walk', 'run', 'jump', 'fall'].map((a) => `brass-courier-${a}`);
      return keys.map((key) => {
        const source = game.textures.get(key).getSourceImage();
        return {
          key,
          width: source.width,
          height: source.height,
          animFrames: game.anims.get(key)?.frames.length ?? 0,
        };
      });
    });

    for (const entry of actual) {
      const declared = catalog.sheets.find((s) => s.key === entry.key);
      expect(declared, `${entry.key} is not in the catalog`).toBeDefined();
      // Type before value: a texture that failed to load returns a 1x1 placeholder, and comparing
      // it to a declared number would otherwise read as a dimension mismatch rather than a
      // missing asset.
      expect(typeof entry.width).toBe('number');
      expect(entry.height).toBe(declared!.frameHeight);
      expect(entry.width).toBe(declared!.frameWidth * declared!.frameCount);
      expect(entry.animFrames, `${entry.key} registered the wrong frame count`).toBe(
        declared!.frameCount,
      );
    }
  });
});


test.describe('4.22 — the brass cap survives non-solid decoration, ON THE DRAWN TILES', () => {
  /**
   * The predicate was already exhaustively unit-tested. **The call site was not**, and that is the
   * half that shipped broken.
   *
   * Raised by the `voltagent-qa-sec:code-reviewer` gate owner, brief 1, finding F1, and confirmed by
   * mutation: reverting `GameScene.applySurfaceTiles` to the original
   * `groundTileGid(layer.getTileAt(tile.x, tile.y - 1) !== null)` leaves **all 464 unit tests
   * green**. `ground-tiles.test.ts` imports the pure function and never reads a drawn tile index,
   * and the nearest e2e assertion — `expect(tile.index).toBeGreaterThan(0)` — is satisfied by
   * BRICK_GID 9 exactly as happily as by SURFACE_GID 1.
   *
   * So the gate for criterion 4.22 could not see the defect criterion 4.22 exists for. This asserts
   * the drawn index itself, at the cells the spike run stands on.
   */
  async function drawnTileIndexAt(
    page: import('@playwright/test').Page,
    worldX: number,
    worldY: number,
  ): Promise<number | null> {
    return page.evaluate(
      ({ x, y }) => {
        const scene = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('Game') as {
          children: { list: { getTileAtWorldXY?: unknown }[] };
        };
        const layer = scene.children.list.find(
          (o) => typeof (o as { getTileAtWorldXY?: unknown }).getTileAtWorldXY === 'function',
        ) as { getTileAtWorldXY(x: number, y: number): { index: number } | null } | undefined;
        const tile = layer?.getTileAtWorldXY(x, y);
        return tile ? tile.index : null;
      },
      { x: worldX, y: worldY },
    );
  }

  test('the ground under the spike run is capped, and the row below it is not', async ({ page }) => {
    await bootToGame(page);

    // Row 20 is the walking surface; the spike run is authored decoration standing on it at cols
    // 24-27. Those four cells are the ones that drew BRICK_GID before the fix — 384 px of walkable
    // floor with no brass leading edge, in a game whose art direction says a player identifies a
    // platform by that edge alone.
    const surfaceRow = 20 * TILE_SIZE + TILE_SIZE / 2;
    const belowRow = 21 * TILE_SIZE + TILE_SIZE / 2;

    for (const col of [24, 25, 26, 27]) {
      const x = col * TILE_SIZE + TILE_SIZE / 2;
      const capped = await drawnTileIndexAt(page, x, surfaceRow);
      // Type before value: a missing layer returns null, and comparing null to a gid would read as
      // a wrong tile rather than as a missing tilemap.
      expect(typeof capped, `no drawn tile at col ${col}, row 20`).toBe('number');
      expect(capped, `col ${col} lost its brass cap under the spikes`).toBe(SURFACE_GID);

      // And the row below is brick — which is what makes the assertion above a discrimination
      // rather than "every tile is SURFACE_GID".
      const buried = await drawnTileIndexAt(page, x, belowRow);
      expect(buried, `col ${col} row 21 should be brick, not surface`).toBe(BRICK_GID);
    }
  });

  test('a cell with solid ground directly above it is brick, not surface', async ({ page }) => {
    await bootToGame(page);

    // The pillar at x 3264-3360 stands on the ground from row 17 to 19, so the ground cell beneath
    // it at row 20 genuinely DOES have a solid above and must stay brick. Without this the test
    // above passes on a mutant that caps every tile unconditionally.
    const x = 3264 + TILE_SIZE / 2;
    const underPillar = await drawnTileIndexAt(page, x, 20 * TILE_SIZE + TILE_SIZE / 2);
    expect(typeof underPillar).toBe('number');
    expect(underPillar, 'the cell under the pillar should not be capped').toBe(BRICK_GID);
  });
});
