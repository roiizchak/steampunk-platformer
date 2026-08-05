# Gate 7 — Codex documentation review

**Date:** 2026-08-05 · **Reviewer:** Codex (`codex-cli 0.146.0`) via `/codex:rescue`
**Scope:** all 16 markdown files under `docs/`, read-only, no files modified by the reviewer.
**Trigger:** user request — *"review all the documentation we made based on data to make sure we
actually missed something."*

This is the **first run of the Codex review protocol** now written into
[PRD.md](../PRD.md#the-codex-review-protocol), applied to documentation rather than to a diff.
Per **C11**, every finding below is either **APPLIED** or **REJECTED with a reason**. None are
silently dropped.

---

## Verdict

**21 findings. 18 applied, 2 rejected with reason, 1 escalated to the user.**

Two were blockers I had genuinely missed, and both were of the same kind: **I updated the four
documents I was thinking about and left the fifth asserting the old truth.** That is the precise
failure a same-context reviewer cannot catch, because the same-context reviewer is the one who
formed the incomplete mental list. It is the strongest evidence available that the protocol earns
its cost — collected before a single line of game code exists.

The single most valuable finding is **§2.4**, which no consistency check would have found: a
*phase-ordering* defect where Phase 4 gated on data Phase 5 produces.

---

## Applied

### Blockers

| # | Finding | Fix |
|---|---|---|
| 2.1 | `LESSONS-APPLIED.md` A2c still named `fal-ai/nano-banana-2` as the ✅ working default while STYLE.md had swapped to `nano-banana-pro`. **Two documents named different current models.** | A2c marked ⛔ SUPERSEDED, kept for provenance, with the ratio/resolution losses stated |
| 2.4 | **Phase 4 gate "contact frame lands inside the active window on every attack sheet" depends on `simTicks`, `startup` and active windows from `src/sim/combat.ts` — a Phase 5 deliverable.** Phase 4 also quietly violated *grey-box before art* for combat | **Attack / hurt / death sheets and all enemy art moved to Phase 5**, which now orders itself grey-box-then-art explicitly. Phase 4 keeps only idle/walk/run/jump, whose timings exist from Phase 2 |
| 4.1 | `npm run assets:fetch` re-fetches job records **by request id**, but GENERATION-LOG.md never recorded one and `_generated/` is gitignored — the rebuild contract was unsatisfiable from a fresh clone | Logging contract added to GENERATION-LOG.md making `request_id` mandatory; the 21 existing entries flagged as not rebuildable |

### High

| # | Finding | Fix |
|---|---|---|
| 1.1 | STYLE.md §2b called §4/§5 hypotheses, but §4/§5 still read "Verified", "calibrated, do not guess", "Measured" | Scope banner on §4; every heading and claim re-attributed to `nano-banana-2`; method separated from numbers |
| 1.2 | `LESSONS-APPLIED` 3.2 called `2752×1536` "the single most load-bearing number" without noting it is the retired model's | Stale marker added; Phase 3's actual world-width source clarified |
| 1.3 | ASSET-PIPELINE stated "Measured fact: nano-banana-2 returns mode=RGB" as a current-model fact | Rewritten as a **deliberate default under asymmetric risk**, with the re-measure requirement |
| 2.2 | ASSET-PIPELINE asserted "~97 frames of a 4-second clip" while SOURCE-ANALYSIS said "do not assume 24 fps" — **I wrote both, in the same session** (vault 4.3) | Frame-count assertion removed; replaced with an explicit "this number is unknown until ffprobe" |
| 2.3 | Grid size read as already published in one file, not-yet-published in two others | Marked **PROPOSED**; Phase 3 criterion 3.6 now replaces the marker |
| 3.1 / 3.2 | `$0.15`, `$0.30`, `$0.018`, `$0.08` asserted with no source | Price sources cited inline with date and both endpoints; Bria's $0.018 downgraded to indicative, to be re-quoted at use |
| 4.3 | Phase 10 requires a CSP config and a rollback command; **no document names a hosting target** | **Escalated — see below** |
| 4.4 | The immutable CHARACTER ANCHOR is required before sprite work but was not a Phase 4 deliverable or gate | Added as deliverable and gate 4.0b |
| 4.5 | "Readable at true sprite size" needs camera zoom and viewport; Phase 3 published neither | Phase 3 gate 3.6b added; Phase 4 gate 4.0d reads them |
| 4.6 | No document lists which enemies exist or which animations each needs | `docs/ASSET-MANIFEST.md` added as a Phase 4 deliverable, gate 4.0c |
| 4.7 | Phase 3's world-width criterion demanded "measured background pixels" — but Phase 3 has no background art | Rewritten to measure the shipped `.tmj`'s own `width × tilewidth`; the background-pixel rule re-scoped to Phase 4 |

### Medium

| # | Finding | Fix |
|---|---|---|
| 1.4 | `LESSONS-APPLIED` A2 said alpha would be resolved "at zero extra cost" — now a paid $0.15 probe | Struck through and corrected |
| 1.5 | Seed conclusion attributed to `nano-banana-2` | Re-scoped, **and a new risk surfaced**: `nano-banana-pro`'s seed determinism is untested, which if false voids the whole A/B method. Added to gate 0 |
| 2.5 | `end_image_url` described as producing a "true loop" — an unverified property of an input that merely exists | Downgraded to *intended*, with gate 4.9 named as what decides it |
| 4.8 | `index.json` schema covered only character animations; Phases 6 and 7 ship HUD and audio assets | Schema extension made a Phase 4 deliverable; catalog criteria added to Phases 6 and 7 |
| 3.4 | `4.5:1` contrast asserted with no standard cited | Now cites **WCAG 2.2 SC 1.4.3, Level AA** |

---

## Rejected, with reason

**3.3 — "Edge-energy, hue-gap and ×1.6 scale-transfer numbers cite no analyzer, formula or script."**
**Correct as stated, and I am not fixing it by adding a citation, because there is nothing honest to
cite.** Those numbers came from throwaway analysis during Gate 5; the code was not kept. Per **4.15**
(*prose is not reproducibility*) the right response is to say so rather than to dress it up:
**the Gate 5 separation and scale measurements are not reproducible.** They are recorded because they
are what the decision was actually made on, and the decision itself was ratified by eye on an image
that still exists. Any measurement that gates future work goes through `tools/gen/gates.ts`, which is
tracked and self-tests on fixtures (**4.21**). Noted here rather than patched.

**2.6 — "Phase 7's `≤ −1.0 dBFS` ceiling is preselected, contradicting 'measured, not chosen'."**
This misreads the vault rule. **9.2** says pick thresholds from *what is correct*, not from what
currently passes — and −1.0 dBFS is standard digital headroom below 0 dBFS clipping, which is exactly
a correct-by-construction threshold rather than one fitted to our files. What must be *measured* is
our cue stack against it. The criterion has been reworded to make that distinction explicit rather
than changed.

**Partial correction to 4.9 — "`performance-engineer`, `ui-ux-tester`, `ui-ux-pro-max` are never
defined or installed."** They are installed and available in this environment
(`voltagent-qa-sec:performance-engineer`, `voltagent-qa-sec:ui-ux-tester`, `voltagent-qa-sec:qa-expert`,
`voltagent-qa-sec:code-reviewer`, and the `ui-ux-pro-max` skill). Codex could not see them because
they are harness capabilities, not repository files — a fair limit of a local audit, and it said so
in its own "could not verify" section. **The fallback-owner half of the finding stands and is
recorded as open**: no document says what happens if one is unavailable mid-phase.

---

## Escalated to the user

**No hosting target has ever been chosen.** Phase 10 requires a CSP header configuration and a
rollback command, both properties of a deployment destination that no document names. Recorded in
[phase-10-ship.md](../prd/phase-10-ship.md) §1 as blocking, with criterion 10.6 marked blocked.
Needs answering before Phase 9 ends: hosted playable URL, or a handed-over `dist/` folder?

---

## What Codex could not check

Stated verbatim in its report and worth preserving, because a gate's blind spots are part of its
result *(vault 9.3)*:

- Live fal.ai pricing pages, endpoint schemas and licence terms — no network access during the audit.
  **These are exactly the claims I verified separately via `genmedia` and the fal model-API reference
  before writing them**, so the two passes are complementary rather than overlapping.
- Whether the 21 style probes were actually generated with the recorded prompt and seed — no job
  records present. It did independently confirm from the PNG headers that they are `2752×1536`, RGB,
  no alpha, which corroborates the documented measurement.
- The `$1.68` figure — no invoice present. Still true.
- Any Seedance 2 property. Nothing has been generated on it.
