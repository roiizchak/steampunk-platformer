/**
 * Combat STATE — the machine the timings in `combatTiming.ts` drive.
 *
 * The frozen numbers, the three-phase shape and the hit window moved to
 * [`combatTiming.ts`](./combatTiming.ts) on 2026-08-15, to bring this file under the 400-line rule
 * (criterion 4.16 / 5.12). **The header there is the one to read before changing a number** — it is
 * still true that changing a duration is a balance change that invalidates a generated sheet.
 *
 * Everything that module exports is re-exported here, so `from './combat'` keeps working for the
 * ~20 call sites and for `src/sim/index.ts`. The dependency runs one way only: this file imports
 * `combatTiming.ts`, never the reverse.
 */

import { consumeAttackPress } from './input';
import type { CombatState, InputSnapshot, PlayerSim, PlayerState, TuningKnobs } from './types';
import { advanceWindow, windowOpen } from './windows';
import { frozen } from './hitstop';
import {
  ATTACK,
  DEATH_TICKS,
  HURT_TICKS,
  IFRAME_TICKS,
  attackTotalTicks,
  hitWindowOpen,
} from './combatTiming';

export {
  ATTACK,
  DEATH_TICKS,
  HURT_TICKS,
  IFRAME_TICKS,
  PLAYER_MAX_HP,
  PLAY_LAG_TICKS,
  attackPhase,
  attackTotalTicks,
  hitWindowOpen,
} from './combatTiming';
export type { AttackPhase, CombatTiming } from './combatTiming';

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
 * instead of through the kill plane. The player reported it as *"I cannot die. It gets stuck before
 * I actually see the kill"*, which is what a terminal state with a `movementLocked` body looks like
 * from the outside. (That sentence used to sit at step 4c of `tick.ts` as a second copy of this
 * paragraph; it is here now, with the rest of it — one concept, one place *(vault 5.3)*.)
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
 * Vertical state is cleared too: `grounded` false and **both forgiveness counters saturated**, so a
 * respawn cannot hand out a free coyote jump or fire a jump buffered while the player was dead.
 *
 * Phase 9's three hit-stop fields are cleared for exactly that reason and not because the case is
 * reachable: the longest freeze is `HITSTOP_TICKS.lethal` 9 against a `DEATH_TICKS` window of 45, so
 * a freeze armed on the killing blow has always lapsed by the time this runs. It stops being true
 * the moment either knob moves, and the failure it becomes is a player who respawns unable to move
 * with nothing on screen to explain it — the shape of defect this docstring exists to prevent, and
 * one that would be blamed on the respawn rather than on the retune.
 *
 * `tuning` is a REQUIRED argument for the same reason `createWorld`'s `scale` is *(vault 2.11)*: the
 * window lengths belong to the tuning in play, and defaulting them here would silently close the
 * default-sized window while a feel variant left its own longer one open.
 */
export function respawnPlayer(
  player: PlayerSim,
  spawn: { x: number; y: number },
  tuning: Pick<TuningKnobs, 'coyoteTicks' | 'jumpBufferTicks'>,
): void {
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
  // 🔴 Both forgiveness windows are CLOSED by saturating their counters, not merely by clearing
  // `grounded`. Setting the flag alone was the bug: a corpse stays `grounded` for the whole death
  // window, so step 10 re-arms `ticksSinceGrounded = 0` on every one of those 45 ticks, and step 7
  // of the respawn tick then read a coyote window that was still wide open. A jump held while dead —
  // which is what a player does — launched the courier off the spawn point in mid-air at full
  // `jumpVelocity`. Found by the criterion 5.3 gate owner, who measured 216 px of free height.
  //
  // `advanceWindow`'s convention is that a counter AT the window length means closed, so the
  // saturated value is the length itself. The numbers come from the tuning the caller is running,
  // not from `DEFAULT_TUNING`: a feel variant with a longer coyote window must close ITS window.
  player.ticksSinceGrounded = tuning.coyoteTicks;
  player.ticksSinceJumpPressed = tuning.jumpBufferTicks;
  player.hitstopUntil = -1;
  player.lastHitTick = -1;
  player.swingStartTick = -1;
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
 *
 * ## Phase 9: the COUNTERS freeze, the input EDGE does not — and the split is the whole ruling
 *
 * Hit-stop stops 1 and 2 and leaves 3 and 4 running. Both halves were got wrong in an earlier draft,
 * in opposite directions, and an independent review ruled on the middle:
 *
 *  - **Freezing all of it re-strikes.** The live hitbox at 4 is what step 9b resolves; suppressed, a
 *    frozen swing draws its active pose and connects with nothing.
 *  - **Freezing none of it silently eats the freeze.** With `ATTACK` at `{6, 4, 10}`, 4-9 live ticks
 *    inside a freeze are 4-9 ticks of swing recovery, hurt-lock and i-frames spent while the player
 *    cannot act — landing a hit would make the next swing arrive *sooner* than whiffing does, and
 *    `combatTiming.ts` calls moving those numbers *"a balance change that invalidates a generated
 *    sheet"*. Recording it as a known leak was refused.
 *  - **The edge must keep being consumed** or it latches *(vault 2.4)*: a press made during a freeze
 *    would otherwise fire the instant it lifted, or on tick 1 of the next level. A clear, not a gate.
 *
 * `tickCount` is REQUIRED, not optional, for the reason `respawnPlayer`'s `tuning` is: this function
 * cannot ask the world for the clock, and a default would make the freeze quietly inoperative at any
 * call site that forgot one.
 */
export function stepCombat(player: PlayerSim, input: InputSnapshot, tickCount: number): CombatStep {
  const held = frozen(player, tickCount);

  // 1. i-frames. A FROZEN body does not spend them — see the ruling above.
  if (!held) {
    player.iFrameCounter = advanceWindow(player.iFrameCounter, IFRAME_TICKS);
  }

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
  //
  //    Phase 9: the whole block — the advance AND the expiry test — is skipped while the body is
  //    frozen. The expiry test cannot be left running on its own: it reads the counter this branch
  //    advances, so a live test over a frozen counter would simply never fire.
  if (isCombatState(player.state) && !held) {
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
    // The swing's identity, STORED. `playerAttack.ts` used to derive it as
    // `tickCount - combatCounter`, which stops being unique the moment one of the two freezes and
    // the other does not — see `PlayerSim.swingStartTick`. This is the only site that starts a
    // swing, so it is the only site that has to write it.
    player.swingStartTick = tickCount;
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
 * `HURT_LOCK_TICKS`, `movementLocked` and `knockbackSettling` live in `movementLock.ts`.
 *
 * The same split, for the same reason and with the same one-way dependency, that moved the frozen
 * timings to `combatTiming.ts` in Phase 4: this file is the combat STATE MACHINE, that one is the
 * LOCKS derived from it. Re-exported here so the ~20 existing `from './combat'` call sites and
 * `src/sim/index.ts` are untouched — read that file's header before changing either predicate.
 */
export { HURT_LOCK_TICKS, knockbackSettling, movementLocked } from './movementLock';
