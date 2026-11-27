import path from 'node:path';
import { defineConfig } from 'vite';
import { cabalPwa } from './pwa';

export default defineConfig({
  // Относительные пути: один dist открывается и с корня GitHub Pages, и из /0.1/.
  // Манифест и service worker считают адреса так же. В одиночный HTML они не входят.
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [cabalPwa()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        range: path.resolve(__dirname, 'range.html'),
      },
    },
  },
});
