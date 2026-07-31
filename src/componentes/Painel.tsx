import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Painel lateral (o "gaveta" de edição).
 *
 * Os painéis nasceram como um `div` com `onClick` no fundo. Funcionava com o
 * mouse e mais nada: Esc não fechava, o Tab passeava pela página atrás, e o
 * leitor de tela nem sabia que uma caixa de diálogo tinha aberto. Quem edita
 * uma proposta inteira no teclado sente isso na primeira vez.
 */
export function Painel({ titulo, aoFechar, rodape, children }: {
  titulo: string;
  aoFechar: () => void;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const caixa = useRef<HTMLElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    focoAnterior.current = document.activeElement as HTMLElement | null;
    // O foco vai para o primeiro campo, que é onde a pessoa quer digitar.
    const alvo = caixa.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button',
    );
    alvo?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); aoFechar(); return; }
      if (e.key !== 'Tab' || !caixa.current) return;
      // Prende o Tab dentro do painel: sem isso o foco escapa para a tela de
      // trás, que está visualmente coberta e continua clicável pelo teclado.
      const focaveis = [...caixa.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }

    document.addEventListener('keydown', aoTeclar);
    // Fundo travado: rolar a lista atrás enquanto o painel está aberto faz
    // perder o lugar quando ele fecha.
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = rolagem;
      focoAnterior.current?.focus();
    };
  }, [aoFechar]);

  return (
    <div className="painel-fundo" onClick={aoFechar}>
      <aside
        className="painel"
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{titulo}</h2>
          <button className="botao discreto" onClick={aoFechar} aria-label="Fechar o painel">
            Fechar
          </button>
        </header>
        <div className="painel-corpo">{children}</div>
        {rodape ? <footer>{rodape}</footer> : null}
      </aside>
    </div>
  );
}
