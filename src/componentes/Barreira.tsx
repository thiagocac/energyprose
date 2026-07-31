import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Barreira de erro.
 *
 * Sem ela, um `throw` em qualquer render apaga a aplicação inteira e deixa a
 * tela branca — o usuário não sabe se caiu a internet, se perdeu o que digitou
 * ou se o sistema quebrou. Uma dessas telas em brancos custa mais confiança do
 * que o defeito que a causou.
 */
export class Barreira extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state: { erro: Error | null } = { erro: null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // Vai para o console do navegador, que é onde alguém vai procurar quando o
    // Thiago disser "deu erro na tela de propostas".
    console.error('Falha na interface:', erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="cartao" style={{ padding: 28, margin: 24, maxWidth: 560 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Alguma coisa quebrou nesta tela</h2>
        <p className="sub">
          O erro foi registrado no console do navegador. Recarregar costuma resolver;
          se voltar a acontecer, avise o que você estava fazendo.
        </p>
        <p className="meta" style={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
          {this.state.erro.message}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="botao" onClick={() => window.location.reload()}>Recarregar</button>
          <button className="botao secundario" onClick={() => this.setState({ erro: null })}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }
}
