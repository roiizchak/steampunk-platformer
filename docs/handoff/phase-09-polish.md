[← HANDOFF.md index](../HANDOFF.md)

# Superseded — Phase 9 (polish, juice, particles). **Superseded by the section above.**

> ## ✅ Phase 9 is APPROVED and MERGED. Owner tested it 2026-08-22; `main` is `a99c1f7`, pushed.
>
> **One defect came out of that playtest and is next session's first job — the jump clip. See below.**
>
> Both Codex reviews ran and every finding from both is applied or recorded with a reason. The gate
> owners ran twice each *(A7)* in isolated worktrees. The juice has been played by hand and the
> evidence clip approved — **twice**, because the first approval was withdrawn (see §3 below).
> **G.7b is FIXED** (`368577f`) — Phase 8's inherited gate, flaky ~3 runs in 8. Its statistic was
> replaced, not its bound: a paired 0/2560/5120 sweep with a 0.3 ms floor per gap and a MARGINAL
> per-exit cost, so the amplifier's count-independent overhead cancels. Verified independently.
>
> **~~The e2e suite now fails on criterion 1.4~~ — FIXED** in the tiers session (clearing the stale
> `node_modules/.vite` dep cache). e2e is **128 selected, 128 passed** as of 2026-08-23. The dev
> server / `dist/` boot gap was the cause and is recorded in `CLAUDE.md §1`; the citation that used
> to sit here pointed at a §0.2 the prompt no longer has.
>
> Full record: [qa/phase-09-polish.md](../qa/phase-09-polish.md) (including
> **§ Vault-out — Phase 9**) · [plan review](../reviews/phase-09-plan.md) ·
> [implementation review](../reviews/phase-09-impl.md) · [evidence/phase-09/](../evidence/phase-09/)

## What shipped

Hit-stop as a **per-body integer tick counter** — attacker and victim both freeze for the same count,
the rest of the world keeps ticking — armed at a new lettered step **9b** in the tick contract, with
`hitstopUntil` and `lastHitTick` as absolute deadlines. Screen shake, landing squash, impact sparks,
death plumes, hurt vents, landing dust, i-frame flicker, HUD gear flyers and a level-complete fade.
New sim modules `hitstop.ts`, `playerMotion.ts`, `playerSim.ts`; new scene modules
`particleTexture.ts`, `spriteFlash.ts`, `hudGearFlyers.ts`, `engineLiterals.ts`.

**The 14-step order was NOT renumbered.** Everything added went in as a lettered insert (4a/4b/4c,
9b/9c/9d). Renumbering is a balance change and needs a STOP-and-ask.

## The traps this phase paid for — read these before touching the same ground

**1. A draw-count gate cannot see an invisible particle.** Setting every generated particle texture
to fully transparent (`fillStyle(spec.tint, 0)`) left the unit suite 2150/2150 green and criterion
9.6 reporting `drawn 96 inView 96` **PASS** on a real GPU. Phaser submits a transparent quad exactly
as happily as an opaque one. Closed by an actual pixel read in `phase-09-draw.spec.ts` — **do not
weaken it.** Twenty-two gates of this same class were found and fixed this phase.

**2. `src/render/` modules need a draw-path gate or they are decoration.** `spriteFeedback.ts`
shipped with 221 source lines, a 306-line test file and **zero production consumers**; blanking all
four bodies left the game byte-identical with the suite green. `tests/unit/enemy-feedback.test.ts`
(behavioural, against a fake scene) is the stronger shape — prefer it over source-text scanning.

**3. Never infer an event edge from two samples of a level.** The landing edge used to be derived in
the render layer from `grounded` changing between render calls. At 1 sim tick per frame it emitted
dust and squashed; at 2 ticks per frame it emitted **zero**. Fixed at the source — `PlayerSim.landedTick`
stamped at step 10, read by the renderer. **The same mistake then recurred one layer out in criterion
9.2's own spec** and made it flake ~1 run in 3; that spec now reads the stamp too.

**4. The emit window was off by one and nothing had ever fired.** `(cursor, tickCount]` against
pre-increment stamps meant **no impact spark, death plume or hurt vent had ever appeared in the
shipped game**. Every unit fixture bumped the count before stamping — an ordering production never
performs — and 9.5/9.6 drove `explode()` on emitter handles directly, bypassing the trigger path.
The current form is `hitTick >= cursor && hitTick < tick`; restoring the old one reds six tests.

**5. Perf gates fail on an UNPAIRED median per arm.** Not on "a ratio with a quiet denominator" —
that first diagnosis was wrong and is corrected in the vault-out. `performance.now()` quantises to
**0.1 ms** here. Pair the rounds and separate the arms past the grid; never move the bound.

**6. The DEV hit-stop knob must fold away.** `?hitstop=` is `import.meta.env.DEV`-guarded and folds
to `function Yn(){return 1}` in `dist/`; `verify-dist.mjs` now fails the build on `URLSearchParams`
in the bundle. It also needs `Number.isSafeInteger` **and** a `MAX_HITSTOP_SCALE` — `isFinite` alone
accepted `1e308` and froze the game permanently, and `isSafeInteger` alone still accepted a
19-million-year freeze that death cannot release.

## Verification at the tip (`fbb0631`)

| gate | result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **2154 pass, 0 fail** (133 files) |
| `npm run build` + `verify-dist` | green |
| `npm run test:sim-isolated` | **2151 passed, 3 skipped**; Phaser restored |
| `npm run test:e2e` | **118 passed, 1 failed** — the failure is Phase 8's G.7b |
| criterion 9.2 in isolation | **8 consecutive green**, integrator-run, after 14 by the fixing agent |

Greenness was read **positively** — the test count, not the exit code, and never through a pipe.

## Next session's first job — the jump clip reads smaller and different (owner-reported, 2026-08-22)

The owner played the merged Phase 9 build and approved it, with one defect to fix next session:
**the jump animation looks different from the rest of the animations, and looks smaller.**

**Measured before writing this note**, so next session starts from numbers rather than an
impression. Drawn figure height per frame (opaque rows within the 336x384 cell, read off the shipped
`public/assets/characters/brass-courier/sheets/*.png` with `tools/gen/png.mjs`):

| clip | per-frame heights | mean | vs idle |
|---|---|---|---|
| idle | 287-289 | 288.1 | - |
| walk | 286-292 | 288.9 | 100% |
| attack | 283-289 | 287.6 | 100% |
| run | 261-279 | 275.7 | 96% |
| fall | 277,263,246,224,206,203,206,218,232 | 230.6 | starts full, tapers |
| **jump** | **215,186,195,201,204,197** | **199.7** | **69%** |
| death | 288 -> 64 | 145.2 | shrinks legitimately (collapse) |

**Jump never reaches full height on any of its six frames** (max 215). Fall's first frame is 277, so
an airborne pose *can* read near-full height on this character - jump is uniformly short, not merely
tucked. `renderHeightPx` is 288.

Two leads, in the order worth testing:

1. **Jump has no `_actionScale` override and may need one.** In
   `public/assets/config/character-bounds.json`, `fall` carries `scale: 0.6`, `attack` `0.6` and
   `death` `0.60504202` - per-(slug, action) overrides added because those were shot from PADDED
   generations. **`jump` carries none**, so it packs at the unpadded slug default `0.23723229`.
   Jump and fall are the airborne pair and share `verticalAnchor: "centroid"`; one having a padded
   scale and the other not is the asymmetry to check first. **Caveat, do not skip it:** a straight
   missing 0.6 override would make jump ~40% of idle, and it measures 69% - so if this is the cause
   the padding differs from fall's, and the number must be RE-DERIVED, never guessed.
   `node tools/gen/build-assets.mjs brass-courier jump --derive-scale` prints it; **a human pastes
   it** *(vault A5)*. The scale lives in the config on purpose - `assets:build` reads it and never
   computes it.
2. **"Looks different" is probably the derivation path, not the pose.** In `public/assets/index.json`
   `jump` and `fall` are `derivedFrom: "sim"` while `idle`/`walk`/`run` are `"authored"`. The two
   airborne clips came through a different pipeline from everything the owner is comparing them
   against.

**Before regenerating anything:** re-read `docs/ASSET-PIPELINE.md` and `docs/STYLE.md`, and note that
regenerating `idle` re-derives the slug scale and silently rescales **every** other animation
*(vault A5)* - so idle is rebuilt FIRST or not at all. A fal batch over 5 generations needs a
STOP-and-ask.

> ## ➡️ **Next session: CLOSE PHASE 9, then the last of Tier 5 — [SESSION-PROMPT-next.md](../SESSION-PROMPT-next.md).**
>
> The bug-fix session ran 2026-08-22/23 and merged (`f0dbe21`), followed by a branch-cleanup and
> Tier-5 session. **Phase 10 is still deferred**, and the reason is now sharper than "defer it":
> **`PRD.md:35` reads `—` because seven of Phase 9's eleven criteria are unsubstantiated.** The phase
> was merged and approved on a verbal report the project's own records do not corroborate — agent-owned
> criteria that FAILED were fixed and never handed back to their owners. That is one gate round, and it
> is what unblocks Phase 10.
>
> ⚠️ **The prompt has been rewritten to hold ONLY what is still open.** It is no longer the ~60-item
> inventory; closed items live in [qa/session-bugfix-tiers.md](../qa/session-bugfix-tiers.md) and
> [qa/session-tier5-and-cleanup.md](../qa/session-tier5-and-cleanup.md).
>
> **The owner playtested and accepts the game as it plays** (2026-08-23, twice). Prompt §4 records
> exactly what that settles — including 2.2's judder, closed as not visible at play speed — and the
> four `play`-owned items it cannot settle, because ordinary play cannot reach them.

## What is outstanding

1. **The jump clip** — see the section above. Owner-reported, measured, not yet fixed.
2. **G.7b** (`tests/e2e/phase-08-gate-perf.spec.ts:264`) — inherited Phase 8 gate, both arms measured
   `0.0000 ms`. Under repair using 9.5's pattern: pair the rounds, widen the arm separation. Moving
   the bound, skipping and deleting are all forbidden.
3. ~~Phase 9 is unmerged~~ — **DONE.** Owner tested and approved 2026-08-22; merged to `main` as
   `a99c1f7` and pushed to `origin`.

---

