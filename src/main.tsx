import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProvedorAuth } from './lib/auth';
import { App } from './App';
import './estilos.css';

const qc = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 } },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ProvedorAuth>
        <App />
      </ProvedorAuth>
    </QueryClientProvider>
  </StrictMode>,
);
