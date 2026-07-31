import type { ReactNode } from 'react';

/**
 * Barra de busca e filtros das listas.
 *
 * As listas nasceram sem isso porque tinham três linhas em teste. Com trinta
 * propostas a rolagem já não serve, e procurar pelo cliente é o gesto mais
 * frequente de quem usa o sistema — antes mesmo de olhar status.
 */
export function BarraFiltro({
  busca, aoBuscar, placeholder, filtros, mostrando, total, aoLimpar,
}: {
  busca: string;
  aoBuscar: (v: string) => void;
  placeholder: string;
  filtros?: ReactNode;
  mostrando: number;
  total: number;
  aoLimpar?: () => void;
}) {
  const filtrando = mostrando !== total;
  return (
    <div className="barra-filtro">
      <div className="busca">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.6-3.6" />
        </svg>
        <input
          type="search"
          value={busca}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => aoBuscar(e.target.value)}
        />
      </div>
      {filtros}
      <span className="contagem">
        {filtrando ? `${mostrando} de ${total}` : `${total} ${total === 1 ? 'registro' : 'registros'}`}
      </span>
      {filtrando && aoLimpar
        ? <button className="botao discreto" onClick={aoLimpar}>Limpar</button>
        : null}
    </div>
  );
}

/**
 * Busca sem acento e sem caixa: quem procura "vitoria" tem que achar
 * "Vitória", e quem procura por CPF ou telefone digita só os números.
 */
export function normalizar(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

/** Casa o termo contra vários campos de uma vez. */
export function casa(termo: string, ...campos: unknown[]): boolean {
  const t = normalizar(termo);
  if (!t) return true;
  // Cada palavra tem que aparecer em algum campo — assim "francielle limpeza"
  // encontra a proposta certa mesmo com os termos vindo de colunas diferentes.
  const alvo = campos.map(normalizar).join(' ');
  const alvoDigitos = alvo.replace(/\D/g, '');
  return t.split(/\s+/).every((p) => (
    alvo.includes(p) || (/^\d+$/.test(p) && alvoDigitos.includes(p))
  ));
}
