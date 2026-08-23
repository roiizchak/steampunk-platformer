import { describe, expect, it } from 'vitest';
import { createScavenger } from '../../src/sim/scavengerFactory';
import { stepScavenger } from '../../src/sim/enemyScavenger';
import { SCAVENGER_BOX } from '../../src/sim/enemies';
import { RENDER_SCALE } from '../../src/game/constants';
import type { Rect } from '../../src/sim/types';

/**
 * # A released scavenger WALKS back to its beat — it does not snap to the bound
 *
 * Found by the S.3 gate owner, adversarial brief, and **verified before it was believed**.
 *
 * A chase leaves the patrol beat unclamped: `stepScavenger`'s chase branch moves toward the player
 * with no `patrolMin`/`patrolMax` term, which is what lets a scavenger leave its beat to follow you.
 * The tick after `releaseAggro`, the **patrol** branch runs — and it computed
 *
 * ```ts
 * const nextX = Math.min(patrolMax, Math.max(patrolMin, scavenger.x + facing * patrolSpeed));
 * ```
 *
 * With `scavenger.x` far outside the beat, that `Math.min` is not a step of `patrolSpeed`. It is a
 * **jump of however far the chase travelled** — the whole distance, in one tick.
 *
 * ## Why that is worse than it looks
 *
 * `blocked()` → `blockedAt()` tests **the endpoints**, not the swept span: it asks whether the body
 * was clear where it started and whether it is clear where it lands. A 480 px jump whose start and
 * end are both clear passes even with a wall in the middle. So the snap-back **crosses walls**.
 *
 * And this is the ordinary outcome of outrunning a scavenger, not a corner case: `chaseSpeed` is 6
 * against a player `runMax` of 9, and the chase ends at `releaseRadius` 720 having started at
 * `detectRadius` 480 — so the creature is routinely a few hundred pixels past its beat when released.
 * It was latent only while death was the sole exit from a chase; the owner reopened that on
 * 2026-08-23 (inventory 2b.1) and made it reachable.
 *
 * ## Why the existing gate could not see it
 *
 * `aggro-release-radius.test.ts`'s `pinned()` helper sets `patrolMin = patrolMax = x`, so **the
 * clamp is a no-op in every fixture in that file**. The one test in the repository literally named
 * *"never teleports"* was narrowed from `playerX: 99999` to `1100`, which no longer reaches the
 * release path. Two gates about this exact code, neither able to fail on it.
 *
 * ## The fix, and what it deliberately does NOT change
 *
 * Outside the beat, step **toward** it by `patrolSpeed`. Inside the beat, the arithmetic is
 * byte-identical to before — the clamp-before-the-wall-test property that `enemyScavenger.ts`'s own
 * 🔴 block defends (the gate and the sim must ask about the same span) is untouched.
 *
 * **The mutation this file names:** restore `Math.min(patrolMax, Math.max(patrolMin, proposed))` as
 * the only branch.
 */

const FEET_Y = 2000;
const GROUND: Rect = { x: -5000, y: FEET_Y, w: 30000, h: 400 };

/** A scavenger with a real beat, standing well past `patrolMax` as a chase would leave it. */
function strayed(x: number, solids: Rect[] = [GROUND]) {
  const scavenger = createScavenger({
    x,
    y: FEET_Y,
    patrolMin: 1000,
    patrolMax: 1200,
  });
  scavenger.facing = -1;
  return { scavenger, solids };
}

/** One patrol tick with no player anywhere near — the released state. */
function patrolTick(scavenger: ReturnType<typeof createScavenger>, solids: Rect[]): void {
  stepScavenger(
    scavenger,
    { playerX: 60000, playerY: FEET_Y },
    { solids, halfWidthPx: SCAVENGER_BOX.w * RENDER_SCALE / 2, heightPx: SCAVENGER_BOX.h * RENDER_SCALE },
  );
}

describe('a scavenger outside its beat walks back (S.3 gate owner)', () => {
  it('the premise: it really is outside its beat and not chasing', () => {
    // Without this the whole file could pass on a scavenger that never strayed.
    const { scavenger } = strayed(1680);
    expect(scavenger.chasing, 'the fixture is chasing, so the patrol branch never runs').toBe(false);
    expect(scavenger.x).toBeGreaterThan(scavenger.patrolMax);
  });

  it('moves at most patrolSpeed in one tick — it does not snap to the bound', () => {
    const { scavenger, solids } = strayed(1680);
    const before = scavenger.x;
    patrolTick(scavenger, solids);

    // 480 px past the beat. The old code put it on 1200 in a single tick.
    expect(
      Math.abs(scavenger.x - before),
      `moved ${Math.abs(scavenger.x - before)} px in one tick against a patrolSpeed of ` +
        `${scavenger.patrolSpeed}. That is a teleport, and blockedAt only tests the endpoints, so it ` +
        `crosses walls.`,
    ).toBeLessThanOrEqual(scavenger.patrolSpeed);
  });

  it('moves TOWARD the beat, not away from it', () => {
    const { scavenger, solids } = strayed(1680);
    const before = scavenger.x;
    patrolTick(scavenger, solids);
    expect(scavenger.x, 'it walked further from its beat').toBeLessThan(before);
  });

  it('does the same on the low side', () => {
    const { scavenger, solids } = strayed(600);
    const before = scavenger.x;
    patrolTick(scavenger, solids);
    expect(Math.abs(scavenger.x - before)).toBeLessThanOrEqual(scavenger.patrolSpeed);
    expect(scavenger.x, 'it walked further from its beat').toBeGreaterThan(before);
  });

  it('arrives, and then patrols normally instead of overshooting', () => {
    // The counter-fixture for "walk back": a step that does not stop at the bound would walk the
    // creature straight through its own beat and out the other side.
    const { scavenger, solids } = strayed(1260);
    for (let i = 0; i < 40; i += 1) patrolTick(scavenger, solids);
    expect(scavenger.x).toBeGreaterThanOrEqual(scavenger.patrolMin);
    expect(scavenger.x).toBeLessThanOrEqual(scavenger.patrolMax);
  });

  it('CANNOT cross a wall standing between it and its beat', () => {
    // The defect's real cost, and the reason a step cap is the fix rather than a smaller clamp.
    const wall: Rect = { x: 1400, y: FEET_Y - 600, w: 96, h: 600 };
    const { scavenger, solids } = strayed(1680, [GROUND, wall]);
    for (let i = 0; i < 200; i += 1) patrolTick(scavenger, solids);
    expect(
      scavenger.x,
      'the scavenger got past a wall between it and its beat — the snap-back is not swept',
    ).toBeGreaterThan(wall.x);
  });

  it('inside the beat, nothing changed — the clamp-first property is intact', () => {
    // `enemyScavenger.ts`'s own red block defends clamping BEFORE the wall test, so the sim asks
    // about the same span `describePlacementProblem` validated. This pins that it still does.
    const scavenger = createScavenger({
      x: 1198,
      y: FEET_Y,
      patrolMin: 1000,
      patrolMax: 1200,
    });
    scavenger.facing = 1;
    patrolTick(scavenger, [GROUND]);
    expect(scavenger.x, 'a scavenger inside its beat no longer stops at patrolMax').toBe(1200);
  });
});
