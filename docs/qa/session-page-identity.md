# The tab icon and the link-preview card — 2026-09-03

**Not a phase.** One request from the owner, after Phase 12 shipped: *"please add icon also
description for appear on the browser tap."*

🔴 **The page had neither, and had never had either.** Thirteen phases, ten of them with a QA gate,
and `index.html` carried no `<link rel="icon">` at all — so every tab and every bookmark showed the
browser's default globe — and no `description`, no `og:*`, no `twitter:*`, so a shared URL arrived as
a bare link with no title, no art and no text. **This build has gone to friends more than once**;
that is how the iPhone `BOOT REFUSED` defect was found. Every one of those links was a naked URL.

## What was decided, and what was not built

| decision | choice | why |
|---|---|---|
| icon art | **the game's own collectible gear**, `public/assets/objects/gear.png` | 72×72, already through the style lock, already shipped, and it fills its own frame (ink bbox 0,0–71,71; 3226 of 5184 pixels carry alpha). No new art. |
| generate one instead? | **no** | `$2.25` remains of the `$60` art ceiling, and a new icon is a STYLE.md-conformant prompt plus a gate plus a `GENERATION-LOG` entry. A downscale of a shipped sprite is none of those. |
| scope | favicon + Open Graph / Twitter card | The owner picked the link preview; the tab icon was the original request. **`apple-touch-icon` and a web manifest were offered and declined** — see below for why the first would have been bad anyway. |
| title | unchanged | `Steampunk Platformer` is pinned by e2e specs and `verify-dist`. |

**No `apple-touch-icon`, and that is not laziness.** iOS asks for 180 px. The source sprite is 72 px,
so a 180 px icon is an *upscale* of pixel art, which is mush. `page-identity.test.ts` pins the
constraint rather than leaving it as a comment: every icon it ships must be no wider than the sprite
it is cut from.

## The cover is a PRODUCTION frame, and the reason is a gate

`public/og-cover.png` is a real frame of level-01, 1200×630, captured from the **built `dist/`**
served by `tools/dev/prod-server.mjs`.

🔴 **The first capture was off the dev server and could not ship.** The dev build's controls banner
carries the two dev-only scene shortcuts, so the card would have put in every shared link exactly the
prose `verify-dist` refuses to put in the bundle. **And then the HTML comment explaining that named
them, and `verify-dist` red on the build** — the gate caught the sentence about the rule, which is
the same shape as the CSS comment M105 found. The comment reads the way it does because of that.

The capture came out **1199×630** — `Phaser.Scale.FIT` rounds — and was padded one column to 1200,
because `og:image:width` is a promise a scraper crops to.

## The gates, and the six mutations

Two halves, the split this project always takes: `tests/unit/page-identity.test.ts` over the SOURCE,
and `tools/gen/verifyIndexHtml.mjs` over `dist/`, because a game-source gate cannot see a
shipped-bytes defect *(vault 3.1)*.

⚠️ **Every failure mode here is silent, which is the whole argument for gating what looks like
decoration.** A `<link rel="icon">` at a file that did not ship falls back to the default globe with
no console error. A **relative** `og:image` is not a broken image — it is *no card at all*, dropped
by every scraper, with nothing anywhere reporting it. A build that stopped copying `public/` would
take the lot. That is the shape of the two `.ogg` beds that shipped a `BOOT REFUSED` screen to every
iPhone past 229 green tests.

| # | mutation | unit | `verify-dist` |
|---|---|---|---|
| N1 | delete the 32 px `<link rel="icon">` | RED 1/6 | **RED** — *lost a 32px icon link* |
| N2 | make `og:image` relative (`/og-cover.png`) | RED 1/6 | **RED** — *lost an ABSOLUTE og:image* |
| N3 | drift `og:description` from `description` by two words | RED 1/6 | **GREEN, then RED** — see below |
| N5 | declare `og:image:width` 1600 against a 1200 px file | RED 1/6 | **GREEN, then RED** — see below |
| N6 | delete the `.ico` fallback link | RED 1/6 | **RED** — *lost the .ico fallback* |
| N7 | remove `dist/og-cover.png` after the build | — | **RED** — *did not ship, and index.html points at it* |
| N8 | remove `public/og-cover.png` | RED 2/6 | — |

🔴 **N3 and N5 were GREEN on the shipped half and the excuse was ready.** *"The source gate owns
content, the dist gate owns survival"* — which sounds like a division of labour and is not one: what
a scraper reads is the **shipped page against the shipped image**, and both of those mutations are
about that pair. The dist half now compares the three description tags to each other, and reads
`dist/og-cover.png`'s IHDR against the declared `og:image:width`/`height`. Both red afterwards, on
the same mutation that had passed. *A gate that cannot go red is decoration (C2)* — and the only
reason these two were found is that the mutations were run rather than reasoned about.

## Two gates fired on their own, unprompted, and both were right

1. **`verify-dist`'s dev-seam rule** red on the HTML comment above, for naming the two dev scenes.
   The gate was correct and the comment was the violation.
2. **`tests/unit/file-size.test.ts`** red the moment the page-identity block took `verify-dist.mjs`
   to **430 lines**. The split was taken rather than an exemption — the seventh in two sessions —
   into `tools/gen/verifyIndexHtml.mjs`, which is a coherent seam because everything in it reads one
   artifact. `verify-dist.mjs` is 327 lines now.
3. **`tests/unit/shipped-eol.test.ts`** red on `public/favicon.ico`, reporting a binary as a text
   file with no CRLF. `.ico` joined the denylist. ⚠️ **That is the denylist working as designed** —
   its own header argues that an allowlist over an evolving directory shrinks silently while a
   denylist fails loudly the day a new binary type arrives. It arrived, and it failed loudly, and the
   message named the file.

## Regression

unit **3152/3152** in 875 suites · sim-isolated 3139 + 13 skipped / 3152 in 224 files · `tsc` clean ·
build + `verify-dist` ok · e2e **236/236** across all seven projects.

⚠️ **`chromium-prod` flaked a SECOND time**, on a different case than the first (*"boots, draws,
simulates, and completes a level on real keyboard input"*, where the close-out session saw *"carries
no live dev seam"*). Both passed on re-run against identical bytes. Two datapoints on two different
specs make this a **project-level flake rather than a spec-level one**: both are wall-clock-bounded
production specs, `playwright.config.ts` already warns at length that a busy box reads as a broken
game, and `phase-10-campaign` uses ~60 s of its own 60 s allowance. **Recorded, not diagnosed, and
not counted as a green.**

## What no gate here can see

Whether the icon reads at 16 px, and whether a scraper likes the card. The first is why the icon is a
downscale of art that shipped and was looked at. **The second is the owner sending themselves the
link** — and until that happens, the card is asserted, not confirmed.
