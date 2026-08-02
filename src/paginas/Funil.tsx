import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cabecalho } from '../componentes/Layout';
import { useAuth } from '../lib/auth';
import { moeda, numero, relativo, linkWhatsapp, soDigitos, paraNumero } from '../lib/formato';
import { BarraFiltro, casa } from '../componentes/Filtros';
import { Painel } from '../componentes/Painel';
import {
  obterFunil, moverLead, leadViraProposta, registrarAtividade, salvarLead,
  type Funil as DadosFunil, type Lead, type Etapa,
} from '../lib/api/crm';
import { gerarDocumentoPdf, abrirAbaDiferida } from '../lib/api/documentos';

/**
 * Oportunidade digitada à mão.
 *
 * `crm_leads` não tem coluna de cidade — a que aparece no card vem do cadastro
 * ligado, e uma oportunidade anotada no telefone não tem cadastro. Por isso a
 * cidade entra no título, seguindo a convenção que os registros existentes já
 * usam ("Vanderlei — Encruzilhada"). Fica no lugar certo para a busca achar.
 */
type NovaOportunidade = {
  nome: string; cidade: string; telefone: string; email: string;
  valor: string; origem: string; stage_id: string;
};
const oportunidadeVazia = (): NovaOportunidade => ({
  nome: '', cidade: '', telefone: '', email: '', valor: '', origem: '', stage_id: '',
});

export function Funil() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState<NovaOportunidade | null>(null);

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
    mutationFn: ({ lead, etapa, motivo }: { lead: string; etapa: string; motivo?: string }) =>
      moverLead(lead, etapa, motivo),
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

  /**
   * Toda mudança de etapa passa por aqui.
   *
   * `move_crm_lead` sempre aceitou um motivo, `crm_leads.lost_reason` sempre
   * existiu, e a tela nunca perguntava: em produção, zero leads com motivo de
   * perda. Sem isso não dá para saber se a empresa perde por preço ou por
   * prazo — que é a única pergunta que um funil de vendas existe para
   * responder.
   *
   * Cancelar a caixa aborta a mudança, porque um card arrastado por engano
   * para "Perdido" não pode virar perda registrada. Confirmar em branco move
   * sem motivo, para não travar quem não quer responder agora.
   */
  function moverPedindoMotivo(lead: string, etapa: string) {
    const destino = funil.data?.stages.find((e) => e.id === etapa);
    if (destino?.lost) {
      const motivo = prompt(
        `Por que a oportunidade "${funil.data?.leads.find((l) => l.id === lead)?.title ?? ''}" foi perdida?\n\n`
        + 'Ex.: preço, prazo, fechou com outra empresa, sumiu, adiou.',
      );
      if (motivo === null) return;            // cancelou: não move
      mover.mutate({ lead, etapa, motivo: motivo.trim() || undefined });
      return;
    }
    mover.mutate({ lead, etapa });
  }

  /**
   * `save_crm_lead` está no banco, aplicada e testada, desde a primeira leva —
   * e nenhuma tela a chamava. O efeito disso é medível: dos 10 clientes de
   * hoje, 8 foram digitados no painel antigo, num formulário de 18 campos com
   * caixa de LGPD, porque era o único caminho. Quem chega por telefone ou
   * indicação — a maioria — passava a custar caro para registrar.
   */
  const criar = useMutation({
    mutationFn: (n: NovaOportunidade) => salvarLead({
      title: [n.nome.trim(), n.cidade.trim()].filter(Boolean).join(' — '),
      contact_name: n.nome.trim() || null,
      phone: soDigitos(n.telefone) || null,
      email: n.email.trim() || null,
      source: n.origem || null,
      // A coluna tem CHECK de não-negativo; um sinal trocado derrubaria o
      // insert com erro de banco em vez de mensagem de tela.
      expected_value: Math.max(0, paraNumero(n.valor)),
      stage_id: n.stage_id || null,
      pipeline_id: funil.data?.pipeline_id ?? null,
    }),
    onSuccess: () => {
      setNovo(null);
      setAviso('Oportunidade criada. Ela já está na primeira etapa do funil.');
      void qc.invalidateQueries({ queryKey: ['funil'] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  const anotar = useMutation({
    mutationFn: (dados: { lead_id: string; subject: string; due_at: string | null }) =>
      registrarAtividade({
        lead_id: dados.lead_id, subject: dados.subject,
        activity_type: 'contato', due_at: dados.due_at,
      }),
    onSuccess: () => {
      setAviso('Contato registrado.');
      void qc.invalidateQueries({ queryKey: ['funil'] });
    },
    onError: (e: Error) => setErro(e.message),
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

  /**
   * Por que a empresa perde.
   *
   * O motivo passou a ser pedido na mudança de etapa, mas ficava só dentro do
   * card — para saber se perde por preço ou por prazo era preciso abrir a
   * coluna Perdido e ler um por um. Somado, vira a pergunta que dá para
   * responder numa reunião. Agrupa por texto normalizado, então "Preço" e
   * "preço alto" contam separado de propósito: juntar por semelhança seria
   * adivinhar.
   */
  const perdas = useMemo(() => {
    const lost = new Set((funil.data?.stages ?? []).filter((e) => e.lost).map((e) => e.id));
    const conta = new Map<string, number>();
    for (const l of funil.data?.leads ?? []) {
      if (!lost.has(l.stage_id)) continue;
      const motivo = (l.lost_reason ?? '').trim() || 'Sem motivo registrado';
      conta.set(motivo, (conta.get(motivo) ?? 0) + 1);
    }
    return [...conta.entries()].sort((a, b) => b[1] - a[1]);
  }, [funil.data?.leads, funil.data?.stages]);

  const visiveis = useMemo(
    () => (funil.data?.leads ?? []).filter((l) => casa(
      busca, l.title, l.contact_name, l.cidade, l.uf, l.phone, l.email, l.source,
    )),
    [funil.data?.leads, busca],
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
        sub="Cadastro enviado pelo site entra aqui sozinho. Quem chegou por telefone ou indicação você anota no botão ao lado. Arraste o card para mudar de etapa."
        acao={escrever
          ? <button className="botao" onClick={() => { setNovo(oportunidadeVazia()); setErro(''); setAviso(''); }}>
              Nova oportunidade
            </button>
          : undefined}
      />

      {/* Com o painel aberto o erro é de validação e vai para o rodapé dele. */}
      {erro && !novo ? <div className="aviso erro" style={{ marginBottom: 16 }}>{erro}</div> : null}
      {aviso ? <div className="aviso bom" style={{ marginBottom: 16 }}>{aviso}</div> : null}

      <div className="kpis">
        {/* "Fechado no mês" já vinha do banco e nenhuma tela mostrava — é o
            número que o dono abre o sistema para ver. E "pipeline bruto" e
            "ponderado" são jargão de CRM: quem vende fala em valor. */}
        <Kpi rot="Fechado no mês" val={numero(d.kpis.ganhos_mes)} />
        <Kpi rot="Oportunidades abertas" val={numero(d.kpis.open)} />
        <Kpi rot="Valor em negociação" val={moeda(d.kpis.pipeline_value)} />
        <Kpi rot="Ajustado pela chance" val={moeda(d.kpis.weighted_value)} />
        <Kpi rot="Ações vencidas" val={numero(d.kpis.overdue_actions)} alerta={d.kpis.overdue_actions > 0} />
        <Kpi rot="Novos em 7 dias" val={numero(d.kpis.novos_7d)} />
      </div>

      {perdas.length ? (
        <div className="cartao perdas">
          <div className="rot">Por que perdemos</div>
          <div className="lista">
            {perdas.map(([motivo, n]) => (
              <span className="pilula" key={motivo}>
                {motivo} <b>{n}</b>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* O funil era a única lista sem busca — e é a tela de abertura, com seis
          colunas de cards. Achar uma pessoa significava varrer coluna por
          coluna; no celular, onde elas ficam empilhadas, rolar todas. */}
      <BarraFiltro
        busca={busca} aoBuscar={setBusca}
        placeholder="Buscar por nome, cliente, cidade ou telefone"
        mostrando={visiveis.length} total={d.leads.length}
        aoLimpar={() => setBusca('')}
      />

      <div className="funil">
        {d.stages.map((etapa) => {
          const leads = visiveis.filter((l) => l.stage_id === etapa.id);
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
                  moverPedindoMotivo(lead, etapa.id);
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
                    aoMover={(etapaId) => moverPedindoMotivo(lead.id, etapaId)}
                    aoConverter={() => converter.mutate(lead.id)}
                    aoGerarPdf={() => lead.proposta_id && void gerarPdf(lead.proposta_id)}
                    anotando={anotar.isPending}
                    aoAnotar={(subject, due_at) => anotar.mutate({ lead_id: lead.id, subject, due_at })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {novo ? (
        <Painel
          titulo="Nova oportunidade"
          aoFechar={() => setNovo(null)}
          rodape={<>
            {erro ? <div className="aviso erro">{erro}</div> : null}
            <button className="botao secundario" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="botao" disabled={!novo.nome.trim() || criar.isPending}
                    onClick={() => criar.mutate(novo)}>
              {criar.isPending ? 'Criando…' : 'Criar oportunidade'}
            </button>
          </>}
        >
          <p className="sub" style={{ marginTop: 0 }}>
            Para quem chegou por telefone, WhatsApp ou indicação. O cadastro completo,
            com documentos, só é preciso quando isto virar proposta.
          </p>

          <label className="campo">
            <span>Nome do cliente *</span>
            <input value={novo.nome} autoFocus placeholder="Ex.: João Batista"
                   onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          </label>

          <div className="grade2">
            <label className="campo">
              <span>Cidade</span>
              <input value={novo.cidade} placeholder="Ex.: Vitória da Conquista"
                     onChange={(e) => setNovo({ ...novo, cidade: e.target.value })} />
            </label>
            <label className="campo">
              <span>WhatsApp</span>
              <input value={novo.telefone} inputMode="numeric" placeholder="77 99999-0000"
                     onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
            </label>
            <label className="campo">
              <span>E-mail</span>
              <input value={novo.email} type="email" placeholder="opcional"
                     onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
            </label>
            <label className="campo">
              <span>Valor esperado</span>
              <input value={novo.valor} inputMode="decimal" placeholder="R$ 0,00"
                     onChange={(e) => setNovo({ ...novo, valor: e.target.value })} />
            </label>
            <label className="campo">
              <span>Como nos conheceu?</span>
              <select value={novo.origem} onChange={(e) => setNovo({ ...novo, origem: e.target.value })}>
                <option value="">Não perguntei</option>
                {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Etapa</span>
              <select value={novo.stage_id} onChange={(e) => setNovo({ ...novo, stage_id: e.target.value })}>
                <option value="">Primeira etapa</option>
                {d.stages.filter((e) => !e.won && !e.lost)
                  .map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
          </div>

          <p className="sub" style={{ fontSize: 12.5, marginBottom: 0 }}>
            A cidade entra junto do nome no título do card — é assim que os
            registros existentes fazem, e é onde a busca do funil procura.
          </p>
        </Painel>
      ) : null}
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

/**
 * De onde o cliente veio DE VERDADE.
 *
 * A única origem que existia era `equipe` ou `site`, que descreve por onde o
 * registro foi digitado — não como a pessoa conheceu a Energy PRO. Com isso não
 * havia como saber se o Instagram, a placa na obra ou a indicação trazem
 * cliente, nem qual deles fecha. Os valores antigos continuam aparecendo como
 * estão; estes valem para o que entrar daqui em diante.
 */
const ORIGENS = [
  'Indicação', 'Instagram', 'WhatsApp', 'Site', 'Placa na obra',
  'Vizinho de usina instalada', 'Cliente antigo', 'Outro',
];

/** Quanto tempo até o próximo toque. O "sem lembrete" existe para quem já sabe
 *  que aquela oportunidade não tem próximo passo agora. */
const PRAZOS = [
  { dias: 2, rot: 'em 2 dias' },
  { dias: 7, rot: 'em 1 semana' },
  { dias: 15, rot: 'em 15 dias' },
  { dias: 30, rot: 'em 30 dias' },
  { dias: 0, rot: 'sem lembrete' },
];

function CardLead({
  lead, etapas, atividade, podeEditar, ocupado, gerando,
  arrastavel, arrastando, aoIniciarArraste, aoTerminarArraste,
  aoMover, aoConverter, aoGerarPdf, anotando, aoAnotar,
}: {
  lead: Lead; etapas: Etapa[]; atividade: string | null; podeEditar: boolean;
  ocupado: boolean; gerando: boolean;
  arrastavel: boolean; arrastando: boolean;
  aoIniciarArraste: (ev: React.DragEvent) => void; aoTerminarArraste: () => void;
  aoMover: (etapaId: string) => void; aoConverter: () => void; aoGerarPdf: () => void;
  anotando: boolean; aoAnotar: (assunto: string, quando: string | null) => void;
}) {
  const vencida = !!lead.next_action_at && new Date(lead.next_action_at) < new Date();
  const etapa = etapas.find((e) => e.id === lead.stage_id);
  const [anotandoAqui, setAnotandoAqui] = useState(false);
  const [assunto, setAssunto] = useState('');
  const [prazo, setPrazo] = useState(7);

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

      {/* O motivo da perda sempre coube em `lost_reason` e nunca era pedido nem
          mostrado. Num card perdido é a informação mais útil que existe. */}
      {etapa?.lost && lead.lost_reason
        ? <div className="motivo">Perdida: {lead.lost_reason}</div> : null}

      {podeEditar ? (
        <>
          <label className="campo" style={{ marginTop: 10, marginBottom: 8 }}>
            <span>Etapa</span>
            <select value={lead.stage_id} disabled={ocupado} onChange={(e) => aoMover(e.target.value)}>
              {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>

          {/* "Ações vencidas" só subia: o card pintava de vermelho e não havia
              como registrar o contato nem adiar. `save_crm_activity` já existia
              no banco e NENHUMA tela a chamava — alarme que não se desliga é
              alarme que a equipe aprende a ignorar. */}
          {anotandoAqui ? (
            <div className="anotar">
              <input
                autoFocus value={assunto} placeholder="O que ficou combinado?"
                aria-label="O que ficou combinado"
                onChange={(e) => setAssunto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setAnotandoAqui(false); }}
              />
              {/* O seletor tem linha própria: dividindo espaço com os dois
                  botões, ele encolhia até o texto sumir dentro do card. */}
              <select value={prazo} onChange={(e) => setPrazo(Number(e.target.value))}
                      aria-label="Quando lembrar de novo">
                {PRAZOS.map((p) => <option key={p.dias} value={p.dias}>Lembrar {p.rot}</option>)}
              </select>
              <div className="anotar-linha">
                <button className="botao discreto" onClick={() => setAnotandoAqui(false)}>Cancelar</button>
                <button
                  className="botao discreto forte"
                  disabled={!assunto.trim() || anotando}
                  onClick={() => {
                    const quando = prazo > 0
                      ? new Date(Date.now() + prazo * 864e5).toISOString()
                      : null;
                    aoAnotar(assunto.trim(), quando);
                    setAssunto(''); setAnotandoAqui(false);
                  }}
                >
                  {anotando ? 'Salvando…' : 'Registrar'}
                </button>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!anotandoAqui ? (
              <button className={`botao discreto${vencida ? ' forte' : ''}`}
                      onClick={() => setAnotandoAqui(true)}>
                Falei hoje
              </button>
            ) : null}
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
