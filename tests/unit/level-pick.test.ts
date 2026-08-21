/**
 * The boot path's level choice, run without a browser. Phase 8, criterion 8.3.
 *
 * `progress-unlock.test.ts` gates the rule and `save-progress.test.ts` gates the bytes; this gates the
 * **wiring** — that `pickLevel` really does route the save through `resolveEntryLevel` rather than
 * reaching for `catalog.levels[0]` (what it did until this phase) or trusting `lastLevel` outright.
 * Two correct halves joined by a wrong call is exactly the shape a unit-tested module and an
 * unreachable seam produce, and this file is the seam.
 *
 * ## Why this can be a unit test at all
 *
 * `gameLevelPick.ts` imports `Phaser` as a **type only**, and `pickLevel` takes its storage as an
 * injectable argument. So the module evaluates with Phaser uninstalled, and this file runs under
 * `npm run test:sim-isolated` beside the sim suite. A fake scene is four properties.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { CATALOG_KEY } from '../../src/game/assetCatalog';
import { PROGRESS_KEY, resetProgressCache } from '../../src/game/save';
import { RENDER_SCALE } from '../../src/game/constants';
import {
  firstLevelId,
  hitstopScaleFromSearch,
  levelOrder,
  openLevelSelect,
  pickLevel,
  worldOptionsFor,
} from '../../src/scenes/gameLevelPick';
import { LEVEL_01, SHIPPED, SHIPPED_ENTRIES, idOf } from './tilemap-data-fixtures';

/** Five catalogued ids, only one of which has real bytes behind it. */
const ORDER = ['level-01', 'level-02', 'level-03', 'level-04', 'level-05'];

/** The real shipped level's parsed JSON, reused for every catalogued key. */
const LEVEL_JSON = JSON.parse(SHIPPED[Object.keys(SHIPPED)[0]!]!) as unknown;

/**
 * A `Phaser.Scene`-shaped fake: the two caches `pickLevel` reads, plus the scene key and `start`
 * that `openLevelSelect` needs. Typed through `as never` at the call, because reproducing
 * `Phaser.Scene`'s full surface would be a mock, and a mock of a class this file never constructs is
 * more code than the thing it stands in for.
 */
function fakeScene(order = ORDER, key = 'Game') {
  const started: { key: string; data?: unknown }[] = [];
  return {
    cache: {
      json: { get: (k: string) => (k === CATALOG_KEY ? { levels: order.map((id) => ({ key: id })) } : undefined) },
      tilemap: { get: () => ({ data: LEVEL_JSON }) },
    },
    scene: { key, start: (k: string, data?: unknown) => void started.push({ key: k, data }) },
    started: () => started,
  };
}

const store = (json?: string) => {
  const map = new Map<string, string>(json === undefined ? [] : [[PROGRESS_KEY, json]]);
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
};

const pick = (requested: string | null, json?: string, order = ORDER) =>
  pickLevel(fakeScene(order) as never, requested, store(json));

/**
 * ⚠️ `pickLevel` writes the resume point, and a write through a refused storage is held in module
 * state so the session still progresses. Cleared between tests, or the `storage: null` case below
 * would leak its save into every test after it.
 */
beforeEach(resetProgressCache);

describe('levelOrder is the catalog, in catalog order', () => {
  it('reads the keys off the entries, unsorted', () => {
    // Reversed input, reversed output. A sort here would silently re-impose a naming convention on
    // progression, which is the thing `progress.ts` is built not to do *(vault 3.3)*.
    expect(levelOrder({ levels: [{ key: 'level-03' }, { key: 'level-01' }] } as never)).toEqual([
      'level-03',
      'level-01',
    ]);
  });

  it('names the first catalogued level, which is what the DEV scenes open', () => {
    expect(firstLevelId(fakeScene() as never)).toBe('level-01');
  });
});

describe('pickLevel routes the save through the unlock rule', () => {
  it('plays the first level on a fresh save', () => {
    expect(pick(null).key).toBe('level-01');
  });

  it('honours an explicit request for an unlocked level', () => {
    const json = '{"version":1,"lastLevel":"level-01","levels":{"level-01":{"completed":true,"bestGears":3}}}';
    expect(pick('level-02', json).key).toBe('level-02');
  });

  it('resumes `lastLevel` when nothing was requested', () => {
    const json = '{"version":1,"lastLevel":"level-02","levels":{"level-01":{"completed":true,"bestGears":3}}}';
    expect(pick(null, json).key).toBe('level-02');
  });

  /**
   * 🔴 The two hostile saves, at the seam rather than in `progress.ts`.
   *
   * These pass in `progress-unlock.test.ts` too — and would keep passing there if `pickLevel` never
   * called the function. That is the whole reason this file exists.
   */
  it('refuses a saved level the catalog does not contain, rather than throwing inside create()', () => {
    const json = '{"version":1,"lastLevel":"level-09","levels":{}}';
    expect(() => pick(null, json)).not.toThrow();
    expect(pick(null, json).key).toBe('level-01');
  });

  it('refuses a well-formed save that points at a LOCKED level', () => {
    // Ten seconds in devtools, and without the unlock test it hands over the whole game.
    expect(pick(null, '{"version":1,"lastLevel":"level-05","levels":{}}').key).toBe('level-01');
  });

  it('refuses a locked explicit request', () => {
    expect(pick('level-04', '{"version":1,"lastLevel":null,"levels":{}}').key).toBe('level-01');
  });

  it('survives storage being refused outright', () => {
    expect(pickLevel(fakeScene() as never, null, null).key).toBe('level-01');
  });

  it('throws a NAMED error when the catalog lists no levels', () => {
    // Boot refuses to route on an empty catalog, so this is unreachable in production — but a thrown
    // error with a message beats `parseLevel(undefined)` three frames later, which surfaces as
    // `ready:false` with `bootError:null`.
    expect(() => pick(null, undefined, [])).toThrow(/lists no levels/);
  });

  /**
   * 🔴 The resume point is written when a level STARTS. Without it, `recordCompletion`'s `lastLevel` is
   * the level just FINISHED, and a player who closes the tab after starting the next one comes back to
   * a level they have already beaten. Found by the browser spec, which read `level-01` after advancing
   * to level-02.
   */
  it('writes the resume point when a level starts', () => {
    const scene = fakeScene();
    const storage = store('{"version":1,"lastLevel":"level-01","levels":{"level-01":{"completed":true,"bestGears":3}}}');
    pickLevel(scene as never, 'level-02', storage);
    const saved = JSON.parse(storage.getItem(PROGRESS_KEY)!) as { lastLevel: string };
    expect(saved.lastLevel, 'starting level-02 did not move the resume point').toBe('level-02');
  });

  /**
   * ⚠️ A first boot DOES write, and that is correct rather than a leak.
   *
   * The draft above this one asserted no save appears until something is earned, on the reasoning that
   * "completed nothing" and "never played" must stay distinguishable. They do: what distinguishes them
   * is `levels`, which stays EMPTY, and `completedIds` reads only that. `lastLevel: 'level-01'` is
   * simply true — it is the level the player is on — and it unlocks nothing.
   */
  it('a first boot records the resume point but earns nothing', () => {
    const storage = store();
    pickLevel(fakeScene() as never, null, storage);
    const saved = JSON.parse(storage.getItem(PROGRESS_KEY)!) as { lastLevel: string; levels: object };
    expect(saved.lastLevel).toBe('level-01');
    expect(saved.levels, 'a first boot marked something completed').toEqual({});
  });

  /**
   * ⚠️ And NOT from a dev scene. `PlaygroundScene` and `ElementEditorScene` both extend `GameScene` and
   * come through `pickLevel` with an explicit id, so without the scene-key guard opening a dev tool
   * would rewrite the player's resume point.
   */
  it('does not move the resume point from a dev scene', () => {
    const storage = store('{"version":1,"lastLevel":"level-03","levels":{"level-01":{"completed":true,"bestGears":0},"level-02":{"completed":true,"bestGears":0}}}');
    pickLevel(fakeScene(ORDER, 'ElementEditor') as never, 'level-01', storage);
    const saved = JSON.parse(storage.getItem(PROGRESS_KEY)!) as { lastLevel: string };
    expect(saved.lastLevel, 'opening the Element Editor moved the player resume point').toBe('level-03');
  });

  it('returns the parsed level, not just its key', () => {
    const { level } = pick(null);
    expect(level.id).toBe('level-01');
    expect(level.solids.length).toBeGreaterThan(0);
    expect(level.goal.w).toBeGreaterThan(0);
  });
});

describe('worldOptionsFor takes every field from the level', () => {
  /**
   * Field by field against the parsed level, because the defect this guards is a **dropped** field:
   * `createWorld` defaults `goal`, `gears`, `hazards` and `enemies` to empty, so forgetting one
   * compiles, boots, and ships a level whose spikes are drawn and harmless. Phase 4 shipped exactly
   * that.
   */
  it('passes the solids, spawn, bounds, hazards, enemies, gears and goal straight through', () => {
    const options = worldOptionsFor(LEVEL_01);
    expect(options.solids).toBe(LEVEL_01.solids);
    expect(options.spawn).toBe(LEVEL_01.spawn);
    expect(options.hazards).toBe(LEVEL_01.hazards);
    expect(options.enemies).toBe(LEVEL_01.enemies);
    expect(options.gears).toBe(LEVEL_01.gears);
    expect(options.goal).toBe(LEVEL_01.goal);
    expect(options.bounds).toEqual({ widthPx: LEVEL_01.widthPx, heightPx: LEVEL_01.heightPx });
    expect(options.scale).toBe(RENDER_SCALE);
  });

  it('is non-vacuous: the shipped level really does carry all four entity lists', () => {
    // Without this, every `toBe` above could be comparing `[]` with `[]`.
    expect(LEVEL_01.hazards.length, 'the shipped level has no hazards to pass through').toBeGreaterThan(0);
    expect(LEVEL_01.enemies.length).toBeGreaterThan(0);
    expect(LEVEL_01.gears.length).toBeGreaterThan(0);
    expect(LEVEL_01.goal.h).toBeGreaterThan(0);
  });

  it('uses a FIXED seed, so an e2e run and a hands-on run are the same run (vault 2.3)', () => {
    expect(worldOptionsFor(LEVEL_01).seed).toBe(worldOptionsFor(LEVEL_01).seed);
    expect(typeof worldOptionsFor(LEVEL_01).seed).toBe('number');
  });
});

describe('openLevelSelect only leaves the PRODUCTION play scene', () => {
  it('starts the menu from Game', () => {
    const scene = fakeScene();
    openLevelSelect(scene as never);
    expect(scene.started()).toEqual([{ key: 'LevelSelect', data: undefined }]);
  });

  /**
   * 🔴 `PlaygroundScene` and `ElementEditorScene` both `extends GameScene` and inherit the ESC
   * binding. Playground leaves player input ON — walking around while sweeping a knob is the point of
   * it — so `playerInputEnabled` would not have stopped this. The scene key is the question that
   * actually distinguishes them.
   */
  it.each(['Playground', 'ElementEditor', 'Gym'])('does nothing from %s', (key) => {
    const scene = fakeScene(ORDER, key);
    openLevelSelect(scene as never);
    expect(scene.started()).toEqual([]);
  });
});

describe('every catalogued level is one of the shipped files', () => {
  /**
   * 🔴 The gate the plan found missing: nothing compared the `.tmj` set with the catalog set. A file
   * present but uncatalogued is unit-tested and never shipped; a catalogued key with no file makes
   * Boot refuse to route on every single spec.
   *
   * Set EQUALITY, not containment, because the two failures are opposite and only one of them is
   * loud.
   */
  it('matches the catalog set exactly', () => {
    const shipped = SHIPPED_ENTRIES.map(([id]) => id).sort();
    const catalogued = levelOrder(
      JSON.parse(
        Object.values(
          import.meta.glob('../../public/assets/index.json', { query: '?raw', import: 'default', eager: true }),
        )[0] as string,
      ),
    ).sort();
    expect(shipped.length, 'no levels shipped, so this comparison proves nothing').toBeGreaterThan(0);
    expect(catalogued).toEqual(shipped);
  });

  it('derives its ids the same way the glob does, so the comparison is not two conventions', () => {
    expect(idOf('../../public/assets/levels/level-03.tmj')).toBe('level-03');
  });
});

/**
 * `?hitstop=N` — the DEV freeze knob, and the only gate it has.
 *
 * 🔴 **This block exists because the fix that closed a HIGH review finding shipped with nothing
 * watching it.** `hitstopScaleFromSearch` was module-private and read `globalThis.location` itself,
 * so no unit test could reach it: mutating `Number.isInteger` to `Number.isFinite` left the whole
 * suite — 123 files, 2060 tests — green with a float duration reaching `src/sim/`. The e2e spec
 * drives two of the seven branches below and takes 15 s per arm to do it.
 *
 * ⚠️ Every case here is non-vacuous only because `?hitstop=0` returns **0**. The function's first
 * statement is `if (!import.meta.env.DEV) return 1`, so if this suite ever ran with `DEV` false
 * every assertion below would collapse onto the fallback and prove nothing — except that one, which
 * cannot return 0 outside DEV. It is the first case for that reason.
 */
describe('hitstopScaleFromSearch — the DEV freeze knob (`?hitstop=`)', () => {
  it('reads a plain integer, INCLUDING zero — the arm B the e2e freeze gate needs', () => {
    // 0 is the whole point of the knob: it is the committed fixture on the other side of the
    // threshold (C2). It is also what proves the DEV branch is live in this suite.
    expect(hitstopScaleFromSearch('?hitstop=0')).toBe(0);
    expect(hitstopScaleFromSearch('?hitstop=1')).toBe(1);
    expect(hitstopScaleFromSearch('?hitstop=3')).toBe(3);
  });

  it('falls back to 1 when the knob is absent or empty', () => {
    expect(hitstopScaleFromSearch('')).toBe(1);
    expect(hitstopScaleFromSearch('?feel=2')).toBe(1);
    // `Number('')` is 0, and 0 is an integer — so the empty value needs its own branch or it gets
    // the single most destructive setting while the docstring promises the shipped behaviour.
    expect(hitstopScaleFromSearch('?hitstop=')).toBe(1);
    expect(hitstopScaleFromSearch('?hitstop=%20')).toBe(1);
  });

  it('REFUSES a fractional scale — the collision that draws lethal sparks off a claw', () => {
    // 6 * 1.5 = 9 collides with `lethal`'s 9 in `IMPACT_BY_FREEZE`, which is keyed on
    // `hitstopUntil - lastHitTick`. The symptom is silent: the wrong sparks, the wrong shake,
    // nothing red. And 0.3 puts a float duration inside `src/sim/` (CLAUDE.md §3).
    expect(hitstopScaleFromSearch('?hitstop=1.5')).toBe(1);
    expect(hitstopScaleFromSearch('?hitstop=0.3')).toBe(1);
    expect(hitstopScaleFromSearch('?hitstop=2.0000001')).toBe(1);
  });

  it('REFUSES a scale that overflows the deadline — `Number.isInteger(1e308)` is true', () => {
    // The trap in the obvious predicate: 1e308 has no fractional part, so `isInteger` admits it,
    // and `tickCount + 4 * 1e308` is `Infinity` — a freeze no tick count can ever pass.
    expect(Number.isInteger(1e308), 'the premise: isInteger alone does NOT reject this').toBe(true);
    expect(hitstopScaleFromSearch('?hitstop=1e308')).toBe(1);
    expect(hitstopScaleFromSearch('?hitstop=1e21')).toBe(1);
  });

  it('REFUSES a negative, an unparseable value and a non-finite one', () => {
    expect(hitstopScaleFromSearch('?hitstop=-2')).toBe(1);
    expect(hitstopScaleFromSearch('?hitstop=-0.5')).toBe(1);
    expect(hitstopScaleFromSearch('?hitstop=nonsense')).toBe(1);
    expect(hitstopScaleFromSearch('?hitstop=NaN')).toBe(1);
    expect(hitstopScaleFromSearch('?hitstop=Infinity')).toBe(1);
  });

  it('is what `worldOptionsFor` puts on the world, so the parser is on the shipped path', () => {
    // Without this the parser could be correct and unwired — the exact shape the `pickLevel` block
    // above exists to catch. `location` is undefined under vitest, so this is the absent case.
    expect(worldOptionsFor(LEVEL_01).hitstopScale).toBe(1);
  });
});
