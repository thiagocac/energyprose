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
  preparar_envio_proposta: { token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', dias: 30 },
  save_crm_activity: 'a9',
  move_crm_lead: 'l1',
  duplicar_proposta: 'p9',
  converter_proposta_em_contrato: 'ct1',
};

export const sb = {
  from: (tabela: string) => consulta(tabela),
  rpc: (nome: string) => Promise.resolve({ data: RPCS[nome] ?? null, error: null }),
  storage: { from: () => ({ download: async () => ({ data: null, error: null }) }) },
  auth: {
    getSession: async () => ({ data: { session: { access_token: 'previa' } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
    // Na prévia a senha "certa" é `previa-atual`: assim dá para fotografar
    // tanto o caminho feliz quanto o erro de senha atual errada.
    signInWithPassword: async ({ password }: { password: string }) =>
      (password === 'previa-atual'
        ? { data: {}, error: null }
        : { data: null, error: { message: 'Invalid login credentials' } }),
    updateUser: async () => ({ data: {}, error: null }),
  },
} as unknown as import('@supabase/supabase-js').SupabaseClient;

export async function rpc<T>(nome: string, _args?: Record<string, unknown>): Promise<T> {
  return (RPCS[nome] ?? null) as T;
}
