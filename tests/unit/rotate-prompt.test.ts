import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { TOUCH_BOX_PX, TOUCH_MIN_CSS_PX } from '../../src/render/touchLayout';
import { fitCanvasCssWidth, rotateOverlayWanted } from '../../src/render/rotateOverlay';
import { RotatePrompt, browserHost, type RotateHost } from '../../src/scenes/rotatePrompt';

/**
 * **The one viewport the controls cannot be made to fit.**
 *
 * `Phaser.Scale.FIT` holds the backing store at 1920x1080 at every viewport and DPR — only the CSS
 * size changes (`docs/ENGINE-NOTES.md:305-331`, measured). So a control's real size is
 * `gamePx * canvasCssWidth / 1920`, and on a phone held upright that is:
 *
 * | viewport | canvas CSS | scale | a 160 px button is |
 * |---|---|---|---|
 * | iPhone 14 portrait 390x844 | 390x219 | 0.203 | **32.5 CSS px** |
 * | Pixel 7 portrait 412x892 | 412x232 | 0.215 | 34.3 CSS px |
 *
 * against the 44 px floor from `ui-ux-pro-max`'s `ux-guidelines.csv` (Touch/Touch Target Size,
 * severity High). There is no button size that fixes it: the canvas is only 219 px tall, so a
 * thumb-sized control eats a third of the visible game.
 *
 * ## 🔴 Every case below was rewritten after the owner found the defects by hand — twice
 *
 * The prompt was a Phaser scrim and two `Text` objects, and this file's cases all passed while the
 * thing was broken on a real phone in two independent ways. Both were properties of the DRAWING, and
 * this file could only see the decision. It now drives the decision from a fake VIEWPORT, which is
 * the input that was wrong, and `phase-12-touch.spec.ts` measures the overlay on a real page.
 */

const PHONE_PORTRAIT = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

function fitsAt(cssWidth: number): boolean {
  return (TOUCH_BOX_PX * cssWidth) / GAME_WIDTH >= TOUCH_MIN_CSS_PX;
}

/** A page whose viewport the test moves, and whose class the test reads. */
function fakeHost(
  width: number,
  height: number,
): RotateHost & { shown: boolean; toggles: number; line: string } {
  return {
    innerWidth: width,
    innerHeight: height,
    shown: false,
    toggles: 0,
    line: '',
    isShown() {
      return this.shown;
    },
    setShown(shown: boolean) {
      this.shown = shown;
      this.toggles += 1;
    },
    report(line: string) {
      this.line = line;
    },
  };
}

describe('the viewport arithmetic the decision rests on', () => {
  it('agrees with the measurement it is built on', () => {
    // Guards the fixtures themselves: if either figure moved, the cases below would silently stop
    // testing the two sides of the boundary.
    expect(fitsAt(PHONE_PORTRAIT.width), 'phone portrait should NOT fit').toBe(false);
    expect(fitsAt(GAME_WIDTH), 'a full-size view should fit').toBe(true);
  });

  it('derives the canvas width FIT will produce, from the raw viewport', () => {
    // Portrait is width-bound; landscape is height-bound, and that is the whole reason turning the
    // phone helps at all — 390 px of height buys a 693 px canvas where 390 px of width buys 390.
    expect(fitCanvasCssWidth(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height)).toBe(390);
    expect(fitCanvasCssWidth(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height)).toBe(693);
    expect(fitCanvasCssWidth(0, 100), 'a collapsed viewport is not a decision').toBe(0);
    expect(fitCanvasCssWidth(100, 0)).toBe(0);
  });

  it('wants the overlay in portrait, and not in landscape', () => {
    expect(rotateOverlayWanted(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height, true)).toBe(true);
    expect(rotateOverlayWanted(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height, true)).toBe(false);
    expect(rotateOverlayWanted(GAME_WIDTH, GAME_HEIGHT, true)).toBe(false);
  });

  it('never wants it on a device with no touch', () => {
    // A desktop window narrow enough to trip the threshold has a keyboard, and telling a keyboard
    // player to rotate their monitor is worse than saying nothing.
    expect(rotateOverlayWanted(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height, false)).toBe(false);
  });
});

describe('RotatePrompt', () => {
  it('shows nothing where there is no page at all', () => {
    const prompt = new RotatePrompt(true, [], null);
    prompt.refresh();
    expect(prompt.showing).toBe(false);
  });

  it('shows in portrait and CLEARS when the device is turned', () => {
    // 🔴 The defect, stated as the sequence that produced it. The old decision read
    // `ScaleManager.displaySize`, which the engine caches and which is stale exactly when the device
    // has just been turned — so the overlay stayed up. Reading the viewport cannot be stale.
    const host = fakeHost(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const prompt = new RotatePrompt(true, [], host);
    prompt.refresh();
    expect(prompt.showing, 'the prompt should be up in portrait').toBe(true);
    expect(host.shown).toBe(true);

    host.innerWidth = PHONE_LANDSCAPE.width;
    host.innerHeight = PHONE_LANDSCAPE.height;
    prompt.refresh();
    expect(prompt.showing, 'the prompt survived a rotation into landscape').toBe(false);
    expect(host.shown).toBe(false);
  });

  it('touches the page only when the answer CHANGES', () => {
    // It is called on every frame and on three DOM events. A `classList.toggle` per frame is work
    // the 12.11 budget never sees and never needs to pay.
    const host = fakeHost(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const prompt = new RotatePrompt(true, [], host);
    for (let i = 0; i < 10; i += 1) prompt.refresh();
    expect(host.toggles, 'the page was written to on a frame nothing changed').toBe(1);
  });

  it('RE-ASSERTS the class another instance cleared, because the page is the authority', () => {
    // 🔴 The defect the e2e reproduction found, and the reason `isShown()` exists. There is one
    // overlay and one class, and more than one prompt alive: `TitleScene` attaches its own,
    // `UIScene` builds another. Caching "am I showing?" privately meant the title screen's teardown
    // cleared the class while the UI's prompt still believed it was up — so the overlay vanished on
    // a portrait phone the moment play started, and nothing put it back.
    const host = fakeHost(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const ui = new RotatePrompt(true, [], host);
    ui.refresh();
    expect(host.shown).toBe(true);

    // Another scene's prompt shuts down and clears the page.
    host.setShown(false);
    ui.refresh();
    expect(host.shown, 'the overlay stayed gone on a viewport that still needs it').toBe(true);
  });

  it('leaves the page clean when the scene ends with the overlay up', () => {
    const host = fakeHost(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const prompt = new RotatePrompt(true, [], host);
    prompt.refresh();
    prompt.destroy();
    expect(host.shown, 'a shut-down scene stranded the overlay over the next one').toBe(false);
  });
});

describe('the overlay reports the numbers it decided from', () => {
  // 🔴 Four device sessions ended with "it still does not clear", and the arithmetic measures
  // correct at every landscape viewport a phone can report. So the readout is the instrument that
  // tells the next round WHICH of the two remaining explanations it is: a viewport this code does
  // not expect, or a poll that is not running. A line nothing writes distinguishes neither.
  it('writes the live viewport and a rising count on every refresh', () => {
    const host = fakeHost(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const prompt = new RotatePrompt(true, [], host);
    prompt.refresh();
    expect(host.line).toContain('390x844');
    expect(host.line.endsWith('| 1')).toBe(true);
    prompt.refresh();
    expect(host.line.endsWith('| 2')).toBe(true);
  });

  it('reports on a LANDSCAPE refresh too, when the overlay stays hidden', () => {
    // The case that matters on the device: the overlay is wrongly up, the player turns the phone,
    // and nothing visible changes. If the count stops rising there, the poll is dead — which is a
    // different defect from the numbers being wrong, and the line separates them.
    const host = fakeHost(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height);
    const prompt = new RotatePrompt(true, [], host);
    prompt.refresh();
    expect(host.shown).toBe(false);
    expect(host.line).toContain('844x390');
  });
});

/**
 * **The DEV instrument really draws — and the fake-host cases above cannot say so.**
 *
 * 🔴 M90 gates an *on-overlay* readout. When the diagnostic stopped shipping (owner decision
 * 2026-09-01) the node left `index.html` and moved into `browserHost().report()` under
 * `import.meta.env.DEV`. Every case above drives `fakeHost`, which records a string and touches no
 * DOM — so all of them stay green if the real host writes nowhere at all. That is the shape of a
 * decision function with no consumer, and it is exactly what M90 exists to catch, so the re-scoped
 * M90 needs a case that watches the DOM instead of a string.
 *
 * ⚠️ **Hand-rolled document, not jsdom.** The suite runs `environment: 'node'` and the
 * dependencies are frozen (CLAUDE.md §3), so a DOM library would be a STOP-and-ask. A fake with
 * four methods is the same idiom `enemy-feedback.test.ts` uses for a fake scene, and it makes the
 * assertions stronger rather than weaker: the test can see that the node was *created* once and
 * *appended* to the overlay, which a real DOM would make tedious to check.
 *
 * ⚠️ This suite runs with `import.meta.env.DEV === true`, so it proves the DEV arm only. The
 * production arm — that no `rotate-diag` reaches `dist/` — is a build-output claim and is gated in
 * `tools/gen/verify-dist.mjs`, because no Vitest case can observe a production bundle.
 */
describe('the DEV diagnostic node', () => {
  interface FakeEl {
    id: string;
    textContent: string | null;
    children: FakeEl[];
    setAttribute(name: string, value: string): void;
    appendChild(child: FakeEl): void;
  }

  function fakeEl(id: string): FakeEl {
    return {
      id,
      textContent: null,
      children: [],
      setAttribute() {},
      appendChild(child: FakeEl) {
        this.children.push(child);
      },
    };
  }

  /** Installs a fake document, returns the overlay and a restore function. */
  function withFakeDom(withOverlay = true): { overlay: FakeEl; created: number; restore(): void } {
    const overlay = fakeEl('rotate');
    const state = { created: 0 };
    const doc = {
      getElementById(id: string): FakeEl | null {
        if (id === 'rotate') return withOverlay ? overlay : null;
        return overlay.children.find((c) => c.id === id) ?? null;
      },
      createElement(): FakeEl {
        state.created += 1;
        return fakeEl('');
      },
      documentElement: { classList: { contains: () => false, toggle: () => {} } },
    };
    const g = globalThis as unknown as Record<string, unknown>;
    const priorDoc = g.document;
    const priorWin = g.window;
    g.document = doc;
    g.window = { innerWidth: 390, innerHeight: 844 };
    return {
      overlay,
      get created() {
        return state.created;
      },
      restore() {
        g.document = priorDoc;
        g.window = priorWin;
      },
    };
  }

  it('creates the node, appends it to the overlay, and writes the line', () => {
    const dom = withFakeDom();
    try {
      const host = browserHost();
      expect(host, 'a fake document must still produce a host').not.toBeNull();
      host?.report('390x844 | 390x844 | portrait-primary | 1');
      expect(dom.overlay.children.length, 'nothing was appended to the overlay').toBe(1);
      expect(dom.overlay.children[0]?.id).toBe('rotate-diag');
      expect(dom.overlay.children[0]?.textContent).toBe('390x844 | 390x844 | portrait-primary | 1');
    } finally {
      dom.restore();
    }
  });

  it('creates the node ONCE across many refreshes and updates it in place', () => {
    // The counter rises every frame, so a host that re-created the element per call would append
    // one div per frame — a leak that looks identical on screen.
    const dom = withFakeDom();
    try {
      const host = browserHost();
      host?.report('a | 1');
      host?.report('a | 2');
      host?.report('a | 3');
      expect(dom.overlay.children.length, 'one node per refresh is a per-frame leak').toBe(1);
      expect(dom.overlay.children[0]?.textContent).toBe('a | 3');
    } finally {
      dom.restore();
    }
  });

  it('does nothing when the overlay is absent instead of throwing', () => {
    const dom = withFakeDom(false);
    try {
      const host = browserHost();
      expect(() => host?.report('a | 1')).not.toThrow();
    } finally {
      dom.restore();
    }
  });
});
