import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  // Override vite.config.ts's `root: 'src/web'` so tests anywhere under src/ are picked up.
  root: resolve(__dirname),
  test: {
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['node_modules/**', 'dist/**'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@server': resolve(__dirname, 'src/server'),
      '@web': resolve(__dirname, 'src/web'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
