/**
 * The shipped exit gate, measured — criteria G.1 and G.5's automatable half.
 *
 * ## The defect that no other gate in this repository can see
 *
 * `buildGate` refuses to build unless `detectFrames` returns exactly ONE connected component. That
 * check is real and it is not enough, and the reason is specific rather than theoretical:
 *
 * > A doorway whose dark interior keyed away comes back as a **FRAME** — a ring. That is still
 * > exactly one connected component, still 192 × 288, and still passes every check in the build
 * > script. What ships is a see-through hole.
 *
 * And a see-through hole is the precise inversion of this asset's job. The player fades to alpha 0
 * *inside* this doorway; if the interior is transparent they fade into the parallax backdrop
 * instead of into a dark passage, which is the one thing the whole gate-entry session is for.
 *
 * So the real gate is here, on the shipped bytes, running the same measurements a human would make
 * by eye *(vault 3.1 — the unit suite runs the real check over the shipped data)*.
 *
 * ## 🔴 Why there are FOUR measurements and not one
 *
 * Codex's plan review (C6) rejected the first draft, which sampled only the middle 64 × 96 px —
 * **11 % of the image** — and asked for >80 % of it to be dark and opaque. An opaque dark slab with
 * no doorway around it passes that, one-component detection, and the dimension check. So does a
 * mostly-transparent frame with a black patch in the centre.
 *
 * The four together pin the shape: the opening is dark AND opaque, both jambs are solid, the image
 * as a whole is not mostly holes, and the frame is materially brighter than the void. A defect has
 * to satisfy all four to get through, and by then it is a doorway.
 *
 * ## What is still NOT asserted here
 *
 * Whether it READS as a Victorian steampunk doorway at 192 × 288 is `play`'s call under criterion
 * **G.1b**, and it is deliberately not approximated with a number that would mean nothing
 * *(vault 9.3)*. STYLE.md §5 already says the material rule is a local edge cue that no
 * whole-region metric can see.
 */

import { describe, expect, it } from 'vitest';
import { readPng } from '../../tools/gen/png.mjs';
import { PLAYER_BOX } from '../../src/sim/player';
import { RENDER_SCALE } from '../../src/game/constants';
import catalog from '../../public/assets/index.json';

const GATE_PATH = 'public/assets/objects/gate.png';

/** The goal rect in every shipped level. The gate is authored at exactly this size. */
const GATE_W = 192;
const GATE_H = PLAYER_BOX.h * RENDER_SCALE; // 288

interface Px {
  r: number;
  g: number;
  b: number;
  a: number;
}

const png = readPng(GATE_PATH);

function at(x: number, y: number): Px {
  const i = (y * png.width + x) * 4;
  return { r: png.data[i]!, g: png.data[i + 1]!, b: png.data[i + 2]!, a: png.data[i + 3]! };
}

/** What fraction of a rectangle satisfies `ok`? */
function fraction(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  ok: (p: Px) => boolean,
): number {
  let hit = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      total += 1;
      if (ok(at(x, y))) hit += 1;
    }
  }
  return hit / total;
}

/** Mean brightness of the OPAQUE pixels in a rectangle, 0–765. */
function luminance(x0: number, x1: number, y0: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = at(x, y);
      if (p.a > 200) {
        sum += p.r + p.g + p.b;
        n += 1;
      }
    }
  }
  return n === 0 ? 0 : sum / n;
}

// The interior sample: the middle third of the middle third, well inside any plausible frame.
const IN_X0 = 64;
const IN_X1 = 128;
const IN_Y0 = 96;
const IN_Y1 = 192;

/**
 * The span the DRAWN COURIER actually occupies, gate-local.
 *
 * `PLAYER_BOX.w * RENDER_SCALE` is 132 and the gate is 192, so a centred body covers `x 30..162`.
 * The 64 px window above is half that. The gate's adversarial review made the consequence concrete:
 * a doorway exactly 64 px wide passes every assertion in this file while **half the courier fades
 * against bright brass**. A window narrower than the thing it protects is structurally incapable of
 * ordering a mutation that narrows the opening to its own size.
 */
const BODY_X0 = 30;
const BODY_X1 = 162;

/** Opaque and near-black: the void a character can disappear into. */
const isDark = (p: { r: number; g: number; b: number; a: number }) =>
  p.a === 255 && p.r + p.g + p.b < 210;

/**
 * Columns that are nearly all opaque AND mostly bright — frame material, wherever it happens to be.
 *
 * Shared, because two tests need it and the second one was using a hardcoded window instead. See
 * `the frame is far brighter than the opening` below.
 */
function frameColumns(): { left: number[]; right: number[] } {
  const columnIsFrame = (x: number) =>
    fraction(x, x + 1, 40, 260, (p) => p.a > 200) >= 0.9 &&
    fraction(x, x + 1, 40, 260, (p) => p.a > 200 && p.r + p.g + p.b >= 210) >= 0.6;
  const centre = GATE_W / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let x = 0; x < centre; x += 1) if (columnIsFrame(x)) left.push(x);
  for (let x = centre; x < GATE_W; x += 1) if (columnIsFrame(x)) right.push(x);
  return { left, right };
}

describe('the shipped exit gate', () => {
  it('the shipped bytes decode — nothing below runs against a missing file', () => {
    // `readPng` throws on a missing or non-PNG file, so reaching here already proves the bytes are
    // present. Asserting the decode as well keeps this from being a test that passes by not running.
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });

  it('is authored at exactly the goal rect, so nothing rescales it on screen', () => {
    // Assert the TYPE before the value: an `undefined` width makes every comparison vacuous.
    expect(typeof png.width).toBe('number');
    expect(png.width).toBe(GATE_W);
    expect(png.height).toBe(GATE_H);
  });

  it('is catalogued, so the loader queues it and BootScene verifies it registered', () => {
    /**
     * The URL side of the join only. **`GOAL_TEXTURE_KEY` is deliberately NOT imported here** — it
     * lives in `goalLayer.ts`, which imports Phaser, and pulling that into a unit test throws
     * `ReferenceError: window is not defined` before a single assertion runs. It would also break
     * `npm run test:sim-isolated` outright.
     *
     * The key half of the join is asserted where it is worth more anyway: the e2e spec checks
     * `goalIsGreybox(scene) === false` in a real browser, which proves the key, this catalog row
     * and these bytes all line up by the only measure that matters — the texture actually loaded.
     */
    const entry = catalog.images.find((i) => i.url === 'assets/objects/gate.png');
    expect(entry, 'no catalog image points at the shipped gate').toBeDefined();
    expect(typeof entry!.key).toBe('string');
  });

  it('has a dark, OPAQUE opening for the player to vanish into', () => {
    // The load-bearing one. `a === 255 && r+g+b < 210` is "opaque and near-black" — a keyed-away
    // interior fails on the alpha, and a lit interior fails on the brightness.
    const dark = fraction(IN_X0, IN_X1, IN_Y0, IN_Y1, (p) => p.a === 255 && p.r + p.g + p.b < 210);
    expect(dark, 'the opening must be opaque and dark, not keyed away and not lit').toBeGreaterThan(
      0.8,
    );
  });

  it('has BRIGHT frame material flanking the opening on both sides — a doorway, not a slab', () => {
    /**
     * Codex C6: without this, an opaque dark rectangle with no doorway around it passes the
     * dimension check, the one-component check and the dark-interior check.
     *
     * 🔴 **The first version of this test asserted the wrong WINDOW, not the wrong bound**, and the
     * distinction matters because moving a bound to clear a red gate is exactly what this project
     * forbids. It sampled `x 0..20` as "the left jamb" and got 57 % opaque. The column profile says
     * why, and it is nothing to do with the frame being thin:
     *
     * ```
     *   col   0    0 % opaque              transparent margin
     *   col   8  100 % opaque,  95 % bright   the copper PIPE
     *   col  16   13 % opaque              the GAP between pipe and frame
     *   col  24   92 % opaque,  22 % bright   the jamb begins
     *   col  40  100 % opaque,  91 % bright   the jamb proper
     *   col  56..136  100 % opaque, ~14 % bright   THE OPENING
     *   col 144  100 % opaque,  87 % bright   the right jamb
     *   col 176   15 % opaque              the gap again
     * ```
     *
     * So `0..20` straddled a transparent margin and a pipe gap and measured neither jamb. The fix
     * is a predicate that does not need to know where the jambs are: **somewhere between the centre
     * and each edge there is a column that is nearly all opaque AND mostly bright.** A uniformly
     * dark slab has no bright column anywhere and fails on both sides; a ring fails the
     * dark-interior test above. Hardcoding `24..52` and `144..172` was rejected — that is fitting
     * the test to this one generation, and the next re-shoot moves them.
     */
    const { left, right } = frameColumns();
    expect(left.length, 'no bright opaque frame column left of centre').toBeGreaterThan(0);
    expect(right.length, 'no bright opaque frame column right of centre').toBeGreaterThan(0);
  });

  /**
   * The opening has to be wide enough for the courier, measured as a RUN and not as a fraction.
   *
   * A fraction over a window cannot tell a doorway from a barcode: alternating 8 px bright and dark
   * bars score the same as a passage. The contiguous dark run can, and it is also what the fade
   * actually needs — the character has to cross an unbroken void, not a striped one.
   *
   * The bound is **half the body**, 66 px, expressed from `PLAYER_BOX` rather than from this
   * generation. The shipped art measures **92 px** at every sampled height, so there is ~39 % of
   * headroom; the 64 px slit the adversarial review synthesised fails it, and so does the barcode.
   */
  it('the opening is an unbroken run at least half the courier wide, at every height', () => {
    const runs = [IN_Y0, (IN_Y0 + IN_Y1) / 2, IN_Y1 - 1].map((y) => {
      let best = 0;
      let run = 0;
      for (let x = 0; x < GATE_W; x += 1) {
        if (isDark(at(x, y))) {
          run += 1;
          best = Math.max(best, run);
        } else run = 0;
      }
      return best;
    });
    const floor = (BODY_X1 - BODY_X0) / 2;
    for (const [i, run] of runs.entries()) {
      expect(run, `row ${i}: longest unbroken dark run is only ${run}px`).toBeGreaterThanOrEqual(floor);
    }
  });

  /**
   * And the same darkness across the span the body actually covers, not just the middle third.
   *
   * Measured on the shipped art: **0.794**. A 64 px opening scores 0.485, so this separates them
   * with room on both sides. ~30 % of the drawn frame does fade against jamb today — the courier's
   * own art is narrower than its 132 px box, so it reads fine, but the number is recorded in the QA
   * log rather than left for the next re-shoot to rediscover.
   */
  it('is dark across the span the courier actually covers, not only its middle third', () => {
    expect(fraction(BODY_X0, BODY_X1, IN_Y0, IN_Y1, isDark)).toBeGreaterThan(0.7);
  });

  it('is mostly opaque overall — not a frame with a transparent hole', () => {
    // The complement of the jamb check: that one catches a slab, this one catches a ring.
    expect(fraction(0, GATE_W, 0, GATE_H, (p) => p.a > 200)).toBeGreaterThan(0.7);
  });

  it('the frame is far brighter than the opening — the void has to read as a void', () => {
    // Not a style claim. If the interior were merely dark-ish brickwork rather than a passage, the
    // player fading into it would read as walking into a wall.
    // 🔴 This read `luminance(0, 20, 40, 260)` until the adversarial review pointed out that the
    // test two above it documents that exact window as one that "straddled a transparent margin and
    // a pipe gap and measured neither jamb". It was averaging the copper pipe at column 8 and
    // calling it frame material — 246.9 over a region only 57 % opaque. The correction was applied
    // to the jamb test and not to its sibling. Both now measure the columns actually detected as
    // frame, so a re-shoot that moves the pipe cannot false-red a working asset.
    const { left, right } = frameColumns();
    const cols = [...left, ...right];
    expect(cols.length, 'premise: some frame material was found at all').toBeGreaterThan(0);
    const frame = cols.reduce((sum, x) => sum + luminance(x, x + 1, 40, 260), 0) / cols.length;
    const void_ = luminance(IN_X0, IN_X1, IN_Y0, IN_Y1);
    expect(frame, `frame ${frame.toFixed(1)} vs void ${void_.toFixed(1)}`).toBeGreaterThan(
      void_ * 2,
    );
  });
});
