// Substitui src/lib/auth.tsx SÓ na prévia: um admin fixo, sem rede.
import type { ReactNode } from 'react';

export type Papel = 'admin' | 'vendedor' | 'leitura';
export type Perfil = { id: string; nome: string; email: string; papel: Papel; ativo: boolean };

const PERFIL: Perfil = {
  id: 'u1', nome: 'Thiago Cardoso', email: 'thiago@consultegeo.com.br',
  papel: 'admin', ativo: true,
};

export function ProvedorAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const useAuth = () => ({
  pronto: true,
  sessao: { user: { id: 'u1' } } as never,
  perfil: PERFIL,
  semAcesso: false,
  pode: () => true,
  sair: async () => {},
});
