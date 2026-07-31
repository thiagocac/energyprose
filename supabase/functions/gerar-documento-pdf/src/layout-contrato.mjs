// ============================================================================
// EnergyPRO — CONTRATO (usina fotovoltaica e plano de manutenção)
//
// Documento textual, multipágina, com fluxo automático: as cláusulas são
// escritas em sequência e o motor quebra a página sozinho, repetindo o
// cabeçalho corrido e a paginação.
//
// O TEXTO É UMA MINUTA. A estrutura segue a praxe do setor, mas cláusula de
// contrato é matéria jurídica — o texto precisa passar pelo advogado da
// ConsulteGEO antes do primeiro uso real.
//
// O que vem do banco: partes, valores, prazos, garantias e o quadro do sistema.
// O que é fixo aqui: a redação das cláusulas.
// ============================================================================
import { rgb } from 'pdf-lib';
import {
  A4W, A4H, X, Y, W, MM,
  rect, roundRect, line, text, wrap, fit, moeda, numero, dataBr, fone,
} from './brand.mjs';
import { icon } from './icons.mjs';
import { lockupHorizontal, MARCA } from './logo.mjs';
import { reaisPorExtenso } from './extenso.mjs';

const C = {
  banda: MARCA.navyDeep,
  amber: MARCA.warm,
  tinta: rgb(0.09, 0.13, 0.20),
  suave: rgb(0.42, 0.47, 0.55),
  linha: rgb(0.87, 0.90, 0.94),
  fundo: rgb(0.96, 0.97, 0.985),
  branco: rgb(1, 1, 1),
};

const MARGEM = 20;              // documento de texto pede margem maior
const LARG = 210 - 2 * MARGEM;
const TOPO_P1 = 52;             // abaixo da faixa da capa
const TOPO_N = 28;              // demais páginas
const RODAPE = 274;             // limite inferior do conteúdo

/**
 * A Energy PRO vende duas coisas diferentes, e o contrato de uma não serve para
 * a outra: a usina é obra (fornece equipamento, instala, homologa e entrega), a
 * manutenção é serviço continuado (visita, mede, limpa, e responde a chamado).
 * Objeto, prazos, garantias e rescisão mudam por completo. Por isso o documento
 * tem dois corpos de cláusula; capa, partes, LGPD e foro são comuns aos dois.
 */
const chaveTipo = (d) => (d.contrato?.tipo === 'manutencao' ? 'manutencao' : 'usina');

/**
 * CPF/CNPJ com máscara. O banco guarda só dígitos (é o certo para buscar e
 * comparar), mas num instrumento que vai a cartório o documento sem pontuação
 * parece erro de digitação. Se não tiver 11 nem 14 dígitos, devolve como veio —
 * melhor mostrar o que existe do que esconder um cadastro incompleto.
 */
function docBr(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return String(v ?? '');
}

const TITULO_CAPA = {
  usina: ['CONTRATO DE FORNECIMENTO E INSTALAÇÃO', 'DE SISTEMA DE ENERGIA SOLAR FOTOVOLTAICA'],
  manutencao: ['CONTRATO DE PRESTAÇÃO DE SERVIÇOS', 'DE MANUTENÇÃO DE SISTEMA FOTOVOLTAICO'],
};
const TITULO_CORRIDO = {
  usina: 'CONTRATO DE FORNECIMENTO E INSTALAÇÃO DE SISTEMA FOTOVOLTAICO',
  manutencao: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MANUTENÇÃO DE SISTEMA FOTOVOLTAICO',
};

/** Estado do fluxo de texto: sabe em que página e altura estamos. */
function criarFluxo(doc, ctx) {
  const estado = { page: null, y: 0, n: 0 };

  function novaPagina(primeira = false) {
    estado.page = doc.addPage([A4W, A4H]);
    estado.n += 1;
    rect(estado.page, { x: 0, y: 0, w: 210, h: 297, color: C.branco });
    if (!primeira) {
      // cabeçalho corrido
      text(estado.page, TITULO_CORRIDO[chaveTipo(ctx.dados)], {
        x: MARGEM, y: 14, size: 6.6, font: ctx.F.os6, color: C.suave, tracking: 0.4,
      });
      text(estado.page, ctx.dados.contrato.numero ?? '', {
        x: MARGEM, y: 14, w: LARG, size: 6.6, font: ctx.F.pop6, color: C.banda, align: 'right',
      });
      line(estado.page, { x1: MARGEM, y1: 18.5, x2: 210 - MARGEM, y2: 18.5, color: C.linha, thickness: 0.4 });
    }
    estado.y = primeira ? TOPO_P1 : TOPO_N;
    return estado.page;
  }

  /** Garante `altura` mm livres; se não houver, vira a página. */
  function garantir(altura) {
    if (estado.y + altura > RODAPE) novaPagina();
  }

  return { estado, novaPagina, garantir };
}

/**
 * Os itens do catálogo vêm em CAIXA ALTA porque é assim que aparecem na grade da
 * proposta. Num contrato, caixa alta corrida fica gritada — mas baixar tudo
 * estragaria as siglas ("DPS CC" viraria "Dps cc").
 *
 * Tamanho da palavra NÃO serve de critério: "DPS" e "MÃO" têm três letras cada.
 * Por isso a lista de siglas é explícita — previsível e fácil de manter.
 */
const SIGLAS = new Set([
  'ART', 'DPS', 'CC', 'CA', 'MC4', 'AC', 'DC', 'ABNT', 'NBR', 'INMETRO',
  'UV', 'LED', 'QDC', 'QGBT', 'CFTV', 'CA)', 'CC)',
]);
function humanizar(txt) {
  const palavras = txt.split(/\s+/).filter(Boolean).map((p) => {
    const nu = p.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').toUpperCase();
    return SIGLAS.has(nu) ? p.toUpperCase() : p.toLocaleLowerCase('pt-BR');
  });
  const s = palavras.join(' ');
  return s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
}

// ===== Blocos de texto =====
function titulo(fl, ctx, txt) {
  fl.garantir(14);
  fl.estado.y += 4;
  text(fl.estado.page, txt, {
    x: MARGEM, y: fl.estado.y, size: 9.4, font: ctx.F.pop7, color: C.banda, tracking: 0.3,
  });
  fl.estado.y += 5.6;
  line(fl.estado.page, { x1: MARGEM, y1: fl.estado.y - 1.4, x2: MARGEM + 16, y2: fl.estado.y - 1.4, color: C.amber, thickness: 0.7 });
  fl.estado.y += 1.4;
}

/**
 * Título de cláusula com numeração automática. Os dois corpos de contrato têm
 * quantidades diferentes de cláusulas, e as finais (LGPD, foro) são as mesmas
 * nos dois — numerar à mão garantiria um "CLÁUSULA 12" seguido de "CLÁUSULA 12"
 * no dia em que alguém inserisse uma no meio.
 */
function clausula(fl, ctx, nome) {
  ctx.nc += 1;
  // Título de cláusula sozinho no pé da página fica órfão e dá impressão de
  // documento cortado. Exigimos espaço para o título mais três linhas.
  fl.garantir(26);
  titulo(fl, ctx, `CLÁUSULA ${ctx.nc} — ${nome}`);
}

/** Parágrafo justificado à esquerda, com quebra de página no meio se precisar. */
function paragrafo(fl, ctx, txt, { recuo = 0, tamanho = 8.6, fonte = null, cor = C.tinta, entre = 1.42 } = {}) {
  const f = fonte ?? ctx.F.os4;
  const linhas = wrap(f, txt, tamanho, LARG - recuo);
  const passo = (tamanho * entre) / MM;
  for (const ln of linhas) {
    fl.garantir(passo);
    text(fl.estado.page, ln, { x: MARGEM + recuo, y: fl.estado.y, size: tamanho, font: f, color: cor });
    fl.estado.y += passo;
  }
  fl.estado.y += 1.6;
}

/**
 * Item de lista. O marcador é DESENHADO, não escrito: as fontes embutidas são
 * subconjuntos com o alfabeto latino, e caracteres como "•" simplesmente não
 * existem nelas — sairiam invisíveis.
 */
function item(fl, ctx, txt) {
  const tamanho = 8.4;
  const passo = (tamanho * 1.4) / MM;
  const linhas = wrap(ctx.F.os4, txt, tamanho, LARG - 7);
  fl.garantir(passo * linhas.length);
  rect(fl.estado.page, { x: MARGEM + 2, y: fl.estado.y + 1.5, w: 1.5, h: 1.5, color: C.amber });
  linhas.forEach((ln, i) => {
    text(fl.estado.page, ln, { x: MARGEM + 7, y: fl.estado.y + i * passo, size: tamanho, font: ctx.F.os4, color: C.tinta });
  });
  fl.estado.y += passo * linhas.length + 0.8;
}

/** Linha rótulo/valor dentro de um quadro. */
function quadroLinha(fl, ctx, rot, val, largRot = 52) {
  const passo = 4.9;
  fl.garantir(passo);
  text(fl.estado.page, rot, { x: MARGEM + 4, y: fl.estado.y, size: 7.8, font: ctx.F.os6, color: C.suave });
  text(fl.estado.page, fit(ctx.F.pop6, val, 8.2, LARG - largRot - 8), {
    x: MARGEM + largRot, y: fl.estado.y, size: 8.2, font: ctx.F.pop6, color: C.tinta,
  });
  fl.estado.y += passo;
}

// ============================================================================
// Capa
// ============================================================================
function capa(fl, ctx) {
  const p = fl.novaPagina(true);
  const d = ctx.dados;

  rect(p, { x: 0, y: 0, w: 210, h: 40, color: C.banda });
  rect(p, { x: 0, y: 38.8, w: 210, h: 1.2, color: C.amber });
  lockupHorizontal(p, { x: MARGEM, y: 9, s: 11, solida: C.branco });

  text(p, 'CONTRATO', {
    x: 210 - MARGEM - 90, y: 11, w: 90, size: 8.6, font: ctx.F.pop6,
    color: C.branco, align: 'right', tracking: 1.4,
  });
  text(p, d.contrato.numero ?? '', {
    x: 210 - MARGEM - 90, y: 17.4, w: 90, size: 15, font: ctx.F.pop7,
    color: C.amber, align: 'right',
  });
  text(p, `Emitido em ${d.hoje}`, {
    x: 210 - MARGEM - 90, y: 27, w: 90, size: 6.6, font: ctx.F.os4,
    color: rgb(0.78, 0.84, 0.9), align: 'right',
  });

  const [l1, l2] = TITULO_CAPA[chaveTipo(d)];
  fl.estado.y = 50;
  text(p, l1, {
    x: MARGEM, y: fl.estado.y, w: LARG, size: 12.6, font: ctx.F.pop7, color: C.banda, align: 'center',
  });
  text(p, l2, {
    x: MARGEM, y: fl.estado.y + 6.4, w: LARG, size: 12.6, font: ctx.F.pop7, color: C.banda, align: 'center',
  });
  fl.estado.y += 18;
}

// ============================================================================
// Partes
// ============================================================================
function partes(fl, ctx) {
  const { empresa, cliente } = ctx.dados;
  clausula(fl, ctx, 'DAS PARTES');

  const alturaQuadro = 30;
  fl.garantir(alturaQuadro * 2 + 8);

  // Contratada
  roundRect(fl.estado.page, { x: MARGEM, y: fl.estado.y, w: LARG, h: alturaQuadro, r: 2, color: C.fundo, borderColor: C.linha, borderWidth: 0.4 });
  fl.estado.y += 3.6;
  text(fl.estado.page, 'CONTRATADA', { x: MARGEM + 4, y: fl.estado.y, size: 6.4, font: ctx.F.pop7, color: C.amber, tracking: 0.6 });
  fl.estado.y += 4.4;
  quadroLinha(fl, ctx, 'Razão social', empresa.razao_social || empresa.nome);
  quadroLinha(fl, ctx, 'CNPJ', docBr(empresa.cnpj) || '—');
  quadroLinha(fl, ctx, 'Endereço', [empresa.endereco, empresa.cidade, empresa.uf].filter(Boolean).join(' — ') || '—');
  quadroLinha(fl, ctx, 'Responsável técnico', `${empresa.engenheiro_nome || '—'} · ${empresa.engenheiro_crea || ''}`);
  fl.estado.y += 6;

  // Contratante
  roundRect(fl.estado.page, { x: MARGEM, y: fl.estado.y, w: LARG, h: alturaQuadro, r: 2, color: C.fundo, borderColor: C.linha, borderWidth: 0.4 });
  fl.estado.y += 3.6;
  text(fl.estado.page, 'CONTRATANTE', { x: MARGEM + 4, y: fl.estado.y, size: 6.4, font: ctx.F.pop7, color: C.amber, tracking: 0.6 });
  fl.estado.y += 4.4;
  quadroLinha(fl, ctx, 'Nome', cliente.nome || '—');
  quadroLinha(fl, ctx, 'CPF', docBr(cliente.cpf) || '—');
  quadroLinha(fl, ctx,
    chaveTipo(ctx.dados) === 'manutencao' ? 'Local do sistema' : 'Local da instalação',
    [cliente.cidade, cliente.uf].filter(Boolean).join(' — ') || '—');
  quadroLinha(fl, ctx, 'Contato', [fone(cliente.whatsapp), cliente.email].filter(Boolean).join(' · ') || '—');
  fl.estado.y += 5;

  paragrafo(fl, ctx,
    'As partes acima qualificadas têm entre si justo e contratado o presente instrumento, '
    + 'que se regerá pelas cláusulas e condições a seguir.');
}

// ============================================================================
// Corpo
// ============================================================================
function clausulas(fl, ctx) {
  if (chaveTipo(ctx.dados) === 'manutencao') clausulasManutencao(fl, ctx);
  else clausulasUsina(fl, ctx);
  clausulasFinais(fl, ctx);
}

// ---------------------------------------------------------------------------
// Corpo A — usina (obra: fornece, instala, homologa, entrega)
// ---------------------------------------------------------------------------
function clausulasUsina(fl, ctx) {
  const { empresa, cliente, contrato, sistema, proposta } = ctx.dados;
  const temSistema = !!sistema?.modulo_qtd;

  clausula(fl, ctx, 'DO OBJETO');
  paragrafo(fl, ctx,
    'O objeto deste contrato é o fornecimento dos equipamentos e a execução dos serviços de instalação '
    + 'de sistema de geração de energia solar fotovoltaica conectado à rede (on-grid), a ser implantado no '
    + `endereço do CONTRATANTE${cliente.cidade ? `, em ${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}` : ''}, `
    + 'conforme especificação técnica constante do Anexo I, parte integrante deste instrumento.');
  if (proposta?.numero) {
    paragrafo(fl, ctx,
      `Parágrafo único. Este contrato decorre da proposta comercial ${proposta.numero}`
      + `${proposta.revisao ? ` (revisão ${proposta.revisao})` : ''}`
      + `${proposta.aceita_em ? `, aceita pelo CONTRATANTE em ${proposta.aceita_em}` : ''}, `
      + 'cujos termos comerciais ficam aqui ratificados.');
  }

  clausula(fl, ctx, 'DO ESCOPO INCLUÍDO');
  paragrafo(fl, ctx, 'Estão compreendidos no preço deste contrato:');
  const inclusos = (empresa.itens_inclusos ?? []).map((i) => humanizar(String(i.texto ?? '')));
  if (inclusos.length) {
    inclusos.forEach((t) => item(fl, ctx, t));
  } else {
    item(fl, ctx, 'Fornecimento dos equipamentos, instalação, projeto elétrico, ART e homologação.');
  }

  clausula(fl, ctx, 'DO ESCOPO NÃO INCLUÍDO');
  paragrafo(fl, ctx,
    'Salvo acordo escrito em contrário, NÃO integram o preço e serão orçados à parte:');
  [
    'Reforço, reparo ou substituição de estrutura de telhado que não suporte a carga do sistema.',
    'Adequação ou troca do padrão de entrada de energia exigida pela concessionária.',
    'Obras civis, alvenaria, pintura, andaimes especiais e içamento por equipamento não convencional.',
    'Extensão de rede elétrica, adequação de aterramento predial e correção de instalações existentes fora de norma.',
    'Taxas, tributos ou exigências criados pela concessionária ou por órgão público após a assinatura.',
  ].forEach((t) => item(fl, ctx, t));

  clausula(fl, ctx, 'DO PREÇO E DA FORMA DE PAGAMENTO');
  paragrafo(fl, ctx,
    `Pela integralidade do objeto, o CONTRATANTE pagará à CONTRATADA a quantia de `
    + `${moeda(contrato.valor_total)} (${reaisPorExtenso(contrato.valor_total)}).`);
  if (contrato.condicao_pagamento) {
    paragrafo(fl, ctx, `Forma de pagamento: ${contrato.condicao_pagamento}.`);
  }
  paragrafo(fl, ctx,
    'O atraso no pagamento de qualquer parcela sujeita o CONTRATANTE a multa de 2% (dois por cento) sobre '
    + 'o valor em atraso, juros de mora de 1% (um por cento) ao mês e correção monetária pelo IPCA.');

  clausula(fl, ctx, 'DOS PRAZOS');
  paragrafo(fl, ctx,
    `A CONTRATADA executará a instalação no prazo estimado de ${contrato.prazo_entrega_min_dias ?? empresa.prazo_entrega_min_dias} `
    + `a ${contrato.prazo_entrega_max_dias ?? empresa.prazo_entrega_max_dias} dias, contados do recebimento do sinal `
    + 'e da liberação do local pelo CONTRATANTE, compreendendo projeto, instalação e homologação.');
  paragrafo(fl, ctx,
    'Parágrafo primeiro. O prazo de homologação depende da concessionária de energia e não está sob controle '
    + 'da CONTRATADA; eventual demora do agente público ou da distribuidora suspende a contagem, sem penalidade.');
  paragrafo(fl, ctx,
    'Parágrafo segundo. Condições climáticas impeditivas, indisponibilidade de acesso ao local e atraso na '
    + 'entrega de documentos pelo CONTRATANTE também suspendem a contagem enquanto perdurarem.');

  clausula(fl, ctx, 'DAS OBRIGAÇÕES DA CONTRATADA');
  [
    'Fornecer equipamentos novos, de primeiro uso e com certificação exigida pela regulamentação brasileira.',
    'Executar a instalação por equipe própria ou credenciada, observando as normas técnicas aplicáveis.',
    'Emitir a Anotação de Responsabilidade Técnica (ART) de projeto e de execução.',
    'Conduzir o processo de homologação junto à concessionária de energia.',
    'Comissionar o sistema, configurar o monitoramento e orientar o CONTRATANTE sobre o uso.',
    'Entregar o local livre dos resíduos gerados pela instalação.',
  ].forEach((t) => item(fl, ctx, t));

  clausula(fl, ctx, 'DAS OBRIGAÇÕES DO CONTRATANTE');
  [
    'Fornecer os documentos necessários à homologação, inclusive a titularidade da unidade consumidora.',
    'Garantir o acesso da equipe ao local nos dias e horários combinados.',
    'Disponibilizar ponto de energia e água durante a execução dos serviços.',
    'Efetuar os pagamentos nas datas ajustadas.',
    'Informar previamente qualquer restrição de condomínio, tombamento ou limitação legal do imóvel.',
    'Não alterar, ampliar ou permitir intervenção de terceiros no sistema durante o prazo de garantia.',
  ].forEach((t) => item(fl, ctx, t));

  clausula(fl, ctx, 'DAS GARANTIAS');
  if (temSistema) {
    paragrafo(fl, ctx,
      `Os módulos fotovoltaicos têm garantia de fábrica de ${sistema.garantia_modulos_anos ?? '—'} anos contra defeito `
      + `de fabricação, e o inversor, de ${sistema.garantia_inversor_anos ?? '—'} anos, nos termos das políticas dos `
      + 'respectivos fabricantes.');
  }
  paragrafo(fl, ctx,
    `Os serviços de instalação executados pela CONTRATADA são garantidos por `
    + `${empresa.garantia_instalacao_meses ?? 12} meses, contados da data de comissionamento do sistema.`);
  paragrafo(fl, ctx,
    'A garantia não abrange danos decorrentes de mau uso, intervenção de terceiros não autorizados, descargas '
    + 'atmosféricas, oscilação da rede da concessionária, vandalismo, furto ou eventos da natureza.');

  clausula(fl, ctx, 'DA GERAÇÃO ESTIMADA');
  paragrafo(fl, ctx,
    'A geração de energia indicada no Anexo I é ESTIMATIVA, calculada a partir da irradiação média da região e '
    + 'do rendimento típico do sistema. A geração efetiva varia conforme clima, sombreamento, temperatura, '
    + 'limpeza dos módulos e disponibilidade da rede, não constituindo, portanto, garantia de resultado nem '
    + 'obrigação de desempenho da CONTRATADA.');

  clausula(fl, ctx, 'DA RESCISÃO');
  paragrafo(fl, ctx,
    'O contrato poderá ser rescindido por qualquer das partes, mediante comunicação escrita. Havendo rescisão '
    + 'imotivada pelo CONTRATANTE após a aquisição dos equipamentos, serão devidos os custos comprovadamente '
    + 'incorridos, acrescidos de multa de 10% (dez por cento) sobre o saldo do contrato.');

}

// ---------------------------------------------------------------------------
// Corpo B — manutenção (serviço continuado: visita, mede, limpa, atende chamado)
// ---------------------------------------------------------------------------
function clausulasManutencao(fl, ctx) {
  const { empresa, cliente, contrato, sistema, proposta } = ctx.dados;
  const temSistema = !!sistema?.modulo_qtd;
  const rec = contrato.recorrencia === 'mensal' ? 'mensal'
    : contrato.recorrencia === 'anual' ? 'anual' : '';
  const visitas = Number(contrato.visitas_incluidas) || 0;

  clausula(fl, ctx, 'DO OBJETO');
  paragrafo(fl, ctx,
    'O objeto deste contrato é a prestação, pela CONTRATADA, dos serviços de manutenção preventiva e corretiva '
    + 'do sistema de geração de energia solar fotovoltaica instalado no endereço do '
    + `CONTRATANTE${cliente.cidade ? `, em ${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}` : ''}, `
    + 'na periodicidade e nas condições ajustadas neste instrumento.');
  if (temSistema) {
    paragrafo(fl, ctx,
      'Parágrafo primeiro. O sistema atendido está identificado no Anexo I, parte integrante deste instrumento. '
      + 'A cobertura deste contrato limita-se aos equipamentos ali descritos.');
  }
  if (proposta?.numero) {
    paragrafo(fl, ctx,
      `Parágrafo ${temSistema ? 'segundo' : 'único'}. Este contrato decorre da proposta comercial ${proposta.numero}`
      + `${proposta.revisao ? ` (revisão ${proposta.revisao})` : ''}`
      + `${proposta.aceita_em ? `, aceita pelo CONTRATANTE em ${proposta.aceita_em}` : ''}, `
      + 'cujos termos comerciais ficam aqui ratificados.');
  }

  clausula(fl, ctx, 'DO ESCOPO DOS SERVIÇOS');
  paragrafo(fl, ctx, 'A manutenção preventiva compreende, em cada visita programada:');
  [
    'Limpeza dos módulos fotovoltaicos com água e material não abrasivo, sem uso de produto que ataque o vidro ou a moldura.',
    'Inspeção visual de módulos, estrutura de fixação, cabeamento, conectores e eletrodutos.',
    'Reaperto das conexões elétricas em corrente contínua (CC) e alternada (CA), observando o torque indicado pelo fabricante.',
    'Medição de tensão e corrente por série (string) e comparação com o comportamento esperado do sistema.',
    'Verificação dos dispositivos de proteção (disjuntores, DPS) e da continuidade do aterramento.',
    'Limpeza dos dissipadores e checagem da ventilação do inversor, com leitura do histórico de alarmes.',
    'Conferência do monitoramento remoto e análise da curva de geração do período.',
    'Relatório técnico da visita, com fotos, medições realizadas e recomendações.',
  ].forEach((t) => item(fl, ctx, t));

  clausula(fl, ctx, 'DO QUE NÃO ESTÁ INCLUÍDO');
  paragrafo(fl, ctx, 'Salvo acordo escrito em contrário, NÃO integram o preço deste contrato:');
  [
    'Fornecimento de módulos, inversores, cabos, estruturas ou quaisquer peças de reposição, que serão orçados à parte.',
    'Reparo de danos por descarga atmosférica, granizo, vendaval, alagamento, vandalismo, furto ou demais eventos da natureza.',
    'Ampliação do sistema, remanejamento de módulos, troca de posição e alteração de projeto.',
    'Obras civis, reforço da estrutura do telhado e adequação do padrão de entrada de energia.',
    'Serviços em pontos da instalação elétrica do imóvel alheios ao sistema fotovoltaico.',
    'Acionamento de garantia de fabricante, que segue a análise e o prazo do próprio fabricante — a CONTRATADA intermedeia, mas não responde pelo prazo dele.',
  ].forEach((t) => item(fl, ctx, t));

  clausula(fl, ctx, 'DO PREÇO E DA FORMA DE PAGAMENTO');
  paragrafo(fl, ctx,
    'Pelos serviços contratados, o CONTRATANTE pagará à CONTRATADA a quantia '
    + `${rec ? `${rec} de ` : 'de '}${moeda(contrato.valor_total)} (${reaisPorExtenso(contrato.valor_total)})`
    + `${rec === 'mensal' ? ', devida a cada mês de vigência' : rec === 'anual' ? ', devida a cada período anual de vigência' : ''}.`);
  if (contrato.condicao_pagamento) {
    paragrafo(fl, ctx, `Forma de pagamento: ${contrato.condicao_pagamento}.`);
  }
  paragrafo(fl, ctx,
    'O atraso no pagamento sujeita o CONTRATANTE a multa de 2% (dois por cento) sobre o valor em atraso, juros de '
    + 'mora de 1% (um por cento) ao mês e correção monetária pelo IPCA. O inadimplemento superior a 30 (trinta) '
    + 'dias autoriza a CONTRATADA a suspender os serviços até a regularização, sem prejuízo da rescisão.');
  paragrafo(fl, ctx,
    'A cada 12 (doze) meses de vigência, o valor será reajustado pela variação acumulada do IPCA no período, ou '
    + 'pelo índice que vier a substituí-lo.');

  clausula(fl, ctx, 'DA VIGÊNCIA E DA PERIODICIDADE');
  paragrafo(fl, ctx,
    contrato.vigencia_inicio && contrato.vigencia_fim
      ? `Este contrato vigora de ${contrato.vigencia_inicio} a ${contrato.vigencia_fim}.`
      : 'Este contrato vigora por 12 (doze) meses contados da data de sua assinatura.');
  paragrafo(fl, ctx,
    visitas
      ? `Estão incluídas ${visitas} ${visitas === 1 ? 'visita preventiva programada' : 'visitas preventivas programadas'} `
        + 'no período de vigência, agendadas com o CONTRATANTE com antecedência mínima de 5 (cinco) dias.'
      : 'As visitas preventivas serão programadas de comum acordo entre as partes, com antecedência mínima de '
        + '5 (cinco) dias, observada a periodicidade ajustada na proposta comercial.');
  paragrafo(fl, ctx,
    'Parágrafo primeiro. Visita programada e não realizada por indisponibilidade do CONTRATANTE, sem aviso com '
    + '24 (vinte e quatro) horas de antecedência, é considerada prestada para todos os efeitos.');
  paragrafo(fl, ctx,
    'Parágrafo segundo. Findo o prazo, o contrato renova-se automaticamente por igual período, salvo manifestação '
    + 'escrita em contrário de qualquer das partes com antecedência mínima de 30 (trinta) dias.');

  clausula(fl, ctx, 'DO ATENDIMENTO CORRETIVO');
  paragrafo(fl, ctx,
    'Além das visitas programadas, o CONTRATANTE poderá acionar a CONTRATADA sempre que identificar falha, parada '
    + 'do sistema ou queda relevante de geração'
    + `${empresa.whatsapp ? `, pelo WhatsApp ${fone(empresa.whatsapp)}` : ', pelos canais de atendimento da CONTRATADA'}.`);
  paragrafo(fl, ctx,
    'A CONTRATADA responderá ao chamado em até 2 (dois) dias úteis e, sendo necessário atendimento presencial, '
    + 'comparecerá ao local em até 5 (cinco) dias úteis, contados da liberação do acesso pelo CONTRATANTE.');
  paragrafo(fl, ctx,
    'A mão de obra do atendimento corretivo está incluída no preço deste contrato; peças e equipamentos de '
    + 'reposição seguem o disposto na cláusula do escopo não incluído.');

  clausula(fl, ctx, 'DAS OBRIGAÇÕES DA CONTRATADA');
  [
    'Executar os serviços por equipe técnica qualificada, com equipamento de proteção individual e observância das normas de segurança em altura e em eletricidade.',
    'Comunicar previamente a data e o horário de cada visita programada.',
    'Entregar o relatório técnico de cada visita em até 5 (cinco) dias úteis após a sua realização.',
    'Informar por escrito qualquer não conformidade que exija reparo fora do escopo, acompanhada do respectivo orçamento.',
    'Manter sigilo sobre os dados de geração, consumo e acesso ao monitoramento do CONTRATANTE.',
    'Responder pelos danos que der causa ao sistema ou ao imóvel durante a execução dos serviços.',
  ].forEach((t) => item(fl, ctx, t));

  clausula(fl, ctx, 'DAS OBRIGAÇÕES DO CONTRATANTE');
  [
    'Garantir o acesso seguro da equipe ao local, ao quadro elétrico e à área dos módulos, nos dias e horários combinados.',
    'Disponibilizar ponto de água e de energia para a execução dos serviços.',
    'Manter ativo o acesso ao sistema de monitoramento e informar mudanças de rede ou de internet que o interrompam.',
    'Comunicar prontamente à CONTRATADA qualquer falha, alarme ou parada percebida no sistema.',
    'Não permitir intervenção de terceiros no sistema sem ciência prévia da CONTRATADA.',
    'Efetuar os pagamentos nas datas ajustadas.',
  ].forEach((t) => item(fl, ctx, t));

  clausula(fl, ctx, 'DA GARANTIA DOS SERVIÇOS E DO DESEMPENHO');
  paragrafo(fl, ctx,
    'Os serviços executados são garantidos por 90 (noventa) dias, contados da data de cada atendimento, quanto '
    + 'a vício de execução.');
  paragrafo(fl, ctx,
    'A CONTRATADA não responde pelo desempenho dos equipamentos, cuja garantia é do respectivo fabricante, nem '
    + 'por indisponibilidade da rede da concessionária de energia.');
  paragrafo(fl, ctx,
    'A contratação da manutenção NÃO constitui garantia de geração mínima. A geração efetiva varia conforme clima, '
    + 'sombreamento, temperatura e disponibilidade da rede, e a manutenção tem por finalidade preservar as '
    + 'condições de operação do sistema, não assegurar um resultado.');

  clausula(fl, ctx, 'DA RESCISÃO');
  paragrafo(fl, ctx,
    'Qualquer das partes poderá rescindir este contrato mediante aviso escrito com 30 (trinta) dias de '
    + 'antecedência, ficando devidos os valores proporcionais aos serviços prestados até a data da rescisão.');
  paragrafo(fl, ctx,
    'A rescisão por inadimplemento independe de aviso prévio e não afasta a cobrança dos valores vencidos.');
}

// ---------------------------------------------------------------------------
// Cláusulas comuns aos dois corpos
// ---------------------------------------------------------------------------
function clausulasFinais(fl, ctx) {
  const { empresa } = ctx.dados;

  clausula(fl, ctx, 'DA PROTEÇÃO DE DADOS');
  paragrafo(fl, ctx,
    'As partes tratarão os dados pessoais envolvidos na execução deste contrato conforme a Lei nº 13.709/2018 '
    + '(LGPD), limitando o uso às finalidades de execução contratual, homologação junto à concessionária e '
    + 'cumprimento de obrigações legais, adotando medidas de segurança compatíveis e assegurando ao titular '
    + 'o exercício de seus direitos.');

  clausula(fl, ctx, 'DAS DISPOSIÇÕES GERAIS');
  paragrafo(fl, ctx,
    'Este instrumento e seus anexos representam o acordo integral entre as partes quanto ao objeto, substituindo '
    + 'tratativas anteriores. Alterações só terão validade se formalizadas por escrito e assinadas por ambas.');
  paragrafo(fl, ctx,
    `Fica eleito o foro da comarca de ${empresa.cidade || '[comarca]'}${empresa.uf ? `/${empresa.uf}` : ''} para dirimir `
    + 'as questões oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.');
}

// ============================================================================
// Anexo I — o sistema contratado
// ============================================================================
function anexo(fl, ctx) {
  const s = ctx.dados.sistema ?? {};
  if (!s.modulo_qtd) return;

  const manutencao = chaveTipo(ctx.dados) === 'manutencao';
  fl.garantir(70);
  titulo(fl, ctx, manutencao ? 'ANEXO I — SISTEMA ATENDIDO' : 'ANEXO I — SISTEMA CONTRATADO');
  paragrafo(fl, ctx, manutencao
    ? 'Identificação do sistema coberto por este contrato. Ampliação ou substituição de equipamento altera o '
      + 'escopo e exige aditivo escrito, com revisão do valor e da periodicidade das visitas.'
    : 'Especificação técnica do sistema objeto deste contrato. Substituição de equipamento por outro de '
      + 'especificação igual ou superior é admitida em caso de indisponibilidade de mercado, mediante '
      + 'comunicação prévia ao CONTRATANTE.');

  const linhas = [
    ['panel', 'Quantidade de módulos', `${numero(s.modulo_qtd)} módulos`],
    ['panelSun', 'Módulos', s.modulo_descricao || '—'],
    ['inverter', 'Inversor', s.inversor_descricao || '—'],
    ['bolt', 'Potência instalada', `${numero(s.potencia_instalada_kwp, 2)} kWp`],
    ['chart', 'Geração média estimada', `~ ${numero(s.geracao_media_kwh_mes)} kWh/mês`],
    ['shield', 'Garantia dos equipamentos',
      `Módulos ${s.garantia_modulos_anos ?? '—'} anos · Inversor ${s.garantia_inversor_anos ?? '—'} anos`],
  ];
  const altura = linhas.length * 8 + 4;
  fl.garantir(altura);
  roundRect(fl.estado.page, { x: MARGEM, y: fl.estado.y, w: LARG, h: altura, r: 2, borderColor: C.linha, borderWidth: 0.5 });
  fl.estado.y += 3;
  linhas.forEach(([ic, rot, val], i) => {
    if (i > 0) line(fl.estado.page, { x1: MARGEM + 3, y1: fl.estado.y - 1.6, x2: 210 - MARGEM - 3, y2: fl.estado.y - 1.6, color: C.linha, thickness: 0.3 });
    icon(fl.estado.page, ic, { x: MARGEM + 4, y: fl.estado.y + 0.6, size: 4.6, color: C.banda, peso: 1.8 });
    text(fl.estado.page, rot, { x: MARGEM + 11, y: fl.estado.y + 1, size: 7.6, font: ctx.F.os6, color: C.suave });
    text(fl.estado.page, fit(ctx.F.pop6, val, 8, 88), { x: MARGEM + 72, y: fl.estado.y + 0.8, size: 8, font: ctx.F.pop6, color: C.tinta });
    fl.estado.y += 8;
  });
  fl.estado.y += 6;
}

// ============================================================================
// Assinaturas
// ============================================================================
function assinaturas(fl, ctx) {
  const { empresa, cliente } = ctx.dados;
  fl.garantir(62);
  fl.estado.y += 4;

  const local = `${empresa.cidade || ''}${empresa.uf ? `/${empresa.uf}` : ''}`;
  paragrafo(fl, ctx, `${local ? `${local}, ` : ''}${ctx.dados.hoje}.`, { tamanho: 8.6 });
  fl.estado.y += 10;

  const larg = (LARG - 10) / 2;
  const assinar = (x, nome, papel, doc) => {
    line(fl.estado.page, { x1: x, y1: fl.estado.y, x2: x + larg, y2: fl.estado.y, color: C.tinta, thickness: 0.4 });
    text(fl.estado.page, fit(ctx.F.pop6, nome, 8.2, larg), { x, y: fl.estado.y + 2, w: larg, size: 8.2, font: ctx.F.pop6, color: C.tinta, align: 'center' });
    // Cinza, não âmbar: âmbar sobre branco não sobrevive à impressão.
    text(fl.estado.page, papel, { x, y: fl.estado.y + 6.4, w: larg, size: 6.6, font: ctx.F.os6, color: C.suave, align: 'center', tracking: 0.4 });
    if (doc) text(fl.estado.page, doc, { x, y: fl.estado.y + 10.2, w: larg, size: 6.6, font: ctx.F.os4, color: C.suave, align: 'center' });
  };

  assinar(MARGEM, empresa.razao_social || empresa.nome, 'CONTRATADA', empresa.cnpj ? `CNPJ ${docBr(empresa.cnpj)}` : '');
  assinar(MARGEM + larg + 10, cliente.nome || '', 'CONTRATANTE', cliente.cpf ? `CPF ${docBr(cliente.cpf)}` : '');
  fl.estado.y += 24;

  text(fl.estado.page, 'TESTEMUNHAS', { x: MARGEM, y: fl.estado.y, size: 6.6, font: ctx.F.pop7, color: C.suave, tracking: 0.6 });
  fl.estado.y += 12;
  [0, 1].forEach((i) => {
    const x = MARGEM + i * (larg + 10);
    line(fl.estado.page, { x1: x, y1: fl.estado.y, x2: x + larg, y2: fl.estado.y, color: C.suave, thickness: 0.35 });
    text(fl.estado.page, `Nome:                                    CPF:`, {
      x, y: fl.estado.y + 2, size: 6.6, font: ctx.F.os4, color: C.suave,
    });
  });
}

/** Numeração no rodapé — só ao final, quando já sabemos o total de páginas. */
function paginar(doc, ctx, total) {
  doc.getPages().forEach((p, i) => {
    line(p, { x1: MARGEM, y1: 282, x2: 210 - MARGEM, y2: 282, color: C.linha, thickness: 0.4 });
    text(p, ctx.dados.empresa.nome || 'Energy PRO', {
      x: MARGEM, y: 284.5, size: 6.4, font: ctx.F.os6, color: C.suave,
    });
    text(p, `Página ${i + 1} de ${total}`, {
      x: MARGEM, y: 284.5, w: LARG, size: 6.4, font: ctx.F.os4, color: C.suave, align: 'right',
    });
  });
}

// ============================================================================
// Montagem
// ============================================================================
export function renderContrato(doc, dados, F) {
  const ctx = { dados, F, nc: 0 };   // nc = contador de cláusulas
  const fl = criarFluxo(doc, ctx);
  capa(fl, ctx);
  partes(fl, ctx);
  clausulas(fl, ctx);
  anexo(fl, ctx);
  assinaturas(fl, ctx);
  paginar(doc, ctx, fl.estado.n);
  return fl.estado.page;
}
