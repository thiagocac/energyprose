import { describe, it, expect } from 'vitest';
import { paraNumero, dataBr } from './formato';

// Este arquivo nasceu de um defeito real: "12.000" digitado no valor do
// contrato era salvo como R$ 12,00, sem erro nenhum, e o número errado ia
// impresso para assinatura. Cada linha aqui é um jeito de escrever número que
// alguém de verdade usa.
describe('paraNumero', () => {
  it('lê o jeito brasileiro completo', () => {
    expect(paraNumero('12.000,00')).toBe(12000);
    expect(paraNumero('1.234.567,89')).toBeCloseTo(1234567.89);
    expect(paraNumero('12,50')).toBe(12.5);
    expect(paraNumero('0,01')).toBe(0.01);
  });

  it('lê o milhar sem centavos — o caso que quebrava', () => {
    expect(paraNumero('12.000')).toBe(12000);
    expect(paraNumero('1.500')).toBe(1500);
    expect(paraNumero('1.234.567')).toBe(1234567);
  });

  it('não confunde decimal do banco com milhar', () => {
    expect(paraNumero('1234.56')).toBeCloseTo(1234.56);
    expect(paraNumero('5.2')).toBe(5.2);      // HSP
    expect(paraNumero('0.78')).toBe(0.78);    // PR
    expect(paraNumero('3.9')).toBe(3.9);
  });

  it('aguenta valor colado com R$ e espaço', () => {
    expect(paraNumero('R$ 12.000,00')).toBe(12000);
    expect(paraNumero(' 1.500 ')).toBe(1500);
  });

  it('devolve 0 no que não é número, sem estourar', () => {
    expect(paraNumero('')).toBe(0);
    expect(paraNumero('abc')).toBe(0);
    expect(paraNumero(null)).toBe(0);
    expect(paraNumero(undefined)).toBe(0);
    expect(paraNumero(NaN)).toBe(0);
    expect(paraNumero(Infinity)).toBe(0);
  });

  it('deixa número passar intacto', () => {
    expect(paraNumero(12000)).toBe(12000);
    expect(paraNumero(0)).toBe(0);
    expect(paraNumero(-450.5)).toBe(-450.5);
  });
});

// A página que o cliente abre imprimia "Válida até —" porque a data já vinha
// formatada da RPC e passava por aqui de novo. Estes casos guardam a fronteira.
describe('dataBr', () => {
  it('lê coluna `date` sem escorregar de fuso', () => {
    expect(dataBr('2026-08-15')).toBe('15/08/2026');
    expect(dataBr('2026-01-01')).toBe('01/01/2026');
  });

  it('não inventa data a partir de lixo', () => {
    expect(dataBr('')).toBe('—');
    expect(dataBr(null)).toBe('—');
    expect(dataBr('15/08/2026')).toBe('—');   // já formatada: não passe por aqui
  });
});
