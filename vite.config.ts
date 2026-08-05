/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Vault A8: this file MUST keep the `.ts` extension. If Vite ever warns about its config
// loader, adding a `.js` config silences the warning AND breaks the loader. A warning
// going quiet is not evidence the underlying thing works.
//
// Nothing here imports Phaser, which is what lets QA criterion 1.3 (run the sim suite with
// Phaser uninstalled) work at all — vitest has to be able to load this file without it.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
