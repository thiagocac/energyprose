import { useState } from 'react';
import { sb } from '../lib/supabase';
import { Painel } from './Painel';

// ============================================================================
// Trocar a própria senha, de dentro do painel.
//
// Antes disso o único caminho era o painel do Supabase, que só quem administra
// o projeto alcança: a vendedora não tinha como trocar a senha dela, e uma
// senha que não pode ser trocada é uma senha que nunca é trocada.
//
// Duas decisões que valem explicação:
//
// 1) A senha ATUAL é pedida mesmo o Supabase não exigindo. `updateUser` aceita
//    só a sessão — quer dizer que um notebook destravado por dois minutos basta
//    para alguém trocar a senha e tomar a conta. Conferir a atual custa uma
//    ida ao servidor e fecha essa porta.
//
// 2) Depois de trocar, as OUTRAS sessões caem. Se a senha estava vazada, quem
//    a estivesse usando continuaria dentro pelo refresh token antigo — trocar
//    a senha sem derrubar o resto é meia troca.
// ============================================================================

const MINIMO = 10;

/** Trechos que aparecem em toda lista de senha ruim, mais os desta empresa. */
const OBVIAS = ['senha', 'password', '123456', 'qwerty', 'abcdef', 'energy',
  'energypro', 'solar', 'conquista', 'admin', '000000'];

/** Gera uma senha forte de verdade: `crypto`, não `Math.random`. */
function sugerir(tamanho = 20): string {
  // Sem l/I/1 e O/0: ninguém consegue ditar isso no telefone se tiver ambíguo.
  const alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*-_=+?';
  const bytes = new Uint32Array(tamanho);
  crypto.getRandomValues(bytes);
  // Módulo com alfabeto de 68 sobre 2^32 tem viés de ~1e-8 por caractere:
  // irrelevante aqui, e o custo de rejeitar amostra não se paga.
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
}

/** Devolve o problema da senha, ou string vazia se estiver boa. */
function criticar(nova: string, atual: string, email: string): string {
  if (nova.length < MINIMO) return `A nova senha precisa de pelo menos ${MINIMO} caracteres.`;
  if (nova === atual) return 'A nova senha é igual à atual.';
  const baixa = nova.toLowerCase();
  const usuario = email.split('@')[0]?.toLowerCase() ?? '';
  if (usuario.length >= 4 && baixa.includes(usuario)) return 'A senha não pode conter o seu e-mail.';
  const achada = OBVIAS.find((o) => baixa.includes(o));
  if (achada) return `Tire o trecho “${achada}”: é dos primeiros que qualquer ataque tenta.`;
  const temLetra = /[a-zA-Z]/.test(nova);
  const temOutro = /[^a-zA-Z]/.test(nova);
  // Frase longa dispensa número e símbolo — o comprimento já faz o trabalho.
  if (nova.length < 16 && !(temLetra && temOutro)) {
    return 'Misture letras com números ou símbolos — ou use uma frase de 16 caracteres ou mais.';
  }
  return '';
}

export function TrocarSenha({ email, aoFechar }: { email: string; aoFechar: () => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [aberta, setAberta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(false);

  const critica = nova ? criticar(nova, atual, email) : '';
  const desigual = !!confirma && nova !== confirma;
  const podeSalvar = !!atual && !!nova && !critica && !desigual && nova === confirma;

  async function salvar() {
    setErro(''); setOcupado(true);
    try {
      // Passo 1: a senha atual está certa? Entrar de novo é a única forma de
      // perguntar isso ao Supabase — não existe endpoint de "confira esta
      // senha". Falhar aqui NÃO derruba a sessão que já está aberta.
      const login = await sb.auth.signInWithPassword({ email, password: atual });
      if (login.error) {
        setErro(login.error.message.includes('Invalid login credentials')
          ? 'A senha atual está incorreta.'
          : login.error.message);
        return;
      }

      const troca = await sb.auth.updateUser({ password: nova });
      if (troca.error) { setErro(troca.error.message); return; }

      // Passo 3: derrubar os outros aparelhos. Se falhar (versão de servidor
      // sem `scope`), a troca já valeu — não é motivo para mostrar erro.
      try { await sb.auth.signOut({ scope: 'others' }); } catch { /* segue */ }

      setFeito(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  if (feito) {
    return (
      <Painel titulo="Senha alterada" aoFechar={aoFechar}
              rodape={<button className="botao" onClick={aoFechar}>Fechar</button>}>
        <div className="aviso bom" style={{ marginBottom: 14 }}>
          Pronto. A senha nova já vale.
        </div>
        <p className="sub" style={{ margin: 0 }}>
          Esta janela continua conectada. Qualquer outro aparelho ou navegador que
          estivesse usando a senha antiga foi desconectado e precisará entrar de novo.
        </p>
      </Painel>
    );
  }

  return (
    <Painel
      titulo="Alterar minha senha"
      aoFechar={aoFechar}
      rodape={<>
        <button className="botao secundario" onClick={aoFechar} disabled={ocupado}>Cancelar</button>
        <button className="botao" onClick={() => void salvar()} disabled={!podeSalvar || ocupado}>
          {ocupado ? 'Alterando…' : 'Alterar senha'}
        </button>
      </>}
    >
      <p className="sub" style={{ marginTop: 0 }}>
        Conta <b>{email}</b>. A senha vale para este painel e para a tela de cadastros.
      </p>

      {erro ? <div className="aviso erro" style={{ marginBottom: 14 }}>{erro}</div> : null}

      <label className="campo">
        <span>Senha atual *</span>
        <input type="password" autoComplete="current-password" value={atual}
               onChange={(e) => setAtual(e.target.value)} />
      </label>

      {/* O botão de sugerir fica FORA do <label>: dentro, cada clique nele
          também acionava o rótulo e mexia no campo, e leitor de tela anunciava
          os dois como uma coisa só. */}
      <div className="campo">
        <span>
          <label htmlFor="senha-nova">Nova senha *</label>
          <button type="button" className="link-sugerir"
                  onClick={() => {
                    const s = sugerir();
                    setNova(s); setConfirma(s); setAberta(true);
                  }}>
            sugerir uma forte
          </button>
        </span>
        <input id="senha-nova" type={aberta ? 'text' : 'password'} autoComplete="new-password"
               value={nova} onChange={(e) => setNova(e.target.value)} />
      </div>

      <label className="campo">
        <span>Repita a nova senha *</span>
        <input type={aberta ? 'text' : 'password'} autoComplete="new-password" value={confirma}
               onChange={(e) => setConfirma(e.target.value)} />
      </label>

      <label className="marcar" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={aberta} onChange={(e) => setAberta(e.target.checked)} />
        Mostrar o que estou digitando
      </label>

      {critica ? <div className="aviso erro" style={{ marginBottom: 10 }}>{critica}</div>
        : desigual ? <div className="aviso erro" style={{ marginBottom: 10 }}>As duas não são iguais.</div>
        : podeSalvar ? <div className="aviso bom" style={{ marginBottom: 10 }}>Senha boa.</div>
        : null}

      <p className="sub" style={{ fontSize: 12.5, margin: 0 }}>
        Mínimo de {MINIMO} caracteres. Uma frase longa e fácil de lembrar —
        quatro ou cinco palavras separadas por hífen — vale mais do que trocar
        letra por símbolo numa palavra curta.
      </p>
    </Painel>
  );
}
