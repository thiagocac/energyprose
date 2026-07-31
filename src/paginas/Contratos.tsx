import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cabecalho } from '../componentes/Layout';
import { BarraFiltro, casa } from '../componentes/Filtros';
import { Painel } from '../componentes/Painel';
import { useAuth } from '../lib/auth';
import { moeda, dataBr, hojeISO, dataFutura } from '../lib/formato';
import { gerarDocumentoPdf, abrirAbaDiferida } from '../lib/api/documentos';
import {
  listarContratos, salvarContrato, arquivarContrato, lacunasDoContrato,
  ROTULO_STATUS_CONTRATO, ROTULO_TIPO, FLUXO_STATUS,
  type ContratoLinha, type StatusContrato, type TipoContrato,
} from '../lib/api/contratos';
import { listarCadastrosRef, obterConfigEmpresa } from '../lib/api/catalogo';

type Form = {
  id?: string;
  cadastro_id: string; proposta_id: string | null;
  tipo: TipoContrato; descricao: string; status: StatusContrato;
  valor_total: string; condicao_pagamento: string;
  prazo_min: string; prazo_max: string;
  recorrencia: '' | 'mensal' | 'anual'; visitas: string;
  vigencia_inicio: string; vigencia_fim: string;
  numero: string | null;
};

// `toISOString()` é UTC: depois das 21h em Brasília ele já devolve o dia
// seguinte, e a vigência nascia começando amanhã. Estes ajudantes trabalham no
// fuso de quem está usando.
const hoje = hojeISO;
const emMeses = (m: number) => dataFutura({ meses: m });
/**
 * Texto do campo de valor -> número.
 *
 * ARMADILHA JÁ PAGA: a versão antiga removia TODOS os pontos, o que está certo
 * para o separador de milhar que o usuário digita ("1.234,56") e catastrófico
 * para o valor que vem do banco ("1234.56" -> 123456). Reeditar um contrato
 * para corrigir uma palavra multiplicava o valor por cem, sem erro nem aviso.
 *
 * Agora o ponto só é tratado como milhar quando está na posição de milhar
 * (seguido de exatamente três dígitos e nada mais que dígito ou vírgula).
 */
const dec = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = String(v ?? '').trim();
  if (!t) return 0;
  const normalizado = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')   // pt-BR: ponto é milhar
    : t;                                       // sem vírgula: ponto é decimal
  return Number(normalizado) || 0;
};

const vazio = (): Form => ({
  cadastro_id: '', proposta_id: null, tipo: 'manutencao', descricao: '',
  status: 'rascunho', valor_total: '', condicao_pagamento: '',
  prazo_min: '', prazo_max: '', recorrencia: 'mensal', visitas: '2',
  vigencia_inicio: hoje(), vigencia_fim: emMeses(12), numero: null,
});

export function Contratos() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fTipo, setFTipo] = useState('');

  const contratos = useQuery({ queryKey: ['contratos'], queryFn: listarContratos });
  const cadastros = useQuery({ queryKey: ['cadastros-ref'], queryFn: listarCadastrosRef });
  const config = useQuery({ queryKey: ['config-empresa'], queryFn: obterConfigEmpresa });

  const escrever = pode('escrever');
  const ehManutencao = form?.tipo === 'manutencao';

  const resumo = useMemo(() => {
    const l = contratos.data ?? [];
    const ativos = l.filter((c) => ['assinado', 'em_execucao'].includes(c.status));
    return {
      total: l.length,
      ativos: ativos.length,
      incompletos: l.filter((c) => c.status !== 'cancelado' && lacunasDoContrato(c).length).length,
      recorrente: l
        .filter((c) => c.tipo === 'manutencao' && ['assinado', 'em_execucao'].includes(c.status))
        .reduce((s, c) => s + (c.recorrencia === 'anual' ? c.valor_total / 12 : c.valor_total), 0),
      carteira: ativos.reduce((s, c) => s + c.valor_total, 0),
    };
  }, [contratos.data]);

  const listaFiltrada = useMemo(() => {
    const todos = contratos.data ?? [];
    return todos.filter((c) => (
      (!fStatus || c.status === fStatus)
      && (!fTipo || c.tipo === fTipo)
      && casa(busca, c.numero, c.cliente, c.cidade, c.descricao, c.proposta_numero)
    ));
  }, [contratos.data, busca, fStatus, fTipo]);

  function novo() {
    setErro(''); setAviso('');
    setForm({
      ...vazio(),
      prazo_min: String(config.data?.prazo_entrega_min_dias ?? ''),
      prazo_max: String(config.data?.prazo_entrega_max_dias ?? ''),
    });
  }

  function abrir(c: ContratoLinha) {
    setErro(''); setAviso('');
    setForm({
      id: c.id, cadastro_id: c.cadastro_id, proposta_id: c.proposta_id,
      tipo: c.tipo, descricao: c.descricao ?? '', status: c.status,
      valor_total: c.valor_total ? String(c.valor_total) : '',
      condicao_pagamento: c.condicao_pagamento ?? '',
      prazo_min: c.prazo_entrega_min_dias ? String(c.prazo_entrega_min_dias) : '',
      prazo_max: c.prazo_entrega_max_dias ? String(c.prazo_entrega_max_dias) : '',
      recorrencia: c.recorrencia ?? '',
      visitas: c.visitas_incluidas != null ? String(c.visitas_incluidas) : '',
      vigencia_inicio: c.vigencia_inicio ?? '', vigencia_fim: c.vigencia_fim ?? '',
      numero: c.numero,
    });
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('Sem formulário.');
      if (!form.cadastro_id) throw new Error('Escolha o cliente.');
      if (!dec(form.valor_total)) throw new Error('Informe o valor do contrato.');
      if (form.tipo === 'manutencao' && form.vigencia_inicio && form.vigencia_fim
          && form.vigencia_fim < form.vigencia_inicio) {
        throw new Error('A vigência termina antes de começar.');
      }
      return salvarContrato({
        id: form.id, cadastro_id: form.cadastro_id, proposta_id: form.proposta_id,
        tipo: form.tipo, descricao: form.descricao || null, status: form.status,
        valor_total: dec(form.valor_total),
        condicao_pagamento: form.condicao_pagamento || null,
        prazo_entrega_min_dias: form.tipo === 'usina' ? form.prazo_min || null : null,
        prazo_entrega_max_dias: form.tipo === 'usina' ? form.prazo_max || null : null,
        recorrencia: form.tipo === 'manutencao' ? form.recorrencia || null : null,
        visitas_incluidas: form.tipo === 'manutencao' ? form.visitas || null : null,
        vigencia_inicio: form.tipo === 'manutencao' ? form.vigencia_inicio || null : null,
        vigencia_fim: form.tipo === 'manutencao' ? form.vigencia_fim || null : null,
      });
    },
    onSuccess: () => {
      setForm(null); setAviso('Contrato salvo.');
      void qc.invalidateQueries({ queryKey: ['contratos'] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  async function pdf(c: ContratoLinha) {
    const lacunas = lacunasDoContrato(c);
    if (lacunas.length && !confirm(
      `Este contrato está sem ${lacunas.join(', ')}. `
      + 'O documento sai assim mesmo, com a redação genérica. Emitir?')) return;

    const aba = abrirAbaDiferida('Gerando o contrato…');
    setOcupado(`pdf:${c.id}`); setErro(''); setAviso('');
    try {
      const doc = await gerarDocumentoPdf('contrato', c.id);
      aba.mostrar(doc.blob, doc.nomeArquivo);
      setAviso('Contrato gerado.');
      void qc.invalidateQueries({ queryKey: ['contratos'] });
    } catch (e) { aba.falhar((e as Error).message); setErro((e as Error).message); }
    finally { setOcupado(null); }
  }

  async function acao(chave: string, fn: () => Promise<unknown>, ok: string) {
    setOcupado(chave); setErro(''); setAviso('');
    try {
      await fn();
      setAviso(ok);
      void qc.invalidateQueries({ queryKey: ['contratos'] });
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  }

  return (
    <>
      <Cabecalho
        kicker="Comercial"
        titulo="Contratos"
        sub="Contrato de fornecimento e instalação, e plano de manutenção. Um contrato pode nascer de uma proposta aceita ou ser lançado direto aqui."
        acao={escrever ? <button className="botao" onClick={novo}>Novo contrato</button> : undefined}
      />

      {erro ? <div className="aviso erro">{erro}</div> : null}
      {aviso ? <div className="aviso bom">{aviso}</div> : null}

      <div className="kpis">
        <Kpi rot="Contratos" val={String(resumo.total)} />
        <Kpi rot="Ativos" val={String(resumo.ativos)} />
        <Kpi rot="Carteira ativa" val={moeda(resumo.carteira)} />
        {/* Plano anual dividido por 12 para os dois entrarem na mesma conta —
            é receita recorrente mensalizada, não a soma de coisas diferentes. */}
        <Kpi rot="Recorrente / mês" val={moeda(resumo.recorrente)} />
        <Kpi rot="Incompletos" val={String(resumo.incompletos)}
             alerta={resumo.incompletos > 0} />
      </div>

      {contratos.isLoading ? <div className="carregando">Carregando…</div>
        : contratos.error ? <div className="aviso erro">{(contratos.error as Error).message}</div>
        : !contratos.data?.length ? (
          <div className="cartao" style={{ padding: 28, textAlign: 'center' }}>
            <p className="sub" style={{ margin: 0 }}>
              Nenhum contrato ainda. Aceite uma proposta e clique em “Criar contrato”,
              ou lance um plano de manutenção direto aqui.
            </p>
          </div>
        ) : (
          <>
          <BarraFiltro
            busca={busca} aoBuscar={setBusca}
            placeholder="Buscar por número, cliente, cidade ou proposta de origem"
            mostrando={listaFiltrada.length} total={contratos.data.length}
            aoLimpar={() => { setBusca(''); setFStatus(''); setFTipo(''); }}
            filtros={<>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filtrar por status">
                <option value="">Todos os status</option>
                {FLUXO_STATUS.map((k) => <option key={k} value={k}>{ROTULO_STATUS_CONTRATO[k]}</option>)}
              </select>
              <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} aria-label="Filtrar por tipo">
                <option value="">Os dois tipos</option>
                <option value="manutencao">{ROTULO_TIPO.manutencao}</option>
                <option value="usina">{ROTULO_TIPO.usina}</option>
              </select>
            </>}
          />
          {!listaFiltrada.length ? (
            <div className="cartao" style={{ padding: 24, textAlign: 'center' }}>
              <p className="sub" style={{ margin: 0 }}>Nenhum contrato com esses filtros.</p>
            </div>
          ) : (
          <div className="cartao" style={{ overflowX: 'auto' }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Número</th><th>Cliente</th><th>Tipo</th><th>Vigência / prazo</th>
                  <th className="dir">Valor</th><th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((c) => {
                  const lacunas = lacunasDoContrato(c);
                  return (
                    <tr key={c.id}>
                      <td>
                        <b>{c.numero ?? '—'}</b>
                        {c.proposta_numero
                          ? <div className="meta">de {c.proposta_numero}</div>
                          : <div className="meta">avulso</div>}
                      </td>
                      <td>{c.cliente ?? '—'}<div className="meta">{c.cidade ?? ''}</div></td>
                      <td>
                        {ROTULO_TIPO[c.tipo]}
                        {c.recorrencia
                          ? <div className="meta">
                              {c.recorrencia === 'mensal' ? 'mensal' : 'anual'}
                              {c.visitas_incluidas ? ` · ${c.visitas_incluidas} visitas` : ''}
                            </div>
                          : null}
                      </td>
                      <td>
                        {c.tipo === 'manutencao'
                          ? (c.vigencia_inicio
                            ? <>{dataBr(c.vigencia_inicio)} → {dataBr(c.vigencia_fim)}</>
                            : <span className="meta">—</span>)
                          : (c.prazo_entrega_min_dias
                            ? <>{c.prazo_entrega_min_dias} a {c.prazo_entrega_max_dias} dias</>
                            : <span className="meta">—</span>)}
                        {lacunas.length
                          ? <div className="meta" style={{ color: 'var(--ruim)' }}>
                              falta {lacunas.join(', ')}
                            </div>
                          : null}
                      </td>
                      <td className="dir">
                        <b>{moeda(c.valor_total)}</b>
                        {c.recorrencia === 'mensal' ? <div className="meta">por mês</div> : null}
                        {c.recorrencia === 'anual' ? <div className="meta">por ano</div> : null}
                      </td>
                      <td><SeloContrato status={c.status} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {escrever
                            ? <button className="botao discreto" disabled={!!ocupado}
                                onClick={() => abrir(c)}>Editar</button> : null}
                          <button className="botao discreto" disabled={!!ocupado} onClick={() => void pdf(c)}>
                            {ocupado === `pdf:${c.id}` ? 'Gerando…' : 'PDF'}
                          </button>
                          {escrever && c.status === 'rascunho'
                            ? <button className="botao discreto" style={{ color: 'var(--ruim)' }} disabled={!!ocupado}
                                onClick={() => void acao(`arq:${c.id}`, () => arquivarContrato(c.id), 'Rascunho arquivado.')}>
                                Arquivar
                              </button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          </>
        )}

      {form ? (
        <Painel
          titulo={form.id ? `Contrato ${form.numero ?? ''}` : 'Novo contrato'}
          aoFechar={() => setForm(null)}
          rodape={<>
            <button className="botao secundario" onClick={() => setForm(null)}>Cancelar</button>
            <button className="botao" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
              {salvar.isPending ? 'Salvando…' : 'Salvar contrato'}
            </button>
          </>}
        >
          <>
              <div className="grade2">
                <label className="campo">
                  <span>Cliente *</span>
                  <select value={form.cadastro_id} disabled={!!form.id}
                          onChange={(e) => setForm({ ...form, cadastro_id: e.target.value })}>
                    <option value="">Selecione…</option>
                    {(cadastros.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}{c.cidade ? ` — ${c.cidade}` : ''}</option>
                    ))}
                  </select>
                </label>
                <label className="campo">
                  <span>Tipo *</span>
                  <select value={form.tipo}
                          onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoContrato })}>
                    <option value="manutencao">{ROTULO_TIPO.manutencao}</option>
                    <option value="usina">{ROTULO_TIPO.usina}</option>
                  </select>
                </label>
                <label className="campo" style={{ gridColumn: '1 / -1' }}>
                  <span>Descrição</span>
                  <input value={form.descricao} placeholder="Ex.: Plano de manutenção — usina 4,26 kWp"
                         onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Valor {ehManutencao ? (form.recorrencia === 'anual' ? '(por ano) *' : '(por mês) *') : '*'}</span>
                  <input value={form.valor_total} placeholder="0,00"
                         onChange={(e) => setForm({ ...form, valor_total: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Status</span>
                  <select value={form.status}
                          onChange={(e) => setForm({ ...form, status: e.target.value as StatusContrato })}>
                    {FLUXO_STATUS.map((s) => <option key={s} value={s}>{ROTULO_STATUS_CONTRATO[s]}</option>)}
                  </select>
                </label>
              </div>

              {ehManutencao ? (
                <section className="bloco">
                  <h3>Plano</h3>
                  <p className="meta" style={{ marginTop: -6 }}>
                    Estes campos vão impressos nas cláusulas de vigência e periodicidade.
                    Em branco, o contrato sai com a redação genérica — “12 meses contados
                    da assinatura” e “visitas programadas de comum acordo”.
                  </p>
                  <div className="grade2">
                    <label className="campo">
                      <span>Recorrência</span>
                      <select value={form.recorrencia}
                              onChange={(e) => setForm({ ...form, recorrencia: e.target.value as Form['recorrencia'] })}>
                        <option value="">Não definida</option>
                        <option value="mensal">Mensal</option>
                        <option value="anual">Anual</option>
                      </select>
                    </label>
                    <label className="campo">
                      <span>Visitas preventivas incluídas</span>
                      <input type="number" min="0" value={form.visitas}
                             onChange={(e) => setForm({ ...form, visitas: e.target.value })} />
                    </label>
                    <label className="campo">
                      <span>Início da vigência</span>
                      <input type="date" value={form.vigencia_inicio}
                             onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} />
                    </label>
                    <label className="campo">
                      <span>Fim da vigência</span>
                      <input type="date" value={form.vigencia_fim}
                             onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[6, 12, 24].map((m) => (
                      <button key={m} className="botao secundario" style={{ padding: '4px 10px' }}
                              onClick={() => setForm({
                                ...form,
                                vigencia_inicio: form.vigencia_inicio || hoje(),
                                vigencia_fim: emMeses(m),
                              })}>
                        {m} meses
                      </button>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="bloco">
                  <h3>Prazo de execução</h3>
                  <div className="grade2">
                    <label className="campo">
                      <span>Mínimo (dias)</span>
                      <input type="number" min="1" value={form.prazo_min}
                             onChange={(e) => setForm({ ...form, prazo_min: e.target.value })} />
                    </label>
                    <label className="campo">
                      <span>Máximo (dias)</span>
                      <input type="number" min="1" value={form.prazo_max}
                             onChange={(e) => setForm({ ...form, prazo_max: e.target.value })} />
                    </label>
                  </div>
                </section>
              )}

              <section className="bloco">
                <h3>Pagamento</h3>
                <label className="campo">
                  <span>Condição de pagamento</span>
                  <input value={form.condicao_pagamento}
                         placeholder={ehManutencao ? 'Ex.: Boleto mensal com vencimento todo dia 10' : 'Ex.: Entrada de 30% e saldo em até 60x'}
                         onChange={(e) => setForm({ ...form, condicao_pagamento: e.target.value })} />
                </label>
              </section>
          </>
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

function SeloContrato({ status }: { status: StatusContrato }) {
  const tom = status === 'assinado' || status === 'concluido' ? ' bom'
    : status === 'cancelado' ? ' ruim'
    : status === 'enviado' || status === 'em_execucao' ? ' quente' : '';
  return <span className={`pilula${tom}`}>{ROTULO_STATUS_CONTRATO[status] ?? status}</span>;
}
