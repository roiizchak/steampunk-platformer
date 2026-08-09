import { describe, expect, it } from 'vitest';
import {
  boundsRect,
  editsFromConfig,
  emptyEdits,
  frameCells,
  liftAboveCellFloor,
  measureCellBounds,
  serialiseBounds,
} from '../../src/render/gymBounds';

// Read as RAW TEXT, not as a JSON import: the round-trip claim below is about BYTES, and a parsed
// import cannot tell a save that preserves the file from one that reformats it. Same idiom, and
// same reason, as `tilemap-data.test.ts` reading the shipped `.tmj` (vault 3.1).
const SHIPPED_BOUNDS = import.meta.glob('../../public/assets/config/character-bounds.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * The Gym's measurement and its save path.
 *
 * `serialiseBounds` is here because criterion 4.15 requires the Gym's save path to be typechecked
 * and inside the test include list *(vault A4)* — a scene that writes shipped configuration is
 * using live ammunition, and the only defensible version of that is one whose bytes are decided by
 * a pure function a test can call.
 */

/** RGBA for a `w x h` sheet, transparent, with `paint` marking opaque pixels. */
function sheet(w: number, h: number, paint: (x: number, y: number) => boolean): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (paint(x, y)) {
        data[(y * w + x) * 4 + 3] = 255;
      }
    }
  }
  return data;
}

describe('frameCells', () => {
  it('walks a one-row strip left to right', () => {
    expect(frameCells(120, 40, 50, 3)).toEqual([
      { x: 0, y: 0, w: 40, h: 50 },
      { x: 40, y: 0, w: 40, h: 50 },
      { x: 80, y: 0, w: 40, h: 50 },
    ]);
  });

  it('wraps row-major, the way generateFrameNumbers indexes', () => {
    expect(frameCells(80, 40, 50, 4)[3]).toEqual({ x: 40, y: 50, w: 40, h: 50 });
  });

  it('throws rather than measuring a sheet narrower than one frame', () => {
    expect(() => frameCells(30, 40, 50, 1)).toThrow(/cannot hold/);
  });
});

describe('measureCellBounds', () => {
  it('finds the opaque bounding box in cell-local coordinates', () => {
    // One 20x20 cell at x=20, with a 4x6 block at cell-local (5,7).
    const data = sheet(40, 20, (x, y) => x >= 25 && x < 29 && y >= 7 && y < 13);
    const bounds = measureCellBounds(data, 40, { x: 20, y: 0, w: 20, h: 20 });
    expect(bounds).toEqual({ minX: 5, minY: 7, maxX: 8, maxY: 12 });
    expect(boundsRect(bounds!)).toEqual({ x: 5, y: 7, w: 4, h: 6 });
  });

  it('does not see the neighbouring cell', () => {
    // Paint ONLY the left cell; the right cell must come back INDETERMINATE, not borrow it.
    const data = sheet(40, 20, (x) => x < 20);
    expect(measureCellBounds(data, 40, { x: 20, y: 0, w: 20, h: 20 })).toBeNull();
    expect(measureCellBounds(data, 40, { x: 0, y: 0, w: 20, h: 20 })).not.toBeNull();
  });

  it('reports INDETERMINATE for an empty cell rather than a zero box (vault 4.18)', () => {
    const data = sheet(20, 20, () => false);
    expect(measureCellBounds(data, 20, { x: 0, y: 0, w: 20, h: 20 })).toBeNull();
  });

  it('ignores the near-zero alpha rim chroma keying leaves behind', () => {
    const data = sheet(20, 20, (x, y) => x === 10 && y === 10);
    // A rim pixel at alpha 4 — below the default threshold of 8.
    data[(5 * 20 + 5) * 4 + 3] = 4;
    expect(measureCellBounds(data, 20, { x: 0, y: 0, w: 20, h: 20 })).toEqual({
      minX: 10,
      minY: 10,
      maxX: 10,
      maxY: 10,
    });
    // ...and counts it once the threshold is lowered, which proves the rim was really there.
    expect(measureCellBounds(data, 20, { x: 0, y: 0, w: 20, h: 20 }, 1)!.minX).toBe(5);
  });
});

describe('liftAboveCellFloor', () => {
  it('is zero when the lowest drawn pixel is the cell last row', () => {
    expect(liftAboveCellFloor({ minX: 0, minY: 0, maxX: 1, maxY: 99 }, 100)).toBe(0);
  });

  it('counts rows, not the off-by-one', () => {
    expect(liftAboveCellFloor({ minX: 0, minY: 0, maxX: 1, maxY: 97 }, 100)).toBe(2);
  });
});

describe('serialiseBounds', () => {
  const base = {
    _comment: 'provenance that must survive a save untouched',
    scale: 0.23723229,
    animations: {
      idle: { loop: true, verticalAnchor: 'feet', footOffsetPx: 0, activeFrames: [] },
      jump: { loop: false, verticalAnchor: 'centroid', footOffsetPx: 0, activeFrames: [] },
    },
  };

  it('writes only the edited fields and round-trips everything else', () => {
    const text = serialiseBounds(base, {
      footOffsetPx: { jump: -3 },
      activeFrames: {},
    });
    const out = JSON.parse(text);
    expect(out.animations.jump.footOffsetPx).toBe(-3);
    expect(out.animations.jump.verticalAnchor).toBe('centroid');
    expect(out.animations.idle.footOffsetPx).toBe(0);
    expect(out._comment).toBe(base._comment);
    expect(out.scale).toBe(0.23723229);
  });

  it('does not mutate the config it was handed', () => {
    serialiseBounds(base, { footOffsetPx: { idle: 9 }, activeFrames: {} });
    expect(base.animations.idle.footOffsetPx).toBe(0);
  });

  it('sorts and de-duplicates active frames so identical toggles produce identical bytes', () => {
    const a = serialiseBounds(base, { footOffsetPx: {}, activeFrames: { idle: [5, 2, 2, 9] } });
    const b = serialiseBounds(base, { footOffsetPx: {}, activeFrames: { idle: [9, 5, 2] } });
    expect(a).toBe(b);
    expect(JSON.parse(a).animations.idle.activeFrames).toEqual([2, 5, 9]);
  });

  it('ends with a newline, like every other file the pipeline writes', () => {
    expect(serialiseBounds(base, emptyEdits()).endsWith('}\n')).toBe(true);
  });

  it('throws on an animation the config does not declare (vault 4.16)', () => {
    expect(() =>
      serialiseBounds(base, { footOffsetPx: { attack: 4 }, activeFrames: {} }),
    ).toThrow(/does not declare/);
  });

  it('throws on a fractional offset rather than writing a nudge nothing can draw', () => {
    expect(() =>
      serialiseBounds(base, { footOffsetPx: { idle: 1.5 }, activeFrames: {} }),
    ).toThrow(/whole number/);
  });

  it('refuses a config with no animations object instead of inventing one', () => {
    expect(() => serialiseBounds({ scale: 1 }, emptyEdits())).toThrow(/no `animations` object/);
    expect(() => serialiseBounds(null, emptyEdits())).toThrow(/no `animations` object/);
  });
});

describe('the shipped character-bounds.json', () => {
  // The Gym loads this file at runtime and hands it straight to `serialiseBounds`. If the shipped
  // shape ever stops satisfying it, the save path breaks in a dev-only scene no unit test would
  // otherwise reach — so the real bytes are run through the real function here.
  const text = Object.values(SHIPPED_BOUNDS)[0];
  const raw = JSON.parse(text);

  it('is reachable at all — a missing config must fail here, not silently skip', () => {
    expect(Object.keys(SHIPPED_BOUNDS)).toHaveLength(1);
  });

  it('loses no content and reorders nothing on an unedited save', () => {
    // NOT a byte-for-byte claim, and the difference is worth stating rather than asserting around.
    // The shipped file is hand-formatted: 9 blank lines group it into sections and each animation
    // sits on one line. `JSON.stringify` reproduces neither, so an unedited save comes back
    // semantically identical and 41 lines longer. That is a real consequence of the download-and-
    // move-it-yourself save path, and the scene says so on screen.
    //
    // What must hold is that no VALUE changes and no key moves — including the `_scale` and
    // `_stride*` provenance notes vault A5 requires a human to have written deliberately.
    const out = JSON.parse(serialiseBounds(raw, emptyEdits()));
    expect(out).toEqual(raw);
    expect(Object.keys(out)).toEqual(Object.keys(raw));
    expect(Object.keys(out.animations)).toEqual(Object.keys(raw.animations));
  });

  it('is idempotent, so re-saving a saved file changes nothing further', () => {
    const once = serialiseBounds(raw, emptyEdits());
    expect(serialiseBounds(JSON.parse(once), emptyEdits())).toBe(once);
  });

  it('keeps the scale untouched — the one number a human pastes deliberately (vault A5)', () => {
    const edited = JSON.parse(serialiseBounds(raw, { footOffsetPx: { run: -2 }, activeFrames: {} }));
    expect(edited.scale).toBe(raw.scale);
    expect(edited._scale).toBe(raw._scale);
    expect(edited.animations.run.footOffsetPx).toBe(-2);
    expect(edited.animations.run.verticalAnchor).toBe(raw.animations.run.verticalAnchor);
  });

  it('declares every animation the Gym can select', () => {
    expect(Object.keys(raw.animations).sort()).toEqual(['fall', 'idle', 'jump', 'run', 'walk']);
  });
});

describe('editsFromConfig — the Gym must start from the file, not from zero', () => {
  /**
   * The bug this closes, in one sentence: `serialiseBounds` ASSIGNS what it is handed, so a Gym
   * seeded from zero silently discards every value the file already held for the fields it owns.
   *
   * Raised by the `voltagent-qa-sec:code-reviewer` gate owner, brief 1, finding F3. Latent on
   * today's art — every animation reads 0 and `[]` — and live the moment Phase 5 fills
   * `activeFrames`, which is what the field exists for.
   */
  const populated = {
    animations: {
      idle: { footOffsetPx: 0, activeFrames: [] },
      run: { footOffsetPx: -3, activeFrames: [3, 4] },
    },
  };

  it('reads the values already in the file', () => {
    expect(editsFromConfig(populated)).toEqual({
      footOffsetPx: { idle: 0, run: -3 },
      activeFrames: { idle: [], run: [3, 4] },
    });
  });

  it('a one-field edit no longer destroys the others — the actual defect', () => {
    // Seed from the file, nudge idle only, save. `run` must come back untouched.
    const edits = editsFromConfig(populated);
    edits.footOffsetPx.idle = -1;
    const out = JSON.parse(serialiseBounds(populated, edits));
    expect(out.animations.idle.footOffsetPx).toBe(-1);
    expect(out.animations.run.footOffsetPx).toBe(-3);
    expect(out.animations.run.activeFrames).toEqual([3, 4]);
  });

  it('and seeding from zero DOES destroy them — so this test can fail', () => {
    // The pre-fix behaviour, asserted explicitly. Without this the test above passes on a config
    // whose other animations happen to be zero anyway, which is exactly today's shipped art (C2).
    const edits = emptyEdits();
    edits.footOffsetPx.idle = -1;
    const out = JSON.parse(serialiseBounds(populated, edits));
    expect(out.animations.run.footOffsetPx).toBe(-3); // untouched: never handed to the serialiser
    expect(edits.activeFrames.run).toBeUndefined(); // ...but a run edit would have wiped [3, 4]
    const wiping = emptyEdits();
    wiping.activeFrames.run = [];
    expect(JSON.parse(serialiseBounds(populated, wiping)).animations.run.activeFrames).toEqual([]);
  });

  it('does not alias the config — mutating the edits cannot reach back into the file', () => {
    const edits = editsFromConfig(populated);
    edits.activeFrames.run.push(9);
    expect(populated.animations.run.activeFrames).toEqual([3, 4]);
  });

  it('yields empty edits for an unreadable config rather than throwing', () => {
    // The Gym still measures and still draws without a config; only saving is refused.
    expect(editsFromConfig(null)).toEqual(emptyEdits());
    expect(editsFromConfig({ scale: 1 })).toEqual(emptyEdits());
  });

  it('ignores fields of the wrong type instead of copying them through', () => {
    const junk = { animations: { idle: { footOffsetPx: '3', activeFrames: 'nope' } } };
    expect(editsFromConfig(junk)).toEqual(emptyEdits());
  });
});
