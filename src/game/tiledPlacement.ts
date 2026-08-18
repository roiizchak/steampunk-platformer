import { RENDER_SCALE } from './constants';
import { isEnemyObject, isHazardObject, stringProperty, type TiledObject } from './tiledObjects';
import { isGearObject } from './tiledEntities';
import { FOOT_TOLERANCE_PX } from '../sim/enemyGeometry';
import { SCAVENGER_BOX, SENTRY_BOX } from '../sim/enemyPlacement';
import { GEAR_BOX } from '../sim/pickups';
import type { Rect } from '../sim/types';

/* ------------------------------------------------------------------ *
 * Placement legality — what may NOT share space with an enemy.
 * ------------------------------------------------------------------ */

/**
 * The rules that say an authored level puts nothing *inside* an enemy.
 *
 * ## Why this exists
 *
 * The user played the shipped Phase 8 build and reported two things a screenshot showed instantly
 * and nothing in the suite could see: **a sentry standing in a spike run**, and **gears sitting
 * inside an enemy's body**. Measured against the shipped bytes, four of the five levels had one or
 * both — every level from 03 puts the summit spike and the summit gear on the same summit a sentry
 * patrols, so the defect was systematic rather than a slip.
 *
 * Nothing refused it. `describeEnemyProblem` checks that an enemy has *ground* under both ends of
 * its beat; `describeGearProblem` checks a gear is not buried in a *solid*. **No rule anywhere
 * compared an enemy against a hazard, a gear, or a wall** — the only cross-object rule in the whole
 * parser was goal-versus-spawn.
 *
 * ## Three decisions worth stating
 *
 * **1. The BODY, not the patrol rectangle.** An enemy's `.tmj` rectangle declares its patrol beat,
 * which is a level-design number; the body is a character-design one and comes from `SENTRY_BOX` /
 * `SCAVENGER_BOX` *(see `enemyPlacement.ts` — conflating them would make a longer patrol produce a
 * wider enemy)*. A sentry's beat is 480 px wide and its body 96 px, so testing the rectangle would
 * condemn five times the space the creature actually occupies and force the levels to be rebuilt
 * around a number that means nothing on screen.
 *
 * **2. Body-vs-body for gears, never point-in-body.** A gear is authored as a POINT but plays as
 * `GEAR_BOX` — 12 local units, **72 x 72 world px**. Testing the point lets a gear centre sit just
 * outside the enemy while the drawn, collectable gear is still inside it. That exact blindness is
 * already on the record against the Phase 6 gear-burial check, which misses a gear on the seam
 * between two floor rects, and whose disposition reads *"Phase 8 owns it"*. It does now.
 *
 * **3. The beat is SWEPT.** A scavenger walks its whole beat, so a spike halfway along it is as
 * real as one under its spawn. The swept box is the union of the body at `patrolMin` and at
 * `patrolMax` — which for a sentry, whose beat is ignored by `createSentry`, is deliberately still
 * the swept span: a level that declares a beat it does not walk has authored the wrong rectangle,
 * and refusing that is cheaper than explaining it.
 *
 * ## The vertical test is STRICT, and that is what lets an enemy stand somewhere
 *
 * Its feet sit exactly on the top edge of the floor it stands on, so `feet > solid.y` is false for
 * that floor and the ground can never read as an obstruction. Identical to `blockedAt` in
 * `enemyGeometry.ts`, on purpose: the gate that refuses a level and the sim that walks it must not
 * disagree about what "inside" means *(vault 5.3)*.
 *
 * They do ask different questions, and that is not a contradiction. This asks *"is the authored
 * placement clean?"* over the whole beat. `blockedAt` asks *"may this one step proceed?"* and is
 * deliberately a **newly-entered** test, so a body that somehow starts inside geometry can still
 * walk out of it rather than being frozen at boot.
 */
export function describePlacementProblem(
  objects: TiledObject[],
  solidObjects: TiledObject[],
): string | null {
  // Filtered here rather than at the call site: the rules that need these three sets are the ones
  // in this file, and `tilemap.ts` was already the longest file in the project.
  const enemyObjects = objects.filter(isEnemyObject);
  const hazardObjects = objects.filter(isHazardObject);
  const gearObjects = objects.filter(isGearObject);
  // Same four-field read `tilemap.ts` does; every cast is discharged by the hazard rules,
  // which run before this.
  const asRect = (o: TiledObject): Rect => ({
    x: o.x as number,
    y: o.y as number,
    w: o.width as number,
    h: o.height as number,
  });
  const hazards = hazardObjects.map(asRect);
  const solids = solidObjects.map(asRect);
  const gears = gearObjects.map((gear) => ({
    x: (gear.x as number) + GEAR_BOX.x * RENDER_SCALE,
    y: (gear.y as number) + GEAR_BOX.y * RENDER_SCALE,
    w: GEAR_BOX.w * RENDER_SCALE,
    h: GEAR_BOX.h * RENDER_SCALE,
  }));

  for (const [index, enemy] of enemyObjects.entries()) {
    const slug = stringProperty(enemy, 'enemy');
    // Every field read below is already discharged by `describeEnemyProblem`, which runs first.
    // 🔴 Exhaustive, like `spawnEnemies`'s `never` default two files over. An inline ternary gave a
    // third slug the scavenger's 120x240 body silently, so the gate would validate the wrong shape
    // for the one enemy nobody had checked yet.
    const box =
      slug === 'brass-sentry' ? SENTRY_BOX : slug === 'rust-scavenger' ? SCAVENGER_BOX : null;
    if (box === null) {
      // `describeEnemyProblem` runs first and refuses an unknown slug, so this is unreachable today
      // and is here so that adding a slug without a body is a visible failure rather than a guess.
      return `${`enemy #${index}`} has slug \`${String(slug)}\`, which has no body box in this gate`;
    }
    const halfWidth = (box.w / 2) * RENDER_SCALE;
    const feet = (enemy.y as number) + (enemy.height as number);
    // The box stops `FOOT_TOLERANCE_PX` short of the sole, for the reason that constant records:
    // every shipped enemy stands with EXACTLY zero separation from its floor, so without this a
    // one-pixel Element Editor nudge refuses the level — and refuses it with a message about the
    // wall veto, which would not have stopped that body at all.
    const swept: Rect = {
      x: (enemy.x as number) - halfWidth,
      y: feet - box.h * RENDER_SCALE,
      w: (enemy.width as number) + halfWidth * 2,
      h: box.h * RENDER_SCALE - FOOT_TOLERANCE_PX,
    };

    const label = `enemy #${index} \`${String(slug)}\``;
    const where = (r: Rect): string => `(${r.x}, ${r.y}) ${r.w}x${r.h}`;

    for (const hazard of hazards) {
      if (intersects(swept, hazard)) {
        return `${label} walks its beat through the hazard at ${where(hazard)} — an enemy standing in spikes reads as a bug, and nothing damages it there`;
      }
    }
    for (const gear of gears) {
      if (intersects(swept, gear)) {
        return `${label} walks its beat through the gear body at ${where(gear)} — the player would have to touch the enemy to collect it`;
      }
    }
    for (const solid of solids) {
      if (intersects(swept, solid)) {
        return `${label} walks its beat into the solid at ${where(solid)} — the wall veto would stop it short of the beat the level declares`;
      }
    }
  }

  return null;
}

/** Strict on every edge: touching is not overlapping, which is what lets an enemy stand on a floor. */
function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
