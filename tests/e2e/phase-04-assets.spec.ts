import { expect, test } from '@playwright/test';
import { parseLevel } from '../../src/game/tilemap';
import { bootToGame, readPlayer, waitTicks } from './gameHarness';
// The REAL decision functions the scene uses, imported rather than restated. A criterion is
// asserted against one definition, not two that agree on the happy path — the same rule that has
// `cameraRig`'s predicates imported by both the unit suite and the e2e specs. What this spec adds
// over `tests/unit/interpolate.test.ts` is that the SCENE feeds them the right inputs.
import { interpolatedPosition, renderAlpha } from '../../src/render/interpolate';
import { sampleDrawnVsSim, type Sample } from './drawnVsSim';

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
    // Assert the TYPE of every field the claims below rest on, before any value (CLAUDE.md 5).
    // `prevY` is reached through a `private` field, so a rename compiles fine and yields `undefined`;
    // without this the failure reads "measured a respawn loop" instead of "the field is gone".
    expect(typeof all[0].accumMs, 'GameScene.accumulatorMs is gone or renamed').toBe('number');
    expect(
      all.filter((s) => typeof s.prevY === 'number').length,
      'GameScene.prevPlayer is gone or renamed - every sample read a null previous position',
    ).toBeGreaterThan(0);

    const withPrev = all.filter((s) => s.prevY !== null);
    // `prevPlayer` is null only before the first tick and after a respawn.
    expect(
      withPrev.length,
      'most samples had no previous tick position - the claims below would be vacuous',
    ).toBeGreaterThan(all.length - 10);

    /**
     * 🔴 **The drawn position is PREDICTED and asserted exactly. There is no tolerance here.**
     *
     * This replaced a containment bound - `drawnBottom` inside `[prevY, simY]` - after the
     * adversarial gate-owner brief showed containment is one-sided and produced three broken
     * renderers that satisfy it: `renderAlpha(accumulatorMs * 0.5)`, `renderAlpha(0)` (interpolation
     * off, which is the ghost defect `interpolate.ts` was written to remove) and an airborne-only
     * offset. During a terminal-velocity fall containment admits a **51.6 px** window - the blanket
     * `maxFallSpeed` tolerance session 9 rejected, returned as a data-dependent one.
     *
     * `interpolatedPosition` and `renderAlpha` are the SCENE'S OWN functions, imported rather than
     * restated, so this is not a second implementation that agrees on the happy path. What it adds
     * over `tests/unit/interpolate.test.ts` - which already covers the blend arithmetic - is that
     * `GameScene` feeds them the right inputs and applies the result to the right object. That
     * wiring is what a unit test cannot reach and what Phase 2 proved can rot silently: deleting
     * `renderPlayer()` once left the whole Phase 2 suite green.
     *
     * `EPS` is float slack, not tolerance: both sides run the identical double arithmetic, so the
     * difference should be 0, and 1e-9 is thousands of ulps at these ~2000 px coordinates while
     * still being fourteen orders of magnitude below the 22.18 px this criterion was failing by.
     */
    const EPS = 1e-9;
    const predicted = (s: Sample): number =>
      interpolatedPosition({ x: 0, y: s.prevY! }, { x: 0, y: s.simY }, renderAlpha(s.accumMs)).y;
    expect(
      Math.max(...withPrev.map((s) => Math.abs(s.drawnY - predicted(s)))),
      'the drawn y is not where interpolating between the last two ticks puts it. The scene is ' +
        'not applying `interpolatedPosition(prevPlayer, desc, renderAlpha(accumulatorMs))` - a ' +
        'wrong blend factor, a dropped snapshot, or an offset applied after the blend.',
    ).toBeLessThanOrEqual(EPS);

    /**
     * The feet claim itself, which the prediction above does not make: the drawn BOTTOM is the drawn
     * y. `originY` is 1, so `getBounds().bottom === sprite.y` for any texture, frame or trim - which
     * is why this and `originY === 1` are asserted separately and why neither alone is the criterion.
     *
     * ⚠️ **Stated limit** *(vault 9.3)*: because that identity holds, this gate reads the
     * sprite's TRANSFORM, not where the boots sit inside the frame. A sheet whose feet were 20 px
     * above the cell bottom would draw floating boots with every assertion here green. That coverage
     * is `sheet-packing.test.ts` (shipped bytes) and criterion 4.24 (`lift-profile.json`); the
     * hands-on screenshot recorded in `docs/qa/phase-04-art.md` is what joins them in the real game.
     */
    expect(
      Math.max(...all.map((s) => Math.abs(s.drawnBottom - s.drawnY))),
      'the drawn bottom stopped being the sprite y - originY is no longer 1',
    ).toBeLessThanOrEqual(EPS);

    /**
     * And where the sim did not move the player across the blended tick, interpolation is the
     * identity for ANY alpha, so the drawn feet must sit on the sim feet exactly. Kept beside the
     * prediction because it is the one claim that needs no reference to the accumulator: if the
     * accumulator sampling itself were wrong, this would still catch a broken anchor.
     */
    const settled = withPrev.filter((s) => s.prevY === s.simY);
    expect(
      settled.length,
      'no samples where the sim left the player at the same y across a tick',
    ).toBeGreaterThan(10);
    expect(
      Math.max(...settled.map((s) => Math.abs(s.drawnBottom - s.simY))),
      'the drawn bottom left the sim feet y on a tick where the sim did not move the player at ' +
        'all - interpolation is the identity there, so this is the anchor itself',
    ).toBe(0);

    /**
     * 🔴 **The window must contain a real LANDING, and two earlier versions of this did not check
     * that properly.**
     *
     * The whole diagnosis behind this rewrite is that the landing tick is where the old filter went
     * wrong — so a window that never lands answers this criterion with pre-jump frames only.
     *
     * The first fix looked for "the first later sample whose state is neither `jump` nor `fall`".
     * The Codex implementation review killed it: `hurt`, `attack`, `death` and a respawn all satisfy
     * that without a landing, because combat states bypass the grounded-derived movement state
     * (`src/sim/player.ts`). It now asserts the transition on the sim's own `grounded` flag — the
     * one collision resolution actually sets — so this is the landing itself, not a proxy.
     *
     * ⚠️ The window is still a fixed frame count, and `sampleDrawnVsSim` counts rAF frames rather
     * than ticks: 130 frames is ~32 ticks at 240 Hz against a ~65-tick jump arc. The landing window
     * below is therefore sampled until the transition is SEEN, with a frame ceiling, rather than
     * assumed to fall inside a fixed count — otherwise a faster machine false-reds on correct code.
     */
    const airborneAt = all.findIndex((s) => !s.grounded);
    expect(
      airborneAt,
      'no airborne sample — the window proves nothing about flight',
    ).toBeGreaterThanOrEqual(0);
    const landedAt = all.findIndex((s, i) => i > airborneAt && s.grounded && !all[i - 1].grounded);
    expect(
      landedAt,
      'no `!grounded -> grounded` transition in the window — it ended mid-flight, so the exact ' +
        'claim above was answered entirely by pre-jump frames and no landing was measured',
    ).toBeGreaterThan(airborneAt);
    expect(
      all.slice(landedAt).filter((s) => s.prevY !== null && s.prevY === s.simY).length,
      'no settled sample AFTER the landing — the tick this criterion is about was not measured',
    ).toBeGreaterThan(0);

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

