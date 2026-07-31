import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';

// ============================================================================
// Sessão + papel. A allowlist é a tabela `perfis`, a mesma que já governa o
// painel atual: usuário do Auth sem linha em perfis (ou com ativo = false)
// enxerga zero em tudo, porque seguranca.is_equipe() devolve false.
//
// Aqui não há motor de permissões: são três papéis e um mapa fixo. O gate real
// está no banco (RLS + gates dentro das RPCs) — este `pode()` só evita mostrar
// botão que iria falhar.
// ============================================================================

export type Papel = 'admin' | 'vendedor' | 'leitura';
export type Perfil = { id: string; nome: string; email: string; papel: Papel; ativo: boolean };

const CAPACIDADES: Record<Papel, string[]> = {
  admin:    ['ver', 'escrever', 'enviar', 'converter', 'catalogo', 'config', 'equipe', 'apagar'],
  vendedor: ['ver', 'escrever', 'enviar', 'converter'],
  leitura:  ['ver'],
};

type Ctx = {
  pronto: boolean;
  sessao: Session | null;
  perfil: Perfil | null;
  semAcesso: boolean;
  pode: (capacidade: string) => boolean;
  sair: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  pronto: false, sessao: null, perfil: null, semAcesso: false,
  pode: () => false, sair: async () => {},
});

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [pronto, setPronto] = useState(false);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  useEffect(() => {
    let vivo = true;

    async function carregarPerfil(s: Session | null) {
      if (!s) { if (vivo) { setPerfil(null); setPronto(true); } return; }
      const { data } = await sb.from('perfis')
        .select('id, nome, email, papel, ativo').eq('id', s.user.id).maybeSingle();
      if (!vivo) return;
      setPerfil(data && data.ativo ? (data as Perfil) : null);
      setPronto(true);
    }

    sb.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSessao(data.session);
      void carregarPerfil(data.session);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_evento, s) => {
      if (!vivo) return;
      setSessao(s);
      setPronto(false);
      void carregarPerfil(s);
    });

    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  const valor = useMemo<Ctx>(() => ({
    pronto,
    sessao,
    perfil,
    // Entrou no Auth mas não está na allowlist: precisa de mensagem própria,
    // senão o usuário vê uma tela vazia sem entender por quê.
    semAcesso: pronto && !!sessao && !perfil,
    pode: (c) => (perfil ? CAPACIDADES[perfil.papel]?.includes(c) ?? false : false),
    sair: async () => { await sb.auth.signOut(); },
  }), [pronto, sessao, perfil]);

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
