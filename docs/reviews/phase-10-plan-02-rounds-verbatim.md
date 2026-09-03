[← Phase 10 plan review](phase-10-plan.md) · [phase doc](../prd/phase-10-ship.md) · [QA log](../qa/phase-10-ship.md)

---

## Round 1 — Codex, verbatim

1. Deliverables not required by §1’s goal

- **Medium — `README.md`.** Public documentation is useful, but §1 requires a production build, stripped dev seams, split licensing, regression, and deployment; it does not require a README. It is nevertheless listed in §5 and expanded into a public-promise document by the plan. `docs/prd/phase-10-ship.md:7-8,50-52`; plan `:153-159`.

- **Medium — `.vercelignore`.** Excluding docs, tests, raw assets, and existing `dist/` is upload optimisation, not required to produce or ship the production build. It is also absent from §5. Plan `:129-131`.

- **Low — `tsconfig.build.json`.** A separate config program is QA infrastructure required by criterion 10.5/vault 10.3, not a product deliverable required by §1. `docs/prd/phase-10-ship.md:61`; plan `:148-151`.

- **Low — `tests/e2e/phase-10-production.spec.ts` and the planned QA/review/evidence files.** They are verification machinery rather than shipped functionality. Equivalent evidence is mandatory because §1 says “full regression” and the global protocols require the QA log and two reviews, but those files are not themselves part of the playable product. `docs/prd/phase-10-ship.md:8,50-52,66-71`; `docs/PRD.md:212-235`; plan `:161-185,204-217,278-286`.

- `LICENSE`, `ASSETS-LICENSE.md`, `vercel.json`, and the production Vite configuration are not excess: they directly implement the licensing and shipping portions of §1. `docs/prd/phase-10-ship.md:7-8`; plan `:110-146,153-159`.

2. Acceptance criteria that can pass while the named thing is broken

| Severity | Criterion | Concrete false-green |
|---|---|---|
| **Blocker** | **10.1 — production bundle runs** | The proposed readiness poll passes as soon as one non-uniform frame is drawn. If the first `update()` then throws, the canvas retains that frame indefinitely; the poll stays green. The plan names console errors but not a `pageerror` listener, so a JavaScript exception is not necessarily captured. Plan `:168-184`; the repository’s actual terminal contract distinguishes ready, refused, and hung rather than treating drawing as completion. `src/debug/globals.ts:33-46`; `docs/PRD.md:416-422`. |
| **Blocker** | **10.2 — every dev seam absent** | Remove the guard from `updateDebugState`: `Object.assign(state, patch)` ships and runs every production tick, while `verify-dist` prints OK. This exact mutation is already measured. `tools/gen/verify-dist.mjs:66-84`; `src/debug/globals.ts:64-74`. The same blind shape exists for guarded bodies whose only surviving names are minified or whose upstream caller remains disabled; see answer 6. |
| **High** | **10.3 — target/minifier defaults recorded** | A document can accurately repeat the configured strings while the emitted output no longer reflects them, or while the stated browser contract was inferred from documentation rather than diffing output. Criterion 10.3 checks a record, not emitted syntax/helper counts or a target-browser execution. `docs/prd/phase-10-ship.md:59`; `docs/lessons/phase-10-ship.md:11-17`; plan `:133-146`. |
| **High** | **10.4 — size change explained** | Raw/gzip movement can be “explained” while the actual cause is deletion of a production path or inclusion of compressible dev code. Vault 10.2 calls the ratio a discriminator, not proof of causation. `docs/lessons/phase-10-ship.md:15-17`; `docs/prd/phase-10-ship.md:60`. |
| **High** | **10.5 — build config typechecked separately** | `tsconfig.build.json` can typecheck `vite.config.ts` while validating neither Vercel’s JSON schema nor whether Vite actually resolved and applied the intended config. The plan’s program also omits the Node-types and plugin-directory halves of the cited vault item. `docs/lessons/phase-10-ship.md:18-20`; plan `:148-151`. |
| **High** | **10.6 — CSP verified locally** | Vite preview applies `preview.headers` directly to every static response and HTML fallback. `node_modules/vite/dist/node/chunks/node.js:25616-25620,35699-35707`. That proves the header value works under Vite; it does not exercise Vercel’s `headers[].source` matching, routing, CDN/edge layer, or remote build result. The plan itself represents Vercel’s configuration as a routed `source` rule and then reduces it to a flat Vite header object. Plan `:110-146`. A `securitypolicyviolation` listener installed after navigation would also miss initial-document violations; the plan does not specify listener-before-navigation ordering. Plan `:180-183`. |
| **High** | **10.7 — history clean of secrets** | A textual `git log --all -p` sweep can miss a secret embedded in a binary, encoded under an unrecognised format, or present only in unreachable objects/reflogs. The plan records extension-based absence but no complete detection oracle. `docs/prd/phase-10-ship.md:63`; plan `:47,186-205`. |
| **High** | **10.8 — code/assets licences split** | The plan scopes MIT to `src/`, `tests/`, and `tools/`, leaving root code/configuration such as `vite.config.ts`, `playwright.config.ts`, and `index.html` outside that stated code licence. The two documents can exist while the repository is not actually partitioned cleanly. Plan `:15-17,153-159`; `vite.config.ts:1-19`; `playwright.config.ts:1-5`; `index.html:1-7`. |
| **Blocker** | **10.9 — reproducible asset rebuild** | Fresh clone → build merely copies already-committed `public/assets` into `dist`; it never fetches `_generated/` or runs the raw→sheet generator. It therefore passes when the actual asset rebuild is impossible. `docs/ASSET-PIPELINE.md:401-419`; `.gitignore:11-14`; `package.json:6-20`; plan `:23-27`. |
| **High** | **10.10 — specs 01–10 green** | A positive overall count does not prove the Phase 10 spec was selected. The plan does not explicitly give `chromium-prod` a `testMatch`; without one, that project runs every spec, while with an incorrect one the other projects’ many tests can provide a reassuring nonzero total. Current configuration explicitly warns that matching neither project is a zero-test false green. `playwright.config.ts:111-130,161-170,196-201`; plan `:161-166,237-250`. |
| **Blocker** | **10.11 — every prior criterion reverified** | Phase 4 is not complete: PRD records 4.27 as open because `anchorGate.mjs` is not wired into any normal asset command. Yet the plan begins with the false premise that Phases 1–9 are all green. `docs/PRD.md:30,36`; `docs/prd/phase-04-art.md:145-147,184-187`; plan `:5,31-32`. A full unit/e2e run cannot turn that unrun production-pipeline criterion green. |
| **Blocker** | **10.12 — production full playthrough** | The prescribed `levelDriver.ts` immediately reads `window.__phaserGame` and later reads `scene.simWorld.completed`; the production test simultaneously requires `__phaserGame` to be absent. The playthrough cannot run against the claimed substrate. `tests/e2e/levelDriver.ts:45-49,107-145`; plan `:175-177,219-227`. Even if adapted, pre-seeding `unlockAll()` bypasses natural unlock/save progression. Plan `:224-225`. |
| **High** | **10.13 — every recorded finding swept** | A suffix glob for `*-plan.md` misses the split Phase 5 records `phase-05-plan-r1-r2.md`, `-r3-r5.md`, and `-r6-r8.md`; one of those contains the asset-fetch warning now at issue. `docs/reviews/phase-05-plan.md:10-23`; `docs/reviews/phase-05-plan-r1-r2.md:222-226`; plan `:211-217`. |
| **Medium** | **10.14/10.15 — reviews ran** | These criteria permit a material finding to be merely “recorded” rather than fixed. Thus both review rows can be green while the implementation remains intentionally defective; only the separate substantive criteria prevent shipment. `docs/prd/phase-10-ship.md:69-71`; `docs/PRD.md:219-229`. |

3. Cited vault items the plan does not satisfy

- **Blocker — vault 10.9.** The vault requires a reproducible asset rebuild from a fresh clone. The plan amends this into reproducibility of Vite copying tracked, already-built assets. The repository’s own rebuild contract says the real sequence begins by re-fetching raw model output, then running `assets:build`, with byte-identical generated PNGs as success. `docs/lessons/phase-10-ship.md:41-43`; `docs/ASSET-PIPELINE.md:401-419`; plan `:23-27,74-82`. This is challenge **(c)**: the scoping is not honest as closure of 10.9; it proves a weaker deployment-copy property.

- **High — vault 10.3.** It requires the config program “with Node types” and inclusion of the plugin directory in the test include list. The plan explicitly avoids Node types and includes only `vite.config.ts` and `vercel.json`; it satisfies only the separate-program fragment. `docs/lessons/phase-10-ship.md:18-20`; plan `:43,148-151`.

- **High, unverified — vault 10.4 rollback rehearsal.** The plan proposes two preview deployments and a rollback between them, while the vault warning concerns the production deployment that moves the domain. Nothing inspected proves a preview-only exercise rehearses the production alias/domain rollback path. `docs/lessons/phase-10-ship.md:21-24`; plan `:258-274`.

4. Dependencies no earlier phase produces

- **Blocker — a production-safe completion/terminal seam.** Earlier phases produce only dev-only `window.__game` and `window.__phaserGame`; both must be absent from `dist`. `docs/PRD.md:405-433`; `src/debug/globals.ts:105-130`; `src/main.ts:9-18`. The plan’s production playthrough depends on `levelDriver.ts`, which requires `__phaserGame`, so no earlier phase produces the observation surface that Step 4/10.12 assumes. `tests/e2e/levelDriver.ts:45-49,107-145`; plan `:175-177,219-227`.

- **Blocker — a completed prior-phase gate set.** Phase 10 gates on “everything,” but Phase 4 still supplies no normal-pipeline execution of criterion 4.27. `docs/PRD.md:30,36`; `docs/prd/phase-04-art.md:145-147,184-187`.

- **High — a clean-clone raw-asset recovery command.** `_generated/` is absent by default and neither `assets:fetch` nor `assets:verify` exists. `docs/ASSET-PIPELINE.md:403-419`; `.gitignore:11-14`; `package.json:6-20`.

5. Single most likely subtle shipment

**High — dev-only implementation bytes ship while every visible dev affordance appears absent.**

This is more likely than a visibly reachable Playground because the repository already measured exactly this false green: remove the `updateDebugState` guard and the minified bundle contains production per-tick debug-state mutation while `verify-dist` says OK. `tools/gen/verify-dist.mjs:66-84`. The plan’s added behaviour checks cover P/O/G and several query parameters, but omit the N/K fixture keys and `?tune=1`; they also cannot detect an unreferenced dev module that contributes bundled bytes without a stable grep string. `src/scenes/gameInput.ts:147-165`; `src/scenes/gameDev.ts:72-98`; plan `:175-180`.

6. Every `import.meta.env.DEV` occurrence and whether planned 10.2 catches it

The claimed “35 sites” is already misleading: **14 are comments and only 21 are executable guards.** The census counts any line containing the text, including comments. `tests/unit/dev-guard-census.test.ts:54-71,93-100`.

Legend:

- **Yes** — removing this guard emits a stable tell checked by `verify-dist`: quoted scene key, `__game`, `__phaserGame`, `URLSearchParams`, or enumerated prose. `tools/gen/verify-dist.mjs:102-159`.
- **No** — the body can survive under a minified name, is unreachable because another guard remains, or has no stable tell. The known representative miss is measured at `tools/gen/verify-dist.mjs:66-84`.
- **N/A** — comment-only occurrence; not a seam at all.

Ranked by player visibility/exploitability:

| Rank | Site | Seam | 10.2 catches it? |
|---|---|---|---|
| 1 | `src/game/config.ts:60` | Registers Playground, Element Editor, and Gym in production | **Yes** — quoted scene keys; this exact mutation was measured red. `tools/gen/verify-dist.mjs:72-74,106-110`. |
| 2 | `src/scenes/gameDev.ts:197` | Starts a dev scene | **Yes** — removing it retains the scene-key literals passed by `GameScene`. `src/scenes/GameScene.ts:362-371`. |
| 3 | `src/main.ts:16` | Publishes writable `window.__phaserGame` | **Yes** — exact global plus runtime `undefined` assertion. `src/main.ts:16-18`; plan `:175-177`. |
| 4 | `src/debug/globals.ts:114` | Publishes `window.__game` | **Yes** — exact global plus runtime assertion. `src/debug/globals.ts:113-130`; plan `:175-177`. |
| 5 | `src/scenes/gameInput.ts:150` | Binds P/O/G/N/K | **No, in isolation.** `GameScene` still passes `dev = undefined`, so removing only this DEV conjunct changes nothing observable. `src/scenes/GameScene.ts:311-325`. |
| 6 | `src/scenes/GameScene.ts:312` | Constructs the dev action object | **No, in isolation.** `gameInput.ts`’s own production guard still refuses the object. `src/scenes/gameInput.ts:147-165`. |
| 7 | `src/scenes/gameDev.ts:204` | N-key worst-case fleet spawn | **No.** The body has no quoted scene key or query parser, `spawnDevFleet` is not in the verifier list, and N is absent from the production test plan. `src/scenes/gameDev.ts:202-212`; `tools/gen/verify-dist.mjs:113-137`; plan `:177-180`. |
| 8 | `src/scenes/gameDev.ts:217` | K-key low-HP enemy spawn | **No reliably.** `spawnDevEnemies` is listed, but prior review already established bare identifiers are renamed by minification; K is not tested. `src/scenes/gameDev.ts:215-224`; `docs/reviews/phase-05-impl.md:165-171`; plan `:177-180`. |
| 9 | `src/scenes/gameDev.ts:79` | `?tune=1` and `?probe=1` overlays | **Yes by grep** through `URLSearchParams`; behaviour coverage is incomplete because the plan tests `?probe` but omits `?tune`. `src/scenes/gameDev.ts:72-98`; plan `:179`. |
| 10 | `src/scenes/gameDev.ts:126` | Player-visible P/O/G help suffix | **Yes** — explicit `p play`, `o editor`, and ` gym` prose patterns. `src/scenes/gameDev.ts:118-128`; `tools/gen/verify-dist.mjs:149-158`. |
| 11 | `src/scenes/BootScene.ts:219` | Stops the three dev scenes during refusal | **Yes** — quoted scene keys. `src/scenes/BootScene.ts:219-223`. |
| 12 | `src/scenes/bootAssets.ts:104` | `?breakAsset=corrupt` | **Yes** — `URLSearchParams`; also named behaviourally. `src/scenes/bootAssets.ts:103-109`; plan `:179`. |
| 13 | `src/scenes/BootScene.ts:240` | `?breakAsset=catalog` | **Yes** — `URLSearchParams`; also named behaviourally. `src/scenes/BootScene.ts:239-245`; plan `:179`. |
| 14 | `src/scenes/BootScene.ts:256` | `?breakFilter=1` | **Yes** — `URLSearchParams`; also named behaviourally. `src/scenes/BootScene.ts:255-261`; plan `:179`. |
| 15 | `src/scenes/gameLevelPick.ts:250` | `?hitstop=N` gameplay mutation | **Yes** — `URLSearchParams`; also named behaviourally. `src/scenes/gameLevelPick.ts:249-264`; plan `:179`. |
| 16 | `src/game/audio.ts:225` | `?perfMutation=cue-stall` main-thread stall | **Yes by grep.** The behavioural “no effect” still needs the exact `cue-stall` input and a timing oracle; unchanged pixels are insufficient. `src/game/audio.ts:224-234`; plan `:179`. |
| 17 | `src/scenes/gamePlayerDraw.ts:164` | `?feel=` animation-rate override | **Yes** — removing it retains `URLSearchParams`. `src/scenes/gamePlayerDraw.ts:163-180`; `src/game/feelVariants.ts:87-90`. |
| 18 | `src/scenes/gamePlayerDraw.ts:204` | `?feel=` movement-speed override | **Yes** — same stable parser tell. `src/scenes/gamePlayerDraw.ts:203-213`. |
| 19 | `src/scenes/gamePlayerDraw.ts:157` | Per-frame feel-tuner callback | **No, in isolation.** `feelTuner` remains undefined because `attachDevOverlays` is still guarded. `src/scenes/gamePlayerDraw.ts:155-159`; `src/scenes/GameScene.ts:198-203`. |
| 20 | `src/scenes/GameScene.ts:304` | Passes the feel tuner into drawing | **No, in isolation.** The upstream overlay factory still returns `{}`. `src/scenes/GameScene.ts:301-307`; `src/scenes/gameDev.ts:78-81`. |
| 21 | `src/debug/globals.ts:70` | Per-tick debug-state mutation | **No — measured miss.** `src/debug/globals.ts:69-74`; `tools/gen/verify-dist.mjs:72-84`. |
| 22 | `src/debug/globals.ts:5` | Comment describing the seam | **N/A.** |
| 23 | `src/game/config.ts:45` | Comment describing scene gating | **N/A.** |
| 24 | `src/game/feelVariants.ts:32` | Comment describing caller gating | **N/A.** |
| 25 | `src/main.ts:10` | Comment describing `__phaserGame` gating | **N/A.** |
| 26 | `src/scenes/ElementEditorScene.ts:30` | Comment reference | **N/A.** |
| 27 | `src/scenes/ElementEditorScene.ts:31` | Second comment reference | **N/A.** |
| 28 | `src/scenes/gameDev.ts:17` | Comment reference | **N/A.** |
| 29 | `src/scenes/gameDev.ts:105` | Comment reference | **N/A.** |
| 30 | `src/scenes/gameInput.ts:30` | Comment reference | **N/A.** |
| 31 | `src/scenes/gamePlayerDraw.ts:12` | Comment reference | **N/A.** |
| 32 | `src/scenes/GymScene.ts:36` | Comment reference | **N/A.** |
| 33 | `src/scenes/GymScene.ts:37` | Second comment reference | **N/A.** |
| 34 | `src/sim/hitstop.ts:83` | Comment reference | **N/A.** |
| 35 | `src/sim/types.ts:317` | Comment reference | **N/A.** |

Additional seams outside the 35:

- **High — dev scene modules are imported statically:** `PlaygroundScene`, `ElementEditorScene`, and `GymScene`. `src/game/config.ts:1-8`. Criterion 10.2 detects them only if a stable scene key/class/prose string survives. It does not prove that each module contributed zero rendered bytes, which is the exact unreferenced-but-bundled case in the question.

- **High — dev helper modules have no direct production guard:** `devFeelTuner`, `devMotionProbe`, and `devSpawn` are imported by `gameDev.ts`; their isolation relies on guarded consumers and tree-shaking. `src/scenes/gameDev.ts:29-37`. Of these, `devSpawn` and most of the tuner have no verifier-stable string.

- **Medium — Gym’s support graph is guarded only through the Gym root:** `gymBounds`, `gymEdits`, `gymConfigLoader`, `gymGeometry`, `gymPixels`, and `gymKeys`. `src/scenes/GymScene.ts:2-24`. A grep for `Gym` can show the scene key is gone without proving all helper bytes are absent.

- **High — planned behavioural coverage omits two actual affordances:** `?tune=1`, and the N/K fixture keys. `src/scenes/gameDev.ts:72-98`; `src/scenes/gameInput.ts:154-165`; plan `:177-180`.

- **High — the census is not a per-seam proof.** Fourteen comments contribute to its “35” count, while its body check is a total heuristic over brace blocks and explicitly does not count ternaries/type positions. A removed executable guard can be offset by another matching line or body-count movement. `tests/unit/dev-guard-census.test.ts:93-115,135-167,238-251`.

7. Earlier warning recorded, not fixed, and now shipping

**Blocker — the clean-clone asset workflow.**

The Phase 5 plan review explicitly warned that `assets:fetch` and `assets:verify` were independently binding Phase 4 debt and “should not be mistaken for optional scope.” `docs/reviews/phase-05-plan-r1-r2.md:222-226`. Phase 4’s later contract records that neither command exists and that implementing them is what would make a clean-clone rebuild real. `docs/prd/phase-04-art.md:164-168`; `docs/ASSET-PIPELINE.md:403-419`. The Phase 10 plan now knowingly ships without them and relabels copying committed assets as 10.9. Plan `:23-27,74-82`.

The production cost is not immediate missing pixels; it is that the public repository cannot reconstruct its shipped art from the recorded provenance. Because the raw clips are the only byte-stable inputs and the generator is not seed-deterministic, losing those external files freezes the asset set at its current packing and makes future repair/re-audit impossible from a clone. `docs/prd/phase-04-art.md:151-168`.

A second warning remains relevant to 10.2: Phase 5 recorded that `verify-dist` checks a fixed list and does not cover a new symbol until edited. `docs/reviews/phase-05-plan-r3-r5.md:218-226`. The current verifier still has those literal lists and already documents one measured false green. `tools/gen/verify-dist.mjs:66-84,102-159`.

Targeted challenges:

- **(a) Blocker — pixel readback is not a terminal condition.** It proves “a frame was drawn,” not “the loop remains alive.” A game can draw once, throw, leave the pixels resident, and satisfy every later readback poll. Plan `:168-173`; compare the explicit positive/negative/hang terminal contract at `src/debug/globals.ts:33-46`.

- **(b) High — Vite preview does apply the configured headers, but it is not Vercel edge.** Vite sets `preview.headers` directly on assets and HTML. `node_modules/vite/dist/node/chunks/node.js:25616-25620,35699-35707`. That local pass cannot validate Vercel route matching or the remotely rebuilt artifact; the plan’s later `curl` against the actual preview is therefore the first production-relevant header check, not the local PASS. Plan `:110-146,265-272`.

- **(c) Blocker — 10.9 is weakened, not discharged.** Fresh-clone Vite output equality proves tracked-input deployment determinism. It does not run the asset generator or prove tracked frame picks rebuild the shipped sheets. `docs/lessons/phase-04-art.md:71-78`; `docs/ASSET-PIPELINE.md:401-419`; plan `:23-27`.

- **(d) Blocker — the regex/server plan is incomplete.** Merely ignoring `phase-10-` in `chromium` does not constrain `chromium-prod`; the plan states no production-project `testMatch`. Without it, every older spec also runs against production. The new port also lacks the existing 5173 cleanup/in-process-server protection: `test:e2e` frees only 5173, and the current configuration documents why a shell-launched Vite process can survive and make the next run collect zero tests. `package.json:18`; `playwright.config.ts:221-241`; `tools/dev/e2e-server.mjs:1-39`; plan `:161-166`. Global setup reads only the first project’s baseURL and waits on `__game`, so it neither warms nor validates port 4173; if project order changes, it fails outright against production where `__game` is absent. `tests/e2e/globalSetup.ts:67-100`.

- **(e) High — refusing a ninth `window.__game` field is correct; the stated reason for refusing every production readiness signal is not.** The Phase 1 ruling closes only the eight-field, dev-only `window.__game` surface. `docs/PRD.md:405-433`; `CLAUDE.md:121-143`. A production signal would not automatically be a ninth `__game` field. The pixel substitute is materially weaker because it has no liveness semantics, and the planned full-play driver cannot compensate because it uses the stripped `__phaserGame` seam. `tests/e2e/levelDriver.ts:45-49,107-145`; plan `:168-177,219-227`.

Could not check: per instruction I used no shell and modified nothing. I could not run Git, typecheck, Vitest, the build, Playwright, Chromium, Vercel CLI, a deployment, gzip measurements, mutations, or inspect actual served Vercel headers. All runtime outcomes above are source-level constructions or previously recorded repository measurements. Every file in `docs/reviews/` was read through `fs.readFileSync`, including all Phase 1–9 plan records and Phase 5’s split plan files.

VERDICT: REVISE
---

## Round 2 — Codex, verbatim

The revision resolves two blockers, partially resolves readiness, and only escalates—not resolves—10.11 and 10.9. Material false-green paths remain.

## 1. Status of the five blockers

| Severity | Blocker | Status | Finding |
|---|---|---|---|
| Critical | (a)/(e) production readiness | **Partially resolved** | The exact “draw once, throw, frozen pixels” failure is now caught by pre-navigation error listeners plus a changing hash. But the replacement still does not prove simulation or completion; see §2. The plan overstates browser rAF as proving “the loop” is alive even though it explicitly runs independently of the game (`execute-phase-10-build-steady-meteor.md:181-193`). |
| High | 10.12 `levelDriver` against `dist/` | **Resolved** | The plan now correctly limits `levelDriver` to the dev build and uses real keyboard input for production (`execute-phase-10-build-steady-meteor.md:238-246`). That matches the driver’s reliance on `__phaserGame` and `scene.simWorld` (`tests/e2e/levelDriver.ts:45-49`, `tests/e2e/levelDriver.ts:107-145`). |
| High | (d) production Playwright project/server | **Resolved as a plan** | `chromium-prod` has an exact `testMatch`, is excluded from the ordinary Chromium project, uses an in-process server, frees 4173, and is kept away from project index zero (`execute-phase-10-build-steady-meteor.md:127-141`, `execute-phase-10-build-steady-meteor.md:171-179`). That addresses the repository’s explicit zero-selection warning (`playwright.config.ts:196-201`) and its existing shell-orphan warning (`playwright.config.ts:221-241`). |
| Critical | 10.11 prior-phase re-verification | **Only reworded/escalated** | Ruling A still recommends reporting 10.11 green while 4.27 remains unrun (`execute-phase-10-build-steady-meteor.md:35-40`). That contradicts criterion 10.11’s word “Every” (`docs/prd/phase-10-ship.md:67`) and the plan’s own rule that an unrun criterion means the phase is failing (`execute-phase-10-build-steady-meteor.md:319-325`). |
| Critical | 10.9 reproducible assets | **Only reworded/escalated** | Ruling C explicitly recommends shipping the weaker scope despite the missing reconstruction path (`execute-phase-10-build-steady-meteor.md:41`). Criterion 10.9 still says “Asset rebuild from a fresh clone,” not merely rebuilding committed outputs (`docs/prd/phase-10-ship.md:65`). The previously recorded warning said the missing fetch/verify path was binding, not optional (`docs/reviews/phase-05-plan-r1-r2.md:222-226`). |

So: **2 resolved, 1 partial, 2 unresolved.**

## 2. The four readiness signals still admit a false green

**Critical — a dead simulation can satisfy the first three signals.**

Concrete state:

1. `GameScene.create()` succeeds and starts the player’s animation.
2. The simulation/input portion of `GameScene.update()` subsequently stops advancing—for example, a caught failure or an incorrect early return. No uncaught `pageerror` or console error occurs.
3. The document’s injected rAF continues because it is independent of Phaser, exactly as the plan says (`execute-phase-10-build-steady-meteor.md:186-190`).
4. Phaser’s animation manager continues advancing looped idle frames. The game registers animations with `repeat: -1` for looping sheets (`src/scenes/gameAnimations.ts:47-55`), starts the player animation during scene creation (`src/scenes/GameScene.ts:175-181`), and the shipped courier idle sheet is explicitly looped at 7.5 fps (`public/assets/index.json:62-69`).
5. Therefore the canvas hash keeps changing even though simulation, input consumption, or progression is dead.

The hash proves that some rendered pixels change. It does not prove the fixed-tick simulation or production controls are advancing.

**Critical — the localStorage oracle is not specified precisely enough.**

The plan merely names the key as “the completion oracle” and says it advances level by level (`execute-phase-10-build-steady-meteor.md:191-193`, `execute-phase-10-build-steady-meteor.md:242-244`). But this repository writes that save on initial level entry, before anything is completed: the existing Phase 8 test records `lastLevel: 'level-01'` while `levels` remains empty (`tests/e2e/phase-08-progress.spec.ts:161-168`).

Therefore either of these implementations goes green without completing a level:

- Waiting for the key to exist.
- Waiting for its serialized value to change from absent to present.

A stale or prematurely written `levels[levelId].completed: true` also passes unless the test establishes a known-uncompleted baseline and observes the exact false-to-true transition after input. The revised plan does not state that predicate.

**High — the negative DEV-input checks lack activation ordering.**

The plan asserts that P/O/G/N/K and the query flags “have no effect,” but gives no production-observable discriminator or ordering (`execute-phase-10-build-steady-meteor.md:200-204`). A keypress issued before `bindKeys` reaches its guarded registration passes even if the bindings leaked; those bindings are installed only inside the later input setup (`src/scenes/gameInput.ts:147-165`). Likewise, `?tune=1` and `?probe=1` are read during overlay attachment, so applying them after scene creation proves nothing (`src/scenes/gameDev.ts:78-98`).

Thus the four signals fix the original one-frame crash case, but are not sufficient as currently specified.

## 3. Vite 8 `generateBundle` zero-byte gate

**Yes, it can be written, and yes, it can go red.**

This checkout uses Vite 8.2.0 (`package.json:22-27`). Vite 8’s plugin type extends Rolldown’s plugin surface (`node_modules/vite/dist/node/index.d.ts:2879`), and the installed Rolldown declarations expose:

- A `generateBundle` hook receiving the output bundle (`node_modules/rolldown/dist/shared/define-config-DVsXPNaU.d.mts:3095-3098`).
- `OutputChunk.modules[id]` (`node_modules/rolldown/dist/shared/define-config-DVsXPNaU.d.mts:209-224`).
- Per-module `renderedLength` and rendered code (`node_modules/rolldown/dist/shared/define-config-DVsXPNaU.d.mts:153-169`).

A watched DEV-only module becoming reachable can therefore make the build fail. Removing the production scene-roster guard, for example, makes the statically imported Playground/Editor/Gym modules reachable (`src/game/config.ts:1-8`, `src/game/config.ts:60-62`).

**High — the plan still omits the gate’s authoritative module roster.**

That matters because `gameDev.ts` calls itself entirely DEV-only (`src/scenes/gameDev.ts:1-18`) but contains production help text and rendering code (`src/scenes/gameDev.ts:104-128`, `src/scenes/gameDev.ts:143-166`). Requiring that whole module to contribute zero bytes would reject a correct production bundle. Omitting or misspelling a watched module, conversely, can vacuously report zero.

The proposed gate is technically valid, but `execute-phase-10-build-steady-meteor.md:153-162` must identify which module IDs are required to be zero and which mixed modules remain covered by the other gates. Its red mutation must name the guard being removed; the current generic instruction does not prove the intended roster was exercised (`execute-phase-10-build-steady-meteor.md:255-258`).

## 4. New defects introduced by the revision

1. **Critical — `steampunk.progress` is treated as a completion event even though it is also written on level entry.** This is the most likely new false green (`execute-phase-10-build-steady-meteor.md:191-193`; `tests/e2e/phase-08-progress.spec.ts:161-168`).

2. **High — canvas activity is conflated with simulation activity.** Looping authored animations can keep the hash changing while the fixed-tick game or input path is stalled (`execute-phase-10-build-steady-meteor.md:188-190`; `src/scenes/gameAnimations.ts:47-55`; `public/assets/index.json:62-69`).

3. **High — T8 has no explicit watched-module inventory despite a misleading mixed module.** This can produce either a permanent false red or a vacuous green (`execute-phase-10-build-steady-meteor.md:153-162`; `src/scenes/gameDev.ts:104-166`).

4. **High — the new production negative-input assertions have no stated discriminator or readiness ordering.** Pressing keys before registration, or evaluating query flags after scene creation, passes even when the corresponding seam is present (`execute-phase-10-build-steady-meteor.md:200-204`; `src/scenes/gameInput.ts:147-165`; `src/scenes/gameDev.ts:78-98`).

5. **Medium — the plan remains internally contradictory about 10.11.** It recommends a green exception in ruling A but defines any unrun criterion as a failing phase (`execute-phase-10-build-steady-meteor.md:39`, `execute-phase-10-build-steady-meteor.md:321-325`).

## Could not check

I did not execute Vite, Playwright, the build, or any mutation run; this is a static plan and installed-type-surface review. I did not re-read every Phase 1–9 plan-review file during this revision pass; I checked the specific Phase 5 warning cited by ruling C and the directly affected current files. No files were modified, and no shell tool was used.

VERDICT: REVISE
---

## Round 3 — Codex, verbatim

Round 3 fixes two of the four named defects, partially fixes one, and fixes the narrow `gameDev.ts` classification while introducing a critical T8 coverage hole elsewhere.

## 1. Status of the four Round-2 defects

| Severity | Defect | Status |
|---|---|---|
| High | Canvas activity mistaken for simulation | **Partially fixed.** rAF and canvas hashes are now honestly demoted, but the new RIGHT/world-scroll discriminator still admits a dead-sim false green (`execute-phase-10-build-steady-meteor.md:200-218`). |
| Medium | Progress existence/change used as completion | **Fixed for the original false green.** The exact per-level false-to-true predicate excludes the entry write and stale completion (`execute-phase-10-build-steady-meteor.md:220-228`). It still does not prove the post-write completion flow; see §3. |
| Critical | `gameDev.ts` would cause a permanent zero-byte false red | **The specific classification is fixed.** `gameDev.ts` is correctly excluded because it contains shipped help/banner code (`execute-phase-10-build-steady-meteor.md:166-177`; `src/scenes/gameDev.ts:112-166`). However, the revised roster now excludes `globals.ts`, reopening T8’s motivating miss; see §4. |
| High | 10.11 internally recommended green and failing simultaneously | **Fixed.** The default is consistently FAILING in both ruling A and Definition of Done (`execute-phase-10-build-steady-meteor.md:39`, `execute-phase-10-build-steady-meteor.md:370-378`). One owner option is still mislabeled; see §5. |

## 2. Does the RIGHT-key world-scroll discriminator work?

**In a healthy steady-state run, yes. As written, it can still go green after the sim has died.**

The intended causal path is real:

- RIGHT is a production binding (`src/scenes/gameInput.ts:75-78`) and is sampled into the input snapshot (`src/scenes/gameInput.ts:183-198`).
- The simulation applies horizontal movement and integrates `player.x` (`src/sim/playerMotion.ts:111-124`, `src/sim/playerMotion.ts:173-177`).
- The camera follows the rendered player with horizontal lerp 0.12 (`src/render/cameraRig.ts:28-32`; `src/scenes/GameScene.ts:205-210`).
- Parallax texture offset changes only from camera `scrollX` (`src/scenes/gameParallax.ts:35-44`).

But there are two unaddressed boundary cases.

**High — camera settling can produce a dead-sim false green.**

Phaser does not snap the camera to the player. Each frame it linearly interpolates existing `scrollX` toward the static follow target (`node_modules/phaser/src/cameras/2d/Camera.js:553-583`). Therefore:

1. RIGHT moves the player for some ticks.
2. The simulation then silently stops.
3. The player sprite remains at its last advanced position.
4. The camera continues settling toward that stationary position.
5. `scrollX` changes, and `renderParallax` changes the sampled region.

A single “region changed while RIGHT was held” window can therefore pass while no simulation tick occurred during part—or potentially most—of that window.

**Medium — the initial camera clamp can produce a healthy-sim false red.**

The viewport is 1920 pixels wide at zoom 1 (`src/game/constants.ts:47-58`), while level 01 spawns the player at x=624 (`public/assets/levels/level-01.tmj:2340-2357`). Phaser centers on half the viewport and then clamps to bounds (`node_modules/phaser/src/cameras/2d/Camera.js:580-597`), so horizontal scroll stays at zero until the player moves roughly past x=960. A short or unspecified sampling window sees no world movement even though the sim is correctly advancing.

The plan names neither a camera-travel threshold nor a sustained-motion predicate, and its red-proof section still tests only a frozen browser rAF rather than a dead sim (`execute-phase-10-build-steady-meteor.md:306-309`).

## 3. Remaining completion-predicate false green

The stated predicate is now strong evidence that this level’s `levelCompleted` event reached persistence:

- Completion handling runs from the `levelCompleted` edge (`src/scenes/gameComplete.ts:61-69`, `src/scenes/gameComplete.ts:174-187`).
- It records the specific level and writes it to storage (`src/scenes/gameComplete.ts:69-80`).

That fixes the entry-write defect.

**High — persistence precedes the visible and navigable completion flow.**

The save is written before the overlay is built and before ENTER is bound (`src/scenes/gameComplete.ts:75-87`). In particular, `ctx.ui?.levelComplete(...)` silently does nothing when the parallel UI scene is unavailable, while the completion bit remains true (`src/scenes/gameComplete.ts:53-54`, `src/scenes/gameComplete.ts:79-87`).

Therefore the predicate can pass with:

- No completion overlay.
- A silently absent UI scene.
- On the final level, a broken terminal presentation after persistence, with no later level predicate available to expose it.

So the predicate is valid for “completion was persisted,” but the plan overstates it as the complete liveness/playthrough proof (`execute-phase-10-build-steady-meteor.md:225-228`). The hands-on half remains necessary, as the plan itself acknowledges (`execute-phase-10-build-steady-meteor.md:299-302`).

## 4. New defects introduced

### Critical — T8 explicitly excludes the module containing its measured miss

The plan motivates T8 with this exact failure: remove `updateDebugState`’s guard, ship `Object.assign(state, patch)`, and existing verification remains green (`execute-phase-10-build-steady-meteor.md:153-159`). But its new roster classifies `globals.ts` as mixed and assigns it only to `__game` symbol/runtime checks (`execute-phase-10-build-steady-meteor.md:172-177`).

Those are the checks the motivating mutation already defeats.

`globals.ts` explicitly says the entire seam is DEV-only and warns that guarding only the installer leaves the state machine in production (`src/debug/globals.ts:1-9`). Its `updateDebugState` body is precisely the guarded leak (`src/debug/globals.ts:61-74`).

Consequently, the revised T8 gate can go green on the exact `updateDebugState` mutation the plan says T8 exists to catch.

### High — the new sim discriminator is not watched red against a dead sim

The new criterion distinguishes browser painting from simulating (`execute-phase-10-build-steady-meteor.md:207-218`), but verification still mutates only rAF (`execute-phase-10-build-steady-meteor.md:306-309`). Freezing rAF validates signal 2, not signal 4. It does not demonstrate that a region test rejects “Phaser animates and the camera settles while fixed ticks stop.”

### High — negative query discriminators are still absent, and key discriminators remain ambiguous

The plan lists seven query flags and their correct navigation ordering, but supplies no positive discriminator for any of them (`execute-phase-10-build-steady-meteor.md:242-245`). The only named discriminators are for P/O/G/N/K (`execute-phase-10-build-steady-meteor.md:249-251`).

P/O/G’s proposed “whole canvas changes” is itself non-discriminating: the plan has just established that the whole canvas changes continuously from idle animation (`execute-phase-10-build-steady-meteor.md:200-214`). Likewise, “enemy region changes” needs a region whose normal animated enemies cannot already satisfy it. Watching a DEV run fail is valuable, but it does not define what production observation distinguishes the seam from ordinary animation.

### Medium — the camera discriminator’s claimed causality is too strong

“Tilemap and parallax only shift if the sim advanced the player” is not true for the observation window: camera interpolation can continue shifting them after the sim stops (`execute-phase-10-build-steady-meteor.md:215-218`; `node_modules/phaser/src/cameras/2d/Camera.js:553-583`).

## 5. Owner rulings A and C

**Ruling A: default is accurate; the first alternative is misrepresented.**

Reporting 10.11 failing is faithful to the current criterion, which requires every prior phase’s acceptance criteria to be reverified (`docs/prd/phase-10-ship.md:67`).

But “rule that 4.27 is accepted carried debt and 10.11 is green over 1–3 and 5–9” is not a way to satisfy 10.11 as written (`execute-phase-10-build-steady-meteor.md:39`). It is an owner waiver or amendment of 10.11. Calling the unchanged criterion green would still misreport “every.”

Authorizing and running the anchor gate is the option that actually addresses the open criterion, whose subject is measuring the anchor’s contact geometry before generation (`docs/prd/phase-04-art.md:147`).

**Ruling C: the production cost is accurately stated, but “10.9 stands” is not.**

The plan accurately tells the owner that the missing fetch/verify path prevents reconstructing the art and cites the recorded warning (`execute-phase-10-build-steady-meteor.md:41`). That part is not concealed.

However, the current criterion says “Asset rebuild from a fresh clone is byte-identical” (`docs/prd/phase-10-ship.md:65`). Step 1 proposes rewriting that row to the weaker owner scope (`execute-phase-10-build-steady-meteor.md:79-83`). That is an explicit acceptance-criterion amendment, not the existing 10.9 “standing.” If authorized, it may govern the phase, but it should not be presented as satisfying the original criterion.

I performed a static review only: no build, browser run, or mutation was executed. No shell was used and no files were modified.

VERDICT: REVISE
---

## Round 4 — Codex, verbatim

The revision is materially better, but T8 remains an invalid absence oracle and its roster is incomplete.

## Findings, ranked by severity

1. **BLOCKER — T8 Rule 2 can both false-red and false-green.**

`renderedLength` is merely the length of the compiler-attributed rendered code after unused declarations are removed; it carries no meaning about whether those bytes are production or DEV behavior (`node_modules/rolldown/dist/shared/define-config-DVsXPNaU.d.mts:153-169`). Therefore:

- A legitimate production edit, tree-shaking change, minifier change, or dependency update can exceed a pin without leaking a seam. Vite is not exactly pinned in `package.json` (`package.json:24-27`).
- A module can shrink for an unrelated reason and then leak DEV code while remaining under its old ceiling.
- Updating a pin after a legitimate edit can silently bless an existing leak.
- The exact `updateDebugState` mutation proves—at most—that one particular mutation increases one currently attributed length. It does not prove the other module budgets identify DEV bytes (`execute-phase-10-build-steady-meteor.md:189-196`).

The mechanism is implementable: Vite’s plugin interface extends Rolldown’s (`node_modules/vite/dist/node/index.d.ts:2879`), `generateBundle` is exposed (`node_modules/rolldown/dist/shared/define-config-DVsXPNaU.d.mts:3087-3098`), and each output chunk supplies per-module `renderedLength` (`node_modules/rolldown/dist/shared/define-config-DVsXPNaU.d.mts:209-224`). The semantic claim is the problem, not API availability.

2. **BLOCKER — the T8 roster is still incomplete.**

Rule 2 omits two files containing executable DEV guards:

- `src/main.ts:16`
- `src/scenes/GameScene.ts:304,312`

It also omits the wholly dev-only `enemyTuning.ts`, imported by Playground at `src/scenes/PlaygroundScene.ts:4`, from Rule 1’s dev-only helper roster (`execute-phase-10-build-steady-meteor.md:181-192`).

The Rule 1 red mutation does not exercise every named entry either. Removing `config.ts:60` makes the three scenes reachable, and the plan explicitly expects red only on those scene IDs (`execute-phase-10-build-steady-meteor.md:185-187`). It does not unfold the guards around `devFeelTuner`, `devMotionProbe`, or `devSpawn`, which enter through `gameDev.ts:31-33` but remain behind `gameDev.ts:79,197-218`. Those assertions can consequently remain misspelled or vacuous without this mutation exposing them—precisely the trap the plan identifies at `execute-phase-10-build-steady-meteor.md:166-167`.

3. **HIGH — the N/K production discriminator cannot be implemented through the stated surface.**

The plan says N/K will be detected through “completion-relevant world state” (`execute-phase-10-build-steady-meteor.md:276-280`). But the same plan asserts `__phaserGame` is absent in production (`execute-phase-10-build-steady-meteor.md:262-264`) and correctly states that `scene.simWorld` is inaccessible from `dist/` (`execute-phase-10-build-steady-meteor.md:325-327`). No production-readable enemy count is named. As written, that assertion has no observation source.

4. **HIGH — the dead-sim mutation fixes the causal target but still violates the binding fixture rule.**

A type-correct dead-sim mutation is possible: `advance()` already returns `AdvanceEvents`, constructs `noEvents()`, and advances only through its loop (`src/sim/advanceSplit.ts:84-97`). Neutering that loop need not break compilation.

However, the plan does not name the exact mutation, and calls a “throwaway local mutation build” an application of the “committed-failing-fixture discipline” (`execute-phase-10-build-steady-meteor.md:251-255`). Those are opposites: C2 says every gate needs a committed fixture (`docs/LESSONS-APPLIED.md:73-76`). The verification list also still says “freeze the rAF loop → liveness poll red” (`execute-phase-10-build-steady-meteor.md:342-345`), contradicting the corrected statement that rAF proves painting, not simulation (`execute-phase-10-build-steady-meteor.md:224-228,251-254`).

5. **MEDIUM — presentation is correctly separated from persistence, but the overlay oracle remains unspecified.**

The false→true persistence predicate is now strong. `recordCompletion` is the only code that writes `completed: true` (`src/game/save.ts:330-346`), and it is reached from the sim’s completion edge through `onLevelCompleted` (`src/sim/tick.ts:297-308`; `src/scenes/gameComplete.ts:61-86`).

But “a separate assertion on the overlay region” does not state what must appear (`execute-phase-10-build-steady-meteor.md:245-249`). A mere hash/change assertion can pass without the overlay because the plan itself establishes that animation and scrolling change pixels (`execute-phase-10-build-steady-meteor.md:228-235`). The persistence overclaim is fixed; the automated presentation check is only reworded unless its positive signature is specified. The hands-on half remains valid coverage.

## Direct answers

1. **Round-3 defects**

- T8/globals hole: **not fixed**; replaced by a noisy byte budget, with an incomplete roster.
- RIGHT/world-scroll overclaim: **fixed** by demotion to smoke evidence.
- Completion persistence overclaim: **fixed** for persistence; overlay verification remains underspecified.
- Dead-sim red proof: **causal target fixed**, but the mutation/fixture discipline is not.
- P/O/G discriminator: **fixed in substance**. Playground and Element Editor call `super.create()` (`src/scenes/PlaygroundScene.ts:82-84`; `src/scenes/ElementEditorScene.ts:60-62`), but `UIScene` stops itself after the real `Game` scene reaches a terminal state (`src/scenes/UIScene.ts:160-186`), so sustained HUD presence distinguishes production from a successful dev-scene switch.
- Owner-waiver language: **substantially fixed**.

2. **T8 Rule 2**

It can be written against Vite 8 and can go red. It is nevertheless not sound as an absence gate, is intrinsically noisy, and the roster is incomplete for the reasons above.

3. **Throwaway mutation build**

A build-preserving sim no-op is possible from the current `advance()` shape (`src/sim/advanceSplit.ts:84-97`). The plan must still verify that the build succeeds and that the named completion and sustained-scroll assertions—not compilation or an unrelated timeout—cause red. It does not satisfy C2’s committed-fixture requirement as currently described.

4. **New defects**

- Missing `main.ts`, `GameScene.ts`, and `enemyTuning.ts` from T8.
- Rule 1’s red mutation does not exercise three named helper assertions.
- N/K has no production observation source.
- The overlay-region assertion lacks a positive discriminator.
- The verification list retains the obsolete frozen-rAF “liveness” claim.
- Minor provenance error: the Round-4 plan still announces “This is round 2” (`execute-phase-10-build-steady-meteor.md:3-5`).

5. **Owner rulings**

Ruling C is now honestly described as an amendment. The underlying warning explicitly called `assets:fetch`/`assets:verify` binding debt (`docs/reviews/phase-05-plan-r1-r2.md:222-226`), `_generated/` is absent from fresh clones (`.gitignore:11-14`), and no fetch script exists (`package.json:6-20`).

Ruling A has one remaining imprecision: authorizing and wiring `anchorGate` is necessary, but does not itself re-verify 4.27. The gate must be executed and pass. `npm run build` does not invoke `assets:build` (`package.json:8,14`), and the plan names no explicit post-wiring command before treating option (i) as satisfying 10.11 (`execute-phase-10-build-steady-meteor.md:39`).

Could not check: I could not execute the proposed in-memory Vite comparison because importing Vite through `node_repl` failed with `Importing module "node:process" is not allowed in node_repl`. Therefore I did not measure whether the exact mutation currently increases `globals.ts` specifically. File access succeeded; no shell was used and no files were modified.

VERDICT: REVISE
---

## Round 5 — Codex, verbatim

Two blockers remain. The Round-4 defects were mostly fixed, but the replacement token oracle and committed mutation mechanism are not yet sound.

## Findings, ranked by severity

1. **BLOCKER — the committed dead-sim mutation has no activation mechanism.**

The compile-safe mutation point is now correctly named, and the expected failing assertions are explicit (`execute-phase-10-build-steady-meteor.md:274-280`). But the plan never specifies:

- The committed mutation’s selector.
- How that selector reaches the production build.
- The command that produces the mutated `dist/`.
- How the selector itself is stripped from the ordinary production build.

The cited precedents do not supply that mechanism. `cue-stall` is explicitly DEV-only and absent from `dist/` (`docs/qa/session-bugfix-perf-gates.md:218-221`; `src/game/audio.ts:224-229`). `scrimN` exists only in the Playwright harness and never enters `src/` (`docs/qa/session-bugfix-perf-gates.md:220-221`; `tests/e2e/scrimMutation.ts:110-121`). Neither is a committed build-time mutation of a production artifact, contrary to the plan’s description (`execute-phase-10-build-steady-meteor.md:279-282`).

As written, the dead-sim production build cannot yet be produced. Adding a selector would also create another build/dev seam that must join the stripping audit.

2. **BLOCKER — natural forbidden tokens are not a sound per-guard absence oracle.**

`RenderedModule.code` is the strongest relevant per-module signal exposed here, but it only reports the code Rolldown retained after unused code was removed (`node_modules/rolldown/dist/shared/define-config-DVsXPNaU.d.mts:153-169`). Vite 8 additionally enables compression and mangling in its Oxc output (`node_modules/vite/dist/node/chunks/node.js:33606-33610`).

A natural token can therefore:

- Vanish even after its guard is removed because another guard makes the value unused.
- Be rewritten by optimization.
- Survive because unrelated production code in the same module uses the same property, member expression, or string.

This repository has a concrete first case. Removing only `GameScene.ts:304` exposes `this.feelTuner`, but its consumer remains behind the separate guard at `gamePlayerDraw.ts:157-159`. Likewise, removing `GameScene.ts:312` constructs the dev-action object while `gameInput.ts:150-165` still guards every use. Rolldown is expressly allowed to eliminate those now-unused values, so the plan’s required “remove its own guard → token appears” implication is not guaranteed (`execute-phase-10-build-steady-meteor.md:193-213`).

The canonical `Object.assign` check is a useful current regression tripwire because that token belongs to the known leaking body (`src/debug/globals.ts:69-74`). It does not make natural-token checks categorically exact.

Within `generateBundle` alone, there is no better semantic field: the API offers module code, length, and exports (`node_modules/rolldown/dist/shared/define-config-DVsXPNaU.d.mts:153-169`). A stronger plugin oracle requires a unique transform-time sentinel causally inserted into each guarded region, then checking final `OutputChunk.code`, which is the API’s generated chunk (`node_modules/rolldown/dist/shared/define-config-DVsXPNaU.d.mts:209-224`). Natural source tokens lack that causal linkage.

## Direct answers

1. **Round-4 findings**

- Byte-budget objection: **fixed**, not reworded.
- Missing roster entries: **fixed**. `main.ts`, `GameScene.ts`, and `enemyTuning.ts` are present (`execute-phase-10-build-steady-meteor.md:187-206`).
- Per-entry red proof: **only partially fixed**; the intention is correct, but layered guards can prevent the natural token from surviving.
- N/K observation contradiction: **fixed** and now honestly disclosed (`execute-phase-10-build-steady-meteor.md:311-319`).
- Dead-sim compile point: **fixed**.
- Dead-sim committed fixture: **only partially fixed**; no production-build activation path exists.
- Overlay false green: **fixed at plan level** through a positive signature and the exact `ctx.ui` no-op mutation (`execute-phase-10-build-steady-meteor.md:268-272`).
- Ruling A wording and provenance header: **fixed** (`execute-phase-10-build-steady-meteor.md:3-6,40`).

2. **Forbidden-token oracle**

It is useful but not sound as stated. `RenderedModule.code` is appropriate evidence; naturally occurring tokens are not guaranteed markers of a particular guarded body. Final chunk code plus a unique injected sentinel is the stronger API-supported oracle.

3. **Remaining blockers**

- No defined way to activate and build the committed dead-sim production mutation.
- T8 claims exact per-guard causality that natural tokens cannot guarantee, with layered guards providing a concrete failure path.

4. **Owner representations**

Rulings A and C are now represented honestly (`execute-phase-10-build-steady-meteor.md:40-42`). The remaining factual misrepresentation is outside those rulings: `cue-stall` and `scrimN` are called “committed build-time mutations,” although one is DEV-only source behavior and the other is test-harness-only (`docs/qa/session-bugfix-perf-gates.md:213-221`).

Could not check: I did not execute Vite builds, individual token mutations, the dead-sim build, or the pixel-signature test. This is a static, read-only review; no files were modified.

VERDICT: REVISE
---
