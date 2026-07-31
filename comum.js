// ============================================================================
// EnergyPRO — código compartilhado entre a página pública (/) e o painel
//
// Tudo o que as duas telas precisam usar do MESMO jeito mora aqui: constantes
// de domínio, máscaras, validação e formatação. Se uma regra vive só em um
// lado, ela NÃO deve entrar neste arquivo — o valor dele é não haver duas
// versões da mesma regra.
// ============================================================================

// ===== Conexão =====
export const SUPABASE_URL = 'https://mgcgmdiymqpxcsxhelhs.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_2U-173FaGroKdHyFV6LqdA_69oe4CYo';
export const BUCKET = 'cadastros';

// ===== Constantes de domínio =====
export const SLOTS = [
  { k: 'conta_energia',          rot: 'Conta de energia',          dica: 'PDF, JPG ou PNG' },
  { k: 'documento_identidade',   rot: 'CNH ou RG',                 dica: 'Frente e verso' },
  { k: 'fotos_local',            rot: 'Fotos do local',            dica: 'Telhado, padrão de entrada, quadro' },
  { k: 'comprovante_residencia', rot: 'Comprovante de residência', dica: 'PDF, JPG ou PNG' },
  { k: 'proposta',               rot: 'Proposta',                  dica: 'Se já houver proposta' }
];

export const TELHADOS = [
  ['ceramico_colonial',     'Cerâmico / colonial'],
  ['fibrocimento',          'Fibrocimento'],
  ['metalico_trapezoidal',  'Metálico / trapezoidal'],
  ['zipado',                'Zipado'],
  ['laje_concreto',         'Laje / concreto'],
  ['solo',                  'Solo (usina no chão)'],
  ['carport',               'Carport / estacionamento'],
  ['outro',                 'Outro']
];

export const STATUS = [
  ['rascunho',         'Rascunho'],
  ['novo',             'Novo'],
  ['em_analise',       'Em análise'],
  ['proposta_enviada', 'Proposta enviada'],
  ['fechado',          'Fechado'],
  ['perdido',          'Perdido']
];

export const ORIGENS = [
  ['publico', 'Enviado pelo cliente'],
  ['equipe',  'Cadastrado pela equipe']
];

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const MIMES_OK = ['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'];
export const TAM_MAX = 20 * 1024 * 1024;
export const MAX_ARQUIVOS_PUBLICO = 20;   // mesmo teto da policy do banco

export const rotStatus  = v => (STATUS.find(s => s[0] === v)  || [, v])[1];
export const rotTelhado = v => (TELHADOS.find(t => t[0] === v) || [, v])[1];
export const rotSlot    = v => (SLOTS.find(s => s.k === v) || { rot: v }).rot;
export const rotOrigem  = v => (ORIGENS.find(o => o[0] === v) || [, v])[1];

// ===== Escape de HTML =====
// Regra inegociável: todo dado vindo do banco ou digitado passa por aqui antes
// de entrar em innerHTML.
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== Máscaras =====
export const soDigitos = v => (v || '').replace(/\D/g, '');

export function maskCPF(v) {
  const d = soDigitos(v).slice(0, 11);
  let o = d.slice(0, 3);
  if (d.length > 3) o += '.' + d.slice(3, 6);
  if (d.length > 6) o += '.' + d.slice(6, 9);
  if (d.length > 9) o += '-' + d.slice(9);
  return o;
}

export function maskFone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return '(' + d;
  const m = d.length > 10 ? 5 : 4;
  let o = '(' + d.slice(0, 2) + ') ' + d.slice(2, 2 + m);
  if (d.length > 2 + m) o += '-' + d.slice(2 + m);
  return o;
}

export function maskMoeda(v) {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return '';
  return 'R$ ' + (parseInt(d, 10) / 100).toLocaleString('pt-BR',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function maskInt(v) {
  const d = soDigitos(v).slice(0, 9);
  return d ? parseInt(d, 10).toLocaleString('pt-BR') : '';
}

// Identificador, NÃO quantidade. Sem separador de milhar e sem parseInt, para
// preservar zeros à esquerda; teto de 20 dígitos (a coluna aceita 30).
// Usar no nº da instalação: `maskInt` transformava 3012345678 (10 dígitos, o
// padrão da CEMIG) em 301.234.567 e o banco recebia o número truncado.
export const maskIdent = v => soDigitos(v).slice(0, 20);

// ===== Conversões para o banco =====
export const moedaParaNum = v => { const d = soDigitos(v); return d ? parseInt(d, 10) / 100 : null; };
export const intParaNum   = v => { const d = soDigitos(v); return d ? parseInt(d, 10) : null; };

// ===== Formatação de saída =====
export const fmtMoeda = n => n === null || n === undefined ? '—'
  : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtInt      = n => n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR');
export const fmtData     = s => s ? new Date(s).toLocaleDateString('pt-BR') : '—';
export const fmtDataHora = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const fmtCPF      = v => v ? maskCPF(v) : '—';
export const fmtFone     = v => v ? maskFone(v) : '—';
export const fmtTam      = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB'
                                             : Math.max(1, Math.round(b / 1024)) + ' KB';

// ===== Validação =====
export function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0;
  if (r !== +d[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === +d[10];
}

export const emailValido = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || '').trim());

// Nome de arquivo seguro para virar caminho no Storage.
export function nomeSeguro(n) {
  return (n || 'arquivo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80) || 'arquivo';
}

// Aceita o arquivo? Devolve null se ok, ou o motivo da recusa.
export function recusaArquivo(f) {
  if (f.size > TAM_MAX) return 'maior que 20 MB';
  if (f.type && !MIMES_OK.includes(f.type)) return 'formato não aceito';
  return null;
}
