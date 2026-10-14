import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const r = (p) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  // En GitHub Pages el sitio vive en /<repo>/: el workflow pasa la ruta en BASE_PATH
  base: process.env.BASE_PATH || '/',
  server: { port: 3100 },
  resolve: {
    alias: {
      '@labrute/core': r('./src/core/index.ts'),
      '@labrute/prisma': r('./src/prisma-shim.ts'),
    },
  },
});
