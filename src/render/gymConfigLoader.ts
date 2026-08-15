/**
 * The Gym's bounds-config fetch, split out of `GymScene` (HANDOFF §4 step 6a / W7) to keep that
 * file under the 400-line ceiling and to put the one part of `loadConfig` worth testing — response
 * handling, not the scene's own state assignment — where a unit test can reach it without a
 * running scene.
 *
 * **Engine-free**: imports no Phaser. It does call the global `fetch`, same as the code it
 * replaced, so a test exercising the network path stubs `globalThis.fetch` rather than mocking a
 * Phaser scene.
 */

import { configPathFor, editsFromConfig, emptyEdits, type BoundsEdits } from './gymBounds';

export interface BoundsConfigResult {
  rawConfig: unknown;
  edits: BoundsEdits;
  /** `null` on success. Not fatal to the caller — measuring and looking are the Gym's main jobs
   *  and neither needs the config; only saving is refused (vault 4.16). */
  error: string | null;
}

/**
 * Fetch a slug's bounds config and derive the Gym's starting edits from it.
 *
 * Fetched rather than imported so the Gym reads the SHIPPED bytes — the same file the build
 * reads — and so a save round-trips every provenance note in it untouched.
 */
export async function loadBoundsConfig(slug: string): Promise<BoundsConfigResult> {
  try {
    const response = await fetch(configPathFor(slug));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rawConfig = await response.json();
    return { rawConfig, edits: editsFromConfig(rawConfig), error: null };
  } catch (error) {
    return { rawConfig: null, edits: emptyEdits(), error: String(error) };
  }
}
