import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built site works from any folder on Hostinger.
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    // Three.js lives in its own lazily loaded chunk (~150 kB gzipped).
    chunkSizeWarningLimit: 700,
  },
});
