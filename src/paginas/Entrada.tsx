import { useState, type FormEvent } from 'react';
import { sb } from '../lib/supabase';

export function Entrada({ semAcesso }: { semAcesso: boolean }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function entrar(ev: FormEvent) {
    ev.preventDefault();
    setErro(''); setOcupado(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
    setOcupado(false);
  }

  return (
    <main className="entrada">
      <form className="caixa" onSubmit={entrar}>
        <img src="/logo-energypro-slogan.png" alt="Energy PRO" />
        <h1>Gestão comercial</h1>

        {semAcesso ? (
          <div className="aviso erro" style={{ marginBottom: 16 }}>
            Sua conta entrou, mas não está liberada para o sistema.
            Peça a um administrador para incluir você na equipe.
          </div>
        ) : null}

        <label className="campo">
          <span>E-mail</span>
          <input type="email" required autoComplete="username" value={email}
                 onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input type="password" required autoComplete="current-password" value={senha}
                 onChange={(e) => setSenha(e.target.value)} />
        </label>

        {erro ? <div className="aviso erro" style={{ marginBottom: 14 }}>{erro}</div> : null}

        <button className="botao" style={{ width: '100%' }} disabled={ocupado}>
          {ocupado ? 'Entrando…' : 'Entrar'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16, marginBottom: 0, fontSize: 13 }}>
          <a href="/">Voltar ao site</a>
        </p>
      </form>
    </main>
  );
}
