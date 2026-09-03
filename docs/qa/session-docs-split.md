[← QA-LOG index](../QA-LOG.md) · [CLAUDE.md §6](../../CLAUDE.md)

# Session log — the 500-line documentation ceiling (2026-09-03)

**Not a phase.** A documentation audit, run on the owner's instruction after the Phase 12 close-out:
*"break down all the documentation that's above 500 lines into a few files… audit all documentation…
just want to make sure we know if there's any data [lost]."*

Owner decisions taken before any file was touched: split **all ten** files over 500 (not just the
QA logs), target **≤500 with the minimum number of cuts**, and **enforce it with a test afterwards**.

This closes the open item the 2026-08-15 entry left: *"No test enforces a line ceiling on documents…
the ceiling stays a judgement call rather than a gate."* It is a gate now.

## What was over, and what it became

| Was | Is | Lines |
|---|---|---|
| `qa/phase-09-polish.md` 2126 | index (header + gate table + vault-out) + 5 flat siblings | 280 + 217…480 |
| `qa/session-bugfix-tiers.md` 1617 | index (reconciliation) + 4 siblings, numbered from 03 | 165 + 239…495 |
| `qa/phase-12-touch.md` 1603 | index (verdicts + regression + vault-out) + 4 siblings | 246 + 193…431 |
| `HANDOFF.md` 1477 | 2 live sessions + the § map + NEXT SESSION, and **7** files into [`handoff/`](../handoff/) | 259 + 86…450 |
| `qa/phase-10-ship.md` 1271 | index + 3 siblings, numbered from 03 | 156 + 343…429 |
| `qa/phase-08-gate-entry.md` 1055 | index (baseline + measurements) + 3 siblings | 70 + 276…432 |
| `qa/phase-11-welcome.md` 689 | index (through the vault-out) + 1 sibling | 365 + 338 |
| `reviews/phase-10-plan.md` 668 | protocol + scoreboard + triage, and the 5 verbatim rounds out | 189 + 492 |
| `qa/phase-06-hud.md` 559 | index + session 2 out | 376 + 198 |
| `qa/phase-04-art.md` 557 | narrative + the 4.23 post-mortem out | 490 + 85 |

`docs/` went 42145 → 42365 lines: **+220, every one of them new index tables and breadcrumbs.**

## 🔴 The evidence that nothing was lost, per file

The owner's question was whether any data would go missing. It is answered by measurement, not by
care. For each parent, before and after:

```bash
git show HEAD:<file> | grep -v '^[[:space:]]*$' | sort > before.txt
cat <parent> <every child>   | grep -v '^[[:space:]]*$' | sort > after.txt
comm -23 before.txt after.txt      # every line printed is a line that no longer exists anywhere
```

`comm -23` over sorted multisets catches a dropped duplicate too — a lost `---` shows up as one
surplus `---` in `before`. It caught exactly that twice during this pass (phase-04 and HANDOFF), on
boundaries where a section separator fell between two ranges, and both were repaired.

**Result: empty for all ten**, except four lines in `HANDOFF.md` that were *deliberately* rewritten
— the §14–§17 rows whose "Where" cell said `below` and now names the file the section moved to.
Those four are the only edited lines in 42365. Everything else is a verbatim move.

Link paths were then repaired in the seven relocated `handoff/` files (39 links, `qa/x.md` →
`../qa/x.md`), and a re-run of the accounting with `](../` normalised away still reported only those
same four rows.

## The three ways a split goes red, all three found by doing it

1. **`docs-contract.test.ts` slices a done phase's log** between its phase heading and its vault-out
   heading and requires exactly one `<!-- gate-verdicts -->` table with one row per criterion. Those
   three anchors stay in the parent; everything else inside the window may move, and did.
2. **`docs/qa/phase-04-art.md` is that test's regression case for a slice with TWO legitimate
   criterion tables.** The first attempt moved the criterion-by-criterion walk to a sibling and the
   test said so immediately: *"4.2b should appear twice in the SECTION: expected 0 to be greater
   than 1"*. Phase 4 is not ✅ in the PRD table, so the ordinary rule does not cover it — this one
   test does, and it is the only place that shape is exercised at all. The split moved the 4.23
   post-mortem (which sits *below* the vault-out) instead.
3. **Index prose must not quote a slice marker verbatim.** `between()` takes the FIRST `indexOf` of
   its start marker. Three of the new index blocks explained the rule by quoting `` `## Phase 11 —` ``
   and `` `## Vault-out — Phase 11` `` — above the real headings, so those sentences *became* the
   slice boundary. Caught by reading `between()` rather than by a red test, because the hijacked
   slice still happened to contain the marker and the rows and passed. Every index now describes the
   headings instead of quoting them, and says why.

## The gate, watched failing *(C1)* and confirmed reverted *(C12)*

`tests/unit/docs-size.test.ts`, sweeping `docs/**/*.md` plus the repo root at a hard 500. No
`SIZE-EXEMPTION` path: those citations live in `docs/qa/*.md`, so a document exempting itself would
be citing its own text.

`repoPath` and `lineCount` moved to `tests/unit/fileLines.ts` so both gates share one copy —
`file-size.test.ts` was at **399** of its own 400-line ceiling and could not have been extended in
place. It is 375 now.

| mutation | result |
|---|---|
| append 60 padding lines to `docs/qa/phase-04-art.md` (490 → 550) | `Tests 1 failed \| 1 passed`, naming `"docs/qa/phase-04-art.md (550 lines)"` |
| revert | `Tests 2 passed` |
| point the glob at `docs/nope/**/*.md` | `expected 0 to be greater than 150` — **and the sweep test passed vacuously in that arm**, which is the whole reason the count guard exists |
| revert | `Tests 2 passed` |

The count guard is not decoration: the third row is the failure shape §5 names — a run that selected
nothing reports success. Without it, a glob typo would have retired this gate silently.

## What this does NOT do

The same warning `file-size.test.ts` carries, twice over: **a line count cannot tell whether a file
got shorter by splitting or by deleting the explanation**, and in `docs/` the explanation is the
entire content. The standard is the `comm -23` accounting above, not the number. A future split that
cannot show an empty diff has not been done.

**Not covered:** `docs/reviews/phase-12-touch-plan.md` carries 57 links to absolute
`C:/Users/royko/.claude/plans/…` paths and `docs/qa/session-phase-09-debts.md` has 6 `](x)` table
cells that read as links. Both are pre-existing, neither was touched, and neither is a broken
*relative* link. Recorded so the next link sweep does not re-investigate them *(C11)*.
