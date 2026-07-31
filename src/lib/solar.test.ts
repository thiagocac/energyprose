import { describe, expect, it } from 'vitest';
import { kwp, geracaoMensal, sugerirModulos, razaoCcCa } from './solar';

// Os números de referência vêm da proposta real da Energy PRO
// (Francielle Moreira, 30/07/2026): 6 × OSDA ODA-710N 710 Wp = 4,26 kWp,
// geração ~500 kWh/mês, inversor SolPlanet ASW7500-S 7,5 kW.
describe('dimensionamento', () => {
  it('reproduz a potência da proposta de referência', () => {
    expect(kwp(6, 710)).toBe(4.26);
  });

  it('reproduz a geração da proposta de referência (~500 kWh/mês)', () => {
    const g = geracaoMensal(4.26, 5.3, 0.75);
    expect(g).toBe(508);
    expect(Math.abs(g - 500)).toBeLessThan(15);
  });

  it('sugere 6 módulos para um consumo de 500 kWh/mês', () => {
    expect(sugerirModulos(500, 710, 5.3, 0.75)).toBe(6);
  });

  it('é coerente: a sugestão gera pelo menos o consumo informado', () => {
    for (const consumo of [180, 300, 480, 500, 750, 1200]) {
      const n = sugerirModulos(consumo, 710, 5.3, 0.75);
      expect(geracaoMensal(kwp(n, 710), 5.3, 0.75)).toBeGreaterThanOrEqual(consumo);
    }
  });

  it('calcula a razão CC/CA e não quebra com inversor zerado', () => {
    expect(razaoCcCa(4.26, 7.5)).toBe(0.57);
    expect(razaoCcCa(4.26, 0)).toBeNull();
  });

  it('devolve zero em vez de NaN quando falta dado', () => {
    expect(kwp(0, 710)).toBe(0);
    expect(geracaoMensal(Number.NaN, 5.3, 0.75)).toBe(0);
    expect(sugerirModulos(500, 0, 5.3, 0.75)).toBe(0);
  });
});
