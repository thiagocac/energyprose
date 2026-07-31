import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout, Cabecalho } from './componentes/Layout';
import { Entrada } from './paginas/Entrada';
import { Funil } from './paginas/Funil';
import { Propostas } from './paginas/Propostas';
import { Catalogo } from './paginas/Catalogo';
import { Configuracoes } from './paginas/Configuracoes';
import { PropostaPublica } from './paginas/PropostaPublica';

// Telas ainda por construir — ficam explícitas em vez de sumirem do menu, para
// o caminho de navegação já ser o definitivo.
function EmBreve({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <>
      <Cabecalho kicker="Comercial" titulo={titulo} sub={sub} />
      <div className="cartao" style={{ padding: 24 }}>
        <div className="aviso info">
          Esta tela é a próxima da fila. O motor no banco já está pronto e verificado —
          falta só a interface.
        </div>
      </div>
    </>
  );
}

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
                <Route path="/contratos" element={<EmBreve titulo="Contratos" sub="Contrato gerado a partir da proposta aceita, com as cláusulas preenchidas." />} />
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
