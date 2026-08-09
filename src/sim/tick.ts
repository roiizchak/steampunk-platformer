/**
 * THE TICK STEP ORDER. This numbering is the contract, not an implementation detail (vault 2.2).
 *
 * A step order is invisible in a diff and is broken by refactors that read as tidying, so it is
 * written down here and the code below is a numbered list rather than a paragraph of arithmetic.
 * **Phase 5's combat timing is expressed against these numbers**, and Phase 5's animation frame
 * rates are derived as `renderFrames * TICK_HZ / simTicks` from windows that slot into them.
 * Renumbering later is not a refactor; it is a balance change to a phase that has already spent
 * money on art.
 *
 *   1.  Sample the seeded RNG exactly once -> `world.tickRoll`     (2.3 — the only advance)
 *   2.  Consume input edges from the mutable working copy          (2.4 — cleared on consumption)
 *   3.  Arm the jump-buffer window if a press edge arrived
 *   4.  Combat: i-frames, combat-state expiry, the attack edge, the live hitbox  (Phase 5)
 *   5.  Horizontal: accel / air-accel / friction, clamped to runMax
 *   6.  Vertical: gravity, fall clamp, early-release jump cut
 *   7.  Jump resolution: buffer open AND (grounded OR coyote open) -> impulse, close both
 *   8.  Integrate, semi-implicit Euler: v first, then position     (2.14)
 *   9.  Collide and resolve -> grounded
 *   10. Window arming: left the ground this tick -> open coyote
 *   11. State transition, through the one door                     (2.6)
 *   12. Emit this tick's event edges                               (2.5)
 *   13. Advance every window counter — LAST, after every test of it
 *   14. tickCount++
 *
 * **Step 4 was reserved by number in Phase 2, before it had any content, and Phase 5 filled it
 * without moving anything.** Codex plan review F6: a hit window activated after integration cannot
 * affect the same tick's collision, and knockback written after step 8 lands a tick late. Since
 * vault 2.11 forbids scaling velocities, that offset cannot be papered over in the render layer.
 * Reserving the slot cost one comment; it saved renumbering a contract the art is now derived from.
 *
 * **Step 4's own internals are ordered too** (Phase 5 Codex plan review C6 — "all in step 4" does
 * not say what happens when a kill plane and an attack resolve on the same tick):
 * i-frame expiry, then combat-state expiry, then the attack edge, then the live hitbox. Damage from
 * world geometry — hazards, the kill plane, enemy contact — is applied by the CALLER around this,
 * because `combat.ts` deliberately imports no level data.
 *
 * **State moved from step 4 to step 11 after Codex implementation review I4.** Resolved before
 * integration, the state published each tick described the position of the PREVIOUS one: a jump's
 * first airborne tick still reported `idle`, and the landing tick still reported `fall`. Since
 * `playerView` picks its colour straight from `player.state`, that was visible on screen. Moved
 * after collision, the state and the position published in the same tick describe the same moment.
 * Phase 5 is unaffected: combat at step 4 gates on states combat itself owns (`attack`, `hurt`,
 * `death`), which persist across ticks, not on this tick's freshly derived movement state.
 * Renumbering was free HERE and only here — nothing depends on the contract yet, which is exactly
 * what the plan review asked to get right before Phase 5 does.
 *
 * **THE WINDOW DEFINITIONS.** They are NOT one sentence. An earlier version of this header claimed
 * both windows behaved identically; the Codex implementation review (finding I1) showed that claim
 * was false, and the buffer tests could not have caught it because they asked "did a jump happen
 * afterwards" rather than "on which tick was it accepted". Both are now stated separately and
 * `coyote-time.test.ts` pins the exact accepting tick of each.
 *
 *   > **Coyote — `coyoteTicks = N`:** the jump is accepted on the `N` consecutive ticks starting
 *   > with the first tick after the player walks off a ledge. Offset `N - 1` accepts; offset `N`
 *   > does not. The ledge tick itself is not one of them, because step 7 had already run when
 *   > step 10 armed the window.
 *
 *   > **Buffer — `jumpBufferTicks = N`:** a press is remembered for `N` ticks starting with the
 *   > tick of the press itself, and fires the moment the player is next able to jump. **When the
 *   > player is airborne, "able to jump" is the tick AFTER touchdown, not the touchdown tick** —
 *   > step 7 tests `grounded`, which step 9 of the previous tick set. So a press up to `N - 1`
 *   > ticks before touchdown still jumps, one tick after landing.
 *
 * That one-tick delay is uniform, deliberate and 16 ms. It is the price of testing the jump before
 * integrating, which is what lets a jump take effect on the tick it is pressed. The alternative —
 * testing after collision — would delay every jump instead of only buffered ones.
 *
 * Windows are INCREMENTING counters tested `counter < knob`, not decrementing timers. Codex plan
 * review F5 found the original design: a timer armed at step 11 and decremented at step 2 burned a
 * tick inside its own arming tick, so a knob of `N` bought `N - 1` usable ticks — and because the
 * buffer was armed after the decrement and coyote before it, the two windows disagreed about their
 * own endpoints while reading the same knob. One mechanism, tested at both ends by
 * `tests/unit/coyote-time.test.ts`, is the fix.
 */

import { consumeJumpPress } from './input';
import {
  PLAYER_BOX,
  createTuning,
  resolveCollisions,
  resolveState,
  stepHorizontal,
  stepVertical,
} from './player';
import { PLAYER_MAX_HP, IFRAME_TICKS, stepCombat } from './combat';
import { createRng, nextFloat } from './rng';
import type { AdvanceEvents, InputSnapshot, Rect, TickEvents, World } from './types';
import { advanceWindow, windowOpen } from './windows';

/**
 * Grey-box collision geometry: a floor and two raised platforms with a gap between them.
 *
 * The gap is not decoration. Coyote time can only be observed by walking OFF something, so a world
 * with no ledge makes criterion 2.3 testable only through an artificial "force ungrounded" hook —
 * and a hook that fakes the precondition cannot prove the real one works.
 *
 * Phase 3 replaces the SOURCE of these rects with Tiled collision data. The resolver does not
 * change, which is the point of keeping them plain data.
 */
export const GREY_BOX_SOLIDS: Rect[] = [
  { x: 0, y: 960, w: 1920, h: 120 },
  { x: 420, y: 780, w: 280, h: 32 },
  { x: 980, y: 640, w: 240, h: 32 },
];

/**
 * Where the player starts: on the left platform's surface, with its right edge to walk off.
 *
 * `SPAWN_Y` is the platform's top, not a height above it. Spawning in mid-air would mean every
 * fixture had to know how many ticks the drop takes before it could assert anything about a
 * grounded player — a constant that changes whenever gravity is retuned, silently turning
 * fixtures vacuous. Placed on the surface, the player is grounded after exactly one tick.
 */
const SPAWN_X = 470;
const SPAWN_Y = 780;

export interface CreateWorldOptions {
  seed: number;
  /** Art and collision scale (vault 2.11). Required — a forgetful call site is a typecheck error. */
  scale: number;
  solids?: Rect[];
  /**
   * The player's feet at level start. Defaults to the grey-box spawn above.
   *
   * Optional on purpose: Phase 3 feeds this from the shipped `.tmj`'s spawn object, while every
   * Phase 2 unit fixture keeps the grey-box default it was written against. A required field here
   * would have meant editing forty call sites to say "unchanged".
   */
  spawn?: { x: number; y: number };
}

export function createWorld({ seed, scale, solids, spawn }: CreateWorldOptions): World {
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new Error(`createWorld: scale must be a finite number greater than 0, got ${scale}`);
  }

  const tuning = createTuning();
  return {
    tickCount: 0,
    rng: createRng(seed),
    tickRoll: 0,
    solids: solids ?? GREY_BOX_SOLIDS,
    tuning,
    scale,
    player: {
      x: spawn?.x ?? SPAWN_X,
      y: spawn?.y ?? SPAWN_Y,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: false,
      state: 'fall',
      // Both windows start CLOSED. Seeding them at 0 would mean "the window just opened", and the
      // player would get a free coyote jump out of thin air on the first tick of the game.
      ticksSinceGrounded: tuning.coyoteTicks,
      ticksSinceJumpPressed: tuning.jumpBufferTicks,
      jumpCutPending: false,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      combatCounter: 0,
      // CLOSED, for the same reason as the two windows above: seeding at 0 would spawn the player
      // invulnerable for three quarters of a second.
      iFrameCounter: IFRAME_TICKS,
    },
  };
}

function noEvents(): TickEvents {
  return { jumped: false, landed: false, leftGround: false, attackStarted: false, hitActive: false };
}

/**
 * Run exactly one simulation tick. Steps are numbered to match the contract above.
 *
 * Takes no delta and reads no clock. The caller decides how many ticks a frame is worth; this
 * function's behaviour cannot vary with frame rate, which is the entire reason vault 2.1 exists.
 */
export function tick(world: World, input: InputSnapshot): TickEvents {
  const events = noEvents();
  const { player, tuning } = world;

  // 1. Sample the seeded stream exactly once (vault 2.3). Consumers read `tickRoll`; they never
  //    pull from the stream, so the number of decisions a tick makes cannot change the sequence.
  world.tickRoll = nextFloat(world.rng);

  // 2. Consume input edges. Cleared HERE, by a tick taking it — never because a tick ran (2.4).
  const jumpPressed = consumeJumpPress(input);

  // 3. Arm the jump-buffer window.
  if (jumpPressed) {
    player.ticksSinceJumpPressed = 0;
  }

  const dir: -1 | 0 | 1 = input.left === input.right ? 0 : input.right ? 1 : -1;

  // 4. Combat — Phase 5 filled the slot Phase 2 reserved.
  //    Placed BEFORE integration on purpose so knockback reaches this tick's movement.
  //    `stepCombat` owns the internal order (i-frames, state expiry, the attack edge, the live
  //    hitbox); world-geometry damage — hazards, the kill plane, enemy contact — is applied by the
  //    caller, because those need level data `src/sim/combat.ts` deliberately does not import.
  const combat = stepCombat(player, input);
  events.attackStarted = combat.attackStarted;
  events.hitActive = combat.hitActive;

  // 5. Horizontal.
  stepHorizontal(player, tuning, dir, input.walkHeld);

  // 6. Vertical.
  stepVertical(player, tuning, input.jumpHeld);

  // 7. Jump resolution. Both windows are tested BEFORE step 13 advances them, which is what makes
  //    the definition above true rather than one tick optimistic.
  const bufferOpen = windowOpen(player.ticksSinceJumpPressed, tuning.jumpBufferTicks);
  const coyoteOpen = windowOpen(player.ticksSinceGrounded, tuning.coyoteTicks);
  if (bufferOpen && (player.grounded || coyoteOpen)) {
    player.vy = -tuning.jumpVelocity;
    player.jumpCutPending = true;
    player.grounded = false;
    // Close BOTH windows. Closing only the buffer would leave the coyote window open for a second
    // free jump; closing only coyote would let the buffered press fire again on landing.
    player.ticksSinceJumpPressed = tuning.jumpBufferTicks;
    player.ticksSinceGrounded = tuning.coyoteTicks;
    events.jumped = true;
  }

  // 8. Integrate — semi-implicit Euler, velocity already updated above, then position (vault 2.14).
  const previousX = player.x;
  const previousY = player.y;
  player.x += player.vx;
  player.y += player.vy;

  // 9. Collide and resolve.
  const wasGrounded = player.grounded;
  player.grounded = resolveCollisions(player, world.solids, world.scale, previousX, previousY);

  // 10. Window arming. Opening coyote requires having WALKED off — a jump closed the window at
  //     step 8 and must not reopen it here, or every jump would buy a second one in mid-air.
  let coyoteArmedThisTick = false;
  if (player.grounded) {
    player.ticksSinceGrounded = 0;
    coyoteArmedThisTick = true;
    if (!wasGrounded) {
      events.landed = true;
    }
  } else if (wasGrounded && !events.jumped) {
    player.ticksSinceGrounded = 0;
    coyoteArmedThisTick = true;
    events.leftGround = true;
  }

  // 11. State transition, through the one door (vault 2.6). AFTER collision, so the state and the
  //     position published in the same tick describe the same moment — see the header note on
  //     Codex review 2 finding I4.

  resolveState(player, dir !== 0 || player.vx !== 0, input.walkHeld, tuning);

  // 12. Emit edges (vault 2.5) — returned, never reconstructed by comparing state across frames.

  // 13. Advance every window counter, LAST, after every test of one.
  //
  //     ONE RULE, applied to both windows:
  //
  //       > A window does not spend a tick on which step 8 could not yet see the fact that tick
  //       > established.
  //
  //     Step 8 runs before step 10 resolves collisions, so it necessarily tests LAST tick's
  //     grounded flag. Two ticks are therefore not real chances to jump, and charging the window
  //     for them makes a knob of `N` behave like `N - 1`:
  //
  //       - the tick the player walks off a ledge — coyote is armed at step 11, after step 8 ran;
  //       - the tick the player touches down — the buffer was tested at step 8 while `grounded`
  //         was still false, so the buffered jump actually fires on the following tick.
  //
  //     Codex plan review F5 predicted the first and this implementation had it; `coyote-time.
  //     test.ts` then caught the second, which is the same defect mirrored. Both endpoints of
  //     both windows are asserted there against the live knob.
  //
  //     The `advanceWindow` call is the shared saturating increment from `windows.ts`; the guard in
  //     front of it — WHETHER this tick is spent at all — is the step-order rule above and stays
  //     here, with the numbered order that owns it.
  if (!coyoteArmedThisTick) {
    player.ticksSinceGrounded = advanceWindow(player.ticksSinceGrounded, tuning.coyoteTicks);
  }
  if (!events.landed) {
    player.ticksSinceJumpPressed = advanceWindow(
      player.ticksSinceJumpPressed,
      tuning.jumpBufferTicks,
    );
  }

  // 14.
  world.tickCount += 1;

  return events;
}

/**
 * Run `ticks` simulation ticks against ONE snapshot, returning the OR-accumulated edges (vault 2.5).
 *
 * The accumulation is why this returns anything at all. A render frame can drain many ticks, so a
 * whole action can start and finish between two frames; a renderer that compared state across
 * frames would never see it. `ticks === 0` is a legal, meaningful call — a frame whose accumulator
 * did not reach a whole tick — and it must not consume the input snapshot.
 */
export function advance(world: World, input: InputSnapshot, ticks: number): AdvanceEvents {
  const total = noEvents();
  for (let i = 0; i < ticks; i += 1) {
    const events = tick(world, input);
    total.jumped = total.jumped || events.jumped;
    total.landed = total.landed || events.landed;
    total.leftGround = total.leftGround || events.leftGround;
  }
  return total;
}

export { PLAYER_BOX };
