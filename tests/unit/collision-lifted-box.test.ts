import { describe, expect, it } from 'vitest';
import { PLAYER_BOX, resolveCollisions, toWorld } from '../../src/sim/player';
import { IFRAME_TICKS, PLAYER_MAX_HP } from '../../src/sim/combat';
import type { LocalBox, PlayerSim, Rect } from '../../src/sim/types';

/**
 * # `resolveCollisions` against a body lifted off the feet — inventory 5.11
 *
 * `docs/reviews/phase-03-impl.md:94` recorded it and nothing closed it:
 *
 * > `resolveCollisions`'s vertical-offset `LocalBox` case is untested — correct today only because
 * > `PLAYER_BOX.y === 0`. A non-zero `y` gives silently wrong collision.
 *
 * ## Why it survived three phases: it was not reachable
 *
 * The horizontal offsets have been derived through `toWorld` since Phase 3, because a code-reviewer
 * gate owner caught the inline `halfW` arithmetic and vault 2.10 forbids a second conversion. **The
 * vertical ones were never held to the same standard** — the function read `const height = box.h`
 * and then used bare `player.y` as the body's bottom. That is the assumption `PLAYER_BOX.y === 0`,
 * written into the arithmetic rather than stated.
 *
 * And no test could have found it, because `resolveCollisions` read `PLAYER_BOX` from module scope:
 * there was no box to vary. **That is the actual defect** — an assumption is not "untested" by
 * accident when the code makes testing it impossible. The fix is therefore two parts: derive the
 * vertical pair, and take the body as a defaulted parameter so this file can exist at all.
 *
 * ## What a lifted box means
 *
 * `LocalBox` is authored **`+y` up from the feet** (`types.ts`), so `y: 4` floats the body 4 local
 * units above the ground. A fighter whose collision body starts above its feet is ordinary — skirts,
 * treads, a hovering chassis — and `SENTRY_BOX` / `SCAVENGER_BOX` are `y: 0` today only because
 * nothing has needed otherwise yet.
 *
 * With `y: 4` at `scale: 1` the body's bottom is `player.y - 4`, so landing on a solid whose top is
 * `100` must leave the feet at **104**, not 100. The old code put them at 100 — the body sunk 4 px
 * into the floor, drawn correctly and colliding wrongly, with nothing throwing.
 *
 * **The mutation this file names:** restore `player.y = solid.y` in place of
 * `player.y = solid.y + bottomOffset`. Every "lands with its BOTTOM on the surface" case below reds
 * and the `PLAYER_BOX` regression cases stay green — which is exactly why the suite was green.
 */

const SCALE = 1;
/** The shipped box: bottom exactly on the feet. Every existing assertion in the suite assumes it. */
const FLUSH: LocalBox = PLAYER_BOX;
/** The same body, lifted 4 local units. The case the reviewer named. */
const LIFTED: LocalBox = { ...PLAYER_BOX, y: 4 };

function playerAt(x: number, y: number, overrides: Partial<PlayerSim> = {}): PlayerSim {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,
    state: 'fall',
    ticksSinceGrounded: 0,
    ticksSinceJumpPressed: 0,
    jumpCutPending: false,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    combatCounter: 0,
    iFrameCounter: IFRAME_TICKS,
    knockbackPending: false,
    hitstopUntil: -1,
    lastHitTick: -1,
    swingStartTick: -1,
    hitstopSwing: -1,
    strideCounter: 0,
    strideGait: null,
    landedTick: -1,
    landedFallSpeed: 0,
    ...overrides,
  };
}

/** A wide floor whose top surface is at y = 100. */
const FLOOR: Rect = { x: 0, y: 100, w: 1000, h: 200 };

/** The body's world bottom edge, through the one conversion — never re-derived here. */
function bottomOf(box: LocalBox, feetY: number): number {
  const r = toWorld(box, 0, feetY, 1, SCALE);
  return r.y + r.h;
}

describe('the lifted-body case is reachable at all (5.11)', () => {
  it('the two fixtures actually differ — otherwise every assertion below is one assertion', () => {
    // The non-vacuity gate. If `LIFTED` were accidentally equal to `FLUSH`, this whole file would
    // pass while measuring the shipped box twice.
    expect(FLUSH.y).toBe(0);
    expect(LIFTED.y).toBe(4);
    expect(bottomOf(LIFTED, 500) - bottomOf(FLUSH, 500)).toBe(-4);
  });

  it('and the shipped box is genuinely flush, which is why the bug was invisible', () => {
    expect(bottomOf(FLUSH, 500)).toBe(500);
  });
});

describe('landing puts the body BOTTOM on the surface, not the feet (5.11)', () => {
  it('the flush box lands with its feet on the floor — the shipped regression case', () => {
    const p = playerAt(400, 108, { vy: 10 });
    const grounded = resolveCollisions(p, [FLOOR], SCALE, 400, 96, FLUSH);

    expect(grounded).toBe(true);
    expect(p.y).toBe(100);
    expect(bottomOf(FLUSH, p.y)).toBe(FLOOR.y);
    expect(p.vy).toBe(0);
  });

  it('the LIFTED box lands with its BOTTOM on the floor, leaving the feet below it', () => {
    // 🔴 The assertion the defect fails. Old code: `player.y = solid.y` → 100, sinking the body 4px
    // into the floor. It is the same fall, the same floor, the same tick — only the body differs.
    const p = playerAt(400, 108, { vy: 10 });
    const grounded = resolveCollisions(p, [FLOOR], SCALE, 400, 96, LIFTED);

    expect(grounded).toBe(true);
    expect(
      bottomOf(LIFTED, p.y),
      `the body's bottom settled at ${bottomOf(LIFTED, p.y)}, not on the floor at ${FLOOR.y}`,
    ).toBe(FLOOR.y);
    expect(p.y, 'the feet should sit BELOW the surface by the box lift').toBe(104);
    expect(p.vy).toBe(0);
  });

  it('and the two boxes land at DIFFERENT feet heights — the claim, stated directly', () => {
    // Guards against a "fix" that makes both cases agree by breaking the flush one.
    const flush = playerAt(400, 108, { vy: 10 });
    const lifted = playerAt(400, 108, { vy: 10 });
    resolveCollisions(flush, [FLOOR], SCALE, 400, 96, FLUSH);
    resolveCollisions(lifted, [FLOOR], SCALE, 400, 96, LIFTED);

    expect(lifted.y - flush.y).toBe(4);
  });
});

describe('the lifted body does not collide with what it no longer overlaps (5.11)', () => {
  it('a body whose lift clears the floor is NOT grounded by it', () => {
    // The other half of a bottom offset: at feet y = 102 the flush body is 2px inside the floor,
    // but the lifted body's bottom is at 98 — above the surface, touching nothing. A bottom hard-
    // coded to `player.y` cannot tell these apart and grounds both.
    const lifted = playerAt(400, 102, { vy: 4 });
    const grounded = resolveCollisions(lifted, [FLOOR], SCALE, 400, 101, LIFTED);

    expect(bottomOf(LIFTED, 102)).toBe(98);
    expect(grounded, 'a body floating above the floor was grounded by it').toBe(false);
    expect(lifted.y, 'and nothing snapped it').toBe(102);
  });

  it('while the flush body at the same position IS grounded — the discriminating pair', () => {
    const flush = playerAt(400, 102, { vy: 4 });
    expect(resolveCollisions(flush, [FLOOR], SCALE, 400, 100, FLUSH)).toBe(true);
  });
});

describe('the ceiling snap uses the same derived pair (5.11)', () => {
  const CEILING: Rect = { x: 0, y: 0, w: 1000, h: 100 };

  it('the flush box stops with its TOP against the ceiling', () => {
    const p = playerAt(400, 146, { vy: -10 });
    resolveCollisions(p, [CEILING], SCALE, 400, 156, FLUSH);

    const r = toWorld(FLUSH, 0, p.y, 1, SCALE);
    expect(r.y).toBe(CEILING.y + CEILING.h);
    expect(p.vy).toBe(0);
  });

  it('and so does the LIFTED box — its top is a different distance from the feet', () => {
    // topOffset is (y + h) * scale = 52 for the lifted box against 48 for the flush one. The old
    // code used `height` (48) for both, so the lifted body stopped 4px INSIDE the ceiling.
    const p = playerAt(400, 150, { vy: -10 });
    resolveCollisions(p, [CEILING], SCALE, 400, 160, LIFTED);

    const r = toWorld(LIFTED, 0, p.y, 1, SCALE);
    expect(r.y, `the body's top settled at ${r.y}, not against the ceiling`).toBe(
      CEILING.y + CEILING.h,
    );
    expect(p.y).toBe(152);
    expect(p.vy).toBe(0);
  });
});

describe('the default keeps every existing caller on the shipped body (5.11)', () => {
  it('omitting the argument is exactly passing PLAYER_BOX', () => {
    // `tick.ts:274` is the only production caller and passes five arguments. If the default ever
    // drifted from PLAYER_BOX the whole game would collide against a body nothing draws.
    const withDefault = playerAt(400, 108, { vy: 10 });
    const explicit = playerAt(400, 108, { vy: 10 });
    const a = resolveCollisions(withDefault, [FLOOR], SCALE, 400, 96);
    const b = resolveCollisions(explicit, [FLOOR], SCALE, 400, 96, PLAYER_BOX);

    expect(a).toBe(b);
    expect(withDefault.y).toBe(explicit.y);
    expect(withDefault.vy).toBe(explicit.vy);
  });
});
