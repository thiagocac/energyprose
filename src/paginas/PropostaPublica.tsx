import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rpc } from '../lib/supabase';
import { moeda, numero, dataBr } from '../lib/formato';

// Página que o CLIENTE abre pelo link do WhatsApp. Sem login: a autorização é o
// token, validado dentro da RPC (o role anon não enxerga nenhuma tabela).
type Publica = {
  ok: boolean; erro?: string;
  numero?: string; titulo?: string; status?: string; validade?: string;
  valor_total?: number; condicao_pagamento?: string; observacoes?: string;
  decidida_em?: string | null; comentario?: string | null;
  cliente_nome?: string; cidade?: string;
  empresa?: { nome: string; whatsapp: string; instagram: string; engenheiro: string; crea: string };
  sistema?: {
    modulo_qtd: number; modulo_descricao: string; inversor_descricao: string;
    potencia_instalada_kwp: number; geracao_media_kwh_mes: number;
    garantia_modulos_anos: number; garantia_inversor_anos: number;
  } | null;
};

export function PropostaPublica() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const [comentario, setComentario] = useState('');

  const p = useQuery({
    queryKey: ['proposta-publica', token],
    queryFn: () => rpc<Publica>('proposta_publica_ler', { p_token: token }),
    enabled: token.length > 0, retry: false,
  });

  const decidir = useMutation({
    mutationFn: (decisao: 'aceita' | 'recusada') =>
      rpc<{ ok: boolean; erro?: string }>('proposta_publica_decidir',
        { p_token: token, p_decisao: decisao, p_comentario: comentario || null }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['proposta-publica', token] }),
  });

  if (p.isLoading) return <div className="carregando">Carregando sua proposta…</div>;

  const d = p.data;
  if (p.error || !d || d.ok === false) {
    return (
      <main className="publica">
        <div className="topo"><img src="/logo-energypro-slogan.png" alt="Energy PRO" /></div>
        <div className="miolo">
          <div className="cartao" style={{ padding: 24 }}>
            <div className="aviso erro">{d?.erro ?? 'Não foi possível abrir esta proposta.'}</div>
            <p className="sub" style={{ marginTop: 14, marginBottom: 0 }}>
              Fale com a Energy PRO para receber um link novo.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const decidida = !!d.decidida_em;
  const s = d.sistema;

  return (
    <main className="publica">
      <div className="topo">
        <img src="/logo-energypro-slogan.png" alt="Energy PRO" />
        <div style={{ fontSize: 12, letterSpacing: '.16em', opacity: .75 }}>PROPOSTA COMERCIAL</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{d.numero}</div>
      </div>

      <div className="miolo">
        <div className="cartao" style={{ padding: '18px 22px', textAlign: 'center' }}>
          <div style={{ fontSize: 12.5, color: 'var(--suave)' }}>
            {d.cliente_nome}{d.cidade ? ` · ${d.cidade}` : ''}
          </div>
          <div className="preco" style={{ marginTop: 8 }}>{moeda(d.valor_total)}</div>
          {d.validade ? <div style={{ fontSize: 12.5, color: 'var(--suave)' }}>Válida até {dataBr(d.validade)}</div> : null}

          {/* Link comum, não fetch: o navegador cuida do download e o celular
              abre o PDF no visualizador nativo. O caminho é do próprio domínio
              da Energy PRO — o Netlify encaminha para a função que valida o
              token e busca o arquivo no bucket privado. */}
          <a className="botao secundario baixar-pdf"
             href={`/p/${token}/pdf`} target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="15" height="15">
              <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 20h16" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Baixar proposta em PDF
          </a>
        </div>

        {s ? (
          <div className="cartao" style={{ padding: '6px 22px 14px' }}>
            <h2 style={{ fontSize: 15, margin: '14px 0 4px' }}>Sistema proposto</h2>
            <div className="linha"><span>Módulos</span><b>{numero(s.modulo_qtd)} × {s.modulo_descricao}</b></div>
            <div className="linha"><span>Inversor</span><b>{s.inversor_descricao}</b></div>
            <div className="linha"><span>Potência instalada</span><b>{numero(s.potencia_instalada_kwp, 2)} kWp</b></div>
            <div className="linha"><span>Geração média</span><b>~ {numero(s.geracao_media_kwh_mes)} kWh/mês</b></div>
            <div className="linha">
              <span>Garantias</span>
              <b>Módulos {s.garantia_modulos_anos} anos · Inversor {s.garantia_inversor_anos} anos</b>
            </div>
          </div>
        ) : null}

        <div className="cartao" style={{ padding: 22 }}>
          {decidida ? (
            <div className={`aviso ${d.status === 'aceita' ? 'bom' : 'erro'}`}>
              {d.status === 'aceita'
                ? 'Proposta aceita. A Energy PRO já foi avisada e entra em contato para os próximos passos.'
                : 'Proposta recusada. Obrigado pelo retorno.'}
              {d.comentario ? <div style={{ marginTop: 8, fontStyle: 'italic' }}>“{d.comentario}”</div> : null}
            </div>
          ) : (
            <>
              <label className="campo">
                <span>Quer deixar uma observação? (opcional)</span>
                <textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
              </label>
              {decidir.data?.ok === false ? <div className="aviso erro" style={{ marginBottom: 12 }}>{decidir.data.erro}</div> : null}
              {decidir.error ? <div className="aviso erro" style={{ marginBottom: 12 }}>{(decidir.error as Error).message}</div> : null}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="botao secundario" disabled={decidir.isPending}
                        onClick={() => decidir.mutate('recusada')}>Recusar</button>
                <button className="botao acento" disabled={decidir.isPending}
                        onClick={() => decidir.mutate('aceita')}>
                  {decidir.isPending ? 'Registrando…' : 'Aceitar proposta'}
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--suave)', textAlign: 'center', margin: '14px 0 0' }}>
                A decisão fica registrada e não pode ser alterada depois.
              </p>
            </>
          )}
        </div>

        {d.empresa ? (
          <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--suave)' }}>
            {d.empresa.engenheiro} · {d.empresa.crea}<br />{d.empresa.instagram}
          </p>
        ) : null}
      </div>
    </main>
  );
}
