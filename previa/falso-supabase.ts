// Substitui src/lib/supabase.ts SÓ na prévia. Nenhuma chamada sai do container.
import { CADASTROS, PROPOSTAS, LINHAS, EQUIPAMENTOS, SERVICOS, CONFIG, FUNIL, PUBLICA } from './dados';

export const SUPABASE_URL = 'https://exemplo.invalido';
export const SUPABASE_KEY = 'previa';

const TABELAS: Record<string, unknown[]> = {
  cadastros: CADASTROS,
  propostas: PROPOSTAS,
  linhas_servico: LINHAS,
  equipamentos_catalogo: EQUIPAMENTOS,
  servicos_catalogo: SERVICOS,
  config_empresa: [CONFIG],
  contratos: [],
  proposta_itens: [],
  proposta_sistema: [],
  perfis: [{ id: 'u1', nome: 'Thiago', email: 'thiago@consultegeo.com.br', papel: 'admin', ativo: true }],
};

const ENCADEAVEIS = ['select', 'eq', 'neq', 'in', 'is', 'not', 'or', 'filter', 'match',
  'order', 'limit', 'range', 'gte', 'lte', 'gt', 'lt', 'ilike', 'like', 'contains',
  'insert', 'update', 'upsert', 'delete'];

function consulta(tabela: string) {
  const linhas = () => TABELAS[tabela] ?? [];
  const q: Record<string, unknown> = {};
  for (const m of ENCADEAVEIS) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: linhas()[0] ?? null, error: null });
  q.single = q.maybeSingle;
  q.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve({ data: linhas(), error: null }).then(ok, falha);
  return q;
}

const RPCS: Record<string, unknown> = {
  crm_snapshot: FUNIL,
  proposta_publica_ler: PUBLICA,
  proposta_publica_decidir: { ok: true },
};

export const sb = {
  from: (tabela: string) => consulta(tabela),
  rpc: (nome: string) => Promise.resolve({ data: RPCS[nome] ?? null, error: null }),
  storage: { from: () => ({ download: async () => ({ data: null, error: null }) }) },
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  },
} as unknown as import('@supabase/supabase-js').SupabaseClient;

export async function rpc<T>(nome: string, _args?: Record<string, unknown>): Promise<T> {
  return (RPCS[nome] ?? null) as T;
}
