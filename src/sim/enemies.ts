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
 *
 * ## This file is a barrel
 *
 * The implementation lives in `enemySentry.ts` (brass-sentry), `enemyScavenger.ts`
 * (rust-scavenger), `enemyGeometry.ts` (the `withinRadius` predicate both share) and
 * `enemyPlacement.ts` (spawning, bodies, and the scavenger overlap test). This file keeps only the
 * roster below and re-exports the rest, so nothing that imports from `./enemies` needs to change.
 */

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

export * from './enemySentry';
export * from './enemyScavenger';
export * from './enemyGeometry';
export * from './enemyPlacement';
