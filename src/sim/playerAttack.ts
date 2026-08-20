/**
 * The player's swing resolving against enemies — the other direction of step 9b.
 *
 * `worldDamage.ts` is everything that hurts the player. This is the reverse, and it lives in its
 * own module for the same reason that one does: the tick stays a numbered list, and the work sits
 * beside the things it works on.
 *
 * ## Once per target per swing, without giving anything an id
 *
 * `ATTACK.active` is more than one tick, so a hitbox tested each tick would cost a standing target
 * four hits per press — which makes the damage number meaningless and the `active` knob a damage
 * multiplier *(Codex C4 on criterion 5.5)*.
 *
 * Each enemy therefore records the swing that last hit it, and a swing is identified by **the tick
 * it started**. Two swings cannot begin on the same tick, so the identity is unique without an id
 * generator and without a set allocated per swing. One number per enemy *(vault 5.1)*.
 *
 * 🔴 **That tick used to be DERIVED, as `tickCount - combatCounter`, and Phase 9 had to store it.**
 * The derivation is unique only while both numbers advance together. Hit-stop freezes
 * `combatCounter` at step 4b while `tickCount` keeps rising at step 14 — so the derived identity
 * changed on **every frozen tick**, `lastHitSwing` never matched, and the same enemy would have been
 * struck once per tick of its own hit-stop: a damage multiplier wearing a freeze's clothes. It is
 * now `player.swingStartTick`, written by the one site that starts a swing (`stepCombat`), and this
 * is what `hitstop.test.ts`'s "one swing costs one target one hit" regression watches. `lastHitSwing`
 * keeps its meaning and its `-1` sentinel exactly as before.
 *
 * ## The hitbox is authored local, and mirrored by exactly one function
 *
 * `ATTACK_BOX` is in local space — `+x` forward, `+y` up from the feet — and reaches world space
 * only through `toWorld`, which applies `facing` *(vault 2.10)*. That is what makes "a target behind
 * the player is not hit" true by construction rather than by an `if` somebody has to remember.
 */

import { ATTACK, hitWindowOpen } from './combat';
import { SCAVENGER_BOX, SENTRY_BOX, type Scavenger, type Sentry } from './enemies';
import { toWorld } from './player';
import { freezePair, type Freezable } from './hitstop';
import type { LocalBox, Rect, World } from './types';

/**
 * What one connected swing takes off an enemy.
 *
 * 20 kills the 40 hp sentry in two and the 60 hp scavenger in three — the criterion-5.10 invariant
 * (the static threat dies faster than the one that chases you) expressed as a number rather than
 * asserted about one.
 */
export const PLAYER_ATTACK_DAMAGE = 20;

/**
 * The swing's reach, authored local like `PLAYER_BOX`.
 *
 * `x: 11` starts it exactly at the player's own forward edge — `PLAYER_BOX` is 22 wide centred on
 * the feet — so the box is reach BEYOND the body rather than overlapping it. 26 local units is
 * 156 px drawn at `RENDER_SCALE` 6, a little over one tile: enough to hit something standing next
 * to you, not enough to clear a gap. `y: 12, h: 24` puts it at chest height on a 48-unit body, so
 * a swing does not connect with something lying at your feet or floating overhead.
 */
export const ATTACK_BOX: LocalBox = { x: 11, y: 12, w: 26, h: 24 };

/**
 * Every enemy carries this: the start tick of the swing that last connected, and its hit-stop.
 *
 * `Freezable` is extended rather than restated for the reason `hitstop.ts` gives for being
 * structural at all — there is no common entity type here, and two copies of two integers is where
 * one of them gets forgotten on the next creature.
 */
export interface Hittable extends Freezable {
  x: number;
  y: number;
  hp: number;
  lastHitSwing: number;
}

function bodyOf(enemy: Hittable, box: LocalBox, scale: number): Rect {
  // Enemies do not mirror their own bodies — a symmetric box has nothing to mirror, and passing
  // their facing here would make a patroller's hurtbox jump sides at every turn.
  return toWorld(box, enemy.x, enemy.y, 1, scale);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * What one tick of the player's swing did — hits landed and enemies killed.
 *
 * **`kills` implies `hits`, always.** An enemy taken to zero was struck to get there, and `strike()`
 * counts that blow like any other. Phase 7's criterion 7.2 sums both cues on the same tick because
 * of this, and the Codex plan review (F1) caught a worst-case stack that had omitted the hit.
 */
export interface PlayerAttackResult {
  /** Enemies whose hp this swing reduced on this tick. */
  hits: number;
  /** Of those, how many reached zero hp on this tick — Phase 7's kill cue. */
  kills: number;
}

/**
 * Resolve the player's live hitbox against every enemy.
 *
 * Returns what the swing did this tick, so the caller can turn it into an event rather than
 * re-deriving one by comparing hp across ticks *(vault 2.5 — edges are emitted, never reconstructed)*.
 * A kill in particular has **no** state marker to fall back on: enemies carry no death tick and no
 * `alive` flag, and `enemyTurn` only notices `hp <= 0` on the FOLLOWING tick.
 *
 * Runs BEFORE the enemies' own damage in step 9b, so a killing blow lands first and a corpse cannot
 * also hurt you on the tick it dies. That ordering is a deliberate choice — trading hits with
 * something you just killed reads as the game cheating.
 *
 * **It is currently UNGATED, and that is recorded rather than hidden** *(C11)*. Swapping the two
 * calls fails no test, and the reason is not a missing test but a masked effect: to be in contact
 * range at all, the player must already have taken contact damage, which grants `IFRAME_TICKS` 45
 * of invulnerability — longer than the whole 20-tick swing. So on the tick the enemy dies the
 * player is invulnerable either way, and no fixture can tell the orderings apart without
 * contriving one. Writing a test that only passes because of how it was posed would be worse than
 * saying this.
 *
 * It stops being masked the moment `IFRAME_TICKS` drops below `attackTotalTicks(ATTACK)`, which is
 * a plausible retune. If that happens, the case becomes reachable and needs a gate.
 *
 * ## A frozen swing's hitbox can CHAIN the freeze, and that is known and uncapped
 *
 * This function is ungated by hit-stop, and `combatCounter` is frozen — so the hitbox stays live for
 * every frozen tick, and a *second* enemy that walks into reach during a freeze is struck and
 * re-arms `freezePair`. Each enemy is still hit exactly once per swing (`lastHitSwing`), and level
 * layout bounds how many bodies can enter reach inside 4-9 ticks, so the chain is short in practice.
 * Capping it is a design decision about how a crowd should feel, not a defect, and it is out of
 * Phase 9's scope: recorded in the QA log and deliberately left uncapped rather than missed.
 */
export function applyPlayerAttack(world: World): PlayerAttackResult {
  const { player } = world;
  if (player.state !== 'attack') {
    return { hits: 0, kills: 0 };
  }
  /**
   * 🔴 **The sentinel collision, made LOUD** — `swingStartTick` and every enemy's `lastHitSwing`
   * share `-1`, so a fixture that sets `state = 'attack'` by hand without setting the swing identity
   * matches the untouched sentinel on every enemy and the whole swing passes silently through all of
   * them. `tick-damage-order.test.ts` was written that way and had to be patched when the identity
   * stopped being derived; nothing told it, and the test would have gone on reporting green while
   * asserting nothing. A fixture trap that fails silently is the one that costs a session.
   *
   * Thrown rather than defaulted, in the shape of `windows.ts`'s `assertTicks`: this is an
   * unrepresentable state, not a case to tolerate. `stepCombat` is the only site that starts a swing
   * and it always writes this, so no live code path can reach here.
   */
  if (player.swingStartTick < 0) {
    throw new Error(
      `applyPlayerAttack: player.state is 'attack' but swingStartTick is ` +
        `${player.swingStartTick}. It is written by stepCombat when a swing starts; a fixture that ` +
        `sets state by hand must set it too, or it matches every enemy's lastHitSwing sentinel and ` +
        `the swing hits nothing.`,
    );
  }
  if (!hitWindowOpen(player.combatCounter, ATTACK)) {
    return { hits: 0, kills: 0 };
  }

  const swing = player.swingStartTick;
  const reach = toWorld(ATTACK_BOX, player.x, player.y, player.facing, world.scale);
  let hits = 0;
  let kills = 0;

  const strike = (enemy: Hittable, box: LocalBox): void => {
    if (enemy.hp <= 0 || enemy.lastHitSwing === swing) {
      return;
    }
    if (!overlaps(reach, bodyOf(enemy, box, world.scale))) {
      return;
    }
    enemy.lastHitSwing = swing;
    enemy.hp = Math.max(0, enemy.hp - PLAYER_ATTACK_DAMAGE);
    // 🔴 **Hit-stop, armed here — step 9b, both bodies, one call** *(Phase 9)*. A kill reads heavier
    // than a graze, so the class is decided off the hp that was just written rather than off the one
    // this closure was entered with. `freezePair` rather than two `freeze()` calls: two calls is two
    // places to pass the class, and the day they disagree the attacker recovers before its victim.
    // Arming is a WRITE, not a gate — it does not disturb 9b's documented ordering guarantee that
    // the player's own swing resolves before anything can trade a hit back.
    freezePair(player, enemy, enemy.hp <= 0 ? 'lethal' : 'light', world.tickCount);
    hits += 1;
    // The `hp > 0` guard at the top of this closure means a corpse is never struck twice, so this
    // counts the transition to zero rather than the state of being at zero.
    if (enemy.hp === 0) {
      kills += 1;
    }
  };

  for (const sentry of world.enemies.sentries as Sentry[]) {
    strike(sentry, SENTRY_BOX);
  }
  for (const scavenger of world.enemies.scavengers as Scavenger[]) {
    strike(scavenger, SCAVENGER_BOX);
  }

  return { hits, kills };
}
