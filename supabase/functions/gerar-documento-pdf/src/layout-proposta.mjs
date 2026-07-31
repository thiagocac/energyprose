// ============================================================================
// EnergyPRO — layout da PROPOSTA COMERCIAL DE SISTEMA FOTOVOLTAICO
//
// Reprodução do modelo comercial que a Energy PRO já usa, agora gerado a partir
// dos dados do sistema. Tudo é vetor + fonte embutida: nenhum arquivo de imagem
// externo, PDF leve e nítido em qualquer zoom.
//
// O layout é FIXO (decisão de projeto: não há editor de template). O que muda de
// tempos em tempos — benefícios, itens inclusos, condições de pagamento, prazos,
// engenheiro responsável, contatos — vem de `ctx.empresa`, editável em tela.
// ============================================================================
import { rgb } from 'pdf-lib';
import {
  A4W, A4H, MARG, COR, X, Y, W, MM,
  rect, roundRect, line, pathMm, recorteRoundRect, fimRecorte,
  text, textoRico, paragraph, wrap, fit, textW,
  moeda, numero, dataBr, fone,
} from './brand.mjs';
import { icon, iconBadge } from './icons.mjs';
import { lockupHorizontal, MARCA } from './logo.mjs';

// ===== Cores do documento (derivadas da paleta da marca) =====
const D = {
  banda:    MARCA.navyDeep,          // #002A54 — faixas principais
  bandaEsc: rgb(0.004, 0.11, 0.24),  // topo do céu / cartões escuros
  navy:     MARCA.navy,              // #29395F — superfícies secundárias
  amber:    MARCA.warm,              // #FAD21A — acento forte
  laranja:  MARCA.deep,              // #F18637
  amberMid: MARCA.mid,               // #F5A22E
  tinta:    rgb(0.09, 0.13, 0.20),
  suave:    rgb(0.42, 0.47, 0.55),
  linha:    rgb(0.87, 0.90, 0.94),
  fundo:    rgb(0.96, 0.97, 0.985),
  branco:   COR.white,
};

// ===== Grade vertical da página (mm a partir do topo) =====
const G = {
  bandaH:      38,
  barraY:      30,  barraH: 16,
  heroY:       52,  heroH: 42,
  cardsY:      97,  cardsH: 56,
  blocosY:     157, blocosH: 74,
  garantiaY:   234, garantiaH: 16,
  contatoY:    253, contatoH: 35,
  faixaY:      288,
};
const COL_ESQ_W = 108;
const COL_DIR_X = MARG + COL_ESQ_W + 4;
const COL_DIR_W = 210 - MARG - COL_DIR_X;

// ============================================================================
// 1 — Cabeçalho: faixa navy com a marca e o título do documento
// ============================================================================
function cabecalho(page, ctx, F) {
  rect(page, { x: 0, y: 0, w: 210, h: G.bandaH, color: D.banda });
  // brilho diagonal em três passes, para dar profundidade sem borda dura
  [[112, 0.16], [132, 0.16], [152, 0.16]].forEach(([x0, op]) => {
    pathMm(page, `M ${x0} 0 L 210 0 L 210 ${G.bandaH} L ${x0 + 44} ${G.bandaH} Z`, { color: D.navy, opacity: op });
  });
  rect(page, { x: 0, y: G.bandaH - 1.2, w: 210, h: 1.2, color: D.amber });

  lockupHorizontal(page, { x: MARG + 2, y: 7, s: 12, solida: D.branco });

  const dir = 210 - MARG - 2;
  text(page, 'PROPOSTA COMERCIAL', {
    x: dir - 90, y: 8.5, w: 90, size: 10, font: F.pop6, color: D.branco, align: 'right', tracking: 1.1,
  });
  text(page, 'DE SISTEMA FOTOVOLTAICO', {
    x: dir - 100, y: 14.2, w: 100, size: 15.5, font: F.pop7, color: D.amber, align: 'right', tracking: 0.2,
  });
  text(page, `${ctx.proposta.numero}${ctx.proposta.revisao ? ` · REV ${ctx.proposta.revisao}` : ''}`, {
    x: dir - 90, y: 22.6, w: 90, size: 6.4, font: F.os6, color: D.branco, align: 'right', tracking: 0.7,
  });
}

// ============================================================================
// 2 — Barra de identificação: Cliente · Cidade · Data
// ============================================================================
function barraIdentificacao(page, ctx, F) {
  const x = MARG, w = 210 - 2 * MARG, y = G.barraY, h = G.barraH;
  // sombra suave: três camadas de baixa opacidade em vez de um bloco preto deslocado
  [[1.4, 0.05], [0.9, 0.06], [0.45, 0.07]].forEach(([d, op]) => {
    roundRect(page, { x: x + d * 0.4, y: y + d, w, h, r: 2.6, color: rgb(0, 0.06, 0.16), opacity: op });
  });
  roundRect(page, { x, y, w, h, r: 2.6, color: D.branco });

  const campos = [
    { ic: 'user', rot: 'Cliente:', val: ctx.cliente.nome },
    { ic: 'pin', rot: 'Cidade:', val: ctx.cliente.cidade + (ctx.cliente.uf ? ` — ${ctx.cliente.uf}` : '') },
    { ic: 'calendar', rot: 'Data:', val: dataBr(ctx.proposta.data) },
  ];
  const colW = w / 3;
  campos.forEach((c, i) => {
    const cx = x + i * colW;
    if (i > 0) line(page, { x1: cx, y1: y + 3.4, x2: cx, y2: y + h - 3.4, color: D.linha, thickness: 0.35 });
    icon(page, c.ic, { x: cx + 5, y: y + h / 2 - 2.6, size: 5.2, color: D.banda, peso: 1.7 });
    text(page, c.rot, { x: cx + 12, y: y + 4.4, size: 6.2, font: F.os6, color: D.suave });
    text(page, fit(F.pop6, c.val, 8.2, colW - 16), { x: cx + 12, y: y + 8.2, size: 8.2, font: F.pop6, color: D.banda });
  });
}

// ============================================================================
// 3 — Hero: ilustração vetorial de usina ao pôr do sol + selo da mensagem
// ============================================================================
const CEU = [
  { p: 0.00, c: [0.00, 0.09, 0.22] },
  { p: 0.42, c: [0.14, 0.20, 0.38] },
  { p: 0.72, c: [0.68, 0.36, 0.22] },
  { p: 1.00, c: [0.98, 0.80, 0.16] },
];
function corCeu(t) {
  let a = CEU[0], b = CEU[CEU.length - 1];
  for (let i = 0; i < CEU.length - 1; i++) if (t >= CEU[i].p && t <= CEU[i + 1].p) { a = CEU[i]; b = CEU[i + 1]; break; }
  const k = b.p === a.p ? 0 : (t - a.p) / (b.p - a.p);
  return rgb(a.c[0] + (b.c[0] - a.c[0]) * k, a.c[1] + (b.c[1] - a.c[1]) * k, a.c[2] + (b.c[2] - a.c[2]) * k);
}

function hero(page, ctx, F) {
  const x = MARG, y = G.heroY, w = 210 - 2 * MARG, h = G.heroH;
  recorteRoundRect(page, { x, y, w, h, r: 3 });

  // Céu em faixas finas (degradê do pôr do sol)
  const hor = y + h * 0.60;
  const faixas = 46;
  for (let i = 0; i < faixas; i++) {
    const t = i / (faixas - 1);
    rect(page, { x, y: y + (hor - y) * t, w, h: (hor - y) / faixas + 0.35, color: corCeu(t) });
  }
  // Sol e halo
  const solX = x + w * 0.30, solY = hor - 3.2;
  [[9.5, 0.10], [6.6, 0.16], [4.4, 0.30]].forEach(([r, op]) => {
    page.drawCircle({ x: X(solX), y: Y(solY), size: W(r), color: D.amber, opacity: op });
  });
  page.drawCircle({ x: X(solX), y: Y(solY), size: W(2.9), color: rgb(1, 0.94, 0.72) });

  // Solo
  rect(page, { x, y: hor, w, h: y + h - hor, color: rgb(0.03, 0.08, 0.16) });

  // Telhado em perspectiva com o arranjo de módulos
  const TL = [x + w * 0.06, hor + 1.0], TR = [x + w * 0.62, hor + 1.0];
  const BL = [x - w * 0.06, y + h + 1], BR = [x + w * 0.80, y + h + 1];
  const P = (u, v) => {
    const tx = TL[0] + (TR[0] - TL[0]) * u, ty = TL[1] + (TR[1] - TL[1]) * u;
    const bx = BL[0] + (BR[0] - BL[0]) * u, by = BL[1] + (BR[1] - BL[1]) * u;
    return [tx + (bx - tx) * v, ty + (by - ty) * v];
  };
  pathMm(page, `M ${TL[0]} ${TL[1]} L ${TR[0]} ${TR[1]} L ${BR[0]} ${BR[1]} L ${BL[0]} ${BL[1]} Z`, { color: rgb(0.05, 0.13, 0.24) });
  const COLS = 8, ROWS = 4, GAPU = 0.012, GAPV = 0.022;
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const u0 = i / COLS + GAPU, u1 = (i + 1) / COLS - GAPU;
      const v0 = j / ROWS + GAPV, v1 = (j + 1) / ROWS - GAPV;
      const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
      const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      const refl = Math.max(0, 1 - Math.abs(uc - 0.26) * 2.3) * (1 - vc * 0.55);
      const base = [0.07, 0.19, 0.35], quente = [0.96, 0.68, 0.22];
      const k = Math.min(0.85, refl);
      pathMm(page, `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} L ${c[0]} ${c[1]} L ${d[0]} ${d[1]} Z`, {
        color: rgb(base[0] + (quente[0] - base[0]) * k, base[1] + (quente[1] - base[1]) * k, base[2] + (quente[2] - base[2]) * k),
      });
    }
  }
  // Véu escuro na direita, em passes sobrepostos: o selo ganha contraste sem
  // criar uma aresta diagonal visível sobre a ilustração.
  for (let i = 0; i < 7; i++) {
    const u = 0.34 + i * 0.035;
    pathMm(page, `M ${x + w * u} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x + w * (u + 0.13)} ${y + h} Z`,
      { color: D.bandaEsc, opacity: 0.19 });
  }

  fimRecorte(page);

  // Selo da mensagem
  const sw = 74, sx = x + w - sw - 6, sy = y + 7, sh = 28;
  roundRect(page, { x: sx, y: sy, w: sw, h: sh, r: 2.6, color: D.bandaEsc, opacity: 0.9, borderColor: D.amber, borderWidth: 0.5 });
  icon(page, 'bolt', { x: sx + sw - 9, y: sy + 3.4, size: 5.4, color: D.amber, peso: 1.9 });
  text(page, 'ENERGIA SOLAR', { x: sx + 5.5, y: sy + 4.6, size: 7, font: F.pop7, color: D.branco, tracking: 0.5 });
  textoRico(page, [
    { t: 'O ' }, { t: 'INVESTIMENTO', color: D.amber, font: F.pop7 }, { t: ' QUE GERA ' },
    { t: 'ECONOMIA', color: D.amber, font: F.pop7 }, { t: ' E ' }, { t: 'VALOR', color: D.amber, font: F.pop7 },
    { t: ' PARA SEMPRE.' },
  ], { x: sx + 5.5, y: sy + 11.5, w: sw - 11, size: 8.4, font: F.pop6, color: D.branco, leading: 1.32 });
}

// ============================================================================
// 4 — Card "Sistema proposto" (o que muda de cliente para cliente)
// ============================================================================
function cardSistema(page, ctx, F) {
  const x = MARG, y = G.cardsY, w = COL_ESQ_W, h = G.cardsH, hd = 9.4;
  roundRect(page, { x, y, w, h, r: 2.6, color: D.branco, borderColor: D.linha, borderWidth: 0.5 });
  recorteRoundRect(page, { x, y, w, h, r: 2.6 });
  rect(page, { x, y, w, h: hd, color: D.banda });
  fimRecorte(page);
  icon(page, 'activity', { x: x + 4, y: y + 2.3, size: 4.8, color: D.amber, peso: 1.9 });
  text(page, 'SISTEMA PROPOSTO', { x: x + 11, y: y + 3.2, size: 7.6, font: F.pop7, color: D.branco, tracking: 0.6 });

  const s = ctx.sistema;
  const linhas = [
    { ic: 'panel', rot: 'Quantidade de módulos', val: [`${numero(s.modulo_qtd)} módulos`] },
    { ic: 'panelSun', rot: 'Modelo e potência dos módulos', val: [s.modulo_descricao] },
    { ic: 'inverter', rot: 'Modelo do inversor', val: [s.inversor_descricao] },
    { ic: 'bolt', rot: 'Potência instalada', val: [`${numero(s.potencia_instalada_kwp, 2)} kWp`] },
    { ic: 'chart', rot: 'Geração média mensal (kWh)', val: [`~ ${numero(s.geracao_media_kwh_mes)} kWh/mês`] },
    { ic: 'shield', rot: 'Garantia dos equipamentos', val: [`Módulos: ${s.garantia_modulos_anos} anos`, `Inversor: ${s.garantia_inversor_anos} anos`] },
  ];
  const rowH = (h - hd) / linhas.length;
  const icX = x + 3.4, rotX = x + 14, rotW = 40, valX = x + 56, valW = w - 56 - 3.5 + MARG - MARG;
  linhas.forEach((l, i) => {
    const ry = y + hd + i * rowH;
    if (i > 0) line(page, { x1: x + 3, y1: ry, x2: x + w - 3, y2: ry, color: D.linha, thickness: 0.35 });
    iconBadge(page, l.ic, { x: icX, y: ry + (rowH - 8) / 2, box: 8, size: 4.8, fundo: D.fundo, borda: D.linha, color: D.banda, peso: 1.8, raio: 2 });
    const rotLn = wrap(F.os6, l.rot, 6.6, rotW);
    rotLn.forEach((ln, k) => text(page, ln, { x: rotX, y: ry + (rowH - rotLn.length * 2.9) / 2 + k * 2.9, size: 6.6, font: F.os6, color: D.suave }));
    const vals = l.val.flatMap((v) => wrap(F.pop6, v, 7.4, w - 56 - 4));
    vals.forEach((ln, k) => text(page, ln, { x: valX, y: ry + (rowH - vals.length * 3.3) / 2 + k * 3.3, size: 7.4, font: F.pop6, color: D.tinta }));
  });
}

// Tetos das grades. A área de cada card é fixa no layout de uma página; passar
// disso não "aperta", sobrepõe. Os números vêm da altura útil dividida pela
// altura mínima legível de cada linha.
const MAX_BENEFICIOS = 6;
const MAX_INCLUSOS = 20;   // 4 fileiras de 5
const MAX_CONDICOES = 5;

// ============================================================================
// 5 — Card "Benefícios" (texto fixo, configurável)
// ============================================================================
function cardBeneficios(page, ctx, F) {
  const x = COL_DIR_X, y = G.cardsY, w = COL_DIR_W, h = G.cardsH, hd = 9.4;
  roundRect(page, { x, y, w, h, r: 2.6, color: D.branco, borderColor: D.linha, borderWidth: 0.5 });
  recorteRoundRect(page, { x, y, w, h, r: 2.6 });
  rect(page, { x, y, w, h: hd, color: D.amber });
  fimRecorte(page);
  icon(page, 'star', { x: x + 4, y: y + 2.3, size: 4.8, color: D.banda, peso: 1.9 });
  text(page, 'BENEFÍCIOS', { x: x + 11, y: y + 3.2, size: 7.6, font: F.pop7, color: D.banda, tracking: 0.6 });

  // `?? []` e o teto: a lista vem de config_empresa, editável em tela. Nula,
  // derrubava a geração inteira; longa demais, os cartões se sobrepunham e a
  // proposta saía ilegível. Melhor cortar com aviso do que imprimir borrão.
  const itens = (ctx.empresa.beneficios ?? []).slice(0, MAX_BENEFICIOS);
  if (!itens.length) return;
  const rowH = (h - hd) / itens.length;
  itens.forEach((b, i) => {
    const ry = y + hd + i * rowH;
    if (i > 0) line(page, { x1: x + 3, y1: ry, x2: x + w - 3, y2: ry, color: D.linha, thickness: 0.35 });
    iconBadge(page, b.icone, { x: x + 3.4, y: ry + (rowH - 8) / 2, box: 8, size: 4.8, fundo: D.fundo, borda: D.linha, color: D.banda, peso: 1.8, raio: 2 });
    const linhas = [b.titulo, b.sub].filter(Boolean);
    const alt = linhas.length * 3.3;
    linhas.forEach((ln, k) => text(page, fit(k === 0 ? F.pop6 : F.os4, ln, k === 0 ? 7.4 : 6.8, w - 16), {
      x: x + 13.6, y: ry + (rowH - alt) / 2 + k * 3.3, size: k === 0 ? 7.4 : 6.8,
      font: k === 0 ? F.pop6 : F.os4, color: k === 0 ? D.tinta : D.suave,
    }));
  });
}

// ============================================================================
// 6 — Bloco "O que está incluso" (grade de 15 itens)
// ============================================================================
function cardInclusos(page, ctx, F) {
  const x = MARG, y = G.blocosY, w = COL_ESQ_W, h = G.blocosH, hd = 9.4;
  roundRect(page, { x, y, w, h, r: 2.6, color: D.banda });
  recorteRoundRect(page, { x, y, w, h, r: 2.6 });
  for (let i = 0; i < 5; i++) {
    const u = 0.44 + i * 0.05;
    pathMm(page, `M ${x + w * (u + 0.22)} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x + w * u} ${y + h} Z`,
      { color: D.navy, opacity: 0.13 });
  }
  rect(page, { x, y, w, h: hd, color: D.bandaEsc });
  fimRecorte(page);
  icon(page, 'checkCircle', { x: x + 4, y: y + 2.3, size: 4.8, color: D.amber, peso: 1.9 });
  text(page, 'O QUE ESTÁ INCLUSO', { x: x + 11, y: y + 3.2, size: 7.6, font: F.pop7, color: D.branco, tracking: 0.6 });

  const itens = (ctx.empresa.itens_inclusos ?? []).slice(0, MAX_INCLUSOS);
  if (!itens.length) return;
  const COLS = 5, ROWS = Math.ceil(itens.length / COLS);
  const gx = x + 2.5, gw = w - 5, gy = y + hd + 1.5, gh = h - hd - 3.5;
  const cw = gw / COLS, ch = gh / ROWS;
  itens.forEach((it, i) => {
    const c = i % COLS, r = Math.floor(i / COLS);
    const cx = gx + c * cw, cy = gy + r * ch;
    iconBadge(page, it.icone, { x: cx + (cw - 9) / 2, y: cy + 1.2, box: 9, size: 5.4, borda: rgb(1, 1, 1), color: D.branco, peso: 1.7, raio: 2.4 });
    const linhas = wrap(F.os6, it.texto, 5.2, cw - 1.5).slice(0, 3);
    linhas.forEach((ln, k) => text(page, ln, { x: cx, y: cy + 11.6 + k * 2.5, w: cw, size: 5.2, font: F.os6, color: D.branco, align: 'center' }));
  });
}

// ============================================================================
// 7 — Card "Investimento" (o número que fecha a venda)
// ============================================================================
function cardInvestimento(page, ctx, F) {
  const x = COL_DIR_X, y = G.blocosY, w = COL_DIR_W, h = G.blocosH, hd = 9.4;
  roundRect(page, { x, y, w, h, r: 2.6, color: D.banda });
  recorteRoundRect(page, { x, y, w, h, r: 2.6 });
  rect(page, { x, y, w, h: hd, color: D.amber });
  fimRecorte(page);
  icon(page, 'money', { x: x + 4, y: y + 2.5, size: 4.8, color: D.banda, peso: 1.9 });
  text(page, 'INVESTIMENTO', { x: x + 11, y: y + 3.2, size: 7.6, font: F.pop7, color: D.banda, tracking: 0.6 });

  // Valor total
  const vy = y + hd + 4;
  roundRect(page, { x: x + 3, y: vy, w: w - 6, h: 20, r: 2.2, color: D.bandaEsc, borderColor: D.amber, borderWidth: 0.5 });
  text(page, 'VALOR TOTAL DO INVESTIMENTO', { x: x + 3, y: vy + 3.6, w: w - 6, size: 5.8, font: F.os6, color: D.branco, align: 'center', tracking: 0.5 });
  text(page, moeda(ctx.proposta.valor_total), { x: x + 3, y: vy + 8.4, w: w - 6, size: 17, font: F.pop7, color: D.amber, align: 'center' });
  if (ctx.proposta.validade) {
    text(page, `Válida até ${dataBr(ctx.proposta.validade)}`, { x: x + 3, y: vy + 16.4, w: w - 6, size: 5.6, font: F.os4, color: rgb(0.75, 0.82, 0.9), align: 'center' });
  }

  // Condições
  const cy0 = vy + 23.5;
  const cond = (ctx.empresa.condicoes_pagamento ?? []).slice(0, MAX_CONDICOES);
  if (!cond.length) return;
  const rowH = (y + h - 3 - cy0) / cond.length;
  cond.forEach((c, i) => {
    const cy = cy0 + i * rowH;
    if (i > 0) line(page, { x1: x + 5, y1: cy, x2: x + w - 5, y2: cy, color: rgb(1, 1, 1), thickness: 0.25, opacity: 0.13 });
    icon(page, c.icone, { x: x + 4.5, y: cy + (rowH - 5.4) / 2, size: 5.4, color: D.amber, peso: 1.8 });
    const linhas = [c.titulo, c.detalhe].filter(Boolean);
    const alt = linhas.reduce((a, _, k) => a + (k === 0 ? 3.3 : 3.0), 0);
    let ty = cy + (rowH - alt) / 2;
    linhas.forEach((ln, k) => {
      text(page, fit(k === 0 ? F.pop6 : F.os4, ln, k === 0 ? 7 : 6.2, w - 15), {
        x: x + 12, y: ty, size: k === 0 ? 7 : 6.2,
        font: k === 0 ? F.pop6 : F.os4, color: k === 0 ? D.amber : rgb(0.82, 0.87, 0.93),
      });
      ty += k === 0 ? 3.3 : 3.0;
    });
  });
}

// ============================================================================
// 8 — Faixa de garantias: validade · prazo de entrega · pós-venda
// ============================================================================
function faixaGarantias(page, ctx, F) {
  const x = MARG, y = G.garantiaY, w = 210 - 2 * MARG, h = G.garantiaH;
  roundRect(page, { x, y, w, h, r: 2.6, color: D.fundo, borderColor: D.linha, borderWidth: 0.5 });
  const e = ctx.empresa;
  const cols = [
    { ic: 'calendar', t1: 'PROPOSTA VÁLIDA POR', t2: `${e.validade_proposta_dias} DIAS`, t3: '' },
    { ic: 'checkCircle', t1: 'USINA ENTREGUE EM', t2: `${e.prazo_entrega_min_dias} A ${e.prazo_entrega_max_dias} DIAS`, t3: 'Projeto aprovado, instalação e homologação' },
    { ic: 'headset', t1: 'SUPORTE NO', t2: 'PÓS-VENDA', t3: 'Acompanhamento completo após a instalação' },
  ];
  const cw = w / 3;
  cols.forEach((c, i) => {
    const cx = x + i * cw;
    if (i > 0) line(page, { x1: cx, y1: y + 3, x2: cx, y2: y + h - 3, color: D.linha, thickness: 0.35 });
    icon(page, c.ic, { x: cx + 5, y: y + h / 2 - 3.1, size: 6.2, color: D.banda, peso: 1.7 });
    text(page, c.t1, { x: cx + 13.5, y: y + 3.4, size: 5.6, font: F.os6, color: D.suave, tracking: 0.4 });
    text(page, c.t2, { x: cx + 13.5, y: y + 6.6, size: 8.6, font: F.pop7, color: D.banda });
    if (c.t3) {
      const ln = wrap(F.os4, c.t3, 5.2, cw - 16).slice(0, 2);
      ln.forEach((l, k) => text(page, l, { x: cx + 13.5, y: y + 10.9 + k * 2.4, size: 5.2, font: F.os4, color: D.suave }));
    }
  });
}

// ============================================================================
// 9 — Rodapé navy: engenheiro responsável · contatos · QR do WhatsApp
// ============================================================================
function rodapeContato(page, ctx, F, qr) {
  const y = G.contatoY, h = G.contatoH;
  rect(page, { x: 0, y, w: 210, h, color: D.banda });
  rect(page, { x: 0, y, w: 210, h: 0.8, color: D.amber });
  const e = ctx.empresa;

  // Coluna 1 — engenheiro
  const c1 = MARG + 2;
  text(page, 'ENGENHEIRO RESPONSÁVEL', { x: c1, y: y + 6, size: 5.6, font: F.os6, color: rgb(0.66, 0.75, 0.86), tracking: 0.5 });
  text(page, fit(F.pop7, e.engenheiro_nome, 9.4, 62), { x: c1, y: y + 10.2, size: 9.4, font: F.pop7, color: D.amber });
  text(page, e.engenheiro_titulo, { x: c1, y: y + 16.2, size: 6.4, font: F.os4, color: D.branco });
  text(page, e.engenheiro_crea, { x: c1, y: y + 20.4, size: 7, font: F.os6, color: D.branco });

  // Coluna 2 — contatos
  const c2 = 78;
  line(page, { x1: c2 - 6, y1: y + 5, x2: c2 - 6, y2: y + h - 5, color: rgb(1, 1, 1), thickness: 0.3, opacity: 0.22 });
  icon(page, 'whatsapp', { x: c2, y: y + 8.4, size: 6, color: D.amber, peso: 1.7 });
  text(page, fone(e.whatsapp), { x: c2 + 8.5, y: y + 9.4, size: 9, font: F.pop6, color: D.branco });
  icon(page, 'instagram', { x: c2, y: y + 17.4, size: 6, color: D.amber, peso: 1.7 });
  text(page, e.instagram, { x: c2 + 8.5, y: y + 18.4, size: 9, font: F.pop6, color: D.branco });

  // Coluna 3 — QR
  const c3 = 136;
  line(page, { x1: c3 - 6, y1: y + 5, x2: c3 - 6, y2: y + h - 5, color: rgb(1, 1, 1), thickness: 0.3, opacity: 0.22 });
  text(page, 'FALE CONOSCO', { x: c3, y: y + 7.4, size: 7.6, font: F.pop7, color: D.amber, tracking: 0.4 });
  const msg = wrap(F.os4, 'Aponte a câmera para o QR Code e inicie uma conversa agora mesmo.', 5.6, 34);
  msg.slice(0, 3).forEach((l, k) => text(page, l, { x: c3, y: y + 12.6 + k * 2.7, size: 5.6, font: F.os4, color: rgb(0.82, 0.88, 0.94) }));
  if (qr) desenhaQr(page, qr, { x: 210 - MARG - 24, y: y + 5, size: 24 });
}

/** Desenha a matriz do QR como quadrados vetoriais, sobre uma base branca. */
function desenhaQr(page, qr, { x, y, size }) {
  const n = qr.size;
  const pad = 1.6;
  roundRect(page, { x, y, w: size, h: size, r: 1.8, color: D.branco });
  const cell = (size - 2 * pad) / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.get(c, r)) continue;
      rect(page, { x: x + pad + c * cell, y: y + pad + r * cell, w: cell + 0.02, h: cell + 0.02, color: D.banda });
    }
  }
}

// ============================================================================
// 10 — Faixa final com o posicionamento da marca
// ============================================================================
function faixaFinal(page, ctx, F) {
  const y = G.faixaY, h = 297 - G.faixaY;
  rect(page, { x: 0, y, w: 210, h, color: D.amber });
  textoRico(page, [
    { t: 'Economia, sustentabilidade e valorização do seu patrimônio ' },
    { t: 'com a qualidade Energy PRO.', font: F.pop7 },
  ], { x: MARG, y: y + h / 2 - 1.9, w: 210 - 2 * MARG, size: 7.4, font: F.pop6, color: D.banda, align: 'center' });
}

// ============================================================================
// Montagem
// ============================================================================
export function renderProposta(doc, ctx, F, qr) {
  const page = doc.addPage([A4W, A4H]);
  rect(page, { x: 0, y: 0, w: 210, h: 297, color: D.branco });
  cabecalho(page, ctx, F);
  hero(page, ctx, F);
  barraIdentificacao(page, ctx, F);
  cardSistema(page, ctx, F);
  cardBeneficios(page, ctx, F);
  cardInclusos(page, ctx, F);
  cardInvestimento(page, ctx, F);
  faixaGarantias(page, ctx, F);
  rodapeContato(page, ctx, F, qr);
  faixaFinal(page, ctx, F);
  return page;
}
