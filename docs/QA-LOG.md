# QA-LOG.md

Every recorded decision, measurement and deliberate non-fix, one section per phase.
Created in Phase 1.

---

## The per-phase logs

**One file per phase**, under [`docs/qa/`](qa/), **named exactly for the phase's `docs/prd/`
document** — `tests/unit/docs-contract.test.ts` addresses each log by that name, so the two
directories cannot drift apart. Split out on 2026-08-07, when this file reached 1473 lines and was
gaining roughly 350 a phase. A new phase adds `docs/qa/<its prd filename>` — nothing else moves.

**When one phase's log gets long, it splits into flat siblings** — `phase-05-combat-01-timings.md`,
not `phase-05-combat/01-timings.md`. `tests/unit/file-size.test.ts` globs `docs/qa/*.md`
**non-recursively** to check that every source file over 400 lines is recorded somewhere in here, so
a subdirectory silently un-records everything in it. The phase's own file keeps its name and becomes
the index — `docs-contract.test.ts` addresses it by that name.

| Phase | QA log | Phase doc | Codex reviews |
|---|---|---|---|
| 1 — Boot | [qa/phase-01-boot.md](qa/phase-01-boot.md) | [prd/phase-01-boot.md](prd/phase-01-boot.md) | [plan](reviews/phase-01-plan.md) · [impl](reviews/phase-01-impl.md) |
| 2 — Player controller + Character Playground | [qa/phase-02-player.md](qa/phase-02-player.md) | [prd/phase-02-player.md](prd/phase-02-player.md) | [plan](reviews/phase-02-plan.md) · [impl](reviews/phase-02-impl.md) |
| 3 — Tiled tilemap pipeline + Element Editor | [qa/phase-03-tilemap.md](qa/phase-03-tilemap.md) | [prd/phase-03-tilemap.md](prd/phase-03-tilemap.md) | [plan](reviews/phase-03-plan.md) · [impl](reviews/phase-03-impl.md) |
| 4 — fal art production + Character Gym | [qa/phase-04-art.md](qa/phase-04-art.md) + [gate](qa/phase-04-art-gate.md) | [prd/phase-04-art.md](prd/phase-04-art.md) | [plan](reviews/phase-04-plan.md) · [impl](reviews/phase-04-impl.md) |
| 5 — Combat, enemies and hazards | [qa/phase-05-combat.md](qa/phase-05-combat.md) + [9 parts](qa/) | [prd/phase-05-combat.md](prd/phase-05-combat.md) | [plan](reviews/phase-05-plan.md) · [impl](reviews/phase-05-impl.md) |
| 6 — Collectibles, HUD, steampunk UI chrome | [qa/phase-06-hud.md](qa/phase-06-hud.md) | [prd/phase-06-hud.md](prd/phase-06-hud.md) | [plan](reviews/phase-06-plan.md) · [impl](reviews/phase-06-impl.md) |
| 7 — Audio | [qa/phase-07-audio.md](qa/phase-07-audio.md) + [gate owners](qa/phase-07-audio-02-gate-owners.md) | [prd/phase-07-audio.md](prd/phase-07-audio.md) | [plan](reviews/phase-07-plan.md) · [impl](reviews/phase-07-impl.md) |
| 8 — Level design and progression | [qa/phase-08-levels.md](qa/phase-08-levels.md) + [gate owners](qa/phase-08-levels-02-gate-owners.md) + [GPU bound](qa/phase-08-levels-03-gpu-bound.md) | [prd/phase-08-levels.md](prd/phase-08-levels.md) | [plan](reviews/phase-08-plan.md) · [impl](reviews/phase-08-impl.md) |
| — Four gate defects (not a phase) | [qa/session-gate-defects.md](qa/session-gate-defects.md) | [handoff](handoff/next-session-prompt.md) | [plan](reviews/session-gate-defects-plan.md) · [impl](reviews/session-gate-defects-impl.md) |
| — Three reported bugs + the two perf gates (not a phase) | [qa/session-bugfix-perf-gates.md](qa/session-bugfix-perf-gates.md) + [gate owners](qa/session-bugfix-perf-gates-02-gate-owners.md) | [handoff](HANDOFF.md) | [plan](reviews/session-bugfix-perf-gates-plan.md) · [impl](reviews/session-bugfix-perf-gates-impl.md) |
| — Exit gate art + the enter-the-gate run-in (not a phase) | [qa/phase-08-gate-entry.md](qa/phase-08-gate-entry.md) | [handoff](HANDOFF.md) | [plan](reviews/session-gate-art-and-entry-plan.md) · impl 🔴 **blocked, Codex usage limit** |
| — Tiers 0-5 defect sweep (not a phase) | [qa/session-bugfix-tiers.md](qa/session-bugfix-tiers.md) + [gate owners](qa/session-bugfix-tiers-02-gate-owners.md) | [handoff](HANDOFF.md) | [plan](reviews/session-bugfix-tiers-plan.md) · [impl](reviews/session-bugfix-tiers-impl.md) |
| — Branch cleanup, a recovered QA brief + the Tier-5 tranche (not a phase) | [qa/session-tier5-and-cleanup.md](qa/session-tier5-and-cleanup.md) + [the recovered brief](qa/phase-09-polish-qa-expert-brief-a.md) | [handoff](HANDOFF.md) | — (no Codex review; a post-merge cleanup, not a planned session) |
| — Phase 9's six recorded debts, 1a–1f (not a phase) | [qa/session-phase-09-debts.md](qa/session-phase-09-debts.md) + [-02-perf](qa/session-phase-09-debts-02-perf.md) + [-03-gate](qa/session-phase-09-debts-03-gate.md) | [prompt](SESSION-PROMPT-next.md) | plan ✅ **ran before approval — BLOCK, 8 findings applied** · impl pending |
| — Tier-5 false gates, gate holes, the capture round (not a phase) | [qa/session-tier5-gate-holes.md](qa/session-tier5-gate-holes.md) + [-02-tweens](qa/session-tier5-gate-holes-02-tweens.md) + [-03-sweep](qa/session-tier5-gate-holes-03-sweep.md) + [-04-briefs](qa/session-tier5-gate-holes-04-briefs.md) | [plan](../../../Users/royko/.claude/plans/next-session-stateful-cascade.md) (outside the repo) | plan ✅ **three rounds, REVISE each, all findings folded in** · impl pending |

> Phase 4's row was missing entirely until Phase 5 added it: the log was written and the index was
> not updated. Nothing enforces the index, which is why it drifted — `docs-contract.test.ts` reads
> the per-phase files by path, so a missing row here costs discoverability rather than a red suite.
> Phase 7's row was added in the session that wrote the log, on the strength of that note.

Each file holds that phase's `## Phase N —` section and its `## Vault-out — Phase N` section, moved
verbatim. `tests/unit/docs-contract.test.ts` reads them by that path — see the split record at the
bottom of this file for what the headings guarantee.

**The cross-phase entries below stay here.** They have no single phase owner.

## Cross-phase — QA agent protocol wired in (2026-08-07)

**Not a phase.** A documentation audit run between Phases 2 and 3, on the observation that no
document said the QA gates are run by subagents.

**What was wrong.** Every phase's QA gate has an **Owner** column, and most rows are owned by an
agent. But the owners were bare nouns — `qa-expert`, `code-reviewer`, `perf`, `ui-ux-tester` —
and nothing anywhere said they were agent types, how to invoke one, or that their findings carry
the applied-or-recorded weight *(C11)* the Codex findings do. Exactly one line in the whole
repository named a real agent: Phase 1's criterion 1.8, `voltagent-qa-sec:code-reviewer`. The
column read as a label, not an instruction, which is how Phase 2 came to run its gate without ever
deciding whether an agent owned a row.

Playwright had the mirror-image gap: `playwright-cli` appeared once (criterion 2.8) while eleven
other `play`-owned criteria said "hands-on" / "eyeball" / "screenshot" and named no tool at all.

**What changed.**

| Change | Where |
|---|---|
| New **§ The QA agent protocol** — owner→agent map, the rules, two copy-paste briefs, per-owner addenda | `docs/PRD.md` |
| Owner column fully qualified to `voltagent-qa-sec:*` in all ten gates | `docs/prd/phase-*.md` §6 |
| `playwright-cli` named on all 11 `play`-owned criteria; 2.8 was the template | `docs/prd/phase-*.md` §6 |
| §2 skill lists rebuilt: an **Always** line (`executing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`) on every phase, plus `e2e-playwright-testing`, `playwright-cli`, `find-docs` where they apply | `docs/prd/phase-*.md` §2 |
| Workflow line, a Non-negotiable bullet, and three Testing-conventions bullets | `CLAUDE.md` |

**Two owner reassignments.** 6.6 (WCAG 2.2 SC 1.4.3 contrast) moved from `ui-ux-tester` to
`voltagent-qa-sec:accessibility-tester`; 10.6 (CSP) and 10.7 (secret scan) moved from `qa-expert`
to `voltagent-qa-sec:security-auditor`. Both were generic owners standing in for an exact-fit one.

**A real contradiction found and fixed.** `physics-arcade` was a Required Skill in phases 2, 3 and
5 while CLAUDE.md § Engine gotchas says Arcade Physics "is not used and must not be" — `Body.velocity`
is px/second integrated with a delta, the exact multiply vault 2.1 forbids. Phase 2 had already
shipped without it, so the §2 lists had been wrong since they were written and nobody had noticed,
because nobody reads a skill list adversarially. Removed from all three, each replaced with a
one-line note saying why, so a future session cannot re-add it in good faith.

**Skill-name drift closed.** Two near-identical global skills existed, `e2e-playwright-testing` and
`playwright-e2e-testing`. Standardised on the first — the one Phase 1 actually exercised and whose
non-applicable rules are already recorded above. The second is deliberately never named anywhere.

**Eight workspace skills removed** from `.claude/skills/`, 45 → 37 directories, with explicit user
approval per the STOP-and-ask-before-deleting rule: `cinematography`, `commercial`, `marketing`,
`ugc`, `fan-cam`, `storytelling`, `fal-redesign`, `fal-regenerate-3d`. All are genmedia
marketing/video verticals with no bearing on a browser platformer. Marketplace-installed, so
reinstallable from `.claude/skills/.installed.json` if ever needed.

**Kept deliberately:** `physics-arcade` and `physics-matter` stay on disk as *why-we-don't-use-this*
reference — the fix for those was the §2 lists, not the workspace. Also `v3-to-v4-migration` (the
best v4-breaking-changes reference this project has), `fal-workflow` and `fal-recipes`.

**Phase 4 carries a subordination warning.** `pixel-art-sprites`, `game-asset-generation` and
`spritecook-generate-sprites` were added to its §2, each explicitly subordinate to STYLE.md §2–§5
and FAL-MODELS.md — a conflict is a STOP-and-ask, not a prompt tweak. Without that note, three
skills with opinions about sprite style would have been pointed at a locked art direction.

**Not done, deliberately.** Phases 1 and 2 were not re-gated. Their criteria passed under the old
wording and the agents that would now own those rows were, in the cases that mattered, actually
run — Phase 1's 1.8 names one. This change binds Phase 3 onward.

**What this does not fix.** The protocol makes the owner column executable; it does not make an
agent's answer true. The rule that an agent may not turn its own criterion green from reasoning
alone — it must cite command output, file and line, or a screenshot — is the only thing standing
between this change and a gate that is more thoroughly decorated than before *(C2)*.

---

## Cross-phase — the art-direction lock (2026-08-07)

**Built immediately after the QA agent protocol above**, on the observation that Phase 4's §2 now
carries three skills with opinions about sprite style — `pixel-art-sprites`,
`game-asset-generation`, `spritecook-generate-sprites` — pointed at a *locked* art direction whose
only protection was a sentence: *"Changing anything in §2–§5 is a STYLE.md change and needs
approval, not a prompt tweak."* A locked recipe with no mechanical lock is a suggestion, and a
prompt tweak is exactly what a sprite skill produces.

**`tests/unit/style-lock.test.ts`** — 32 assertions, runs on every `npm test`, no new dependency.
File contents come from `import.meta.glob(..., { query: '?raw' })` rather than `node:fs`, the same
technique `sim-boundary.test.ts` uses to avoid `@types/node` and stay runnable with Phaser
uninstalled. The hash is FNV-1a written out inline, because `node:crypto` would need the types
package the frozen dependency list excludes. It is a change-detector; collision resistance is not
the job.

**What is locked, by content hash:**

| Section | Hash | Why |
|---|---|---|
| §2 parameter table | `977d024f` | the exact endpoint and generation parameters |
| §4 prompt template | `da7899b9` | "everything else is verbatim and must not be reworded casually" |
| §5 the two separation rules | `3bbfc045` | "non-negotiable" |

**What is deliberately NOT locked**, and this is the design decision that makes the lock survivable:
§2b, the `[SETTING]` values, the `[SCALE_RATIO]` calibration table, and §5's sat/val/hue table.
All four were measured on the retired `nano-banana-2` and are *supposed* to change at gate 0. A lock
that fires on legitimate work gets disabled inside a phase. **Verbatim text is locked; measurements
are not.**

**Beyond the hashes**, because a hash mismatch says only "something changed" — these say what broke:
nine named §4 invariants (CRITICAL GEOMETRY, both separation rules, the brass leading edge, the cool
background, DO NOT INCLUDE, the no-text constraint, both slots); eight §2 parameters asserted by
name; a refusal of `4K` (it costs double, §2b); a refusal of the retired endpoint as a *value*; a
check that every fal endpoint named in STYLE.md has a FAL-MODELS.md entry; and a vault-4.4 check
that no percentage reaches the prompt template — the mistake that was made twice on `nano-banana-2`
before `one and four fifths` was adopted.

**Watched fail before trusted** *(C1)*. Ten mutations applied to the real `docs/STYLE.md`, each
verified applied by *"content changed AND the original count dropped by exactly one"* *(C12)*:

| # | Mutation | Red | Caught by |
|---|---|---|---|
| M1 | reword one verbatim phrase in the template | 1 | §4 hash |
| M2 | drop `CRITICAL GEOMETRY:` | 2 | §4 hash + named invariant |
| M3 | percentage instead of `[SCALE_RATIO]` | 3 | §4 hash + slot + vault 4.4 |
| M4 | swap the endpoint to `flux-pro` | 3 | §2 hash + Endpoint + FAL-MODELS entry |
| M5 | `enable_web_search` → `true` | 2 | §2 hash + named param |
| M6 | change the seed | 2 | §2 hash + named param |
| M7 | alias → an undocumented model | 2 | §2 hash + FAL-MODELS entry |
| M8 | weaken separation rule one | 1 | §5 hash |
| M9 | `DO NOT INCLUDE` → `AVOID` | 2 | §4 hash + negative-prompt invariant |
| M10 | `resolution` → `4K` | 3 | §2 hash + named param + cost refusal |

Restored byte-identical after every one; suite green at 32/32.

**Two mutations refused to apply and the harness caught it** — M4 and M7 first ran through a
double-quoted `perl -e`, where the backticks in `` `fal-ai/…` `` interpolated as command
substitution. The guard reported `before=1 after=1` and restored the file rather than reporting a
green run on an unmutated document. That is precisely the C12 failure mode, and the reason the rule
is "the original count dropped by one" and never "the original count is now zero" — a mutation that
silently no-ops otherwise reads as a passing gate.

**The bad-fixture set** *(C2)*: `tests/fixtures/bad-style/` holds six committed copies of the real
document, each with exactly one approved thing broken, asserted to be **caught**. Verified each
differs from the source by exactly one line. Two further tests assert the extractor *throws* on a
missing marker or an empty slice, rather than hashing the empty string — a lock that silently hashes
nothing passes forever.

**What this does not cover.** The lock protects the *recipe*, not the *output*. Nothing here can tell
whether a generated image actually obeys the separation rules — §5 says so explicitly for rule one
("no whole-region metric can see it, so it must be verified by eye", vault 4.19). The lock stops the
recipe drifting; criteria 4.1, 4.10 and 4.14 are still what judge the art. It also cannot stop
someone editing a hash to clear a red suite, which is why **criterion 4.0a** exists and is owned by
an agent: *every hash change is an approved, recorded decision*.

---

## Cross-phase — the docs contract (2026-08-07)

**The third guardrail of the same day**, and the one that closes the loop on the first. The QA
agent protocol made the Owner column executable; the art lock protected STYLE.md. Both left the
same hole: **every invariant was verified by hand, once.** A check run by hand is not a gate — it
is a thing that was true on a Tuesday.

**`tests/unit/docs-contract.test.ts`** — 82 assertions over `docs/PRD.md`, all ten phase documents
and `docs/QA-LOG.md`. Same `import.meta.glob(..., { query: '?raw' })` technique, no new dependency,
runs with Phaser uninstalled.

**The owner roster is parsed out of PRD.md, not restated.** This is the design decision that
matters. `LEGAL_OWNERS` reads § The QA agent protocol's mapping table at test time, and every gate
row in every phase is checked against it. Add an owner type to the PRD and it becomes legal
everywhere automatically; use one in a gate that the PRD does not define and the gate fails.
Hard-coding the roster in the test would have created a second place to update, and the two would
have drifted — which is the exact failure the protocol was written to fix, reintroduced one layer
down. Mutation D7 proves the wiring: deleting one row from the PRD's map turns a *phase gate* red.

**Per phase:** all eight sections present · every gate owner defined in the PRD map · no bare agent
noun in the gate · every `play`-owned criterion names `playwright-cli` · both Codex review criteria
present · all four always-on skills named · `physics-arcade` never listed as required.

**Cross-document:** no phase requires the duplicate `playwright-e2e-testing` skill; and every phase
the PRD marks ✅ done has a QA-LOG row for **every one** of its criteria. That last one is the
closest mechanical stand-in for *"a phase with an unrun criterion is reported failing"*. It was
checked against the real documents before being written in — phases 1 and 2 cover 11/11 each, so it
is a live gate rather than an aspiration.

**Watched fail before trusted** *(C1)* — eleven mutations against the real documents:

| # | Mutation | Red | Caught by |
|---|---|---|---|
| D1 | owner → `qa-guru` | 1 | owner not in the PRD map |
| D2 | owner → bare `code-reviewer` | 2 | PRD map + bare-noun check |
| D3 | drop `playwright-cli` from a `play` row | 1 | play-criterion tool check |
| D4 | `physics-arcade` back into a §2 | 1 | required-skill refusal |
| D5 | drop an always-on skill | 1 | always-on check |
| D6 | delete the Codex impl criterion | 1 | both-reviews check |
| D7 | delete one row from the PRD owner map | 1 | **a phase gate** goes red |
| D8 | rename a section heading | 1 | eight-sections check |
| D9 | delete a QA-LOG row for a done phase | 1 | evidence check |

Plus six committed fixtures in `tests/fixtures/bad-docs/` *(C2)* and two tests asserting the
extractor throws on a missing marker or an empty slice.

**Two checks were written wrong and the first run caught them.** Both were too broad, and both
flagged the very prose that documents the rule:

1. *"the duplicate Playwright skill is never named"* fired on CLAUDE.md and QA-LOG.md, where
   `playwright-e2e-testing` is named **in order to say it is the one not to use**. A check that
   demands the deletion of its own documentation is worse than no check. Scoped to §2, where
   requiring the wrong skill would actually cause drift.
2. *"no bare agent noun anywhere in PRD.md"* fired on the protocol's own sentence explaining what
   the `code-reviewer ×2` criterion has always meant. Deleted rather than contorted: the phase
   gates are already checked row by row, and PRD prose drives nothing. **An over-broad check that
   cries wolf gets disabled, which costs more than never having written it.**

This is the same shape as the `nano-banana-2` false positive in the style lock earlier the same
day — a rule about *values* applied to a region containing *prose about values*. Three occurrences
in one session is a pattern worth naming: **scope a document check to the structural position that
carries the meaning — a table cell, a section — never to the whole file.** Prose discussing a
forbidden thing is how a repository explains itself.

**Mutation D4 also re-earned vault C12 the hard way.** Its first guard was "the original count
dropped by one", and it reported DID NOT APPLY on a mutation that *had* applied — because the
replacement (`physics-arcade · audio-and-sound`) still contained the probe, so the line count never
moved. That is precisely the case CLAUDE.md warns about. Replaced with a two-part proof: **the file
content changed AND the expected mutant token is present.** D1 failed the same guard for the
opposite reason — one `sed` hit two rows and the count dropped by two.

**What this does not cover.** It checks that the documents say the right thing, never that anyone
did it. A QA-LOG row reading "PASS" is still a sentence a human wrote. Criterion X.9's adversarial
brief and the Codex implementation review remain the only things that read the work rather than the
paperwork.

## Cross-phase — QA-LOG split into per-phase files (2026-08-07)

**This file was 1473 lines and gaining ~350 a phase.** Seven phases remain; the trajectory ended
near 4000 lines in a single document that every phase's vault-in step instructs you to read. The
three phase bodies moved to [`docs/qa/`](qa/), one file per phase, slug matching the phase's
`docs/prd/` document — the convention `docs/prd/` and `docs/reviews/` already use.

| Was | Is | Lines |
|---|---|---|
| `QA-LOG.md` 8–418 | `docs/qa/phase-01-boot.md` | 411 |
| `QA-LOG.md` 419–862 | `docs/qa/phase-02-player.md` | 444 |
| `QA-LOG.md` 863–1253 | `docs/qa/phase-03-tilemap.md` | 391 |
| `QA-LOG.md` 1–7, 1254–1473 | `QA-LOG.md` — preamble, index, cross-phase entries | 245 |

**`QA-LOG.md` kept its path deliberately.** ~70 references point at it from `CLAUDE.md`, `PRD.md`,
`STYLE.md`, `ENGINE-NOTES.md`, `src/`, `tests/` and `docs/reviews/`. Moving it would have broken
every one; making it the index broke none. Each phase body carries one added navigation line and is
otherwise verbatim — no reflow, no re-wording, no tidying.

**Losslessness was proved, not asserted.** The claim "nothing was lost" is exactly the kind a human
eye confirms wrongly on a 110 KB file. A script rebuilt the original from the pieces —
`hub[…before "## The per-phase logs"] + phase-01 + phase-02 + phase-03 + hub[from the first
"## Cross-phase —" heading]` — and compared it byte for byte against `git show HEAD:docs/QA-LOG.md`:

```
PASS identity   — rebuilt 110576 bytes, identical to HEAD:docs/QA-LOG.md
PASS accounting — 112215 new bytes − 1639 added = 110576 original bytes
```

Two independent checks, so a bug in the reconstruction cannot pass both: string identity, and byte
arithmetic over the four files minus the known additions (the index block and three nav lines).

**The one machine reader.** `tests/unit/docs-contract.test.ts`'s evidence check —
*every phase the PRD marks ✅ done has a row for every one of its criteria* — sliced phase N out of
the single file with `between(QA_LOG, '## Phase N ', '## Vault-out — Phase N')`. **The slice logic
is unchanged**, including `between()`'s throw-on-empty *(C2)*; only its source changed, to
`doc('/docs/qa/' + <the phase document's own filename>)`. **The log is addressed by the name of the
`docs/prd/` document it belongs to**, which is what forces the two directories to line up
file-for-file — the convention is enforced rather than merely written down, and a drifted slug is
indistinguishable from a missing log. Both `## Phase N —` headings therefore remain load-bearing
inside the moved files, em dash included.

**Watched fail before trusted** *(C1)*, redness read positively from `Tests N failed` plus the named
spec, never from an exit code:

| # | Mutation | Red | Message |
|---|---|---|---|
| S1 | delete the `\| 3.7 \|` row from `docs/qa/phase-03-tilemap.md` | 1 | `phase 3 criterion 3.7 has no QA-LOG row` |
| S2 | rename `phase-03-tilemap.md` → `phase-03-tiles.md` | 1 | `document not found: /docs/qa/phase-03-tilemap.md` |
| S3 | remove `docs/qa/phase-03-*.md` entirely | 1 | `document not found: /docs/qa/phase-03-tilemap.md` |

**S2 went green on the first attempt, and that is what produced the design above.** The resolver as
first written matched the `phase-03-` prefix, on the reasoning that the slug was the phase
document's business and this test should not restate it. Under that rule S2 is *correctly* green —
but it also means `docs/qa/` and `docs/prd/` are free to drift apart, with the naming convention
surviving only as a sentence in this file. Nothing enforced it.

The fix deleted code rather than adding a check: the resolver now asks for the phase document's own
filename, so the drift it tolerated is unrepresentable and no second assertion is needed. S2 and S3
now fail identically, which is the point — **a log named wrongly and a log not written are the same
defect**, and the gate should not be able to tell them apart.

The general lesson is about mutation design, not about this resolver. A mutation that comes back
green is ambiguous: it can mean the gate has a hole, or the mutation targets behaviour the gate
never promised. Only the *expected message, written down before the run*, separates the two — and
here it turned a green result into the finding that the convention had no enforcement at all.

S1 is D9 from the docs-contract entry above, re-run against the new layout. All three mutations were
confirmed reverted by content hash **and** by the probe count returning to its original value
*(C12)*, and the reconstruction proof was re-run afterwards to establish the tree was back to the
verified state — a mutation left applied in a green tree is the exact failure C12 names.

**Not updated, deliberately:** the eleven hard line-number citations in `docs/reviews/`
(`docs/QA-LOG.md:174-180`, `:419-425`, `:502-527`, `:529-595`, `:609`, `:903,912`, `:990,993`,
`:131-135`, `:779-780`). Those are dated review artifacts describing the file as it stood at a
specific commit; rewriting them would falsify the record rather than repair it. They were already
stale-prone before this split, and what they cite is reachable at
`git show 83daaa6:docs/QA-LOG.md`.

## Cross-phase — four long documents split (2026-08-15)

**Not a phase.** A documentation audit run after Phase 5 merged, on the observation that four
documents had passed 500 lines and two of them are documents a session is *instructed* to read on
the way in.

| Was | Is | Lines |
|---|---|---|
| `qa/phase-05-combat.md` 3167 | index (summary + vault-out) + 9 flat siblings | 314 + 271…370 |
| `HANDOFF.md` 1604 | index + §14/§15 + 4 files in [`docs/handoff/`](handoff/) | 360 + 179…404 |
| `reviews/phase-05-plan.md` 1069 | index + 3 files, grouped by review | 23 + 246…419 |
| `qa/phase-04-art.md` 518 | narrative + [`qa/phase-04-art-gate.md`](qa/phase-04-art-gate.md) | 300 + 232 |

**All four hubs kept their paths.** ~35 things point at `HANDOFF.md` and ~20 at the Phase 5 QA log,
including `src/`, `tests/`, `tools/` and `playwright.config.ts`; `docs/prd/phase-05-combat.md`
writes the plan-review path into criterion 5.13 itself. Moving a hub breaks all of those; making it
an index breaks none. This is the `QA-LOG.md` rule of 2026-08-07, applied again.

**Two mechanical constraints decided the shape, and neither is visible in the documents.**

`tests/unit/file-size.test.ts:35` globs `docs/qa/*.md` **non-recursively**, and four source files
over 400 lines (`src/sim/combat.ts`, `src/sim/player.ts`, `tools/gen/motion.mjs`,
`tests/unit/enemy-ai.test.ts`) are recorded **only** inside the Phase 5 log — in the deep sections
that moved out. A `docs/qa/phase-05-combat/` subdirectory would have un-recorded all four while
looking tidier. **The QA parts are therefore flat siblings**, and mutation M3 below is the proof
that this is a rule rather than a preference.

`tests/unit/docs-contract.test.ts:260` slices `docs/qa/phase-05-combat.md` between `## Phase 5 `
and the vault-out heading and requires all 20 criterion ids inside that slice. **The index
therefore keeps both headings, character for character, with the summary table between them** —
and the vault-out's twelve distilled lessons stayed with it, which is where they belong anyway.

**Losslessness was proved, not asserted** — the 2026-08-07 procedure, unchanged. A script rebuilt
each original by concatenating the pieces from disk, stripping the added navigation and index
blocks by exact line-for-line match, and compared byte for byte against `git show HEAD:<path>`;
a second, independent check did the byte arithmetic from `stat` sizes:

```
PASS identity   — rebuilt 255516 bytes, identical to HEAD:docs/qa/phase-05-combat.md
PASS accounting — 258808 new bytes − 3292 added = 255516 original bytes
PASS identity   — rebuilt 107302 bytes, identical to HEAD:docs/HANDOFF.md          [before link repair]
PASS accounting — 108537 new bytes − 1235 added = 107302 original bytes            [before link repair]
PASS identity   — rebuilt  86558 bytes, identical to HEAD:docs/reviews/phase-05-plan.md
PASS accounting —  88422 new bytes −  1864 added =  86558 original bytes
PASS identity   — rebuilt  41775 bytes, identical to HEAD:docs/qa/phase-04-art.md
PASS accounting —  42586 new bytes −   811 added =  41775 original bytes
```

The strip step throws if an added block is missing **or** appears twice, and asserts the leftover
line count equals the declared segment lengths — so a mis-declared block fails loudly instead of
reconstructing something plausible and wrong.

**Then the move's one real regression was repaired, as a separate and fully accounted step.** A
link check over all 441 relative links in `docs/` and `CLAUDE.md` found 13 broken in
`docs/handoff/`: they were written relative to `docs/`, and moving them one directory down broke
every one. Repaired by prefixing `../`. Re-running the proof after the repair gives the delta
exactly, and the delta is the repair and nothing else:

```
FAIL identity   — rebuilt 107341 bytes, DIFFERS from HEAD:docs/HANDOFF.md
FAIL accounting — 108576 new bytes − 1235 added = 107341 (expected 107302) original bytes
```

107341 − 107302 = **39 bytes = 13 links × 3 characters**, and a line-by-line diff of the rebuild
against `HEAD` shows **13 differing lines, all 1604 lines still present**, each differing only
inside the link target — the link text was not touched. The other three documents stayed byte
identical through the repair, because their links were already correct.

**Six more broken links were found in the same check and fixed, and they are not from this split.**
`docs/qa/phase-01-boot.md`, `phase-02-player.md`, `phase-03-tilemap.md` and
`docs/lessons/phase-03-tilemap.md` all pointed at `reviews/…`, `ENGINE-NOTES.md` and
`ASSET-PIPELINE.md` without the `../`. `git log` puts them in `a136c9b docs: split QA-LOG into one
log per phase` — **the identical defect, from the 2026-08-07 split, undetected for eight days.**
Both splits proved their *content* lossless byte for byte and neither checked whether the content
still *pointed* anywhere. Byte identity is not link integrity: a link is correct relative to where
the file sits, so the one thing a verbatim move is guaranteed to break is the one thing a byte
comparison cannot see. **The link check belongs in the procedure**, next to the reconstruction
proof. All 441 links resolve as of this entry.

**Watched fail before trusted** *(C1)*, redness read positively from the named failing spec and its
message, never from an exit code:

| # | Mutation | Message |
|---|---|---|
| M1 | rename `docs/qa/phase-05-combat.md` → `phase-05-fight.md` | `document not found: /docs/qa/phase-05-combat.md` |
| M2 | delete the `\| 5.7 \|` row from the index's summary table | `phase 5 criterion 5.7 has no QA-LOG row` |
| M3 | move the nine parts into `docs/qa/parts/` | `over 400 lines and not named in any docs/qa/ log` — naming exactly the four files above, and no others |

M2's application was confirmed by **content changed AND the row count dropping 20 → 19** *(C12)*,
never by "the count is now zero". All three were confirmed reverted by content hash and by the
count returning to its original value, and the reconstruction proof was re-run afterwards to
establish the tree was back to the verified state.

**M3 is the one worth keeping.** It is the only positive evidence that the flat-sibling rule is
load-bearing; without it the rule is a sentence in a document, which is exactly the failure mode
the 2026-08-07 split record describes for the naming convention it had to go back and enforce.

**Not updated, deliberately:** the ~30 `file.md:NN` citations pointing into these four documents
from `docs/reviews/`, `src/` and `tests/`, and the `§N` prose citations to `HANDOFF.md`. The § ones
still resolve — they land on the index, one hop from the section. The line numbers do not, and they
already did not: they are dated records of a file at a commit, and rewriting them would falsify the
record rather than repair it. What they cite is reachable at `git show HEAD~1:<path>`.

**Recorded, not fixed:** `docs/qa/phase-04-art.md` has **no vault-out heading at all**, and phase 4
is not marked ✅ in PRD.md, so `docs-contract.test.ts` does not read it yet. Whoever marks phase 4
done must add that heading and check that the criterion table — now in `phase-04-art-gate.md` —
lands inside the slice the test takes. Inventing its position now would guess at work not yet done.

**What this does not cover.** No test enforces a line ceiling on documents. Criterion 5.12's
400-line rule covers source only. This split is the first time in eleven sessions that the document
sizes mattered, so the ceiling stays a judgement call rather than a gate.
