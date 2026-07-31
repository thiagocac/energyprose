// ============================================================================
// Config SÓ da prévia visual. Monta as telas reais com dados de mentira, para
// conferir layout em largura de celular sem depender de rede nem de login.
//
// A troca é por resolução de módulo: qualquer import que termine em `/supabase`
// ou `/auth` vindo de src/ cai nos fakes de previa/. Assim os componentes são
// os DE VERDADE — nada de cópia paralela que envelhece.
// ============================================================================
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const aqui = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: aqui('./previa'),
  plugins: [
    {
      name: 'previa-trocar-dependencias',
      enforce: 'pre',
      resolveId(origem: string) {
        // `endsWith` e não regex: os imports reais são `../supabase`,
        // `./lib/supabase` e `../lib/supabase`. `@supabase/supabase-js`
        // termina em `-js`, então não é pego por engano.
        if (origem.endsWith('/supabase')) return aqui('./previa/falso-supabase.ts');
        if (origem.endsWith('/auth')) return aqui('./previa/falso-auth.tsx');
        return null;
      },
    },
    react(),
  ],
  build: { outDir: aqui('./previa-dist'), emptyOutDir: true },
});
