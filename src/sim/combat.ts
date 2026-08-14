/**
 * Combat timing — the numbers Phase 5's art is generated against.
 *
 * ## Read this before changing a number in this file
 *
 * `fps = renderFrames * TICK_HZ / simTicks` *(vault 4.22)*. Every combat sheet's frame rate is
 * derived from a duration below, so **changing one of these is a balance change that invalidates a
 * generated sheet** — not a refactor. Criterion 5.4b requires these frozen and recorded in
 * `docs/qa/phase-05-combat.md` before any clip is shot, because the alternative is what the vault
 * records: *every light attack had 0.43 s of art over a 0.25 s move, so the strike was never drawn.*
 *
 * ## Where this runs
 *
 * **Step 4 of the tick order** (`tick.ts`), which Phase 2 reserved and left empty for exactly this.
 * Step 4 is before integration on purpose, so knockback written here reaches the *same* tick's
 * movement rather than landing a tick late — and vault 2.11 forbids papering over that in the
 * render layer.
 *
 * Step 4's own internals are ordered, because "all in step 4" does not say what happens when a
 * kill plane and an attack resolve on the same tick:
 *
 *   1. i-frame expiry      — first, so a hazard cannot re-trigger inside its own grace window
 *   2. attack windows      — who is swinging, and on which tick
 *   3. damage
 *   4. knockback           — after damage, so a lethal hit does not also shove a corpse
 *   5. death
 *
 * ⚠️ **World-geometry damage is NOT in this list, and used to be.** The kill plane, hazards,
 * projectiles and enemy contact resolve at step **9b**, after collision — see `tick.ts:21,40-46`,
 * which is the authority. A swept hazard test needs BOTH endpoints of this tick's motion, so it
 * cannot run before integration. This docstring listed it here as step-4 item 2 long after the code
 * moved, which is the "prose is not the authority" trap in the one file least allowed to carry it.
 * Found by the `voltagent-qa-sec:qa-expert` gate owner, session 7.
 *
 * ## The windows are not restated here
 *
 * `windowOpen` comes from `windows.ts`. Phase 2 shipped that rule three times and two copies had
 * drifted by one tick before Phase 5 found it *(vault 5.3, blocker)*. Combat does not get a fourth.
 */

import { consumeAttackPress } from './input';
import type { CombatState, InputSnapshot, PlayerSim, PlayerState } from './types';
import { advanceWindow, windowOpen } from './windows';

/** A three-phase move. Every field is an integer count of 60 Hz ticks. */
export interface CombatTiming {
  /** Wind-up. Nothing registers. The player is committed from tick 0. */
  startup: number;
  /** The strike. The hitbox is live on exactly these ticks and no others. */
  active: number;
  /** Commitment tail. Nothing registers, and the player cannot act — this is the punish window. */
  recovery: number;
}

/**
 * The player's spanner swing: **20 ticks, 333 ms.**
 *
 * Chosen against Phase 2's existing feel rather than in the abstract. Airtime is 37 ticks, so a
 * whole swing is a little over half a jump — long enough to be a commitment you can be punished
 * for, short enough that it does not eat a platforming input. The 6-tick wind-up is the readable
 * part: at 96 px tiles and a 288 px character it is what tells an opponent the swing is coming.
 *
 * The 4-tick active window is deliberately the smallest of the three. A generous active window
 * hides bad alignment — if the art is a frame out and the window is 10 ticks wide, nobody notices,
 * and criterion 5.4c can pass on a sheet whose contact frame is simply wrong. A tight window makes
 * the art gate mean something.
 */
export const ATTACK: CombatTiming = { startup: 6, active: 4, recovery: 10 };

/**
 * Hitstun: **18 ticks, 300 ms** total. The label persists for the full 18, but only the first
 * `HURT_LOCK_TICKS` of that are "not being in control" — see `movementLocked` below. The remaining
 * 12 ticks are animation tail only: input is free, the pose is still `hurt`.
 */
export const HURT_TICKS = 18;

/**
 * Invulnerability after taking a hit: **45 ticks, 750 ms.**
 *
 * Deliberately longer than `HURT_TICKS`, and `combat.test.ts` pins that relationship. If i-frames
 * ended with hitstun, the player would become actionable and vulnerable on the same tick, so a
 * second contact could chain off the first with no counterplay — one mistake, unbounded punishment.
 * The 27-tick surplus is the window in which you can actually leave.
 */
export const IFRAME_TICKS = 45;

/** Death: **45 ticks, 750 ms** before the respawn, long enough for the death sheet to be seen. */
export const DEATH_TICKS = 45;

/**
 * Player health: **100**, so a damage number reads as a percentage without arithmetic.
 *
 * The sentry's 10 and the scavenger's 15 are then legible as "ten hits" and "about seven" — which
 * is the property that makes the enemy health bar's 2/100 case in criterion 5.7 a real number
 * rather than a contrived one.
 */
export const PLAYER_MAX_HP = 100;

/**
 * The animation clock runs one tick behind the sim.
 *
 * `play()` is called in the render pass that follows the tick which entered the state, so frame 0
 * is drawn one tick after the state began. Art alignment therefore budgets the wind-up at
 * `startup - PLAY_LAG_TICKS` ticks; spending the full `startup` puts the contact frame on the last
 * active tick instead of the first.
 *
 * Invisible to correct arithmetic — the sibling project found it only by tracing the sim's state
 * frame against `anims.currentFrame` live. It is a constant here so the art pipeline imports it
 * rather than rediscovering it.
 */
export const PLAY_LAG_TICKS = 1;

/** Total length of a move, in ticks. */
export function attackTotalTicks(timing: CombatTiming): number {
  return timing.startup + timing.active + timing.recovery;
}

/** Which phase of a move a counter is in. `done` means the move is over. */
export type AttackPhase = 'startup' | 'active' | 'recovery' | 'done';

/**
 * The phase for a given tick of the move.
 *
 * Boundaries are half-open — `[0, startup)` is wind-up, `[startup, startup + active)` is live — so
 * the phases tile the move exactly, with no tick belonging to two of them and none to neither.
 * `combat.test.ts` walks every tick of a whole swing rather than sampling, because a sampled check
 * passes while a boundary is off by one.
 */
export function attackPhase(counter: number, timing: CombatTiming): AttackPhase {
  if (!Number.isInteger(counter)) {
    throw new Error(`attackPhase: counter must be an integer tick count, got ${counter}`);
  }
  if (counter < 0 || counter >= attackTotalTicks(timing)) {
    return 'done';
  }
  if (windowOpen(counter, timing.startup)) {
    return 'startup';
  }
  if (windowOpen(counter - timing.startup, timing.active)) {
    return 'active';
  }
  return 'recovery';
}

/**
 * Is the hitbox live on this tick? **Criterion 5.5.**
 *
 * This is the one predicate the sim, the tests and the art gate all consult — the art's contact
 * frame is checked against *this*, never against a second copy of "which frames are the attack"
 * *(vault 5.3)*.
 */
export function hitWindowOpen(counter: number, timing: CombatTiming): boolean {
  return attackPhase(counter, timing) === 'active';
}

/* ------------------------------------------------------------------ *
 * Step 4 — the running machine.
 * ------------------------------------------------------------------ */

const COMBAT_STATES: ReadonlySet<PlayerState> = new Set<PlayerState>(['attack', 'hurt', 'death']);

/**
 * Is this a state combat owns, and therefore one step 11 must not overwrite?
 *
 * Exported because `resolveState` imports it rather than testing three string literals of its own
 * *(vault 5.3)*. Adding a fourth combat state later then changes one set, not two lists that agree
 * until the day they do not.
 */
export function isCombatState(state: PlayerState): state is CombatState {
  return COMBAT_STATES.has(state);
}

/** How long the given combat state lasts, in ticks. */
export function combatStateTicks(state: CombatState): number {
  switch (state) {
    case 'attack':
      return attackTotalTicks(ATTACK);
    case 'hurt':
      return HURT_TICKS;
    case 'death':
      return DEATH_TICKS;
  }
}

/**
 * Is the player currently invulnerable?
 *
 * The one predicate — `damagePlayer` consults it, the tests import it, and the HUD will too. Never
 * re-expressed as `iFrameCounter < IFRAME_TICKS` at a call site *(vault 5.3)*.
 */
export function invulnerable(player: PlayerSim): boolean {
  return windowOpen(player.iFrameCounter, IFRAME_TICKS);
}

/**
 * Apply damage. Returns whether it landed.
 *
 * The **boolean return is the point**: a caller that cannot tell a refused hit from a landed one
 * will happily play a hit spark during i-frames. Refusal is a normal outcome here, not an error.
 *
 * Death is decided here rather than at the end of step 4, because a lethal hit must not also enter
 * `hurt` — hitstun on a corpse would play the wrong sheet and then release control of a dead
 * player.
 */
export function damagePlayer(player: PlayerSim, amount: number): boolean {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`damagePlayer: amount must be a non-negative integer, got ${amount}`);
  }
  if (player.state === 'death' || invulnerable(player)) {
    return false;
  }

  player.hp = Math.max(0, player.hp - amount);
  player.iFrameCounter = 0;
  enterCombatState(player, player.hp === 0 ? 'death' : 'hurt');
  return true;
}

/**
 * Kill outright, ignoring i-frames.
 *
 * The kill plane is not damage and must not be survivable: a player who falls out of the world
 * during an i-frame window would otherwise keep falling forever, which is the exact Phase 4 defect
 * this closes. So it does not route through `damagePlayer`, whose whole job is to respect the
 * grace window.
 *
 * Idempotent — re-entering `death` every tick would reset `combatCounter` and the death animation
 * would never advance past its first frame.
 */
export function killPlayer(player: PlayerSim): void {
  if (player.state === 'death') {
    return;
  }
  player.hp = 0;
  enterCombatState(player, 'death');
}

/**
 * Has the corpse been on screen for its full `DEATH_TICKS`?
 *
 * An exported predicate rather than an inequality restated at the call site *(vault 5.3)*: `tick.ts`
 * owns the respawn because it owns the spawn point, but the WINDOW belongs to the module that
 * declares `DEATH_TICKS`, and two statements of one window is where the off-by-one lives.
 */
export function deathWindowClosed(player: PlayerSim): boolean {
  return player.state === 'death' && !windowOpen(player.combatCounter, DEATH_TICKS);
}

/**
 * Put the player back at `spawn`, alive.
 *
 * ## Why this exists at all
 *
 * Phase 4 shipped a level the player could fall out of forever; `hazards.ts` recorded that as
 * deliberate debt, because *"bolting a respawn onto a game with no health model would have had to
 * be undone here"*. Phase 5 built the health model and never came back for the respawn, so death
 * became a **terminal freeze** — the exact defect that note was deferring, arriving through combat
 * instead of through the kill plane.
 *
 * ## What it resets, and what it deliberately does not
 *
 * The **player** is restored: position, both velocities, hp, state, and every combat counter.
 * `iFrameCounter` is opened so a respawn cannot be immediately re-killed by whatever was touching
 * the player when they died — that is a grace window, not invulnerability, and it lapses on its own.
 *
 * The **world** is untouched. Enemies you killed stay dead, enemies you hurt stay hurt, and shots in
 * flight keep flying. Resetting them would be a different game (a checkpoint restart rather than a
 * life), and it is not what the death of one actor implies. Recorded as a decision so the absence is
 * not read as an oversight the way the missing respawn was.
 *
 * Vertical state is cleared too: `grounded` false and `ticksSinceGrounded` saturated, so a respawn
 * cannot hand out a free coyote jump from a window armed before the player died.
 */
export function respawnPlayer(player: PlayerSim, spawn: { x: number; y: number }): void {
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.hp = player.maxHp;
  player.state = 'idle';
  player.combatCounter = 0;
  player.iFrameCounter = 0;
  player.knockbackPending = false;
  player.grounded = false;
  player.jumpCutPending = false;
}

/**
 * Enter a combat state through the one door, resetting the shared counter.
 *
 * Kept here rather than in `player.ts`'s `enterState` because only combat states carry a duration;
 * `enterState` remains the door for movement states and this delegates to the same idea.
 */
export function enterCombatState(player: PlayerSim, next: CombatState): void {
  player.state = next;
  player.combatCounter = 0;
}

/** What step 4 did this tick, for the caller to turn into events. */
export interface CombatStep {
  /** The attack's hitbox is live on this tick — criterion 5.5. */
  hitActive: boolean;
  /** A swing began this tick. */
  attackStarted: boolean;
}

/**
 * **Step 4 of the tick order.** Runs before integration, so knockback reaches this tick's movement.
 *
 * Internal order, fixed (Codex C6 — "all in step 4" does not say what happens when two things
 * resolve on the same tick):
 *
 *   1. i-frame expiry — first, so a hazard cannot re-trigger inside its own grace window
 *   2. combat-state expiry — release `attack`/`hurt` when their window closes
 *   3. accept the attack edge — only if the player is free to act
 *   4. report whether the hitbox is live
 *
 * Damage, hazards and knockback are applied by the caller between 1 and 2, because they need world
 * geometry this module deliberately does not import.
 */
export function stepCombat(player: PlayerSim, input: InputSnapshot): CombatStep {
  // 1. i-frames.
  player.iFrameCounter = advanceWindow(player.iFrameCounter, IFRAME_TICKS);

  // 2. Combat-state expiry.
  //
  //    🔴 The counter advances for EVERY combat state including `death`, and until 2026-08-14 it
  //    did not. `death` was excluded from the whole block, so a dead player's `combatCounter` sat
  //    at 0 forever, the death window could never close, and nothing downstream could ever ask
  //    "has the corpse been on screen long enough". The player reported it exactly as it behaves:
  //    *"I cannot die. It gets stuck before I actually see the kill."* `DEATH_TICKS`'s own
  //    docstring said "45 ticks before the respawn" and there was no respawn anywhere in the
  //    project — `hazards.ts` had recorded that as deliberate Phase-4 debt, to be closed once a
  //    health model existed. It does now.
  //
  //    What has NOT changed is that `death` is terminal HERE. It still never releases itself into
  //    `idle`, because that would let a dead player walk. The counter advances so `deathWindowClosed`
  //    below can be asked; the respawn is still the caller's decision, taken in `tick.ts` step 4c
  //    where the spawn point lives.
  if (isCombatState(player.state)) {
    player.combatCounter += 1;
    if (player.state !== 'death' && !windowOpen(player.combatCounter, combatStateTicks(player.state))) {
      // Hand the body back to step 11, which re-derives a movement state from grounded/moving.
      player.state = 'idle';
      player.combatCounter = 0;
    }
  }

  // 3. The attack edge is consumed EVERY tick whether or not it is honoured, so a press made while
  //    dead or mid-swing does not queue up and fire later.
  const pressed = consumeAttackPress(input);
  let attackStarted = false;
  if (pressed && canAct(player)) {
    enterCombatState(player, 'attack');
    attackStarted = true;
  }

  // 4. Is the hitbox live this tick?
  const hitActive = player.state === 'attack' && hitWindowOpen(player.combatCounter, ATTACK);

  return { hitActive, attackStarted };
}

/** Free to start a new action? Not while already committed to one. */
export function canAct(player: PlayerSim): boolean {
  return !isCombatState(player.state);
}

/**
 * How long hitstun locks movement: the knob is **6**, the same wind-up `ATTACK.startup` already
 * spends being read as "the swing is coming". Reused deliberately rather than authoring an eighth
 * number — one measured constant, two consumers.
 *
 * ⚠️ **The knob is 6; the observed lock is FIVE ticks.** `hurt` is armed at step 9b and read at
 * step 5 of the next tick, so its `counter === 0` is never seen. `movementLocked`'s docstring
 * derives this in full — read it before changing either number.
 *
 * The rest of `HURT_TICKS` is animation only: the `hurt` label and pose persist for all 18 ticks,
 * but the player is free to move again after the lock, and the attack edge stays blocked for the
 * whole 18 by `canAct`. **Three different windows, three different lengths — do not conflate them.**
 */
export const HURT_LOCK_TICKS = ATTACK.startup;

/**
 * Is movement locked this tick? Grounded or airborne alike. Mirrors `canAct`'s shape — one
 * predicate, imported at the call site, never restated *(vault 5.3)*.
 *
 * ## The lock is FIVE ticks, not six, and that is not a bug — state it rather than round it
 *
 * `HURT_LOCK_TICKS` is 6 and `windowOpen` accepts `0 … 5`, so a naive reading says six locked
 * ticks. It is five, and the reason is the same one the tick contract's header exists to state:
 * **where in the tick a window is ARMED decides how much of it a later step can see.**
 *
 * - `attack` is armed at **step 4b**, by `enterCombatState` inside `stepCombat`, and
 *   `hitWindowOpen` reads the counter later in that same call — so `counter === 0` **is** observed
 *   and `ATTACK.startup` spans **six** ticks.
 * - `hurt` is armed at **step 9b**, by `damagePlayer`, which is *after* step 4b has already run
 *   this tick. The `counter === 0` instant is therefore never read by `movementLocked`, which is
 *   called from step 5 of the *following* tick with the counter already advanced to 1. The lock
 *   spans counters `1 … 5`: **five ticks, 83 ms.**
 *
 * The two are not symmetric because damage and attack entry sit on opposite sides of step 4b —
 * exactly the shape of the buffered-jump asymmetry `tick.ts` documents. What the shared constant
 * buys is still the useful property: **the movement lock ends on precisely the tick an attack's
 * active frames would have begun.** One measured constant, two consumers, one stated asymmetry.
 *
 * ## 🔴 `death` locks too, and it did not until 2026-08-14
 *
 * This tested `hurt` alone, so **a corpse could still be walked around** — `canAct` blocks a dead
 * player from ATTACKING, and nothing blocked them from moving. It went unnoticed because death was
 * terminal: the state never ended, so nobody looked at what could be done inside it, and the
 * respawn tests were the first thing to hold a direction key while dead.
 *
 * There is no window on this half. Death is locked for as long as it lasts, which is what
 * `deathWindowClosed` and the respawn now bound. Friction still applies (step 5 sees `dir === 0`
 * rather than being skipped), so a body killed mid-run slides to a stop instead of stopping dead —
 * which is the behaviour a corpse should have and the one a hard velocity clear would lose.
 */
export function movementLocked(player: PlayerSim): boolean {
  if (player.state === 'death') {
    return true;
  }
  return player.state === 'hurt' && windowOpen(player.combatCounter, HURT_LOCK_TICKS);
}

/**
 * Is this the ONE tick a knockback impulse needs friction skipped, so it can actually move the
 * player? FIX 2.
 *
 * Knockback writes `player.vx` at step 9b of the hit tick. On the *next* tick, `movementLocked`
 * zeroes `dir`, so `stepHorizontal`'s `dir === 0` branch decelerates `vx` by `groundFriction`
 * (3.69) BEFORE step 8 integrates it — a 5.54 px/tick impulse moved the player under 2 px and was
 * gone. `damagePlayer` sets `combatCounter = 0` at step 9b, and step 4b of the very next tick
 * advances it to 1 before step 5 runs — so `state === 'hurt' && combatCounter === 1` identifies
 * exactly, and only, that one tick. No new counter: this reads the same one `movementLocked` does.
 *
 * ⚠️ **That alone is not enough.** Hazards deliberately apply no shove (`worldDamage.ts` — a swept
 * rectangle has no origin to shove away from), but a hazard hit still sets `state === 'hurt'` and
 * still passes through `combatCounter === 1` on the following tick — so it was buying the friction
 * exemption for an impulse that was never written, one free tick of preserved momentum for nothing.
 * `knockbackPending` (`PlayerSim`) is set only where `applyKnockback` actually runs, so this now
 * requires a REAL impulse landed, not merely that the player is `hurt`. The flag is cleared by
 * `stepHorizontal` (`player.ts`) the one time it is consumed, which is what keeps the exemption to
 * one tick rather than letting it become a second, permanent name for `movementLocked`.
 */
export function knockbackSettling(player: PlayerSim): boolean {
  return player.state === 'hurt' && player.combatCounter === 1 && player.knockbackPending;
}
