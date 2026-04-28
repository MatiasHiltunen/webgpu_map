import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: true,
    modulePreload: {
      polyfill: false
    },
    outDir: 'dist-demo',
    target: 'esnext'
  }
});
