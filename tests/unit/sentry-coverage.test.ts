import { describe, expect, it } from 'vitest';
import { fireProjectile, projectileHit, stepProjectiles } from '../../src/sim/projectiles';
import { SENTRY } from '../../src/sim/enemies';
import { PLAYER_BOX } from '../../src/sim/player';
import { RENDER_SCALE } from '../../src/game/constants';
import { SENTRY_MUZZLE } from '../../src/sim/enemyPlacement';
import type { Rect } from '../../src/sim/types';

/**
 * # What the wall-stop cost the shipped sentries (S.3 gate owner, brief 2, finding 1)
 *
 * The adversarial code-review brief called item 1.2's fix a **BLOCKER**: *"the fix makes every
 * shipped sentry unable to hit a player standing below it … a playthrough-visible combat regression
 * in every level."* Its arithmetic was hand-done from `SENTRY_MUZZLE`, `RENDER_SCALE`, the `.tmj`
 * geometry and `SENTRY.radius`.
 *
 * **Re-verified locally rather than accepted** *(a subagent's summary is a claim)*, and the result
 * is a third finding rather than either of the two on offer:
 *
 * | | brief 2's claim | measured |
 * |---|---|---|
 * | sentries affected | *"every"* (9 of 9) | **3 of 9** |
 * | level-01 sentry position | `(5616, 1344)` | **`(5472, 1152)`** — not a position in the shipped file |
 * | standable spots lost | implied total | **13 of 96** |
 *
 * The brief's coordinates are not in `level-01.tmj`, so its worked example describes a level that
 * does not ship. **The phenomenon is real anyway**, which is why this file exists: 3 sentries do lose
 * downward shots, and nothing measured that before the fix landed.
 *
 * ## Why this is NOT recorded as a defect
 *
 * Every lost shot has a large `dy` — the player is on a **lower ledge**, with the sentry's own
 * platform between them. Before the fix those bolts travelled **through solid rock**. So the loss is
 * the fix working exactly as specified, not a regression in it.
 *
 * ⚠️ **Whether the levels were authored assuming those shots landed is a different question, and it
 * is a `play`-owned one** — it cannot be settled from a number. Flagged for playtest, recorded here
 * rather than closed.
 *
 * ## What this pins
 *
 * The measured coverage, per sentry, as a **floor**. A level edit that walls a sentry in, or a change
 * to `stepProjectiles`, `SENTRY_MUZZLE` or `SENTRY.radius` that quietly guts its reach, reds here
 * with the sentry named.
 *
 * ⚠️ **A red is not fixed by lowering a number.** It means the sentry's coverage actually shrank, and
 * the level or the constant is what needs to change.
 *
 * **The mutation this file names:** make `stepProjectiles` clip at `t = 0` (every bolt dies at the
 * muzzle). Coverage goes to zero everywhere and every sentry reds.
 */

/**
 * ⚠️ vitest caches `?raw` glob results, and this project has already had a landed `.tmj` mutation
 * report green because of it. Touch this file too when re-running after a level edit.
 */
const LEVELS = import.meta.glob('../../public/assets/levels/*.tmj', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

interface TiledObject {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: { name: string; value: unknown }[];
}

function objectsOf(raw: string): TiledObject[] {
  const map = JSON.parse(raw) as { layers: { objects?: TiledObject[] }[] };
  return map.layers.flatMap((layer) => layer.objects ?? []);
}

function solidsOf(objs: TiledObject[]): Rect[] {
  return objs
    .filter((o) => (o.properties ?? []).some((p) => p.name === 'solid' && p.value === true))
    .map((o) => ({ x: o.x ?? 0, y: o.y ?? 0, w: o.width ?? 0, h: o.height ?? 0 }));
}

const PLAYER_W = PLAYER_BOX.w * RENDER_SCALE;
const PLAYER_H = PLAYER_BOX.h * RENDER_SCALE;
/** One sample per grid column along a surface, offset half a tile so a sample is never on a seam. */
const STEP = 96;

interface Coverage {
  key: string;
  sampled: number;
  reachable: number;
}

/** Every standable spot within firing radius, and whether a bolt actually arrives. */
function coverageOf(raw: string, name: string): Coverage[] {
  const objs = objectsOf(raw);
  const solids = solidsOf(objs);
  const sentries = objs.filter((o) => JSON.stringify(o).toLowerCase().includes('sentry'));
  const out: Coverage[] = [];

  for (const s of sentries) {
    const feetX = s.x ?? 0;
    const feetY = s.y ?? 0;
    const muzzleX = feetX + SENTRY_MUZZLE.x * RENDER_SCALE;
    const muzzleY = feetY - SENTRY_MUZZLE.y * RENDER_SCALE;
    let sampled = 0;
    let reachable = 0;

    for (const solid of solids) {
      for (let px = solid.x + STEP / 2; px < solid.x + solid.w; px += STEP) {
        const chestY = solid.y - PLAYER_H / 2;
        const dist = Math.hypot(px - muzzleX, chestY - muzzleY);
        // Outside the sentry's own firing radius it would never shoot; inside its own body the
        // question is meaningless.
        if (dist > SENTRY.radius || dist < 40) continue;
        sampled += 1;

        const box: Rect = { x: px - PLAYER_W / 2, y: solid.y - PLAYER_H, w: PLAYER_W, h: PLAYER_H };
        let shots = [fireProjectile(muzzleX, muzzleY, px, chestY, 9, 9)];
        for (let i = 0; i < 300 && shots.length > 0; i += 1) {
          shots = stepProjectiles(shots, 20000, 6000, solids);
          if (projectileHit(shots, box) !== null) {
            reachable += 1;
            break;
          }
          if (shots.length > 0 && shots[0]!.spent) break;
        }
      }
    }
    out.push({ key: `${name} sentry@(${feetX},${feetY})`, sampled, reachable });
  }
  return out;
}

/**
 * Measured 2026-08-23, after the wall-stop landed. Reachable count per sentry, in file order.
 *
 * Asserted as a **floor**, not an equality: the point is to notice erosion, and pinning it exactly
 * would red on any level edit at all — the mistake `phase-04`'s table made.
 */
const FLOOR: Record<string, number> = {
  'level-01.tmj sentry@(5472,1152)': 7,
  'level-02.tmj sentry@(5664,1440)': 15,
  'level-03.tmj sentry@(5088,960)': 7,
  'level-03.tmj sentry@(7584,960)': 7,
  'level-04.tmj sentry@(4896,960)': 7,
  'level-04.tmj sentry@(8544,960)': 7,
  'level-05.tmj sentry@(4704,1056)': 7,
  'level-05.tmj sentry@(8160,1056)': 7,
  'level-05.tmj sentry@(14304,1440)': 9,
};

describe('shipped sentries still cover the ground they were placed to cover', () => {
  const all = Object.entries(LEVELS).flatMap(([path, raw]) =>
    coverageOf(raw, path.split('/').pop() ?? path),
  );

  it('reads all five levels and finds all nine sentries — an empty glob would be vacuous', () => {
    expect(Object.keys(LEVELS).length).toBe(5);
    expect(all.length, 'no sentries found, so every assertion below is about nothing').toBe(9);
  });

  it('every sentry has standable ground in range — otherwise "reachable" means nothing', () => {
    // The non-vacuity half. A sentry with zero samples would trivially satisfy its floor.
    for (const c of all) {
      expect(c.sampled, `${c.key} has no standable spot inside its own firing radius`).toBeGreaterThan(
        0,
      );
    }
  });

  for (const key of Object.keys(FLOOR)) {
    it(`${key} still reaches at least ${FLOOR[key]} standable spots`, () => {
      const c = all.find((x) => x.key === key);
      expect(c, `${key} is no longer in the shipped levels — update FLOOR deliberately`).toBeDefined();
      expect(
        c!.reachable,
        `${key} reaches ${c!.reachable} of ${c!.sampled} standable spots, below the ${FLOOR[key]} ` +
          `measured on 2026-08-23. Its coverage SHRANK. Do NOT lower this number — either the level ` +
          `geometry walled the sentry in, or a change to stepProjectiles / SENTRY_MUZZLE / ` +
          `SENTRY.radius gutted its reach.`,
      ).toBeGreaterThanOrEqual(FLOOR[key]!);
    });
  }

  it('records the three sentries that lost downward shots to the wall-stop', () => {
    // Not a failure — the lost shots travelled through solid rock before item 1.2. Asserted so the
    // number stays visible: if a later change makes it four, that is worth a look.
    const partial = all.filter((c) => c.reachable < c.sampled);
    expect(
      partial.length,
      `sentries with blocked ground: ${partial.map((c) => `${c.key} ${c.reachable}/${c.sampled}`).join(', ')}`,
    ).toBe(3);
  });
});
