// ============================================================================
// Dimensionamento fotovoltaico — as contas que preenchem o bloco "Sistema
// proposto" da proposta. Ficam aqui, puras e testadas, porque são o número que
// o cliente lê no PDF e cobra depois.
// ============================================================================

/** Potência instalada em kWp: quantidade × potência do módulo (Wp) ÷ 1000. */
export function kwp(qtdModulos: number, potenciaWp: number): number {
  const v = (Number(qtdModulos) || 0) * (Number(potenciaWp) || 0) / 1000;
  return Math.round(v * 100) / 100;
}

/**
 * Geração média mensal (kWh/mês) = kWp × HSP × 30 × PR.
 * HSP = horas de sol pleno da região; PR = performance ratio (perdas do sistema).
 * Os dois vêm de config_empresa e ficam gravados na proposta, para o número
 * poder ser reconstruído depois.
 */
export function geracaoMensal(potenciaKwp: number, hsp: number, pr: number): number {
  return Math.round((Number(potenciaKwp) || 0) * (Number(hsp) || 0) * 30 * (Number(pr) || 0));
}

/**
 * Sugere a quantidade de módulos que cobre o consumo médio do cliente.
 * Inverso da fórmula acima, arredondado para cima — o vendedor sempre pode mudar.
 */
export function sugerirModulos(consumoKwhMes: number, potenciaWp: number, hsp: number, pr: number): number {
  const porModulo = (Number(potenciaWp) || 0) / 1000 * (Number(hsp) || 0) * 30 * (Number(pr) || 0);
  if (porModulo <= 0) return 0;
  return Math.max(1, Math.ceil((Number(consumoKwhMes) || 0) / porModulo));
}

/**
 * Razão entre potência CC (módulos) e CA (inversor). Serve só para informar:
 * o sistema NÃO trava a proposta por causa dela, porque sobredimensionar o
 * inversor é prática comum quando se prevê ampliação.
 */
export function razaoCcCa(potenciaKwp: number, inversorKw: number): number | null {
  const kw = Number(inversorKw) || 0;
  if (kw <= 0) return null;
  return Math.round(((Number(potenciaKwp) || 0) / kw) * 100) / 100;
}
