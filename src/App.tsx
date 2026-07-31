import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout, Cabecalho } from './componentes/Layout';
import { Entrada } from './paginas/Entrada';
import { Funil } from './paginas/Funil';
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
                <Route path="/propostas" element={<EmBreve titulo="Propostas" sub="Itens do catálogo, bloco do sistema com kWp e geração calculados, PDF e envio por link." />} />
                <Route path="/contratos" element={<EmBreve titulo="Contratos" sub="Contrato gerado a partir da proposta aceita, com as cláusulas preenchidas." />} />
                <Route path="/catalogo" element={<EmBreve titulo="Catálogo" sub="Serviços vendidos e equipamentos (módulos e inversores, com suas garantias)." />} />
                <Route path="/configuracoes" element={<EmBreve titulo="Configurações" sub="Dados da empresa, prazos, HSP/PR e os textos fixos que entram na proposta." />} />
                <Route path="*" element={<Navigate to="/crm" replace />} />
              </Routes>
            </Layout>
          )
        } />
      </Routes>
    </BrowserRouter>
  );
}
