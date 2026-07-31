import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cabecalho } from '../componentes/Layout';
import { useAuth } from '../lib/auth';
import { fone } from '../lib/formato';
import {
  obterConfiguracao, salvarConfiguracao, ICONES,
  type Configuracao as Cfg, lacunasDaEmpresa,
} from '../lib/api/configuracao';

export function Configuracoes() {
  const { pode } = useAuth();
  const [c, setC] = useState<Cfg | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  const q = useQuery({ queryKey: ['configuracao'], queryFn: obterConfiguracao });
  useEffect(() => { if (q.data) setC(q.data); }, [q.data]);

  const admin = pode('config');
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setC((x) => (x ? { ...x, [k]: v } : x));

  async function salvar() {
    if (!c) return;
    setSalvando(true); setErro(''); setAviso('');
    try {
      await salvarConfiguracao(c);
      setAviso('Configuração salva. As próximas propostas já saem com estes dados.');
    } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }

  if (q.isLoading) return <div className="carregando">Carregando…</div>;
  if (q.error) return <div className="aviso erro">{(q.error as Error).message}</div>;
  if (!c) return null;

  return (
    <>
      <Cabecalho
        kicker="Ajustes" titulo="Configurações"
        sub="Tudo o que é fixo na proposta mora aqui. Mudar um texto ou um prazo nesta tela vale para as próximas propostas — não precisa de publicação."
        acao={admin ? (
          <button className="botao" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar tudo'}
          </button>
        ) : undefined}
      />

      {!admin ? (
        <div className="aviso info" style={{ marginBottom: 16 }}>
          Você pode ver estes dados, mas só um administrador pode alterá-los.
        </div>
      ) : null}
      {erro ? <div className="aviso erro" style={{ marginBottom: 14 }}>{erro}</div> : null}
      {aviso ? <div className="aviso bom" style={{ marginBottom: 14 }}>{aviso}</div> : null}

      {/* O contrato imprime "—" no lugar de cada campo em branco. Melhor
          descobrir aqui do que na hora de mandar o cliente assinar. */}
      {lacunasDaEmpresa(c).length ? (
        <div className="aviso erro" style={{ marginBottom: 14 }}>
          O contrato sai com “—” no lugar de: <b>{lacunasDaEmpresa(c).join(', ')}</b>.
          Preencha antes de emitir o primeiro contrato de verdade.
        </div>
      ) : null}

      <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
        <Secao titulo="Empresa" nota="Aparece no rodapé da proposta e no contrato.">
          <div className="grade2">
            <Campo rot="Nome de exibição" val={c.nome_exibicao} on={(v) => set('nome_exibicao', v)} />
            <Campo rot="Razão social" val={c.razao_social ?? ''} on={(v) => set('razao_social', v)} />
            <Campo rot="CNPJ" val={c.cnpj ?? ''} on={(v) => set('cnpj', v)} />
            <Campo rot="E-mail comercial" val={c.email_comercial ?? ''} on={(v) => set('email_comercial', v)} />
            <Campo rot="Endereço" val={c.endereco ?? ''} on={(v) => set('endereco', v)} />
            <Campo rot="Cidade" val={c.cidade ?? ''} on={(v) => set('cidade', v)} />
            <Campo rot="UF" val={c.uf ?? ''} on={(v) => set('uf', v.toUpperCase().slice(0, 2))} />
            <Campo rot="WhatsApp (só números, com DDD)" val={c.whatsapp ?? ''}
                   dica={c.whatsapp ? `Vai sair como ${fone(c.whatsapp)} e no QR Code` : 'Ex.: 5577999139300'}
                   on={(v) => set('whatsapp', v)} />
            <Campo rot="Instagram" val={c.instagram ?? ''} on={(v) => set('instagram', v)} />
          </div>
        </Secao>

        <Secao titulo="Responsável técnico" nota="Assina a proposta e o contrato.">
          <div className="grade2">
            <Campo rot="Nome" val={c.engenheiro_nome ?? ''} on={(v) => set('engenheiro_nome', v)} />
            <Campo rot="Título" val={c.engenheiro_titulo ?? ''} on={(v) => set('engenheiro_titulo', v)} />
            <Campo rot="CREA" val={c.engenheiro_crea ?? ''} on={(v) => set('engenheiro_crea', v)} />
          </div>
        </Secao>

        <Secao titulo="Prazos e cálculo"
               nota="HSP e PR são o que transforma potência em geração estimada. Ficam gravados em cada proposta, então mudar aqui não altera propostas já feitas.">
          <div className="grade2">
            <Num rot="Validade da proposta (dias)" val={c.validade_proposta_dias} on={(v) => set('validade_proposta_dias', v)} />
            <Num rot="Cobrar retorno após (dias)" val={c.dias_followup}
                 dica="Depois desse prazo sem resposta, a proposta aparece marcada como “cobrar” e vira tarefa no funil."
                 on={(v) => set('dias_followup', v)} />
            <Num rot="Garantia da instalação (meses)" val={c.garantia_instalacao_meses} on={(v) => set('garantia_instalacao_meses', v)} />
            <Num rot="Entrega — mínimo (dias)" val={c.prazo_entrega_min_dias} on={(v) => set('prazo_entrega_min_dias', v)} />
            <Num rot="Entrega — máximo (dias)" val={c.prazo_entrega_max_dias} on={(v) => set('prazo_entrega_max_dias', v)} />
            <Num rot="HSP — horas de sol pleno" val={c.hsp_default} passo={0.1}
                 dica="Média da região. Vitória da Conquista ≈ 5,3" on={(v) => set('hsp_default', v)} />
            <Num rot="PR — rendimento do sistema" val={c.pr_default} passo={0.01}
                 dica="Perdas de cabo, temperatura, sujeira. Usual: 0,75 a 0,80" on={(v) => set('pr_default', v)} />
            <Num rot="Economia máxima anunciada (%)" val={c.economia_max_pct} on={(v) => set('economia_max_pct', v)} />
          </div>
        </Secao>

        <Secao titulo="Benefícios" nota="Card do lado direito da proposta. Cabem 6 linhas — o PDF corta o que passar disso.">
          <ListaEditavel
            itens={c.beneficios}
            onChange={(v) => set('beneficios', v)}
            teto={6}
            novo={() => ({ icone: 'star', titulo: '', sub: '' })}
            colunas={[
              { chave: 'titulo', rot: 'Título', larg: '1fr' },
              { chave: 'sub', rot: 'Complemento', larg: '1fr' },
            ]}
          />
        </Secao>

        <Secao titulo="O que está incluso" nota="Grade de ícones da proposta: 5 por fileira, até 4 fileiras. O PDF corta o que passar de 20.">
          <ListaEditavel
            itens={c.itens_inclusos}
            onChange={(v) => set('itens_inclusos', v)}
            teto={20}
            novo={() => ({ icone: 'checkCircle', texto: '' })}
            colunas={[{ chave: 'texto', rot: 'Texto (em caixa alta)', larg: '2fr' }]}
          />
        </Secao>

        <Secao titulo="Condições de pagamento" nota="Bloco Investimento, abaixo do valor. Cabem 5 linhas.">
          <ListaEditavel
            itens={c.condicoes_pagamento}
            onChange={(v) => set('condicoes_pagamento', v)}
            teto={5}
            novo={() => ({ icone: 'money', titulo: '', detalhe: '' })}
            colunas={[
              { chave: 'titulo', rot: 'Título', larg: '1fr' },
              { chave: 'detalhe', rot: 'Detalhe', larg: '1fr' },
            ]}
          />
        </Secao>

        <Secao titulo="Faixa final" nota="Última linha da proposta.">
          <label className="campo">
            <span>Frase de rodapé</span>
            <input value={c.nota_rodape ?? ''} onChange={(e) => set('nota_rodape', e.target.value)} />
          </label>
        </Secao>

        {admin ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="botao" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? 'Salvando…' : 'Salvar tudo'}
            </button>
          </div>
        ) : null}
      </fieldset>
    </>
  );
}

// ===== Peças =====
function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="cartao" style={{ padding: '18px 22px', marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 3px', fontWeight: 600 }}>{titulo}</h2>
      {nota ? <p className="sub" style={{ fontSize: 12.5, marginBottom: 16 }}>{nota}</p> : <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}

function Campo({ rot, val, on, dica }: { rot: string; val: string; on: (v: string) => void; dica?: string }) {
  return (
    <label className="campo">
      <span>{rot}</span>
      <input value={val} onChange={(e) => on(e.target.value)} />
      {dica ? <small style={{ color: 'var(--suave)', fontSize: 11.5 }}>{dica}</small> : null}
    </label>
  );
}

function Num({ rot, val, on, passo = 1, dica }: { rot: string; val: number; on: (v: number) => void; passo?: number; dica?: string }) {
  return (
    <label className="campo">
      <span>{rot}</span>
      <input type="number" step={passo} value={val} onChange={(e) => on(Number(e.target.value))} />
      {dica ? <small style={{ color: 'var(--suave)', fontSize: 11.5 }}>{dica}</small> : null}
    </label>
  );
}

type Linha = Record<string, string>;

/** Editor das listas que viram blocos do PDF: ícone + campos + ordem. */
function ListaEditavel<T extends Linha>({ itens, onChange, novo, colunas, teto }: {
  itens: T[]; onChange: (v: T[]) => void; novo: () => T;
  colunas: Array<{ chave: keyof T & string; rot: string; larg: string }>;
  /** Quantas linhas o card da proposta imprime. Acima disso, o PDF corta. */
  teto: number;
}) {
  const patch = (i: number, chave: string, v: string) =>
    onChange(itens.map((it, k) => (k === i ? { ...it, [chave]: v } : it)));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= itens.length) return;
    const copia = [...itens];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onChange(copia);
  };
  const grid = `120px ${colunas.map((c) => c.larg).join(' ')} 78px`;
  const excedente = itens.length - teto;

  return (
    <>
      {excedente > 0 ? (
        <div className="aviso erro" style={{ marginBottom: 10 }}>
          O card da proposta imprime {teto} {teto === 1 ? 'linha' : 'linhas'}.
          {' '}{excedente === 1 ? 'A última não vai sair' : `As últimas ${excedente} não vão sair`} no PDF.
        </div>
      ) : null}
      <div className="lista-cab" style={{ gridTemplateColumns: grid }}>
        <span>Ícone</span>
        {colunas.map((c) => <span key={c.chave}>{c.rot}</span>)}
        <span />
      </div>
      {itens.map((it, i) => (
        <div key={i} className="lista-linha" style={{ gridTemplateColumns: grid }}>
          <select value={it.icone} onChange={(e) => patch(i, 'icone', e.target.value)}>
            {ICONES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {colunas.map((c) => (
            <input key={c.chave} value={it[c.chave] ?? ''} onChange={(e) => patch(i, c.chave, e.target.value)} />
          ))}
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="botao discreto" title="Subir" onClick={() => mover(i, -1)}>↑</button>
            <button className="botao discreto" title="Descer" onClick={() => mover(i, 1)}>↓</button>
            <button className="botao discreto" title="Remover" style={{ color: 'var(--ruim)' }}
                    onClick={() => onChange(itens.filter((_, k) => k !== i))}>×</button>
          </div>
        </div>
      ))}
      <button className="botao secundario" style={{ marginTop: 8 }} onClick={() => onChange([...itens, novo()])}>
        Adicionar linha
      </button>
      <p className="meta" style={{ marginTop: 8, fontSize: 11.5, color: 'var(--suave)' }}>
        {itens.length} linha{itens.length === 1 ? '' : 's'}. A ordem aqui é a ordem no PDF.
      </p>
    </>
  );
}
