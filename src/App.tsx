import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './componentes/Layout';
import { Entrada } from './paginas/Entrada';
import { Funil } from './paginas/Funil';
import { Propostas } from './paginas/Propostas';
import { Contratos } from './paginas/Contratos';
import { Catalogo } from './paginas/Catalogo';
import { Configuracoes } from './paginas/Configuracoes';
import { PropostaPublica } from './paginas/PropostaPublica';

export function App() {
  const { pronto, sessao, perfil, semAcesso } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Rota pública: fora do controle de acesso, é o link que o cliente recebe. */}
        <Route path="/p/:token" element={<PropostaPublica />} />
        <Route path="*" element={
          !pronto ? <div className="carregando">Carregando…</div>
          : !sessao || !perfil ? <Entrada semAcesso={semAcesso} />
          : (
            <Layout>
              <Routes>
                <Route path="/crm" element={<Funil />} />
                <Route path="/propostas" element={<Propostas />} />
                <Route path="/contratos" element={<Contratos />} />
                <Route path="/catalogo" element={<Catalogo />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route path="*" element={<Navigate to="/crm" replace />} />
              </Routes>
            </Layout>
          )
        } />
      </Routes>
    </BrowserRouter>
  );
}
