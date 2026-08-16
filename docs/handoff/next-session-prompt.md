# Next session — the prompt, and everything left to decide

← [HANDOFF.md](../HANDOFF.md) §17 · [PRD.md § The phases](../PRD.md#the-phases)

**Written 2026-08-16, at the end of the session that closed Phase 6.**

---

## Where things stand

**Phase 6 is done and merged to `main`, reported passing.** `main` is pushed and green: typecheck ·
1224 unit tests · 1224 with Phaser uninstalled · build + `verify-dist` · 48 headless e2e · 24 on
`chromium-gpu` · port 5173 clear.

Phases 1–6 are ✅. **Phase 7 (Audio) is next**, and it gates on Phase 5.

Nothing is blocked. Everything below is either a decision only you can make, or work already written
down with an owner.

---

## The prompt to paste next session

> +500k
>
> Continue with Phase 7 (Audio), per `docs/prd/phase-07-audio.md`. Follow the full workflow:
> vault-in from `docs/lessons/phase-07-audio.md`, invoke the phase's §2 skills at the stage that
> needs them, Codex plan review before any code, build, then the QA gate — the agent owners in the
> gate's Owner column with **two briefs each**, then the Codex implementation review — then
> vault-out and STOP for approval.
>
> Read `docs/HANDOFF.md` §17 first, then the defect and flagged-findings tables in this document —
> they name what Phase 7 inherits, what Phase 8 and 9 own, and the two Phase 6 traps that apply
> directly to a parallel audio manager.
>
> Before planning, give me the decisions below with options, the way the last two sessions did.
> Note that 4.2b and the session size are already decided — the art ceiling is `$50` and the
> ordering rule stands, so the open one is the **audio** budget and when to set it.

---

## Decisions — nothing here is technical, all of it is yours

### 1. ✅ Phase 4's criterion 4.2b — DECIDED 2026-08-16

**The art-spend ceiling is raised from `$25` to `$50`, and 4.2b is closed.** Phase 4's `$31.39` now
sits inside it with `$18.61` of headroom. Recorded in
[qa/phase-04-art.md](../qa/phase-04-art.md) and declared in
[PRD.md § Global Constraints](../PRD.md#global-constraints); Phase 4's PRD row now shows **4.27 as
its only open item**.

**What survived the amendment**, and it is the half that matters: 22 clips ran before anyone read an
invoice, and no ceiling makes that fine. **Read the invoice before the next batch, not after it.**
Phase 4 had a ceiling and overran it anyway, precisely because nothing was measured until the money
was gone.

**Nothing to decide here next session.** It is listed so the next reader sees it was settled
deliberately rather than quietly dropped.

### 2. How much art does Phase 7 need, if any?

Phase 7 is Audio. Audio is not fal image generation, so the **$50 art ceiling does not cover it** —
it is the *art* ceiling, and a new medium needs its own number.

| Option | What it means |
|---|---|
| **A — Decide the audio budget up front** | Set a ceiling before anything is generated, so 4.2b's ordering mistake cannot repeat in a new medium. |
| **B — Grey-box audio first** | Placeholder sounds until the mechanics are proven, then spend. Mirrors the project's own *grey-box before art* rule. |

**I lean B then A** — prove the hooks with placeholder audio, then set a ceiling before the real
batch. That is the same order Phase 4 got wrong.

### 3. ✅ Session size — DECIDED 2026-08-16: run it large

The last three sessions each ran long — Phase 6's closing session did eight agent runs, two Codex
reviews, a hands-on playtest and a full regression sweep, and the gate is where the defects were
actually caught.

**Start the next session with a budget directive**, e.g. `+500k`, in the same message as the prompt
below. That is a thing only you can type; there is no setting on this side. Without it the session
is paced against a limit it will meet somewhere in the middle of the QA gate, which is the worst
possible place to run short — the second Codex review alone produced five applied fixes and
uncovered a live crash.

---

## Every defect found this session, and how it was found

Five real defects. **Not one was found by a test that was already passing** — three came from
adversarial review reading Phaser's own sources, one from writing a test that a reviewer said was
missing, and one from a full-suite run after an unrelated change. That is the argument for the gate,
in one table.

| # | Defect | How it was found | Status |
|---|---|---|---|
| 1 | **A refusal after a successful boot left the HUD frozen over the error screen**, with the render loop throwing `TypeError: … reading 'glTexture'`. `refuseToRoute`'s stops were in the right place but ran too late: on a restart the play scenes render on through the reload that frees their textures, crash, and kill the loop before any stop can run. | By writing the restart-based refusal test **Codex's second review said was missing**. The old test used a fresh page, where the HUD was never launched — so it could not go red for the line it named, and had been decoration for a whole phase. | ✅ **FIXED** — `BootScene.init()` now stops `Game` and `UI` before any loading. A no-op on a fresh boot. |
| 2 | **A `GameScene` SHUTDOWN handler deleted the HUD on a Game restart.** The stop is *queued*; `GameScene` has no `preload`, so `create()` runs first and `attachHud`'s `isActive` guard skips the launch; the queue then drains and stops the HUD. A running game with no HUD and no way back — exactly the Phase 7 level transition the handler was written for. | **Both code-reviewer briefs, independently**, by tracing `SceneManager`/`ScenePlugin` sources. No test failed. I then reproduced it in a browser. | ✅ **FIXED** — third design: `UIScene.update()` retires itself. A condition, so there is no ordering to get wrong. |
| 3 | **The second attempt broke the other direction**: `attachHud` doing `stop` then `launch` fixed the restart and broke the dev-scene teardown. | The dev-toggle e2e went red immediately. | ✅ **FIXED** — same third design. |
| 4 | **The teardown then retired the HUD whenever `Game` was merely PAUSED.** `isActive` is `status === RUNNING`, so pausing — which criterion 6.4's spec does deliberately, and which a pause screen would do — killed the HUD. | A **full-suite run** after the change: criterion 6.4's luma test went red. It would not have shown up in the lifecycle spec alone. | ✅ **FIXED** — keyed on `status >= SLEEPING`. PAUSED still renders and is kept; SLEEPING does not render and is not. |
| 5 | **My own opcode walk was wrong** — it advanced 4 past `FILL_STYLE` instead of 3, desynced onto a coordinate, missed every `FILL_RECT`, and reported "0 px drawn" as if the product were broken. | The first run of the test I had just written. The failure message accused the game; the bug was mine. | ✅ **FIXED** — matches `phase-05-combat.spec.ts`, which had it right. |

### Two near-misses worth remembering

- **My frame-budget test would have passed a HUD that drew nothing.** A ratio is an upper bound, so
  HUD-on ÷ HUD-off is ~1.0× when the HUD does nothing at all — and the red mutation I originally
  proposed produces a *passing* number. Codex's plan review caught it before any code was written.
  The spec now asks three independent questions per object.
- **I misdiagnosed a working-tree change as my own leftover.** Three lines of flex centring appeared
  in `index.html`; I reverted them believing they were red-run residue. They were a QA agent's own
  mutation, in flight, which it reverted itself. No harm — the file is byte-clean — but the
  diagnosis was wrong, and a concurrent agent editing the tree is a real hazard to remember.

---

## Everything flagged and NOT fixed, with its owner

Twenty-two findings came back from eight agent runs and two Codex reviews. Sixteen were applied.
These are the ones deliberately left, each with the reason, so none of them is a surprise later.

### Phase 7 owns

| Finding | Why it was left |
|---|---|
| Three `hudObjects()` call sites reach the HUD without `waitForHud` — `phase-06-hud.spec.ts`'s tween test and three reads in `phase-06-health.spec.ts` | The race is closed in `readHud`, which is where most specs go through. These bypass it and work only because a CDP round-trip outlasts one Phaser step — the same latent flake, still latent. |
| `waitForHud`'s `plate !== undefined` clause can never be the failing clause | `isActive` already implies `create()` finished, so the extra clause is decoration. Harmless, but it *looks* like a completeness check and is not — delete the `counter` assignment and it still passes. |

### Phase 8 owns

| Finding | Why it was left |
|---|---|
| **The gear-burial validator misses a gear on the seam between two floor rects**, and on faces and corners. Strict inequality means a gear on a shared edge is inside neither rectangle. | The most substantive unfixed finding. A **96 px grid makes a seam the default authoring outcome**, so this is not a corner case — but `level-01` has a single-rect floor, so nothing today can trigger it. Phase 8 is the phase that authors multi-rect floors. The fix wants `GEAR_BOX` overlap, not a centre-point test. |
| The burial check ignores `GEAR_BOX` entirely — a gear centred 1 px outside a wall is half inside it and passes | Same fix, same phase. |
| Hazards are not considered by the check, only `solid` objects | A gear inside a hazard is collectable but punishing; lower severity than uncollectable. |
| Re-measure counter contrast against any new palette | The fill alone is 15.04:1 on near-black but **3.13:1 on mid-grey and 1.13:1 on bright sky** — the 6 px stroke is what carries it. New levels are new backgrounds. |

### Phase 9 owns

| Finding | Why it was left |
|---|---|
| **`addHelpBanner` uses a literal `18px`, unscaled** — about 8 physical px at 852×480, below the project's own ~11 px legibility floor. **Confirmed illegible by eye in this session's playtest screenshot.** | Pre-existing, and outside the four HUD objects criterion 6.5 was measured on. It should move into `UIScene`, which is a Phase 9-shaped change rather than a patch. |
| That same banner uses `setScrollFactor(0)` on `GameScene` — **vault 6.1's exact pattern, re-created outside the HUD** in the very phase that eliminated it | Harmless only because `CAMERA_ZOOM` is 1. The same move fixes both. |
| DPR ≠ 1 centring is unexercised; `autoRound` floors CSS sizes and could round asymmetrically at 125 %/150 % Windows scaling | Needs an `ENGINE-NOTES` pass on Phaser's rounding before a bound would mean anything. The handoff's own recommendation was the pillarbox half only. |
| A burst of collected gears produces overlapping identical flyers — same duration, same ease, same destination | Cosmetic. Reads as one gear collected, which defeats per-gear feedback. |
| The counter has no arrival punctuation; the tween lands at alpha 0.25 | Two weak cues instead of one clear one. |
| The counter may sit 2–4 px high — `Text` centres on a full ascent+descent box and digits have no descenders | Below what any measurement here could confirm. |
| 6.3 samples a continuous resize function at only two points; **852×480 is never checked against `uiCamera`** | A third point would not change the shape of the argument, and 852×480 is a supported minimum. |

### Recorded, unfixable-as-such, or accepted

| Finding | Disposition |
|---|---|
| **Generic `monospace` resolves per browser profile and OS**, so criterion 6.1's tabular-figures gate proves a property of *this machine* | Real, and unfixable without shipping a font — a fal spend and an asset pipeline for one number. The trade is documented in `UIScene`. |
| The synthetic 6.4 renders rewind `lastGearTick` to 0 on the **live** `UIScene` | Genuine cross-contamination, currently inert; each test gets a fresh page. |
| A restart preserves an in-flight collect flyer; its test checks only liveness and child count | Bounded and cosmetic — the flyer destroys itself on completion. |
| The trajectory test's `path.length >= 5` is a wall-clock claim inside a fixed 2500 ms window | Could flake on a loaded machine. Watched across many runs this session without flaking. |
| `MAX_HUD_WORK_RATIO` is close to decorative at 0.1 ms quantisation — the **absolute** delta bound is the load-bearing one | Stated in `perfBudget.ts` rather than hidden. The absolute whole-frame bound added on Codex's second review is what nothing divides out of. |
| `SAMPLE_TICKS` is inherited from Phase 5's sentry-volley rationale and has **no HUD-specific derivation** | Numerically fine — comfortably clears the sample-count floors. Named so it is not mistaken for a measured choice. |
| The collect tween is a 15-tick transient and is **not** represented in the frame-budget medians | A sub-second effect cannot move a 180-tick median, and forcing collections mid-window would make the player's position differ between arms. |
| `GearLayer.sync()` and the `renderHud()` call survive **both** A/B arms and divide out of every ratio | Which is exactly why the absolute frame bound exists. |
| The accessibility measurement's method — fill-only vs stroke-blended — is not written down | Brief 1's exact sampling is unrecorded, so a stroke-inflated reading cannot be ruled out. Re-measure fill-only when Phase 8 brings new palettes. |
| SC 1.4.11 (non-text contrast) is **not named by criterion 6.6 at all** | A real scope gap in the gate. **Measured anyway: 5.55:1**, over the 3:1 requirement, so the product is unaffected. |
| Phase 5's **R1, R2, R3, R4, R6, R7, R8** | Recorded-not-fixed with reasons in `docs/qa/phase-05-combat-09-session-11.md`. R5 was fixed this session. R8 is structural and permanent: brief 1's findings are quoted inside the file brief 2 is sent to attack. |
| Phase 4's **4.27** | Needs a pre-generation anchor-geometry gate. Belongs to the next *generating* phase. |

---

## Measurements — do not re-derive these

| Quantity | Value |
|---|---|
| HUD cost, main thread | **~0.1 ms/frame** (0.6 % of a 16.67 ms frame) |
| HUD cost, GPU | **~0.003 ms/frame** (0.02 %) |
| HUD on ÷ off, work | 1.250× three times, 1.000× once — quantised at 0.1 ms |
| HUD on ÷ off, GPU | 1.012–1.017× |
| Counter fill vs backgrounds | 15.04:1 near-black · **3.13:1 mid-grey** · **1.13:1 bright sky** |
| Health bar, drained vs lit (SC 1.4.11) | **5.55:1** — passes the 3:1 requirement |
| Renderer under `chromium-gpu` | ANGLE / NVIDIA RTX 4080 / D3D11 — **not** SwiftShader |
| Suite size at Phase 6 close | 1224 unit · 48 headless e2e · 24 GPU e2e |

---

## Two traps from Phase 6 that apply directly to Phase 7

Audio will almost certainly be a manager or a parallel scene, so both of these are live again.

1. **Lifetime by scene-event ordering is a trap.** Phase 6 took three attempts to stop the HUD
   correctly. A `SHUTDOWN` handler *queues* its stop, and `create()` can run before the queue drains
   — which deleted the HUD on a restart, and neither test caught it; both code-reviewer briefs found
   it by reading Phaser's sources. The form that held is a **condition re-evaluated every frame**.
   Note that **PAUSED still renders and SLEEPING does not** — an audio manager probably wants the
   opposite of what the HUD wanted here.
2. **A ratio is an upper bound.** Criterion 6.9's first draft would have passed at ~1.0× if the HUD
   drew nothing at all. Any "does it cost much" measurement needs a separate, independent assertion
   that the thing is actually *happening* — for audio, that a sound really played, not that a play
   call returned.

And one rule this session paid for twice: **a gate that cannot go red is decoration.** The refusal
test looked fine for a whole phase, could not fail for the line it named, and was hiding a real
crash. Write the mutation that should break each new gate, and watch it break.
