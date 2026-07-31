import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cabecalho } from '../componentes/Layout';
import { useAuth } from '../lib/auth';
import { moeda, numero, relativo, linkWhatsapp } from '../lib/formato';
import { obterFunil, moverLead, leadViraProposta, type Lead, type Etapa } from '../lib/api/crm';

export function Funil() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState('');

  const funil = useQuery({ queryKey: ['funil'], queryFn: () => obterFunil() });

  const mover = useMutation({
    mutationFn: ({ lead, etapa }: { lead: string; etapa: string }) => moverLead(lead, etapa),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['funil'] }),
    onError: (e: Error) => setErro(e.message),
  });
  const converter = useMutation({
    mutationFn: (lead: string) => leadViraProposta(lead),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['funil'] }),
    onError: (e: Error) => setErro(e.message),
  });

  const ultimaAtividade = useMemo(
    () => new Map((funil.data?.activities ?? []).map((a) => [a.lead_id, a])),
    [funil.data?.activities],
  );

  if (funil.isLoading) return <div className="carregando">Carregando o funil…</div>;
  if (funil.error) return <div className="aviso erro">{(funil.error as Error).message}</div>;
  const d = funil.data!;

  return (
    <>
      <Cabecalho
        kicker="Comercial"
        titulo="Funil de vendas"
        sub="Todo cadastro enviado pelo site entra aqui automaticamente, com o consumo e o valor da conta já no card."
      />

      {erro ? <div className="aviso erro" style={{ marginBottom: 16 }}>{erro}</div> : null}

      <div className="kpis">
        <Kpi rot="Oportunidades abertas" val={numero(d.kpis.open)} />
        <Kpi rot="Pipeline bruto" val={moeda(d.kpis.pipeline_value)} />
        <Kpi rot="Pipeline ponderado" val={moeda(d.kpis.weighted_value)} />
        <Kpi rot="Ações vencidas" val={numero(d.kpis.overdue_actions)} alerta={d.kpis.overdue_actions > 0} />
        <Kpi rot="Novos em 7 dias" val={numero(d.kpis.novos_7d)} />
      </div>

      <div className="funil">
        {d.stages.map((etapa) => {
          const leads = d.leads.filter((l) => l.stage_id === etapa.id);
          return (
            <section className="coluna" key={etapa.id}>
              <div className="topo" style={{ background: etapa.color ?? '#64748B' }} />
              <header>
                <span className="cont">{leads.length} oportunidade{leads.length === 1 ? '' : 's'}</span>
                <h2>{etapa.nome}</h2>
              </header>
              <div className="cards">
                {leads.length === 0 ? <p className="vazio">Nenhuma nesta etapa.</p> : leads.map((lead) => (
                  <CardLead
                    key={lead.id}
                    lead={lead}
                    etapas={d.stages}
                    atividade={ultimaAtividade.get(lead.id)?.subject ?? null}
                    podeEditar={pode('escrever')}
                    ocupado={mover.isPending || converter.isPending}
                    aoMover={(etapaId) => mover.mutate({ lead: lead.id, etapa: etapaId })}
                    aoConverter={() => converter.mutate(lead.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Kpi({ rot, val, alerta }: { rot: string; val: string; alerta?: boolean }) {
  return (
    <div className="cartao kpi">
      <div className="rot">{rot}</div>
      <div className={`val${alerta ? ' alerta' : ''}`}>{val}</div>
    </div>
  );
}

function CardLead({ lead, etapas, atividade, podeEditar, ocupado, aoMover, aoConverter }: {
  lead: Lead; etapas: Etapa[]; atividade: string | null; podeEditar: boolean; ocupado: boolean;
  aoMover: (etapaId: string) => void; aoConverter: () => void;
}) {
  const vencida = !!lead.next_action_at && new Date(lead.next_action_at) < new Date();
  const etapa = etapas.find((e) => e.id === lead.stage_id);

  return (
    <article className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div className="tit">{lead.title}</div>
        <span className={`pilula${etapa?.won ? ' bom' : etapa?.lost ? ' ruim' : ''}`}>{numero(lead.probability)}%</span>
      </div>
      <div className="meta">
        {lead.cidade ?? 'Cidade não informada'}
        {lead.source ? ` · ${lead.source}` : ''}
      </div>

      <div className="valor">{moeda(lead.expected_value)}</div>

      <div className="medidas">
        {lead.consumo_medio_kwh ? <span className="pilula">{numero(lead.consumo_medio_kwh)} kWh/mês</span> : null}
        {lead.valor_medio_conta ? <span className="pilula quente">conta {moeda(lead.valor_medio_conta)}</span> : null}
      </div>

      {lead.next_action_at ? (
        <div className="meta" style={{ marginTop: 7, color: vencida ? 'var(--ruim)' : undefined, fontWeight: vencida ? 600 : 400 }}>
          Próxima ação {relativo(lead.next_action_at)}
        </div>
      ) : null}

      {atividade ? <div className="meta" style={{ marginTop: 6, fontStyle: 'italic' }}>{atividade}</div> : null}

      {podeEditar ? (
        <>
          <label className="campo" style={{ marginTop: 10, marginBottom: 8 }}>
            <span>Etapa</span>
            <select value={lead.stage_id} disabled={ocupado} onChange={(e) => aoMover(e.target.value)}>
              {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {lead.proposta_id
              ? <span className="pilula bom">proposta criada</span>
              : <button className="botao discreto" disabled={ocupado} onClick={aoConverter}>Criar proposta</button>}
            {lead.phone ? (
              <a className="botao discreto" target="_blank" rel="noreferrer"
                 href={linkWhatsapp(lead.phone, `Olá, ${lead.contact_name ?? ''}! Aqui é da Energy PRO.`)}>
                WhatsApp
              </a>
            ) : null}
            {lead.cadastro_id ? <a className="botao discreto" href={`/cadastros/${lead.cadastro_id}`}>Ficha</a> : null}
          </div>
        </>
      ) : null}
    </article>
  );
}
