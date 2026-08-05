# Phase 7 — Audio

← [PRD spine](../PRD.md) · prev: [Phase 6](phase-06-hud.md) · next: [Phase 8](phase-08-levels.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
SFX for jump, land, attack, hit, pickup, death. One music bed. Mute and volume that persist.

### 2. Required skills
`audio-and-sound` · `fal-models-catalog` (text-to-audio) · `fal-prompting`

### 3. Vault-in
**7.1** ask for the physical event, not the category — *"very short and clean"* returned literal
silence at −37.9 dBFS; trim each cue to its first event, but a cue with a wind-up needs the trim to
reach back before the loudest moment · **7.2** probe one model on one cue before a batch — the model
whose name promised audio measured −29 dBFS with no transient, at 2.5× the price · **7.3** measure hot
masters with a **32-bit float decode**; a 16-bit decode saturates at exactly the value it should
detect · **7.4** cue volume is a clipping budget measured from the shipped files — three cues on one
frame summed to +3.9 dBFS · **7.5** a WebAudio getter is not a readback; never assert on `mute` or
`volume`, keep your own flag; unsubscribe the exact unlock handler and **remove** long-running tracks ·
**2.5** emit audio cues from inside the tick that produced them

> Note: `bytedance/seedance-2.0/*` can emit synchronised audio via `generate_audio`, but it is video
> audio, not a game cue set. Route audio through a text-to-audio endpoint chosen with
> `fal-models-catalog`, and apply **7.2** — one probe on one cue before any batch.

### 4. Codex plan review
**Runs now, before any code.** Command and handling rules: [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
Output → `docs/reviews/phase-07-plan.md`.

Ask Codex in particular: **which of these audio criteria is verified by listening rather than by
measurement?** *(7.1: a cue that sounds fine can be −37.9 dBFS of nothing.)* And: **does any assertion
read state back from the WebAudio API rather than from our own flag?** *(7.5.)*

### 5. Deliverables
`src/game/audio.ts` · `src/sim/audioCues.ts` (engine-free cue selection) ·
`public/assets/audio/` · `tools/gen/audio-gate.ts` · `tests/unit/audio-cues.test.ts` ·
`tests/e2e/phase-07-audio.spec.ts`

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 7.1 | Every cue plays at its event; no unloaded-sound errors | e2e | e2e |
| 7.2 | Worst-case simultaneous cue stack measured ≤ −1.0 dBFS | float decode *(7.3/7.4)* | qa-expert |
| 7.3 | No cue is silent — measured floor, not listened-to | float decode *(7.1)* | qa-expert |
| 7.4 | Mute/volume persist across reload; asserted on **our** flag, not the getter | unit *(7.5)* | qa-expert |
| 7.5 | Scene round-trip does not accumulate tracks | repeat transitions, count *(7.5)* | qa-expert |
| 7.6 | Cues emitted from the producing tick, not a state comparison | code review *(2.5)* | code-reviewer |
| 7.7 | No file > 400 lines; diff reviewed; adversarial pass; frame budget | code-reviewer ×2 + perf | — |
| 7.8 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-07-plan.md` | — |
| 7.9 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-07-impl.md` | codex |

**Regression set:** Phases 1–6, specs 01–06.

### 7. Vault-out
Which fal audio endpoint actually produced usable transients and at what cost. The measured clipping
ceiling for our cue set.

### 8. Demo
Play with sound. Jump, land, hit an enemy, collect a gear, die. Mute, reload, still muted.
