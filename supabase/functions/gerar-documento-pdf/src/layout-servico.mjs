// ============================================================================
// EnergyPRO — PROPOSTA COMERCIAL (serviços de engenharia)
//
// A proposta de usina é peça de venda: ilustração, benefícios, grade de itens
// inclusos. Serviço de engenharia não se vende assim — quem pede um projeto
// elétrico ou uma limpeza de módulos quer ver ESCOPO, ITENS, PREÇO e PRAZO,
// nessa ordem, numa página. É o formato de proposta comercial que qualquer CRM
// de mercado emite, aqui vestido com a identidade da marca.
//
// Fluxo automático: a tabela de itens quebra a página sozinha e repete o
// cabeçalho da grade. Uma proposta de três itens sai em uma página; uma de
// trinta sai em duas, sem ajuste manual.
// ============================================================================
import { rgb } from 'pdf-lib';
import {
  A4W, A4H, MM,
  rect, roundRect, line, text, wrap, fit, moeda, numero, dataBr, fone,
} from './brand.mjs';
import { icon } from './icons.mjs';
import { lockupHorizontal, MARCA } from './logo.mjs';
import { reaisPorExtenso } from './extenso.mjs';

const C = {
  banda: MARCA.navyDeep,
  navy: MARCA.navy,
  amber: MARCA.warm,
  tinta: rgb(0.09, 0.13, 0.20),
  suave: rgb(0.44, 0.49, 0.57),
  linha: rgb(0.87, 0.90, 0.94),
  fundo: rgb(0.965, 0.975, 0.985),
  zebra: rgb(0.982, 0.986, 0.992),
  branco: rgb(1, 1, 1),
};

const MARGEM = 16;
const LARG = 210 - 2 * MARGEM;
const CABECA = 34;              // altura da faixa da capa
const TOPO_P1 = 44;
const TOPO_N = 26;
const RODAPE = 262;             // deixa espaço para o rodapé de contato

// Colunas da grade, em mm a partir da margem. A descrição fica com a folga; os
// números encostam à direita, que é como o olho confere uma tabela de preço.
const FIM = LARG - 3;            // 175 mm: borda direita útil da grade
const COL = {
  desc: { x: 0,   w: 86 },
  un:   { x: 92,  w: 14 },
  qtd:  { x: 106, w: 18 },
  unit: { x: 124, w: 27 },
  total:{ x: 151, w: 24 },
};

// ---------------------------------------------------------------------------
// Fluxo de página
// ---------------------------------------------------------------------------
function criarFluxo(doc, ctx) {
  const estado = { page: null, y: 0, n: 0 };

  function novaPagina(primeira = false) {
    estado.page = doc.addPage([A4W, A4H]);
    estado.n += 1;
    rect(estado.page, { x: 0, y: 0, w: 210, h: 297, color: C.branco });
    if (primeira) {
      capa(estado.page, ctx);
    } else {
      text(estado.page, 'PROPOSTA COMERCIAL', {
        x: MARGEM, y: 13, size: 6.6, font: ctx.F.os6, color: C.suave, tracking: 0.5,
      });
      text(estado.page, ctx.dados.proposta.numero ?? '', {
        x: MARGEM, y: 13, w: LARG, size: 6.6, font: ctx.F.pop6, color: C.banda, align: 'right',
      });
      line(estado.page, { x1: MARGEM, y1: 17.5, x2: 210 - MARGEM, y2: 17.5, color: C.linha, thickness: 0.4 });
    }
    estado.y = primeira ? TOPO_P1 : TOPO_N;
    return estado.page;
  }

  function garantir(altura) {
    if (estado.y + altura > RODAPE) novaPagina();
  }

  return { estado, novaPagina, garantir };
}

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------
function capa(p, ctx) {
  const d = ctx.dados;
  rect(p, { x: 0, y: 0, w: 210, h: CABECA, color: C.banda });
  rect(p, { x: 0, y: CABECA - 1.2, w: 210, h: 1.2, color: C.amber });
  lockupHorizontal(p, { x: MARGEM, y: 7.5, s: 9.6, solida: C.branco });

  const xd = 210 - MARGEM - 78;
  text(p, 'PROPOSTA COMERCIAL', {
    x: xd, y: 8.4, w: 78, size: 7.4, font: ctx.F.pop6, color: C.branco, align: 'right', tracking: 1.3,
  });
  text(p, d.proposta.numero ?? '', {
    x: xd, y: 13.4, w: 78, size: 14, font: ctx.F.pop7, color: C.amber, align: 'right',
  });
  const emissao = dataBr(d.proposta.data) || d.hoje;
  text(p, `Emitida em ${emissao}`, {
    x: xd, y: 22.6, w: 78, size: 6.4, font: ctx.F.os4, color: rgb(0.78, 0.84, 0.9), align: 'right',
  });
}

/** Cartão de identificação em duas colunas: quem compra × qual é o documento. */
function identificacao(fl, ctx) {
  const { cliente, proposta, empresa } = ctx.dados;
  const p = fl.estado.page;
  const h = 26;
  const meia = (LARG - 4) / 2;

  roundRect(p, { x: MARGEM, y: fl.estado.y, w: meia, h, r: 2.2, color: C.fundo, borderColor: C.linha, borderWidth: 0.4 });
  roundRect(p, { x: MARGEM + meia + 4, y: fl.estado.y, w: meia, h, r: 2.2, color: C.fundo, borderColor: C.linha, borderWidth: 0.4 });

  const par = (x, i, rot, val) => {
    text(p, rot, { x: x + 4, y: fl.estado.y + 4 + i * 5.4, size: 6.2, font: ctx.F.os6, color: C.suave, tracking: 0.5 });
    text(p, fit(ctx.F.pop6, val || '—', 8, meia - 8), {
      x: x + 4, y: fl.estado.y + 7.8 + i * 5.4, size: 8, font: ctx.F.pop6, color: C.tinta,
    });
  };

  // Razão social de condomínio ou associação passa de uma linha. Quebrar em duas
  // é melhor que truncar no cartão que identifica quem está comprando.
  text(p, 'CLIENTE', { x: MARGEM + 4, y: fl.estado.y + 4, size: 6.2, font: ctx.F.os6, color: C.suave, tracking: 0.5 });
  const nomeCliente = wrap(ctx.F.pop6, cliente.nome || '—', 7.6, meia - 8).slice(0, 2);
  nomeCliente.forEach((ln, i) => text(p, ln, {
    x: MARGEM + 4, y: fl.estado.y + 7.8 + i * 3.4, size: 7.6, font: ctx.F.pop6, color: C.tinta,
  }));
  const yBase = fl.estado.y + 7.8 + nomeCliente.length * 3.4 + 1.6;
  text(p, [cliente.cidade, cliente.uf].filter(Boolean).join('/') || '—', {
    x: MARGEM + 4, y: yBase, size: 7.4, font: ctx.F.os4, color: C.suave,
  });
  text(p, [fone(cliente.whatsapp), cliente.email].filter(Boolean).join(' · '), {
    x: MARGEM + 4, y: yBase + 4, size: 7.4, font: ctx.F.os4, color: C.suave,
  });

  const x2 = MARGEM + meia + 4;
  par(x2, 0, 'VÁLIDA ATÉ', dataBr(proposta.validade) || `${empresa.validade_proposta_dias} dias`);
  text(p, 'RESPONSÁVEL TÉCNICO', {
    x: x2 + 4, y: fl.estado.y + 15.4, size: 6.2, font: ctx.F.os6, color: C.suave, tracking: 0.5,
  });
  text(p, fit(ctx.F.pop6, empresa.engenheiro_nome || empresa.nome || '—', 7.6, meia - 8), {
    x: x2 + 4, y: fl.estado.y + 19, size: 7.6, font: ctx.F.pop6, color: C.tinta,
  });
  if (empresa.engenheiro_crea) {
    text(p, empresa.engenheiro_crea, {
      x: x2 + 4, y: fl.estado.y + 22.6, size: 6.8, font: ctx.F.os4, color: C.suave,
    });
  }
  fl.estado.y += h + 6;
}

function secao(fl, ctx, titulo) {
  fl.garantir(12);
  text(fl.estado.page, titulo, {
    x: MARGEM, y: fl.estado.y, size: 8.6, font: ctx.F.pop7, color: C.banda, tracking: 0.6,
  });
  fl.estado.y += 4.4;
  line(fl.estado.page, { x1: MARGEM, y1: fl.estado.y - 1.2, x2: MARGEM + 13, y2: fl.estado.y - 1.2, color: C.amber, thickness: 0.7 });
  fl.estado.y += 1.6;
}

function paragrafo(fl, ctx, txt, { tamanho = 8.2, cor = C.tinta, fonte = null, entre = 1.4 } = {}) {
  if (!txt) return;
  const f = fonte ?? ctx.F.os4;
  const passo = (tamanho * entre) / MM;
  for (const ln of wrap(f, txt, tamanho, LARG)) {
    fl.garantir(passo);
    text(fl.estado.page, ln, { x: MARGEM, y: fl.estado.y, size: tamanho, font: f, color: cor });
    fl.estado.y += passo;
  }
  fl.estado.y += 1.4;
}

/** Objeto = a linha de serviço vendida, com o título específico desta proposta. */
function objeto(fl, ctx) {
  const { linha, proposta } = ctx.dados;
  secao(fl, ctx, 'OBJETO');
  paragrafo(fl, ctx, linha?.nome || 'Serviço de engenharia', { tamanho: 10.4, fonte: ctx.F.pop7, cor: C.navy, entre: 1.25 });
  paragrafo(fl, ctx, linha?.descricao, { tamanho: 8.2, cor: C.suave });
  // O título é o recorte do caso ("Limpeza de 24 módulos — Fazenda Boa Vista").
  // Só entra se acrescentar informação: repetir o nome da linha polui.
  const t = String(proposta.titulo ?? '').trim();
  if (t && t.toLocaleLowerCase('pt-BR') !== String(linha?.nome ?? '').toLocaleLowerCase('pt-BR')) {
    paragrafo(fl, ctx, t, { tamanho: 8.4, fonte: ctx.F.pop6, cor: C.tinta });
  }
  fl.estado.y += 2;
}

// ---------------------------------------------------------------------------
// Grade de itens
// ---------------------------------------------------------------------------
function cabecalhoGrade(fl, ctx) {
  const p = fl.estado.page;
  const h = 7.4;
  rect(p, { x: MARGEM, y: fl.estado.y, w: LARG, h, color: C.banda });
  const rot = (txt, x, w, align) => text(p, txt, {
    x: MARGEM + x, y: fl.estado.y + 2.4, w, size: 6.4, font: ctx.F.pop6,
    color: C.branco, align, tracking: 0.6,
  });
  rot('DESCRIÇÃO', COL.desc.x + 3, COL.desc.w, 'left');
  rot('UN.', COL.un.x, COL.un.w, 'center');
  rot('QTD.', COL.qtd.x, COL.qtd.w, 'right');
  rot('VALOR UNIT.', COL.unit.x, COL.unit.w, 'right');
  rot('TOTAL', COL.total.x, COL.total.w, 'right');
  fl.estado.y += h;
}

/**
 * Mede a linha ANTES de desenhar. Sem isso não dá para saber se ela cabe na
 * página, e sem saber disso o cabeçalho da grade acaba impresso por cima do
 * primeiro item da página seguinte.
 */
function medirItem(ctx, item) {
  const desc = String(item.descricao ?? '');
  const detalhe = String(item.detalhe ?? '').trim();
  const linhasDesc = wrap(ctx.F.pop6, desc, 8, COL.desc.w);
  const linhasDet = detalhe ? wrap(ctx.F.os4, detalhe, 6.6, COL.desc.w) : [];
  const desconto = Number(item.desconto_pct) || 0;
  const h = Math.max(9.4, 3.2 + linhasDesc.length * 3.7 + linhasDet.length * 3.1 + (desconto ? 3.2 : 0) + 2.6);
  return { linhasDesc, linhasDet, desconto, h };
}

function linhaItem(fl, ctx, item, indice, medida) {
  const p0 = ctx.F.os4;
  const { linhasDesc, linhasDet, desconto, h } = medida;
  const p = fl.estado.page;
  if (indice % 2 === 1) rect(p, { x: MARGEM, y: fl.estado.y, w: LARG, h, color: C.zebra });
  line(p, { x1: MARGEM, y1: fl.estado.y + h, x2: MARGEM + LARG, y2: fl.estado.y + h, color: C.linha, thickness: 0.3 });

  let y = fl.estado.y + 3;
  linhasDesc.forEach((ln) => {
    text(p, ln, { x: MARGEM + COL.desc.x + 3, y, size: 8, font: ctx.F.pop6, color: C.tinta });
    y += 3.7;
  });
  linhasDet.forEach((ln) => {
    text(p, ln, { x: MARGEM + COL.desc.x + 3, y, size: 6.6, font: p0, color: C.suave });
    y += 3.1;
  });
  if (desconto) {
    text(p, `desconto de ${numero(desconto, desconto % 1 ? 1 : 0)}%`, {
      x: MARGEM + COL.desc.x + 3, y, size: 6.6, font: p0, color: C.amber,
    });
  }

  const yv = fl.estado.y + 3.4;
  text(p, item.unidade || '—', { x: MARGEM + COL.un.x, y: yv, w: COL.un.w, size: 7.4, font: p0, color: C.suave, align: 'center' });
  text(p, numero(item.quantidade, Number(item.quantidade) % 1 ? 2 : 0), {
    x: MARGEM + COL.qtd.x, y: yv, w: COL.qtd.w, size: 7.8, font: p0, color: C.tinta, align: 'right',
  });
  text(p, moeda(item.preco_unitario), {
    x: MARGEM + COL.unit.x, y: yv, w: COL.unit.w, size: 7.8, font: p0, color: C.tinta, align: 'right',
  });
  text(p, moeda(item.total), {
    x: MARGEM + COL.total.x, y: yv, w: COL.total.w, size: 8.2, font: ctx.F.pop6, color: C.banda, align: 'right',
  });

  fl.estado.y += h;
}

function grade(fl, ctx) {
  const itens = Array.isArray(ctx.dados.itens) ? ctx.dados.itens : [];
  secao(fl, ctx, 'ITENS');
  fl.garantir(24);
  cabecalhoGrade(fl, ctx);

  if (!itens.length) {
    fl.estado.y += 3;
    paragrafo(fl, ctx, 'Nenhum item lançado nesta proposta.', { tamanho: 7.8, cor: C.suave });
    return;
  }

  itens.forEach((it, i) => {
    const medida = medirItem(ctx, it);
    // Vira a página ANTES de desenhar e repete o cabeçalho, para a grade nunca
    // continuar sem legenda nem ficar coberta pela faixa.
    if (fl.estado.y + medida.h > RODAPE) {
      fl.novaPagina();
      cabecalhoGrade(fl, ctx);
    }
    linhaItem(fl, ctx, it, i, medida);
  });
}

/** Bloco de totais, encostado à direita como manda a praxe de orçamento. */
function totais(fl, ctx) {
  const itens = Array.isArray(ctx.dados.itens) ? ctx.dados.itens : [];
  const bruto = itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.preco_unitario) || 0), 0);
  const total = Number(ctx.dados.proposta.valor_total)
    || itens.reduce((s, i) => s + (Number(i.total) || 0), 0);
  // Meio centavo de diferença entre a soma dos itens e o total gravado é ruído
  // de arredondamento, não desconto. Imprimir "Desconto R$ 0,02" faz o cliente
  // desconfiar da conta inteira; abaixo de meio real, some.
  const bruto2 = Math.round(bruto * 100) / 100;
  const desconto = Math.max(0, bruto2 - total);
  const temDesconto = desconto >= 0.5;

  const larg = 84;
  const x = MARGEM + LARG - larg;
  const alturaCard = 15;
  fl.garantir(alturaCard + (temDesconto ? 11 : 0) + 12);
  fl.estado.y += 4;

  const p = fl.estado.page;
  if (temDesconto) {
    const par = (rot, val, i) => {
      text(p, rot, { x, y: fl.estado.y + i * 5.2, w: larg - 34, size: 7.4, font: ctx.F.os4, color: C.suave, align: 'right' });
      text(p, val, { x: x + larg - 34, y: fl.estado.y + i * 5.2, w: 34, size: 7.6, font: ctx.F.os4, color: C.tinta, align: 'right' });
    };
    par('Subtotal', moeda(bruto2), 0);
    par('Desconto', `− ${moeda(desconto)}`, 1);
    fl.estado.y += 11.5;
  }

  roundRect(p, { x, y: fl.estado.y, w: larg, h: alturaCard, r: 2.2, color: C.banda });
  rect(p, { x, y: fl.estado.y, w: 2.4, h: alturaCard, color: C.amber });
  text(p, 'TOTAL', {
    x: x + 7, y: fl.estado.y + 5.6, size: 6.8, font: ctx.F.pop6, color: rgb(0.72, 0.79, 0.88), tracking: 1,
  });
  text(p, moeda(total), {
    x: x + 7, y: fl.estado.y + 4.4, w: larg - 14, size: 14, font: ctx.F.pop7, color: C.amber, align: 'right',
  });
  fl.estado.y += alturaCard + 2.4;
  text(p, reaisPorExtenso(total), {
    x, y: fl.estado.y, w: larg, size: 6.6, font: ctx.F.os4, color: C.suave, align: 'right',
  });
  fl.estado.y += 7;
}

/** Condições: quatro cartões. O que o cliente pergunta antes de assinar. */
function condicoes(fl, ctx) {
  const { proposta, empresa, linha } = ctx.dados;
  const cartoes = [
    ['card', 'Forma de pagamento', proposta.condicao_pagamento || 'A combinar'],
    ['calendar', 'Prazo de execução', proposta.prazo_execucao
      || (empresa.prazo_entrega_min_dias && empresa.prazo_entrega_max_dias
        ? `${empresa.prazo_entrega_min_dias} a ${empresa.prazo_entrega_max_dias} dias`
        : 'A combinar')],
    ['calendarCheck', 'Validade da proposta', dataBr(proposta.validade)
      || `${empresa.validade_proposta_dias ?? 15} dias a partir da emissão`],
    ['shield', 'Garantia dos serviços', `${empresa.garantia_instalacao_meses ?? 12} meses após a conclusão`],
  ];

  secao(fl, ctx, 'CONDIÇÕES');
  const meia = (LARG - 4) / 2;

  // A altura dos cartões vem do texto mais longo, e não de um número fixo. A
  // versão antiga cortava a forma de pagamento em duas linhas com reticências —
  // o cliente assinava uma proposta com a condição de pagamento pela metade.
  const quebrados = cartoes.map(([ic, rot, val]) => [
    ic, rot, wrap(ctx.F.pop6, String(val), 7.6, meia - 17),
  ]);
  const maxLinhas = Math.max(1, ...quebrados.map(([, , l]) => l.length));
  const h = Math.max(15, 8.4 + maxLinhas * 3.6);

  fl.garantir(h * 2 + 8);
  const p = fl.estado.page;

  quebrados.forEach(([ic, rot, linhas], i) => {
    const x = MARGEM + (i % 2) * (meia + 4);
    const y = fl.estado.y + Math.floor(i / 2) * (h + 3);
    roundRect(p, { x, y, w: meia, h, r: 2.2, borderColor: C.linha, borderWidth: 0.5 });
    icon(p, ic, { x: x + 4.4, y: y + 4.6, size: 5, color: C.navy, peso: 1.7 });
    text(p, rot, { x: x + 12.6, y: y + 3.6, size: 6.4, font: ctx.F.os6, color: C.suave, tracking: 0.4 });
    linhas.forEach((ln, j) => {
      text(p, ln, { x: x + 12.6, y: y + 7.4 + j * 3.6, size: 7.6, font: ctx.F.pop6, color: C.tinta });
    });
  });
  fl.estado.y += h * 2 + 3 + 5;

  if (linha?.codigo === 'manutencao_fv' || linha?.codigo === 'limpeza_modulos') {
    paragrafo(fl, ctx,
      'Peças e equipamentos de reposição não estão incluídos e, se necessários, serão orçados à parte.',
      { tamanho: 7.2, cor: C.suave });
  }
}

function observacoes(fl, ctx) {
  const obs = String(ctx.dados.proposta.observacoes ?? '').trim();
  if (!obs) return;
  secao(fl, ctx, 'OBSERVAÇÕES');
  obs.split(/\n+/).filter(Boolean).forEach((par) => paragrafo(fl, ctx, par, { tamanho: 7.8, cor: C.tinta }));
}

/** Aceite: a linha que transforma orçamento em pedido. */
function aceite(fl, ctx) {
  // 34 mm é a altura real do bloco (título + parágrafo + folga + linhas +
  // rótulos). Reservar menos jogava a assinatura sozinha para uma página nova.
  fl.garantir(34);
  secao(fl, ctx, 'ACEITE');
  paragrafo(fl, ctx,
    'Ao assinar, o CONTRATANTE declara estar de acordo com o escopo, os valores e as condições acima, '
    + 'autorizando a Energy PRO a executar os serviços descritos nesta proposta.',
    { tamanho: 7.6, cor: C.suave });
  fl.estado.y += 8;

  const p = fl.estado.page;
  const larg = (LARG - 12) / 2;
  line(p, { x1: MARGEM, y1: fl.estado.y, x2: MARGEM + larg, y2: fl.estado.y, color: C.tinta, thickness: 0.4 });
  // Razão social de condomínio ou associação não cabe numa linha; truncar com
  // reticências no lugar onde a pessoa assina é pior do que quebrar em duas.
  const nome = wrap(ctx.F.pop6, ctx.dados.cliente.nome || '', 7.8, larg).slice(0, 2);
  nome.forEach((ln, i) => text(p, ln, {
    x: MARGEM, y: fl.estado.y + 2 + i * 3.4, w: larg, size: 7.8, font: ctx.F.pop6, color: C.tinta, align: 'center',
  }));
  const yRot = fl.estado.y + 2 + Math.max(1, nome.length) * 3.4 + 0.6;
  // Rótulo em cinza, não em âmbar: âmbar sobre branco dá contraste de ~2:1 e
  // some no papel. A cor da marca fica onde há fundo escuro para sustentá-la.
  text(p, 'ASSINATURA DO CLIENTE', {
    x: MARGEM, y: yRot, w: larg, size: 6.2, font: ctx.F.os6, color: C.suave, align: 'center', tracking: 0.5,
  });

  const x2 = MARGEM + larg + 12;
  line(p, { x1: x2, y1: fl.estado.y, x2: x2 + larg, y2: fl.estado.y, color: C.tinta, thickness: 0.4 });
  text(p, 'DATA', {
    x: x2, y: fl.estado.y + 2.4, w: larg, size: 6.2, font: ctx.F.os6, color: C.suave, align: 'center', tracking: 0.5,
  });
  fl.estado.y += 14 + Math.max(0, nome.length - 1) * 3.4;
}

// ---------------------------------------------------------------------------
// Rodapé de contato — repetido em todas as páginas
// ---------------------------------------------------------------------------
function desenhaQr(p, qr, { x, y, size }) {
  const n = qr.size;
  const pad = 1.4;
  roundRect(p, { x, y, w: size, h: size, r: 1.6, color: C.branco });
  const cell = (size - 2 * pad) / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      // `get(linha, coluna)` — ver o comentário igual em layout-proposta.
      if (!qr.get(r, c)) continue;
      rect(p, { x: x + pad + c * cell, y: y + pad + r * cell, w: cell + 0.02, h: cell + 0.02, color: C.banda });
    }
  }
}

function rodape(doc, ctx, total, qr) {
  const { empresa } = ctx.dados;
  const y = 268, h = 297 - y;
  doc.getPages().forEach((p, i) => {
    rect(p, { x: 0, y, w: 210, h, color: C.banda });
    rect(p, { x: 0, y, w: 210, h: 1, color: C.amber });

    const contatos = [
      empresa.whatsapp ? `WhatsApp ${fone(empresa.whatsapp)}` : '',
      empresa.email_comercial || '',
      empresa.instagram || '',
    ].filter(Boolean);
    text(p, empresa.razao_social || empresa.nome || 'Energy PRO', {
      x: MARGEM, y: y + 6.5, size: 8, font: ctx.F.pop7, color: C.branco,
    });
    text(p, [empresa.endereco, [empresa.cidade, empresa.uf].filter(Boolean).join('/')].filter(Boolean).join(' — '), {
      x: MARGEM, y: y + 11.6, size: 6.6, font: ctx.F.os4, color: rgb(0.74, 0.81, 0.89),
    });
    text(p, contatos.join('  ·  '), {
      x: MARGEM, y: y + 16.2, size: 6.6, font: ctx.F.os4, color: rgb(0.74, 0.81, 0.89),
    });
    text(p, `Página ${i + 1} de ${total}`, {
      x: MARGEM, y: y + 21.4, size: 6.2, font: ctx.F.os4, color: rgb(0.55, 0.64, 0.76),
    });

    if (qr) {
      desenhaQr(p, qr, { x: 210 - MARGEM - 18, y: y + 5.5, size: 18 });
      text(p, 'Fale com a gente', {
        x: 210 - MARGEM - 62, y: y + 10.5, w: 40, size: 6.4, font: ctx.F.os4,
        color: rgb(0.74, 0.81, 0.89), align: 'right',
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------
export function renderPropostaServico(doc, dados, F, qr) {
  const ctx = { dados, F };
  const fl = criarFluxo(doc, ctx);
  fl.novaPagina(true);
  identificacao(fl, ctx);
  objeto(fl, ctx);
  grade(fl, ctx);
  totais(fl, ctx);
  condicoes(fl, ctx);
  observacoes(fl, ctx);
  aceite(fl, ctx);
  rodape(doc, ctx, fl.estado.n, qr);
  return fl.estado.page;
}
