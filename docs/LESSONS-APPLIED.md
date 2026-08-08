# LESSONS-APPLIED.md

Vault-in for the Steampunk Platformer. Source: `gamedev-vault-curator` read-only query against
`C:\Claude\Game development valut`, 2026-08-04 (Gate 2 of Phase 0). 133 notes read — 116 Evidence,
16 Background, 4 Meta. Nothing was written to the vault.

**These are hard requirements on the PRD, not suggestions.** Every phase must address each item
scoped to it: mark it `[x] applied` with evidence, or `[–] N/A` with a one-line reason. An unaddressed
item fails that phase's QA gate.

Citations are vault note paths, relative to the vault root. Severity is the vault's own tag:
**blocker** / **costly** / (untagged).

**The root rule everything hangs off:**

> **Measure the claim against the thing it claims about.**
> — `10 - Evidence/Testing/Measure the claim against the thing it claims about.md` (blocker)
> Every defect it lists shipped through a fully green suite, because the tests only ever compared
> code to other code.

---

## §A — Contradicts or complicates a locked decision

Highest priority. Our rule is that the vault outranks tutorials and our own assumptions.

| ID | Item | Resolve by | Source |
|---|---|---|---|
| **A1** ✅ **RESOLVED — Gate 3** | **PowerShell vs. the `genmedia` CLI.** The vault's rule cost a credit: drive a `.cmd` CLI from a shell, never from a subprocess API — `cmd.exe` quoting mangles multi-line `--prompt` and **the job silently succeeds at the wrong aspect ratio**. **Verified at Gate 3: DOES NOT APPLY to this invocation path.** A multi-line string containing newlines, double and single quotes, `$dollar`, `` `backtick ``, `--flag`, `/slash`, `100%` and `&` round-tripped **byte-intact** through PowerShell 7 → `genmedia.exe`, confirmed by the CLI echoing its parsed `query` back as JSON (a $0 test — `genmedia models` echoes its input). **Reason it differs:** the vault's hazard is about `.cmd`/`.bat` shims routed through `cmd.exe`, and about Python `subprocess`. `genmedia` here is a **native 122 MB Go `.exe`**, and PowerShell 7 passes arguments to native executables directly with no `cmd.exe` round-trip. **Still binding:** the underlying rule — *the failure mode to fear is not a crash, it is a successful run with dropped arguments* — so Phase 4 must still read returned pixel dimensions off the job record (see 4.11) rather than trusting the request went through as written. | done | `10 - Evidence/Art & Audio Pipeline/Drive a .cmd CLI from a shell, never from a subprocess API.md` (costly); `10 - Evidence/Deployment & Tooling/Resolving an npm CLI on Windows needs PATHEXT first and a shell for .cmd.md` (costly) |
| **A2** ⚠️ **PARTIALLY RESOLVED — Gate 3** | **The prompting evidence is from a different service.** Method transfers; facts are Higgsfield-era. **Verified at Gate 3 from endpoint schemas ($0):** (a) **No endpoint exposes a transparent-background parameter** — `openai/gpt-image-2` offers only `output_format` jpeg/png/webp, and the routed pipeline pairs generation with `fal-ai/bria/background/remove`, which is itself evidence that generators are not expected to emit alpha. The vault's "no model emits alpha" finding therefore **provisionally holds on fal.ai**, and the chroma-key apparatus (4.13) stays in the plan. (b) **STILL UNVERIFIED — must be measured, not assumed:** whether the returned PNGs carry a real alpha channel. ~~**Measure it on the Gate 5 style-probe images at zero extra cost**~~ — ⛔ **no longer free.** That measurement was taken on `nano-banana-2` (result: `mode=RGB`, alpha genuinely absent) and the Gate 7 model swap invalidated it. It must be re-taken on a **paid** `nano-banana-pro` generation — [STYLE.md](STYLE.md) §7 gate 0.2, $0.15. Read the alpha channel directly — never test `mode == "RGBA"` (4.12). (c) Aspect-label accuracy, thin-band inflation and cost-preflight accuracy remain unverified; all three need a real generation to test. | Gate 5 | `20 - Background/Engine-agnostic/Generative art pipelines are a supply chain, not a tool.md` |
| **A2b** 🔴 **NEW — found at Gate 3** | **The routed default model cannot be seeded, and our STYLE.md contract requires a seed strategy.** `openai/gpt-image-2` — which `model-routing` names first for both text-heavy and premium still work — **has no `seed` parameter at all** (schema: `output_format`, `num_images`, `image_size`, `prompt`, `sync_mode`, `quality`). A locked recipe built on it would be **unreproducible by construction**, contradicting the Phase 0 requirement that every later asset reuse the approved recipe. `fal-ai/nano-banana-2`, `fal-ai/nano-banana-pro` and `fal-ai/flux-2/klein/9b` all **do** expose `seed`. **Second-order trap:** the nano-banana family takes `aspect_ratio`, not explicit dimensions — walking straight into 3.2 / 4.11 (*aspect labels lie*). Only `flux-2/klein/9b` and `gpt-image-2` take `image_size` with explicit `{width, height}`. **The two properties we need most — reproducible seed and exact pixel dimensions — are split across different models.** | Gate 5 | `genmedia schema <id> --json`, 2026-08-04 |
| **A2c** ⛔ **SUPERSEDED at Gate 7 — kept for provenance only.** The project's image model is now **`fal-ai/nano-banana-pro`** ($0.15/image at 1K/2K, **4K at 2×**, `resolution` enum `1K/2K/4K` with no `0.5K`, and **no `4:1` / `1:4` / `8:1` / `1:8` ratios**). The sprite-strip and parallax ratios praised below **are not available on the current model** — an 8-frame strip must be packed in post, not asked for. See [STYLE.md](STYLE.md) §2/§2b. Everything after this sentence describes the retired endpoint: **`fal-ai/nano-banana-2` (Gemini 3.1 Flash Image), $0.08/image flat, seeded.** Verified against fal's own OpenAPI (`genmedia schema <id> --format openapi`), not the compact view: `aspect_ratio` enum = `auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16, 4:1, 1:4, 8:1, 1:8`; `resolution` enum = `0.5K, 1K, 2K, 4K`; free-integer `seed`; `output_format` png/jpeg/webp. **`fal-ai/nano-banana-2/edit` is identical plus `image_urls`, same $0.08** — so the vault's "change the reference, not the prompt" workflow (4.1) is available at the cheapest tier. **Price is flat per image, not per megapixel**, so 4K costs the same as 0.5K. **Directly useful ratios:** `8:1` / `4:1` for sprite-sheet strips (an 8-frame walk cycle *is* an 8:1 strip of 1:1 cells); `21:9` for parallax layers — the exact ratio that bought +417 px of camera travel in the vault's side-scroller lesson. **Binding constraint: no explicit `{width, height}` exists.** Grid-exactness for the Phase 3 tileset must therefore be achieved **in post** — generate at 2K/4K, read actual returned dimensions off the job record, downscale and slice deterministically. **Run one probe per aspect ratio we intend to use and record measured dimensions in `GENERATION-LOG.md`; those measured numbers are the contract, never the labels.** | Gate 5 locks it | `genmedia schema`, `genmedia pricing`, 2026-08-04 |
| **A3** | **Tiled + Phaser tilemaps — the vault has ZERO coverage.** No note on tilemaps, tileset packing, collision layers, object layers, or tilemap-to-collision agreement. **Phase 3 is unlit territory.** Nearest transferable rules: at least one test must load the shipped `.tmj` (preferably sweep all of them — the defect usually lives in one entry, not the schema); and derive world width from **measured background pixels**, never from a label. | Phase 3 | gap; nearest: `10 - Evidence/Testing/A test built on a hand-authored fixture cannot see a defect in the shipped data.md` (blocker) |
| **A4** | **The Gym writing a saved config is two hazards at once.** (a) A dev save endpoint is an **authorization decision** and must live inside a typecheck program and a test include list — last time a build config was typechecked by nothing right up until it owned exactly this. (b) *"A spec that writes shipped configuration is using live ammunition"*: atomic write plus a restore that survives a Windows file-lock error, or the real registry ships a mutated entity into every later spec. **Our e2e suite touching the Gym can mutate the shipped catalog.** | Phase 4 | `10 - Evidence/Deployment & Tooling/Config files typechecked by nothing became a decision nothing could check.md` (blocker); `90 - Meta/Deliberately unwritten links.md` |
| **A5** | **The Gym deriving anchors/bounds/scale hits a known ordering trap.** If the Gym derives one scale per entity from a single reference frame, regenerating that frame **silently rescales every other animation** and moves every measured active frame. Write the rebuild order down beside the commands; make the build deterministic; **prefer deriving the constant from something that does not get regenerated**. | Phase 4 | `10 - Evidence/Art & Audio Pipeline/Rebuild order matters when one asset derives a constant for all the others.md` (blocker) |
| **A6** | **The Playground needs knob-sweep verification wired in from day one.** *A slider that visibly exists reads as a slider that visibly works.* Change it, run, confirm the output moved. The Playground makes the vault's cheapest experiment free — and it is exactly what nobody does. **✅ Phase 2, and the italicised sentence is the part that bit:** the sweep test was green on all eleven knobs while four of them showed the player nothing at all. Only playing it found that. The Playground now displays eleven derived numbers beside the knobs, and `derived-feel.test.ts` requires every knob to move a DISPLAYED one. | Phase 2 | `10 - Evidence/Testing/Sweep every tuning knob once and confirm the number moves.md` (blocker) |
| **A7** | **Ten QA gates are necessary but demonstrably not sufficient.** A dedicated QA agent returned **8/8 PASS** on a diff an adversarial review then found **three real defects** in. A checklist cannot find a defect nobody thought to list. **Budget both briefs per gate:** one verifying stated criteria, one asking how this could be wrong. Review the diff, not only the plan. Say "read-only" explicitly if the reviewing tool can edit files. | every gate | `10 - Evidence/Process/Run an adversarial review even after QA passes.md` (blocker) |
| **A8** | **Vite: the reflex ESM fix is wrong for the native config loader.** If Vite warns about its config loader, `.ts` — not `.js` — is the extension that works. Adding `.js` silences the warning *and breaks the loader*. **A warning going quiet is not evidence the underlying thing works.** | Phase 1 | `10 - Evidence/Deployment & Tooling/The reflex fix can be wrong and a quiet warning is not evidence.md` (costly) |

---

## §B — Declared gaps: the vault has nothing here

The curator refused to invent content. Treat these as areas where **we generate the lessons**.

- **B1 — Performance.** No note on frame budget, draw calls, batching, texture memory, GC pressure,
  object pooling, or particle cost. **Phase 9 is unlit.** (The `Platform & Performance` theme folder
  is about display scaling, cameras, input and audio — not FPS.)
- **B2 — Tilemaps.** See A3. Phase 3.
- **B3 — Over-built vs under-built retrospection.** Not recorded. Only two deliberate rejections exist:
  a worker-scoped shared page tried for boot cost and **reverted — do not re-buy it**, and one
  deliberate version-hold short of a bundler replacement.
- **B4 — Module size.** The vault does **not** record a module that became unmaintainable by size.
  The recorded structural pressure is different: *logic written into a scene where no unit test can
  reach it.* Our 400-line ceiling is our own rule, from the reference repo — not vault-backed.
- **B5 — Browser-harness mechanics.** `90 - Meta/Deliberately unwritten links.md` records **7–9
  unwritten Evidence notes** on e2e harness mechanics: the pumped clock (a headless browser reports
  itself hidden and pauses the engine loop, so the spec must own the clock); a debug input seam that
  forces a flag every frame is not a rising edge; worker concurrency capped at 4 because every worker
  cold-boots the whole asset set (*"a new spec broke three unrelated ones" is usually contention, not
  a regression*); a wait-until loop must check *before* it steps and must not step in chunks; two ways
  a touch spec goes silently vacuous. **Directly relevant to Phases 1, 2 and 10.**

---

## §C — Standing rules, every phase

- [ ] **C1 — Re-introduce the bug, watch the test go red, restore. Every time.** One phase shipped two
  fake regression tests before a real one; one passed vacuously on `undefined === undefined` through a
  debug hook that returned nothing. Assert `typeof x === "number"` before comparing.
  *(`Testing/A regression test you have not watched fail is decoration.md`, blocker)*
  → **Binds our `window.__game` hook directly.**
- [ ] **C2 — Before trusting a metric, ask what would make it go red.** An audit reported a ratio of
  exactly 1.00 for every state because it computed `art = sim` with the same formula the code used.
  **Every gate needs a committed fixture that fails it.**
  *(`Testing/A metric that cannot fail is decoration.md`, blocker)*
- [ ] **C3 — Write down which new test is a reproduction (red→green) and which is a guard
  (green→green).** If you set out to write a reproduction and it comes back green, **you have not
  found the bug yet.** *(`Testing/Write down which new test is a reproduction and which is a guard.md`)*
- [ ] **C4 — "We have tests" and "someone has played it" are unrelated statements.** Seven defects
  across seven phases a green suite could not see — one at 383 unit + 175 browser tests. Play it, look
  at it, and **record what the player closes**. *(`Process/Only playing it found this.md`, blocker)*
- [ ] **C5 — A skipped QA pass is debt with a known collection date**, and the interest is paid in
  **invalidated measurements**, not bugs. Anything tuned against an unreviewed benchmark must be
  re-*tuned*, not re-checked. *(`Process/The QA pass a phase never had is the one that finds the blocker.md`, blocker)*
- [ ] **C6 — Take a reviewer's symptom as evidence and their cause as a hypothesis.** One recommended
  fix, applied, would have dropped the hardest difficulty 66.7% → 36.0%. Another high-severity finding
  was a flat false positive. *(`Process/Take a reviewer's symptom as evidence and their cause as a hypothesis.md`)*
- [ ] **C7 — Re-derive a finding's blast radius before accepting its framing.** When did this become
  true? What else does it affect? Is it already mitigated by something the reviewer could not see?
  *(`Process/Re-derive a finding's blast radius before accepting its framing.md`)*
- [ ] **C8 — When two plausible fixes disagree, instrument instead of choosing.** Two explanations were
  on the table and **both were wrong**; one state-keyed counter settled it. **The instrument usually
  costs less than the argument.** *(`Process/When two plausible fixes disagree, instrument instead of choosing.md`, blocker)*
- [ ] **C9 — A comment is not enforcement, and a wrong comment is worse than none.** Three instances,
  each carried multiple phases, **each with a real defect behind it**. Correct in place, visibly and
  dated. *(`Testing/A comment describing a mechanism that does not exist turns nothing red.md`;
  `Process/A doc describing a protection the code does not have is worse than no doc.md`, blocker)*
- [ ] **C10 — Invoke the reference material the spec names, and show which facts came from which.**
  A plan citing engine docs without consulting them produced two defects a later review confirmed.
  Every plan gets two sections: *"API notes this design is built on"* and *"what was rejected and why"*.
  **Silence reads as skipping** — if a reference doesn't apply, say so out loud.
  *(`Process/Invoke the tools a spec names, and show which facts came from which.md`)*
  → **This is exactly our Ritual 1.**
- [ ] **C11 — Record what you decided not to fix, with the measurement and the sweep that produced
  it** — and be precise about the claim's strength. A "no parameter can fix this" conclusion was later
  disproved by a review finding a configuration reaching 32.7%.
  *(`Process/Record what you decided not to fix, with the measurement.md`)*
- [ ] **C12 — Confirm a mutation actually applied.** Mixed CRLF/LF made a substitution silently match
  nothing; the suite passed and reported exactly what an uncovered line looks like. **Two mutations
  were wrongly cleared that way.** *(`Testing/A mutation you have not confirmed applied is a false green.md`)*
  → **We already have CRLF warnings in this repo. Live risk.**
- [ ] **C13 — Kill every server you started before reporting done — by port, not image name.** Stale
  watchers **serve stale art after an asset rebuild**, presenting as "the sprite didn't update".
  Launch the dev server's real entry point directly, not via the package script — on Windows the
  script is a shell wrapper and killing the wrapper orphans the real process.
  *(`Deployment & Tooling/Kill every server you started before reporting done.md`)*

---

## §D — Per-phase checklists

**One file per phase**, under [`docs/lessons/`](lessons/), **named exactly for the phase's
`docs/prd/` document** — `tests/unit/docs-contract.test.ts` addresses each one by that name, so
the two directories cannot drift apart. Split out on 2026-08-08, when this file reached 546 lines
and every phase's vault-in step was told to read all of it. A new phase adds
`docs/lessons/<its prd filename>` — nothing else moves.

| Phase | Vault-in items | Phase doc | QA log |
|---|---|---|---|
| 1 — Boot (Vite + Phaser 4.2.1 + TS + vitest + Playwright) | [lessons/phase-01-boot.md](lessons/phase-01-boot.md) | [prd/phase-01-boot.md](prd/phase-01-boot.md) | [qa/phase-01-boot.md](qa/phase-01-boot.md) |
| 2 — Player controller (grey-box) + Character Playground | [lessons/phase-02-player.md](lessons/phase-02-player.md) | [prd/phase-02-player.md](prd/phase-02-player.md) | [qa/phase-02-player.md](qa/phase-02-player.md) |
| 3 — Tiled → Phaser tilemap pipeline | [lessons/phase-03-tilemap.md](lessons/phase-03-tilemap.md) | [prd/phase-03-tilemap.md](prd/phase-03-tilemap.md) | [qa/phase-03-tilemap.md](qa/phase-03-tilemap.md) |
| 4 — fal art production + Character Gym | [lessons/phase-04-art.md](lessons/phase-04-art.md) | [prd/phase-04-art.md](prd/phase-04-art.md) | — |
| 5 — Enemies, hazards, combat + Enemy Gym | [lessons/phase-05-combat.md](lessons/phase-05-combat.md) | [prd/phase-05-combat.md](prd/phase-05-combat.md) | — |
| 6 — Collectibles, HUD, steampunk UI chrome | [lessons/phase-06-hud.md](lessons/phase-06-hud.md) | [prd/phase-06-hud.md](prd/phase-06-hud.md) | — |
| 7 — Audio | [lessons/phase-07-audio.md](lessons/phase-07-audio.md) | [prd/phase-07-audio.md](prd/phase-07-audio.md) | — |
| 8 — Level design & progression (3–5 levels) | [lessons/phase-08-levels.md](lessons/phase-08-levels.md) | [prd/phase-08-levels.md](prd/phase-08-levels.md) | — |
| 9 — Polish, juice, particles | [lessons/phase-09-polish.md](lessons/phase-09-polish.md) | [prd/phase-09-polish.md](prd/phase-09-polish.md) | — |
| 10 — Build & ship | [lessons/phase-10-ship.md](lessons/phase-10-ship.md) | [prd/phase-10-ship.md](prd/phase-10-ship.md) | — |

Each file holds that phase's `### Phase N` section, moved verbatim, under a title and two
navigation lines. **The `### Phase N —` headings are unchanged, em dash included**, and no item
was renumbered: 375 lines across 70 files cite these IDs by number.

---

## Curator's caveats (recorded verbatim, per the evidence rule)

- The curator **did not** use the `obsidian` CLI or the `obsidian-cli` skill; it read the note files
  directly from disk. That deviates from the vault's tooling contract. Counts (133 markdown files;
  116 Evidence across 7 themes; 16 Background; 7 MOCs + `All lessons.base` + `Sim and render
  boundary.canvas`; 4 Meta) come from a filesystem walk, **not** Obsidian's index — they will not
  reflect anything unsaved in the app.
- **Nothing was written to the vault.** Vault-out for Gate 2 is a separate dispatch.
- The curator explicitly **declined to fabricate** content for Performance and for over-built /
  under-built scope retrospection, and flagged the Tiled gap rather than generalising fighting-game
  geometry notes into level-authoring advice. See §B.

---

## The 2026-08-08 split

**This file was 546 lines, and §D — the per-phase checklists — was 411 of them.** Every phase's
vault-in step instructs you to read it, so every phase was reading nine other phases' checklists to
find its own. Seven phases remain and each one appends evidence lines under its own section; Phase 3
alone added ~25. The ten `### Phase N` sections moved to [`docs/lessons/`](lessons/), one file per
phase, slug matching the phase's `docs/prd/` document — the convention `docs/prd/`, `docs/qa/` and
`docs/reviews/` already share.

| Was | Is | Lines |
|---|---|---|
| `LESSONS-APPLIED.md` 123–145 | `docs/lessons/phase-01-boot.md` | 31 |
| `LESSONS-APPLIED.md` 146–222 | `docs/lessons/phase-02-player.md` | 86 |
| `LESSONS-APPLIED.md` 223–251 | `docs/lessons/phase-03-tilemap.md` | 36 |
| `LESSONS-APPLIED.md` 252–371 | `docs/lessons/phase-04-art.md` | 129 |
| `LESSONS-APPLIED.md` 372–414 | `docs/lessons/phase-05-combat.md` | 51 |
| `LESSONS-APPLIED.md` 415–445 | `docs/lessons/phase-06-hud.md` | 39 |
| `LESSONS-APPLIED.md` 446–466 | `docs/lessons/phase-07-audio.md` | 29 |
| `LESSONS-APPLIED.md` 467–474 | `docs/lessons/phase-08-levels.md` | 16 |
| `LESSONS-APPLIED.md` 475–497 | `docs/lessons/phase-09-polish.md` | 31 |
| `LESSONS-APPLIED.md` 498–533 | `docs/lessons/phase-10-ship.md` | 44 |
| `LESSONS-APPLIED.md` 1–122, 534–546 | this file — root rule, §A, §B, §C, index, caveats | 158 |

**Nothing was renumbered, and that is the whole constraint.** The IDs are the interface, not the
filename: **375 lines across 70 files** cite `vault 2.12`, `Vault C1`, `(A7)`, `(C11)`, `vault 4.22`
— in `src/`, `tests/`, `tools/`, `vite.config.ts`, `playwright.config.ts`, and every `docs/prd/` and
`docs/qa/` file. By comparison only 26 mentions in 9 files name *this document*, all of them prose.
Moving content between files is cheap; changing an ID is not. Every `### Phase N —` heading survives
verbatim, em dash included.

**§A, §B and §C stayed here**, including the §A items scoped to a single phase (A3 → Phase 3,
A4/A5 → Phase 4, A6 → Phase 2, A8 → Phase 1). Each phase file carries a **pointer** to the ones that
bind it, never a copy — vault 5.3, two definitions of one concept is where the bug lives.

**This file kept its path deliberately**, the same call the QA-LOG split made. Both the Codex
plan-review template and the QA-agent brief template in `PRD.md` name it; making it the index broke
nothing.

**Losslessness was proved, not asserted.** A script rebuilt the original from the pieces —
`hub[…before the index block] + phase-01…phase-10 (each minus its added title and two nav lines) +
hub[from the "---" before the caveats]` — and compared it against `git show HEAD:LESSONS-APPLIED.md`:

```
PASS identity   — rebuilt 56844 bytes, identical to HEAD:docs/LESSONS-APPLIED.md
PASS accounting — 62765 new bytes − 5921 added (2432 index + 3489 prefixes) = 56844 original bytes
```

Two independent checks, so a bug in the reconstruction cannot pass both: string identity, and byte
arithmetic over the eleven files minus the known additions. The accounting arm failed on its first
run by exactly 44 bytes — it measured the index block with `indexOf` arithmetic, which counts UTF-16
units, and this document is full of em dashes and `§`. **The instrument was wrong, not the split**;
identity had already passed. Worth recording because a byte-accounting check that silently counts
characters is the kind of gate that would have gone green on a real 44-byte loss.

**One deliberate deviation from verbatim.** Item **2.14**'s evidence line — `→ **Phase 2:** Apex
measured at 150.3 px…` — sat *below* the `### Phase 3` heading in the original, stranded from the
item it documents. A verbatim split opened `phase-03-tilemap.md` with a Phase 2 evidence line. The
split was performed and proved verbatim **first**, and the line moved afterwards, under 2.14 in
`docs/lessons/phase-02-player.md`. The proof script carries that move as an enumerated `REPAIRS`
entry it undoes before comparing, so "exactly one line moved, and this is it" stays machine-checked
rather than claimed — and the accounting arm still balances, because a move preserves bytes while an
accidental deletion would not.

**The machine reader.** `tests/unit/docs-contract.test.ts` gained one check: **every phase document
has a `docs/lessons/<its own filename>` containing that phase's `### Phase N —` heading.** The log
is addressed by the name of the `docs/prd/` document it belongs to, which forces the two directories
to line up file-for-file — a drifted slug and a missing file are the same red, deliberately
indistinguishable. This is the S2 lesson from the QA-LOG split applied up front rather than
discovered.

**Watched fail before trusted** *(C1)*, redness read positively from `Tests N failed` plus the named
spec, never from an exit code:

| # | Mutation | Red | Message |
|---|---|---|---|
| L1 | rename `docs/lessons/phase-03-tilemap.md` → `phase-03-tiles.md` | 1 | `document not found: /docs/lessons/phase-03-tilemap.md` |
| L2 | delete `docs/lessons/phase-07-audio.md` | 1 | `document not found: /docs/lessons/phase-07-audio.md` |
| L3 | `### Phase 9 —` → `### Phase 8 —` inside `phase-09-polish.md` | 1 | `expected '# Vault-in — Phase 9 — Polish, juice,…' to contain '### Phase 9 —'` |

L3 exists because L1 and L2 only exercise the `doc()` lookup; without it the heading half of the
assertion would be decoration, and a file present but empty or holding the wrong phase would pass.
Each expected message was written down **before** the run. All three were confirmed reverted by
content hash **and** by the directory count returning to ten *(C12)*, and the reconstruction proof
was re-run afterwards to establish the tree was back to the verified state.

**Not updated, deliberately:** the eleven hard line-number citations in `docs/reviews/`
(`phase-01-plan.md:57,80,123`, `phase-02-plan.md:47,62,73,81,84`, `phase-03-plan.md:84,116,126`).
Those are dated review artifacts describing this file as it stood at a specific commit; rewriting
them would falsify the record rather than repair it. What they cite is reachable at
`git show 83daaa6:docs/LESSONS-APPLIED.md`.
