// ============================================================================
// Formatação e máscaras — pt-BR.
//
// Estas regras existem em DOIS lugares: aqui (app React) e em publico/comum.js
// (formulário público, sem build). Não dá para importar um do outro sem colocar
// build no site público, então a paridade é garantida por teste — o mesmo
// conjunto de asserções do arquivo antigo roda contra este.
// ============================================================================

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export const moeda = (n: unknown) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const numero = (n: unknown, dec = 0) =>
  (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/**
 * Data de coluna `date` ("2026-08-15").
 *
 * ARMADILHA JÁ PAGA: `new Date('2026-08-15')` é meia-noite UTC, e em Brasília
 * (UTC−3) isso é 21h do dia ANTERIOR. Sem fixar o fuso, toda validade e toda
 * vigência apareciam um dia antes na tela — e 01/01 aparecia como 31/12 do ano
 * anterior. Pior: o motor de PDF já fixava UTC e acertava, então a tela e o
 * documento que o cliente recebe mostravam datas diferentes.
 *
 * Data pura não tem fuso. Ler em UTC é ler o dia que está gravado.
 */
export const dataBr = (s: unknown) => {
  if (!s) return '—';
  const bruto = String(s);
  const d = new Date(bruto);
  if (Number.isNaN(d.getTime())) return '—';
  // Só data (sem hora) → lê em UTC. Com hora → é instante, respeita o fuso local.
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(bruto.trim());
  return d.toLocaleDateString('pt-BR', soData ? { timeZone: 'UTC' } : undefined);
};

export const dataHoraBr = (s: unknown) => {
  if (!s) return '—';
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

/** Data de hoje em `YYYY-MM-DD` no fuso de quem está usando, não em UTC. */
export const hojeISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * `YYYY-MM-DD` daqui a N dias ou meses, sem passar por UTC.
 *
 * O ajuste de fim de mês é explícito: 31/01 + 1 mês vira 28/02, e não 03/03
 * como o `setMonth` faz sozinho. Vigência de contrato não pode escorregar.
 */
export function dataFutura({ dias = 0, meses = 0 } = {}) {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (meses) {
    const diaAlvo = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + meses);
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(diaAlvo, ultimoDia));
  }
  if (dias) d.setDate(d.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Telefone brasileiro a partir de dígitos, com ou sem o DDI 55. */
export function fone(v: unknown) {
  // ARMADILHA: `replace(/^55/, '')` comia o DDD 55 (Rio Grande do Sul) de um
  // número sem DDI. Só é DDI quando o total passa de 11 dígitos.
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10) return String(v ?? '');
  const n = d.length > 10 ? 5 : 4;
  return `(${d.slice(0, 2)}) ${d.slice(2, 2 + n)}-${d.slice(2 + n)}`;
}

export function cpf(v: unknown) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length !== 11) return d || '—';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Link de conversa no WhatsApp com mensagem pronta. */
export function linkWhatsapp(telefone: unknown, mensagem: string) {
  const d = soDigitos(telefone);
  // Mesmo cuidado do `fone`: um número de Porto Alegre já começa com 55 sem
  // ter DDI. Só é DDI quando o total passa de 11 dígitos.
  const numero = d.length > 11 && d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

/** "há 3 dias", "em 2 h" — para as próximas ações do funil. */
export function relativo(iso: unknown): string {
  if (!iso) return '';
  const ms = new Date(String(iso)).getTime() - Date.now();
  if (Number.isNaN(ms)) return '';
  const abs = Math.abs(ms);
  const dia = 86_400_000;
  const fmt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (abs >= dia) return fmt.format(Math.round(ms / dia), 'day');
  if (abs >= 3_600_000) return fmt.format(Math.round(ms / 3_600_000), 'hour');
  return fmt.format(Math.round(ms / 60_000), 'minute');
}
