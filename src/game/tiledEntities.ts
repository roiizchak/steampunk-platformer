/**
 * Validation for the ENTITIES a level's object layers declare — enemies and gears.
 *
 * Split out of `tilemap.ts` in Phase 6. Not a tidying: `tilemap.ts` was at 374 lines with a hard
 * 400-line ceiling that currently allows exactly one offender, and that slot is spent by
 * `GameScene.ts`. Adding gears to it in place would have put it over, so the entity rules — which
 * are a coherent group, and the part of the file that grows every time a phase adds a thing to a
 * level — moved together rather than being trimmed apart.
 *
 * The rules themselves are unchanged from Phase 5. Everything here still returns a **one-line
 * reason** or `null`, and still refuses rather than truncating: a level that boots one enemy short
 * looks merely *empty*, which is vault 1.3's named bug wearing a level designer's clothes.
 */

import { MAX_LEVEL_ENEMIES, MAX_LEVEL_GEARS, RENDER_SCALE } from './constants';
import { GEAR_BOX } from '../sim/pickups';
import { ENEMY_SLUGS } from '../sim/enemies';
import { boolProperty, hasGroundBelow, stringProperty, type TiledObject } from './tiledObjects';

/**
 * Is this object a gear pickup?
 *
 * A boolean `gear` property, exactly like `solid`, `hazard` and `spawn`. **Solidity and every other
 * behaviour in this project comes from a property, never from a layer or object NAME** *(vault
 * 3.3)* — a name is a label a designer can typo into silence, and a typo'd gear is a level that
 * boots with one fewer collectible and no complaint.
 */
export function isGearObject(object: unknown): boolean {
  return boolProperty(object as TiledObject, 'gear');
}

/**
 * `null` if every gear object is loadable, otherwise a one-line reason.
 *
 * Gears are authored as **points**, not rectangles: a gear's size is `GEAR_BOX` in the sim, one
 * number for every gear in the game, so a per-object width would be a second definition of it that
 * a level file could silently disagree with. Tiled writes `width: 0, height: 0` for a point, and
 * accepting a rectangle here would mean quietly ignoring whatever the designer drew.
 */
export function describeGearProblem(
  gearObjects: TiledObject[],
  bounds: { widthPx: number; heightPx: number },
  solids: TiledObject[],
): string | null {
  if (gearObjects.length > MAX_LEVEL_GEARS) {
    return (
      `${gearObjects.length} gears, over the ${MAX_LEVEL_GEARS} cap. Refusing rather than ` +
      `truncating: a level that silently drops its last gear is a level the player can never ` +
      `complete, and nothing on screen would say so.`
    );
  }

  for (const [index, gear] of gearObjects.entries()) {
    if (typeof gear.x !== 'number' || typeof gear.y !== 'number') {
      return `gear #${index} has a non-numeric position`;
    }
    if (!Number.isFinite(gear.x) || !Number.isFinite(gear.y)) {
      return `gear #${index} has a non-finite position (${gear.x}, ${gear.y})`;
    }
    // Inside the map. Every other entity gets a placement check — enemies are tested for ground
    // under BOTH patrol ends, the spawn for ground beneath it — and gears had none, so an
    // out-of-bounds gear booted fine and was simply uncollectable. That is the same "a level the
    // player can never complete" the cap above refuses for, arrived at from the other direction.
    //
    // This is a BOUNDS check, not a reachability one. Nothing in this project tests whether a gear
    // can actually be jumped to, and pretending otherwise would be worse than the gap.
    if (gear.x < 0 || gear.x > bounds.widthPx || gear.y < 0 || gear.y > bounds.heightPx) {
      return `gear #${index} at (${gear.x}, ${gear.y}) is outside the map (${bounds.widthPx} x ${bounds.heightPx}) — it can never be collected`;
    }
    // A gear authored as a rectangle would have its centre read off a point that is really a
    // corner, putting the pickup half a box away from where the designer placed it — visible only
    // as "that one is hard to grab".
    const width = gear.width ?? 0;
    const height = gear.height ?? 0;
    if (width !== 0 || height !== 0) {
      return `gear #${index} must be a POINT, not a ${String(width)} x ${String(height)} rectangle — a gear's size is GEAR_BOX in the sim, not a per-level number`;
    }
    /**
     * 🔴 **Not buried inside a solid.** *(code-reviewer brief 2 #8.)*
     *
     * This check existed, but only as an assertion in a unit test, and only against `level-01` —
     * so it protected the one level that ships and nothing else. A hand-authored gear inside the
     * floor of a *future* level boots cleanly and is permanently uncollectable, which is the same
     * "a level the player can never complete" the cap and the bounds check above both refuse for.
     * Phase 8 is when that stops being hypothetical, so the rule moves to the layer every level
     * passes through rather than staying in a test of one of them.
     *
     * Still not a reachability check — nothing here knows whether a gear can be jumped to. A gear
     * *inside* geometry is a different and decidable question: the collision box can never overlap
     * the player's, because the player can never be there.
     *
     * ## 🔴 Two holes in the version that shipped *(session inventory 1.1, closed 2026-08-23)*
     *
     * It was `gx > solid.x && gx < solid.x + solid.width && …`: **strict** inequalities, against
     * **one rect at a time**, testing the authored **point**.
     *
     * **The seam.** A gear at exactly `solid.x + solid.width` — the join between two abutting floor
     * rects — satisfies *neither*. `1920 < 1920` is false for the left rect and `1920 > 1920` is
     * false for the right one, so it passed, sat inside collision geometry, and could never be
     * picked up. With `MAX_LEVEL_GEARS` that is an uncompletable level, and **on a 96 px grid a
     * seam is the DEFAULT authoring outcome, not an edge case**. `goal-inside-abutting-solids` is
     * the same bug already found once, for the exit.
     *
     * **The body.** It tested the authored point, not the gear's real box. A centre 20 px above a
     * floor's top edge is outside every rect while a 72 × 72 body reaches 16 px into it.
     *
     * ## Why a whole-body overlap, and why that is not over-strict
     *
     * The obvious worry is that refusing *any* overlap refuses legal-but-tight authoring. Measured
     * before choosing, rather than argued: across the **five shipped levels, all 45 gears, zero**
     * have a body that touches a solid. The generator already keeps them clear, so the strict rule
     * costs nothing today — and it is one test where the alternative is two.
     *
     * ⚠️ **Units.** `GEAR_BOX` is **12 local units**, not 72 world px; solids are world px. The
     * `× RENDER_SCALE` is what reconciles them and is exactly what `tiledPlacement.ts` does. The
     * session inventory quoted the box as "72 × 72 world px", and a fix written from that sentence
     * is wrong by 6× — small enough to still pass the seam fixture, which is why
     * `gear-body-in-a-solid` is committed as a *separate* row. That mutation was run: it reds
     * `gear-body-in-a-solid` alone and leaves `gear-on-a-tile-seam` green.
     */
    // Hoisted: the `typeof` guards above narrow `gear.x`/`gear.y` in straight-line code, but that
    // narrowing does not survive into the callback below.
    const gx = gear.x;
    const gy = gear.y;
    const left = gx + GEAR_BOX.x * RENDER_SCALE;
    const top = gy + GEAR_BOX.y * RENDER_SCALE;
    const right = left + GEAR_BOX.w * RENDER_SCALE;
    const bottom = top + GEAR_BOX.h * RENDER_SCALE;
    // Half-open on both axes, so a seam belongs to exactly one rect and a shared EDGE — a gear
    // resting with its box exactly on a floor's surface — is not an overlap.
    const buried = solids.find(
      (solid) =>
        left < (solid.x as number) + (solid.width as number) &&
        (solid.x as number) < right &&
        top < (solid.y as number) + (solid.height as number) &&
        (solid.y as number) < bottom,
    );
    if (buried !== undefined) {
      return (
        `gear #${index} at (${gear.x}, ${gear.y}) body is inside the solid at ` +
        `(${buried.x}, ${buried.y}) ${buried.width} x ${buried.height} — the player can never ` +
        `reach it, so the level can never be completed`
      );
    }
  }

  return null;
}

/**
 * `null` if every enemy object is loadable, otherwise a one-line reason.
 *
 * Moved verbatim from `tilemap.ts` in Phase 6; the rules and their reasons are Phase 5's.
 */
export function describeEnemyProblem(
  enemyObjects: TiledObject[],
  solids: TiledObject[],
): string | null {
  if (enemyObjects.length > MAX_LEVEL_ENEMIES) {
    // Refuse, never truncate. Silently dropping the 23rd enemy is a fallback for a bad input —
    // vault 1.3's named bug — and the level would boot looking merely *empty*, which is the exact
    // failure the unknown-slug rule below already refuses for the same reason.
    return (
      `${enemyObjects.length} enemies, over the ${MAX_LEVEL_ENEMIES} the frame budget has been ` +
      `measured at (criterion 5.11). Raising this cap means RE-MEASURING 5.11, not editing the ` +
      `number — see MAX_LEVEL_ENEMIES.`
    );
  }

  for (const [index, enemy] of enemyObjects.entries()) {
    const slug = stringProperty(enemy, 'enemy');
    if (slug === null) {
      return `enemy #${index} declares an \`enemy\` property that is not a string`;
    }
    if (!(ENEMY_SLUGS as readonly string[]).includes(slug)) {
      // Without this the level boots one enemy short and looks merely empty. The roster lives in
      // `src/sim/enemies.ts` — the module that constructs them — so a slug cannot be known here
      // and unbuildable there.
      return `enemy #${index} has unknown slug \`${slug}\` — known slugs are ${ENEMY_SLUGS.join(', ')}`;
    }
    if (typeof enemy.x !== 'number' || typeof enemy.y !== 'number') {
      return `enemy #${index} \`${slug}\` has a non-numeric position`;
    }
    // A point-authored enemy would collapse its patrol beat to a single x and put its feet at the
    // rectangle's top — mirroring, and inverted from, the spawn's must-be-a-point rule.
    if (
      typeof enemy.width !== 'number' ||
      typeof enemy.height !== 'number' ||
      !(enemy.width > 0) ||
      !(enemy.height > 0)
    ) {
      return `enemy #${index} \`${slug}\` must be a rectangle — its width and height are its patrol beat and its height, got ${String(enemy.width)} x ${String(enemy.height)}`;
    }
    // BOTH ends of the beat, not the centre: a patrol that overhangs its platform walks on air at
    // one end only, and the centre cannot see that. Same predicate as the spawn check, so the two
    // cannot drift apart (vault 5.3).
    const feet = enemy.y + enemy.height;
    for (const edge of [enemy.x, enemy.x + enemy.width]) {
      if (!hasGroundBelow(solids, edge, feet)) {
        return `enemy #${index} \`${slug}\` has no solid beneath its patrol at x ${edge} — it would walk on air`;
      }
    }
  }

  return null;
}

/** Where a gear sits, in world pixels. Tiled points need no conversion — they are already centres. */
export function gearSpawns(gearObjects: TiledObject[]): { x: number; y: number }[] {
  return gearObjects.map((gear) => ({ x: gear.x as number, y: gear.y as number }));
}

