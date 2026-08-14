/**
 * G6 edge-bleed exceptions — the clips where what touches the frame is an EFFECT, not the subject.
 *
 * ## Why this file exists
 *
 * G6 (`edgeGate.mjs`) measures an opaque mask and fails a frame whose mask reaches the canvas
 * boundary. It exists because every Phase 5 clip came back with the subject sheared off by its own
 * video frame edge, and it has caught that defect repeatedly. **Nothing here weakens it.**
 *
 * But an opaque mask cannot tell a sheared limb from a muzzle flash — the same blind spot already
 * recorded for G1, which cannot tell a boot from a hand. Two `brass-sentry` clips fail G6 on pixels
 * that are not the machine, and session 10 paid twice to establish that no generation parameter
 * fixes them.
 *
 * ## What was tried first, and what it cost
 *
 * | round | anchor | result |
 * |---|---|---|
 * | `fire-r3` | 3130² padded (`--fill 0.45`) | 5 of 6 fail → **1 of 6**. Padding works on the SUBJECT. |
 * | `fire-r4` | 3130² + `DISCHARGE_MARGIN` clause | 1 of 6 — frame 0, right 0, machine at L232 T278 B244 |
 * | `fire-r5` | **4024² padded (`--fill 0.35`)** | still fails. Machine gained margin on every edge (`L232→276 T278→308 B244→296`); right edge stayed 0 |
 * | `death-r4` | 3130² padded | frame 3, **top** 0, machine at L226 R200 B244 |
 * | `death-r6` | **4024² padded** | **worse** — frame 1, **right** 0, L142; the debris spread further |
 *
 * `$2.38`, two single-variable rounds, both measured and both looked at at full resolution.
 * **Padding scales the subject; it cannot scale an effect whose purpose is to leave the scene.**
 * `fire`'s right edge is crossed by the departing bolt (8 opaque rows at y 406–413 on `-r5`);
 * `death`'s top edge by detached steam puffs (x 320–569 on `-r4`). Full log in
 * `docs/generations/phase-05-fire-repad.md`.
 *
 * Note also that the sheet does not NEED to draw the projectile: `src/sim/projectiles.ts` fires a
 * real bolt that the scene draws separately. The pixels G6 objects to in `fire` are redundant with
 * a game object that already exists.
 *
 * ## Why this is a gate and not a bypass
 *
 * An exception that said "skip G6 for this key" would be a rubber stamp — it would silently cover
 * the next round too, which is exactly how a cropped clip would ship. So an entry is pinned on
 * **both** axes that can drift:
 *
 *  - **`file`** — the exception applies to ONE clip. Adopt a different round and G6 throws again,
 *    because that round has not been looked at. This is the same "write the decision down where it
 *    can be reviewed, diffed and tested" fix that closed `aspect_ratio`, the winning-clip glob and
 *    the padded-anchor URL.
 *  - **`edges`** — only the recorded edges may bleed. `death-r6` failing on the RIGHT rather than
 *    the top is precisely the case this catches: same key, same kind of clip, different defect.
 *
 * And `tests/unit/edge-exceptions.test.ts` asserts every entry **still fails G6 on exactly those
 * edges**. That goes red in both directions — if the gate is ever weakened, and if the art is ever
 * fixed without the entry being deleted. No threshold was moved; `DEFAULT_MIN_ALPHA` stays 255 and
 * `DEFAULT_MARGIN_PX` is untouched.
 */

/**
 * Accepted edge bleed, per `slug/action` key.
 *
 * `edges` uses `gateEdgeBleed`'s own margin names (`left` `right` `top` `bottom`), so the two cannot
 * drift into different vocabularies.
 */
export const ACCEPTED_EDGE_BLEED = Object.freeze({
  'brass-sentry/fire': Object.freeze({
    file: 'brass-sentry-fire-r4.mp4',
    edges: Object.freeze(['right']),
    reason:
      'the muzzle discharge leaves the frame. The turret is complete and sits at L232 T278 B244; ' +
      'what crosses the right edge is the flash and the departing bolt. Confirmed by eye at full ' +
      'resolution, and re-shot once from a larger padded anchor (-r5) which did not move it.',
  }),

  'brass-sentry/death': Object.freeze({
    file: 'brass-sentry-death-r4.mp4',
    edges: Object.freeze(['top']),
    reason:
      'the steam plume leaves the frame. The wreck is complete and sits at L226 R200 B244; what ' +
      'crosses the top edge is detached smoke puffs spanning x 320-569 — a separate mask region, ' +
      'not the machine. Re-shot once from a larger padded anchor (-r6), which spread the debris ' +
      'further and failed the RIGHT edge instead, and was rejected.',
  }),
});

/**
 * The edges `gateEdgeBleed` actually failed, recomputed from its own returned margins.
 *
 * Derived rather than parsed out of the human-readable `reason` string: a gate's prose is for a
 * human, and matching on it would break the moment the wording changed *(vault 5.3 — two
 * definitions of one concept is where the bug lives)*.
 */
export function failedEdgesOf(value) {
  if (!value || !value.margins) {
    return [];
  }
  const marginPx = value.marginPx;
  return Object.entries(value.margins)
    .filter(([, distance]) => distance < marginPx)
    .map(([edge]) => edge)
    .sort();
}

/**
 * Is this specific failure one of the accepted ones? Returns the reason string when it is, `null`
 * when it is not — so the caller throws on `null` exactly as it always did.
 *
 * Pure, and takes the declared file rather than reading `CLIP_JOBS`, so the unit suite can exercise
 * BOTH directions on synthetic input *(vault C2 — a gate that cannot go red is decoration)*.
 */
export function acceptedEdgeBleed(key, declaredFile, value) {
  const entry = ACCEPTED_EDGE_BLEED[key];
  if (!entry) {
    return null;
  }
  // A different round has not been looked at. Refusing here is the whole point of pinning the file.
  if (declaredFile !== entry.file) {
    return null;
  }
  const failed = failedEdgesOf(value);
  if (failed.length === 0) {
    return null;
  }
  // SUBSET, not equality: a frame failing fewer of the accepted edges is still the accepted defect,
  // but one failing an edge nobody examined is a new defect and must throw.
  const allowed = new Set(entry.edges);
  if (!failed.every((edge) => allowed.has(edge))) {
    return null;
  }
  return entry.reason;
}
