import { createScavenger } from '../sim/enemies';
import { devSeam } from '../debug/devSeam';
import { createSentry } from '../sim/enemySentry';
import type { World } from '../sim/types';

/**
 * Dev-only enemy spawner. Puts enemies on screen that combat itself cannot produce, for two QA
 * criteria: 5.11 (worst-case enemy count) and 5.7 (a live enemy health bar at a low,
 * non-combat-reachable hp).
 *
 * Lives in `src/scenes/`, not `src/sim/`: `src/sim/` is engine-free and reaches no test fixture that
 * needs a dev cheat, and the enemy modules there have their own reasons not to grow a spawn-N API.
 *
 * `hp` is set AFTER construction, never passed to `createScavenger`. `createScavenger({ hp })` sets
 * `maxHp: hp` too (`src/sim/enemyScavenger.ts`), and `healthBarFillWidth` draws a FULL bar once
 * `hp >= maxHp` (`src/render/enemyHealthBar.ts`) — so a "2 HP" enemy built that way would render a
 * full bar and prove nothing about criterion 5.7. Constructing at the normal 60 hp default and then
 * overwriting `hp` keeps `maxHp` at 60, so a low `hp` is visibly low.
 */
export function spawnDevEnemies(
  world: World,
  opts: { count: number; hp: number; x: number; y: number },
): void {
  devSeam('__DEVSEAM_devSpawn_spawnDevEnemies__');
  for (let i = 0; i < opts.count; i++) {
    const scavenger = createScavenger({
      x: opts.x + i * 40,
      y: opts.y,
      patrolMin: opts.x - 4000,
      patrolMax: opts.x + 4000,
    });
    scavenger.hp = opts.hp;
    world.enemies.scavengers.push(scavenger);
  }
}

/**
 * 🔴 **The 5.11 fleet, and why it needed its own function.**
 *
 * `spawnDevEnemies` laid `count` scavengers out at `x + i * 40` **sim** pixels from an offset of
 * 200. The camera draws at `RENDER_SCALE` 6 into a 1920 px view, so the visible half-width is
 * **160 sim px** — the whole fleet started 40 sim px beyond the right edge and ran 760 sim px
 * further. **Not one of the twenty was ever on screen**, so the criterion that says
 * *"frame budget under worst-case enemy count"* was measuring a frame that drew none of them: the
 * sim stepped 20 bodies, the renderer culled 20 bodies, and the number came back reassuring.
 * Vault 9.4 — cheap because it was not really doing it.
 *
 * Three things this fixes, all of them things 5.11 claims to cover:
 *
 *  - **On screen.** The fleet is spread symmetrically about the player across `spreadSimPx`, so
 *    every body is inside the view and every one is actually drawn, animated and bar-rendered.
 *  - **Both kinds.** It was scavengers only. A sentry is a different sprite, a different animation
 *    and — once it can see the player — a different code path, so a fleet of one kind exercised
 *    half the renderer.
 *  - **Projectiles.** Sentries placed inside their own firing radius of the player put real bolts
 *    in flight for the whole sample window, which is the only way the projectile draw path appears
 *    in the measurement at all.
 *
 * The kinds alternate rather than being grouped, so a bug that only draws a contiguous prefix
 * cannot leave one kind entirely absent and still hit the count.
 *
 * `y` is the player's own foot line for both kinds: an enemy is never gravity-simulated
 * (`docs/prd/phase-05-combat.md` — enemy physics is explicitly out of scope), so placing them level
 * with the player is the only placement that does not depend on terrain under the spawn point.
 */
export function spawnDevFleet(
  world: World,
  opts: { count: number; hp: number; x: number; y: number; spreadSimPx: number },
): void {
  devSeam('__DEVSEAM_devSpawn_spawnDevFleet__');
  const { count, hp, x, y, spreadSimPx } = opts;
  // `count - 1` intervals across the span, so the first and last body land exactly on the edges of
  // the spread rather than the last one falling short by one step.
  const step = count > 1 ? spreadSimPx / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    const at = x - spreadSimPx / 2 + i * step;
    if (i % 2 === 0) {
      const scavenger = createScavenger({
        x: at,
        y,
        patrolMin: at - 4000,
        patrolMax: at + 4000,
      });
      scavenger.hp = hp;
      world.enemies.scavengers.push(scavenger);
    } else {
      // Default radius, so every one of them can see a player standing in the middle of the spread
      // and the projectile path is exercised. `cooldownCounter` starts ready (`createSentry`), so
      // the first frames of the sample window already have bolts in them.
      const sentry = createSentry({ x: at, y });
      sentry.hp = hp;
      sentry.maxHp = hp;
      world.enemies.sentries.push(sentry);
    }
  }
}
