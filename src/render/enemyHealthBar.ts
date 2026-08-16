/**
 * The enemy health bar — **drawn geometry, not generated art** (decision M2), and engine-free.
 *
 * ## Criterion 5.7, and the vault note behind it
 *
 * Vault **6.4**: *gate on what is DRAWN.* The naive bar multiplies the hp ratio by the slot width,
 * which is correct arithmetic and a lie on screen. A scavenger at **1 of 60** has a ratio of 0.017;
 * against the shipped **144 px** slot (`barSlotWidth`, 24 local × `RENDER_SCALE` 6) that rounds to
 * **2 px** — indistinguishable from empty at true sprite size. The player reads "already dead",
 * turns away, and is hit by it.
 *
 * > This paragraph said *"2 of 100 … against a 120 px slot"* until 2026-08-14. Both numbers were
 * > stale: 120 predates Phase 4's 3× world rescale, and no enemy in the game has 100 max hp. The
 * > figures above are the scavenger's real ones, and `enemy-view.test.ts` now derives the width from
 * > `barSlotWidth` rather than retyping it.
 *
 * So a non-zero fill is **compressed into the upper part of the slot**: the range `(0, max]` maps
 * onto `[BAR_MIN_FILL_PX, slotW]` rather than onto `[0, slotW]`. Alive is always visible, full is
 * always the whole slot, and the mapping stays strictly monotone so more hp still reads as more bar.
 *
 * A plain `Math.max(MIN, ratio × slotW)` floor was the first version and is worse in a way that is
 * easy to miss: it satisfies "visible at 2 hp" while flattening the bottom of the range, so 1 hp and
 * 2 hp draw identically — the bar stops carrying information exactly where the player most needs it.
 * Note that a monotonicity test does NOT catch this (the floor is also non-decreasing, and its ends
 * also differ); the test that does is *"1 hp and 2 hp are distinguishable"* in `enemy-view.test.ts`.
 * That distinction was found by mutating this function rather than by reading it.
 *
 * ## Why the predicate is exported
 *
 * `fillIsHonest` is imported by the unit test AND by `tests/e2e/phase-05-combat.spec.ts`, which
 * reads the **live scene tree** through `window.__phaserGame` and checks the actual drawn object
 * *(Codex plan review C8)*. One definition, two consumers — the `viewFits`/`tracksTarget` precedent
 * from Phase 3. Two assertions that happen to agree on the happy path are not one gate.
 */

import { SCAVENGER_BOX, SENTRY_BOX, type EnemySlug } from '../sim/enemies';

/**
 * The narrowest fill that still reads as "not empty" at `CAMERA_ZOOM` 1.
 *
 * 3 px is deliberately small. It is not a design preference — it is the floor below which the bar
 * stops communicating, and making it larger would distort low-hp readings for no gain.
 */
export const BAR_MIN_FILL_PX = 3;

/** Slot geometry, in world pixels at scale 1 — multiplied by the world's `scale` like every box. */
const BAR_LOCAL = { w: 24, h: 3, gap: 5 } as const;

/**
 * The slot's width in WORLD pixels at a given scale — 144 at the shipped `RENDER_SCALE` of 6.
 *
 * 🔴 Exported because `enemy-view.test.ts` hardcoded **120** and therefore spent an entire `describe`
 * measuring a width the game has never drawn. 120 was the pre-Phase-4 figure, from before the 3×
 * world rescale; nothing updated it, because nothing connected it to `BAR_LOCAL`. Every threshold in
 * that block — including *"the naive ratio rounds to nothing"*, which is the premise the whole
 * criterion rests on — was evaluated against a fiction.
 *
 * So the test derives it from here now. It is deliberately a function of `scale` rather than a
 * second exported constant: a constant would be a **third** copy of the same number, which is the
 * shape of the bug it exists to close *(vault 5.3)*.
 */
export function barSlotWidth(scale: number): number {
  return BAR_LOCAL.w * scale;
}

export interface HealthBarDesc {
  /** Top-left of the slot, world space. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Width of the filled portion. THIS is what criterion 5.7 gates on, never the ratio. */
  fillW: number;
}

/** Anything with hp that can be drawn. Structural on purpose — it needs no more than this. */
export interface BarSubject {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

/**
 * How wide the filled portion is drawn.
 *
 * Clamped at both ends and monotone in between. `hp <= 0` is the ONLY input that yields 0 — that
 * equivalence is the criterion, and `fillIsHonest` states it as a predicate.
 */
export function healthBarFillWidth(
  hp: number,
  maxHp: number,
  slotW: number,
  maxPartialFraction = 1,
): number {
  if (!(maxHp > 0)) {
    throw new Error(`healthBarFillWidth: maxHp must be greater than 0, got ${maxHp}`);
  }
  if (!(maxPartialFraction > 0) || maxPartialFraction > 1) {
    throw new Error(
      `healthBarFillWidth: maxPartialFraction must be in (0, 1], got ${maxPartialFraction}`,
    );
  }
  // 🔴 The compressed range must have room for the floor, or the mapping INVERTS.
  //
  // `liveMax - BAR_MIN_FILL_PX` goes negative once the slot is narrow enough, and a healthier
  // player then draws a NARROWER bar: the adversarial QA brief executed it — at slotW 3,
  // `healthBarFillWidth(1, 3, 3, 0.92)` returned 3 and `(2, 3, 3, 0.92)` returned 2. Dead in
  // practice today because the only 4-argument caller passes a fixed 239 px slot, but this function
  // is generic and exported, and this phase has already watched the HUD plate change size once.
  // Throwing beats silently inverting a health bar.
  if (Math.floor(slotW * maxPartialFraction) <= BAR_MIN_FILL_PX) {
    throw new Error(
      `healthBarFillWidth: slot ${slotW} at fraction ${maxPartialFraction} leaves no room above ` +
        `the ${BAR_MIN_FILL_PX}px floor — the mapping would invert and a healthier bar would draw ` +
        `narrower.`,
    );
  }
  if (!Number.isFinite(hp)) {
    // NaN skips both the `<= 0` and `>= maxHp` branches below and propagates through `Math.round`
    // into `fillRect`, which Canvas drops in silence — a bar that is wrong without being broken.
    throw new Error(`healthBarFillWidth: hp must be a finite number, got ${hp}`);
  }
  if (hp <= 0) {
    return 0;
  }
  if (hp >= maxHp) {
    return slotW;
  }
  // The compression. `BAR_MIN_FILL_PX` is the floor of the live range, not a special case bolted
  // onto the outside of it — which is what keeps the mapping monotone.
  //
  // `maxPartialFraction` is the CEILING of that live range, and it is the vault 6.4 countermeasure:
  // below max health the bar is compressed into the first fraction of the slot, so full width is
  // reserved for actually-full. It defaults to 1, which is Phase 5's behaviour exactly — an enemy
  // bar makes no readiness claim and is entitled to look full at 99%. The player's HUD passes
  // `HUD_READY_FRACTION`; see `playerHud.ts`.
  //
  // Compressing the RANGE rather than clamping the top is what keeps this monotone. Subtracting a
  // few pixels near the end would make two different health values draw the same width, which is a
  // second lie in place of the first one.
  const liveMax = Math.floor(slotW * maxPartialFraction);
  return Math.round(BAR_MIN_FILL_PX + (hp / maxHp) * (liveMax - BAR_MIN_FILL_PX));
}

/**
 * **The criterion, as a predicate.** Imported by the unit test and the e2e spec.
 *
 * Stated as an equivalence rather than a one-way check: a living enemy must draw a visible bar, AND
 * a dead one must draw nothing. Only asserting the first direction passes a bar that is always full.
 */
export function fillIsHonest(
  fillW: number,
  slotW: number,
  hp: number,
  maxHp?: number,
  maxPartialFraction?: number,
): boolean {
  // 🔴 Supplying `maxHp` without the fraction used to default it to 1, which collapses the vault
  // 6.4 branch below to `fillW <= slotW` — something the range check two lines down has ALREADY
  // guaranteed. So a four-argument call read as if it had opted into the "never full below max"
  // check and actually checked nothing, returning `true` for precisely the defect the predicate
  // exists to reject. Confirmed by execution in the adversarial QA brief:
  // `fillIsHonest(239, 239, 99, 100)` was `true`.
  //
  // The two arguments are one decision, so they are required together.
  if ((maxHp === undefined) !== (maxPartialFraction === undefined)) {
    throw new Error(
      'fillIsHonest: pass BOTH maxHp and maxPartialFraction, or neither. Supplying maxHp alone ' +
        'silently disables the very check it looks like it is enabling.',
    );
  }
  if (hp <= 0) {
    return fillW === 0;
  }
  if (!(fillW >= BAR_MIN_FILL_PX && fillW <= slotW)) {
    return false;
  }
  // The vault 6.4 half, and it is deliberately OPT-IN through `maxHp`.
  //
  // Criterion 5.7's call sites pass three arguments and mean the Phase 5 claim: a living bar is
  // visible, a dead one is empty. Criterion 6.4's call sites pass five and mean that AND "a bar
  // below max does not draw full". Extending the predicate rather than writing a second one is what
  // keeps a single definition of "this bar is honest" — two predicates that agree on the happy path
  // are not one gate *(vault 5.3)*.
  if (maxHp !== undefined && maxPartialFraction !== undefined && hp < maxHp) {
    return fillW <= Math.floor(slotW * maxPartialFraction);
  }
  return true;
}

/** Each subject's body height in local units, so the bar clears the head rather than the feet. */
const BODY_HEIGHT: Record<EnemySlug, number> = {
  'brass-sentry': SENTRY_BOX.h,
  'rust-scavenger': SCAVENGER_BOX.h,
};

/**
 * Where and how wide to draw one enemy's bar.
 *
 * Positioned from the subject's own body height, not a shared constant: the two enemies are 2 and
 * 2.5 tiles tall by design, and one hardcoded offset would either cut through the taller one's head
 * or float over the shorter one's.
 */
export function healthBarDesc(
  subject: BarSubject,
  slug: EnemySlug,
  scale: number,
): HealthBarDesc {
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new Error(`healthBarDesc: scale must be a finite number greater than 0, got ${scale}`);
  }

  const w = BAR_LOCAL.w * scale;
  const h = BAR_LOCAL.h * scale;
  const headY = subject.y - BODY_HEIGHT[slug] * scale;

  return {
    x: subject.x - w / 2,
    y: headY - BAR_LOCAL.gap * scale,
    w,
    h,
    fillW: healthBarFillWidth(subject.hp, subject.maxHp, w),
  };
}
