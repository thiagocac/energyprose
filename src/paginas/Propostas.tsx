import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cabecalho } from '../componentes/Layout';
import { BarraFiltro, casa } from '../componentes/Filtros';
import { useAuth } from '../lib/auth';
import { moeda, numero, dataBr, linkWhatsapp, soDigitos } from '../lib/formato';
import { kwp, geracaoMensal, sugerirModulos, razaoCcCa } from '../lib/solar';
import { gerarDocumentoPdf, abrirAbaDiferida } from '../lib/api/documentos';
import {
  listarPropostas, obterProposta, salvarProposta, duplicarProposta,
  prepararEnvio, converterEmContrato, arquivarProposta,
  ROTULO_STATUS, type PropostaLinha, type ItemProposta, type StatusProposta,
} from '../lib/api/propostas';
import {
  listarServicos, listarLinhas, listarEquipamentos, listarCadastrosRef, obterConfigEmpresa,
  descreverEquipamento, type Equipamento, type LinhaServico,
} from '../lib/api/catalogo';

type Form = {
  id?: string;
  /** A linha decide tudo: qual PDF sai, se pede sistema, se vira contrato. */
  cadastro_id: string; linha: string; titulo: string; validade: string;
  condicao_pagamento: string; prazo_execucao: string; observacoes: string;
  recipient_name: string; recipient_whatsapp: string; recipient_email: string;
  modulo_id: string; modulo_qtd: string; inversor_id: string;
  potencia_kwp: string; geracao: string; hsp: string; pr: string;
  observacoes_tecnicas: string;
  /** o usuário mexeu no campo à mão? então o cálculo automático para de sobrescrever */
  kwpManual: boolean; geracaoManual: boolean;
};

const vazio = (): Form => ({
  cadastro_id: '', linha: 'usina_fotovoltaica', titulo: '', validade: '',
  condicao_pagamento: '', prazo_execucao: '', observacoes: '',
  recipient_name: '', recipient_whatsapp: '', recipient_email: '',
  modulo_id: '', modulo_qtd: '', inversor_id: '',
  potencia_kwp: '', geracao: '', hsp: '', pr: '', observacoes_tecnicas: '',
  kwpManual: false, geracaoManual: false,
});

const emDias = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const dec = (v: string) => Number(String(v).replace(',', '.')) || 0;

export function Propostas() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [itens, setItens] = useState<ItemProposta[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fLinha, setFLinha] = useState('');

  const propostas = useQuery({ queryKey: ['propostas'], queryFn: listarPropostas });
  const servicos = useQuery({ queryKey: ['servicos'], queryFn: () => listarServicos(true) });
  const linhas = useQuery({ queryKey: ['linhas-servico'], queryFn: listarLinhas });
  const equipamentos = useQuery({ queryKey: ['equipamentos'], queryFn: listarEquipamentos });
  const cadastros = useQuery({ queryKey: ['cadastros-ref'], queryFn: listarCadastrosRef });
  const config = useQuery({ queryKey: ['config-empresa'], queryFn: obterConfigEmpresa });

  const modulos = useMemo(() => (equipamentos.data ?? []).filter((e) => e.tipo === 'modulo'), [equipamentos.data]);
  const inversores = useMemo(() => (equipamentos.data ?? []).filter((e) => e.tipo === 'inversor'), [equipamentos.data]);
  const acharEquip = (id: string): Equipamento | undefined => (equipamentos.data ?? []).find((e) => e.id === id);
  const cliente = useMemo(
    () => (cadastros.data ?? []).find((c) => c.id === form?.cadastro_id),
    [cadastros.data, form?.cadastro_id],
  );

  const acharLinha = (codigo: string | null | undefined): LinhaServico | undefined =>
    (linhas.data ?? []).find((l) => l.codigo === codigo);
  const linhaSel = acharLinha(form?.linha);
  const ehUsina = (linhaSel?.documento ?? 'usina') === 'usina';

  // O catálogo inteiro numa lista só vira rolagem: mostramos primeiro os itens
  // da linha escolhida e deixamos o resto acessível, para o vendedor ainda poder
  // somar um serviço de outra linha na mesma proposta.
  const servicosDaLinha = useMemo(() => {
    const todos = servicos.data ?? [];
    if (!form?.linha) return { proprios: todos, outros: [] as typeof todos };
    return {
      proprios: todos.filter((x) => x.linha === form.linha),
      outros: todos.filter((x) => x.linha !== form.linha),
    };
  }, [servicos.data, form?.linha]);

  const total = useMemo(
    () => itens.reduce((s, i) => s + i.quantidade * i.preco_unitario * (1 - i.desconto_pct / 100), 0),
    [itens],
  );

  // A lista filtrada mora aqui, e não numa consulta ao banco: são dezenas de
  // linhas, não milhares. Filtrar no cliente responde a cada tecla sem ida ao
  // servidor. Se um dia passar de alguns milhares, vira consulta paginada.
  const listaFiltrada = useMemo(() => {
    const todas = propostas.data ?? [];
    return todas.filter((p) => (
      (!fStatus || p.status === fStatus)
      && (!fLinha || p.linha === fLinha)
      && casa(busca, p.numero, p.cliente, p.cidade, p.titulo)
    ));
  }, [propostas.data, busca, fStatus, fLinha]);

  // ===== Cálculo automático de kWp e geração =====
  // Só recalcula enquanto o usuário não digitou o valor à mão: o vendedor às
  // vezes ajusta a geração para o número que combinou com o cliente, e o
  // sistema não pode desfazer isso a cada tecla.
  const modulo = form ? acharEquip(form.modulo_id) : undefined;
  const qtd = Number(form?.modulo_qtd) || 0;
  const hsp = dec(form?.hsp ?? '') || config.data?.hsp_default || 5.3;
  const pr = dec(form?.pr ?? '') || config.data?.pr_default || 0.75;

  useEffect(() => {
    if (!form || form.kwpManual || !modulo?.potencia_wp || !qtd) return;
    const v = kwp(qtd, modulo.potencia_wp);
    if (String(v) !== form.potencia_kwp) setForm((f) => (f ? { ...f, potencia_kwp: String(v) } : f));
  }, [qtd, modulo?.potencia_wp, form?.kwpManual]);

  useEffect(() => {
    if (!form || form.geracaoManual) return;
    const p = dec(form.potencia_kwp);
    if (!p) return;
    const g = geracaoMensal(p, hsp, pr);
    if (String(g) !== form.geracao) setForm((f) => (f ? { ...f, geracao: String(g) } : f));
  }, [form?.potencia_kwp, hsp, pr, form?.geracaoManual]);

  const sugestao = useMemo(() => {
    if (!cliente?.consumo_medio_kwh || !modulo?.potencia_wp) return null;
    return sugerirModulos(cliente.consumo_medio_kwh, modulo.potencia_wp, hsp, pr);
  }, [cliente?.consumo_medio_kwh, modulo?.potencia_wp, hsp, pr]);

  const inversor = form ? acharEquip(form.inversor_id) : undefined;
  const razao = razaoCcCa(dec(form?.potencia_kwp ?? ''), inversor?.potencia_kw ?? 0);

  // ===== Abrir o formulário =====
  function novo() {
    setErro(''); setAviso('');
    setForm({ ...vazio(), validade: emDias(config.data?.validade_proposta_dias ?? 15),
              hsp: String(config.data?.hsp_default ?? 5.3), pr: String(config.data?.pr_default ?? 0.75) });
    setItens([]);
  }

  async function abrir(id: string) {
    setErro(''); setAviso(''); setOcupado(`abrir:${id}`);
    try {
      const p = await obterProposta(id);
      const s = p.sistema;
      setForm({
        id: p.id, cadastro_id: p.cadastro_id ?? '', linha: p.linha || 'usina_fotovoltaica',
        titulo: p.titulo ?? '', validade: p.validade ?? '',
        condicao_pagamento: p.condicao_pagamento ?? '',
        prazo_execucao: p.prazo_execucao ?? '', observacoes: p.observacoes ?? '',
        recipient_name: p.recipient_name ?? '', recipient_whatsapp: p.recipient_whatsapp ?? '',
        recipient_email: p.recipient_email ?? '',
        modulo_id: s?.modulo_id ?? '', modulo_qtd: s?.modulo_qtd ? String(s.modulo_qtd) : '',
        inversor_id: s?.inversor_id ?? '',
        potencia_kwp: s?.potencia_instalada_kwp ? String(s.potencia_instalada_kwp) : '',
        geracao: s?.geracao_media_kwh_mes ? String(s.geracao_media_kwh_mes) : '',
        hsp: String(s?.hsp ?? config.data?.hsp_default ?? 5.3),
        pr: String(s?.pr ?? config.data?.pr_default ?? 0.75),
        observacoes_tecnicas: s?.observacoes_tecnicas ?? '',
        // já veio do banco com valor: não deixar o cálculo sobrescrever de saída
        kwpManual: true, geracaoManual: true,
      });
      setItens(p.itens);
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  }

  // ===== Itens =====
  function addServico(id: string) {
    const s = (servicos.data ?? []).find((x) => x.id === id);
    if (!s) return;
    setItens((v) => [...v, {
      catalogo_id: s.id, descricao: s.nome, unidade: s.unidade,
      tipo_cobranca: s.tipo_cobranca, quantidade: 1,
      preco_unitario: s.preco_sugerido, desconto_pct: 0,
    }]);
  }
  const patchItem = (i: number, p: Partial<ItemProposta>) =>
    setItens((v) => v.map((it, k) => (k === i ? { ...it, ...p } : it)));

  // ===== Salvar =====
  const salvar = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('Sem formulário.');
      if (!form.cadastro_id) throw new Error('Escolha o cliente.');
      if (!itens.length) throw new Error('Inclua ao menos um item — é o valor da proposta.');
      const m = acharEquip(form.modulo_id);
      const inv = acharEquip(form.inversor_id);
      return salvarProposta({
        id: form.id, cadastro_id: form.cadastro_id, linha: form.linha,
        titulo: form.titulo || null, validade: form.validade || null,
        condicao_pagamento: form.condicao_pagamento || null,
        prazo_execucao: form.prazo_execucao || null,
        observacoes: form.observacoes || null,
        recipient_name: form.recipient_name || cliente?.nome || null,
        recipient_whatsapp: soDigitos(form.recipient_whatsapp) || cliente?.whatsapp || null,
        recipient_email: form.recipient_email || cliente?.email || null,
        itens: itens.filter((i) => i.descricao.trim()),
        sistema: !ehUsina ? null : {
          modulo_id: form.modulo_id || null, modulo_qtd: Number(form.modulo_qtd) || null,
          // descrição congelada: o PDF de hoje não pode mudar se o catálogo mudar amanhã
          modulo_descricao: m ? descreverEquipamento(m) : null,
          inversor_id: form.inversor_id || null,
          inversor_descricao: inv ? descreverEquipamento(inv) : null,
          potencia_instalada_kwp: dec(form.potencia_kwp) || null,
          geracao_media_kwh_mes: Number(form.geracao) || null,
          hsp: dec(form.hsp) || null, pr: dec(form.pr) || null,
          garantia_modulos_anos: m?.garantia_produto_anos ?? null,
          garantia_inversor_anos: inv?.garantia_produto_anos ?? null,
          tipo_telhado: cliente?.tipo_telhado ?? null, zona: cliente?.zona ?? null,
          observacoes_tecnicas: form.observacoes_tecnicas || null,
        },
      });
    },
    onSuccess: () => { setForm(null); setItens([]); setAviso('Proposta salva.'); void qc.invalidateQueries({ queryKey: ['propostas'] }); },
    onError: (e: Error) => setErro(e.message),
  });

  // ===== Ações da lista =====
  async function pdf(id: string, tipo: 'proposta' | 'contrato' = 'proposta') {
    const aba = abrirAbaDiferida(`Gerando o ${tipo}…`);
    setOcupado(`pdf:${id}`); setErro(''); setAviso('');
    try {
      const doc = await gerarDocumentoPdf(tipo, id);
      aba.mostrar(doc.blob, doc.nomeArquivo);
      setAviso(doc.fontes === 'padrao'
        ? 'PDF gerado com as fontes padrão — o site ainda não está servindo /fontes/*.ttf.'
        : 'PDF gerado.');
      void qc.invalidateQueries({ queryKey: ['propostas'] });
    } catch (e) { aba.falhar((e as Error).message); setErro((e as Error).message); }
    finally { setOcupado(null); }
  }

  async function enviar(p: PropostaLinha) {
    setOcupado(`enviar:${p.id}`); setErro(''); setAviso('');
    try {
      const dados = await obterProposta(p.id);
      const fone = dados.recipient_whatsapp || '';
      if (!fone) throw new Error('Sem WhatsApp do cliente. Edite a proposta e informe o número.');
      const r = await prepararEnvio(p.id, dados.recipient_email, dados.recipient_name, fone);
      const link = `${window.location.origin}/p/${r.token}`;
      const msg = `Olá, ${dados.recipient_name ?? ''}! Segue a sua proposta da Energy PRO `
        + `(${p.numero}), no valor de ${moeda(p.valor_total)}.\n\n`
        + `Você pode ver os detalhes e responder por aqui: ${link}`;
      window.open(linkWhatsapp(fone, msg), '_blank');
      setAviso('Proposta marcada como enviada e o WhatsApp foi aberto com o link.');
      void qc.invalidateQueries({ queryKey: ['propostas'] });
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  }

  async function acao(chave: string, fn: () => Promise<unknown>, msg: string) {
    setOcupado(chave); setErro(''); setAviso('');
    try { await fn(); setAviso(msg); void qc.invalidateQueries({ queryKey: ['propostas'] }); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  }

  const escrever = pode('escrever');

  return (
    <>
      <Cabecalho
        kicker="Comercial" titulo="Propostas"
        sub="O sistema calcula a potência e a geração; você confere o preço e envia pelo WhatsApp com link de aceite."
        acao={escrever ? <button className="botao" onClick={novo}>Nova proposta</button> : undefined}
      />

      {erro ? <div className="aviso erro" style={{ marginBottom: 14 }}>{erro}</div> : null}
      {aviso ? <div className="aviso bom" style={{ marginBottom: 14 }}>{aviso}</div> : null}

      {propostas.isLoading ? <div className="carregando">Carregando…</div>
        : propostas.error ? <div className="aviso erro">{(propostas.error as Error).message}</div>
        : !propostas.data?.length ? (
          <div className="cartao" style={{ padding: 28, textAlign: 'center' }}>
            <p className="sub" style={{ margin: 0 }}>
              Nenhuma proposta ainda. Crie uma aqui ou pelo botão “Criar proposta” no funil.
            </p>
          </div>
        ) : (
          <>
          <BarraFiltro
            busca={busca} aoBuscar={setBusca}
            placeholder="Buscar por número, cliente, cidade ou título"
            mostrando={listaFiltrada.length} total={propostas.data.length}
            aoLimpar={() => { setBusca(''); setFStatus(''); setFLinha(''); }}
            filtros={<>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filtrar por status">
                <option value="">Todos os status</option>
                {(Object.keys(ROTULO_STATUS) as StatusProposta[]).map((k) => (
                  <option key={k} value={k}>{ROTULO_STATUS[k]}</option>
                ))}
              </select>
              <select value={fLinha} onChange={(e) => setFLinha(e.target.value)} aria-label="Filtrar por linha">
                <option value="">Todas as linhas</option>
                {(linhas.data ?? []).map((l) => <option key={l.codigo} value={l.codigo}>{l.nome}</option>)}
              </select>
            </>}
          />
          {!listaFiltrada.length ? (
            <div className="cartao" style={{ padding: 24, textAlign: 'center' }}>
              <p className="sub" style={{ margin: 0 }}>Nenhuma proposta com esses filtros.</p>
            </div>
          ) : (
          <div className="cartao" style={{ overflowX: 'auto' }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Número</th><th>Cliente</th><th>Linha</th><th>Sistema</th>
                  <th className="dir">Valor</th><th>Status</th><th>Validade</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.numero ?? '—'}</b>
                      {p.revision > 0 ? <div className="meta">revisão {p.revision}</div> : null}
                    </td>
                    <td>{p.cliente ?? '—'}<div className="meta">{p.cidade ?? ''}</div></td>
                    <td>
                      {acharLinha(p.linha)?.nome ?? p.linha}
                      <div className="meta">
                        {(acharLinha(p.linha)?.documento ?? 'usina') === 'usina' ? 'proposta de usina' : 'proposta comercial'}
                      </div>
                    </td>
                    <td>
                      {p.potencia_kwp
                        ? <>{numero(p.potencia_kwp, 2)} kWp<div className="meta">{p.modulo_qtd} módulos</div></>
                        : <span className="meta">—</span>}
                    </td>
                    <td className="dir"><b>{moeda(p.valor_total)}</b></td>
                    <td><Selo status={p.status} /></td>
                    <td>{dataBr(p.validade)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {escrever && (p.status === 'rascunho' || p.status === 'enviada')
                          ? <button className="botao discreto" disabled={!!ocupado} onClick={() => void abrir(p.id)}>Editar</button> : null}
                        <button className="botao discreto" disabled={!!ocupado} onClick={() => void pdf(p.id)}>
                          {ocupado === `pdf:${p.id}` ? 'Gerando…' : 'PDF'}
                        </button>
                        {escrever && ['rascunho', 'enviada'].includes(p.status)
                          ? <button className="botao discreto" disabled={!!ocupado} onClick={() => void enviar(p)}>
                              {ocupado === `enviar:${p.id}` ? 'Preparando…' : 'Enviar'}
                            </button> : null}
                        {escrever
                          ? <button className="botao discreto" disabled={!!ocupado}
                              onClick={() => void acao(`dup:${p.id}`, () => duplicarProposta(p.id), 'Duplicada como novo rascunho.')}>
                              Duplicar
                            </button> : null}
                        {pode('converter') && p.status === 'aceita' && !p.contrato_id && acharLinha(p.linha)?.contrato_tipo
                          ? <button className="botao discreto" disabled={!!ocupado}
                              onClick={() => void acao(`ctr:${p.id}`, () => converterEmContrato(p.id), 'Contrato criado.')}>
                              Criar contrato
                            </button> : null}
                        {p.contrato_id
                          ? <button className="botao discreto" disabled={!!ocupado}
                              onClick={() => void pdf(p.contrato_id as string, 'contrato')}>
                              {ocupado === `pdf:${p.contrato_id}` ? 'Gerando…' : 'Contrato (PDF)'}
                            </button> : null}
                        {escrever && p.status === 'rascunho'
                          ? <button className="botao discreto" style={{ color: 'var(--ruim)' }} disabled={!!ocupado}
                              onClick={() => void acao(`arq:${p.id}`, () => arquivarProposta(p.id), 'Rascunho arquivado.')}>
                              Arquivar
                            </button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          </>
        )}

      {/* ===== Formulário ===== */}
      {form ? (
        <div className="painel-fundo" onClick={() => setForm(null)}>
          <aside className="painel" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{form.id ? 'Editar proposta' : 'Nova proposta'}</h2>
              <button className="botao discreto" onClick={() => setForm(null)}>Fechar</button>
            </header>

            <div className="painel-corpo">
              <div className="grade2">
                <label className="campo">
                  <span>Cliente *</span>
                  <select value={form.cadastro_id} onChange={(e) => setForm({ ...form, cadastro_id: e.target.value })}>
                    <option value="">Selecione…</option>
                    {(cadastros.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}{c.cidade ? ` — ${c.cidade}` : ''}</option>
                    ))}
                  </select>
                </label>
                <label className="campo">
                  <span>Linha de serviço *</span>
                  <select value={form.linha} onChange={(e) => setForm({ ...form, linha: e.target.value })}>
                    {(linhas.data ?? []).map((l) => <option key={l.codigo} value={l.codigo}>{l.nome}</option>)}
                  </select>
                </label>
                <label className="campo">
                  <span>Título</span>
                  <input value={form.titulo} placeholder="Ex.: Usina 4,26 kWp"
                         onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Validade</span>
                  <input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} />
                </label>
              </div>

              {cliente ? (
                <div className="aviso info" style={{ marginBottom: 16 }}>
                  Conta do cliente: {cliente.consumo_medio_kwh ? `${numero(cliente.consumo_medio_kwh)} kWh/mês` : 'consumo não informado'}
                  {cliente.valor_medio_conta ? ` · ${moeda(cliente.valor_medio_conta)}` : ''}
                  {sugestao ? <> · <b>sugestão: {sugestao} módulos</b>{' '}
                    <button className="botao discreto" style={{ padding: '2px 8px' }}
                            onClick={() => setForm({ ...form, modulo_qtd: String(sugestao), kwpManual: false, geracaoManual: false })}>
                      aplicar
                    </button></> : null}
                </div>
              ) : null}

              {linhaSel ? (
                <p className="meta" style={{ marginTop: -8, marginBottom: 14 }}>
                  {linhaSel.descricao}
                  {' '}<b>Documento:</b> {ehUsina ? 'proposta de usina' : 'Proposta Comercial'}.
                  {' '}<b>Contrato:</b> {linhaSel.contrato_tipo
                    ? (linhaSel.contrato_tipo === 'manutencao' ? 'de manutenção' : 'de fornecimento e instalação')
                    : 'não gera — fecha no aceite da proposta'}.
                </p>
              ) : null}

              {ehUsina ? (
                <section className="bloco">
                  <h3>Sistema proposto</h3>
                  <div className="grade2">
                    <label className="campo">
                      <span>Módulo</span>
                      <select value={form.modulo_id}
                              onChange={(e) => setForm({ ...form, modulo_id: e.target.value, kwpManual: false, geracaoManual: false })}>
                        <option value="">Selecione…</option>
                        {modulos.map((m) => <option key={m.id} value={m.id}>{descreverEquipamento(m)}</option>)}
                      </select>
                    </label>
                    <label className="campo">
                      <span>Quantidade de módulos</span>
                      <input type="number" min="1" value={form.modulo_qtd}
                             onChange={(e) => setForm({ ...form, modulo_qtd: e.target.value, kwpManual: false, geracaoManual: false })} />
                    </label>
                    <label className="campo" style={{ gridColumn: '1 / -1' }}>
                      <span>Inversor</span>
                      <select value={form.inversor_id} onChange={(e) => setForm({ ...form, inversor_id: e.target.value })}>
                        <option value="">Selecione…</option>
                        {inversores.map((i) => <option key={i.id} value={i.id}>{descreverEquipamento(i)}</option>)}
                      </select>
                    </label>
                    <label className="campo">
                      <span>Potência instalada (kWp) {form.kwpManual ? '· manual' : '· automática'}</span>
                      <input value={form.potencia_kwp}
                             onChange={(e) => setForm({ ...form, potencia_kwp: e.target.value, kwpManual: true })} />
                    </label>
                    <label className="campo">
                      <span>Geração média (kWh/mês) {form.geracaoManual ? '· manual' : '· automática'}</span>
                      <input value={form.geracao}
                             onChange={(e) => setForm({ ...form, geracao: e.target.value, geracaoManual: true })} />
                    </label>
                    <label className="campo">
                      <span>HSP (horas de sol pleno)</span>
                      <input value={form.hsp} onChange={(e) => setForm({ ...form, hsp: e.target.value, geracaoManual: false })} />
                    </label>
                    <label className="campo">
                      <span>PR (rendimento)</span>
                      <input value={form.pr} onChange={(e) => setForm({ ...form, pr: e.target.value, geracaoManual: false })} />
                    </label>
                  </div>
                  <p className="meta" style={{ marginTop: -4 }}>
                    Garantias vêm do catálogo: módulos {modulo?.garantia_produto_anos ?? '—'} anos ·
                    inversor {inversor?.garantia_produto_anos ?? '—'} anos.
                    {razao ? ` Razão CC/CA ${numero(razao, 2)}.` : ''}
                    {form.kwpManual || form.geracaoManual
                      ? ' Você editou um número à mão — o cálculo automático não sobrescreve mais.'
                      : ''}
                  </p>
                </section>
              ) : null}

              <section className="bloco">
                <h3>Itens · {moeda(total)}</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <select className="sel-inline" value="" onChange={(e) => { addServico(e.target.value); e.currentTarget.value = ''; }}>
                    <option value="">Adicionar do catálogo…</option>
                    {servicosDaLinha.proprios.length ? (
                      <optgroup label={linhaSel?.nome ?? 'Desta linha'}>
                        {servicosDaLinha.proprios.map((s) => (
                          <option key={s.id} value={s.id}>{s.codigo} · {s.nome}</option>
                        ))}
                      </optgroup>
                    ) : null}
                    {servicosDaLinha.outros.length ? (
                      <optgroup label="Outras linhas">
                        {servicosDaLinha.outros.map((s) => (
                          <option key={s.id} value={s.id}>{s.codigo} · {s.nome}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  <button className="botao secundario" onClick={() => setItens((v) => [...v, {
                    descricao: '', unidade: 'un', tipo_cobranca: 'avulso', quantidade: 1, preco_unitario: 0, desconto_pct: 0,
                  }])}>Item livre</button>
                </div>

                {itens.map((it, i) => (
                  <div key={i} className="linha-item">
                    <input placeholder="Descrição" value={it.descricao}
                           onChange={(e) => patchItem(i, { descricao: e.target.value })} />
                    <input type="number" step="0.001" placeholder="Qtd" value={it.quantidade}
                           onChange={(e) => patchItem(i, { quantidade: Number(e.target.value) })} />
                    <input type="number" step="0.01" placeholder="Preço" value={it.preco_unitario}
                           onChange={(e) => patchItem(i, { preco_unitario: Number(e.target.value) })} />
                    <input type="number" step="0.01" placeholder="Desc %" value={it.desconto_pct}
                           onChange={(e) => patchItem(i, { desconto_pct: Number(e.target.value) })} />
                    <span className="tot">{moeda(it.quantidade * it.preco_unitario * (1 - it.desconto_pct / 100))}</span>
                    <button className="botao discreto" style={{ color: 'var(--ruim)' }}
                            onClick={() => setItens((v) => v.filter((_, k) => k !== i))}>×</button>
                  </div>
                ))}
                {!itens.length ? <p className="meta">Sem itens — a proposta precisa de pelo menos um.</p> : null}
              </section>

              <section className="bloco">
                <h3>Envio e condições</h3>
                <div className="grade2">
                  <label className="campo">
                    <span>Destinatário</span>
                    <input value={form.recipient_name} placeholder={cliente?.nome ?? ''}
                           onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
                  </label>
                  <label className="campo">
                    <span>WhatsApp</span>
                    <input value={form.recipient_whatsapp} placeholder={cliente?.whatsapp ?? 'só números'}
                           onChange={(e) => setForm({ ...form, recipient_whatsapp: e.target.value })} />
                  </label>
                </div>
                <label className="campo">
                  <span>Condição de pagamento</span>
                  <input value={form.condicao_pagamento} placeholder="Deixe em branco para usar o padrão da empresa"
                         onChange={(e) => setForm({ ...form, condicao_pagamento: e.target.value })} />
                </label>
                {!ehUsina ? (
                  <label className="campo">
                    <span>Prazo de execução</span>
                    <input value={form.prazo_execucao} placeholder="Ex.: 5 dias úteis após a aprovação"
                           onChange={(e) => setForm({ ...form, prazo_execucao: e.target.value })} />
                  </label>
                ) : null}
                <label className="campo">
                  <span>Observações</span>
                  <textarea rows={2} value={form.observacoes}
                            onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                </label>
              </section>
            </div>

            <footer>
              <button className="botao secundario" onClick={() => setForm(null)}>Cancelar</button>
              <button className="botao" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
                {salvar.isPending ? 'Salvando…' : 'Salvar proposta'}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Selo({ status }: { status: StatusProposta }) {
  const tom = status === 'aceita' ? ' bom'
    : status === 'recusada' || status === 'expirada' ? ' ruim'
    : status === 'enviada' ? ' quente' : '';
  return <span className={`pilula${tom}`}>{ROTULO_STATUS[status] ?? status}</span>;
}
