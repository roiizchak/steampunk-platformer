# Phase 7 — audio generation

**11 generations, `$0.23`. Spend `$0.23` of the `$5` audio ceiling.** Two further requests were
rejected before inference and cost nothing.

The ceiling was declared in [PRD.md § Global Constraints](../PRD.md) **before the first generation
ran**, which is the half of lesson 4.2b that no ceiling can fix retroactively.

## Every generation

| Cue | Endpoint | `request_id` | Seed | Cost |
|---|---|---|---|---|
| `hit` *(as `probe-hit`)* | `sfx/text-to-audio` | `01a00afd-3f49-7073-8a07-fd5b8c5db11a` | — | `$0.0206` |
| `jump` | `sfx/text-to-audio` | `01a00b05-ec6c-7811-96cf-cedcbcc97929` | 70202 | `$0.0206` |
| `land` | `sfx/text-to-audio` | `01a00b05-fd28-7a01-9192-d8b974181f96` | 70203 | `$0.0206` |
| `attack` | `sfx/text-to-audio` | `01a00b06-0db1-7c91-b6e3-2aac55f29a1a` | 70204 | `$0.0206` |
| `hurt` | `sfx/text-to-audio` | `01a00b06-1f6b-79c2-857c-f1a55f308ebf` | 70205 | `$0.0206` |
| `pickup` | `sfx/text-to-audio` | `01a00b06-3391-78d2-8c00-7248c8e013ee` | 70206 | `$0.0206` |
| `kill` | `sfx/text-to-audio` | `01a00b07-6ff8-7f80-8178-994f6f34a983` | 70207 | `$0.0206` |
| `death` | `sfx/text-to-audio` | `01a00b07-80c3-7422-aa8d-8720da429816` | 70208 | `$0.0206` |
| `footstep` | `sfx/text-to-audio` | `01a00b07-9451-73f2-9a9b-87b69197eb40` | 70209 | `$0.0206` |
| `bed-music` | `music/text-to-audio` | `01a00b08-33bd-7b21-a992-8a308b279065` | 70210 | `$0.0217` |
| `bed-ambience` | **`sfx/text-to-audio`** | `01a00b08-5c37-7d82-833a-431cb076efac` | 70211 | `$0.0206` |

All endpoints are `fal-ai/stable-audio-3/small/…`. Every generation returned `status: completed` on
its first attempt — **no cue needed a re-shoot**, which is why the realistic
four-tries-per-cue estimate of `$0.62` was not reached.

Full JSON per generation, including the fal URL and the inference logs, is in
`_generated/audio/log/<cue>.json`. The masters are `_generated/audio/<cue>-<request_id>.<ext>` —
**the `request_id` is in the filename**, which is what made `hit`'s provenance recoverable below.

### 🔴 Two record-keeping notes, neither of them cosmetic

**`bed-ambience` was generated on the SFX endpoint, not the music one.** The plan said "2 beds via
the music endpoint". Only `bed-music` was. This was not noticed at generation time and is recorded
rather than quietly corrected: the result is good — a continuous factory hiss is a *sound effect*
that happens to be long, and the SFX checkpoint handled it — and it is `$0.0011` cheaper. But the
plan and the artefact disagree, and the artefact wins. Anyone re-generating the ambience bed should
know which checkpoint produced the one that shipped.

**`hit` has no `log/*.json`.** It was the vault 7.2 mandatory single-cue probe, run before the
logging path existed, so its record is the filename alone —
`probe-hit-01a00afd-3f49-7073-8a07-fd5b8c5db11a.wav`. Its `request_id` and prompt survive; its
**seed does not**, so `hit` is the one cue in this phase that cannot be re-generated identically.
`tools/gen/build-audio.mjs:104` carries the mapping (`cue === 'hit' ? 'probe-hit' : cue`) so the
naming irregularity is in code rather than in someone's memory. This is the same class of gap as
[phase-05-request-id-recovery.md](phase-05-request-id-recovery.md), caught earlier and cheaper.

## The prompts

Vault 7.1 in force: **the prompt names the physical event**, and the qualities that previously
produced literal silence at −37.9 dBFS ("very short", "clean", "subtle") were kept out of it. Every
SFX prompt ends `immediate loud attack, dry, close microphone` — an instruction about the
*transient*, which is the part a game cue is made of.

| Cue | Prompt |
|---|---|
| `jump` | a heavy leather boot pushing off a riveted steel walkway, sharp scuff followed instantly by a short brass spring release, immediate loud attack, dry, close microphone |
| `land` | two heavy leather boots landing hard on a riveted steel grating, one loud thud with a metallic rattle, immediate loud attack, dry, close microphone |
| `attack` | a heavy brass wrench swung fast through the air, mechanical ratchet click then a sharp whoosh, immediate loud attack, dry, close microphone |
| `hurt` | a dull heavy blow landing on a leather coat and brass buckle, muffled body thud with a short metallic jangle, immediate loud attack, dry, close microphone |
| `pickup` | a small brass gear snatched up off a metal bench, bright metallic ting with a short bell-like ring, immediate loud attack, dry, close microphone |
| `kill` | a heavy brass automaton breaking apart, sharp metal crunch then springs and gears clattering onto a steel floor, immediate loud attack, dry, close microphone |
| `death` | a body collapsing onto a steel deck with a brass tank venting its last steam, heavy thud then a descending pressure hiss, immediate loud attack, dry, close microphone |
| `footstep` | one heavy leather boot stepping down on a riveted steel walkway, single sharp metallic tap with a faint rivet ring, immediate loud attack, dry, close microphone |
| `bed-music` | slow brooding Victorian industrial underscore, low bowed double bass and muted brass drones, a steady heavy piston clank keeping time, distant steam hiss, minor key, sparse and unhurried, instrumental |
| `bed-ambience` | the inside of a working Victorian factory heard continuously, steady steam hiss through brass pipes, slow rhythmic machinery thumping in the next hall, occasional metal creak, constant and even throughout |

## ⚠️ `duration` caps at 120 s, and nothing documents it

Both bed requests were first submitted at **180 s** and both returned **HTTP 422 before inference**.
Neither `genmedia schema` nor [FAL-MODELS.md § 6](../FAL-MODELS.md) records a maximum. Re-run at
120 s, both succeeded.

The two rejections cost nothing — a 422 is a validation failure, not a generation — so the beds loop
every two minutes rather than every three. The seam is accepted, not hidden: criterion 7.10 listens
for it.

## What shipped

Masters are generated long and trimmed to the event by `tools/gen/wav.mjs`; the beds loop whole and
are copied. Per-cue `gain` is **solved**, not chosen by ear — `tools/gen/build-audio.mjs` normalises
each master to its own peak, applies a role weight, then scales the whole set by one headroom factor
so the eight-source worst case lands on −3 dBFS.

| Shipped | Size | Length | Peak | Floor | `gain` |
|---|---|---|---|---|---|
| `sfx-death.wav` | 350 KB | 2.030 s | −0.00 dBFS | −90.31 dBFS | 0.2877 |
| `sfx-kill.wav` | 259 KB | 1.506 s | −0.00 | −90.31 | 0.2876 |
| `sfx-hurt.wav` | 35 KB | 0.204 s | −0.00 | −90.31 | 0.2876 |
| `sfx-hit.wav` | 117 KB | 0.680 s | −0.00 | −90.31 | 0.2036 |
| `sfx-jump.wav` | 48 KB | 0.280 s | −2.06 | −90.31 | 0.2580 |
| `sfx-land.wav` | 91 KB | 0.530 s | −5.43 | −90.31 | 0.3807 |
| `sfx-attack.wav` | 40 KB | 0.230 s | −9.20 | −90.31 | 0.4664 |
| `sfx-pickup.wav` | 122 KB | 0.705 s | −2.83 | −90.31 | 0.2241 |
| `sfx-footstep.wav` | 31 KB | 0.180 s | −11.48 | −90.31 | 0.3039 |
| `bed-music.ogg` | 2035 KB | 120 s | *(OGG — browser-decoded only)* | | 0.0644 |
| `bed-ambience.ogg` | 2661 KB | 120 s | | | 0.0512 |

All WAVs are 44 100 Hz stereo. **The floor is −90.31 dBFS on every cue**, which is the 16-bit
quantisation floor and not a measurement of the recording — it means each file contains at least one
sample at the smallest representable non-zero value, as any dithered 16-bit master does. What
criterion 7.3 actually turns on is the **peak** column: nothing here is anywhere near vault 7.1's
silent −37.9 dBFS.

**Four masters peak at or above 0 dBFS once gain is removed** — measured in the browser at unit
gain: `hurt` +0.18, `hit` +1.81, `kill` +0.09, `bed-ambience` +0.21 dBFS. That is vault 7.3 earning
its place: a 16-bit integer decode saturates at exactly the value it is meant to detect and would
have reported all four as a tidy 0.00.

## Cost

| | Count | Unit | Total |
|---|---|---|---|
| `sfx/text-to-audio` | 10 | `$0.0206` | `$0.2060` |
| `music/text-to-audio` | 1 | `$0.0217` | `$0.0217` |
| Rejected pre-inference (422) | 2 | `$0` | `$0` |
| | | | **`$0.2277`** |

**`$0.23` against a `$5` ceiling.** The ordering rule was followed: ceiling declared → one probe
generation (`hit`) → invoice read → the remainder in sub-batches of five or fewer → invoice read
again.
