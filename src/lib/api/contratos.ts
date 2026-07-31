import { sb, rpc } from '../supabase';

// Contratos. Leitura direta (o RLS decide); escrita por RPC, que é onde moram
// as regras que o CHECK do banco não pega — vigência invertida, limpeza dos
// campos de recorrência num contrato de obra, carimbo da data de assinatura.

export type StatusContrato =
  'rascunho' | 'enviado' | 'assinado' | 'em_execucao' | 'concluido' | 'cancelado';

export const ROTULO_STATUS_CONTRATO: Record<StatusContrato, string> = {
  rascunho: 'Rascunho', enviado: 'Enviado', assinado: 'Assinado',
  em_execucao: 'Em execução', concluido: 'Concluído', cancelado: 'Cancelado',
};

/** Ordem em que o contrato costuma andar — alimenta o seletor de status. */
export const FLUXO_STATUS: StatusContrato[] = [
  'rascunho', 'enviado', 'assinado', 'em_execucao', 'concluido', 'cancelado',
];

export type TipoContrato = 'usina' | 'manutencao';

export const ROTULO_TIPO: Record<TipoContrato, string> = {
  usina: 'Fornecimento e instalação',
  manutencao: 'Plano de manutenção',
};

export type ContratoLinha = {
  id: string; numero: string | null; tipo: TipoContrato;
  descricao: string | null; status: StatusContrato; valor_total: number;
  condicao_pagamento: string | null;
  prazo_entrega_min_dias: number | null; prazo_entrega_max_dias: number | null;
  recorrencia: 'mensal' | 'anual' | null; visitas_incluidas: number | null;
  vigencia_inicio: string | null; vigencia_fim: string | null;
  signed_at: string | null; pdf_path: string | null;
  cadastro_id: string; proposta_id: string | null;
  cliente: string | null; cidade: string | null;
  proposta_numero: string | null;
};

const SELECAO = `
  id, numero, tipo, descricao, status, valor_total, condicao_pagamento,
  prazo_entrega_min_dias, prazo_entrega_max_dias, recorrencia, visitas_incluidas,
  vigencia_inicio, vigencia_fim, signed_at, pdf_path, cadastro_id, proposta_id,
  cadastros ( nome, cidade ),
  propostas ( numero )`;

export async function listarContratos(): Promise<ContratoLinha[]> {
  const { data, error } = await sb.from('contratos').select(SELECAO)
    .is('deleted_at', null).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const c = r as unknown as Record<string, unknown>;
    const cad = c.cadastros as { nome?: string; cidade?: string } | null;
    const prop = c.propostas as { numero?: string } | null;
    return {
      id: String(c.id), numero: (c.numero as string) ?? null,
      tipo: (c.tipo as TipoContrato) ?? 'usina',
      descricao: (c.descricao as string) ?? null,
      status: (c.status as StatusContrato) ?? 'rascunho',
      valor_total: Number(c.valor_total) || 0,
      condicao_pagamento: (c.condicao_pagamento as string) ?? null,
      prazo_entrega_min_dias: (c.prazo_entrega_min_dias as number) ?? null,
      prazo_entrega_max_dias: (c.prazo_entrega_max_dias as number) ?? null,
      recorrencia: (c.recorrencia as 'mensal' | 'anual') ?? null,
      visitas_incluidas: (c.visitas_incluidas as number) ?? null,
      vigencia_inicio: (c.vigencia_inicio as string) ?? null,
      vigencia_fim: (c.vigencia_fim as string) ?? null,
      signed_at: (c.signed_at as string) ?? null,
      pdf_path: (c.pdf_path as string) ?? null,
      cadastro_id: String(c.cadastro_id),
      proposta_id: (c.proposta_id as string) ?? null,
      cliente: cad?.nome ?? null, cidade: cad?.cidade ?? null,
      proposta_numero: prop?.numero ?? null,
    };
  });
}

export const salvarContrato = (payload: Record<string, unknown>) =>
  rpc<string>('save_contrato', { p_payload: payload });

export const arquivarContrato = (id: string) =>
  rpc<null>('arquivar_contrato', { p_id: id });

/**
 * O contrato de manutenção só sai completo com recorrência, visitas e vigência.
 * Sem isso o PDF cai nos textos genéricos — e o cliente assina um plano sem
 * periodicidade definida. A tela avisa antes de deixar emitir.
 */
export function lacunasDoContrato(c: ContratoLinha): string[] {
  const faltando: string[] = [];
  if (!c.valor_total) faltando.push('valor');
  if (c.tipo === 'manutencao') {
    if (!c.recorrencia) faltando.push('recorrência');
    if (!c.visitas_incluidas) faltando.push('visitas incluídas');
    if (!c.vigencia_inicio || !c.vigencia_fim) faltando.push('vigência');
  } else if (!c.prazo_entrega_min_dias || !c.prazo_entrega_max_dias) {
    faltando.push('prazo de execução');
  }
  return faltando;
}
