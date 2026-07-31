import { sb } from '../supabase';

// Catálogos e referências que a tela de propostas consome.

export type Servico = {
  id: string; codigo: string; nome: string; descricao: string | null;
  categoria: string; linha: string | null; unidade: string; tipo_cobranca: string;
  preco_sugerido: number; ativo: boolean;
};

/**
 * Linha de serviço: o que a Energy PRO vende. `documento` decide qual PDF a
 * proposta gera e `contrato_tipo` diz se aquilo vira contrato — as duas regras
 * moram no banco de propósito, para o front não ter uma segunda versão delas.
 */
export type LinhaServico = {
  codigo: string; nome: string; apelido: string | null; descricao: string;
  documento: 'usina' | 'servico'; contrato_tipo: 'usina' | 'manutencao' | null;
  ordem: number;
};

export type Equipamento = {
  id: string; tipo: 'modulo' | 'inversor' | 'bateria' | 'outro';
  fabricante: string; modelo: string;
  potencia_wp: number | null; potencia_kw: number | null;
  garantia_produto_anos: number | null; garantia_geracao_anos: number | null;
  ativo: boolean;
};

export type CadastroRef = {
  id: string; nome: string; cidade: string | null; uf: string | null;
  consumo_medio_kwh: number | null; valor_medio_conta: number | null;
  tipo_telhado: string | null; zona: string | null;
  whatsapp: string | null; email: string | null;
};

export type ConfigEmpresa = {
  validade_proposta_dias: number; hsp_default: number; pr_default: number;
  prazo_entrega_min_dias: number; prazo_entrega_max_dias: number;
};

/** Texto que vai impresso no PDF — congelado na proposta, não recalculado depois. */
export function descreverEquipamento(e: Equipamento): string {
  const potencia = e.tipo === 'modulo'
    ? (e.potencia_wp ? ` ${e.potencia_wp} Wp` : '')
    : (e.potencia_kw ? ` ${String(e.potencia_kw).replace('.', ',')} kW` : '');
  return `${e.fabricante} ${e.modelo}${potencia}`;
}

export async function listarLinhas(): Promise<LinhaServico[]> {
  const { data, error } = await sb.from('linhas_servico')
    .select('codigo, nome, apelido, descricao, documento, contrato_tipo, ordem')
    .eq('ativo', true).order('ordem');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LinhaServico[];
}

export async function listarServicos(somenteAtivos = true): Promise<Servico[]> {
  let q = sb.from('servicos_catalogo')
    .select('id, codigo, nome, descricao, categoria, linha, unidade, tipo_cobranca, preco_sugerido, ativo')
    .is('deleted_at', null).order('codigo');
  if (somenteAtivos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Servico[];
}

export async function listarEquipamentos(): Promise<Equipamento[]> {
  const { data, error } = await sb.from('equipamentos_catalogo')
    .select('id, tipo, fabricante, modelo, potencia_wp, potencia_kw, garantia_produto_anos, garantia_geracao_anos, ativo')
    .is('deleted_at', null).eq('ativo', true).order('fabricante');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Equipamento[];
}

export async function listarCadastrosRef(): Promise<CadastroRef[]> {
  const { data, error } = await sb.from('cadastros')
    .select('id, nome, cidade, uf, consumo_medio_kwh, valor_medio_conta, tipo_telhado, zona, whatsapp, email')
    .neq('status', 'rascunho').order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CadastroRef[];
}

export async function obterConfigEmpresa(): Promise<ConfigEmpresa> {
  const { data, error } = await sb.from('config_empresa')
    .select('validade_proposta_dias, hsp_default, pr_default, prazo_entrega_min_dias, prazo_entrega_max_dias')
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ConfigEmpresa;
}

// ===== Escrita nos catálogos =====
// Direto na tabela: o RLS já restringe a admin/vendedor, então não há RPC no meio.
// O `codigo` do serviço é a chave de negócio e NÃO muda depois de usado numa
// proposta — a descrição impressa fica congelada lá, mas o código é o que liga
// os dois lados nos relatórios.

export async function salvarServico(s: Partial<Servico> & { nome: string; codigo: string }): Promise<void> {
  // Sem esta guarda, salvar sem código estourava um "Cannot read properties of
  // undefined (reading 'trim')" no banner — erro de programador na cara de quem
  // só esqueceu de preencher um campo.
  if (!String(s.codigo ?? '').trim()) throw new Error('Informe o código do serviço.');
  if (!String(s.nome ?? '').trim()) throw new Error('Informe o nome do serviço.');
  const dados = {
    codigo: s.codigo.trim().toUpperCase(), nome: s.nome.trim(),
    descricao: s.descricao ?? null, categoria: s.categoria ?? 'servico',
    linha: s.linha || null,
    unidade: s.unidade ?? 'un', tipo_cobranca: s.tipo_cobranca ?? 'avulso',
    preco_sugerido: Number(s.preco_sugerido) || 0, ativo: s.ativo !== false,
  };
  const { data, error } = s.id
    ? await sb.from('servicos_catalogo').update(dados).eq('id', s.id).select('id')
    : await sb.from('servicos_catalogo').insert(dados).select('id');
  if (error) {
    if (error.code === '23505') throw new Error(`Já existe um serviço com o código ${dados.codigo}.`);
    throw new Error(error.message);
  }
  if (!data?.length) throw new Error('Nada foi salvo: seu papel não permite alterar o catálogo.');
}

export async function salvarEquipamento(
  e: Partial<Equipamento> & { tipo: Equipamento['tipo']; fabricante: string; modelo: string },
): Promise<void> {
  if (e.tipo === 'modulo' && !e.potencia_wp) throw new Error('Módulo precisa da potência em Wp.');
  if (e.tipo === 'inversor' && !e.potencia_kw) throw new Error('Inversor precisa da potência em kW.');
  if (!String(e.fabricante ?? '').trim()) throw new Error('Informe o fabricante.');
  if (!String(e.modelo ?? '').trim()) throw new Error('Informe o modelo.');
  const dados = {
    tipo: e.tipo, fabricante: e.fabricante.trim(), modelo: e.modelo.trim(),
    potencia_wp: e.tipo === 'modulo' ? Number(e.potencia_wp) || null : null,
    potencia_kw: e.tipo === 'inversor' ? Number(e.potencia_kw) || null : null,
    garantia_produto_anos: e.garantia_produto_anos ? Number(e.garantia_produto_anos) : null,
    garantia_geracao_anos: e.garantia_geracao_anos ? Number(e.garantia_geracao_anos) : null,
    ativo: e.ativo !== false,
  };
  const { data, error } = e.id
    ? await sb.from('equipamentos_catalogo').update(dados).eq('id', e.id).select('id')
    : await sb.from('equipamentos_catalogo').insert(dados).select('id');
  if (error) {
    if (error.code === '23505') throw new Error(`${dados.fabricante} ${dados.modelo} já está no catálogo.`);
    throw new Error(error.message);
  }
  if (!data?.length) throw new Error('Nada foi salvo: seu papel não permite alterar o catálogo.');
}

/**
 * Desativa em vez de apagar: propostas antigas apontam para o equipamento, e
 * apagar quebraria o vínculo. Desativado some das listas de escolha e continua
 * respondendo pelo histórico.
 */
export async function alternarAtivo(tabela: 'servicos_catalogo' | 'equipamentos_catalogo', id: string, ativo: boolean) {
  // Sem `.select()` um bloqueio de RLS passaria por sucesso — ver nota em configuracao.ts.
  const { data, error } = await sb.from(tabela).update({ ativo }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Nada foi alterado: seu papel não permite mexer no catálogo.');
}

/** Lista todos, inclusive inativos — a tela de catálogo precisa mostrar os dois. */
export async function listarEquipamentosTodos(): Promise<Equipamento[]> {
  const { data, error } = await sb.from('equipamentos_catalogo')
    .select('id, tipo, fabricante, modelo, potencia_wp, potencia_kw, garantia_produto_anos, garantia_geracao_anos, ativo')
    .is('deleted_at', null).order('tipo').order('fabricante');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Equipamento[];
}
