/**
 * The Tiled object model: how to READ a `.tmj`'s shapes and their custom properties.
 *
 * Split out of `tilemap.ts` in Phase 5, when adding hazards and enemy spawns pushed that file past
 * the 400-line rule and made it the eleventh over-limit file in the repo. The seam is a real one
 * rather than a line-count convenience: **this file answers "what does this object say", and
 * `tilemap.ts` answers "is this level valid, and what does it mean".** Nothing here knows what a
 * level is; nothing there re-reads a `properties` array.
 *
 * Everything is pure and engine-free, for the same reason the parser is — see `tilemap.ts`'s
 * header. It imports nothing from Phaser, performs no I/O, and takes already-parsed JSON.
 *
 * ## The one rule this file exists to enforce
 *
 * **Vault 3.3 — derive behaviour from data, never from a name.** Every predicate below reads a
 * custom PROPERTY. Not the object's `name`, not its `type`, not the layer it sits on, not a tile
 * index. `tilemap-data.test.ts` proves it behaviourally rather than by grep: it renames every
 * layer and object in a parsed copy and asserts the solids come out identical.
 */

export interface TiledProperty {
  name?: unknown;
  value?: unknown;
}

export interface TiledObject {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  properties?: unknown;
}

export interface TiledLayer {
  type?: unknown;
  objects?: unknown;
  data?: unknown;
}

export interface TiledMap {
  width?: unknown;
  height?: unknown;
  tilewidth?: unknown;
  tileheight?: unknown;
  layers?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A type guard, not a boolean helper — so the checks in the validator narrow `unknown`. */
export function positiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Read a custom property's raw value by name, or `undefined` if the object does not carry it.
 *
 * Tiled stores custom properties as `[{ name, type, value }]`, so this is a lookup in DATA. It
 * deliberately does not fall back to the object's `name` or `type` field when the property is
 * absent — a fallback would make vault 3.3's rename test pass while the parser still keyed off a
 * name in the case that actually matters, the one where the data is missing.
 *
 * It reads the FIRST property with that name and stops. That detail is load-bearing: see
 * `isSolidObject`.
 */
export function rawProperty(object: TiledObject, name: string): unknown {
  if (!Array.isArray(object.properties)) {
    return undefined;
  }
  for (const entry of object.properties as TiledProperty[]) {
    if (isRecord(entry) && entry.name === name) {
      return entry.value;
    }
  }
  return undefined;
}

export function boolProperty(object: TiledObject, name: string): boolean {
  return rawProperty(object, name) === true;
}

/**
 * Read a string custom property, or `null` if it is absent OR present with a non-string value.
 *
 * Collapsing those two cases is safe only because the caller separates them with `rawProperty`
 * before asking: an object that DECLARES `enemy` and gets it wrong must be refused by name, not
 * silently treated as scenery.
 */
export function stringProperty(object: TiledObject, name: string): string | null {
  const value = rawProperty(object, name);
  return typeof value === 'string' ? value : null;
}

/**
 * Is this object a collision strip? Exported so the Element Editor selects strips with the SAME
 * predicate that produced them.
 *
 * The editor used to re-implement this as `properties.some(p => p.name === 'solid' && p.value)`,
 * which is not the same function: `rawProperty` reads the FIRST property with that name and
 * stops. Given `[{solid:false},{solid:true}]` the two disagree, the editor's Nth-object walk
 * desynchronises from `world.solids[N]`, and every strip from that point on is written its
 * neighbour's coordinates — a structurally valid level with everything shifted. Found by the
 * code-reviewer gate owner (brief 2). One predicate, one answer.
 */
export function isSolidObject(object: unknown): boolean {
  return isRecord(object) && boolProperty(object as TiledObject, 'solid');
}

/**
 * Is this object damaging geometry? Same shape as `isSolidObject`, and deliberately independent of
 * it: solidity and harm are two properties, so a level cannot express "spikes" by leaving `solid`
 * off and hoping. Both the validator and `parseLevel` go through this one predicate.
 */
export function isHazardObject(object: unknown): boolean {
  return isRecord(object) && boolProperty(object as TiledObject, 'hazard');
}

/**
 * Does this object claim to be an enemy AT ALL?
 *
 * Membership is "declares the property", not "declares it correctly" — otherwise a typo'd slug
 * would make the object invisible to the validator and the level would boot with one enemy
 * missing, which is the quietest possible way to ship a broken level.
 */
export function isEnemyObject(object: unknown): boolean {
  return isRecord(object) && rawProperty(object as TiledObject, 'enemy') !== undefined;
}

/** Every object on every object layer, flattened. Layer names are never consulted (vault 3.3). */
export function allObjects(layers: TiledLayer[]): TiledObject[] {
  const objects: TiledObject[] = [];
  for (const layer of layers) {
    if (layer.type === 'objectgroup' && Array.isArray(layer.objects)) {
      // `.filter(isRecord)` because a null entry in the array would throw inside `rawProperty`,
      // and an exception in the boot validator is a HANG rather than a refusal — the one outcome
      // the whole refuse-to-route design exists to prevent (vault 1.4).
      objects.push(...(layer.objects as unknown[]).filter(isRecord));
    }
  }
  return objects;
}

/**
 * Is there a solid this body can stand on?
 *
 * One definition, used by the spawn rule and by every enemy's patrol edges. It states the property
 * that actually matters — **the body must not be over a pit** — rather than "is it resting exactly
 * on a surface", which is a fixture concern and which broke the Element Editor's primary workflow
 * twice in Phase 3 (the long note in `tilemap.ts` records both wrong versions). A solid counts when
 * it spans the x horizontally and its BOTTOM is at or below the feet, i.e. it is not entirely
 * overhead.
 *
 * Callers must have validated the solids' numerics first; every cast here is discharged by the
 * loop in `describeLevelProblem` that runs before the first call.
 */
export function hasGroundBelow(solids: TiledObject[], x: number, feetY: number): boolean {
  return solids.some(
    (solid) =>
      (solid.y as number) + (solid.height as number) >= feetY &&
      x > (solid.x as number) &&
      x < (solid.x as number) + (solid.width as number),
  );
}
