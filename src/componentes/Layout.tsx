import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';

const MENU = [
  { para: '/crm', rot: 'Funil' },
  { para: '/propostas', rot: 'Propostas' },
  { para: '/contratos', rot: 'Contratos' },
  { para: '/catalogo', rot: 'Catálogo' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { perfil, pode, sair } = useAuth();
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
          {pode('config') ? <NavLink to="/configuracoes" className={({ isActive }) => (isActive ? 'ativo' : '')}>Configurações</NavLink> : null}
        </nav>
        <div className="rodape-lateral">
          <div style={{ fontWeight: 600, color: '#fff' }}>{perfil?.nome}</div>
          <div style={{ textTransform: 'capitalize' }}>{perfil?.papel}</div>
          <button className="botao discreto" style={{ color: '#D7E2F0', paddingLeft: 0, marginTop: 6 }}
                  onClick={() => void sair()}>Sair</button>
        </div>
      </aside>
      <main className="conteudo">{children}</main>
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
