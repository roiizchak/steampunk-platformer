/**
 * What `level-01` owes the Phase 1–7 e2e suite. Written BEFORE the level was authored.
 *
 * ## 🔴 Why this file exists
 *
 * Phase 8 replaces `level-01`, and roughly nineteen e2e assertions across six spec files read exact
 * coordinates out of the **running game** — a drawn tile index at col 24 row 20, the camera's clamped
 * `view.y`, the x a right-held player stops at, the gears two ArrowRight presses collect. Those cannot
 * be repointed at a frozen fixture the way `level-traversal.test.ts` was, because their subject is the
 * live browser reading the shipped file.
 *
 * Left to the QA gate they arrive as a wall of nineteen reds against a level that already exists, each
 * one a browser round trip to diagnose. Every constraint below is computable from `parseLevel`,
 * `cameraSetup`, `derivedFeel` and the raw tile data — so the same information arrives in
 * milliseconds, while the level is still being authored, with the spec that will fail named in the
 * message.
 *
 * ⚠️ **This file is not the authority; the e2e suite is.** It is a pre-check that makes the e2e run
 * boring. Where the two could disagree — the camera follows the *sprite*, whose origin is not the
 * feet — the assertion here carries margin and says so.
 *
 * ## The four constraints that are exact, and cannot be negotiated
 *
 * `phase-04-assets-tiles.spec.ts` is the only place in the repo that reads a **drawn** tile index, and
 * it reads four specific cells plus one discriminating cell. Those coordinates are the assertion, not
 * an example of it: cols 24–27 at row 20 must be a walkable top under authored decoration, row 21 must
 * be buried beneath it, and col 34 must carry a solid standing on the ground so the cell below it stays
 * brick. Without that last one the first four pass on a mutant that caps every tile unconditionally.
 *
 * So the new level-01 keeps that local geometry and grows around it. Recorded here rather than
 * discovered later.
 */

import { describe, expect, it } from 'vitest';

import { CAMERA_ZOOM, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, TILE_SIZE } from '../../src/game/constants';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { cameraSetup } from '../../src/render/cameraRig';
import { hasSolidAbove } from '../../src/render/groundTiles';
import { derivedFeel } from '../../src/sim/derived';
import { createSnapshot } from '../../src/sim/input';
import { DEFAULT_TUNING, PLAYER_BOX } from '../../src/sim/player';
import { createWorld, tick } from '../../src/sim/tick';
import { ticksToMs } from '../../src/sim/index';
import type { InputSnapshot, Rect, World } from '../../src/sim/types';
import { SHIPPED } from './tilemap-data-fixtures';

const RAW = SHIPPED['../../public/assets/levels/level-01.tmj']!;
const LEVEL = parseLevel('level-01', JSON.parse(RAW) as unknown);
const FEEL = derivedFeel(DEFAULT_TUNING, ticksToMs);
const HALF_W = (PLAYER_BOX.w / 2) * RENDER_SCALE;
const VIEW_W = GAME_WIDTH / CAMERA_ZOOM;
const VIEW_H = GAME_HEIGHT / CAMERA_ZOOM;

/** The tile layer, read off the raw bytes — `LevelData` carries geometry, not the painted grid. */
const TILES = (() => {
  const layer = (JSON.parse(RAW) as { layers: { type?: string; data?: number[]; width?: number }[] }).layers.find(
    (l) => l.type === 'tilelayer' && Array.isArray(l.data),
  )!;
  return { data: layer.data!, width: layer.width! };
})();

const gidAt = (col: number, row: number): number => TILES.data[row * TILES.width + col] ?? 0;

/** The full shipped world — enemies, hazards, gears and the exit. Nothing omitted. */
function shippedWorld(startX = LEVEL.spawn.x): World {
  return createWorld({
    seed: 1,
    scale: RENDER_SCALE,
    solids: LEVEL.solids,
    hazards: LEVEL.hazards,
    enemies: LEVEL.enemies,
    gears: LEVEL.gears,
    goal: LEVEL.goal,
    bounds: { widthPx: LEVEL.widthPx, heightPx: LEVEL.heightPx },
    spawn: { x: startX, y: LEVEL.spawn.y },
  });
}

/** Hold Right (never jump) for `ticks`, and report the x at every tick. */
function holdRight(world: World, ticks: number): number[] {
  const input: InputSnapshot = createSnapshot();
  input.right = true;
  const xs: number[] = [];
  for (let i = 0; i < ticks; i += 1) {
    tick(world, input);
    xs.push(world.player.x);
  }
  return xs;
}

/** Is the whole span `[from, to)` at `y` solid ground, with nothing raised standing on it? */
function flatGroundSpan(level: LevelData, from: number, to: number): boolean {
  for (let x = from; x < to; x += TILE_SIZE / 2) {
    const onGround = level.solids.some((s) => s.y === level.spawn.y && x >= s.x && x < s.x + s.w);
    if (!onGround) return false;
    const raised = level.solids.some((s) => s.y < level.spawn.y && x >= s.x && x < s.x + s.w);
    if (raised) return false;
    const spiked = level.hazards.some((h) => x >= h.x && x < h.x + h.w);
    if (spiked) return false;
  }
  return true;
}

describe('extent and camera — phase-03-tilemap.spec.ts', () => {
  it('has at least a full viewport of scroll room horizontally, and is taller than the view', () => {
    expect(LEVEL.widthPx - VIEW_W, 'less than one screen of horizontal scroll').toBeGreaterThanOrEqual(VIEW_W);
    expect(LEVEL.heightPx, 'the level is not taller than the view, so vertical clamping never happens').toBeGreaterThan(
      VIEW_H,
    );
  });

  it('spawns far enough left that the camera LEFT-clamps — spec 3.4 asserts view.x === 0', () => {
    // The camera cannot centre on a player closer to x 0 than half a view without showing past the
    // map edge, which is the only condition under which `view.x === 0` is observable.
    expect(LEVEL.spawn.x, 'the camera will not be left-clamped at spawn').toBeLessThanOrEqual(VIEW_W / 2);
    const { bounds } = cameraSetup(LEVEL, GAME_WIDTH, GAME_HEIGHT);
    expect(bounds.x).toBe(0);
    expect(bounds.w).toBe(LEVEL.widthPx);
  });

  it('is BOTTOM-clamped at spawn — spec 3.4 asserts view.y + view.h === bounds.h', () => {
    // The grounded camera wants `spawn.y - VIEW_H/2` and gets the clamp instead.
    const wanted = LEVEL.spawn.y - VIEW_H / 2;
    const clamp = LEVEL.heightPx - VIEW_H;
    expect(wanted, 'the camera is not bottom-clamped at spawn, so view.y + view.h < bounds.h').toBeGreaterThan(clamp);
  });

  /**
   * 🔴 **The constraint "bigger" breaks first**, and `phase-03-tilemap.spec.ts:155-159` says so in as
   * many words: *"a shorter jump, a taller view or a shallower map would make vertical follow
   * genuinely unobservable here, and this test would have to say so rather than quietly weaken."*
   *
   * Spec 3.4's vertical-follow half needs the camera to be clamped on the ground AND to come off the
   * clamp during one jump. The climb required is `spawn.y - (heightPx - VIEW_H) - VIEW_H/2`; today that
   * is 348 px against a measured 413 px apex, a 65 px margin. Deepen the map and the climb grows past
   * the apex, the camera never moves, and the spec fails with a message about the camera rather than
   * about the level.
   */
  it('one jump lifts the camera off the bottom clamp — with the apex to spare', () => {
    const climb = LEVEL.spawn.y - (LEVEL.heightPx - VIEW_H) - VIEW_H / 2;
    expect(climb, 'the camera is already off its bottom clamp at spawn — nothing to observe').toBeGreaterThan(0);
    expect(
      climb,
      `a jump must lift the camera off the clamp: the player has to rise ${climb}px but the measured ` +
        `apex is only ${FEEL.apexPx}px. Make the map shallower or the spawn lower — do NOT weaken the ` +
        'spec, which says in as many words that it would have to admit the case became unobservable.',
    ).toBeLessThan(FEEL.apexPx);
  });
});

describe('the opening run — phase-02-movement.spec.ts and hudHelpers.ts', () => {
  /**
   * 🔴 `phase-02-movement.spec.ts` holds ArrowRight for 90+ ticks and asserts x is **non-decreasing at
   * every sample**. One knockback fails it. So the opening stretch must be clean flat ground: no
   * hazard, no pit, no raised solid, and no enemy that closes to contact inside the window.
   *
   * 1600 px is a little over one screen at `RENDER_SCALE` 6, and comfortably more than 90 ticks of
   * running covers — so the assertion has margin rather than sitting exactly on the boundary.
   */
  const CLEAN_RUN_PX = 1600;

  it(`has ${CLEAN_RUN_PX}px of clean flat ground right of spawn`, () => {
    expect(
      flatGroundSpan(LEVEL, LEVEL.spawn.x, LEVEL.spawn.x + CLEAN_RUN_PX),
      `the first ${CLEAN_RUN_PX}px right of spawn is not continuous flat hazard-free ground. ` +
        'phase-02-movement holds ArrowRight and asserts x never decreases; a pit, a step or a spike ' +
        'in this stretch fails it.',
    ).toBe(true);
  });

  it('...and a right-held player really does advance monotonically through it, enemies included', () => {
    // Simulated against the FULL world rather than inferred from the geometry, because an enemy that
    // closes to contact would knock the player back without any terrain being wrong.
    const xs = holdRight(shippedWorld(), 120);
    for (let i = 1; i < xs.length; i += 1) {
      expect(
        xs[i]!,
        `x went backwards at tick ${i} (${xs[i - 1]} -> ${xs[i]}). Something in the opening stretch ` +
          'knocks the player back, which is exactly what phase-02-movement fails on.',
      ).toBeGreaterThanOrEqual(xs[i - 1]!);
    }
    expect(xs[xs.length - 1]! - LEVEL.spawn.x, 'the player barely moved').toBeGreaterThan(CLEAN_RUN_PX / 2);
  });

  /**
   * `hudHelpers.ts` presses **only** ArrowRight and waits up to 20 s for the gear counter to reach 2.
   * So the first two gears must sit on the opening run at a height a walking player passes through —
   * not on a platform, and not beyond a jump.
   */
  it('the first two gears are collectable by holding Right alone', () => {
    const world = shippedWorld();
    holdRight(world, 1200); // 20 s at 60 Hz, the same budget the helper allows
    expect(
      world.gearsCollected,
      'holding ArrowRight for 20 s collected fewer than 2 gears. `hudHelpers.ts` presses no other ' +
        'key, so the HUD specs that need a non-zero counter will time out.',
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('the wall right of spawn — tilemapHelpers.wallRightOfSpawn', () => {
  const wall = (() => {
    const candidates = LEVEL.solids
      .filter((s) => s.x > LEVEL.spawn.x && s.y < LEVEL.spawn.y)
      .sort((a, b) => a.x - b.x);
    return candidates[0];
  })();

  it('exists — several specs resolve it by geometry and would throw without one', () => {
    expect(wall, 'no solid stands above the ground to the right of spawn').toBeDefined();
  });

  /**
   * The exact-pixel one. A right-held player must come to rest with their leading edge against the
   * wall's face, which is `wall.x - HALF_W` — asserted exactly, because a player who stops one pixel
   * short or one pixel inside means the collider or the box changed, not the level.
   */
  it('stops a right-held player at exactly wall.x - halfWidth', () => {
    const world = shippedWorld();
    holdRight(world, 400);
    expect(world.player.x, `expected the player to wall-stop at ${wall!.x - HALF_W}`).toBe(wall!.x - HALF_W);
  });

  it('has a tile drawn at its centre cell, so the wall is visible and not an invisible barrier', () => {
    const col = Math.floor((wall!.x + wall!.w / 2) / TILE_SIZE);
    const row = Math.floor((wall!.y + wall!.h / 2) / TILE_SIZE);
    expect(gidAt(col, row), `nothing is painted at the wall's centre cell (${col},${row})`).toBeGreaterThan(0);
  });
});

describe('the hazard — phase-06-health.spec.ts needs it re-enterable', () => {
  const hazard = LEVEL.hazards.filter((h) => h.x > LEVEL.spawn.x).sort((a, b) => a.x - b.x)[0];

  it('there is a hazard right of spawn', () => {
    expect(hazard, 'no hazard right of spawn — the health specs have nothing to be damaged by').toBeDefined();
  });

  /**
   * 🔴 Re-enterable for a SECOND hit. `phase-06-health.spec.ts` needs two damage events, and holding
   * ArrowRight crosses a 192 px strip well inside the i-frame window — so the player must be able to
   * back off onto clear ground and come at it again. 400 px is roughly 45 ticks of run-up.
   */
  it('has clear flat ground to its left, so a second approach is possible', () => {
    const from = hazard!.x - 400;
    expect(from, 'the hazard is too close to the spawn for a run-up').toBeGreaterThan(LEVEL.spawn.x);
    expect(
      flatGroundSpan(LEVEL, from, hazard!.x),
      'there is no clear flat ground in the 400px left of the hazard, so a player knocked back ' +
        'cannot line up a second approach — phase-06-health needs two damage events.',
    ).toBe(true);
  });

  it('is narrow enough to cross inside the i-frame window, so crossing it is one hit and not two', () => {
    // The measured window: 216 px clears standing, 240 needs a run-up, 252 is impassable
    // (`level-traversal.test.ts`). Anything in that band is a 12 px margin and was deliberately not
    // taken; 192 is the shipped width.
    expect(hazard!.w, 'the hazard is wider than the jump can carry').toBeLessThanOrEqual(216);
  });
});

describe('the drawn-tile cells — phase-04-assets-tiles.spec.ts, the only spec that reads a DRAWN gid', () => {
  const SURFACE_ROW = 20;
  const BURIED_ROW = 21;
  const DECOR_ROW = 19;
  const DECOR_COLS = [24, 25, 26, 27];
  const PILLAR_COL = 34;

  it.each(DECOR_COLS)('col %i row 20 is a walkable top — a solid whose surface it is', (col) => {
    const x = col * TILE_SIZE + TILE_SIZE / 2;
    const y = SURFACE_ROW * TILE_SIZE + TILE_SIZE / 2;
    const onSurface = LEVEL.solids.some((s) => s.y === SURFACE_ROW * TILE_SIZE && x > s.x && x < s.x + s.w);
    expect(onSurface, `col ${col} has no solid whose top is row ${SURFACE_ROW}`).toBe(true);
    expect(
      hasSolidAbove(LEVEL.solids, col, SURFACE_ROW, TILE_SIZE),
      `col ${col} row ${SURFACE_ROW} has a solid above it, so it will draw BRICK and the spec expects SURFACE`,
    ).toBe(false);
    expect(gidAt(col, SURFACE_ROW), 'nothing painted here at all').toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
  });

  it.each(DECOR_COLS)('col %i row 21 is BURIED — the discrimination half', (col) => {
    expect(
      hasSolidAbove(LEVEL.solids, BURIED_ROW, 0, TILE_SIZE) || hasSolidAbove(LEVEL.solids, col, BURIED_ROW, TILE_SIZE),
      `col ${col} row ${BURIED_ROW} is not buried, so it will draw SURFACE and the spec expects BRICK. ` +
        'Without a second ground row here, "the cap is right" and "everything is capped" are the same test.',
    ).toBe(true);
  });

  /**
   * ⚠️ Corrected against the level that already passes e2e, before the new one existed.
   *
   * The first draft demanded decoration painted at **all four** of cols 24–27, on the strength of
   * `phase-04-assets-tiles.spec.ts`'s comment — *"the spike run is authored decoration standing on it
   * at cols 24-27"*. Run against Phase 7's level-01 it went red at col 26, because the spike run is
   * cols 24–25 only: the hazard is 192 px wide from x 2304, and 192 px is two 96 px tiles. The spec's
   * prose was stale and the contract test copied it.
   *
   * What the spec actually needs is that cols 24–27 at row 20 stay capped, which requires no decoration
   * at all. So the decoration check is derived from the **hazard rectangle** rather than from a comment,
   * and the four-column assertion above stands on its own.
   */
  it('the spike decoration is DRAWN over its own hazard rect, and carries no collision', () => {
    const hazard = LEVEL.hazards.filter((h) => h.x > LEVEL.spawn.x).sort((a, b) => a.x - b.x)[0]!;
    const fromCol = Math.floor(hazard.x / TILE_SIZE);
    const toCol = Math.floor((hazard.x + hazard.w - 1) / TILE_SIZE);
    for (let col = fromCol; col <= toCol; col += 1) {
      expect(
        gidAt(col, DECOR_ROW),
        `col ${col} row ${DECOR_ROW} paints nothing, but a hazard rect covers it — spikes that hurt ` +
          'and are not drawn is the inverse of the Phase 4 defect and just as bad.',
      ).toBeGreaterThan(0);
    }
    // And it is decoration, not geometry. This states the intent so a future edit that puts a solid
    // over the spikes fails with the reason rather than with a tile index.
    const spikeBand: Rect = {
      x: fromCol * TILE_SIZE,
      y: DECOR_ROW * TILE_SIZE,
      w: (toCol - fromCol + 1) * TILE_SIZE,
      h: TILE_SIZE,
    };
    const covered = LEVEL.solids.some(
      (s) =>
        s.x < spikeBand.x + spikeBand.w &&
        s.x + s.w > spikeBand.x &&
        s.y < spikeBand.y + spikeBand.h &&
        s.y + s.h > spikeBand.y,
    );
    expect(covered, 'a collision rect covers the spike decoration; it must be art only').toBe(false);
  });

  /**
   * 🔴 The discriminating cell. `phase-04-assets-tiles.spec.ts` reads col 34 row 20 and expects BRICK,
   * because a solid stands on the ground there from row 17 to 19. **Without it, the four capped cells
   * above pass on a mutant that caps every tile unconditionally.**
   */
  it(`col ${PILLAR_COL} carries a solid standing on the ground, so the cell beneath stays brick`, () => {
    const standing = LEVEL.solids.filter(
      (s) => s.x <= PILLAR_COL * TILE_SIZE && s.x + s.w > PILLAR_COL * TILE_SIZE && s.y < SURFACE_ROW * TILE_SIZE,
    );
    expect(standing.length, `no solid stands above the ground at col ${PILLAR_COL}`).toBeGreaterThan(0);
    expect(
      hasSolidAbove(LEVEL.solids, PILLAR_COL, SURFACE_ROW, TILE_SIZE),
      `col ${PILLAR_COL} row ${SURFACE_ROW} must be BURIED by the solid standing on it, or the four ` +
        'capped cells above stop discriminating anything.',
    ).toBe(true);
  });
});

describe('authoring order — phase-03-element-editor.spec.ts', () => {
  /**
   * The editor selects collision strips by index and its spec drives strip **0**, expecting the strip
   * the player is standing on. The builder must therefore emit the spawn's ground run first.
   */
  it('the spawn stands on collision object index 0', () => {
    const first = LEVEL.solids[0]!;
    expect(first.y, 'solids[0] is not at the spawn height').toBe(LEVEL.spawn.y);
    expect(LEVEL.spawn.x, 'solids[0] does not span the spawn').toBeGreaterThan(first.x);
    expect(LEVEL.spawn.x).toBeLessThan(first.x + first.w);
  });
});
