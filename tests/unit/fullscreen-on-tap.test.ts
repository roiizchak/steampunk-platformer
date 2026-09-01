/**
 * **The tap that asks for fullscreen — behavioural, against a fake element and a fake ScaleManager.**
 *
 * 🔴 The defect this closes was never a rotation bug, and four device sessions were spent on it.
 * `rotateOverlayWanted` is correct at every landscape viewport a phone can report — the owner's
 * reports **798 x 283**, because Brave keeps its address bar in landscape, and that letterboxes to a
 * 503 px canvas, a CSS scale of 0.262, and controls at 41.9 CSS px against `touchLayout.ts`'s 44 px
 * floor. The overlay was right; the browser chrome was the blocker. Fullscreen removes it.
 *
 * ⚠️ **A wiring this small is exactly the shape that ships with no consumer** — `spriteFeedback.ts`
 * was 221 source lines whose four bodies could be blanked with the game byte-identical on screen. So
 * the logic is driven **behaviourally**, against a fake element and a fake `ScaleManager` — the
 * stronger of the two gate shapes CLAUDE.md names, available here because the module takes Phaser as
 * a type only. The second `describe` covers the composition `main.ts` and `config.ts` perform, and
 * it is source text only because both of those name Phaser VALUES and cannot be imported under
 * `npm run test:sim-isolated`.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { installFullscreenOnTap } from '../../src/game/fullscreenOnTap';

/** An element that records its subscriptions and can fire them. */
function fakeElement() {
  const handlers = new Map<string, (() => void)[]>();
  return {
    handlers,
    addEventListener(type: string, fn: () => void) {
      handlers.set(type, [...(handlers.get(type) ?? []), fn]);
    },
    removeEventListener(type: string, fn: () => void) {
      handlers.set(type, (handlers.get(type) ?? []).filter((h) => h !== fn));
    },
    fire(type: string) {
      for (const fn of [...(handlers.get(type) ?? [])]) fn();
    },
  };
}

function fakeScale(opts: { throws?: boolean } = {}) {
  return {
    isFullscreen: false,
    calls: 0,
    startFullscreen(this: { isFullscreen: boolean; calls: number }) {
      this.calls += 1;
      if (opts.throws === true) throw new Error('refused');
      this.isFullscreen = true;
    },
  };
}

describe('installFullscreenOnTap', () => {
  it('asks for fullscreen on a tap', () => {
    const el = fakeElement();
    const scale = fakeScale();
    installFullscreenOnTap(el, scale, true);
    el.fire('pointerup');
    expect(scale.calls).toBe(1);
    expect(scale.isFullscreen).toBe(true);
  });

  it('listens for pointerUP and not pointerdown', () => {
    // 🔴 Not a style preference: a fullscreen request originating from `pointerdown` is refused as
    // an untrusted gesture on touch devices. Street-Fighter's `FlowScene.ts:386-388` records the
    // same finding, and a listener on the wrong event is a fix that silently never fires.
    const el = fakeElement();
    const scale = fakeScale();
    installFullscreenOnTap(el, scale, true);
    el.fire('pointerdown');
    expect(scale.calls).toBe(0);
    el.fire('pointerup');
    expect(scale.calls).toBe(1);
  });

  it('does not ask again while already fullscreen', () => {
    const el = fakeElement();
    const scale = fakeScale();
    installFullscreenOnTap(el, scale, true);
    el.fire('pointerup');
    el.fire('pointerup');
    el.fire('pointerup');
    expect(scale.calls).toBe(1);
  });

  it('survives a REFUSAL and asks again on the next tap', () => {
    // iOS Safari has no fullscreen for an arbitrary element and Android may refuse an untrusted
    // request. Neither may take down the page, and neither may make the affordance one-shot — a
    // player who swipes out of fullscreen has to be able to get back with one more tap.
    const el = fakeElement();
    const scale = fakeScale({ throws: true });
    installFullscreenOnTap(el, scale, true);
    expect(() => el.fire('pointerup')).not.toThrow();
    expect(() => el.fire('pointerup')).not.toThrow();
    expect(scale.calls).toBe(2);
  });

  it('attaches NOTHING on a device with no touch', () => {
    // 🔴 Found by a full e2e sweep, not by reasoning. Without this guard a desktop CLICK on the
    // wrapper threw the browser into fullscreen, and `session-help-banner.spec.ts` — a spec with
    // nothing to do with touch — failed on `page.setViewportSize` with "To resize
    // minimized/maximized/fullscreen window, restore it to normal state first".
    const el = fakeElement();
    const scale = fakeScale();
    installFullscreenOnTap(el, scale, false);
    el.fire('pointerup');
    expect(scale.calls).toBe(0);
    expect(el.handlers.get('pointerup') ?? []).toHaveLength(0);
  });

  it('detaches when its teardown runs, and is a no-op with no element', () => {
    const el = fakeElement();
    const scale = fakeScale();
    installFullscreenOnTap(el, scale, true)();
    el.fire('pointerup');
    expect(scale.calls).toBe(0);
    expect(() => installFullscreenOnTap(null, scale, true)()).not.toThrow();
  });
});

describe('the production wiring, which no behavioural test can reach', () => {
  // `main.ts` and `config.ts` both name Phaser VALUES, so `npm run test:sim-isolated` cannot import
  // them and the only available gate is their source text. That is the weaker of the two shapes
  // CLAUDE.md names, and it is used here because the stronger one is not reachable — not as a
  // preference. The behavioural cases above carry the logic; these two carry the composition.
  const main = readFileSync('src/main.ts', 'utf8');
  const config = readFileSync('src/game/config.ts', 'utf8');

  it('installs the listener on the WRAPPER, which is what the rotate overlay lives inside', () => {
    // `#rotate` is a <div> above the canvas: Phaser's input never sees a tap on it, and that tap is
    // the one that matters — it is the only gesture a stuck player is offered. A listener on the
    // canvas would miss exactly the case this exists for.
    expect(main).toContain(
      "installFullscreenOnTap(document.getElementById('game'), game.scale, game.device.input.touch)",
    );
  });

  it("sends the WRAPPER fullscreen, so the overlay is inside the fullscreen subtree", () => {
    // 🔴 Without a target Phaser builds its own <div>, moves ONLY the canvas into it and fullscreens
    // that — stranding `#rotate` outside. A phone turned to portrait while fullscreen would then
    // show a frozen game with nothing on screen explaining why.
    expect(config).toContain("fullscreenTarget: 'game'");
  });

  it('does not let the deployed Permissions-Policy deny the feature it just asked for', () => {
    // A header that lists `fullscreen=()` refuses the request silently, and the whole repair
    // becomes a no-op that every test above still passes.
    const headers = readFileSync('vercel.json', 'utf8');
    expect(headers).not.toContain('fullscreen=');
  });
});
