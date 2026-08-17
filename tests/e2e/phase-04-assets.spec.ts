import { expect, test } from '@playwright/test';
import { parseLevel } from '../../src/game/tilemap';
import { bootToGame, readPlayer, waitTicks } from './gameHarness';

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
  /** Sim vertical speed, px/tick. Reported in the failure messages; NOT used as a bound — see 4.23. */
  simVy: number;
  /**
   * The player's sim `y` immediately BEFORE the most recent tick — `GameScene.prevPlayer.y`, the
   * exact value `interpolatedPosition` blends FROM. `null` before the first tick and after a
   * respawn, which is `prevPlayer`'s own way of saying "there is no previous position".
   *
   * 🔴 **This is what makes criterion 4.23 answerable.** The drawn position is
   * `lerp(prevY, simY, alpha)`, so the only honest statements about it are statements about the
   * segment `[prevY, simY]`. Every bound below is derived from this field; none is a constant.
   */
  prevY: number | null;
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
        // `prevPlayer` is `private` on GameScene, which is a COMPILE-TIME word — the field is a
        // plain own property at runtime. Reaching it through `__phaserGame` is the idiom
        // `phase-05-perf.spec.ts` already uses to read `scene.world`, and it is deliberately
        // preferred over adding a ninth field to `window.__game`: that surface is closed at eight
        // by a Phase 1 Codex ruling and widening it needs a STOP-and-ask.
        const scene = (
          window as unknown as {
            __phaserGame: { scene: { getScene(k: string): unknown } };
          }
        ).__phaserGame.scene.getScene('Game') as {
          children: { list: Record<string, unknown>[] };
          prevPlayer: { y: number } | null;
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
              simVy: typeof sim.vy === 'number' ? sim.vy : 0,
              // Read in the SAME callback as `drawn` and `sim`, so all three describe one moment.
              prevY: scene.prevPlayer ? scene.prevPlayer.y : null,
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
     * 🔴 **Rewritten 2026-08-17. Both claims below were wrong, and both failed on correct code.**
     *
     * ## What the old version claimed, and why it could not hold
     *
     * It filtered `simVy === 0` and called those samples *"vertically still, so interpolation
     * cannot be blamed"*. **That inference is false, and it is false at exactly the moment this
     * criterion cares most about: the landing tick.** `src/sim/player.ts` resolves a landing by
     * setting `player.y` to the surface AND `player.vy` to 0 **in the same tick**, while
     * `GameScene`'s `advanceSplit` callback snapshotted `prevPlayer` immediately *before* that
     * tick. So a landing sample reads `vy === 0` with `prev.y !== cur.y`, and the drawing is
     * legitimately mid-blend between them.
     *
     * The second claim bounded divergence by THIS frame's `|vy| + gravity`, which fails for the
     * same reason — the travel being blended is the tick's, not this frame's velocity — and also
     * rejects a legal takeoff, where the previous `vy` is 0 but the jump moves `jumpVelocity` px.
     *
     * **Measured on the running game, 2026-08-17** (`docs/qa/phase-04-art.md`, dated entry):
     * standing still, worst gap over 240 frames was **exactly 0**. Across a run-and-jump,
     * **4 of 313** `simVy === 0` samples had a moved sim, worst gap **22.18104000003086 px** —
     * against `(1 - alpha) * |dy|` of **22.18104000003090 px**. Fourteen significant figures. The
     * renderer was never wrong; the predicate was.
     *
     * ## What replaces them, and why it is TIGHTER rather than looser
     *
     * Both claims now come from `prevY`, the value interpolation actually blends from, so neither
     * carries a tolerance constant at all:
     *
     *  1. **Exact**, where `prevY === simY`. The sim did not move the player between the two ticks
     *     being blended, so `interpolatedPosition` is the identity for any alpha and the drawn
     *     bottom must equal the sim feet y to the bit. No tolerance, no velocity, no filter that
     *     can be fooled by a landing.
     *  2. **Inside the segment**, for every sample. `lerp(prevY, simY, alpha)` with alpha in
     *     `[0, 1]` cannot land outside `[prevY, simY]`. This is strictly stronger than the
     *     `|vy| + gravity` bound it replaces — it is `|dy|` with no slack added — and it covers
     *     takeoff, flight and landing with one expression.
     *
     * The blanket `maxFallSpeed` tolerance session 9 rejected is still rejected, and for the
     * reason it gave: 51.6 px is nearly a fifth of the character's height, wide enough for a
     * genuinely broken vertical anchor to pass.
     */
    const withPrev = all.filter((s) => s.prevY !== null);
    // `prevPlayer` is null only before the first tick and after a respawn. A window that is mostly
    // null is a window that measured a respawn loop, not a jump.
    expect(
      withPrev.length,
      'most samples had no previous tick position — the bounds below would be vacuous',
    ).toBeGreaterThan(all.length - 10);

    const settled = withPrev.filter((s) => s.prevY === s.simY);
    expect(
      settled.length,
      'no samples where the sim left the player at the same y across a tick — the exact claim ' +
        'below is vacuous',
    ).toBeGreaterThan(10);
    expect(
      Math.max(...settled.map((s) => Math.abs(s.drawnBottom - s.simY))),
      'the drawn bottom left the sim feet y on a tick where the sim did not move the player at ' +
        'all — interpolation is the identity there, so this is the anchor itself',
    ).toBe(0);

    /**
     * The segment claim, on both the bottom and the origin y. `originY` is 1, so these are the
     * same number today; asserting both is what would catch an origin change that moved one and
     * not the other.
     *
     * 🔴 **The first version of this measured `|drawn - simY| - |simY - prevY|`, and the red proof
     * caught it: a drawing that OVERSHOOTS past `simY` is still close to `simY`, so an
     * `alpha * 1.5` mutation in `interpolatedPosition` passed it.** The claim being made is
     * containment in the segment, so containment is what it has to compute — distance from one
     * endpoint is a different and weaker statement.
     *
     * `EPS` is float slack, not tolerance: `prev + dy * alpha` is computed in doubles, so a value
     * that is mathematically on the segment can land an ulp outside it. Scaled to the magnitude of
     * the coordinates in play (~2000 px), one ulp is ~2.3e-13, so 1e-9 is thousands of ulps of
     * headroom and still fourteen orders of magnitude below the 22.18 px this criterion was
     * failing by.
     */
    const EPS = 1e-9;
    const outsideSegment = (drawn: number, s: Sample): number => {
      const lo = Math.min(s.prevY!, s.simY);
      const hi = Math.max(s.prevY!, s.simY);
      return Math.max(lo - drawn, drawn - hi);
    };
    expect(
      Math.max(...withPrev.map((s) => outsideSegment(s.drawnBottom, s))),
      'the drawn bottom was placed OUTSIDE the [prevY, simY] segment interpolation blends across ' +
        '— no alpha in [0, 1] can produce that, so this is not interpolation lag',
    ).toBeLessThanOrEqual(EPS);
    expect(
      Math.max(...withPrev.map((s) => outsideSegment(s.drawnY, s))),
      'the drawn origin y was placed outside the [prevY, simY] segment',
    ).toBeLessThanOrEqual(EPS);

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

