/**
 * Which image every clip is animated FROM — the anchor URLs, and the per-generation padded overrides.
 *
 * Split out of `clipJobs.mjs` when adding the six session-6 padded records took that file to 469
 * lines. Anchors, adoption (`clipAdoption.mjs`) and the job records themselves are three concerns;
 * they were one file only because they arrived one session at a time.
 */

/**
 * One anchor URL per slug, uploaded once and reused for every action that slug performs. These are
 * fal submission parameters too, and belonged in no file before this one — see
 * `_generated/phase05/anchor-urls.txt`, which is gitignored and cannot be this project's copy of
 * record.
 */
export const ANCHOR_URLS = Object.freeze({
  'brass-courier': 'https://v3b.fal.media/files/b/0aa5ad06/h1egp0r8ncH7dws0WSNQM_anchor.png',
  'brass-sentry': 'https://v3b.fal.media/files/b/0aa5ad07/eTruVD1130OxBEzbPfi0G_anchor.png',
  'rust-scavenger': 'https://v3b.fal.media/files/b/0aa5ad07/nJzWf6JtlGVoDoXkLfuYV_anchor.png',
});

/**
 * Each anchor's MEASURED pixel ratio (width / height), declared rather than re-measured at runtime.
 *
 * Measured with this repository's own decoder; the courier's value was itself a correction — a
 * generation log called that anchor *"a square 2048²"* and it is **1536 × 2752**, which a Codex
 * review caught and which invalidated the recorded root cause of the whole crop problem.
 *
 * This is the input to the reframe guard in `clipJobs.mjs`. A padded anchor is square by
 * construction (`padAnchor.mjs` writes an N × N canvas), so it is 1.0 and resolves to `1:1`.
 */
export const ANCHOR_RATIOS = Object.freeze({
  'brass-courier': 1536 / 2752,
  'brass-sentry': 1.0,
  'rust-scavenger': 1.0,
});

/** Every `aspect_ratio` the endpoint accepts, as a number, from the live schema. */
const LEGAL_RATIOS = Object.freeze({
  '21:9': 21 / 9,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '3:4': 3 / 4,
  '9:16': 9 / 16,
});

/**
 * The `aspect_ratio` string that does NOT reframe an anchor of this ratio — the nearest legal value.
 *
 * "Nearest" rather than "exact" because a generated anchor is never a perfect ratio: the courier's
 * 1536 × 2752 is 0.5581 against 9:16's 0.5625, a 0.8 % difference that no model will reframe over.
 * The gap to the next legal value (`3:4`, 0.75) is 34 %, so the choice is never ambiguous in
 * practice — and if a future anchor ever lands between two values, that is a fact worth failing on
 * rather than rounding, so the caller checks the margin.
 */
export function expectedAspectRatio(ratio) {
  let best = null;
  let bestErr = Infinity;
  for (const [name, value] of Object.entries(LEGAL_RATIOS)) {
    const err = Math.abs(Math.log(ratio / value));
    if (err < bestErr) {
      bestErr = err;
      best = name;
    }
  }
  return best;
}

/**
 * PER-KEY padded-anchor overrides. **This is the highest-value record in the file.**
 *
 * ## The defect it closes
 *
 * `ANCHOR_URLS` above is keyed by SLUG — one URL for every action a subject performs — and
 * `submit-clips.mjs` emits `job.anchorUrl` straight into `--image_url`. **Padding is a property of
 * a GENERATION, not of a subject**, so there was no place to say "this clip was shot from the
 * padded canvas" and no way for the tool to submit one. Every planned padded re-shoot would have
 * gone out against the unpadded anchor and tested the treatment by not applying it.
 *
 * The record was already internally contradictory when this was found: `CLIP_FILES` declares
 * `brass-sentry/fire` as `-r3` and its comment states that clip came from *"the anchor padded to
 * 3130²"*, while the machine-readable `anchorUrl` beside it still resolved to the 2048² original.
 * Prose said padded, data said unpadded, and **the data is what gets submitted**.
 *
 * ## Why the URL was not in version control at all
 *
 * Session 4's padding probe uploaded the canvas by hand. The only copy of its URL was inside
 * `_generated/phase05/video/brass-sentry-fire-r3.job.json` — and `_generated/` is **gitignored**,
 * so the project's copy of record did not contain the address of art it had paid $1.19 to use.
 * Promoting it here is the same move that closed `aspect_ratio` (a parameter typed into a command
 * line and recorded nowhere) and `CLIP_FILES` (a decision inferred from a directory listing):
 * **stop remembering it, write it down where it can be reviewed, diffed and tested.**
 *
 * `sha256` is the local padded PNG's digest, carried so an upload can be proven to be the bytes
 * that were gated rather than assumed to be. Anchor identity has been assumed once on this project
 * and it cost a probe. It is **data, not a runtime check** — the padded PNG lives under gitignored
 * `_generated/anchors-padded/` and may legitimately be absent on a fresh clone, so verifying it is
 * a step in the generation workflow, never something that throws at module load.
 *
 * ## Why `--fill` is what it is, per subject
 *
 * Padding buys margin by spending subject resolution, so the fill fraction is the trade-off dial.
 * `0.50` matches the sentry's **proven** ~25 % margin profile. `0.65` was rejected for the courier:
 * it leaves 18.2 % headroom, and the 17-clip framing report shows courier clips already being cut
 * against 18.4 % / 20.6 %. Aiming at a level the measurement has already shown failing is not a
 * treatment. **Do not change these values without re-running that comparison.**
 */
export const PADDED_ANCHORS = Object.freeze({
  /**
   * `--fill 0.45` → 3130², figure 68.8 % → 45.0 % of height, margins T29.6 B25.5 L24.3 R25.2.
   * G1 returned an identical verdict on padded and unpadded (`PASS, sole-spread=0px of 21px`),
   * proving the blit is a pure translation. Measured single-variable against the unpadded `-r2`
   * control: G6 went **5 of 6 fail → 1 of 6**, margins roughly doubled.
   * `request_id 019ff0db-0597-7490-ae69-921c125fed29`.
   */
  'brass-sentry/fire': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5e8eb/dy30uDOQhkQNGzOlTpP4C_brass-sentry-padded.png',
    sha256: '4c6ec48b1d810568a2c30e7e7ab7c0b2e58437c7f40b78910e7644c165569e08',
    source: '_generated/anchors-padded/brass-sentry-padded.png',
  }),

  /**
   * The same 3130² sentry canvas as `fire` above — one padded PNG serves every sentry action.
   * `death`'s failure is a genuine one (G6 f1/8, left 0): the wreckage spread really does reach the
   * frame, which is what padding is for.
   */
  'brass-sentry/death': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5e8eb/dy30uDOQhkQNGzOlTpP4C_brass-sentry-padded.png',
    sha256: '4c6ec48b1d810568a2c30e7e7ab7c0b2e58437c7f40b78910e7644c165569e08',
    source: '_generated/anchors-padded/brass-sentry-padded.png',
  }),

  /**
   * `rust-scavenger --fill 0.45` → **3690²**, figure 81.1 % → 45.0 % of height, margins
   * T27.2 B27.8 L33.4 R33.1. G1 returns an **identical** verdict padded and unpadded
   * (`sole-spread 23px/23px`), proving the blit is a pure translation.
   *
   * Uploaded 2026-08-11 (session 6) and **hash-verified by re-download**: the fetched bytes match
   * the local file's digest exactly. All three scavenger actions share it.
   *
   * `walk` is the odd one out and worth stating: it PASSES G6 and fails **extraction** — *"declared
   * cyclic but no window of it closes"*. That is a stride defect, not a framing one, and it was
   * fixed in the prompt (`motionCombat.mjs`, session 5) rather than by padding. It is padded anyway
   * because it is being re-shot regardless and the ratio must stay matched.
   */
  'rust-scavenger/walk': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5ecf0/6X0GqPhD7r1-tuxbrx4Pm_rust-scavenger-padded.png',
    sha256: '1fd1a6b8768229e47aad0a6d69d8286bbe306fc8aa2c89edcf922936c9f917c1',
    source: '_generated/anchors-padded/rust-scavenger-padded.png',
  }),

  /** G6 f3/12, **top 0** and left 8 — the failures moved to the top edge, which §10 did not record. */
  'rust-scavenger/chase': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5ecf0/6X0GqPhD7r1-tuxbrx4Pm_rust-scavenger-padded.png',
    sha256: '1fd1a6b8768229e47aad0a6d69d8286bbe306fc8aa2c89edcf922936c9f917c1',
    source: '_generated/anchors-padded/rust-scavenger-padded.png',
  }),

  /** G6 f1/10, top 0. The debris field genuinely spans the frame by frame 5. */
  'rust-scavenger/death': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5ecf0/6X0GqPhD7r1-tuxbrx4Pm_rust-scavenger-padded.png',
    sha256: '1fd1a6b8768229e47aad0a6d69d8286bbe306fc8aa2c89edcf922936c9f917c1',
    source: '_generated/anchors-padded/rust-scavenger-padded.png',
  }),

  /**
   * ⚠️ **`brass-courier/attack` and `/death` had padded records here and they were REMOVED in
   * session 6, after the padded round was bought, packed and measured.**
   *
   * The padded courier clip framed cleanly — no crop on any edge, which is what padding is for.
   * But `scale` is stored per SLUG (vault A5) and the courier's, 0.23723229, was derived from an
   * UNPADDED idle in which the figure stands 1214 px of a 1280 px frame. In the padded round the
   * figure fills ~480 px of a 960 px frame, so the same scale drew `attack` **114 px tall against
   * `hurt`'s 288 px** — the character shrinking to 40 % the instant it swings.
   *
   * **Padding is a property of a GENERATION and so is the scale it implies; a per-slug scale cannot
   * serve both.** That is this file's own opening lesson, arriving one layer further down.
   *
   * The courier is re-shot UNPADDED instead — and unpadded means **`9:16`**, not `1:1`, because
   * this anchor is 0.558 and 9:16 is its MATCHED ratio. Every clean courier sheet the project
   * ships was shot that way. See the reframe guard in `clipJobs.mjs`.
   */

  /**
   * **`brass-courier/hurt` is deliberately absent.** It extracts CLEAN — 6 frames, one-shot from
   * motion onset at frame 8 — and is NOT being re-shot. Only the per-action sweep found that, and it
   * saved $1.19. Do not add a record here "for consistency": a padded record is an instruction to
   * shoot from a different canvas, and this clip is not being shot.
   */
});
