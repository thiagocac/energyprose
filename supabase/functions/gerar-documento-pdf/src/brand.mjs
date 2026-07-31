// ============================================================================
// EnergyPRO — identidade visual e utilitários de desenho para os documentos PDF
//
// Este módulo é compartilhado por todos os layouts (proposta, contrato). Ele não
// conhece regra de negócio: só cor, medida, tipografia e primitivas de desenho.
// Portável 1:1 para a Edge Function (só troca o import do pdf-lib).
// ============================================================================
import {
  rgb, pushGraphicsState, popGraphicsState,
  moveTo, lineTo, appendBezierCurve, closePath, clip, endPath,
} from 'pdf-lib';

// ===== Página =====
export const MM = 72 / 25.4;
export const A4W = 210 * MM;
export const A4H = 297 * MM;
export const MARG = 10;                 // margem lateral, em mm
export const CONT_W = 210 - 2 * MARG;   // largura útil, em mm

// mm → pontos, na origem do PDF (y cresce para cima)
export const X = (mm) => mm * MM;
export const Y = (mm) => A4H - mm * MM;
export const W = (mm) => mm * MM;

// ===== Paleta =====
const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
export const COR = {
  navy:      hex('#12213D'),   // faixa principal / cards escuros
  navySoft:  hex('#1B3358'),   // superfície sobre o navy
  navyDeep:  hex('#0C1729'),   // topo do céu no hero
  amber:     hex('#F5A623'),   // acento da marca
  amberDeep: hex('#E08A12'),
  amberSoft: hex('#FFC65C'),
  ink:       hex('#16202F'),
  muted:     hex('#6B7280'),
  line:      hex('#E3E8EF'),
  bgSoft:    hex('#F4F7FA'),
  white:     rgb(1, 1, 1),
  green:     hex('#16A34A'),
};

// ===== Formas =====
/** Caminho SVG de retângulo arredondado, em mm, origem no canto superior esquerdo. */
export function roundRectPath(wMm, hMm, rMm) {
  const w = W(wMm), h = W(hMm), r = Math.min(W(rMm), W(wMm) / 2, W(hMm) / 2);
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} `
       + `A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} `
       + `V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

/** Retângulo arredondado. x/y em mm a partir do canto superior esquerdo da página. */
export function roundRect(page, { x, y, w, h, r = 2, color, borderColor, borderWidth = 0 }) {
  page.drawSvgPath(roundRectPath(w, h, r), {
    x: X(x), y: Y(y),
    ...(color ? { color } : {}),
    ...(borderColor ? { borderColor, borderWidth } : {}),
  });
}

/** Retângulo reto (mais barato que o arredondado para faixas e barras). */
export function rect(page, { x, y, w, h, color, borderColor, borderWidth = 0 }) {
  page.drawRectangle({
    x: X(x), y: Y(y + h), width: W(w), height: W(h),
    ...(color ? { color } : {}),
    ...(borderColor ? { borderColor, borderWidth } : {}),
  });
}

/**
 * Desenha um caminho SVG escrito diretamente em MILÍMETROS, com origem no canto
 * superior esquerdo da página (mesmo sistema de coordenadas do resto do módulo).
 */
export function pathMm(page, d, opts = {}) {
  page.drawSvgPath(d, { x: X(0), y: Y(0), scale: MM, ...opts });
}

export function line(page, { x1, y1, x2, y2, color = COR.line, thickness = 0.3 }) {
  page.drawLine({
    start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) },
    thickness: W(thickness), color,
  });
}

// ===== Recorte (clipping) =====
const K = 0.5523;   // constante de Bézier para aproximar um quarto de círculo

/**
 * Abre um recorte em retângulo arredondado: tudo desenhado depois só aparece
 * dentro dele. Fechar SEMPRE com `fimRecorte(page)`.
 */
export function recorteRoundRect(page, { x, y, w: wMm, h: hMm, r: rMm = 3 }) {
  const x0 = X(x), y0 = Y(y + hMm), x1 = X(x + wMm), y1 = Y(y);
  const r = Math.min(W(rMm), (x1 - x0) / 2, (y1 - y0) / 2);
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x0 + r, y0),
    lineTo(x1 - r, y0),
    appendBezierCurve(x1 - r + r * K, y0, x1, y0 + r - r * K, x1, y0 + r),
    lineTo(x1, y1 - r),
    appendBezierCurve(x1, y1 - r + r * K, x1 - r + r * K, y1, x1 - r, y1),
    lineTo(x0 + r, y1),
    appendBezierCurve(x0 + r - r * K, y1, x0, y1 - r + r * K, x0, y1 - r),
    lineTo(x0, y0 + r),
    appendBezierCurve(x0, y0 + r - r * K, x0 + r - r * K, y0, x0 + r, y0),
    closePath(), clip(), endPath(),
  );
}
export function fimRecorte(page) { page.pushOperators(popGraphicsState()); }

// ===== Tipografia =====
// y sempre é o TOPO da linha (o pdf-lib desenha pela baseline; convertemos aqui).
const BASE = 0.76;

export function textW(font, str, sizePt) {
  return font.widthOfTextAtSize(String(str ?? ''), sizePt) / MM;   // devolve em mm
}

/**
 * Escreve uma linha. `align`: 'left' | 'center' | 'right' dentro de [x, x+w].
 * `tracking` em pt por caractere (para os rótulos em caixa alta espaçada).
 */
export function text(page, str, { x, y, w: boxW, size = 9, font, color = COR.ink, align = 'left', tracking = 0 }) {
  const s = String(str ?? '');
  if (!s) return;
  const natural = font.widthOfTextAtSize(s, size) + tracking * Math.max(0, s.length - 1);
  const naturalMm = natural / MM;
  let px = x;
  if (align === 'center') px = x + ((boxW ?? 0) - naturalMm) / 2;
  else if (align === 'right') px = x + (boxW ?? 0) - naturalMm;
  const opts = { x: X(px), y: Y(y) - size * BASE, size, font, color };
  if (tracking) {
    // pdf-lib não expõe letter-spacing: desenha caractere a caractere.
    let cx = X(px);
    for (const ch of s) {
      page.drawText(ch, { ...opts, x: cx });
      cx += font.widthOfTextAtSize(ch, size) + tracking;
    }
    return;
  }
  page.drawText(s, opts);
}

/** Quebra texto em linhas que cabem em `maxMm`. */
export function wrap(font, str, size, maxMm) {
  const words = String(str ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const cand = cur ? `${cur} ${word}` : word;
    if (textW(font, cand, size) <= maxMm) { cur = cand; continue; }
    if (cur) lines.push(cur);
    cur = word;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** Escreve parágrafo com quebra automática; devolve a altura consumida em mm. */
export function paragraph(page, str, { x, y, w: boxW, size = 9, font, color = COR.ink, leading = 1.35, align = 'left' }) {
  const lines = wrap(font, str, size, boxW);
  const step = (size * leading) / MM;
  lines.forEach((ln, i) => text(page, ln, { x, y: y + i * step, w: boxW, size, font, color, align }));
  return lines.length * step;
}

/**
 * Texto com trechos de cor/fonte diferentes na mesma linha, com quebra automática.
 * `partes` = [{ t, font, color, size }]. Devolve a altura consumida em mm.
 * É o que permite destacar "INVESTIMENTO", "ECONOMIA" e "VALOR" no selo do hero.
 */
export function textoRico(page, partes, { x, y, w: boxW, size = 9, font, color = COR.ink, leading = 1.3, align = 'left' }) {
  const tokens = [];
  for (const p of partes) {
    const f = p.font ?? font, s = p.size ?? size, c = p.color ?? color;
    String(p.t ?? '').split(/(\s+)/).forEach((tk) => {
      if (tk === '') return;
      tokens.push({ t: tk, f, s, c, espaco: /^\s+$/.test(tk), w: f.widthOfTextAtSize(tk, s) / MM });
    });
  }
  const linhas = [];
  let atual = [], larg = 0;
  for (const tk of tokens) {
    if (tk.espaco && !atual.length) continue;
    if (larg + tk.w > boxW && !tk.espaco && atual.length) {
      while (atual.length && atual[atual.length - 1].espaco) { larg -= atual.pop().w; }
      linhas.push({ tokens: atual, larg });
      atual = []; larg = 0;
    }
    atual.push(tk); larg += tk.w;
  }
  if (atual.length) linhas.push({ tokens: atual, larg });

  const step = (size * leading) / MM;
  linhas.forEach((ln, i) => {
    let cx = x;
    if (align === 'center') cx = x + (boxW - ln.larg) / 2;
    else if (align === 'right') cx = x + boxW - ln.larg;
    for (const tk of ln.tokens) {
      if (!tk.espaco) page.drawText(tk.t, { x: X(cx), y: Y(y + i * step) - tk.s * BASE, size: tk.s, font: tk.f, color: tk.c });
      cx += tk.w;
    }
  });
  return linhas.length * step;
}

/** Corta com reticências se não couber. */
export function fit(font, str, size, maxMm) {
  let s = String(str ?? '');
  if (textW(font, s, size) <= maxMm) return s;
  while (s.length > 1 && textW(font, `${s}…`, size) > maxMm) s = s.slice(0, -1);
  return `${s}…`;
}

// ===== Formatação pt-BR =====
// ARMADILHA 1: toLocaleString separa "R$" do número com ESPAÇO INQUEBRÁVEL
// (U+00A0). As fontes embutidas são subconjuntos e não têm esse caractere — ele
// saía como um retângulo vazio no meio do valor. Trocamos por espaço comum.
//
// ARMADILHA 2: a classe é `\s`, e não `[\u00A0...]`, de propósito. Sequências
// `\uXXXX` sobrevivem ao esbuild e vão para o bundle da Edge Function, que é
// transcrito no deploy — e escape unicode é justamente o que não atravessa esse
// caminho intacto. `\s` já cobre U+00A0 e U+202F, e numa string de moeda o
// único espaço existente é esse separador.
export const moeda = (n) => (Number(n) || 0)
  .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  .replace(/\s/g, ' ');
export const numero = (n, dec = 0) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const dataBr = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};
/** Máscara de telefone brasileiro a partir de dígitos (com ou sem DDI 55). */
export function fone(v) {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length < 10) return String(v ?? '');
  const n = d.length > 10 ? 5 : 4;
  return `(${d.slice(0, 2)}) ${d.slice(2, 2 + n)}-${d.slice(2 + n)}`;
}
