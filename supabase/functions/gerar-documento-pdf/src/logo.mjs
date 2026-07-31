// ============================================================================
// EnergyPRO — a marca desenhada em vetor, nativa no PDF
//
// Reconstrução fiel do pacote "Logo Energy Pro recreation":
//   símbolo  = sol nascente (11 raios) sobre painel fotovoltaico em arco
//   wordmark = Jost Light 300, com o N e o R ESPELHADOS (EИEЯGY), PRO em degradê
//   tagline  = Open Sans Bold 700, "SOLUÇÕES EM ENERGIA SOLAR"
//
// Vetor (e não PNG) porque o documento precisa da marca em BRANCO sobre a faixa
// navy — variante que não existe entre os arquivos de imagem — e porque assim
// ela fica nítida em qualquer zoom e impressão.
// ============================================================================
import { rgb } from 'pdf-lib';
import { X, Y, W, MM } from './brand.mjs';
import { GLIFOS } from './glifos.mjs';

// ===== Paleta oficial da marca =====
const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
export const MARCA = {
  navy:     hex('#29395F'),   // wordmark e símbolo, versão principal
  navyDeep: hex('#002A54'),   // tagline
  warm:     hex('#FAD21A'),   // início do degradê
  mid:      hex('#F5A22E'),
  deep:     hex('#F18637'),   // fim do degradê
  branco:   rgb(1, 1, 1),
};

// Geometria original do símbolo (viewBox 488 × 244)
const VB_W = 488, VB_H = 244;
const SW = 11.5;                                  // espessura do traço
const CX = 244, CY = 234, ERX = 167.3, ERY = 149.4, RAIO_L = 81;
const ARC_RX = 150, ARC_RY = 134;
const GRAD_X0 = 24, GRAD_X1 = 466;

const lerpCor = (a, b, t) => rgb(
  a.red + (b.red - a.red) * t,
  a.green + (b.green - a.green) * t,
  a.blue + (b.blue - a.blue) * t,
);

/** Cor do degradê na posição x do viewBox (ou a cor sólida, se houver). */
function tinta(x, { solida, warm, deep }) {
  if (solida) return solida;
  const t = Math.max(0, Math.min(1, (x - GRAD_X0) / (GRAD_X1 - GRAD_X0)));
  return lerpCor(warm, deep, t);
}

/**
 * Desenha o símbolo. `x`,`y` = canto superior esquerdo em mm; `w` = largura em mm
 * (a altura sai por proporção, 2:1). `solida` pinta tudo de uma cor só — é o que
 * se usa em branco sobre navy; sem ela, aplica o degradê quente da marca.
 */
export function simbolo(page, { x, y, w, solida = null, warm = MARCA.warm, deep = MARCA.deep }) {
  const k = W(w) / VB_W;                              // viewBox → pontos
  const px = (vx) => X(x) + vx * k;
  const py = (vy) => Y(y) - vy * k;
  const traco = SW * k;
  const opts = { solida, warm, deep };
  const seg = (x1, y1, x2, y2, corX) => page.drawLine({
    start: { x: px(x1), y: py(y1) }, end: { x: px(x2), y: py(y2) },
    thickness: traco, color: tinta(corX, opts), lineCap: 1,
  });

  // Arco do painel: metade superior de uma elipse (centro 244,234) — em N passos
  // para o degradê fluir ao longo da curva.
  const passos = solida ? 40 : 48;
  let ax = CX + ARC_RX, ay = CY;
  for (let i = 1; i <= passos; i++) {
    const a = (i / passos) * Math.PI;
    const nx = CX + ARC_RX * Math.cos(a), ny = CY - ARC_RY * Math.sin(a);
    seg(ax, ay, nx, ny, (ax + nx) / 2);
    ax = nx; ay = ny;
  }
  // Travessa horizontal
  const hPassos = solida ? 1 : 24;
  for (let i = 0; i < hPassos; i++) {
    const x1 = 99.5 + (388.5 - 99.5) * (i / hPassos);
    const x2 = 99.5 + (388.5 - 99.5) * ((i + 1) / hPassos);
    seg(x1, 198, x2, 198, (x1 + x2) / 2);
  }
  // Montantes verticais
  seg(192, 108.3, 192, 234, 192);
  seg(296, 108.3, 296, 234, 296);

  // Raios do sol: 11 pétalas entre 165° e 15°
  const n = 11, a0 = 165, a1 = 15;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = (a0 + (a1 - a0) * t) * Math.PI / 180;
    const rx = CX + ERX * Math.cos(a), ry = CY - ERY * Math.sin(a);
    const dx = rx - CX, dy = ry - CY, m = Math.hypot(dx, dy);
    const ux = dx / m, uy = dy / m;
    const qx = rx + RAIO_L * ux, qy = ry + RAIO_L * uy;
    const mx = (rx + qx) / 2, my = (ry + qy) / 2;
    const nx = -uy, ny = ux;
    const f = (v) => Math.round(v * 10) / 10;
    const d = `M${f(rx)},${f(ry)} Q${f(mx + SW * nx)},${f(my + SW * ny)} ${f(qx)},${f(qy)} `
            + `Q${f(mx - SW * nx)},${f(my - SW * ny)} ${f(rx)},${f(ry)}Z`;
    page.drawSvgPath(d, { x: X(x), y: Y(y), scale: k, color: tinta((rx + qx) / 2, opts) });
  }
}

const LETRAS = [
  { ch: 'E' }, { ch: 'N', espelha: true }, { ch: 'E' }, { ch: 'R', espelha: true },
  { ch: 'G' }, { ch: 'Y' },
  { ch: 'P', quente: 0 }, { ch: 'R', quente: 0.5 }, { ch: 'O', quente: 1 },
];
const GAP_EM = 0.268;

/** Desenha um glifo de contorno. `s` = corpo em pt, `x`,`y` = origem da baseline. */
function glifo(page, fonte, ch, { x, yBaseline, s, cor, espelha = false }) {
  const src = GLIFOS[fonte];
  const g = src.glifos[ch];
  if (!g) return 0;
  const k = s / src.upm;
  const d = espelha ? (g.dm ?? g.d) : g.d;
  if (d) page.drawSvgPath(d, { x: X(x), y: yBaseline, scale: k, color: cor });
  return (g.adv * k) / MM;                    // avanço em mm
}

const larguraTexto = (fonte, txt, s) => {
  const src = GLIFOS[fonte];
  let t = 0;
  for (const ch of txt) t += (src.glifos[ch]?.adv ?? src.upm * 0.5) * s / src.upm;
  return t / MM;
};

/** Largura do wordmark "EИEЯGYPRO" no tamanho `s` (pt), em mm. */
export function larguraWordmark(_ignorado, s) {
  const src = GLIFOS.wordmark;
  const soma = LETRAS.reduce((acc, l) => acc + (src.glifos[l.ch]?.adv ?? 0) * s / src.upm, 0);
  return soma / MM + GAP_EM * s * (LETRAS.length - 1) / MM;
}

/**
 * Wordmark. `x`,`y` = canto superior esquerdo do bloco, `s` = corpo em pt.
 * `solida` pinta as 9 letras de uma cor só (versão branca sobre o navy); sem
 * ela, EИEЯGY em navy e PRO no degradê quente da marca.
 */
export function wordmark(page, { x, y, s, solida = null }) {
  const yBase = Y(y) - s * 0.74;
  let cx = x;
  for (const l of LETRAS) {
    const cor = solida
      ?? (l.quente === undefined ? MARCA.navy
        : l.quente === 0 ? MARCA.warm : l.quente === 0.5 ? MARCA.mid : MARCA.deep);
    cx += glifo(page, 'wordmark', l.ch, { x: cx, yBaseline: yBase, s, cor, espelha: !!l.espelha }) + (GAP_EM * s) / MM;
  }
}

const TAGLINE = 'SOLUÇÕES EM ENERGIA SOLAR';

/**
 * Lockup vertical completo (símbolo sobre wordmark sobre tagline), centralizado
 * em `cx`. `s` = corpo do wordmark em pt; todo o resto deriva dele, nas mesmas
 * proporções do pacote original.
 */
export function lockupVertical(page, { cx, y, s, solida = null, corTagline = null, tagline = true }) {
  const markW = 4.79 * s / MM;                     // mm
  const markH = markW / 2;
  simbolo(page, { x: cx - markW / 2, y, w: markW, solida });

  const wY = y + markH + (0.5 * s) / MM;
  const wW = larguraWordmark(null, s);
  wordmark(page, { x: cx - wW / 2, y: wY, s, solida });

  if (!tagline) return wY + (0.8 * s) / MM;
  const tS = 0.385 * s;
  const tY = wY + (0.8 * s + 0.22 * s) / MM;
  const tracking = (0.01 * tS) / MM;
  const tW = larguraTexto('tagline', TAGLINE, tS) + tracking * (TAGLINE.length - 1);
  let tx = cx - tW / 2;
  const baseline = Y(tY) - tS * 0.76;
  const corT = corTagline ?? solida ?? MARCA.navyDeep;
  for (const ch of TAGLINE) tx += glifo(page, 'tagline', ch, { x: tx, yBaseline: baseline, s: tS, cor: corT }) + tracking;
  return tY + tS / MM;
}

/** Lockup horizontal (símbolo à esquerda, texto à direita). Devolve a largura total em mm. */
export function lockupHorizontal(page, { x, y, s, solida = null, corTagline = null, tagline = true }) {
  const markW = 4.4 * s / MM;
  const markH = markW / 2;
  const gap = (0.4 * s) / MM;
  const wW = larguraWordmark(null, s);
  const tS = 0.385 * s;
  const blocoH = (0.8 * s) / MM + (tagline ? (0.22 * s) / MM + (tS * 1.0) / MM : 0);
  const topo = y + Math.max(0, (markH - blocoH) / 2);

  simbolo(page, { x, y: y + Math.max(0, (blocoH - markH) / 2), w: markW, solida });
  const tx = x + markW + gap;
  wordmark(page, { x: tx, y: topo, s, solida });
  let larguraBloco = wW;
  if (tagline) {
    const tracking = (0.01 * tS) / MM;
    const tW = larguraTexto('tagline', TAGLINE, tS) + tracking * (TAGLINE.length - 1);
    larguraBloco = Math.max(wW, tW);
    let px = tx;
    const baseline = Y(topo + (0.8 * s + 0.22 * s) / MM) - tS * 0.76;
    const corT = corTagline ?? solida ?? MARCA.navyDeep;
    for (const ch of TAGLINE) px += glifo(page, 'tagline', ch, { x: px, yBaseline: baseline, s: tS, cor: corT }) + tracking;
  }
  return markW + gap + larguraBloco;
}
