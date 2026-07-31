import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O app vive sob /painel/ porque a raiz do site pertence ao formulário público,
// que continua estático e intocado. O script scripts/montar-dist.mjs junta os
// dois em dist/ depois do build.
export default defineConfig({
  base: '/painel/',
  plugins: [react()],
  build: {
    outDir: 'dist/painel',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: { port: 5173 },
});
