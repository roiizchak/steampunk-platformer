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

describe('9.2b — no sim-owned state is written from a tween callback', () => {
  it('the scan is not vacuous: it parses real files and EXTRACTS real callback bodies', () => {
    // 🔴 The check that matters is how many callback BODIES came out, not whether the call threw.
    // `errorRecovery` means a file the parser chokes on yields a partial tree rather than an
    // exception, so every rule below would report it clean — the silent-zero failure mode this
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
});
