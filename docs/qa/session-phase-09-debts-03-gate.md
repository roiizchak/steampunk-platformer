# Session — Phase 9's debts, part 3: the QA gate round

Flat sibling of [`session-phase-09-debts.md`](session-phase-09-debts.md). Six agent briefs, two per
owner, brief 1's findings withheld from brief 2 *(A7)*. **Every finding is APPLIED or RECORDED with a
one-line reason** *(C11)*.

| owner | criteria | brief 1 | brief 2 |
|---|---|---|---|
| `voltagent-qa-sec:code-reviewer` | S3, S5 | checklist | *"what source shape defeats these scans?"* |
| `voltagent-qa-sec:qa-expert` | S4 | checklist | *"how could this gate be wrong?"* |
| `voltagent-qa-sec:performance-engineer` | S6, S7, S8 | checklist | *"does the design re-import suppression?"* |

All six ran with `isolation: "worktree"` and a deliverable path outside the worktree. **A subagent's
summary is a claim, not evidence** — every finding below was re-verified locally before it was acted
on, and two were verified against the shipped Phaser typings rather than the agent's word.

---

## The one CRITICAL: the REST-phase i-frame pin was INVERTED

**`tests/e2e/combatDrive.ts` — perf brief 2. APPLIED.**

`invulnerable(player)` is `windowOpen(iFrameCounter, IFRAME_TICKS)` = **`counter < 45`**
(`src/sim/combat.ts:76`, `src/sim/windows.ts:61`). A **small** counter is protected. The driver pinned
`iFrameCounter = 9999` during REST *"so nothing can expire mid-REST"* — which left the player **fully
vulnerable through every REST phase** and made three separate docstrings' *"no event can occur, by
construction"* simply false. `installStorm` has the correct value, `0`, in a file twelve away.

⚠️ **The aggregate readings survived it by accident, not by design.** `reduceCombat` filters control
frames by *distance from an event*, not by *phase label*, so hits landing during REST were excluded
anyway. The invariant is repaired rather than the accident relied on.

**Re-measured after the repair, three runs:** raw events **15 / 18 / 20 / 22** (down from 44-55 —
that is the repair working, REST is genuinely quiet now), `lethal` **2 / 4 / 6 / 9**, control 2337-2789
frames. `MIN_EVENTS = 10` still clears the lowest with margin and its docstring now cites the
post-repair numbers.

🔴 **And the central §1a finding got SHARPER, not weaker.** Re-running the 8× spark mutation after the
repair:

| | clean | 8× mutation |
|---|---|---|
| peak sparks in a hit window | 32 | **32 — unchanged** |
| per-event median delta | -0.0000 / 0.0000 / 0.2000 ms | **0.0000 ms** |

Pre-repair the statistic *moved the wrong way*; post-repair it **does not move at all**, and the spark
count is pinned at 32 by the shipped cap in both arms. The recorded non-closure stands on better
evidence than it did.

---

## S3 / S5 — the tween scans

| # | severity | finding | disposition |
|---|---|---|---|
| S5-5 | critical | `const { player } = scene.simWorld` dropped — `declarations()` recorded only `Identifier` ids, so a destructured alias was MISSED while the identical `let p = …` was CAUGHT. Codex PR-03 named destructuring and the log marked it applied. | **APPLIED** — `ObjectPattern` bindings map to a synthetic member expression `reachesSim` already walks. Watched red on the new fixtures with the fix removed, green with it back. |
| S5-1 | critical | `src/sim/` is mutating functions taking sim objects as ARGUMENTS (`damagePlayer(world.player, 1)`, `killPlayer`, `stepEnemies`, `advance`). The rule read assignment targets and mutator receivers only. | **APPLIED** — a call argument that reaches a sim handle is now *"a sim object passed out of a tween callback"*. Passing sim state out of a wall-clock callback is the ownership violation whatever the callee does, so the callee's body need not be resolved. Accept-case committed (`fadeOut(sprite, 0)` stays legal). |
| S5-2 | critical | `onComplete: finish` was caught; `onComplete: () => finish()` was not. Same helper, same write, six characters apart. | **APPLIED** — the walk follows a call to a local declaration, depth-limited to 2 hops and stated as such. |
| S5-4 | high | `CALLBACK_KEYS` omitted `onUpdate`, which falsified this module's own claim that an `addCounter` freeze is caught — a counter tween writes through `onUpdate` and nothing else. | **APPLIED** — `onUpdate` added, with a red fixture and an accept fixture. |
| S3-2 | high | `const tm = scene.tweens; tm.add({…})` was invisible to 9.3b, to 9.3c's filter **and** to the parser extractor — one `const` silenced every tween rule at once, returning **zero** callback bodies, which reads as a clean file rather than an unscanned one. | **APPLIED** — `namesTweenManager` resolves manager aliases through the same `decls` map. `const tm = scene.anims` still accepted. |
| S3-3 | high | 9.3b knew only `add` while the sibling `TWEEN_METHODS` in the same branch listed five. Two files, one branch, disagreeing on what a tween is. | **APPLIED** — `TWEENS_ADD` covers `add`, `addCounter`, `addMultiple`, `chain`, `create`; `killAll`/`getTweensOf` stay out. |
| S5-3 | high | `tween-callback-boundary.test.ts:135` said the four `callbackCode()` holes *"are now COVERED"*. Measured: one is, two are not (imported callback, config-as-variable → zero bodies), and shadowing still hides a violation. | **APPLIED as a correction, not a rewrite** — the false sentence is left standing with the correction above it. A claim that was published and believed is worth more as a corrected record than as a tidy one. |
| — | medium | `errorRecovery: true` **throws** rather than yielding a partial tree, so the vacuity docstring's stated *mechanism* was wrong (the check is still worth having, for a different reason). `plugins` has no `jsx`, so a `.tsx` under `src/` would throw on arrival. | **APPLIED** — both recorded at the parser call. `jsx` deliberately not added: it changes how `<T>` parses in ordinary `.ts`, and no `.tsx` exists. |
| S3-4 (a) | high | `this.add.tween(config)` is a real Phaser 4.2.1 entry point (`phaser.d.ts:26869`, `:28201`) and every rule keys on the object being literally named `tweens`. Bypasses 9.3b, 9.2, 9.2b and 9.2c at once. | **RECORDED as D14, with the ABSENCE PINNED** — closing it means resolving what `add` is bound to, a different machine from a pattern. A committed test asserts no file uses it, so the day someone does, a fast test names D14 instead of a scan quietly passing. |
| S3-4 (b) | high | `getTweensOf(o).forEach(t => t.destroy())`, template-literal keys, `Reflect.get`, destructure+`.call`, `tweens.destroy()` all reach kill-by-target semantics under other names. | **RECORDED** — these are D4, already the plan's named non-closure. Not widened into. |
| S3-1 | high | "Held" is satisfied by a dead local, and 9.3c's `/\.stop\(\)|\.destroy\(\)/` matches any `.destroy()` on anything. | **RECORDED, not fixed** — distinguishing a live handle from a dead one is liveness analysis, and the criterion asks whether the handle is *reachable*, which a dead local technically is. Left as a stated narrowing rather than a rule that would need a dataflow pass to be honest. |
| S5-6 | high | The rule is `world`/`simWorld` **by name**, not `World` **by type**; a `World` parameter named `w` is invisible. | **RECORDED** — by-type needs the type checker, and TS 7 does not expose one to a test (see the frozen-dependency note in CLAUDE.md §3). Adding names is a treadmill; the narrowing is stated. |
| — | minor | `blank()` has no regex-literal mode, so a lone apostrophe inside a regex blanks the rest of the file in the `'code'` view. | **RECORDED** — shared infrastructure used by many gates; changing its lexer during a debt-repair session is out of scope and would need its own red proofs. No `src/` file trips it today. |
| — | nit | The dependency record said the parser adds **one** transitive package; the lockfile shows **three** (`@babel/types`, `@babel/helper-string-parser`, `@babel/helper-validator-identifier`). | **APPLIED** — corrected in CLAUDE.md §3. The owner's decision is unaffected, but the number put to them was wrong. |

## S4 — the docs-contract lint

| # | severity | finding | disposition |
|---|---|---|---|
| F1 | high | `gateVerdictTable` matched the marker by **first-occurrence `indexOf`** with no uniqueness check — the exact bug class this project already fixed for `between()`'s markers and never generalised. A documentation-style mention above the real table designates a placeholder, so one criterion is validated against fabricated rows while its real failing row is never read. | **APPLIED** — a second occurrence now **throws**. Red proof committed. |
| F2 | medium | `criterionRowGaps` returned `[]` (vacuous pass) for an empty `ids` array even with a table full of `FAIL` rows. Masked only by a sibling assertion in another file — a coupling that disappears the moment a run is narrowed with `-t`, which CLAUDE.md documents as normal. | **APPLIED** — empty ids is now a reported failure. Red proof committed. |
| F3 | low | The done-phase filter was `line.includes('✅')` over the whole PRD row, not the Status cell's leading verdict — safe today only because no non-done row carries a stray ✅. | **APPLIED** — scoped to the status cell's leading verdict. |
| — | minor | `id.replace('.', …)` is **not global**, so only the first dot of a multi-dot id was escaped: `9.2.1` would have matched `9X2.1`. | **APPLIED** — `escapeId` escapes the whole id. Latent today (every id has one dot); repaired rather than left as a trap. Red proof committed. |
| — | nit | The duplicate-row and missing-marker red-proofs use inline literals rather than a `.fixture` file like the other five. | **RECORDED, not changed** — these fixtures are three lines of Markdown; a file per fixture would be more ceremony than evidence. |

**Brief 1 confirmed the batch's claims by execution, not by reading:** it drove two live mutations
against the real shipped docs — a marker deletion on Phase 4 and a duplicate-row injection on Phase 9
— watched each fail with the expected assertion, and reverted *(C1/C12)*. Phase 4's two-legitimate-rows
shape and the eight-done-phase count both hold.

## S6 / S7 / S8 — the perf work

| # | severity | finding | disposition |
|---|---|---|---|
| — | critical | The inverted i-frame pin. | **APPLIED** — see the section above. |
| — | medium | `combatFrames.ts`'s near windows used `<= event.tick + NEAR_TICKS`, so two clustered events exactly `NEAR_TICKS` apart share one tick and the second hit's burst is counted into the first hit's reading. | **APPLIED** — the upper edge is exclusive. Clustering guarantees events are at least `NEAR_TICKS` apart, so the windows are now a partition rather than an overlapping cover. |
| — | medium | Events whose tick no frame observed were dropped **silently**. | **APPLIED** — counted and printed. A silent drop is how a reduction quietly narrows to the events that happen to be cheap. |
| — | major | `storm<N>` is parametric, so it sits outside `NAMED_MUTATIONS`, `MUTATION_TARGETS` and the routing test — and it is the recorded red proof for **two of the four upper bounds**. The gap was nowhere written down. | **RECORDED** in `mutationTargets.ts` — routing an unbounded family of names needs a different key than `Record<NamedMutation, …>`, and inventing one for a single documented entry is more machine than the criterion has earned. Written down so the next reader sees a gap rather than a complete-looking table. |
| — | medium | FIGHT-only hopping adds landing-dust cost that REST never carries — an unstated confound in the delta. | **RECORDED** — it inflates the near side, which makes the (unasserted) deltas conservative rather than optimistic. It is a confound worth naming and it changes no conclusion, because §1a asserts no delta. |
| — | low | `perf-mutation-routing.test.ts`'s "mentions the mutation" check is a raw string search and cannot tell a live `if (mutation === '…')` from a stray comment. | **RECORDED** — already disclosed in that test's own header as what it does NOT check. Distinguishing them means parsing the spec, and the test is explicitly a fast floor under a per-mutation run, not a substitute for one. |
| — | nit | The premise/bound classification table is hand-duplicated between the spec's inline comment and the QA log with nothing syncing them. | **RECORDED** — a lint for it would be a third copy of the same list. |

**Verified clean by brief 2, and worth recording as checked rather than assumed:** the `atLimit()`
admission-inversion class does **not** recur in the combat spec (no storm is installed there at all);
`installBurstFixture`'s rAF registration order relative to `perfSampler.sample()` correctly attributes
its busy-wait to the sampled frame; and its 10 % duty cycle stays under a median's 50 % for Guard 1
and Guard 3 as well as for the four bounds.

---

## What the gate round did NOT cover

Both code-review briefs flagged the same limit and it is repeated here rather than buried: **no agent
ran Playwright** (one run at a time on this machine), and **no agent could plant a mutation in a real
`src/` file** (they shared a worktree lineage with the primary checkout). Every C1/C12 confirmation in
this session is therefore the primary session's own work, re-run locally — which is what
*"a subagent's summary is a claim, not evidence"* asks for, arrived at from the other direction.
