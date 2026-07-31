import { createClient } from '@supabase/supabase-js';

// Mesmas credenciais do formulário público (publico/comum.js) e de propósito:
// é o MESMO projeto e o MESMO login. A chave publishable é pública por natureza —
// quem protege os dados é o RLS, não o segredo da chave.
export const SUPABASE_URL = 'https://mgcgmdiymqpxcsxhelhs.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_2U-173FaGroKdHyFV6LqdA_69oe4CYo';

// A chave de storage da sessão é derivada do ref do projeto, então a sessão é
// COMPARTILHADA com o painel legado (/cadastros) enquanto os dois convivem:
// entrar num lado já entra no outro.
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Chama uma RPC e devolve o dado já tipado, transformando erro em exceção. */
export async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(nome, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}
