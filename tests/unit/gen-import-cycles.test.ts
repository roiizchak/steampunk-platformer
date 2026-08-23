import { describe, expect, it } from 'vitest';

/**
 * # No import cycle in `tools/gen/` — inventory 5.25
 *
 * `phase-05-impl.md:72` and `handoff/sessions-02-03.md:114-117` recorded it:
 *
 * > `motion.mjs` ↔ `motionCombat.mjs` have a **circular import with ordering fragility** — the wrong
 * > order yields a partially-initialised read that does not throw the way plain Node does.
 * > **Protected only by a convention nothing enforces.**
 *
 * ## The recorded instance is fixed. The phenomenon was not.
 *
 * `motionCombat.mjs:29` records its own repair — it takes `poseSpan` from `motionClauses.mjs` now,
 * not from `motion.mjs`. So the named pair is closed, and a reconciliation pass that stopped there
 * would have marked 5.25 STALE and moved on.
 *
 * Measured across all 55 modules instead, 2026-08-23, **two cycles were still live**:
 *
 * | cycle | shape |
 * |---|---|
 * | `gates.mjs` ↔ `gatesBrassCap.mjs` | `gates:322` re-exports from it; `gatesBrassCap:15` imports `FAIL`/`PASS`/`verdict` back |
 * | `sheets.mjs` ↔ `sheetsPack.mjs` | `sheets:254` re-exports from it; `sheetsPack:11` imports `figureMetrics` back |
 *
 * Both are the **same accident**, and it is this project's own: a file crossed 400 lines, the tail
 * moved to a sibling, and the parent kept re-exporting the moved names so existing importers would
 * not change — while the moved half still needed a primitive that stayed behind. The split that
 * satisfies one rule quietly creates the cycle.
 *
 * `gates.mjs:370` is the smoking gun. It states the convention out loud — *"`gatesBrassCap.mjs`
 * never calls back into this module at load time — only inside function bodies"* — which is exactly
 * the "protected only by a convention nothing enforces" the finding names, written down and still
 * unenforced three phases later.
 *
 * ## Why a convention is not enough here
 *
 * ESM hoists imports and evaluates the graph depth-first. In a cycle one module runs while the other
 * is still initialising, so a top-level read of the other's binding hits the temporal dead zone —
 * and the failure mode depends on which module the entry point reached first. Move a `const` above
 * a function, or add an importer that enters from the other side, and a working pipeline starts
 * reading `undefined`. Nothing about that edit looks dangerous in review.
 *
 * ## Reading a failure
 *
 * A red names the cycle. **Do not fix it by re-ordering imports** — that is choosing an entry point,
 * not removing the cycle. Move the shared primitive **down** into a leaf module both sides import,
 * which is what `motionClauses.mjs` already is for the `motion` family. That is the shape that
 * closed 5.25's original pair, and the same shape closes any new one.
 *
 * **The mutation this file names:** re-point `gatesBrassCap.mjs`'s `verdict` import back at
 * `gates.mjs`. The cycle returns and this file reds naming it.
 */

const SOURCES = import.meta.glob('../../tools/gen/*.mjs', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/**
 * ⚠️ vitest caches `?raw` glob results, and this project has already lost a landed mutation to it.
 * Touch this file too when re-running after an edit under `tools/gen/`.
 */
function basename(globKey: string): string {
  return globKey.split('/').pop() ?? globKey;
}

/** Sibling `./x.mjs` specifiers only — a package import cannot participate in a local cycle. */
function localDeps(source: string, known: Set<string>): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(/^\s*(?:import|export)[^'"]*from\s+'\.\/([^']+)'/gm)) {
    const dep = m[1]!;
    if (known.has(dep)) out.add(dep);
  }
  return [...out];
}

const graph = new Map<string, string[]>();
for (const key of Object.keys(SOURCES)) {
  graph.set(basename(key), []);
}
const known = new Set(graph.keys());
for (const [key, source] of Object.entries(SOURCES)) {
  graph.set(basename(key), localDeps(source, known));
}

/** Every distinct cycle, each normalised so the same loop is not reported once per entry point. */
function findCycles(): string[] {
  const seen = new Set<string>();
  const cycles = new Set<string>();

  const walk = (node: string, stack: string[]): void => {
    const at = stack.indexOf(node);
    if (at !== -1) {
      const loop = stack.slice(at);
      // Rotate to the alphabetically smallest member so A->B->A and B->A->B are one entry.
      const pivot = loop.indexOf([...loop].sort()[0]!);
      cycles.add([...loop.slice(pivot), ...loop.slice(0, pivot), loop[pivot]!].join(' -> '));
      return;
    }
    if (seen.has(node)) return;
    for (const dep of graph.get(node) ?? []) walk(dep, [...stack, node]);
    seen.add(node);
  };

  for (const node of graph.keys()) walk(node, []);
  return [...cycles].sort();
}

describe('tools/gen has no import cycle (5.25)', () => {
  it('read the real module graph — an empty glob would make the check vacuous', () => {
    expect(graph.size, 'no .mjs modules found under tools/gen').toBeGreaterThan(40);
    const edges = [...graph.values()].reduce((n, d) => n + d.length, 0);
    expect(edges, 'no local imports found — the specifier pattern stopped matching').toBeGreaterThan(
      40,
    );
  });

  it('and the detector can actually SEE a cycle — proven on a synthetic one, not on trust', () => {
    // The counter-fixture. A traversal bug that never reports anything would satisfy the real check
    // silently, which is the failure mode this whole file exists to prevent elsewhere.
    const real = graph.get('gates.mjs');
    graph.set('__a.mjs', ['__b.mjs']);
    graph.set('__b.mjs', ['__a.mjs']);
    const found = findCycles();
    graph.delete('__a.mjs');
    graph.delete('__b.mjs');
    expect(real).toBeDefined();
    expect(found).toContain('__a.mjs -> __b.mjs -> __a.mjs');
  });

  it('has no cycle at all', () => {
    const cycles = findCycles();
    expect(
      cycles,
      `import cycle(s) in tools/gen:\n  ${cycles.join('\n  ')}\n\n` +
        `ESM evaluates a cycle depth-first, so one module runs while the other is still ` +
        `initialising and a top-level read of it hits the temporal dead zone — with the outcome ` +
        `depending on which entry point got there first. Do NOT fix this by re-ordering imports: ` +
        `move the shared primitive DOWN into a leaf module both sides import, the way ` +
        `motionClauses.mjs already serves the motion family.`,
    ).toEqual([]);
  });
});
