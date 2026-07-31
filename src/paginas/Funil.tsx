import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cabecalho } from '../componentes/Layout';
import { useAuth } from '../lib/auth';
import { moeda, numero, relativo, linkWhatsapp } from '../lib/formato';
import { obterFunil, moverLead, leadViraProposta, type Funil as DadosFunil, type Lead, type Etapa } from '../lib/api/crm';
import { gerarDocumentoPdf, abrirAbaDiferida } from '../lib/api/documentos';

export function Funil() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState('');

  const funil = useQuery({ queryKey: ['funil'], queryFn: () => obterFunil() });

  /**
   * Mover é otimista: o card muda de coluna antes da resposta do servidor.
   *
   * Arrastar e ver o card voltar para a origem por meio segundo até o servidor
   * responder passa a sensação de que o gesto falhou. Se a RPC recusar, o
   * `onError` devolve o quadro exato de antes — `onMutate` guarda a cópia — e a
   * mensagem explica o motivo.
   */
  const mover = useMutation({
    mutationFn: ({ lead, etapa }: { lead: string; etapa: string }) => moverLead(lead, etapa),
    onMutate: async ({ lead, etapa }) => {
      await qc.cancelQueries({ queryKey: ['funil'] });
      const antes = qc.getQueryData<DadosFunil>(['funil']);
      if (antes) {
        const prob = antes.stages.find((e) => e.id === etapa)?.probability;
        qc.setQueryData<DadosFunil>(['funil'], {
          ...antes,
          leads: antes.leads.map((l) => (
            l.id === lead ? { ...l, stage_id: etapa, probability: prob ?? l.probability } : l
          )),
        });
      }
      setErro('');
      return { antes };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(['funil'], ctx.antes);
      setErro(e.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['funil'] }),
  });

  // Qual card está sendo arrastado e sobre qual coluna ele está. O estado vive
  // aqui, e não no card, porque a coluna precisa saber para se destacar.
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const converter = useMutation({
    mutationFn: (lead: string) => leadViraProposta(lead),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['funil'] }),
    onError: (e: Error) => setErro(e.message),
  });

  // A aba tem de abrir no clique: se abrisse depois da geração, o bloqueador de
  // pop-up barraria, porque o gesto do usuário já teria passado.
  const [gerando, setGerando] = useState<string | null>(null);
  async function gerarPdf(propostaId: string) {
    const aba = abrirAbaDiferida('Gerando a proposta…');
    setGerando(propostaId); setErro('');
    try {
      const doc = await gerarDocumentoPdf('proposta', propostaId);
      aba.mostrar(doc.blob, doc.nomeArquivo);
      if (doc.fontes === 'padrao') {
        setErro('PDF gerado, mas com as fontes padrão: o site ainda não está servindo /fontes/*.ttf.');
      }
    } catch (e) {
      aba.falhar((e as Error).message);
      setErro((e as Error).message);
    } finally { setGerando(null); }
  }

  const ultimaAtividade = useMemo(
    () => new Map((funil.data?.activities ?? []).map((a) => [a.lead_id, a])),
    [funil.data?.activities],
  );

  if (funil.isLoading) return <div className="carregando">Carregando o funil…</div>;
  if (funil.error) return <div className="aviso erro">{(funil.error as Error).message}</div>;
  if (!funil.data) return <div className="aviso erro">O funil não voltou nenhum dado.</div>;
  const d = funil.data;
  const escrever = pode('escrever');

  return (
    <>
      <Cabecalho
        kicker="Comercial"
        titulo="Funil de vendas"
        sub="Todo cadastro enviado pelo site entra aqui automaticamente, com o consumo e o valor da conta já no card. Arraste o card para mudar de etapa."
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
              <div
                className={`cards${alvo === etapa.id && arrastando ? ' recebendo' : ''}`}
                onDragOver={(e) => {
                  if (!arrastando || !escrever) return;
                  // Sem o preventDefault o navegador recusa a soltura.
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (alvo !== etapa.id) setAlvo(etapa.id);
                }}
                onDragLeave={(e) => {
                  // Só limpa quando o ponteiro sai da coluna de verdade: entrar
                  // num card filho dispara dragleave na coluna e faria o
                  // destaque piscar a cada movimento.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const lead = e.dataTransfer.getData('text/lead') || arrastando;
                  setAlvo(null); setArrastando(null);
                  if (!lead || !escrever) return;
                  const atual = d.leads.find((l) => l.id === lead);
                  if (!atual || atual.stage_id === etapa.id) return;
                  mover.mutate({ lead, etapa: etapa.id });
                }}
              >
                {leads.length === 0
                  ? <p className="vazio">{arrastando ? 'Solte aqui' : 'Nenhuma nesta etapa.'}</p>
                  : leads.map((lead) => (
                  <CardLead
                    key={lead.id}
                    lead={lead}
                    etapas={d.stages}
                    atividade={ultimaAtividade.get(lead.id)?.subject ?? null}
                    podeEditar={escrever}
                    ocupado={converter.isPending}
                    gerando={gerando === lead.proposta_id}
                    arrastavel={escrever}
                    arrastando={arrastando === lead.id}
                    aoIniciarArraste={(ev) => {
                      ev.dataTransfer.setData('text/lead', lead.id);
                      ev.dataTransfer.effectAllowed = 'move';
                      setArrastando(lead.id);
                    }}
                    aoTerminarArraste={() => { setArrastando(null); setAlvo(null); }}
                    aoMover={(etapaId) => mover.mutate({ lead: lead.id, etapa: etapaId })}
                    aoConverter={() => converter.mutate(lead.id)}
                    aoGerarPdf={() => lead.proposta_id && void gerarPdf(lead.proposta_id)}
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

function CardLead({
  lead, etapas, atividade, podeEditar, ocupado, gerando,
  arrastavel, arrastando, aoIniciarArraste, aoTerminarArraste,
  aoMover, aoConverter, aoGerarPdf,
}: {
  lead: Lead; etapas: Etapa[]; atividade: string | null; podeEditar: boolean;
  ocupado: boolean; gerando: boolean;
  arrastavel: boolean; arrastando: boolean;
  aoIniciarArraste: (ev: React.DragEvent) => void; aoTerminarArraste: () => void;
  aoMover: (etapaId: string) => void; aoConverter: () => void; aoGerarPdf: () => void;
}) {
  const vencida = !!lead.next_action_at && new Date(lead.next_action_at) < new Date();
  const etapa = etapas.find((e) => e.id === lead.stage_id);

  return (
    <article
      className={`card${arrastando ? ' arrastando' : ''}${arrastavel ? ' pegavel' : ''}`}
      draggable={arrastavel}
      onDragStart={aoIniciarArraste}
      onDragEnd={aoTerminarArraste}
      aria-grabbed={arrastando || undefined}
    >
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
              ? <button className="botao discreto" disabled={gerando} onClick={aoGerarPdf}>
                  {gerando ? 'Gerando…' : 'Gerar proposta (PDF)'}
                </button>
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
