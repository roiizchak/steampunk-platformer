import Phaser from 'phaser';
import { devSeam } from './debug/devSeam';
import { gameConfig } from './game/config';
import { installDebugGlobals } from './debug/globals';

installDebugGlobals();

const game = new Phaser.Game(gameConfig);

// DEV ONLY, and on the same side of the build gate as window.__game (vault 1.6). Vite folds
// `import.meta.env.DEV` to false in a production build, so this whole block is dropped.
//
// Exists so the e2e suite can restart the Boot scene. That is not a hypothetical: a restart
// re-enters Boot with the game-global texture and JSON caches already populated, which made
// the entire refuse-to-route gate a no-op. Without a handle, that regression cannot be tested
// from the outside at all.
if (import.meta.env.DEV) {
  devSeam('__DEVSEAM_main_phaserGameHandle__');
  (window as unknown as { __phaserGame: Phaser.Game }).__phaserGame = game;
}
