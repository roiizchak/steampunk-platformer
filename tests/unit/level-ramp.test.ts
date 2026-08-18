/**
 * The difficulty ramp — criterion 8.5, and vault 5.7's "report the spread, not the headline".
 *
 * ## Measured, and reported as a per-metric table
 *
 * Every number below comes off the shipped `.tmj` through the real parser, or out of `derivedFeel`
 * running the real sim. Nothing is typed. The table is printed by `npm test -- level-ramp` and pasted
 * into `docs/qa/phase-08-levels.md`, one row per metric across the five levels plus min / max / median.
 *
 * 🔴 **There is deliberately no composite difficulty score.** Vault 8.3 says cross-level absolute-stat
 * comparisons are suspect and vault 5.7 says report the spread, not the headline. A single number would
 * be both at once: a weighted sum of incommensurable units, presented as if it meant something.
 *
 * ## 🔴 A table is a measurement, not a gate
 *
 * Five identical levels produce a table, a spread of zero, and a green criterion. So four properties are
 * asserted, and each exists because a different wrong ramp passes without it:
 *
 * | property | the ramp it refuses |
 * |---|---|
 * | **non-vacuity** | five identical levels — every metric's spread is 0 |
 * | **direction** | a flat ramp, where the five named metrics never rise |
 * | **no backslide** | a level that gets *easier* on a metric outside the directional set |
 * | **no cliff** | a level that doubles a metric, which is a wall rather than a step |
 *
 * The directional set and the reasons each member is in it are named below, and so is every metric
 * deliberately left free. **A metric list without that reasoning is how a reversed ramp passes** —
 * Codex plan review F3 rejected an earlier draft with only three directional metrics and a rule that
 * bounded increases only, under which level 1 could legally be the hardest.
 */

import { describe, expect, it } from 'vitest';

import { TILE_SIZE } from '../../src/game/constants';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { derivedFeel } from '../../src/sim/derived';
import { DEFAULT_TUNING } from '../../src/sim/player';
import { ticksToMs } from '../../src/sim/index';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const FEEL = derivedFeel(DEFAULT_TUNING, ticksToMs);

/**
 * The widest gap the sim is known to cross, from `level-traversal.test.ts`'s measured sweep.
 *
 * A gap has no height to clear, so it is a longer reach than a hazard of the same width. 288 px is the
 * value the shipped levels use at their hardest, and it is expressed here as a DENOMINATOR so the gap
 * metric reads as a fraction of what is possible rather than as a raw pixel count *(vault 8.3)*.
 */
const CLEARABLE_GAP_PX = 288;

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

/** Distinct walkable surface heights, top-most first — the same derivation the reach gate uses. */
const surfaceTops = (level: LevelData): number[] =>
  [...new Set(level.solids.map((s) => s.y))].sort((a, b) => b - a);

/** The widest hole in the walking surface, in px, from the strips at the spawn's height. */
function widestGap(level: LevelData): number {
  const floors = level.solids.filter((s) => s.y === level.spawn.y).sort((a, b) => a.x - b.x);
  let widest = 0;
  for (let i = 1; i < floors.length; i += 1) {
    widest = Math.max(widest, floors[i]!.x - (floors[i - 1]!.x + floors[i - 1]!.w));
  }
  return widest;
}

/** The largest step between consecutive distinct surface heights, in px. */
function maxRise(level: LevelData): number {
  const tops = surfaceTops(level);
  let rise = 0;
  for (let i = 1; i < tops.length; i += 1) rise = Math.max(rise, tops[i - 1]! - tops[i]!);
  return rise;
}

/** Gears that are NOT on the walking surface — the ones a climb or a jump is required for. */
const gearsOffTheFloor = (level: LevelData): number =>
  level.gears.filter((g) => g.y < level.spawn.y - TILE_SIZE * 2).length;

/**
 * Every metric, and whether it is DIRECTIONAL.
 *
 * A directional metric must be non-decreasing in level order. Non-decreasing rather than strictly
 * increasing: one plateau in five levels is a design choice, and two of these are held at a measured
 * ceiling on purpose — see `level-04.mjs`.
 */
interface Metric {
  name: string;
  /** Must not decrease across the five levels. */
  directional: boolean;
  /** Why it is directional, or why it is deliberately free. Read by criterion 8.5's reviewer. */
  reason: string;
  of: (level: LevelData) => number;
}

const METRICS: Metric[] = [
  {
    name: 'length px',
    directional: true,
    reason: 'a longer level is more to survive without dying, whatever else it contains',
    of: (l) => l.widthPx,
  },
  {
    name: 'hazard total px',
    directional: true,
    reason: 'the total width of terrain that costs hp — the most direct measure of danger there is',
    of: (l) => l.hazards.reduce((sum, h) => sum + h.w, 0),
  },
  {
    name: 'enemy count',
    directional: true,
    reason: 'more things that move and chase; unlike hazards they follow the player',
    of: (l) => l.enemies.length,
  },
  {
    name: 'max rise / apex',
    directional: true,
    reason:
      'the tallest single step as a fraction of the MEASURED apex, so it says how close to the ' +
      "player's ceiling the level asks them to jump rather than how many pixels it is",
    of: (l) => Number((maxRise(l) / FEEL.apexPx).toFixed(3)),
  },
  {
    name: 'widest gap / clearable',
    directional: true,
    reason:
      'the widest hole as a fraction of the measured clearable distance — 1.0 means a run-up is ' +
      'mandatory and there is no margin left',
    of: (l) => Number((widestGap(l) / CLEARABLE_GAP_PX).toFixed(3)),
  },
  /**
   * 🔴 The two composition metrics, added after the Phase 8 code-reviewer gate owner pointed out that
   * **`enemy count` cannot see WHICH enemies they are**: swapping level-05's two sentries for two
   * scavengers moves no metric in this table, and the ramp gate stays green on a level whose threat
   * profile was rewritten. A sentry and a scavenger are not interchangeable — one shoots 640 px and
   * never leaves its post, the other closes and does contact damage.
   *
   * FREE rather than directional, because the mix is a design choice, not a difficulty axis: a level
   * built around turrets is not harder than one built around chasers. What makes them useful is that
   * *free is not unwatched* — no-backslide, no-cliff and the per-metric non-vacuity all apply, so the
   * swap above would have to keep both counts within 25 % to pass.
   */
  {
    name: 'sentry count',
    directional: false,
    reason:
      'FREE. The mix of enemy KINDS is a design choice, not a difficulty axis — but it must be ' +
      'visible, or `enemy count` blesses any substitution that keeps the total.',
    of: (l) => l.enemies.filter((e) => e.slug === 'brass-sentry').length,
  },
  {
    name: 'scavenger count',
    directional: false,
    reason: 'FREE, for the same reason as `sentry count`, and it is the other half of that pair.',
    of: (l) => l.enemies.filter((e) => e.slug === 'rust-scavenger').length,
  },
  {
    name: 'gear count',
    directional: false,
    reason:
      'FREE. Gears are optional score, not difficulty. A level with fewer of them is not harder, and ' +
      'forcing it to rise would make the last level a collectathon.',
    of: (l) => l.gears.length,
  },
  {
    name: 'gears off the floor',
    directional: false,
    reason:
      'FREE, and it is the interesting free one: it measures how much of the score is behind a climb. ' +
      'It should broadly rise, but tying it to the ramp would forbid a level whose challenge is ' +
      'horizontal rather than vertical.',
    of: gearsOffTheFloor,
  },
  {
    name: 'distinct surface heights',
    directional: false,
    reason:
      'FREE. More heights is more structure, not more difficulty — a staircase of six gentle steps is ' +
      'easier than one 4-tile wall, and this metric cannot tell them apart.',
    of: (l) => surfaceTops(l).length,
  },
  {
    name: 'hazard count',
    directional: false,
    reason:
      'FREE, because `hazard total px` already carries the danger. Splitting one 4-tile strip into two ' +
      '2-tile strips raises this and lowers the difficulty.',
    of: (l) => l.hazards.length,
  },
  {
    name: 'painted %',
    directional: false,
    reason:
      'FREE. Density is the LOOK the owner asked for, and it is reported here so the ramp table shows ' +
      'it moving — but a denser level is not a harder one and must never be gated as if it were.',
    of: (l) => Number(((l.solids.reduce((s, r) => s + (r.w * r.h) / (TILE_SIZE * TILE_SIZE), 0) / ((l.widthPx * l.heightPx) / (TILE_SIZE * TILE_SIZE))) * 100).toFixed(1)),
  },
];

const DIRECTIONAL = METRICS.filter((m) => m.directional);

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** The table, printed for the QA log. Not an assertion — the four properties below are. */
function reportTable(): string {
  const head = `| metric | dir | ${LEVELS.map(([id]) => id).join(' | ')} | min | max | median |`;
  const rule = `|---|---|${LEVELS.map(() => '---').join('|')}|---|---|---|`;
  const rows = METRICS.map((m) => {
    const values = LEVELS.map(([, l]) => m.of(l));
    return `| ${m.name} | ${m.directional ? '↑' : '—'} | ${values.join(' | ')} | ${Math.min(
      ...values,
    )} | ${Math.max(...values)} | ${median(values)} |`;
  });
  return [head, rule, ...rows].join('\n');
}

describe('the difficulty ramp is measured and reported as a spread (8.5, vault 5.7)', () => {
  it('has five levels to compare, in catalog order', () => {
    // Without this every property below is satisfied by a one-level game.
    expect(LEVELS.length).toBe(5);
    expect(LEVELS.map(([id]) => id)).toEqual(['level-01', 'level-02', 'level-03', 'level-04', 'level-05']);
  });

  it('prints the per-metric table for the QA log', () => {
    // ⚠️ No assertion. The draft here checked `table.split('\n').length === METRICS.length + 2`, which
    // `reportTable` satisfies by construction for ANY game data and could therefore never go red —
    // decoration wearing the shape of a gate *(vault C2)*. What the table is FOR is asserted by the
    // five properties below; printing it is a report, not a check, and saying so is honest.
    // eslint-disable-next-line no-console
    console.log(`\n${reportTable()}\n`);
  });

  /**
   * 🔴 Property 0 — every STEP raises something. Non-decreasing is not the same as a ramp.
   *
   * Properties 1-4 below are all satisfied by a level-05 that is a cosmetic reskin of level-04: same
   * length, same hazard total, same enemies, same rise, same gap. Non-vacuity only asks that the five
   * levels differ SOMEWHERE, and levels 01-04 already provide that; direction asks for `>=`, which
   * equality satisfies; no-backslide and no-cliff both pass a change of zero. So a five-level ramp
   * that climbs for four levels and then flatlines shipped green, and "the difficulty ramp across the
   * five levels" does not mean that. Named by the Phase 8 qa-expert's adversarial brief.
   *
   * Deliberately "at least ONE directional metric", not all five: two of them are held at a measured
   * ceiling on purpose (see `level-04.mjs`), and requiring every metric to rise every time would
   * forbid the plateau the design chose.
   */
  it('every step up the ramp raises at least one directional metric', () => {
    for (let i = 1; i < LEVELS.length; i += 1) {
      const risen = DIRECTIONAL.filter((m) => m.of(LEVELS[i]![1]) > m.of(LEVELS[i - 1]![1])).map((m) => m.name);
      expect(
        risen.length,
        `nothing directional rose between ${LEVELS[i - 1]![0]} and ${LEVELS[i]![0]}: the later level ` +
          'is a reskin of the earlier one. Every other property in this file passes on that, because ' +
          'they bound decrease and growth rather than requiring any.',
      ).toBeGreaterThan(0);
    }
  });

  /**
   * 🔴 Property 1 — NON-VACUITY. Five identical levels produce a perfectly well-formed table with a
   * spread of zero on every row, and every other property below is trivially satisfied by them.
   */
  it.each(METRICS.map((m) => [m.name, m] as const))('%s varies across the five levels', (name, metric) => {
    const values = LEVELS.map(([, l]) => metric.of(l));
    expect(
      Math.max(...values) - Math.min(...values),
      `"${name}" is identical in all five levels, so the ramp says nothing about it. ${metric.reason}`,
    ).toBeGreaterThan(0);
  });

  /**
   * 🔴 Property 2 — DIRECTION. Five metrics, each with its reason recorded above.
   *
   * Codex plan review F3: an earlier draft named only three, which left a reversed ramp legal — the
   * remaining metrics could fall as far as they liked and the gate stayed green.
   */
  it.each(DIRECTIONAL.map((m) => [m.name, m] as const))('%s never decreases in level order', (name, metric) => {
    const values = LEVELS.map(([, l]) => metric.of(l));
    for (let i = 1; i < values.length; i += 1) {
      expect(
        values[i]!,
        `"${name}" fell from ${values[i - 1]} to ${values[i]} between ${LEVELS[i - 1]![0]} and ` +
          `${LEVELS[i]![0]}. It is in the directional set because: ${metric.reason}`,
      ).toBeGreaterThanOrEqual(values[i - 1]!);
    }
  });

  /**
   * 🔴 Property 3 — NO BACKSLIDE. Codex finding F3's other half.
   *
   * A metric outside the directional set may vary — that is what "free" means — but a 30 % collapse
   * between consecutive levels is not variation, it is the level getting easier while the directional
   * metrics carry the gate. 25 % is the bound; it permits a design choice and refuses a slide.
   */
  const MAX_DROP = 0.25;

  it.each(METRICS.filter((m) => !m.directional).map((m) => [m.name, m] as const))(
    '%s does not collapse between consecutive levels',
    (name, metric) => {
      const values = LEVELS.map(([, l]) => metric.of(l));
      for (let i = 1; i < values.length; i += 1) {
        const before = values[i - 1]!;
        if (before === 0) continue;
        const drop = (before - values[i]!) / before;
        expect(
          drop,
          `"${name}" dropped ${(drop * 100).toFixed(0)} % from ${before} to ${values[i]} between ` +
            `${LEVELS[i - 1]![0]} and ${LEVELS[i]![0]}. It is deliberately free (${metric.reason}), ` +
            'but a collapse that large means the level got easier while the directional metrics ' +
            'carried the gate.',
        ).toBeLessThanOrEqual(MAX_DROP);
      }
    },
  );

  /**
   * 🔴 Property 4 — NO CLIFF. A metric that more than doubles between consecutive levels is a wall,
   * not a step: whatever the player learned on the level before does not transfer.
   */
  it.each(METRICS.map((m) => [m.name, m] as const))('%s does not more than double in one step', (name, metric) => {
    const values = LEVELS.map(([, l]) => metric.of(l));
    for (let i = 1; i < values.length; i += 1) {
      const before = values[i - 1]!;
      if (before === 0) continue;
      expect(
        values[i]! / before,
        `"${name}" went from ${before} to ${values[i]} between ${LEVELS[i - 1]![0]} and ` +
          `${LEVELS[i]![0]} — more than double in one step. That is a wall, not a ramp.`,
      ).toBeLessThanOrEqual(2);
    }
  });

  /**
   * Vault 8.5's spacing half, recorded rather than assumed.
   *
   * The vault item is "any global difficulty change is a uniform delta — additive preserves
   * differences, normalisation preserves neither". No global difficulty KNOB is added this phase, so
   * that half does not apply and is recorded as not applying. The SPACING half does: this asserts the
   * gaps between consecutive levels stay comparable rather than one step carrying the whole ramp.
   */
  it.each(DIRECTIONAL.map((m) => [m.name, m] as const))(
    '%s rises in comparable steps rather than one leap',
    (name, metric) => {
      const values = LEVELS.map(([, l]) => metric.of(l));
      const distinct = new Set(values).size;

      /**
       * 🔴 **Skipped for a metric that takes two values or fewer, and this exclusion was forced by a
       * red run rather than anticipated.**
       *
       * `max rise / apex` and `widest gap / clearable` both failed at 100 %. They are quantised by the
       * 96 px grid: a rise is a whole number of tiles, level-01's is pinned at 3 by
       * `phase-04-assets-tiles.spec.ts`, and 4 tiles is 93 % of the measured apex. So the metric has
       * exactly TWO usable values across the whole game, and one of the two transitions must carry
       * 100 % of the rise. **No level design can satisfy this property for those metrics** — the
       * property was wrong, not the levels, and dropping it outright would have been worse: it is a
       * real gate for length, hazard total and enemy count, where a single leap genuinely is one hard
       * level with three easy ones in front of it.
       *
       * A metric this coarse is still gated by the direction property and by non-vacuity; what is
       * given up is only the shape of its rise, which it does not have enough resolution to have.
       */
      if (distinct <= 2) {
        expect(distinct, `"${name}" never varies — see the non-vacuity property`).toBe(2);
        return;
      }

      const steps = values.slice(1).map((v, i) => v - values[i]!);
      const rising = steps.filter((s) => s > 0);
      expect(rising.length, `"${name}" never rises at all — see the direction property`).toBeGreaterThan(0);
      const total = steps.reduce((a, b) => a + b, 0);
      for (const step of rising) {
        expect(
          step / total,
          `"${name}" puts ${((step / total) * 100).toFixed(0)} % of its whole rise into a single step. ` +
            'That is one hard level with three easy ones in front of it, not a ramp.',
        ).toBeLessThanOrEqual(0.75);
      }
    },
  );
});
