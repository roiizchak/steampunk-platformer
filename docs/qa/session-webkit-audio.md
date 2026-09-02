# Session — the iPhone black screen: Ogg, Safari, and a suite that ran on one engine

**2026-09-02.** The owner sent the production link to friends. They reported a black screen.

It was not black. It was the `BOOT REFUSED` screen — `#ff6b5a` on `#12100e`, which on a phone at
arm's length is black with something faint on it:

```
BOOT REFUSED

audio "bed-music" did not decode (assets/audio/bed-music.ogg)
audio "bed-ambience" did not decode (assets/audio/bed-ambience.ogg)
```

---

## The cause

**Safari decodes no Ogg container.** `bed-music.ogg` and `bed-ambience.ogg` were the only two OGG
files in the catalog and they were listed with a single url each. `bootAssets.ts` queued that one
url, WebKit could not decode it, `verifyAudio` found neither key in `scene.cache.audio`, and
`refuseToRoute` did precisely what it exists to do.

🔴 **Every browser on iOS is WebKit.** Chrome, Firefox and Edge on an iPhone are Safari's engine
with a different icon, so this was not a minority-browser edge case — it was every iPhone. Android
and desktop were unaffected, which is why neither the owner nor the suite saw it: the owner's own
device is Android.

**The gate was right.** It refused rather than shipping a game with no music and no explanation.
Nothing about `refuseToRoute` needs changing. What was missing was any way to notice.

---

## 🔴 Why 229 green e2e tests said nothing

**All six Playwright projects were Chromium**, and Chromium decodes Ogg.

That is a substrate assumption nobody wrote down. Every assertion in the suite was correct; they
were all evaluated on a browser no iPhone owner has. **A suite cannot test the thing it is standing
on** — and the failure is silent by construction, because the substrate never appears in a
diagnostic.

⚠️ **This is a general shape, not a fact about audio.** A CSS property, a Web Audio call, an `Intl`
format, a regex feature, a `structuredClone` — anything an engine can differ on reached production
unexamined. The repair below is a WebKit project, not an Ogg check.

It is also the sequel to a lesson already in this project: *silent decode failures need their own
boot gate*. That lesson bought `verifyAudio`, which is exactly what caught this. The gap was one
level up — the gate ran only where the format worked.

---

## The fix

**Alternates, chosen by the browser.** `AudioEntry` gains `altUrls?: string[]`, and
`bootAssets.ts` queues `[cue.url, ...altUrls]`. Phaser picks the **first entry the browser reports
it can play**, so order is preference and only the chosen file is fetched — Chromium and Firefox
still take the `.ogg` and download no more bytes than before.

| | before | after |
|---|---|---|
| `bed-music` | `.ogg` 2.0 MB | `.ogg` 2.0 MB + `.m4a` 1.9 MB |
| `bed-ambience` | `.ogg` 2.6 MB | `.ogg` 2.6 MB + `.m4a` 1.9 MB |

Transcoded with ffmpeg, `-c:a aac -b:a 128k -movflags +faststart`. ⚠️ **192 k was the first attempt
and made the `.m4a` 45 % LARGER than the `.ogg`.** The Ogg headers report a 7.5 s duration and the
true length is **116 s** — a header this project should not trust for anything. At 128 k AAC the two
are comparable, and the Ogg's own measured average is 143 kbps, so this is not a quality cut worth
arguing about for a background bed.

**The nine SFX are unchanged.** They are `.wav`, which Safari decodes; requiring alternates
everywhere would be a rule about a format rather than about a browser.

### The rule, not the instance

`describeCatalogProblem` now **refuses** an `.ogg`/`.oga`/`.webm` url with no `altUrls`, and refuses
an alternate that is itself in one of those containers. That second half matters:

> 🔴 *"must have a fallback"* is satisfied by `.ogg` + `.oga`, which gains no browser at all. The
> rule has to be **"must gain a browser"**, or the fix is satisfiable by a change that leaves every
> iPhone exactly where it was.

`verify-dist.mjs` checks the same thing at build time and additionally that every alternate reached
`dist/` byte-identical — because a catalog naming `bed-music.m4a` while the file is absent produces
**the identical screen one layer down**, and still looks perfectly healthy from any Chromium.

---

## The repair that matters: a WebKit project

`playwright.config.ts` gains a seventh project. It runs one narrow spec —
`tests/e2e/session-webkit-boot.spec.ts` — against the **production** server, because the defect was
in the shipped catalog and the shipped loader.

### 🔴 `Desktop Safari` was the wrong descriptor, and only the mutation found it

The project was first written with `devices['Desktop Safari']`. Under it, M136 — the loader ignoring
its alternates, i.e. the exact shipped defect — came back **2 passed**.

Measured on this harness rather than assumed:

| | `canPlayType('audio/ogg')` | `audio/mp4` | `AudioContext` |
|---|---|---|---|
| Desktop Safari | `''` | `'probably'` | **undefined** |
| iPhone 14 landscape | `''` | `'probably'` | **undefined** |

Both profiles are codec-faithful, so the descriptor was not the problem after all — **the SPEC was.**
See below. The project still uses `iPhone 14 landscape`, since that is the device the report came
from and the profile the failure was first reproduced under.

### 🔴 The first version of the spec was decoration

It asserted `document.body.innerText` did not contain `BOOT REFUSED`. But `refuseToRoute` draws that
text with `this.add.text()` — **onto the canvas**, where no DOM query can ever reach it. The probe
returned `''` for a refused boot and `''` for a healthy one.

**M136 came back 2 passed against a build that refused on every single load.** The gate was
measuring nothing, and only running the mutation showed it. *(C1, C2.)*

Two signals replaced it, both measured on this harness:

1. **`console.error('[boot] refused to route: …')`** — what `refuseToRoute` actually emits, present
   in production, and the exact line that fired on the friends' phones.
2. **A drawn-frame floor of 400 kB of screenshot PNG.** Healthy title screen **1,978,349 bytes**;
   `BOOT REFUSED` **62,168 bytes** — a **32×** gap, with the bound an order of magnitude from each
   side. The console check alone cannot tell a healthy boot from a page where nothing ran at all,
   because a bundle that throws before Phaser starts logs no refusal either.

---

## Gates and mutations

| # | mutation | gate that went red | evidence |
|---|---|---|---|
| M135 | the catalog loses both `altUrls` — **the exact shipped state** | `audio-alternates.test.ts` › *offers every cue in at least one container Safari decodes* | 1 failed / 9 passed. ⚠️ It also aborts the e2e run at `globalSetup`, loudly, because the validator now refuses this catalog outright — the old state is no longer reachable |
| M136 | the loader queues `cue.url` alone, ignoring alternates | `session-webkit-boot.spec.ts` › *does not refuse to route, and draws a real frame* | 1 failed / 1 passed — `Error: polling for a drawn frame`. **Green under the first version of the spec; this is the mutation that exposed it** |
| M137 | the validator stops requiring an alternate for an `.ogg` | `audio-alternates.test.ts` › *refuses an .ogg with no altUrls* | 1 failed / 9 passed |
| M138 | the validator accepts an `.oga` alternate to an `.ogg` | `audio-alternates.test.ts` › *refuses an alternate that is ITSELF undecodable* | 1 failed / 9 passed |
| M139 | `verify-dist` checks only `entry.url`, not the alternates | `verify-dist.mjs`, with `bed-music.m4a` removed from `public/` | unmutated **exit 1**, `catalog audio "bed-music" points at assets/audio/bed-music.m4a, which is not in dist/`; mutated **exit 0**, `verify-dist ok` |

The spec carries three vacuity guards of its own, each one a way the gate could go quiet:

- the catalog must list more than five cues (an empty list satisfies every filter);
- at least one shipped url must still be an `.ogg` (otherwise the case proves nothing about an
  engine that cannot decode one);
- **this WebKit must report it CANNOT play Ogg** — if a future Playwright build links GStreamer, the
  project stops standing in for Safari and says so instead of passing.

---

## Files

| file | change |
|---|---|
| `public/assets/audio/bed-{music,ambience}.m4a` | **NEW.** AAC 128 k, 1.9 MB each |
| `public/assets/index.json` | both beds gain `altUrls` |
| `src/game/assetCatalog.ts` | `altUrls` on `AudioEntry`; `NEEDS_ALT_EXTENSIONS`, `needsAlternate`; the two refusal rules |
| `src/scenes/bootAssets.ts` | queues the array; the refusal message names every candidate |
| `tools/gen/verify-dist.mjs` | every url checked into `dist/`; the no-alternate refusal; the summary counts FILES, not entries (12 → 14) |
| `playwright.config.ts` | the `webkit` project; `WEBKIT_SPECS` added to `chromium`'s `testIgnore`. Moved `WEBKIT_SPECS` to `specRouting.ts` when the file crossed 400 lines |
| `tests/e2e/specRouting.ts` | holds `WEBKIT_SPECS` |
| **NEW** `tests/e2e/session-webkit-boot.spec.ts` | the substrate check |
| **NEW** `tests/unit/audio-alternates.test.ts` | the fast half — the rule, and the shipped bytes |
| `tests/unit/playwright-projects.test.ts` | knows about a seventh project; ⚠️ its block slicer keyed on `name: 'chromium` and would have swallowed a differently-named project's block into its neighbour's |
| `tests/unit/shipped-eol.test.ts` | `.m4a`, `.aac`, `.caf`, `.oga`, `.webm` are binary — an unknown binary was reported as a text file with no CRLF |

---

## Suite results

| run | result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | **3137 passed, 0 failed** (221 files) |
| `npm run build` | `verify-dist ok` — 5 levels, **14** audio files byte-identical |
| e2e, per project | `chromium` 107 · `chromium-gpu` 71 · `chromium-dpr2` 8 · `chromium-touch` 34 · `chromium-touch-gpu` 3 · `chromium-prod` 6 · **`webkit` 2** = **231 passed, 0 failed** |

---

## What this cost, and what it bought

The bug was live in production for a day and reached real players. It was found by three friends
opening a link, not by 229 tests, a Codex review, or six QA agents.

The lesson is not *"add AAC"*. It is that **a whole class of defect is invisible to a suite that
runs on one engine**, and that class is now one project wide instead of zero. ⚠️ The `webkit`
project is deliberately narrow — two tests, 14 seconds — so keeping it is cheap and so is extending
it the next time an engine difference bites.
