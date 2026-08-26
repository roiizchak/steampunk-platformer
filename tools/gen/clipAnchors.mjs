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
   * `--fill 0.35` → **4024²**, figure 68.8 % → 35.0 % of height, margins T34.1 B30.9 L30.0 R30.7.
   * G1 `PASS, sole-spread=0px of 21px` — identical to the unpadded verdict, proving the blit is a
   * pure translation. Uploaded 2026-08-14 (session 10) and **hash-verified by re-download**: the
   * fetched bytes match `04d35f22…` exactly.
   *
   * ## Why this is the SECOND padding step, and what it is buying
   *
   * The previous `--fill 0.45` → 3130² canvas took `fire` from **5 of 6 G6 failures → 1 of 6**
   * (`request_id 019ff0db-0597-7490-ae69-921c125fed29`, prior url `…dy30uDOQhkQNGzOlTpP4C…`,
   * sha `4c6ec48b…`). That residual failure is **not the machine**. Measured on `fire-r4` cell 0:
   * the turret sits with margins L232 T278 B244, and what crosses the right edge is a **4-row
   * sliver at y 388–391** — the muzzle flash's spark tail. `death-r4` cell 3 is the same shape:
   * machine margins L226 R200 B244, and the top edge is crossed by **detached steam puffs**
   * spanning x 320–569. Both confirmed by eye at full resolution.
   *
   * G6 measures an opaque mask and cannot tell a sheared limb from a discharge — the blind spot
   * already recorded for G1. **The user's decision (2026-08-14) was to re-shoot rather than write
   * an exception**, so this canvas exists to give the effect itself room, not to un-crop the
   * subject. The flash is drawn relative to the barrel, so shrinking the figure 45 % → 35 % should
   * pull its tip roughly 20 % back toward centre.
   *
   * **Cost:** subject resolution. The figure is 35 % of frame height, so the packed cell upscales
   * more than any other sheet in the project. If the sprite reads soft in play, that is this dial
   * and not the prompt. **Do not raise the fill again without re-running the G6 comparison.**
   */
  'brass-sentry/fire': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa648b8/Xyt-uiNmmFDt72vwuwVCw_brass-sentry-padded.png',
    sha256: '04d35f22e309ab3fdc33a829c1845865e22fec35793c5547d2597d3092b64610',
    source: '_generated/anchors-padded/brass-sentry-padded.png',
  }),

  /**
   * 🔴 **`idle` is padded to a DIFFERENT canvas than `fire` and `death`, and that is deliberate.**
   * Added 2026-08-26 for the `-r4` re-shoot. `--fill 0.55` → **2560²**, figure 68.8 % → 55.0 % of
   * height, margins **T18.8→25.0 B12.5→20.0 L10.7→18.6 R12.1→19.7**. Uploaded and digested from
   * `_generated/anchors-padded/brass-sentry-padded.png`.
   *
   * **Why not the 4024² canvas the other two share.** That one exists at `--fill 0.35` to give the
   * muzzle flash and the steam plume room — EFFECTS that leave the frame, not the machine. `idle`
   * has no effect beyond a wisp of steam; what it needed was enough top margin that a barrel
   * swinging *"very slightly up"* cannot reach the edge, which `-r3` did at **0 px**. 0.55 buys that
   * (18.8 % → 25.0 %) at a quarter of 0.35's resolution cost, and the machine is the thing a
   * stationary sprite is judged on.
   *
   * ⚠️ **"One framing per slug" is therefore NOT true of this slug any more**, and the thing that
   * makes that safe is measured rather than assumed: `scale` resolves per `(slug, action)`, and the
   * **tripod base spans 205 px in all three packed sheets** — verified after repacking, the same
   * figure as before the re-shoot. `sprite-size-consistency.test.ts` is the gate. If a future sentry
   * action is shot, derive its scale from the tripod, never from the silhouette, and never assume it
   * inherits either canvas.
   */
  'brass-sentry/idle': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa7d8fc/VkOG4IOvZkP9Ygs_hQyzf_brass-sentry-padded.png',
    sha256: 'f823d7f5ff84a77e8264b8d5d189d54a766228bc6d811f522513b910870d0f99',
    // ⚠️ A DISTINCT filename, because `padAnchor.mjs` writes every fill to the same
    // `<slug>-padded.png` and `fire`/`death` above name that path for their 4024² canvas. Two
    // records pointing at one regenerable path would each describe bytes the other overwrote.
    source: '_generated/anchors-padded/brass-sentry-padded-fill055.png',
  }),

  /**
   * The same 4024² sentry canvas as `fire` above — one padded PNG serves every sentry action.
   * `death`'s original failure was a genuine wreckage spread (G6 f1/8, left 0), which the first
   * padding step fixed; what remains at `-r4` is the steam plume leaving the TOP edge, measured in
   * the block above.
   */
  'brass-sentry/death': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa648b8/Xyt-uiNmmFDt72vwuwVCw_brass-sentry-padded.png',
    sha256: '04d35f22e309ab3fdc33a829c1845865e22fec35793c5547d2597d3092b64610',
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

  /**
   * `idle` is padded **for SCALE, not for ratio** — and that distinction is what makes it required.
   *
   * Both scavenger anchors are square, so `aspect_ratio` resolves to `"1:1"` either way and padding
   * looks optional. It is not: the slug scale `0.56074766` in `character-bounds-rust-scavenger.json`
   * was derived from `rust-scavenger-walk-r3.mp4`, a **padded** generation. An unpadded idle
   * measured against that scale reproduces the session-6 defect exactly — padded `attack` drew
   * **114 px** against `hurt`'s **288**.
   *
   * Same PNG, same sha, as every other scavenger action, so the whole slug shares one framing.
   */
  'rust-scavenger/idle': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5ecf0/6X0GqPhD7r1-tuxbrx4Pm_rust-scavenger-padded.png',
    sha256: '1fd1a6b8768229e47aad0a6d69d8286bbe306fc8aa2c89edcf922936c9f917c1',
    source: '_generated/anchors-padded/rust-scavenger-padded.png',
  }),

  /** The swing, padded like every other scavenger action — same PNG, same sha, one framing per slug. */
  'rust-scavenger/attack': Object.freeze({
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
   * ⚠️ **RESTORED 2026-08-12 (user decision D2), after being REMOVED in session 6.**
   *
   * The padded courier clip framed cleanly — no crop on any edge, which is what padding is for. It
   * was pulled because `scale` was a single per-SLUG number (vault A5 read literally), and the
   * courier's, 0.23723229, was derived from an UNPADDED idle in which the figure stands 1214 px of
   * a 1280 px frame. Against the padded round's ~480 px of 960, the same scale drew `attack`
   * **114 px tall against `hurt`'s 288 px** — the character shrinking to 40 % the instant it swings.
   * Session 6 concluded a per-slug scale could not serve both and re-shot UNPADDED instead; that
   * re-shoot then spent three prompt clauses against `attack`'s own `right 0` crop with the margin
   * never moving (`L188 R0` before and after) — the prompt lever ran out.
   *
   * `build-assets.mjs` now resolves `scale` per `(slug, action)` — an action override in
   * `character-bounds.json`, the slug default otherwise — which removes the premise session 6's
   * decision rested on. The padded round (already bought, already passing G6) is adopted instead:
   * see `docs/GENERATION-LOG.md` and `docs/generations/phase-05-padded-round.md` for the dated
   * supersession entries, and `clipAdoption.mjs`'s `SUPERSEDED_CLIPS` for which round is now which.
   *
   * `--fill 0.50` → **5050²**, figure 91.8 % → 50.0 % of height, margins **T5.1→25.5 B3.2→24.5
   * L40.4 R41.0**. G1 identical padded and unpadded (`sole-spread 0px/0px`), proving the blit is a
   * pure translation. Uploaded 2026-08-11 (session 6) and hash-verified by re-download. One padded
   * PNG serves both courier combat actions, same as the sentry and scavenger's single canvas each.
   */
  /**
   * 🔴 **Added 2026-08-23 for the jump re-shoot** *(session inventory 2.1)*. The same padded canvas
   * `attack` and `death` already use — same character, same anchor, same fill.
   *
   * **Why jump needs the square canvas and idle does not.** Three takes measured, three G6 failures,
   * and the axis is the tell:
   *
   * | take | ratio | margins L/R/T/B | cut |
   * |---|---|---|---|
   * | `jump.mp4` (round 1, shipped) | 9:16 | 64 / **0** / 24 / 336 | right |
   * | `jump-r2.mp4` | 1:1 | 252 / 204 / **0** / 58 | top |
   * | `jump-r3.mp4` | 9:16 | 74 / **0** / 96 / 246 | right |
   *
   * A standing or walking figure is NARROW, so 9:16 suits idle/walk/run. **A jump is WIDE** — arms
   * and legs out — and 9:16 cuts it at the sides every time, in both takes shot that way. r2 is the
   * only take with real horizontal room (252/204) and it failed on the vertical instead, which is
   * what the size clause in `motionAirborne.mjs` addresses. This entry is the two halves together.
   */
  jump: Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5ecf2/oFqZnuImzFA5fTQWGNoT6_brass-courier-padded.png',
    sha256: 'f0785a0393eb57f6295369175b20428cb49662d7dc4d6ff9cec607900274fe8a',
    source: '_generated/anchors-padded/brass-courier-padded.png',
  }),

  'brass-courier/attack': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5ecf2/oFqZnuImzFA5fTQWGNoT6_brass-courier-padded.png',
    sha256: 'f0785a0393eb57f6295369175b20428cb49662d7dc4d6ff9cec607900274fe8a',
    source: '_generated/anchors-padded/brass-courier-padded.png',
  }),

  /** The same padded courier canvas as `attack` above. G1 identical verdict, per the note there. */
  'brass-courier/death': Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5ecf2/oFqZnuImzFA5fTQWGNoT6_brass-courier-padded.png',
    sha256: 'f0785a0393eb57f6295369175b20428cb49662d7dc4d6ff9cec607900274fe8a',
    source: '_generated/anchors-padded/brass-courier-padded.png',
  }),

  /**
   * 🔴 **Keyed by the BARE string `fall`, and that is not a typo — do not "fix" it.**
   *
   * `clipJobs.mjs` looks this table up with `PADDED_ANCHORS[key]` where `key` walks
   * `Object.keys(VIDEO_MOTIONS)` (`allMotionKeys`). The five Phase 4 motions are keyed there as bare
   * strings — `idle`, `walk`, `run`, `jump`, `fall` — with no slug prefix; only the Phase 5 combat
   * entries are namespaced. So `'brass-courier/fall'` here would resolve to `undefined`, `padded`
   * would fall to `null`, and the job would **silently shoot the UNPADDED 1536 × 2752 anchor at
   * 9:16** — the exact framing that made this clip need a re-shoot. $1.19 spent testing the
   * treatment by not applying it.
   *
   * Same padded canvas, url and sha as `brass-courier/attack` above: one PNG serves every courier
   * action, and the two clips that carry it are the only two courier clips that pass G6.
   *
   * ⚠️ **Attribution is deliberately spent here.** This shoot applies BOTH levers at once — this
   * padded canvas AND `FRAME_MARGIN` on the `fall` record — because together they reproduce the
   * exact configuration of `attack` and `death`. Applying one reproduces nothing. A pass will not
   * say which lever did it, and that trade was accepted before the money moved.
   */
  fall: Object.freeze({
    url: 'https://v3b.fal.media/files/b/0aa5ecf2/oFqZnuImzFA5fTQWGNoT6_brass-courier-padded.png',
    sha256: 'f0785a0393eb57f6295369175b20428cb49662d7dc4d6ff9cec607900274fe8a',
    source: '_generated/anchors-padded/brass-courier-padded.png',
  }),

  /**
   * **`brass-courier/hurt` is deliberately absent.** It extracts CLEAN — 6 frames, one-shot from
   * motion onset at frame 8 — and is NOT being re-shot. Only the per-action sweep found that, and it
   * saved $1.19. Do not add a record here "for consistency": a padded record is an instruction to
   * shoot from a different canvas, and this clip is not being shot.
   */
});
