// ============================================================================
// EnergyPRO — gerador de XLSX sem dependência
//
// Por que não usar uma biblioteca: o projeto não tem build step e a única
// dependência de runtime hoje já é um CDN de terceiro (esm.sh, para o
// supabase-js) — que é justamente um ponto a reduzir, não a ampliar. O SheetJS
// completo custa ~900 KB e a versão publicada no npm está parada em 0.18.5.
// Escrever a planilha na mão são ~250 linhas e dá controle total sobre tipos e
// formatos, que é o que faltava no CSV: número tem de chegar no Excel como
// número, data como data.
//
// Um .xlsx é um ZIP com XML dentro. Este arquivo faz as duas coisas:
// compacta com `CompressionStream('deflate-raw')` quando o navegador tem, e
// grava sem compressão quando não tem (o Excel abre os dois).
//
// API:
//   folha(nome, colunas, linhas) → objeto de folha
//   gerarXLSX([folha, ...])      → Promise<Uint8Array>
//
// Tipos de coluna: 'texto' · 'inteiro' · 'moeda' · 'data' · 'link' · 'titulo'
// ============================================================================

const ENC = new TextEncoder();

// ===== XML =====================================================================
const x = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  // Caracteres de controle são ilegais em XML 1.0 e fazem o Excel recusar o
  // arquivo inteiro. Nome digitado pelo cliente pode trazer qualquer coisa.
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const CAB = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

// A1, B1 … Z1, AA1 … para qualquer largura de tabela.
export function coluna(i) {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) {
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  }
  return s;
}

// Data → número de série do Excel. Usa componentes locais para não escorregar
// um dia por fuso; a época do Excel é 30/12/1899 por causa do bug do ano 1900.
function serieData(d) {
  const t = d instanceof Date ? d : new Date(d);
  if (isNaN(t)) return null;
  return Math.floor(
    (Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

// ===== Estilos =================================================================
// Índices usados nas células (ordem do <cellXfs>):
const S = { texto: 0, cabecalho: 1, data: 2, moeda: 3, inteiro: 4, negrito: 5 };

const ESTILOS = `${CAB}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>
<numFmt numFmtId="165" formatCode="&quot;R$&quot;\\ #,##0.00"/>
<numFmt numFmtId="166" formatCode="#,##0"/>
</numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1B2A45"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// ===== Célula ==================================================================
function celula(ref, valor, tipo) {
  if (valor === null || valor === undefined || valor === '') return '';

  if (tipo === 'inteiro' || tipo === 'moeda') {
    const n = Number(valor);
    if (!isFinite(n)) return '';
    return `<c r="${ref}" s="${tipo === 'moeda' ? S.moeda : S.inteiro}"><v>${n}</v></c>`;
  }

  if (tipo === 'data') {
    const s = serieData(valor);
    return s === null ? '' : `<c r="${ref}" s="${S.data}"><v>${s}</v></c>`;
  }

  if (tipo === 'link') {
    // HYPERLINK evita ter de emitir a parte de relacionamentos da folha. O
    // valor em cache faz o link já aparecer antes de o Excel recalcular.
    const url = String(valor).replace(/"/g, '');
    return `<c r="${ref}" t="str"><f>HYPERLINK("${x(url)}","Abrir ficha")</f><v>Abrir ficha</v></c>`;
  }

  const s = tipo === 'titulo' ? S.negrito : S.texto;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${x(valor)}</t></is></c>`;
}

// ===== Folha ===================================================================
/**
 * @param {string} nome     rótulo da aba (Excel corta em 31 caracteres)
 * @param {Array}  colunas  [{ rot, largura, tipo }]
 * @param {Array}  linhas   array de arrays, na ordem das colunas
 */
export function folha(nome, colunas, linhas) {
  return { nome: String(nome).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31), colunas, linhas };
}

function folhaXML(f) {
  const nCols = f.colunas.length;
  const ultima = coluna(nCols - 1);
  const total = f.linhas.length + 1;

  const cols = f.colunas
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura || 14}" customWidth="1"/>`)
    .join('');

  const cabecalho = '<row r="1" ht="22" customHeight="1">' +
    f.colunas.map((c, i) =>
      `<c r="${coluna(i)}1" s="${S.cabecalho}" t="inlineStr"><is><t>${x(c.rot)}</t></is></c>`).join('') +
    '</row>';

  const corpo = f.linhas.map((linha, li) => {
    const r = li + 2;
    const cs = linha.map((v, ci) => celula(coluna(ci) + r, v, f.colunas[ci]?.tipo)).join('');
    return `<row r="${r}">${cs}</row>`;
  }).join('');

  return `${CAB}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">
<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>
</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${cabecalho}${corpo}</sheetData>
${f.semFiltro ? '' : `<autoFilter ref="A1:${ultima}${total}"/>`}
</worksheet>`;
}

// ===== ZIP =====================================================================
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflate(bytes) {
  // deflate-raw é exatamente o método 8 do ZIP. Onde não existir (navegador
  // antigo de celular), grava sem compressão — o arquivo fica maior e abre igual.
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(bytes); w.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch (_) {
    return null;
  }
}

function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

async function zipar(arquivos) {
  const agora = new Date();
  const hora = ((agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1)) & 0xFFFF;
  const data = (((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()) & 0xFFFF;

  const partes = [];
  const central = [];
  let deslocamento = 0;

  for (const { nome, conteudo } of arquivos) {
    const cru = typeof conteudo === 'string' ? ENC.encode(conteudo) : conteudo;
    const nomeB = ENC.encode(nome);
    const crc = crc32(cru);

    const comprimido = await deflate(cru);
    const usa = comprimido && comprimido.length < cru.length;
    const dados = usa ? comprimido : cru;
    const metodo = usa ? 8 : 0;

    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(metodo),
      ...u16(hora), ...u16(data), ...u32(crc),
      ...u32(dados.length), ...u32(cru.length),
      ...u16(nomeB.length), ...u16(0)
    ];
    partes.push(new Uint8Array(local), nomeB, dados);

    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(metodo),
      ...u16(hora), ...u16(data), ...u32(crc),
      ...u32(dados.length), ...u32(cru.length),
      ...u16(nomeB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(deslocamento), ...Array.from(nomeB)
    ]);

    deslocamento += local.length + nomeB.length + dados.length;
  }

  const dirBytes = new Uint8Array(central.flat());
  const fim = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(arquivos.length), ...u16(arquivos.length),
    ...u32(dirBytes.length), ...u32(deslocamento), ...u16(0)
  ]);

  const total = partes.reduce((t, p) => t + p.length, 0) + dirBytes.length + fim.length;
  const saida = new Uint8Array(total);
  let p = 0;
  for (const parte of partes) { saida.set(parte, p); p += parte.length; }
  saida.set(dirBytes, p); p += dirBytes.length;
  saida.set(fim, p);
  return saida;
}

// ===== Pacote ==================================================================
export async function gerarXLSX(folhas) {
  const fs = folhas.filter(Boolean);
  if (!fs.length) throw new Error('Nenhuma folha para gerar.');

  const tipos = `${CAB}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${fs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const raizRels = `${CAB}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const livro = `${CAB}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${fs.map((f, i) => `<sheet name="${x(f.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;

  const livroRels = `${CAB}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${fs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${fs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  return zipar([
    { nome: '[Content_Types].xml', conteudo: tipos },
    { nome: '_rels/.rels',         conteudo: raizRels },
    { nome: 'xl/workbook.xml',     conteudo: livro },
    { nome: 'xl/_rels/workbook.xml.rels', conteudo: livroRels },
    { nome: 'xl/styles.xml',       conteudo: ESTILOS },
    ...fs.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: folhaXML(f) }))
  ]);
}

export const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
