/**
 * The two enemies — `brass-sentry` and `rust-scavenger`.
 *
 * ## Episodes, not per-tick decisions
 *
 * Vault **5.1**, blocker: *a per-tick probability is not a behaviour — commit to episodes; one
 * counter plus one flag, because two counters admit the unrepresentable state.*
 *
 * Both enemies here are **fully deterministic**. Neither reads the RNG at all, which is stronger
 * than committing a random roll: there is no distribution to get wrong, and no branch that a seed
 * might never visit *(vault 5.5 — a measurement of exactly 0 or 100 % means asking whether the
 * branch ran)*. If a future enemy needs variety it reads `world.tickRoll`, sampled once at step 1,
 * mixed with the enemy index — it must never pull from the stream itself, which would desync every
 * other consumer of that tick.
 *
 * ## Determinism is not commitment
 *
 * The Phase 5 Codex plan review (C9) caught the gap: a deterministic enemy whose *detection* is
 * recomputed every tick still flaps. Stand exactly on the radius and it flips patrol↔chase every
 * tick — and because Phaser restarts a looping animation on every state change, that is the frame-0
 * bug arriving through the AI instead of through `play()`. So detection commits two ways:
 *
 *   - **Hysteresis.** Entering a chase needs `detectRadius`; leaving needs the player past a
 *     strictly larger `releaseRadius`. One threshold cannot flap; two can only flap if the player
 *     crosses the whole gap between them.
 *   - **A commitment floor.** A chase lasts at least `CHASE_COMMIT_TICKS` regardless.
 *
 * `enemy-ai.test.ts` gates this with a flap test rather than by reading the structure, because the
 * structure looks correct either way.
 */

import { toWorld } from './player';
import type { LocalBox, Rect } from './types';
import { windowOpen } from './windows';

/**
 * The roster, and the only list of it.
 *
 * `src/game/tilemap.ts` validates every `.tmj` enemy slug against this, so a slug a level can name
 * is exactly a slug this module can build. Keeping the list beside the constructors — rather than
 * in the parser, or in a scene — is what makes that true by construction: adding an enemy without
 * a `createX` is a typecheck error at the switch that builds them, not a level that boots one
 * enemy short.
 */
export const ENEMY_SLUGS = ['brass-sentry', 'rust-scavenger'] as const;
export type EnemySlug = (typeof ENEMY_SLUGS)[number];

/** Where the player is, as far as an enemy is concerned. */
export interface Sighting {
  playerX: number;
  playerY: number;
}

/* ------------------------------------------------------------------ *
 * brass-sentry — static, radial detection, fixed cadence.
 * ------------------------------------------------------------------ */

/**
 * Sentry defaults.
 *
 * `radius` 640 px is two thirds of the 1920 px viewport width, so the sentry's threat covers a
 * readable share of the screen without being offscreen-unfair — you can see it before it can
 * reach you. `cooldown` 90 ticks (1.5 s) is long enough to walk through the radius between shots,
 * which is what makes the projectile's travel time a dodge rather than a tax.
 */
export const SENTRY = {
  radius: 640,
  cooldown: 90,
  damage: 10,
  projectileSpeed: 9,
} as const;

export interface Sentry {
  x: number;
  y: number;
  radius: number;
  cooldown: number;
  /** ONE counter (vault 5.1). Ticks since the last shot; `cooldown` means ready. */
  cooldownCounter: number;
  hp: number;
  maxHp: number;
  /**
   * The start tick of the swing that last connected, or `-1`. See `playerAttack.ts`: this is how
   * one press costs one hit even though the hitbox is live for several ticks, without giving
   * anything an id.
   */
  lastHitSwing: number;
}

export interface SentryOptions {
  x: number;
  y: number;
  radius?: number;
  cooldown?: number;
  hp?: number;
}

export function createSentry(options: SentryOptions): Sentry {
  const radius = options.radius ?? SENTRY.radius;
  const cooldown = options.cooldown ?? SENTRY.cooldown;
  const hp = options.hp ?? 40;
  return {
    x: options.x,
    y: options.y,
    radius,
    cooldown,
    // Starts ready, so the first player who walks into range is shot at rather than granted a free
    // cooldown's grace — otherwise the radius reads as larger than it is.
    cooldownCounter: cooldown,
    hp,
    maxHp: hp,
    lastHitSwing: -1,
  };
}

/** Is the player inside this sentry's radius? The one definition; the tests import it too. */
export function sentrySees(sentry: Sentry, at: Sighting): boolean {
  return withinRadius(sentry.x, sentry.y, at, sentry.radius);
}

export interface SentryStep {
  fired: boolean;
}

/**
 * One tick of sentry behaviour.
 *
 * The cadence is a saturating counter, so a sentry that has been idle for a minute fires on the
 * first tick the player enters the radius and then every `cooldown` ticks — not "whenever a roll
 * succeeds", and not "instantly, repeatedly".
 */
export function stepSentry(sentry: Sentry, at: Sighting): SentryStep {
  if (windowOpen(sentry.cooldownCounter, sentry.cooldown)) {
    sentry.cooldownCounter += 1;
  }
  if (!sentrySees(sentry, at)) {
    return { fired: false };
  }
  if (sentry.cooldownCounter < sentry.cooldown) {
    return { fired: false };
  }
  sentry.cooldownCounter = 0;
  return { fired: true };
}

/* ------------------------------------------------------------------ *
 * rust-scavenger — patrols, detects with hysteresis, chases.
 * ------------------------------------------------------------------ */

/**
 * A chase lasts at least this long once entered, whatever the player does.
 *
 * 30 ticks, half a second. Short enough that it is not a punish for the player breaking line of
 * sight properly; long enough that a boundary-straddling player cannot make the scavenger stutter.
 */
export const CHASE_COMMIT_TICKS = 30;

/**
 * Scavenger defaults.
 *
 * `chaseSpeed` 8 px/tick sits between Phase 2's `walkMax` 5.54 and `runMax` 12.0 — **deliberately
 * escapable.** A chaser faster than the player's run means fleeing is never an option, and with no
 * stamina system that is not tension, it is a tax. `releaseRadius` is strictly greater than
 * `detectRadius`; that gap IS the hysteresis and `enemy-ai.test.ts` pins the relationship.
 */
export const SCAVENGER = {
  patrolSpeed: 2.5,
  chaseSpeed: 8,
  detectRadius: 480,
  releaseRadius: 720,
  damage: 15,
  contactCooldown: 45,
} as const;

export interface Scavenger {
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
  patrolSpeed: number;
  chaseSpeed: number;
  detectRadius: number;
  releaseRadius: number;
  facing: 1 | -1;
  /** ONE flag (vault 5.1). */
  chasing: boolean;
  /** ONE counter (vault 5.1) — ticks spent in the current chase episode. */
  chaseCounter: number;
  hp: number;
  maxHp: number;
  /** The start tick of the swing that last connected, or `-1`. See `playerAttack.ts`. */
  lastHitSwing: number;
}

export interface ScavengerOptions {
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
  patrolSpeed?: number;
  chaseSpeed?: number;
  detectRadius?: number;
  releaseRadius?: number;
  hp?: number;
}

export function createScavenger(options: ScavengerOptions): Scavenger {
  const hp = options.hp ?? 60;
  return {
    x: options.x,
    y: options.y,
    patrolMin: options.patrolMin,
    patrolMax: options.patrolMax,
    patrolSpeed: options.patrolSpeed ?? SCAVENGER.patrolSpeed,
    chaseSpeed: options.chaseSpeed ?? SCAVENGER.chaseSpeed,
    detectRadius: options.detectRadius ?? SCAVENGER.detectRadius,
    releaseRadius: options.releaseRadius ?? SCAVENGER.releaseRadius,
    facing: 1,
    chasing: false,
    chaseCounter: 0,
    hp,
    maxHp: hp,
    lastHitSwing: -1,
  };
}

/**
 * Should this scavenger be chasing, given where it already is?
 *
 * **Asymmetric on purpose** — that asymmetry is the whole anti-flap mechanism, so it lives in one
 * exported predicate that the sim and the tests both consult *(vault 5.3)* rather than being
 * restated as two inequalities at the call site.
 */
export function detects(scavenger: Scavenger, at: Sighting): boolean {
  const threshold = scavenger.chasing ? scavenger.releaseRadius : scavenger.detectRadius;
  return withinRadius(scavenger.x, scavenger.y, at, threshold);
}

/** One tick of scavenger behaviour. */
export function stepScavenger(scavenger: Scavenger, at: Sighting): void {
  const sees = detects(scavenger, at);

  if (!scavenger.chasing) {
    if (sees) {
      scavenger.chasing = true;
      scavenger.chaseCounter = 0;
    }
  } else {
    scavenger.chaseCounter += 1;
    // The commitment floor is tested BEFORE the sighting, so a chase entered this tick cannot be
    // cancelled by the same tick's geometry.
    if (!windowOpen(scavenger.chaseCounter, CHASE_COMMIT_TICKS) && !sees) {
      scavenger.chasing = false;
      scavenger.chaseCounter = 0;
    }
  }

  if (scavenger.chasing) {
    const dir: 1 | -1 = at.playerX >= scavenger.x ? 1 : -1;
    scavenger.facing = dir;
    scavenger.x += dir * scavenger.chaseSpeed;
    return;
  }

  scavenger.x += scavenger.facing * scavenger.patrolSpeed;
  // Turn AT the bound and clamp to it, so the patrol never drifts outside the strip it was authored
  // with — a scavenger that overshoots by a fraction each lap walks off its own platform.
  if (scavenger.x >= scavenger.patrolMax) {
    scavenger.x = scavenger.patrolMax;
    scavenger.facing = -1;
  } else if (scavenger.x <= scavenger.patrolMin) {
    scavenger.x = scavenger.patrolMin;
    scavenger.facing = 1;
  }
}

/* ------------------------------------------------------------------ *
 * Shared geometry.
 * ------------------------------------------------------------------ */

/**
 * Squared-distance comparison — no `Math.sqrt`.
 *
 * Not a micro-optimisation: `sqrt` returns a float, and comparing a float against an integer radius
 * makes "exactly on the boundary" depend on rounding. Comparing squares keeps the boundary exact,
 * which is precisely the case the flap test parks the player on.
 */
function withinRadius(x: number, y: number, at: Sighting, radius: number): boolean {
  const dx = at.playerX - x;
  const dy = at.playerY - y;
  return dx * dx + dy * dy <= radius * radius;
}

/* ------------------------------------------------------------------ *
 * Placement — turning level data into live entities.
 * ------------------------------------------------------------------ */

/**
 * Where one enemy starts, and how far it may walk.
 *
 * Authored as a Tiled **rectangle** and read by `src/game/tilemap.ts`, which re-exports this type:
 * `x` is the rectangle's horizontal centre, `y` its bottom edge (the feet), and its left and right
 * edges are the patrol beat. A patroller's range is therefore something the designer draws on the
 * platform rather than a pair of numbers typed into a scene, and a static enemy ignores the span.
 *
 * It lives HERE, beside `ENEMY_SLUGS` and the constructors, rather than in the parser — the module
 * that builds an enemy owns the shape that describes one, so a field a level can express is a
 * field the sim can consume.
 */
export interface EnemySpawn {
  slug: EnemySlug;
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
}

/**
 * Every live enemy in a world, kept in one array per type rather than a discriminated union.
 *
 * Two arrays because the two step functions have different signatures and different return values;
 * a union would need narrowing at every call site to say something the array already knows. The
 * render layer builds its own flat list when it needs one.
 */
export interface EnemySet {
  sentries: Sentry[];
  scavengers: Scavenger[];
}

/**
 * Build the live entities for a level's placements.
 *
 * The `never` in the default branch is the point of the function: adding a slug to `ENEMY_SLUGS`
 * without a constructor here is a **typecheck error**, not a level that boots one enemy short.
 */
export function spawnEnemies(spawns: readonly EnemySpawn[]): EnemySet {
  const set: EnemySet = { sentries: [], scavengers: [] };
  for (const spawn of spawns) {
    switch (spawn.slug) {
      case 'brass-sentry':
        set.sentries.push(createSentry({ x: spawn.x, y: spawn.y }));
        break;
      case 'rust-scavenger':
        set.scavengers.push(
          createScavenger({
            x: spawn.x,
            y: spawn.y,
            patrolMin: spawn.patrolMin,
            patrolMax: spawn.patrolMax,
          }),
        );
        break;
      default: {
        const unreachable: never = spawn.slug;
        throw new Error(`spawnEnemies: no constructor for slug ${String(unreachable)}`);
      }
    }
  }
  return set;
}

/* ------------------------------------------------------------------ *
 * Bodies.
 * ------------------------------------------------------------------ */

/**
 * Enemy collision boxes, authored local like `PLAYER_BOX`: `+x` forward, `+y` up from the feet.
 *
 * The heights are the plan's readability decision expressed in the ONE unit the sim uses. At the
 * published `RENDER_SCALE` of 6 they draw as **192 px (2 tiles)** and **240 px (2.5 tiles)** against
 * the player's 288 px (3 tiles) — three distinct silhouette heights, so the two enemies separate
 * from the player and from each other at true sprite size before any colour does.
 *
 * They are NOT read from the `.tmj`: an enemy rectangle there declares the patrol beat, which is a
 * level-design number, while the body is a character-design one. Conflating them would make a
 * longer patrol produce a wider enemy.
 */
export const SENTRY_BOX: LocalBox = { x: -8, y: 0, w: 16, h: 32 };
export const SCAVENGER_BOX: LocalBox = { x: -10, y: 0, w: 20, h: 40 };

/**
 * Does the player's world box touch this scavenger's?
 *
 * Goes through `toWorld` — THE single local→world conversion (vault 2.10) — rather than doing the
 * multiply here. A second conversion is how a hitbox ends up mirrored on one axis only.
 */
export function overlapsScavenger(scavenger: Scavenger, playerBox: Rect, scale: number): boolean {
  const body = toWorld(SCAVENGER_BOX, scavenger.x, scavenger.y, scavenger.facing, scale);
  return (
    playerBox.x < body.x + body.w &&
    playerBox.x + playerBox.w > body.x &&
    playerBox.y < body.y + body.h &&
    playerBox.y + playerBox.h > body.y
  );
}
