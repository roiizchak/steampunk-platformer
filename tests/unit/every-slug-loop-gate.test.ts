import { describe, expect, it } from 'vitest';
import { readPng } from '../../tools/gen/png.mjs';
import { gateLoopWrap } from '../../tools/gen/gates.mjs';
import type { RgbaImage } from '../../tools/gen/png.d.mts';
import indexJson from '../../public/assets/index.json';

/**
 * # Every shipped slug's looping sheets are gated — not just the one the default command builds
 *
 * ## The defect this closes is structural, not artistic
 *
 * `brass-sentry/idle` **fails its own loop gate** and has done since it was generated:
 *
 * > `⚠ idle 8 frames … FAIL — loop: wrap 0.01371 exceeds 0.01143 — it snaps.`
 *
 * Reproduced 2026-08-23 with every unrelated change stashed. It is not new and it is not a
 * regression. **The reason nobody had seen it is worth more than the defect:**
 * `build-assets.mjs:69` reads `process.argv[2] ?? 'brass-courier'`, so `npm run assets:build` with
 * no argument builds the player and nothing else. The sentry's and the scavenger's gates run only
 * when a person types the slug by hand — and a failing gate that the default command never runs is
 * a gate nobody reads.
 *
 * That is the same defect class as *"a decision function with no consumer"* in `CLAUDE.md §2`: the
 * check exists, passes its own tests, and never meets the thing it was written to judge.
 *
 * **This file removes the argument.** It reads the shipped sheets for **every slug in
 * `index.json`** and runs the **real** `gateLoopWrap` over each looping animation, so no slug can be
 * silently excluded by how a command was invoked.
 *
 * ## Why `brass-sentry/idle` is a pinned waiver rather than a red
 *
 * The fix is a re-shoot, and `idle` is the sheet the whole slug's `scale` is derived from — so
 * re-shooting it moves every number in `character-bounds-brass-sentry.json`. That is a piece of
 * work with a fal cost, not a line change, and it is **owed**, not done.
 *
 * The waiver is written as the **measured value plus a ceiling**, in the shape
 * `ACCEPTED_EDGE_BLEED` used before its art was repaired and the waiver deleted. So:
 *
 * - the failure is **visible** in the suite instead of invisible behind an unrun command;
 * - it **cannot get worse** without a red;
 * - and when the re-shoot lands, the entry is **deleted**, not relaxed.
 *
 * ⚠️ **A red here is never fixed by widening a waiver or adding a new one.** A new entry is an
 * owner decision, in the same spirit as `style-lock.test.ts`'s hash.
 *
 * **The mutation this file names:** raise `WAIVED`'s ceiling for `brass-sentry/idle` above its
 * measured wrap and the "no waiver is slack" check reds; delete the entry entirely and the gate
 * itself reds on the real failure.
 */

interface CatalogSheet {
  key: string;
  url: string;
  frameCount: number;
  loop?: boolean;
}

const catalog = indexJson as unknown as { sheets: CatalogSheet[] };

/**
 * Which sheets loop is read from the **catalog's own `loop` flag**, not from a list here. A hard-
 * coded list of action names is a second definition that drifts — and it is the shipped flag that
 * decides whether a player ever sees the wrap, so it is the one that should decide whether the gate
 * applies. A one-shot (`attack`, `death`, `fire`) never wraps and the gate would be meaningless.
 */

/**
 * The one known failure, measured 2026-08-23 on the shipped sheet.
 *
 * `ceiling` is the wrap this sheet is allowed to reach — its measured value, with no headroom.
 * `owed` states what closes it. **Delete the entry when the re-shoot lands; never raise it.**
 */
const WAIVED: Record<string, { ceiling: number; owed: string }> = {
  // 🔴 **EMPTY, and that is the re-shoot landing.** `brass-sentry/idle` was the one entry:
  // waived 2026-08-23 at `ceiling: 0.0138` against a measured 0.01371, with 0.00009 of headroom and
  // `owed: 're-shoot'`. The `-r4` padded re-shoot landed 2026-08-26 and the sheet now **PASSES
  // outright** — wrap 0.02068 within a budget of 0.02273, where `-r2` failed at 0.01371 against
  // 0.01143. The entry is DELETED rather than re-pointed, exactly as its own text said: *"Delete the
  // entry when the re-shoot lands; never raise it."*
  //
  // ⚠️ The raw wrap went UP (0.01371 → 0.02068) while the verdict went from FAIL to PASS, and
  // that is not a contradiction — `gateLoopWrap`'s budget is derived from the sheet's own median
  // frame-to-frame step, so a livelier clip earns a larger budget. **This is why the waiver could not
  // simply be re-pointed at the new number**: an absolute ceiling on `wrap` compares two figures
  // measured against different budgets. The gate below judges the verdict; the waiver judged a raw
  // value, which is the narrower thing.
};

/**
 * `assets/characters/brass-sentry/sheets/idle.png` → `brass-sentry/idle`.
 *
 * Taken from the URL rather than the key: the key is `slug-action` with a hyphen the slug also
 * contains (`brass-sentry-idle`), so splitting it needs a guess about where the slug ends. The path
 * has the boundary in it already.
 */
function slugAction(url: string): string | null {
  const m = /characters\/([^/]+)\/sheets\/([^/.]+)\.png$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

function framesOf(sheet: CatalogSheet): RgbaImage[] {
  const png = readPng(`public/${sheet.url}`);
  const w = Math.floor(png.width / sheet.frameCount);
  const out = [];
  for (let i = 0; i < sheet.frameCount; i += 1) {
    const data = new Uint8ClampedArray(w * png.height * 4);
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const src = (y * png.width + (i * w + x)) * 4;
        const dst = (y * w + x) * 4;
        for (let c = 0; c < 4; c += 1) data[dst + c] = png.data[src + c]!;
      }
    }
    out.push({ width: w, height: png.height, data });
  }
  return out;
}

const targets = catalog.sheets
  .filter((s) => s.loop === true)
  .map((s) => ({ sheet: s, id: slugAction(s.url) }))
  .filter((t): t is { sheet: CatalogSheet; id: string } => t.id !== null);

describe('every slug is reached, not only the one assets:build defaults to', () => {
  it('covers all three shipped slugs — the whole point of the file', () => {
    // 🔴 The non-vacuity gate, and the defect restated as an assertion. If this file only ever
    // measured brass-courier it would reproduce exactly the hole it exists to close.
    const slugs = new Set(targets.map((t) => t.id.split('/')[0]!));
    expect(
      [...slugs].sort(),
      `only reached ${[...slugs].join(', ')} — a slug's sheets are going ungated again`,
    ).toEqual(['brass-courier', 'brass-sentry', 'rust-scavenger']);
  });

  it('and found real looping sheets to judge', () => {
    expect(targets.length).toBeGreaterThan(4);
  });
});

describe('gateLoopWrap over every shipped looping sheet', () => {
  for (const { sheet, id } of targets) {
    it(`${id} loops without a snap`, () => {
      const result = gateLoopWrap(framesOf(sheet));
      expect(result.status, `${id}: ${result.reason}`).not.toBe('INDETERMINATE');
      // `value` is null only on INDETERMINATE, which the line above has just excluded.
      const measured = result.value!;

      const waiver = WAIVED[id];
      if (waiver) {
        expect(
          measured.wrap,
          `${id} is a KNOWN failure held at ${waiver.ceiling} (owed: ${waiver.owed}). Its wrap is ` +
            `now ${measured.wrap.toFixed(5)} — WORSE than when it was waived. Do not raise the ` +
            `ceiling; the sheet got worse.`,
        ).toBeLessThanOrEqual(waiver.ceiling);
        return;
      }

      expect(
        result.status,
        `${id}: ${result.reason}. A new loop failure is NOT closed by adding a WAIVED entry — ` +
          `that is an owner decision. Fix the sheet.`,
      ).toBe('PASS');
    });
  }
});

describe('the waiver list cannot quietly become a way to pass', () => {
  it('every waived entry is genuinely still failing — a stale waiver is a lie', () => {
    // The other direction, and the one that matters when the re-shoot lands: if a waived sheet
    // starts PASSING, the entry must be DELETED rather than left as decoration. Left in place it
    // would silently accept a future regression back to the waived value.
    for (const [id, waiver] of Object.entries(WAIVED)) {
      const t = targets.find((x) => x.id === id);
      expect(t, `WAIVED names ${id}, which is not a shipped looping sheet`).toBeDefined();
      const result = gateLoopWrap(framesOf(t!.sheet));
      expect(
        result.status,
        `${id} now PASSES gateLoopWrap. Delete its WAIVED entry — a waiver over a passing gate ` +
          `accepts a regression back to ${waiver.ceiling} without anyone being told.`,
      ).toBe('FAIL');
    }
  });

  it('no waiver has slack — each ceiling is the measured value, not a comfortable one', () => {
    // A waiver with headroom is a bound that cannot notice the sheet degrading, which is the whole
    // reason the entry is allowed to exist at all.
    for (const [id, waiver] of Object.entries(WAIVED)) {
      const t = targets.find((x) => x.id === id)!;
      const wrap = gateLoopWrap(framesOf(t.sheet)).value!.wrap;
      expect(
        waiver.ceiling - wrap,
        `${id}'s ceiling ${waiver.ceiling} sits ${(waiver.ceiling - wrap).toFixed(5)} above its ` +
          `measured ${wrap.toFixed(5)}. That slack is room to degrade unnoticed.`,
      ).toBeLessThan(0.0005);
    }
  });
});
