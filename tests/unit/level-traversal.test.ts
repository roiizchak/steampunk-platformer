/**
 * Can the player actually GET THROUGH a level? Asked of the simulation, not of arithmetic.
 *
 * ## ⚠️ This file probes a RETIRED level, on purpose
 *
 * Phase 8 replaced `level-01`, and the assertions below name its exact coordinates: the 96 × 288
 * pillar at **x 3264**, the stall at **x 3198**, the pit between `floors[0]` and `floors[1]`, the
 * scavenger on the section starting at **x 4128**. Every one of them exists for a *shape* — a wall
 * exactly one body-width past a stall point, a pit that stops ground-following, a hazard reachable
 * with a run-up and not with a standing hop. Re-pinning them at the new level-01 would have moved the
 * numbers and quietly thrown the shapes away, leaving four green tests measuring nothing in
 * particular.
 *
 * So this reads `tests/fixtures/levels/level-01-phase07.tmj`, frozen byte for byte, and the SIM it
 * runs is the live one. What it gates is the collider, the acceleration curve, the apex and
 * ground-following — against geometry chosen to make each of those visible.
 *
 * 🔴 **Two assertions were NOT frozen with it**, because they were live gates rather than probes:
 * "walking into the spikes hurts" (whose own comment says a clearable-only test is satisfied by
 * deleting the hazard, *vault 9.4*) and "permanent aggro is bounded by the level" (the documented
 * `x:3198` soft-lock). Both now sweep **every shipped level** in `level-hazards.test.ts`. Freezing
 * them would have retired the gate along with the level.
 *
 * ## Why this file exists
 *
 * `tilemap-data.test.ts` asks whether every raised surface is within the measured apex. That is a
 * real gate and it is a **vertical** one: it cannot see a gap too wide to cross, a hazard too broad
 * to clear, or a landing the player arrives at with no horizontal speed left.
 *
 * The Phase 5 session-10 plan proposed narrowing the spike strip on the strength of hand
 * arithmetic, and the Codex plan review (finding 5) found that arithmetic wrong on **both** of its
 * inputs — the pit was 288 px and not 192, the airtime 35 ticks and not 37. Hand-computing ballistics
 * against a tick order with a jump-cut divisor, a coyote window and per-tick friction is not
 * something to do twice.
 *
 * So this runs the **real** `tick`, over the **real** shipped `.tmj` rectangles, with the **real**
 * collider and the **real** acceleration curve, and reports what happened. Nothing here is
 * computed; everything is simulated and then asserted.
 *
 * ## What it deliberately does NOT do
 *
 * It does not assert a *specific* number of ticks or a *specific* landing x. Those are outputs of
 * a tuning pass and would turn every future balance change into a failing test with no defect
 * behind it. It asserts the **playability properties**: the obstacle is crossable with a run-up,
 * and — the half that actually matters — it is *not* crossable by a standing hop, so the jump is a
 * skill and not a formality.
 */

import { describe, expect, it } from 'vitest';

import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';
import { PLAYER_BOX } from '../../src/sim/player';
import { RENDER_SCALE } from '../../src/game/constants';
import type { InputSnapshot, World } from '../../src/sim/types';
import { PHASE07_LEVEL_01 } from './tilemap-data-fixtures';

/** Phase 7's level-01, frozen. See this file's header for why it is not the shipped one. */
const LEVEL = PHASE07_LEVEL_01;

/** The frozen level, simulated at the shipped scale. No enemies: this is about terrain. */
function levelWorld(startX: number): World {
  return createWorld({
    seed: 1,
    scale: RENDER_SCALE,
    solids: LEVEL.solids,
    hazards: LEVEL.hazards,
    bounds: { widthPx: LEVEL.widthPx, heightPx: LEVEL.heightPx },
    spawn: { x: startX, y: LEVEL.spawn.y },
  });
}

interface Attempt {
  /** Did the player reach `targetX` still alive and with full hp? */
  cleared: boolean;
  hpLost: number;
  /** Furthest right the player ever got. */
  maxX: number;
}

/**
 * Run right, jump when the player's forward edge reaches `jumpAtX`, and report what happened.
 *
 * The jump is triggered off the player's **leading edge**, not their centre, because that is the
 * part that meets an obstacle first — triggering off the centre would silently give away half a
 * body width of margin and make a knife-edge jump look comfortable.
 *
 * The obstacle's own left edge is the trigger everywhere below. It is the LATEST honest moment to
 * jump, so a test that passes here passes for any earlier press too, and nothing depends on finding
 * a lucky take-off point.
 *
 * ⚠️ The first draft of this took a `runUpTicks` argument and every call passed `999` meaning
 * "jump whenever the trigger says". It actually meant "wait 999 ticks", the loop only runs 600, and
 * the player therefore **never jumped in any test** — which produced a run-up that failed and a
 * standing hop that succeeded, in the same run. Reading the two failures against each other is what
 * caught it. The parameter is gone; a stand-still is now its own explicit flag.
 */
function attempt(startX: number, jumpAtX: number, targetX: number): Attempt {
  const world = levelWorld(startX);
  const startHp = world.player.hp;
  const halfWidth = (PLAYER_BOX.w / 2) * RENDER_SCALE;
  const input: InputSnapshot = createSnapshot();
  input.right = true;
  input.jumpHeld = true; // held for the full-height jump; releasing early is the jump CUT

  let jumped = false;
  let maxX = world.player.x;
  // Generous ceiling: this is a bound on the loop, never a measurement. The assertions read the
  // outcome, not the tick count.
  for (let i = 0; i < 600; i += 1) {
    if (!jumped && world.player.x + halfWidth >= jumpAtX) {
      latchJumpPress(input);
      jumped = true;
    }
    tick(world, input);
    if (world.player.x > maxX) maxX = world.player.x;
    if (world.player.hp <= 0) break;
    if (world.player.x >= targetX) break;
  }

  return {
    cleared: world.player.x >= targetX && world.player.hp === startHp,
    hpLost: startHp - world.player.hp,
    maxX,
  };
}

/** The obstacles, read off the shipped level rather than typed. */
const HAZARD = LEVEL.hazards[0]!;
const PIT = (() => {
  // The gap between two floor-height solids, found by walking the surfaces at the spawn's height.
  const floors = LEVEL.solids
    .filter((s) => s.y === LEVEL.spawn.y)
    .sort((a, b) => a.x - b.x);
  const left = floors[0]!;
  const right = floors[1]!;
  return { start: left.x + left.w, end: right.x, width: right.x - (left.x + left.w) };
})();

describe('level-01 is traversable, proved by simulation', () => {
  it('the fixtures are real: one hazard and one floor-level gap were actually found', () => {
    // Without this every assertion below could be measuring an undefined-shaped nothing.
    expect(LEVEL.hazards.length).toBeGreaterThan(0);
    expect(HAZARD.w).toBeGreaterThan(0);
    expect(PIT.width).toBeGreaterThan(0);
  });

  /**
   * 🔴 **The spike strip, and the reason it was narrowed from 384 px to 192 px.**
   *
   * At 384 px it was **not jumpable at any speed**, and had never been. The airborne window during
   * which the player is above the strip's 96 px height is shorter than the airtime — the first and
   * last couple of ticks are spent clearing its top — so the usable horizontal reach is well under
   * `airtime × runMax`. Nothing measured that, because the only reach gate in the suite was
   * vertical.
   *
   * The narrowing is a **level-data change**, never a speed rollback: locomotion is pinned to the
   * art's measured foot travel now (`foot-plant.test.ts`) and is not available as a balance knob.
   */
  it('the spike strip can be cleared with a run-up', () => {
    const result = attempt(HAZARD.x - 600, HAZARD.x, HAZARD.x + HAZARD.w + 300);
    expect(
      result.cleared,
      `lost ${result.hpLost} hp and reached x ${result.maxX} against a ${HAZARD.w}px strip ` +
        `starting at ${HAZARD.x}. If this is red the strip is wider than the jump can carry, ` +
        'which is a level-data problem — widen the jump only by changing the LEVEL.',
    ).toBe(true);
  });

  /**
   * 🔴 **The other half — the strip must still COST something.** A test that only asserted
   * "clearable" would be satisfied by deleting the hazard entirely *(vault 9.4)*.
   *
   * The measured sweep, run at every width on the level's 24 px sub-grid with the real sim:
   *
   * | width | run-up | standing jump |
   * |---|---|---|
   * | 96 – 216 | clear | clear |
   * | **192 (shipped)** | **clear** | **clear** |
   * | 240 | clear | **hit** |
   * | 252 – 384 | **hit** | **hit** |
   *
   * **384 was impassable at any speed and always had been.** The window where a run-up is required
   * but possible is exactly **240**, and it is 12 px wide — the next step up already fails. A margin
   * that thin exists only at exactly top speed and would break silently on the next tuning pass, so
   * it was NOT taken. 192 is the shipped width: crossing it costs a deliberate jump input, and
   * walking into it hurts, which is what makes it an obstacle rather than decoration.
   *
   * So the assertion here is the one that is actually true and actually load-bearing: **the hazard
   * is live.** Deleting it, zeroing its width, or dropping `hazard=true` from the `.tmj` all turn
   * this red.
   */
  it('walking into the spike strip DOES hurt — it is an obstacle, not decoration', () => {
    const world = levelWorld(HAZARD.x - 400);
    const input: InputSnapshot = createSnapshot();
    input.right = true;
    const startHp = world.player.hp;
    for (let i = 0; i < 300 && world.player.hp === startHp; i += 1) {
      tick(world, input);
    }
    expect(
      world.player.hp,
      'the player walked straight through the spike strip unharmed',
    ).toBeLessThan(startHp);
  });

  /**
   * 🔴 **The run-up starts AFTER the pillar, and finding out why closed a nine-day-old defect.**
   *
   * The first version of this test started 800 px back and reported the player stalling at
   * **x 3198**, which is the exact coordinate of a playtest bug recorded on 2026-08-12 as *"the
   * player wedges against terrain, 100 -> 35 hp, no way past"*. It was never diagnosed and was
   * carried forward as an open unknown through two sessions.
   *
   * It is not a wedge and there is no bug. `3198 + 66` (half the player's 132 px box) is
   * **exactly 3264** — the left face of the level's pillar, a 96 x 288 solid the player is
   * supposed to JUMP. Running right into it stops you dead, which is a collider working. What made
   * it read as a trap was taking contact damage there with no idea why forward movement had
   * stopped.
   *
   * Pinned below rather than merely written down, so a future layout edit that makes the pillar
   * genuinely unclimbable fails here instead of being re-reported as the same mystery.
   */
  it('the pillar at 3264 is a JUMP, not the wedge it was reported as', () => {
    const pillar = LEVEL.solids.find((s) => s.h === 288 && s.w === 96)!;
    expect(pillar, 'the pillar is gone from the level — this test is measuring nothing').toBeDefined();
    expect(pillar.x).toBe(3264);

    // Blocked by it on the ground: the "wedge". The player's leading edge reaches its face and
    // stops, which is what x 3198 was.
    // Started clear of the spike strip, which ends at 2496 — a run-up from 2464 would begin the
    // test already standing in the hazard and lose hp for a reason that is not the pillar.
    const walked = levelWorld(pillar.x - 600);
    const walking: InputSnapshot = createSnapshot();
    walking.right = true;
    for (let i = 0; i < 200; i += 1) tick(walked, walking);
    expect(walked.player.x).toBeLessThan(pillar.x);

    // ...and clearable with the same run-up plus a jump. The pillar's 288 px top is inside the
    // measured apex, which `tilemap-data.test.ts` already gates vertically; this is the horizontal
    // half it cannot see.
    const jumped = attempt(pillar.x - 600, pillar.x, pillar.x + pillar.w + 200);
    expect(
      jumped.cleared,
      `could not clear the 3264 pillar with a run-up; furthest x ${jumped.maxX}`,
    ).toBe(true);
  });

  it('the pit between the two floor sections can be crossed with a run-up', () => {
    // The run-up begins PAST the pillar at 3264-3360 — see the test above. Starting behind it
    // measures the pillar, not the pit, which is how the first draft of this file mistook one for
    // the other.
    const result = attempt(PIT.start - 400, PIT.start, PIT.end + 200);
    expect(result.cleared, `fell or stalled crossing a ${PIT.width}px pit at x ${PIT.start}; furthest x ${result.maxX}`).toBe(true);
  });
});

/**
 * 🔴 **The blocker raised when aggro became permanent, settled by simulation rather than by worry.**
 *
 * The session-10 plan flagged this and it was the right thing to flag: a scavenger that never gives
 * up *and* follows the player out of its patrol zone could turn the `x: 3198` pillar stall from
 * "escapable" into a guaranteed death. That would be a blocker, not something to absorb.
 *
 * It is not, and the reason is terrain. `level-01` puts its scavenger on the floor section starting
 * at **x 4128**, and the pit at **3840–4128** separates that section from the pillar. Ground-following
 * (`groundUnder`, probed at the body's leading edge) stops the chase at the pit's western lip, which
 * is **more than 400 px** from the pillar face the player stalls against.
 *
 * So the two hazards cannot combine: the terrain that makes the pit a real obstacle for the player
 * is the same terrain that makes it an impassable one for the enemy. Asserted rather than reasoned,
 * because "the enemy probably can't get there" is exactly the kind of claim that is true until a
 * level edit makes it false.
 */
describe('permanent aggro is bounded by the level, not just by the code', () => {
  it('the level scavenger cannot reach the x=3198 pillar stall, however long it chases', () => {
    const world = createWorld({
      seed: 1,
      scale: RENDER_SCALE,
      solids: LEVEL.solids,
      hazards: LEVEL.hazards,
      bounds: { widthPx: LEVEL.widthPx, heightPx: LEVEL.heightPx },
      spawn: { x: 3198, y: LEVEL.spawn.y },
      enemies: LEVEL.enemies,
    });
    const scavenger = world.enemies.scavengers[0]!;
    // Force the chase on rather than waiting for detection: the question is how far it can TRAVEL,
    // not whether it notices. Waiting would make the test pass for the wrong reason if the player
    // happened to be out of the 480 px radius.
    scavenger.chasing = true;

    const input: InputSnapshot = createSnapshot();
    for (let i = 0; i < 1200; i += 1) {
      tick(world, input);
    }

    expect(scavenger.chasing, 'the chase ended on its own — aggro is no longer permanent').toBe(true);
    // Stopped at the pit's eastern side, a clear margin from the player.
    expect(
      scavenger.x - world.player.x,
      `the scavenger reached within ${Math.round(scavenger.x - world.player.x)}px of the pillar ` +
        'stall — permanent aggro and the x:3198 stall now combine, which IS the blocker the plan ' +
        'raised. Do not absorb this; it needs a level or a design decision.',
    ).toBeGreaterThan(400);
  });
});
