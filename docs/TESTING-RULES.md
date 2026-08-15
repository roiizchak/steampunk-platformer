# TESTING-RULES.md

The full reasoning behind the test rules listed tersely in [CLAUDE.md § 5](../CLAUDE.md). Each rule
here was paid for by a real false green or false red in this project. CLAUDE.md carries the rule;
this file carries the evidence.

Vault-cited rules (`C1`, `C2`, `C11`, `C12`, `C13`, `A7`) have their root statement in
[LESSONS-APPLIED.md](LESSONS-APPLIED.md) — this file records only how they bit *here*.

---

## Proving a gate can fail

**Watch every gate fail before trusting it** *(C1)*. Re-introduce the bug, see red, restore, and
confirm the mutation actually reverted with `grep -c` *(C12)*.

**A gate that cannot go red is decoration** *(C2)*. Use committed failing fixtures, not assertions
about assertions.

**Verify a mutation applied by "content changed AND the original count dropped by one"** — never by
"the original count is now zero". Counting to zero is wrong when the mutant *contains* the original,
and meaningless when the replacement is empty. Both cases write the file before failing, so a
"refused" mutation can sit applied in a tree that then reports green *(C12)*.

**A non-zero exit code is not evidence a gate caught anything.** A vitest spawned from a Node parent
loses its runner context; every suite dies at import, prints `Tests  no tests`, and exits 1 — which
looks exactly like a caught defect. Detect redness *positively*, from `Tests N failed` plus the named
failing specs. Drive mutation loops from the shell, not from a Node script.

---

## e2e specifics

**Assert the type before the value.** A prior project passed vacuously on `undefined === undefined`
through a debug hook that returned nothing.

**An existence assertion cannot verify a timing claim.** "Did a jump happen" passed while the tick
order's documented window semantics were wrong. Assert *which tick*.

**Never `waitForTimeout`.** Wait on `window.__game.ready`. A sleep long enough to pass is long enough
to hide a hang.

**A wait expressed in ticks cannot bound a sampling window.** `waitTicks(N)` guarantees *at least* N
ticks, never exactly N, and under parallel Playwright workers a single round trip can outlast the
whole window being measured. "Advance N ticks, then read once" produced a **false green with a
mutation applied** and a **false red on correct code**, in the same suite. Sample inside the page,
once per animation frame, and return an aggregate.

**Kill dev servers by port before reporting done** *(C13)*. Playwright launches
`node ./node_modules/vite/bin/vite.js` directly — never `npm run dev`, whose shell wrapper orphans
the real process on Windows.

**The headless harness is not the frame rate.** SwiftShader makes e2e millisecond figures roughly
21× the real ones. Only a same-session, interleaved A/B decides a performance question.

---

## Reviews and agents

**Run two review briefs per gate** *(A7)*: one verifying the stated criteria, one asking *how could
this be wrong?* In Phase 1 the first concluded there were no asset-missing paths; the second found
three, and Codex then found two more. **Withhold brief 1's findings from brief 2** — a second pass
that has read the first one confirms it instead of attacking it. Both briefs are ready to paste in
[PRD.md § The QA agent protocol](PRD.md#the-qa-agent-protocol).

**A subagent's summary is a claim, not evidence.** An agent reporting a criterion green without
citing command output, file and line, or a screenshot has reported nothing. Re-verify locally
whatever it could not run — the same standing rule the Codex reviews carry.

---

## The two Playwright skills

Two skills, two different jobs — do not swap them.

| Skill | Job |
|---|---|
| `playwright-cli` | Drives and screenshots the *running* game. How every `play`-owned criterion gets its evidence. |
| `e2e-playwright-testing` | Authors the spec files under `tests/e2e/`. |

This project standardises on `e2e-playwright-testing`; the near-identical `playwright-e2e-testing` is
deliberately never used, so no session flips between them. What of its rules did and did not apply
here is recorded in [qa/phase-01-boot.md](qa/phase-01-boot.md).
