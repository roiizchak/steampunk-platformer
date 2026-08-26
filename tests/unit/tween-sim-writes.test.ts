/**
 * Criterion 9.2's SECOND half — **no sim-owned state written from a tween callback** — as a GATE.
 *
 * It did not exist until 2026-08-24. `tween-callback-boundary.test.ts` forbids **sequencing**: a
 * scene transition, an event emission, the level-completion callback. The Codex implementation
 * review's second blocker was that this is not the whole criterion, and it was right —
 * `world.completed = true`, `player.hp = 0`, `writeProgress()`, spawning or removing an entity, and
 * a flag consumed next tick **all passed**.
 *
 * Split from that file rather than added to it: the two rules answer to different machinery (a
 * regex over blanked source; a parser), and together they cross the 400-line rule.
 *
 * ⚠️ **This is a NEW ARCHITECTURAL RULE, and criterion 9.2 does not authorise inventing one.** The
 * owner was asked before any of it was written and authorised it on 2026-08-24, along with the
 * parser dependency it needed. Both are recorded in `docs/qa/session-phase-09-debts.md`.
 *
 * ## The D1 overlap — stated, NOT closed
 *
 * 9.1's *"a freeze is not a tween"* half is carried only by `sim-boundary.test.ts`. A freeze
 * re-implemented scene-side as an `addCounter` writing `world.player.{x,y,vx,vy}` would now be
 * caught **here** — but only because it is a tween callback. The same write from a plain
 * `requestAnimationFrame` is not this file's business and nothing else gates it. This phase's own
 * e2e harness does exactly that, deliberately (`tests/e2e/effectShake.ts`), which is why the scan
 * reads `src/` and only `src/`. **The remainder of D1 is still open.**
 */

import { describe, expect, it } from 'vitest';
import { ALL_SOURCES } from './sourceScan';
import { callbackNodes, parseFile, simWriteViolations } from './tweenCallbacks';

/** A newline inside a fixture literal, named so the shell that writes this file cannot eat it. */
const NL = '\n';

describe('9.2b — no sim-owned state is written from a tween callback', () => {
  it('the scan is not vacuous: it parses real files and EXTRACTS real callback bodies', () => {
    // 🔴 The check that matters is how many callback BODIES came out, not whether the call threw.
    //
    // ⚠️ The reason first given here was WRONG and is corrected rather than deleted: `errorRecovery`
    // does NOT hand back a partial tree on a file the parser chokes on — it still throws (measured
    // 2026-08-25). The check is worth having for a different reason, and the real one is stronger: a
    // file that yields ZERO callback bodies is indistinguishable from a file that legitimately has
    // none, so every rule below would report it clean. That is the silent-zero failure mode this
    // project has already paid for twice (a burst of zero particles; a run that selected no tests).
    const extracted = Object.entries(ALL_SOURCES).map(
      ([file, src]) => [file, callbackNodes(parseFile(src)).length] as const,
    );
    const withCallbacks = extracted.filter(([, n]) => n > 0);
    expect(
      withCallbacks.map(([f]) => f).sort(),
      'no file in src/ yielded a tween callback body — the rules below are asserting about nothing',
    ).not.toEqual([]);
    // 🔴 THREE files, not four, and the difference is a fact worth pinning. The five live
    // `tweens.add` sites live in four files, but `goalLayer.ts`'s goal pulse registers **no
    // callback at all** — it is a yoyo whose end state is its start state, which is finding D13's
    // observation arriving from the other direction. So: hudFade (4 bodies), hudGearPop (2),
    // hudGearFlyers (1). A drop below three means the extractor stopped reaching a file.
    expect(withCallbacks.length, 'the extractor reached fewer files than the tree has').toBeGreaterThanOrEqual(3);
    const total = extracted.reduce((sum, [, n]) => sum + n, 0);
    expect(total, 'seven callback bodies are on this tree; fewer means a form stopped resolving').toBeGreaterThanOrEqual(7);
  });

  it('finds no sim-state write in any tween callback in src/', () => {
    const hits: string[] = [];
    for (const [file, src] of Object.entries(ALL_SOURCES)) {
      for (const v of simWriteViolations(src)) hits.push(`${file}: ${v.what}`);
    }
    expect(
      hits,
      `A tween is wall-clock and the sim is 60 Hz integer ticks. BaseTween.destroy() runs NEITHER ` +
        `callback, so a sim write inside one can simply never happen — and the tick loop will read ` +
        `the stale value forever. Do it on the tick series instead (criterion 9.2).`,
    ).toEqual([]);
  });

  const scan = (src: string): string[] => simWriteViolations(src).map((v) => v.what);

  it('REJECTS each planted sim write — this rule can go red (vault C2)', () => {
    expect(scan('scene.tweens.add({ onComplete: () => { world.completed = true; } });'))
      .toContain('a sim-state write');
    expect(scan('scene.tweens.add({ onComplete: () => { scene.simWorld.player.hp = 0; } });'))
      .toContain('a sim-state write');
    expect(scan('scene.tweens.add({ onStop: () => { writeProgress(storage, save); } });'))
      .toContain('a persisted progression write');
    expect(scan('scene.tweens.add({ onComplete: () => { world.projectiles.push(p); } });'))
      .toContain('a sim entity spawn or removal');
    expect(scan('scene.tweens.add({ onComplete: () => { scene.playerInputEnabled = false; } });'))
      .toContain('a next-tick control flag');
  });

  it('REJECTS a write through a LOCAL ALIAS — the shape no regex reaches (vault C2)', () => {
    // 🔴 The finding that made this a parser and not a pattern. `p` appears in no rule anywhere.
    expect(scan('const p = scene.simWorld.player;\nscene.tweens.add({ onComplete: () => { p.hp = 0; } });'))
      .toContain('a sim-state write');
    // Two hops, and through `this.world` rather than a parameter.
    expect(scan('const w = this.world;\nconst e = w.enemies;\nscene.tweens.add({ onStop: () => { e.sentries.pop(); } });'))
      .toContain('a sim entity spawn or removal');
    // 🔴 **DESTRUCTURED, which the first version of this extractor missed.** A gate-round
    // finding on 2026-08-25: `declarations()` recorded only `Identifier` ids, so the line below ran
    // clean while the `const p = scene.simWorld.player` above — the same alias, one syntax apart —
    // went red. Codex PR-03 named destructuring explicitly and the session log had marked it applied.
    expect(scan('const { player } = scene.simWorld;\nscene.tweens.add({ onComplete: () => { player.hp = 0; } });'))
      .toContain('a sim-state write');
    // Renamed on the way out, and one level deeper — the two shapes a one-name-only fix still misses.
    expect(scan('const { player: hero } = this.world;\nscene.tweens.add({ onStop: () => { hero.x = 0; } });'))
      .toContain('a sim-state write');
    expect(scan('const { enemies } = scene.simWorld;\nscene.tweens.add({ onComplete: () => { enemies.sentries.push(s); } });'))
      .toContain('a sim entity spawn or removal');
  });

  it('a DESTRUCTURED VIEW binding is still ACCEPTED — the fix did not become a blanket', () => {
    // The other direction, on the same syntax. Destructuring off something that is not a sim handle
    // must stay legal, or the repair above trades a false green for a false red on the live sites.
    expect(scan('const { alpha } = style;\nscene.tweens.add({ onComplete: () => { alpha.value = 1; } });')).toEqual([]);
    expect(scan('const { sprite } = view;\nscene.tweens.add({ onStop: () => { sprite.setAlpha(1); } });')).toEqual([]);
  });

  it('REJECTS it through a callback passed by NAME and by MEMBER expression', () => {
    // `this.foo` was one of the four holes `callbackCode()` named and could not close.
    expect(scan('const done = (): void => { world.player.hp = 0; };\nscene.tweens.add({ onStop: done });'))
      .toContain('a sim-state write');
    expect(scan('class S { foo(): void { world.player.hp = 0; } bar(): void { this.tweens.add({ onComplete: this.foo }); } }'))
      .toContain('a sim-state write');
  });

  it('ACCEPTS what the live sites actually do — the other direction (vault C2)', () => {
    // A rule that only ever demonstrates rejection is satisfied by one that rejects everything.
    expect(scan('scene.tweens.add({ onComplete: () => { flyers.delete(flyer); flyer.destroy(); } });')).toEqual([]);
    expect(scan('const settle = (): void => { line.setAlpha(end); };\nscene.tweens.add({ onStop: settle });')).toEqual([]);
    // A view container that happens to be named `player` is NOT the sim's player. This is why the
    // rule roots at the HANDLE: a bare `player` root would red this, and a false red on a blocker
    // is how a gate gets edited instead of obeyed.
    expect(scan('scene.tweens.add({ onComplete: () => { playerSprite.alpha = 1; player.setAlpha(1); } });')).toEqual([]);
    // A sim write OUTSIDE any tween is none of 9.2's business.
    expect(scan('function onTick(): void { world.player.hp = 0; }')).toEqual([]);
  });

  it('REJECTS a sim object handed to a KNOWN SIM MUTATOR — the argument shape', () => {
    // 🔴 `src/sim/` is mutating functions that take sim objects as ARGUMENTS, and every one was
    // invisible: the rule looked only at assignment targets and mutator receivers. Passing sim state
    // out of a wall-clock callback IS the ownership violation whatever the callee does with it.
    // ⚠️ **The fixtures carry the IMPORT now, and that is the point of the 2026-08-25 identity
    // change.** The rule is *"a sim object passed to a `src/sim/` mutator"*, so the callee has to be
    // shown to BE one. Without the import line these read as calls to some local `damagePlayer`,
    // which the rule deliberately no longer claims. Every real violation has this import.
    const IMP = "import { damagePlayer, killPlayer, stepEnemies } from '../sim/combat';" + NL;
    expect(scan(IMP + 'scene.tweens.add({ onComplete: () => { damagePlayer(world.player, 1); } });'))
      .toContain('a sim object passed to a sim mutator');
    expect(scan(IMP + 'scene.tweens.add({ onStop: () => { stepEnemies(this.simWorld, 1); } });'))
      .toContain('a sim object passed to a sim mutator');
    // Through an alias, so the argument rule uses the same reachability as the write rule.
    expect(scan(IMP + 'const p = scene.simWorld.player;' + NL + 'scene.tweens.add({ onStop: () => { killPlayer(p); } });'))
      .toContain('a sim object passed to a sim mutator');
    // A VIEW object handed to a function is still fine — the rule is ownership, not arity.
    expect(scan('scene.tweens.add({ onComplete: () => { fadeOut(sprite, 0); } });')).toEqual([]);
  });

  it('REJECTS through the BARREL import and through an ALIAS — the two holes identity resolution opened', () => {
    // 🔴 **Found in this session's own §10a owner round, in the change made three commits earlier.**
    // Resolving callee identity closed a name-collision widening and opened two narrowings in the
    // same stroke. Both were measured against this predicate before and after the repair:
    //
    //   | fixture                                                  | before | after |
    //   |----------------------------------------------------------|--------|-------|
    //   | `from '../sim/worldDamage'`                                |   1    |   1   |
    //   | `from '../sim'` — **the barrel**                           | **0**  |   1   |
    //   | `import { damagePlayer as hurt }`                           | **0**  |   1   |
    //
    // The barrel miss is the serious one: **`src/scenes/` imports from the barrel.** Seven files do,
    // and `src/sim/index.ts` re-exports the mutators — so the trailing slash in `/(^|\/)sim\//`
    // excluded the exact import style the code under this rule actually uses. Before identity
    // resolution existed the bare-name match would have caught it, which makes this a coverage
    // REGRESSION introduced by a repair, the shape this project keeps paying for.
    const barrel = "import { damagePlayer } from '../sim';" + NL;
    expect(
      scan(barrel + 'scene.tweens.add({ onComplete: () => { damagePlayer(world.player, 1); } });'),
      'a barrel import of a sim mutator was invisible to the rule',
    ).toContain('a sim object passed to a sim mutator');

    // The alias miss is the same shape one level down: the map recorded the LOCAL name while
    // `SIM_MUTATORS` is keyed by the EXPORTED one, so the two could never meet.
    const aliased = "import { damagePlayer as hurt } from '../sim/worldDamage';" + NL;
    expect(
      scan(aliased + 'scene.tweens.add({ onComplete: () => { hurt(world.player, 1); } });'),
      'an aliased import of a sim mutator was invisible to the rule',
    ).toContain('a sim object passed to a sim mutator');

    // Both at once, since the scenes' idiom is the barrel and an alias would ride on it.
    expect(scan("import { damagePlayer as hurt } from '../sim';" + NL +
      'scene.tweens.add({ onComplete: () => { hurt(world.player, 1); } });'))
      .toContain('a sim object passed to a sim mutator');

    // ⚠️ And the segment match must stay a SEGMENT. A directory whose name merely starts with
    // `sim` is not `src/sim/`, and widening the pattern to a substring would make it one.
    expect(
      scan("import { damagePlayer } from '../simulacrum';" + NL +
        'scene.tweens.add({ onComplete: () => { damagePlayer(world.player, 1); } });'),
      "'../simulacrum' was treated as the sim barrel",
    ).toEqual([]);
  });

  it('ACCEPTS a LOCAL helper that merely SHARES a name with a sim mutator (identity, not collision)', () => {
    // 🔴 **The acceptance case the owner's ruling required before `SIM_MUTATORS` could grow.**
    // The set is bare identifiers, so matching a callee against it alone enforces the rule by NAME
    // COLLISION: a file's own `stepEnemies` — a renderer, a debug helper — would become illegal
    // because of what it is called. That is broader than the authorised rule, and growing the set
    // from 6 names to ~26 would have multiplied the surface. `simImports()` resolves identity first.
    const local = [
      'function stepEnemies(w) { return w.enemies.length; }',
      'scene.tweens.add({ onComplete: () => { stepEnemies(world); } });',
    ].join(NL);
    expect(
      scan(local),
      'a local helper was reported as a sim mutator purely because of its NAME',
    ).toEqual([]);

    // And a TYPE-only import does not make it one either — it cannot be called at runtime.
    const typeOnly = [
      "import type { damagePlayer } from '../sim/combat';",
      'scene.tweens.add({ onComplete: () => { damagePlayer(world.player, 1); } });',
    ].join(NL);
    expect(scan(typeOnly), 'a type-only import was treated as a runtime mutator').toEqual([]);
  });

  it('ACCEPTS a READ-ONLY sim call — the rule forbids writes, not reads (Codex impl review)', () => {
    // ⚠️ The first version of the rule above fired on ANY sim-rooted argument to ANY function,
    // which false-reds every one of these — and, worse, silently strengthened an OWNER-AUTHORISED
    // rule from *"may not write sim-owned state"* to *"may not pass sim state"*. Widening an approved
    // architectural rule is a STOP-and-ask, not a detail. These are the accept cases that boundary
    // needed and did not have.
    expect(scan('scene.tweens.add({ onComplete: () => { if (invulnerable(world.player)) hud.flash(); } });')).toEqual([]);
    expect(scan('scene.tweens.add({ onStop: () => { renderPlayer(world.player); } });')).toEqual([]);
    expect(scan('scene.tweens.add({ onComplete: () => { const n = canAct(this.simWorld.player); } });')).toEqual([]);
    // And a read-only helper does not become a violation by being aliased on the way in.
    expect(scan('const p = scene.simWorld.player;\nscene.tweens.add({ onStop: () => { readHp(p); } });')).toEqual([]);
  });

  it('REJECTS a write ONE HOP through a local helper — `() => finish()` (2026-08-25 brief)', () => {
    // `onComplete: finish` was caught while `onComplete: () => finish()` was not: the same helper,
    // the same write, six characters apart. The walk now follows a call to a local declaration.
    expect(scan('const finish = (): void => { world.completed = true; };\nscene.tweens.add({ onComplete: () => { finish(); } });'))
      .toContain('a sim-state write');
    expect(scan('function done(): void { this.world.player.hp = 0; }\nscene.tweens.add({ onStop: () => { done(); } });'))
      .toContain('a sim-state write');
    // A local helper that touches only the view stays legal.
    expect(scan('const settle = (): void => { line.setAlpha(1); };\nscene.tweens.add({ onStop: () => { settle(); } });')).toEqual([]);
  });

  it('REJECTS a write through onUpdate — the key an addCounter freeze uses (2026-08-25 brief)', () => {
    // 🔴 `CALLBACK_KEYS` omitted `onUpdate`, which falsified this file's own sibling claim that an
    // `addCounter` freeze is caught here: a counter tween writes through `onUpdate` and nothing else,
    // so the one shape the rule most exists for was the one key it never looked at.
    expect(scan('scene.tweens.addCounter({ from: 0, to: 1, onUpdate: (t) => { world.player.x = t.getValue(); } });'))
      .toContain('a sim-state write');
    // And an onUpdate that only drives the view is still accepted.
    expect(scan('scene.tweens.addCounter({ from: 0, to: 1, onUpdate: (t) => { sprite.alpha = t.getValue(); } });')).toEqual([]);
  });

  it('REJECTS a write through an ALIASED tween manager — `const tm = scene.tweens` (2026-08-25)', () => {
    // 🔴 One `const` used to silence every tween rule in the project at once: 9.3b could not see
    // the `add`, 9.3c's `includes('tweens.add')` filter skipped the file, and this extractor returned
    // ZERO callback bodies — which reads as a clean file rather than an unscanned one.
    expect(scan('const tm = scene.tweens;\ntm.add({ onComplete: () => { world.completed = true; } });'))
      .toContain('a sim-state write');
    expect(scan('const tm = this.tweens;\nconst t = tm;\nt.addCounter({ onUpdate: () => { world.player.x = 1; } });'))
      .toContain('a sim-state write');
    // An alias of something that is NOT the tween manager stays out of it — no blanket.
    expect(scan('const tm = scene.anims;\ntm.add({ onComplete: () => { world.completed = true; } });')).toEqual([]);
  });
  it('REJECTS a write behind a TS wrapper — `world!.x` and `(world as W).x` (2026-08-25 brief)', () => {
    // 🔴 `rootOf` walked `MemberExpression` only, so Babel wrapping the base in `TSNonNullExpression`
    // or `TSAsExpression` left it returning a node with no `.name` — and the write was silently NOT a
    // sim write. That is the dangerous failure direction: a violation admitted, not a false red.
    // Neither form is in `src/scenes/` today, which is precisely why nothing would have said so.
    expect(scan('scene.tweens.add({ onComplete: () => { world!.completed = true; } });'))
      .toContain('a sim-state write');
    expect(scan('scene.tweens.add({ onComplete: () => { (world as World).player.hp = 0; } });'))
      .toContain('a sim-state write');
    // The wrapper does not become a blanket: a wrapped VIEW write is still legal.
    expect(scan('scene.tweens.add({ onComplete: () => { sprite!.alpha = 1; } });')).toEqual([]);
  });

  /*
   * ⚠️ **Two narrowings recorded rather than closed, both from the 9.2/9.3 adversarial brief.**
   *
   * 1. **A class field is not an alias source.** `declarations()` collects `const`/`function` only, so
   *    `private world = scene.simWorld;` then `this.world.player.hp = 0` inside a callback resolves
   *    through the `this.world` member path (which IS matched, by handle name) but a field aliased to
   *    a DIFFERENT name — `private w = scene.simWorld` — does not. No such field exists in
   *    `src/scenes/`; every scene holds its world as `world` or `simWorld`, which is what
   *    `SIM_HANDLES` is for.
   * 2. **A mutator called through a member expression is not matched.** The rule fires on a bare
   *    identifier callee resolved through `simImports()`; `sim.damagePlayer(world.player, 1)` after a
   *    namespace import would pass. `src/` has no namespace import of `src/sim/` — checked — and
   *    widening the callee match without the same identity resolution is how this rule was
   *    over-broadened once already, so it waits for a real occurrence.
   */
  it('REJECTS a write through a CONFIG VARIABLE — `tweens.add(cfg)` (Codex impl review)', () => {
    // 🔴 The scanner walked only the LITERAL arguments, so a config held in a variable returned
    // **zero callback bodies** — a file that reads as having no tween callbacks rather than one the
    // scanner could not open. Both 9.2 and 9.2b were blind to it, and the sibling test file recorded
    // it as a known narrowing. Disclosure is not what C2 asks for.
    const cfg = 'const cfg = { onComplete: () => { world.completed = true; } };';
    expect(scan(`${cfg}
scene.tweens.add(cfg);`)).toContain('a sim-state write');
    expect(scan(`${cfg}
const tm = scene.tweens;
tm.add(cfg);`), 'config var THROUGH an alias')
      .toContain('a sim-state write');
    // And a config variable whose callback only touches the view is still legal — no blanket.
    expect(
      scan(`const c = { onComplete: () => { sprite.alpha = 1; } };
scene.tweens.add(c);`),
    ).toEqual([]);
  });
});
