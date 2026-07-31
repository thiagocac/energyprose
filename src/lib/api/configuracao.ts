import { sb } from '../supabase';

// Configuração da empresa: linha única (id = true) que alimenta o PDF e os
// valores padrão das propostas. Escrita direta na tabela — o RLS restringe a
// admin, então não há RPC no meio.

/** Ícones disponíveis no gerador de PDF (src/glifos + icons do layout). */
export const ICONES = [
  'panel', 'panelSun', 'inverter', 'bolt', 'chart', 'shield', 'savings', 'leaf',
  'phoneApp', 'wrench', 'home', 'star', 'activity', 'money', 'card', 'users',
  'calendarCheck', 'checkCircle', 'headset', 'frame', 'cable', 'plug', 'dpsCc',
  'cabinet', 'breaker', 'worker', 'blueprint', 'stamp', 'building', 'checklist',
  'gear', 'sun', 'calendar', 'pin', 'user', 'whatsapp', 'instagram',
] as const;

export type Beneficio = { icone: string; titulo: string; sub: string };
export type ItemIncluso = { icone: string; texto: string };
export type Condicao = { icone: string; titulo: string; detalhe: string };

/**
 * Campos que o CONTRATO imprime e que, em branco, saem como "—" num documento
 * que vai a cartório. A tela avisa em vez de deixar descobrir na assinatura.
 */
export const OBRIGATORIOS_NO_CONTRATO: Array<[keyof Configuracao, string]> = [
  ['razao_social', 'razão social'],
  ['cnpj', 'CNPJ'],
  ['endereco', 'endereço'],
  ['engenheiro_nome', 'responsável técnico'],
  ['engenheiro_crea', 'CREA'],
];

export function lacunasDaEmpresa(c: Configuracao): string[] {
  return OBRIGATORIOS_NO_CONTRATO
    .filter(([campo]) => !String(c[campo] ?? '').trim())
    .map(([, rotulo]) => rotulo);
}

export type Configuracao = {
  nome_exibicao: string; razao_social: string | null; cnpj: string | null;
  endereco: string | null; cidade: string | null; uf: string | null;
  whatsapp: string | null; instagram: string | null; email_comercial: string | null;
  engenheiro_nome: string | null; engenheiro_titulo: string | null; engenheiro_crea: string | null;
  validade_proposta_dias: number;
  dias_followup: number;
  prazo_entrega_min_dias: number; prazo_entrega_max_dias: number;
  hsp_default: number; pr_default: number;
  economia_max_pct: number; garantia_instalacao_meses: number;
  beneficios: Beneficio[]; itens_inclusos: ItemIncluso[]; condicoes_pagamento: Condicao[];
  nota_rodape: string | null;
};

export async function obterConfiguracao(): Promise<Configuracao> {
  const { data, error } = await sb.from('config_empresa').select('*').eq('id', true).single();
  if (error) throw new Error(error.message);
  const c = data as unknown as Configuracao;
  return {
    ...c,
    beneficios: Array.isArray(c.beneficios) ? c.beneficios : [],
    itens_inclusos: Array.isArray(c.itens_inclusos) ? c.itens_inclusos : [],
    condicoes_pagamento: Array.isArray(c.condicoes_pagamento) ? c.condicoes_pagamento : [],
  };
}

export async function salvarConfiguracao(c: Configuracao): Promise<void> {
  // Os limites também existem como CHECK no banco; validamos aqui só para o
  // usuário receber a mensagem em português em vez do erro do Postgres.
  if (c.validade_proposta_dias < 1 || c.validade_proposta_dias > 180) {
    throw new Error('A validade da proposta precisa ficar entre 1 e 180 dias.');
  }
  if (c.dias_followup < 1 || c.dias_followup > 60) {
    throw new Error('O prazo de follow-up precisa ficar entre 1 e 60 dias.');
  }
  if (c.prazo_entrega_min_dias > c.prazo_entrega_max_dias) {
    throw new Error('O prazo mínimo de entrega não pode ser maior que o máximo.');
  }
  if (c.hsp_default <= 0 || c.hsp_default >= 12) throw new Error('HSP precisa ficar entre 0 e 12.');
  if (c.pr_default <= 0 || c.pr_default > 1) throw new Error('PR precisa ficar entre 0 e 1 (ex.: 0,75).');

  // `.select()` é essencial: um UPDATE barrado pelo RLS NÃO devolve erro, apenas
  // afeta zero linhas. Sem pedir as linhas de volta, um vendedor veria
  // "salvo com sucesso" e nada teria sido gravado.
  const { data, error } = await sb.from('config_empresa').update({
    nome_exibicao: c.nome_exibicao, razao_social: c.razao_social, cnpj: c.cnpj,
    endereco: c.endereco, cidade: c.cidade, uf: c.uf,
    whatsapp: (c.whatsapp ?? '').replace(/\D/g, '') || null,
    instagram: c.instagram, email_comercial: c.email_comercial,
    engenheiro_nome: c.engenheiro_nome, engenheiro_titulo: c.engenheiro_titulo,
    engenheiro_crea: c.engenheiro_crea,
    validade_proposta_dias: c.validade_proposta_dias,
    dias_followup: c.dias_followup,
    prazo_entrega_min_dias: c.prazo_entrega_min_dias,
    prazo_entrega_max_dias: c.prazo_entrega_max_dias,
    hsp_default: c.hsp_default, pr_default: c.pr_default,
    economia_max_pct: c.economia_max_pct,
    garantia_instalacao_meses: c.garantia_instalacao_meses,
    beneficios: c.beneficios, itens_inclusos: c.itens_inclusos,
    condicoes_pagamento: c.condicoes_pagamento, nota_rodape: c.nota_rodape,
  }).eq('id', true).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error('Nada foi salvo: só um administrador pode alterar a configuração.');
  }
}
