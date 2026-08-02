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

  // ARMADILHA QUE ESTE REF PAGA — o painel fechava sozinho ao digitar.
  //
  // O efeito abaixo tinha `aoFechar` nas dependências, e todo chamador passa
  // uma arrow inline (`aoFechar={() => setNovo(null)}`), cuja identidade muda a
  // cada render. Digitar uma letra muda o estado do pai, o pai re-renderiza, a
  // arrow é outra, e o efeito roda de novo: a limpeza devolvia o foco ao
  // elemento anterior e a re-execução mandava para o "primeiro focável" — que
  // era o botão Fechar do cabeçalho. Na primeira barra de espaço, o botão em
  // foco era acionado e o painel fechava levando tudo junto.
  //
  // Na prática isso deixou "Nova oportunidade" e o formulário de contrato
  // inutilizáveis. Em produção não existe UM contrato — e agora sei por quê.
  //
  // O ref carrega sempre a versão mais nova da função sem entrar nas
  // dependências, então o efeito roda uma vez por abertura, como deve.
  const fecharRef = useRef(aoFechar);
  useEffect(() => { fecharRef.current = aoFechar; });

  useEffect(() => {
    focoAnterior.current = document.activeElement as HTMLElement | null;
    // O foco vai para o primeiro campo DO CORPO. Procurar no painel inteiro
    // achava o botão Fechar do cabeçalho, que vem antes no DOM — e o leitor de
    // tela anunciava "Fechar o painel, botão" ao abrir um formulário.
    const alvo = caixa.current?.querySelector<HTMLElement>(
      '.painel-corpo input:not([type="hidden"]):not([disabled]),'
      + ' .painel-corpo select:not([disabled]), .painel-corpo textarea:not([disabled])',
    );
    (alvo ?? caixa.current)?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); fecharRef.current(); return; }
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
    // Lista VAZIA de propósito: ver o comentário do `fecharRef` acima. Qualquer
    // coisa aqui dentro faz o painel se remontar enquanto a pessoa digita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
