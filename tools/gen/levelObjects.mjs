import { mergeStrips } from './mergeStrips.mjs';

// Emitting the Tiled OBJECT layer: collision strips, spawn, hazards, enemies, gears, the exit.
//
// Split out of `levelBuilder.mjs` in Phase 8, when adding the goal object pushed that file to 437 of
// the 400 permitted lines. The seam is a real one rather than a line-count convenience:
// `levelBuilder.mjs` answers **"what geometry does this layout describe, and what does the tile grid
// look like"**, and this file answers **"what does that geometry look like as Tiled objects"**. Nothing
// here paints a tile; nothing there writes a `properties` array.
//
// 🔴 Every rect below is a PARAMETER computed by the builder from the painted geometry, never authored
// twice. That is what makes "the drawn spikes hurt" and "the drawn floor is solid" true by
// construction. Phase 4 shipped a spike run drawn and harmless from two lists that had drifted.

/** Tiled object-property helper. One shape, so no call site hand-writes the boilerplate. */
function prop(name, value) {
  return [{ name, type: typeof value === 'string' ? 'string' : 'bool', value }];
}

/**
 * Build the whole object layer, in the order Tiled will see it.
 *
 * 🔴 **The order is a contract, not a style choice.** Collision strips come first, and the strip the
 * player spawns on must be strip 0 — `tests/e2e/phase-03-element-editor.spec.ts` asserts
 * `spawnStrip === 0`, because the editor selects strip 0 on entry and its entire primary workflow is
 * nudging that strip and saving. The builder asserts the spawn is on the first ground run before
 * calling this, so "strips first" is sufficient here.
 *
 * @param geometry rects and points already converted to world pixels by the builder
 */
export function levelObjects(geometry) {
  const { spawn, hazards, enemies, gears, goal } = geometry;
  /**
   * 🔴 Merged before anything is numbered. Two strips sharing a top edge that touch exactly draw as
   * one platform and collide as two, and the seam pins the player permanently — `mergeStrips.mjs`
   * carries the mechanism and the two shipped instances. It lives here because this file owns the
   * strip-to-object mapping AND the "spawn strip must be object 0" contract the merge must not break.
   */
  const strips = mergeStrips(geometry.strips);

  let nextObjectId = 1;
  const objects = strips.map((s) => ({
    height: s.h,
    id: nextObjectId++,
    name: '',
    properties: prop('solid', true),
    rotation: 0,
    type: '',
    visible: true,
    width: s.w,
    x: s.x,
    y: s.y,
  }));

  objects.push({
    height: 0,
    id: nextObjectId++,
    name: '',
    point: true,
    properties: prop('spawn', true),
    rotation: 0,
    type: '',
    visible: true,
    width: 0,
    // Feet: horizontal centre of the spawn tile, standing on the ground surface.
    x: spawn.x,
    y: spawn.y,
  });

  // One hazard rectangle per spike run, from the same array that drew the spike tiles.
  for (const rect of hazards) {
    objects.push({
      height: rect.h,
      id: nextObjectId++,
      name: '',
      properties: prop('hazard', true),
      rotation: 0,
      type: '',
      visible: true,
      width: rect.w,
      x: rect.x,
      y: rect.y,
    });
  }

  // A rectangle says everything about an enemy: its horizontal span IS the patrol beat, and its bottom
  // edge is where the feet rest. `describeEnemyProblem` checks ground under BOTH ends.
  for (const enemy of enemies) {
    objects.push({
      height: enemy.h,
      id: nextObjectId++,
      name: '',
      properties: prop('enemy', enemy.slug),
      rotation: 0,
      type: '',
      visible: true,
      width: enemy.w,
      x: enemy.x,
      y: enemy.y,
    });
  }

  /**
   * The exit, as a rectangle — Phase 8.
   *
   * A rect and not a point because the player's box ENTERS it, tested with the same overlap the
   * collider and the pickups use. Its size is authored per level, unlike a gear's, because a wide
   * doorway is easier to hit than a narrow one and that is a difficulty knob a level should own.
   *
   * ⚠️ It carries NO tile painting. `goalLayer.ts` draws it at runtime from `LevelData.goal`, so the
   * drawn exit and the trigger volume are ONE rectangle rather than a rect plus tiles that have to
   * agree with it — the same derived-never-duplicated rule the hazards follow. It is also why a dense
   * level cannot accidentally paint a doorway a pixel off from where it opens.
   */
  objects.push({
    height: goal.h,
    id: nextObjectId++,
    name: '',
    properties: prop('goal', true),
    rotation: 0,
    type: '',
    visible: true,
    width: goal.w,
    x: goal.x,
    y: goal.y,
  });

  // Gears, as POINTS. Tiled marks a point with `point: true` and zero width/height, and
  // `describeGearProblem` refuses a rectangle: a gear's size is `GEAR_BOX` in the sim, one number for
  // the whole game, so a per-object width would be a second definition a level file could disagree
  // with. Centred in its cell, which is what makes the authored row read as "one tile above".
  for (const point of gears) {
    objects.push({
      height: 0,
      id: nextObjectId++,
      name: '',
      point: true,
      properties: prop('gear', true),
      rotation: 0,
      type: '',
      visible: true,
      width: 0,
      x: point.x,
      y: point.y,
    });
  }

  return { objects, nextObjectId };
}
