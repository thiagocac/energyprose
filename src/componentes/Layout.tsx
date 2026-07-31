import { NavLink } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { TrocarSenha } from './TrocarSenha';

const MENU = [
  { para: '/crm', rot: 'Funil' },
  { para: '/propostas', rot: 'Propostas' },
  { para: '/contratos', rot: 'Contratos' },
  { para: '/catalogo', rot: 'Catálogo' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { perfil, sessao, sair } = useAuth();
  const [trocando, setTrocando] = useState(false);
  // O e-mail vem da SESSÃO, não de `perfis`: é ele que o Supabase confere no
  // login, e as duas tabelas podem divergir sem ninguém notar.
  const email = sessao?.user?.email ?? perfil?.email ?? '';
  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <img src="/logo-energypro.png" alt="" />
          <div>
            <b>Energy PRO</b>
            <span>GESTÃO COMERCIAL</span>
          </div>
        </div>
        <nav className="nav">
          {MENU.map((m) => (
            <NavLink key={m.para} to={m.para} className={({ isActive }) => (isActive ? 'ativo' : '')}>
              {m.rot}
            </NavLink>
          ))}
          {/* Cadastros e novo cadastro seguem no painel anterior até as telas
              serem portadas. A sessão é a mesma, então a troca é transparente. */}
          <a href="/cadastros">Cadastros</a>
          <NavLink to="/configuracoes" className={({ isActive }) => (isActive ? 'ativo' : '')}>Configurações</NavLink>
        </nav>
        <div className="rodape-lateral">
          <div style={{ fontWeight: 600, color: '#fff' }}>{perfil?.nome}</div>
          <div style={{ textTransform: 'capitalize' }}>{perfil?.papel}</div>
          {/* Trocar senha mora AQUI e não em Configurações de propósito:
              Configurações é só para quem administra, e quem mais precisa
              trocar a própria senha é justamente quem vende. */}
          <div className="acoes-conta">
            {email ? (
              <button className="botao discreto" onClick={() => setTrocando(true)}>Senha</button>
            ) : null}
            <button className="botao discreto" onClick={() => void sair()}>Sair</button>
          </div>
        </div>
      </aside>
      <main className="conteudo">{children}</main>
      {trocando ? <TrocarSenha email={email} aoFechar={() => setTrocando(false)} /> : null}
    </div>
  );
}

export function Cabecalho({ kicker, titulo, sub, acao }: { kicker: string; titulo: string; sub?: string; acao?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <p className="kicker">{kicker}</p>
        <h1>{titulo}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {acao}
    </div>
  );
}
