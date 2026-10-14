import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const r = (p) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  server: { port: 3100 },
  resolve: {
    alias: {
      '@labrute/core': r('./src/core/index.ts'),
      '@labrute/prisma': r('./src/prisma-shim.ts'),
    },
  },
});
