# The exit gate — the gate-entry session

← [GENERATION-LOG.md](../GENERATION-LOG.md) · QA log: [qa/phase-08-gate-entry.md](../qa/phase-08-gate-entry.md)

**2 generations · `fal-ai/nano-banana-pro` · $0.30 quoted.** One adopted, one superseded.
The superseded take is retained as evidence in `_generated/world/superseded/`, not deleted.

`resolution 2K`, `aspect_ratio 2:3`, `output_format png`, `num_images 1`, `seed 20260804`,
`safety_tolerance 4`, empty `system_prompt`. Prompt built by `gatePrompt()` in
`tools/gen/promptWorld.mjs`; the exact text sent is in `_generated/world/gate.prompt.txt`.

| Take | `request_id` | measured px | detected | outcome |
|---|---|---|---|---|
| 1 | `01a01ad3-a1c0-7570-89bd-4a09ea96966e` | **1696 × 2528** | — | **superseded**, see below |
| 2 | `01a01ad6-a039-76e2-9828-089a99edb0ea` | **1696 × 2528** | 1 component, bbox 1636 × 2355 | **adopted** → `public/assets/objects/gate.png`, 192 × 288 |

Dimensions read off the files, never off the aspect label *(vault 4.11)* — the job record reports
`width: null` for both.

---

## Schema and price, re-checked against the live endpoint before spending

A documented schema is a snapshot, so both were re-run rather than trusted:

- `genmedia pricing fal-ai/nano-banana-pro` → **`0.15 / images / USD`**, matching
  [STYLE.md](../STYLE.md) §2.
- `genmedia schema fal-ai/nano-banana-pro` → **all eleven input fields identical** to §2's table:
  `prompt` (required), `image_urls` absent on the non-edit endpoint, `aspect_ratio` default `1:1`,
  `resolution` enum `1K/2K/4K` default `1K`, `output_format` enum `jpeg/png/webp` default `png`,
  `num_images` default 1, `limit_generations` default `true`, `enable_web_search` default `false`,
  `safety_tolerance` enum `1`–`6` default `"4"`, `system_prompt` default `""`, `sync_mode` default
  `false`. **No drift. No STOP required.**

### 🔴 The invoice could NOT be read, and that is not the same as reading it

`PRD.md`'s art-spend rule is *read the invoice before the next batch, not after it*, and Codex's
plan review (C8) was right that re-running schema and pricing does not discharge it.

**`genmedia` has no invoice, balance, billing or usage command.** Its whole surface is
`setup init skills models schema run status upload assets pricing docs gallery version update`;
`genmedia balance` prints the usage banner. The invoice lives on the fal.ai dashboard, which is not
reachable from here.

So the rule is **partially discharged and recorded as such** rather than claimed: the price was
verified live, the batch was **one** generation plus **one** authorised retry, and $0.30 is below
every reading of the ceiling. What the rule protects against — Phase 4's 22 clips running before
anyone read an invoice — is not the shape of this spend. **Reading the invoice is an owner action.**

⚠️ **And the ceiling itself is recorded twice, disagreeing.** `PRD.md` Global Constraints say
**$50**; `GENERATION-LOG.md` says *"$47.61 of the $55 ceiling"*. Named here rather than silently
resolved — **which number is current is the owner's call.**

---

## 🔴 Take 1: the keying gate refused it, and the refusal was correct

Take 1 is a good image. It put the doorway **flush against the bottom edge of the frame**, which is
what a doorway standing on a floor naturally does — and that made it unusable:

```
estimateKeyColour: only 79.4% of border pixels are within 120 of the median (4,248,6).
This image does not have a uniform chroma background — keying it would cut into the subject.
```

Measured per edge, which is what turned a vague refusal into a one-line fix:

| edge | background |
|---|---|
| top | 97.8 % |
| left | 100.0 % |
| right | 96.1 % |
| **bottom** | **5.5 %** |

**The gate was not weakened, widened, or bypassed.** `estimateKeyColour` exists because six Phase 4
anchor generations came back with the model's own idea of chroma and two of them keyed 0 % away; it
measures the key from each image's own border and refuses a border it cannot trust. A doorway
running off the bottom is exactly the input it cannot trust, whatever a human can see.

The fix went into the **prompt**, in `gatePrompt`'s `BACKGROUND AND MARGIN` block, naming the bottom
edge explicitly because that is the edge a doorway naturally runs off:

> …the doorway and EVERYTHING attached to it — the lamp, its chain, the pipework, the gauges, the
> lever and the valve wheel — must sit COMPLETELY INSIDE the image with a clear band of chroma green
> all the way around: above the lamp, **BELOW THE BASE OF THE DOORWAY**, and outside the pipework on
> both the left and the right. Nothing touches or runs off any edge of the image.

Cost: one $0.15 generation, which is what the authorised retry is for.

## Take 2, adopted

| | |
|---|---|
| measured key | **`(3, 149, 41)`** |
| components after keying | **exactly 1** |
| keyed bounding box | **1636 × 2355**, ratio `0.6947` |
| target rect | `192 × 288`, ratio `0.6667` |
| distortion accepted | ~4 % horizontal squash, below the pixel grid at this size |

**The measured key is `(3,149,41)`, not the `(0,255,0)` the prompt asked for.** That is STYLE.md
§2b's fourth recorded fact — *the model does not return the chroma colour it is asked for* — and it
is the whole reason `estimateKeyColour` measures rather than assumes. A first pass of this check
written against the literal `(4,248,6)` reported **0 % background on all four edges** and looked
like a catastrophe; the real validator keyed it perfectly. **Read it off the file, never off the
label** *(vault 4.11)*, where here the label is the prompt.

Letterboxing to preserve the exact aspect was considered and **rejected**: it would put transparent
margin inside a rect that is *also the trigger volume*, so the drawn door would be visibly narrower
than the thing the player has to walk into.

---

## STYLE.md §7 verification gates

Applied, with the two that do not apply named rather than scored *(vault 9.3)*.

| # | Gate | Result |
|---|---|---|
| 1 | Dimensions read from the file, never the aspect label | ✅ 1696 × 2528 on both takes |
| 2 | Alpha read by value, never `mode == "RGBA"` | ✅ source is PNG colour type **2** (RGB, no alpha) — keying mandatory; the shipped file is type **6** and `shipped-gate.test.ts` counts opaque and transparent pixels on it |
| 3 | Zone separation measured | ⛔ **inapplicable** — an isolated object on a chroma field has no background band. Same call as the gear and the HUD |
| 4 | Brass-cap rule checked by eye | ⛔ **inapplicable, and deliberately so.** §5 rule ONE is about *standable* surfaces. The player walks THROUGH this and it is drawn at depth 7, under them; capping it in brass would make it read as a platform, which is the one thing that rule exists to prevent. Rule TWO (temperature) does apply and is carried by the warm brass frame against the near-black void |
| 5 | Readability at true sprite size | ✅ looked at at **192 × 288**, the size it draws at — the arch, both gauges' white dials, the valve wheel, the lamp's amber glow and the rivet rows all still resolve, and the opening reads as a dark passage |

**Gate 0 did not re-run.** It is a one-time model-swap probe, closed 2026-08-08, and no model
changed. Stated rather than silently skipped.

---

## Spend

| | |
|---|---|
| This gate | 2 generations, **$0.30 quoted** |
| Prior running total | $47.61 (quoted + invoiced, after Phase 6) |
| **After this gate** | **$47.91 quoted** |

⚠️ Quoted, not invoiced — the two must not be summed with an invoice figure, and this project has
already misread that line once. See the invoice note above.
