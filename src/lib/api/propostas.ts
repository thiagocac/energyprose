import { sb, rpc } from '../supabase';

// Propostas comerciais. Toda ESCRITA passa por RPC (o gate de permissão e o
// cálculo do total vivem no banco); a leitura é direta, com o RLS decidindo.

export type StatusProposta = 'rascunho' | 'enviada' | 'aceita' | 'recusada' | 'expirada';

export const ROTULO_STATUS: Record<StatusProposta, string> = {
  rascunho: 'Rascunho', enviada: 'Enviada', aceita: 'Aceita',
  recusada: 'Recusada', expirada: 'Expirada',
};

export type PropostaLinha = {
  id: string; numero: string | null; revision: number; tipo: string; linha: string;
  titulo: string | null; validade: string | null; status: StatusProposta;
  valor_total: number; cadastro_id: string | null; contrato_id: string | null;
  followup_at: string | null; sent_at: string | null; pdf_path: string | null;
  cliente: string | null; cidade: string | null;
  potencia_kwp: number | null; modulo_qtd: number | null;
};

export type ItemProposta = {
  catalogo_id?: string | null;
  descricao: string; unidade: string | null; tipo_cobranca: string | null;
  quantidade: number; preco_unitario: number; desconto_pct: number;
};

export type Sistema = {
  modulo_id: string | null; modulo_qtd: number | null; modulo_descricao: string | null;
  inversor_id: string | null; inversor_descricao: string | null;
  potencia_instalada_kwp: number | null; geracao_media_kwh_mes: number | null;
  hsp: number | null; pr: number | null;
  garantia_modulos_anos: number | null; garantia_inversor_anos: number | null;
  observacoes_tecnicas: string | null;
};

export type PropostaCompleta = {
  id: string; numero: string | null; revision: number; tipo: string;
  linha: string;
  cadastro_id: string | null; titulo: string | null; validade: string | null;
  status: StatusProposta; condicao_pagamento: string | null;
  prazo_execucao: string | null; observacoes: string | null;
  valor_total: number;
  recipient_name: string | null; recipient_email: string | null; recipient_whatsapp: string | null;
  itens: ItemProposta[];
  sistema: Sistema | null;
};

const SELECAO = `
  id, numero, revision, tipo, linha, titulo, validade, status, valor_total, cadastro_id,
  contrato_id, followup_at, sent_at, pdf_path,
  cadastros ( nome, cidade ),
  proposta_sistema ( potencia_instalada_kwp, modulo_qtd )`;

export async function listarPropostas(): Promise<PropostaLinha[]> {
  const { data, error } = await sb.from('propostas').select(SELECAO)
    .is('deleted_at', null).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const linha = r as unknown as Record<string, unknown>;
    const cad = linha.cadastros as { nome?: string; cidade?: string } | null;
    const sis = linha.proposta_sistema as { potencia_instalada_kwp?: number; modulo_qtd?: number } | null;
    return {
      id: String(linha.id), numero: (linha.numero as string) ?? null,
      revision: Number(linha.revision) || 0, tipo: String(linha.tipo ?? 'usina'),
      linha: String(linha.linha ?? 'usina_fotovoltaica'),
      titulo: (linha.titulo as string) ?? null, validade: (linha.validade as string) ?? null,
      status: (linha.status as StatusProposta) ?? 'rascunho',
      valor_total: Number(linha.valor_total) || 0,
      cadastro_id: (linha.cadastro_id as string) ?? null,
      contrato_id: (linha.contrato_id as string) ?? null,
      followup_at: (linha.followup_at as string) ?? null,
      sent_at: (linha.sent_at as string) ?? null,
      pdf_path: (linha.pdf_path as string) ?? null,
      cliente: cad?.nome ?? null, cidade: cad?.cidade ?? null,
      potencia_kwp: sis?.potencia_instalada_kwp ?? null,
      modulo_qtd: sis?.modulo_qtd ?? null,
    };
  });
}

export async function obterProposta(id: string): Promise<PropostaCompleta> {
  const [cab, itens, sis] = await Promise.all([
    sb.from('propostas').select('*').eq('id', id).is('deleted_at', null).single(),
    sb.from('proposta_itens')
      .select('catalogo_id, descricao, unidade, tipo_cobranca, quantidade, preco_unitario, desconto_pct')
      .eq('proposta_id', id).is('deleted_at', null).order('ordem'),
    sb.from('proposta_sistema').select('*').eq('proposta_id', id).maybeSingle(),
  ]);
  if (cab.error) throw new Error(cab.error.message);
  if (itens.error) throw new Error(itens.error.message);
  // O erro do bloco do sistema era ignorado: a proposta abria sem sistema e era
  // salva assim, apagando o que estava gravado.
  if (sis.error) throw new Error(sis.error.message);
  const p = cab.data as Record<string, unknown>;
  return {
    id: String(p.id), numero: (p.numero as string) ?? null, revision: Number(p.revision) || 0,
    tipo: String(p.tipo ?? 'usina'), linha: String(p.linha ?? 'usina_fotovoltaica'),
    cadastro_id: (p.cadastro_id as string) ?? null,
    titulo: (p.titulo as string) ?? null, validade: (p.validade as string) ?? null,
    status: (p.status as StatusProposta) ?? 'rascunho',
    condicao_pagamento: (p.condicao_pagamento as string) ?? null,
    prazo_execucao: (p.prazo_execucao as string) ?? null,
    observacoes: (p.observacoes as string) ?? null,
    valor_total: Number(p.valor_total) || 0,
    recipient_name: (p.recipient_name as string) ?? null,
    recipient_email: (p.recipient_email as string) ?? null,
    recipient_whatsapp: (p.recipient_whatsapp as string) ?? null,
    itens: (itens.data ?? []).map((i) => {
      const it = i as unknown as Record<string, unknown>;
      return {
        catalogo_id: (it.catalogo_id as string) ?? null,
        descricao: String(it.descricao ?? ''), unidade: (it.unidade as string) ?? null,
        tipo_cobranca: (it.tipo_cobranca as string) ?? null,
        quantidade: Number(it.quantidade) || 0,
        preco_unitario: Number(it.preco_unitario) || 0,
        desconto_pct: Number(it.desconto_pct) || 0,
      };
    }),
    sistema: (sis.data as Sistema | null) ?? null,
  };
}

export const salvarProposta = (payload: Record<string, unknown>) =>
  rpc<string>('save_proposta', { p_payload: payload });

export const duplicarProposta = (id: string) =>
  rpc<string>('duplicar_proposta', { p_id: id });

/** Congela a revisão, gera o token público e marca como enviada. */
export const prepararEnvio = (id: string, email?: string | null, nome?: string | null, whatsapp?: string | null) =>
  rpc<{ token: string; expira_em: string; proposta_id: string }>('preparar_envio_proposta', {
    p_id: id, p_email: email || null, p_nome: nome || null, p_whatsapp: whatsapp || null, p_dias: 30,
  });

export const converterEmContrato = (id: string) =>
  rpc<{ contrato_id: string; idempotente: boolean }>('converter_proposta_em_contrato', { p_id: id });

/** Rascunho vai para a lixeira lógica; o resto tem trilha e não se apaga. */
export async function arquivarProposta(id: string) {
  // `.select()` é essencial: UPDATE barrado pelo RLS não devolve erro, só afeta
  // zero linhas — a tela dizia "Rascunho arquivado" sem ter arquivado nada.
  const { data, error } = await sb.from('propostas')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'rascunho').select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error('Nada foi arquivado: só rascunho pode ser arquivado, e só por quem tem permissão.');
  }
}
