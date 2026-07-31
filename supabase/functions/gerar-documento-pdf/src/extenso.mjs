// ============================================================================
// Valor por extenso em reais — praxe (e, em muitos cartórios, exigência) em
// contrato brasileiro: o número escrito duas vezes evita adulteração de dígito.
// ============================================================================
const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 1–999 por extenso. */
function ate999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), d = Math.floor((n % 100) / 10), u = n % 10;
  const partes = [];
  if (c) partes.push(C[c]);
  if (d === 1) partes.push(DEZ[u]);
  else {
    if (d) partes.push(D[d]);
    if (u) partes.push(U[u]);
  }
  return partes.join(' e ');
}

const ESCALAS = [
  { n: 1_000_000_000, s: 'bilhão', p: 'bilhões' },
  { n: 1_000_000, s: 'milhão', p: 'milhões' },
  { n: 1_000, s: 'mil', p: 'mil' },
];

function inteiroExtenso(n) {
  if (n === 0) return 'zero';
  const blocos = [];
  let resto = n;
  for (const e of ESCALAS) {
    const q = Math.floor(resto / e.n);
    if (q > 0) {
      // "mil" não leva "um" na frente: 1000 = "mil", não "um mil"
      const prefixo = e.n === 1000 && q === 1 ? '' : `${inteiroExtenso(q)} `;
      blocos.push(`${prefixo}${q === 1 ? e.s : e.p}`);
      resto %= e.n;
    }
  }
  if (resto > 0) blocos.push(ate999(resto));
  if (blocos.length < 2) return blocos.join('');
  // "e" liga o último bloco quando ele é menor que cem ou múltiplo redondo de cem
  const ultimo = blocos.pop();
  const ligaComE = resto > 0 && (resto < 100 || resto % 100 === 0);
  return `${blocos.join(', ')}${ligaComE ? ' e ' : ', '}${ultimo}`;
}

/**
 * "R$ 11.500,00 (onze mil e quinhentos reais)"
 *
 * ARMADILHA JÁ PAGA: `Math.round` e o arredondamento do `Intl` discordavam em
 * casos de meio centavo — 1,005 saía como "R$ 1,01" ao lado de "um real". Este
 * campo existe justamente para conferir o numeral; discordar dele é pior do que
 * não existir. Agora o extenso parte da MESMA string que o `moeda()` imprime.
 *
 * Negativo também quebrava: -50 devolvia " reais" e -0,01 devolvia "".
 */
export function reaisPorExtenso(valor) {
  const n = Number(valor) || 0;
  const negativo = n < 0;
  // Passa pelo formatador para herdar exatamente o arredondamento dele.
  const texto = Math.abs(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const [parteInteira, parteCentavos] = texto.split(',');
  const inteiros = Number(parteInteira.replace(/\D/g, ''));
  const centavos = Number(parteCentavos ?? '0');
  const partes = [];
  if (inteiros > 0 || centavos === 0) {
    const txt = inteiroExtenso(inteiros);
    // Em português, escala redonda pede a preposição: "dois milhões DE reais".
    const escalaRedonda = /(milhão|milhões|bilhão|bilhões)$/.test(txt);
    partes.push(`${txt}${escalaRedonda ? ' de' : ''} ${inteiros === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) {
    partes.push(`${inteiroExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }
  const extenso = partes.join(' e ');
  return negativo ? `menos ${extenso}` : extenso;
}
