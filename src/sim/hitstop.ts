/**
 * Hit-stop — the few ticks a landed melee blow holds both bodies still, so the impact reads.
 *
 * **Per BODY, not per world.** The attacker and the victim stop; `tickCount` keeps rising, the
 * seeded stream keeps advancing (vault 2.3), other enemies keep walking and bolts already in flight
 * keep flying. A global pause would be a different feature — it would stop the clock every other
 * system's timing is expressed against, and this project has exactly one clock.
 *
 * ## Why a DEADLINE and not a counter
 *
 * Every other window in this project is an incrementing counter tested `counter < knob`, advanced
 * by step 13 (`windows.ts`). This one is not, and the reason is where it is armed.
 *
 * The freeze is armed at **step 9b**, which runs *after* steps 5–8 have already moved both bodies
 * this tick. A counter armed at `0` there and advanced at step 13 would be read for the first time
 * at step 5 of the next tick with the value already `1` — so a knob of `N` would buy `N - 1` frozen
 * ticks. That is exactly the off-by-one Codex plan review F5 found in Phase 2's first design, and
 * `movementLocked`'s docstring records the same asymmetry costing `HURT_LOCK_TICKS` a tick to this
 * day: *"where in the tick a window is ARMED decides how much of it a later step can see."*
 *
 * A deadline has no arming-tick question at all. Arm at 9b of tick `T` with `tickCount + N`, test
 * `tickCount <= until`, and ticks `T+1 … T+N` are frozen — **exactly `N`, by construction**, with
 * no rule about which step may read it and no dependence on the freeze being armed before or after
 * anything else. It rests on the one invariant this file needs, which `applyPlayerAttack`
 * (`playerAttack.ts`) already ships on: `tickCount` rises unconditionally at step 14.
 *
 * It also needs **no step-13 entry**. Nothing advances it, so nothing can forget to.
 *
 * ⚠️ **Do NOT "fix" this by routing it through `windows.ts`.** `windowOpen`/`advanceWindow` are the
 * counter idiom, and their own header is explicit that arming is the caller's problem. This is not a
 * counter; converting it would reintroduce the arming question the deadline exists to remove, and
 * would cost a tick of every freeze the day someone moved the advance.
 */

/**
 * How hard the blow read as. Three classes, because the freeze length IS the punctuation: a kill
 * should land heavier than a graze, and being hit should not feel like landing one.
 */
export type ImpactClass = 'light' | 'lethal' | 'playerHurt';

/**
 * Freeze lengths in 60 Hz ticks. Pinned as literals, and pinned again in `hitstop.test.ts` —
 * separately from any test that merely reads this table, so a retune is a visible edit in two
 * places rather than a number that moves and takes its own assertion with it.
 */
export const HITSTOP_TICKS: Readonly<Record<ImpactClass, number>> = {
  light: 4,
  lethal: 9,
  playerHurt: 6,
};

/**
 * Anything that can be frozen — structural, exactly like `Hittable` in `playerAttack.ts`.
 *
 * There is no common entity type in this project: `PlayerSim`, `Sentry` and `Scavenger` share no
 * base, on purpose, because they share almost no fields. Inventing one to carry two integers would
 * be a bigger change than the feature, and a bigger change to the files a Codex review reads.
 */
export interface Freezable {
  /** The LAST tick on which this body is frozen. `-1` is never — the sentinel `lastHitSwing` uses. */
  hitstopUntil: number;
  /** The tick of the hit that froze it. `hitstopUntil - lastHitTick` IS the impact class. */
  lastHitTick: number;
}

/**
 * Freeze BOTH bodies for the same count, in one call, so they cannot drift apart.
 *
 * One call rather than two `freeze()`s at the call site is the point: two calls is two places to
 * pass the impact class, and the day they disagree the attacker recovers before the thing it hit.
 *
 * ## The `Math.max` guard is behaviour, not an optimisation
 *
 * Without it, a `light` hit landing during a 9-tick `lethal` freeze writes `tickCount + 4` and
 * **shortens** the lethal freeze — a second blow making the first one read as weaker. A hit can only
 * ever extend a freeze, never cut one short, so `lastHitTick` is written only when the deadline
 * actually moves and the pair keeps describing the impact that is still holding them.
 */
export function freezePair(a: Freezable, b: Freezable, impact: ImpactClass, tickCount: number): void {
  const until = tickCount + HITSTOP_TICKS[impact];
  for (const body of [a, b]) {
    if (until > body.hitstopUntil) {
      body.hitstopUntil = until;
      body.lastHitTick = tickCount;
    }
  }
}

/**
 * Is this body frozen right now?
 *
 * `<=`, not `<`: `hitstopUntil` is the last frozen tick, so the window is inclusive at both ends.
 * The `-1` sentinel falls out of it — no tick count is ever negative, so a body that has never been
 * hit is never frozen without a second comparison to remember.
 */
export function frozen(body: Readonly<Freezable>, tickCount: number): boolean {
  return tickCount <= body.hitstopUntil;
}
