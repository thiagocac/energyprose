import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cabecalho } from '../componentes/Layout';
import { BarraFiltro, casa } from '../componentes/Filtros';
import { useAuth } from '../lib/auth';
import { moeda, numero, dataBr, dataFutura, linkWhatsapp, soDigitos, paraNumero } from '../lib/formato';
import { kwp, geracaoMensal, sugerirModulos, razaoCcCa } from '../lib/solar';
import { gerarDocumentoPdf, abrirAbaDiferida, linkDoDocumento } from '../lib/api/documentos';
import {
  listarPropostas, obterProposta, salvarProposta, duplicarProposta,
  prepararEnvio, converterEmContrato, arquivarProposta, acompanhar,
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

const emDias = (d: number) => dataFutura({ dias: d });
/**
 * ARMADILHA JÁ PAGA: a versão daqui só trocava vírgula por ponto, então a
 * geração digitada à mão como "1.200" kWh/mês virava 1,2 — e ia assim para o
 * PDF que o cliente lê. Agora é a mesma regra do resto do sistema.
 */
const dec = paraNumero;

export function Propostas() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  // O que sobrou do último envio. O link de aceite só existia dentro da função
  // que enviava: se o pop-up fosse bloqueado, não havia como recuperá-lo pela
  // interface — o único caminho era reenviar, que emite outro token.
  const [envio, setEnvio] = useState<null | {
    numero: string; link: string; whats: string; correio: string;
    faltaPdf: string; abriu: boolean;
  }>(null);
  const { id: idDaRota } = useParams();
  const navegar = useNavigate();
  const jaAbriuDaRota = useRef(false);
  const [form, setForm] = useState<Form | null>(null);
  const [itens, setItens] = useState<ItemProposta[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fLinha, setFLinha] = useState('');
  const [soCobrar, setSoCobrar] = useState(false);

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
      && (!soCobrar || acompanhar(p).cobrar)
      && casa(busca, p.numero, p.cliente, p.cidade, p.titulo)
    ));
  }, [propostas.data, busca, fStatus, fLinha, soCobrar]);

  // O que o vendedor precisa saber ao abrir a tela, antes de olhar a lista.
  const resumo = useMemo(() => {
    const todas = propostas.data ?? [];
    const enviadas = todas.filter((p) => p.status === 'enviada');
    return {
      aguardando: enviadas.length,
      semAbrir: enviadas.filter((p) => !p.public_first_view_at).length,
      abertas: enviadas.filter((p) => p.public_first_view_at).length,
      cobrar: todas.filter((p) => acompanhar(p).cobrar).length,
    };
  }, [propostas.data]);

  /**
   * Resultado, e não estoque.
   *
   * Os dez indicadores que existiam mediam quantas propostas estão em cada
   * situação — nenhum media se a empresa está vendendo. Faltavam as três
   * respostas que se dá numa conversa sobre o negócio: de cada dez que
   * respondem, quantas aceitam; quanto vale uma venda; quanto entrou.
   *
   * A conta é sobre a lista que já está carregada — nada volta ao banco. O
   * denominador são as RESPONDIDAS, não as enviadas: proposta que ainda está
   * na mão do cliente não é perda, e contá-la afundaria a taxa sem motivo.
   */
  const resultado = useMemo(() => {
    const todas = propostas.data ?? [];
    const aceitas = todas.filter((p) => p.status === 'aceita');
    const respondidas = aceitas.length + todas.filter((p) => p.status === 'recusada').length;
    const soma = aceitas.reduce((s, p) => s + p.valor_total, 0);
    return {
      respondidas,
      aceitas: aceitas.length,
      taxa: respondidas ? Math.round((aceitas.length / respondidas) * 100) : 0,
      ticket: aceitas.length ? soma / aceitas.length : 0,
      soma,
    };
  }, [propostas.data]);

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

  /**
   * Chegou por /propostas/<id> — o link que o funil oferece. Abre o painel uma
   * vez e limpa a rota, para que fechar o painel não reabra sozinho e para o
   * botão Voltar do navegador não ficar preso nesta proposta.
   */
  useEffect(() => {
    if (!idDaRota || jaAbriuDaRota.current) return;
    jaAbriuDaRota.current = true;
    void abrir(idDaRota).then(() => navegar('/propostas', { replace: true }));
    // `abrir` é recriada a cada render; a trava do ref é o que garante uma vez só.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDaRota]);

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
          geracao_media_kwh_mes: dec(form.geracao) || null,
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
    // Reenviar não é enviar de novo: o link que o cliente tem no celular morre,
    // e o registro de que ele abriu vai junto. O botão tinha o mesmo rótulo do
    // primeiro envio e disparava no primeiro toque.
    const reenvio = p.status === 'enviada';
    if (reenvio && !confirm(
      `Reenviar a proposta ${p.numero ?? ''}?\n\n`
      + 'O link que o cliente já recebeu deixa de funcionar, e o registro de '
      + 'que ele abriu é apagado.',
    )) return;

    // A aba nasce AQUI, no clique. Depois vêm três idas ao servidor — buscar a
    // proposta, congelar o envio, gerar o PDF — e quando elas terminam o
    // navegador já não aceita `window.open`, porque o gesto do usuário
    // expirou. Era assim que a proposta ficava marcada como enviada, o token
    // congelado, a tela dizendo "o WhatsApp abriu" — e o cliente sem nada.
    //
    // Ainda pode ser barrada: no reenvio, se a pessoa demorar a responder a
    // confirmação, a permissão do clique vence antes daqui. Por isso o recibo
    // abaixo mostra o link e um botão de abrir — sem depender de pop-up nenhum.
    const aba = abrirAbaDiferida('Preparando o envio…');
    setOcupado(`enviar:${p.id}`); setErro(''); setAviso(''); setEnvio(null);
    try {
      const dados = await obterProposta(p.id);
      // O número do cadastro é o mesmo número. Reclamar de um dado que o
      // sistema já tem custava três passos: erro, editar, digitar, salvar.
      const cad = (cadastros.data ?? []).find((c) => c.id === p.cadastro_id);
      const fone = dados.recipient_whatsapp || cad?.whatsapp || '';
      const email = dados.recipient_email || cad?.email || '';
      // Cliente pessoa jurídica costuma dar e-mail e não celular. A tela
      // bloqueava o envio nesses casos, e o lead saía por fora do sistema —
      // sem token, sem registro de abertura, sem follow-up, sem validade.
      // Agora só barra quando não há NENHUM caminho de contato.
      if (!fone && !email) {
        throw new Error('Este cliente não tem WhatsApp nem e-mail. Edite a proposta e informe um dos dois.');
      }
      // O nome e o e-mail seguem a mesma regra do telefone: o do cadastro vale
      // quando a proposta não tem o seu. Antes, `recipient_email` ia cru — o
      // botão de e-mail na tela usava o do cadastro e a RPC congelava `null`.
      const nome = dados.recipient_name || cad?.nome || '';
      const r = await prepararEnvio(p.id, email || null, nome || null, fone);

      // O PDF é gerado DEPOIS de preparar o envio, que é quando a revisão fica
      // congelada — assim o arquivo corresponde exatamente ao que o cliente vê
      // no link. E é gerado agora, e não sob demanda, porque o link de download
      // só funciona com o arquivo já arquivado no bucket.
      let faltaPdf = '';
      try {
        await gerarDocumentoPdf('proposta', p.id);
      } catch (e) {
        // A falha não impede o envio — a proposta já está congelada e o cliente
        // precisa do link de aceite. Mas a MENSAGEM não pode ser jogada fora:
        // ela costuma dizer exatamente o que falta preencher em Configurações,
        // e antes o vendedor lia só "não pôde ser gerado".
        faltaPdf = (e as Error).message;
      }

      const base = `${window.location.origin}/p/${r.token}`;
      // ARMADILHA JÁ PAGA: era `${dados.recipient_name ?? ''}` e `${p.numero}`
      // crus. Proposta criada pelo funil nasce sem destinatário e sem número,
      // então o cliente recebia literalmente "Olá, ! Segue a sua proposta da
      // Energy PRO (null)". O nome do cadastro estava a duas linhas dali.
      const msg = `Olá${nome ? `, ${nome}` : ''}! Segue a sua proposta da Energy PRO`
        + `${p.numero ? ` (${p.numero})` : ''}, no valor de ${moeda(p.valor_total)}.\n\n`
        + `Ver os detalhes e responder: ${base}`
        + (faltaPdf ? '' : `\n\nBaixar a proposta em PDF: ${base}/pdf`);
      const whats = fone ? linkWhatsapp(fone, msg) : '';
      // O `mailto:` abre o programa de e-mail da própria pessoa: nenhum
      // servidor de envio, nenhuma dependência nova, e a proposta fica
      // corretamente marcada como enviada de qualquer jeito.
      const correio = email
        ? `mailto:${encodeURIComponent(email)}`
          + `?subject=${encodeURIComponent(`Proposta ${p.numero ?? ''} — Energy PRO`)}`
          + `&body=${encodeURIComponent(msg)}`
        : '';
      setEnvio({
        numero: p.numero ?? '', link: base, whats, correio, faltaPdf,
        abriu: whats ? aba.irPara(whats) : (aba.falhar('Envie o link pelo e-mail, na tela.'), false),
      });
      void qc.invalidateQueries({ queryKey: ['propostas'] });
    } catch (e) {
      aba.falhar((e as Error).message);
      setErro((e as Error).message);
    } finally { setOcupado(null); }
  }

  /**
   * Abrir o documento que o cliente REALMENTE recebeu, e não um novo.
   * A aba nasce no clique; o link assinado vale 5 minutos.
   */
  async function abrirArquivado(caminho: string, chave: string) {
    const aba = abrirAbaDiferida('Abrindo o documento enviado…');
    setOcupado(chave); setErro('');
    try {
      aba.irPara(await linkDoDocumento(caminho));
    } catch (e) {
      aba.falhar((e as Error).message); setErro((e as Error).message);
    } finally { setOcupado(null); }
  }

  /** Copiar sem depender de o navegador ter permissão — se não der, avisa. */
  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso('Link copiado.');
    } catch {
      setErro('O navegador não deixou copiar. Selecione o link e copie à mão.');
    }
  }

  /**
   * Duplicar e já abrir a cópia. Antes a tela dizia "Duplicada como novo
   * rascunho" e a pessoa ia caçar o registro na lista — justamente quando
   * acabou de ter uma proposta recusada por preço e quer refazer.
   */
  async function duplicarEAbrir(id: string) {
    setOcupado(`dup:${id}`); setErro(''); setAviso('');
    try {
      const novo = await duplicarProposta(id);
      await qc.invalidateQueries({ queryKey: ['propostas'] });
      setOcupado(null);
      await abrir(novo);
      setAviso('Cópia aberta como novo rascunho. Ajuste o que precisar e salve.');
    } catch (e) { setErro((e as Error).message); setOcupado(null); }
  }

  async function acao(chave: string, fn: () => Promise<unknown>, msg: string) {
    setOcupado(chave); setErro(''); setAviso(''); setEnvio(null);
    try { await fn(); setAviso(msg); void qc.invalidateQueries({ queryKey: ['propostas'] }); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  }

  const escrever = pode('escrever');

  return (
    <>
      <Cabecalho
        kicker="Comercial" titulo="Propostas"
        sub="O sistema calcula a potência e a geração; você confere o preço e envia por WhatsApp ou e-mail, com link de aceite."
        acao={escrever ? <button className="botao" onClick={novo}>Nova proposta</button> : undefined}
      />

      {/* Com o painel aberto o erro é de validação e aparece lá dentro, junto do
          botão. Aqui em cima ele ficaria atrás do véu escuro, sem ninguém ver. */}
      {erro && !form ? <div className="aviso erro" style={{ marginBottom: 14 }}>{erro}</div> : null}
      {aviso ? <div className="aviso bom" style={{ marginBottom: 14 }}>{aviso}</div> : null}

      {/* O que sobrou do envio. Fica na tela até a pessoa fechar, porque é a
          única cópia do link de aceite que existe fora da mensagem enviada. */}
      {/* Verde só quando deu tudo certo mesmo: enviar sem PDF, ou com o pop-up
          barrado, é caso de olhar — não de aviso comemorativo. */}
      {envio ? (
        <div className={`aviso ${envio.abriu && !envio.faltaPdf ? 'bom' : 'info'} envio`}
             style={{ marginBottom: 14 }}>
          <div className="envio-topo">
            <b>
              {envio.abriu
                ? `Proposta ${envio.numero} pronta — o WhatsApp abriu em outra aba.`
                : envio.whats
                  ? `Proposta ${envio.numero} pronta, mas o navegador bloqueou a janela do WhatsApp.`
                  : `Proposta ${envio.numero} pronta. Este cliente não tem WhatsApp — mande por e-mail ou copie o link.`}
            </b>
            <button className="botao discreto" onClick={() => setEnvio(null)} aria-label="Fechar o aviso de envio">
              Fechar
            </button>
          </div>
          {!envio.abriu && envio.whats ? (
            <p style={{ margin: '4px 0 8px' }}>
              Use o botão abaixo para abrir, ou copie o link e mande você mesmo.
            </p>
          ) : null}
          {envio.faltaPdf ? (
            <p style={{ margin: '4px 0 8px' }}>
              <b>Foi sem o PDF anexo:</b> {envio.faltaPdf}{' '}
              Corrija e clique em PDF nesta linha — o link de aceite continua valendo.
            </p>
          ) : null}
          <div className="envio-link">
            <code>{envio.link}</code>
            <button className="botao discreto" onClick={() => void copiar(envio.link)}>Copiar link</button>
            {envio.whats ? (
              <a className="botao discreto" href={envio.whats} target="_blank" rel="noopener">
                {envio.abriu ? 'Abrir o WhatsApp de novo' : 'Abrir o WhatsApp'}
              </a>
            ) : null}
            {envio.correio ? (
              <a className="botao discreto" href={envio.correio}>Mandar por e-mail</a>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Resultado primeiro, acompanhamento depois: o dono abre esta tela para
          saber se está vendendo, não quantas propostas estão em trânsito.
          Só aparece quando alguém já respondeu — antes disso seria 0% de nada. */}
      {resultado.respondidas ? (
        <div className="kpis">
          <KpiP rot="Taxa de aceite" val={`${resultado.taxa}%`}
                nota={`${resultado.aceitas} de ${resultado.respondidas} respondidas`} />
          <KpiP rot="Ticket médio" val={moeda(resultado.ticket)} nota="média das aceitas" />
          <KpiP rot="Total aceito" val={moeda(resultado.soma)} nota="soma das propostas aceitas" />
        </div>
      ) : null}

      {resumo.aguardando ? (
        <div className="kpis">
          <KpiP rot="Aguardando resposta" val={String(resumo.aguardando)} />
          <KpiP rot="Cliente já abriu" val={String(resumo.abertas)} />
          <KpiP rot="Link não aberto" val={String(resumo.semAbrir)} />
          <KpiP rot="Cobrar retorno" val={String(resumo.cobrar)} alerta={resumo.cobrar > 0} />
        </div>
      ) : null}

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
            aoLimpar={() => { setBusca(''); setFStatus(''); setFLinha(''); setSoCobrar(false); }}
            filtros={<>
              <label className="filtro-marca">
                <input type="checkbox" checked={soCobrar} onChange={(e) => setSoCobrar(e.target.checked)} />
                Só as que precisam de retorno
              </label>
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
                  <th className="dir">Valor</th><th>Status</th><th>Acompanhamento</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((p) => (
                  <tr key={p.id}>
                    <td className="num">
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
                    <td><Sinal p={p} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {escrever && (p.status === 'rascunho' || p.status === 'enviada')
                          ? <button className="botao discreto" disabled={!!ocupado} onClick={() => void abrir(p.id)}>Editar</button> : null}
                        {/* Dois botões diferentes de propósito. "PDF enviado"
                            abre o arquivo que o cliente tem; "Gerar PDF" cria
                            um novo, que pode sair diferente se as configurações
                            ou o catálogo mudaram desde então. */}
                        {p.pdf_path ? (
                          <button className="botao discreto" disabled={!!ocupado}
                                  onClick={() => void abrirArquivado(p.pdf_path as string, `arq:${p.id}`)}>
                            {ocupado === `arq:${p.id}` ? 'Abrindo…' : 'PDF enviado'}
                          </button>
                        ) : null}
                        <button className="botao discreto" disabled={!!ocupado} onClick={() => void pdf(p.id)}>
                          {ocupado === `pdf:${p.id}` ? 'Gerando…' : p.pdf_path ? 'Gerar de novo' : 'PDF'}
                        </button>
                        {escrever && ['rascunho', 'enviada'].includes(p.status)
                          ? <button className="botao discreto" disabled={!!ocupado} onClick={() => void enviar(p)}>
                              {ocupado === `enviar:${p.id}` ? 'Preparando…'
                                : p.status === 'enviada' ? 'Reenviar' : 'Enviar'}
                            </button> : null}
                        {escrever
                          ? <button className="botao discreto" disabled={!!ocupado}
                              onClick={() => void duplicarEAbrir(p.id)}>
                              {ocupado === `dup:${p.id}` ? 'Duplicando…' : 'Duplicar'}
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
                        {/* Arquivar grava `deleted_at` e o rascunho some da lista
                            para sempre: não existe filtro de arquivados nem
                            lixeira para desfazer. Merece a pergunta. */}
                        {escrever && p.status === 'rascunho'
                          ? <button className="botao discreto" style={{ color: 'var(--ruim)' }} disabled={!!ocupado}
                              onClick={() => {
                                if (!confirm(`Arquivar o rascunho de ${p.cliente ?? 'cliente'}?\n\n`
                                  + 'Ele sai da lista e não há como trazer de volta pela tela.')) return;
                                void acao(`arq:${p.id}`, () => arquivarProposta(p.id), 'Rascunho arquivado.');
                              }}>
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
                  <span>
                    Cliente *
                    {/* A conta de luz e as fotos do telhado chegam pelo
                        formulário público e só o painel de cadastros as mostra.
                        Link comum, sem reescrever o visualizador. */}
                    {form.cadastro_id ? (
                      <a href={`/cadastros/${form.cadastro_id}`} target="_blank" rel="noopener"
                         style={{ float: 'right', fontWeight: 500 }}>
                        conta de luz e documentos ↗
                      </a>
                    ) : null}
                  </span>
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
                  {cliente.concessionaria ? ` · ${cliente.concessionaria}` : ''}
                  {cliente.numero_instalacao ? ` · instalação ${cliente.numero_instalacao}` : ''}
                  {/* O preço que o concorrente já deu. Precificar sem ver isso
                      é trabalhar no escuro com a informação a um clique. */}
                  {cliente.valor_proposta || cliente.kit_descricao ? (
                    <div style={{ marginTop: 6 }}>
                      {cliente.valor_proposta
                        ? <b>Cliente já tem proposta de {moeda(cliente.valor_proposta)}</b>
                        : <span>Kit que o cliente citou:</span>}
                      {cliente.kit_descricao ? ` ${cliente.valor_proposta ? '— ' : ''}${cliente.kit_descricao}` : ''}
                    </div>
                  ) : null}
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

                  {/* Esta caixa faltava, e só ela. O campo já existia na tabela,
                      já era lido ao abrir a proposta e já era gravado ao salvar
                      — não havia onde digitar, então estava vazio em 100% dos
                      registros. Quem sobe no telhado em Barra do Choça mede,
                      olha o padrão de entrada, e o resultado da viagem vivia na
                      cabeça até a proposta ser escrita. */}
                  <label className="campo" style={{ marginTop: 14, marginBottom: 0 }}>
                    <span>O que você viu na visita · uso interno</span>
                    <textarea rows={3} value={form.observacoes_tecnicas}
                              placeholder="Ex.: telhado cerâmico, 4 águas, padrão de entrada 63 A monofásico, precisa trocar disjuntor. Quadro a 18 m do local dos módulos."
                              onChange={(e) => setForm({ ...form, observacoes_tecnicas: e.target.value })} />
                  </label>
                  <p className="meta" style={{ marginTop: 4 }}>
                    Não sai no PDF do cliente — fica para quem dimensiona e para
                    quem vai executar a obra.
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
              {/* "Escolha o cliente." e "Inclua ao menos um item" nasciam na
                  página, atrás deste painel. O botão voltava de "Salvando…"
                  para "Salvar proposta" e nada mais acontecia. */}
              {erro ? <div className="aviso erro">{erro}</div> : null}
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

function KpiP({ rot, val, alerta, nota }: {
  rot: string; val: string; alerta?: boolean; nota?: string;
}) {
  return (
    <div className="cartao kpi">
      <div className="rot">{rot}</div>
      <div className={`val${alerta ? ' alerta' : ''}`}>{val}</div>
      {/* A nota diz de onde saiu o número. "62%" sozinho convida a interpretar
          errado; "5 de 8 respondidas" não deixa dúvida sobre o denominador. */}
      {nota ? <div className="nota">{nota}</div> : null}
    </div>
  );
}

/**
 * Coluna que responde à pergunta que o vendedor faz sozinho toda manhã:
 * "esse cliente já viu a proposta, e há quanto tempo estou sem resposta?"
 */
function Sinal({ p }: { p: PropostaLinha }) {
  const a = acompanhar(p);
  if (a.situacao === 'respondida') {
    return (
      <>
        <span className="meta">
          {p.status === 'aceita' ? 'Aceita' : 'Recusada'} em {dataBr(p.public_action_at)}
        </span>
        {/* O que o cliente escreveu ao responder é o dado mais útil do funil e
            ficava guardado no banco sem nenhuma tela para mostrá-lo. */}
        {p.response_comment ? <div className="recado">“{p.response_comment}”</div> : null}
      </>
    );
  }
  if (a.situacao === 'nao_enviada') {
    return <span className="meta">vence {dataBr(p.validade)}</span>;
  }
  return (
    <>
      <span className={`pilula${a.situacao === 'aberta' ? ' bom' : ''}`}>{a.rotulo}</span>
      {a.cobrar ? <span className="pilula ruim" style={{ marginLeft: 4 }}>cobrar</span> : null}
      <div className="meta">{a.detalhe}</div>
    </>
  );
}

function Selo({ status }: { status: StatusProposta }) {
  const tom = status === 'aceita' ? ' bom'
    : status === 'recusada' || status === 'expirada' ? ' ruim'
    : status === 'enviada' ? ' quente' : '';
  return <span className={`pilula${tom}`}>{ROTULO_STATUS[status] ?? status}</span>;
}
