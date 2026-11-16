import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути: один dist открывается и с корня GitHub Pages, и из /0.1/.
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
});
