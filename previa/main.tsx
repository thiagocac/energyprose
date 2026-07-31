import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '../src/componentes/Layout';
import { Funil } from '../src/paginas/Funil';
import { Propostas } from '../src/paginas/Propostas';
import { Catalogo } from '../src/paginas/Catalogo';
import { PropostaPublica } from '../src/paginas/PropostaPublica';
import '../src/estilos.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const tela = new URLSearchParams(location.search).get('t') ?? 'propostas';

const PAGINAS: Record<string, () => JSX.Element> = {
  funil: Funil, propostas: Propostas, catalogo: Catalogo,
};

function Conteudo() {
  if (tela === 'publica') {
    return (
      <MemoryRouter initialEntries={['/p/previa']}>
        <Routes><Route path="/p/:token" element={<PropostaPublica />} /></Routes>
      </MemoryRouter>
    );
  }
  const Pagina = PAGINAS[tela] ?? Propostas;
  return (
    <MemoryRouter initialEntries={[`/${tela}`]}>
      <Layout><Pagina /></Layout>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode><QueryClientProvider client={qc}><Conteudo /></QueryClientProvider></StrictMode>,
);
