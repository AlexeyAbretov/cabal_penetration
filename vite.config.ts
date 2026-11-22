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
});
