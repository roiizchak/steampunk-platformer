/**
 * The Gym's EDIT model and its save payload. **Engine-free** (vault 2.12).
 *
 * Split out of `gymBounds.ts` on 2026-08-23 when inventory 4.6's `mergeEdits` took that file to 402
 * lines. The seam is the one the code already had: `gymBounds.ts` MEASURES a sheet — cells, alpha
 * bounds, the readout — and this file describes what a person has CHANGED about one and what gets
 * written back. Nothing here reads a pixel.
 *
 * **`serialiseBounds` is the Gym's save path, and vault A4 makes that an authorization decision.**
 * It lives here rather than in the scene for exactly that reason: `src/` is inside the typecheck
 * program and this file is inside the unit suite's include list, which is criterion 4.15. The
 * scene does the download; every byte it writes is decided here.
 */

/** The per-animation fields `character-bounds.json` actually owns, and the only ones the Gym writes. */
export interface BoundsEdits {
  /** Vertical nudge per animation, in game px. The field ASSET-PIPELINE §6 names as the Gym's own. */
  footOffsetPx: Record<string, number>;
  /** Attack-hitbox active frames per animation. Phase 5 fills these; the mechanism ships now. */
  activeFrames: Record<string, number[]>;
}

export function emptyEdits(): BoundsEdits {
  return { footOffsetPx: {}, activeFrames: {} };
}

/**
 * Fold edits made **while a config fetch was in flight** onto the values that fetch returned.
 *
 * ## Why this exists — inventory 4.6, `phase-04-impl.md:29`
 *
 * `GymScene.create()` starts `loadConfig()` and returns; the scene is interactive immediately. Any
 * nudge or active-frame toggle made before that promise settles landed in `this.edits`, and
 * `loadConfig` then did `this.edits = result.edits` — **replacing the object outright**. The work was
 * gone, and `refresh()` redrew from the file's values, so the readout showed a plausible number
 * rather than an error. Silent, and on the one screen whose whole job is measuring by eye.
 *
 * The recorded fix was to make the loss *loud*. This makes it **impossible** instead, which is
 * cheaper than a warning and leaves nothing for the user to react to.
 *
 * ## The precedence, and why it is this way round
 *
 * `pending` wins. A keystroke happened **after** the fetch was issued, so it is the newer statement
 * of intent — and it is the only one the person can see on screen. Silently reverting it to the
 * file's value is precisely the defect.
 *
 * Per action, not per object: an in-flight nudge to `walk` must not discard the file's `run` offset.
 * That is what makes this a merge rather than a pick.
 *
 * ⚠️ **Not for a slug change.** `stepSheet` clears the edits before re-loading on purpose — carrying
 * one character's offsets onto another would edit the wrong file. Merging against `emptyEdits()`
 * there is a no-op, which is why that path stays correct without a special case.
 */
export function mergeEdits(loaded: BoundsEdits, pending: BoundsEdits): BoundsEdits {
  return {
    footOffsetPx: { ...loaded.footOffsetPx, ...pending.footOffsetPx },
    activeFrames: { ...loaded.activeFrames, ...pending.activeFrames },
  };
}

/**
 * The edits implied by a config file — i.e. the values already in it for the fields the Gym owns.
 *
 * The Gym must START from these, not from each type's zero, because `serialiseBounds` ASSIGNS what
 * it is handed. Seeded from zero, nudging `footOffsetPx` on one animation and saving would silently
 * discard every other value the file already held: a config declaring
 * `run: { footOffsetPx: -3, activeFrames: [3, 4] }` would be written back as
 * `footOffsetPx: -1, activeFrames: []`, with the Gym's readout showing the edit rather than the
 * effective value, so nothing warned you.
 *
 * Latent while every animation reads 0 and `[]`, and live the moment Phase 5 fills `activeFrames`,
 * which is the field's entire purpose. Raised by the `voltagent-qa-sec:code-reviewer` gate owner,
 * brief 1, finding F3 — the vault-A4 "a dev scene writing shipped configuration is using live
 * ammunition" class exactly.
 *
 * Lives here rather than in the scene so it is reachable from a unit test, which is the same reason
 * `serialiseBounds` does. An unreadable config yields empty edits rather than throwing: the Gym's
 * other jobs — measuring and looking — do not need it, and `serialiseBounds` refuses the save
 * separately *(vault 4.16)*.
 */
export function editsFromConfig(raw: unknown): BoundsEdits {
  const edits = emptyEdits();
  if (!hasAnimations(raw)) {
    return edits;
  }
  for (const [name, entry] of Object.entries(raw.animations)) {
    if (typeof entry?.footOffsetPx === 'number') {
      edits.footOffsetPx[name] = entry.footOffsetPx;
    }
    if (Array.isArray(entry?.activeFrames)) {
      edits.activeFrames[name] = [...entry.activeFrames];
    }
  }
  return edits;
}

interface BoundsFile {
  animations: Record<string, { footOffsetPx?: number; activeFrames?: number[] }>;
}

function hasAnimations(raw: unknown): raw is BoundsFile {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const animations = (raw as { animations?: unknown }).animations;
  return typeof animations === 'object' && animations !== null && !Array.isArray(animations);
}

/**
 * Serialise `character-bounds.json` with the Gym's edits applied, and **nothing else touched**.
 *
 * Every other byte round-trips through `JSON.stringify(raw, null, 2)` — the same contract
 * `ElementEditorScene.saveLevel` keeps with the `.tmj`, and for the same reason: this file carries
 * the derived `scale` and a long provenance record that vault A5 says a human pastes deliberately.
 * A save that rewrote those from a running scene would be the A5 defect with extra steps.
 *
 * An animation named in `edits` that the file does not declare **throws**. It is a slug typo or a
 * stale scene, and silently creating the entry writes a config nothing generated *(vault 4.16)*.
 */
export function serialiseBounds(raw: unknown, edits: BoundsEdits): string {
  if (!hasAnimations(raw)) {
    throw new Error(
      'serialiseBounds: character-bounds.json has no `animations` object. Saving a config the Gym ' +
        'could not read would overwrite the real one with a guess (vault 4.16).',
    );
  }

  const out = JSON.parse(JSON.stringify(raw)) as BoundsFile;
  const declared = new Set(Object.keys(out.animations));

  for (const name of new Set([...Object.keys(edits.footOffsetPx), ...Object.keys(edits.activeFrames)])) {
    if (!declared.has(name)) {
      throw new Error(
        `serialiseBounds: edit for "${name}", which character-bounds.json does not declare. ` +
          `Declared: ${[...declared].join(', ')}.`,
      );
    }
  }

  for (const [name, offset] of Object.entries(edits.footOffsetPx)) {
    if (!Number.isInteger(offset)) {
      throw new Error(
        `serialiseBounds: footOffsetPx for "${name}" is ${offset}. It is a whole number of game ` +
          `pixels — a fractional nudge cannot be drawn and would land differently on every zoom.`,
      );
    }
    out.animations[name].footOffsetPx = offset;
  }

  for (const [name, frames] of Object.entries(edits.activeFrames)) {
    // Sorted and de-duplicated, so an identical set of toggles always produces identical bytes —
    // otherwise the byte-identical rebuild gate (vault 4.15) fails on toggle ORDER.
    out.animations[name].activeFrames = [...new Set(frames)].sort((a, b) => a - b);
  }

  return `${JSON.stringify(out, null, 2)}\n`;
}
