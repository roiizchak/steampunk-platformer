/**
 * The enemy health bar — **drawn geometry, not generated art** (decision M2), and engine-free.
 *
 * ## Criterion 5.7, and the vault note behind it
 *
 * Vault **6.4**: *gate on what is DRAWN.* The naive bar multiplies the hp ratio by the slot width,
 * which is correct arithmetic and a lie on screen. An enemy at **2 of 100** has a ratio of 0.02;
 * against a 120 px slot that is **2 px** — indistinguishable from empty at true sprite size. The
 * player reads "already dead", turns away, and is hit by it.
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
export function healthBarFillWidth(hp: number, maxHp: number, slotW: number): number {
  if (!(maxHp > 0)) {
    throw new Error(`healthBarFillWidth: maxHp must be greater than 0, got ${maxHp}`);
  }
  if (hp <= 0) {
    return 0;
  }
  if (hp >= maxHp) {
    return slotW;
  }
  // The compression. `BAR_MIN_FILL_PX` is the floor of the live range, not a special case bolted
  // onto the outside of it — which is what keeps the mapping monotone.
  return Math.round(BAR_MIN_FILL_PX + (hp / maxHp) * (slotW - BAR_MIN_FILL_PX));
}

/**
 * **The criterion, as a predicate.** Imported by the unit test and the e2e spec.
 *
 * Stated as an equivalence rather than a one-way check: a living enemy must draw a visible bar, AND
 * a dead one must draw nothing. Only asserting the first direction passes a bar that is always full.
 */
export function fillIsHonest(fillW: number, slotW: number, hp: number): boolean {
  if (hp <= 0) {
    return fillW === 0;
  }
  return fillW >= BAR_MIN_FILL_PX && fillW <= slotW;
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
