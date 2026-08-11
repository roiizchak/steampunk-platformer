import { createScavenger } from '../sim/enemies';
import type { World } from '../sim/types';

/**
 * Dev-only enemy spawner. Puts scavengers on screen that combat itself cannot produce, for two QA
 * criteria: 5.11 (worst-case enemy count, counted visible sprites) and 5.7 (a live enemy health bar
 * at a low, non-combat-reachable hp).
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
