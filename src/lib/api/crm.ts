import { rpc } from '../supabase';

// Espelha o retorno de public.crm_snapshot (migration 10): uma chamada devolve
// tudo que a tela do funil precisa, inclusive os dados do cadastro que o card
// mostra (cidade, consumo, valor da conta).

export type Etapa = {
  id: string; key: string; nome: string; ordem: number;
  probability: number; color: string | null; won: boolean; lost: boolean;
};

export type Lead = {
  id: string; pipeline_id: string; stage_id: string; title: string;
  contact_name: string | null; email: string | null; phone: string | null;
  source: string | null; expected_value: number; probability: number;
  cadastro_id: string | null; next_action_at: string | null; last_contact_at: string | null;
  lost_reason: string | null; created_at: string; updated_at: string;
  cidade: string | null; uf: string | null;
  consumo_medio_kwh: number | null; valor_medio_conta: number | null;
  cadastro_status: string | null; proposta_id: string | null;
};

export type Atividade = {
  id: string; lead_id: string; activity_type: string; subject: string;
  detail: string | null; due_at: string | null; created_at: string;
};

export type Funil = {
  pipeline_id: string;
  pipelines: Array<{ id: string; nome: string; padrao: boolean }>;
  stages: Etapa[];
  leads: Lead[];
  activities: Atividade[];
  kpis: {
    open: number; pipeline_value: number; weighted_value: number;
    overdue_actions: number; ganhos_mes: number; novos_7d: number;
  };
};

export const obterFunil = (pipelineId?: string) =>
  rpc<Funil>('crm_snapshot', { p_pipeline_id: pipelineId ?? null });

export const salvarLead = (payload: Record<string, unknown>) =>
  rpc<string>('save_crm_lead', { p_payload: payload });

export const moverLead = (leadId: string, etapaId: string, motivo?: string) =>
  rpc<string>('move_crm_lead', { p_lead_id: leadId, p_stage_id: etapaId, p_reason: motivo ?? null });

export const registrarAtividade = (payload: Record<string, unknown>) =>
  rpc<string>('save_crm_activity', { p_payload: payload });

export const leadViraProposta = (leadId: string, validade?: string) =>
  rpc<string>('convert_crm_lead_to_proposal', { p_lead_id: leadId, p_validade: validade ?? null });
