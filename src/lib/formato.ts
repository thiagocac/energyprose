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

export const dataBr = (s: unknown) => {
  if (!s) return '—';
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

export const dataHoraBr = (s: unknown) => {
  if (!s) return '—';
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

/** Telefone brasileiro a partir de dígitos, com ou sem o DDI 55. */
export function fone(v: unknown) {
  const d = soDigitos(v).replace(/^55/, '');
  if (!d) return '—';
  if (d.length < 10) return d;
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
  const numero = d.startsWith('55') ? d : `55${d}`;
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
