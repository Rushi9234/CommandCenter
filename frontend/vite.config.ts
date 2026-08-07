/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Milestone 18: `test` is a Vitest-only config key -- `vite build`/`vite dev`
// both ignore it entirely, so this changes nothing about the production
// build or dev server. Using plain `vite`'s defineConfig (not
// `vitest/config`'s) keeps this file's runtime behavior unambiguous; the
// triple-slash reference above is only so TypeScript recognizes the
// `test` key without needing a second config file.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
