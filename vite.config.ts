import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

const SERVER_PORT = 7777;
const WEB_PORT = 5173;

export default defineConfig({
  plugins: [svelte()],
  root: 'src/web',
  resolve: {
    alias: {
      '@web': resolve(__dirname, 'src/web'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${SERVER_PORT}`,
      '/sse': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
