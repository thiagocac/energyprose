import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './componentes/Layout';
import { Barreira } from './componentes/Barreira';
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
        <Route path="/p/:token" element={<Barreira><PropostaPublica /></Barreira>} />
        <Route path="*" element={
          !pronto ? <div className="carregando">Carregando…</div>
          : !sessao || !perfil ? <Entrada semAcesso={semAcesso} />
          : (
            <Layout>
              <Routes>
                <Route path="/crm" element={<Barreira><Funil /></Barreira>} />
                <Route path="/propostas" element={<Barreira><Propostas /></Barreira>} />
                {/* Vindo do funil: abre a lista já com esta proposta no painel,
                    para precificar sem procurar o registro na tabela. O Netlify
                    já encaminhava /propostas/* e o roteador não usava. */}
                <Route path="/propostas/:id" element={<Barreira><Propostas /></Barreira>} />
                <Route path="/contratos" element={<Barreira><Contratos /></Barreira>} />
                <Route path="/catalogo" element={<Barreira><Catalogo /></Barreira>} />
                <Route path="/configuracoes" element={<Barreira><Configuracoes /></Barreira>} />
                <Route path="*" element={<Navigate to="/crm" replace />} />
              </Routes>
            </Layout>
          )
        } />
      </Routes>
    </BrowserRouter>
  );
}
