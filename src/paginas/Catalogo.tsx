import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cabecalho } from '../componentes/Layout';
import { useAuth } from '../lib/auth';
import { moeda, numero } from '../lib/formato';
import {
  listarServicos, listarLinhas, listarEquipamentosTodos, salvarServico, salvarEquipamento,
  alternarAtivo, descreverEquipamento, type Servico, type Equipamento,
} from '../lib/api/catalogo';

const COBRANCAS = [
  ['por_projeto', 'Por projeto (valor fechado)'],
  ['por_visita', 'Por visita'],
  ['plano_anual', 'Plano anual'],
  ['mensalidade', 'Mensalidade'],
  ['avulso', 'Avulso'],
] as const;
const CATEGORIAS = [['usina', 'Usina'], ['manutencao', 'Manutenção'], ['servico', 'Serviço']] as const;
// O enum do banco não é rótulo: a tela imprimia "modulo", "inversor".
const TIPOS_EQUIP = [['modulo', 'Módulo'], ['inversor', 'Inversor'],
                     ['bateria', 'Bateria'], ['outro', 'Outro']] as const;
const rot = (lista: readonly (readonly [string, string])[], v: string) =>
  lista.find((x) => x[0] === v)?.[1] ?? v;

export function Catalogo() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<'servicos' | 'equipamentos'>('equipamentos');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [servico, setServico] = useState<Partial<Servico> | null>(null);
  const [equip, setEquip] = useState<Partial<Equipamento> | null>(null);

  const servicos = useQuery({ queryKey: ['servicos-todos'], queryFn: () => listarServicos(false) });
  const linhas = useQuery({ queryKey: ['linhas-servico'], queryFn: listarLinhas });
  const nomeLinha = (c: string | null | undefined) =>
    (linhas.data ?? []).find((l) => l.codigo === c)?.nome ?? '';
  const equipamentos = useQuery({ queryKey: ['equipamentos-todos'], queryFn: listarEquipamentosTodos });
  const escrever = pode('escrever');

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ['servicos-todos'] });
    void qc.invalidateQueries({ queryKey: ['servicos'] });
    void qc.invalidateQueries({ queryKey: ['equipamentos-todos'] });
    void qc.invalidateQueries({ queryKey: ['equipamentos'] });
  };

  const gravarServico = useMutation({
    mutationFn: () => salvarServico(servico as Servico),
    onSuccess: () => { setServico(null); setAviso('Serviço salvo.'); setErro(''); recarregar(); },
    onError: (e: Error) => setErro(e.message),
  });
  const gravarEquip = useMutation({
    mutationFn: () => salvarEquipamento(equip as Equipamento),
    onSuccess: () => { setEquip(null); setAviso('Equipamento salvo.'); setErro(''); recarregar(); },
    onError: (e: Error) => setErro(e.message),
  });
  const alternar = useMutation({
    mutationFn: (p: { tabela: 'servicos_catalogo' | 'equipamentos_catalogo'; id: string; ativo: boolean }) =>
      alternarAtivo(p.tabela, p.id, p.ativo),
    onSuccess: () => { setAviso('Situação atualizada.'); setErro(''); recarregar(); },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <>
      <Cabecalho
        kicker="Ajustes" titulo="Catálogo"
        sub="Os módulos e inversores daqui alimentam o bloco “Sistema proposto”, com as garantias já preenchidas. Os serviços viram itens da proposta."
        acao={escrever ? (
          <button className="botao" onClick={() => (aba === 'servicos'
            ? setServico({ categoria: 'servico', linha: 'projeto_eletrico', unidade: 'un', tipo_cobranca: 'avulso', preco_sugerido: 0, ativo: true })
            : setEquip({ tipo: 'modulo', ativo: true }))}>
            {aba === 'servicos' ? 'Novo serviço' : 'Novo equipamento'}
          </button>
        ) : undefined}
      />

      <div className="abas">
        <button className={aba === 'equipamentos' ? 'on' : ''} onClick={() => setAba('equipamentos')}>
          Equipamentos
        </button>
        <button className={aba === 'servicos' ? 'on' : ''} onClick={() => setAba('servicos')}>
          Serviços
        </button>
      </div>

      {erro ? <div className="aviso erro" style={{ marginBottom: 14 }}>{erro}</div> : null}
      {aviso ? <div className="aviso bom" style={{ marginBottom: 14 }}>{aviso}</div> : null}

      {aba === 'equipamentos' ? (
        equipamentos.isLoading ? <div className="carregando">Carregando…</div> : (
          <div className="cartao" style={{ overflowX: 'auto' }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Tipo</th><th>Equipamento</th><th className="dir">Potência</th>
                  <th className="dir">Garantia</th><th>Situação</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {(equipamentos.data ?? []).map((e) => (
                  <tr key={e.id} style={{ opacity: e.ativo ? 1 : 0.55 }}>
                    <td><span className="pilula">{rot(TIPOS_EQUIP, e.tipo)}</span></td>
                    <td><b>{e.fabricante}</b><div className="meta">{e.modelo}</div></td>
                    <td className="dir">
                      {e.potencia_wp ? `${numero(e.potencia_wp)} Wp` : e.potencia_kw ? `${numero(e.potencia_kw, 2)} kW` : '—'}
                    </td>
                    <td className="dir">
                      {e.garantia_produto_anos ? `${e.garantia_produto_anos} anos` : '—'}
                      {e.garantia_geracao_anos ? <div className="meta">geração {e.garantia_geracao_anos} anos</div> : null}
                    </td>
                    <td>{e.ativo ? <span className="pilula bom">ativo</span> : <span className="pilula">inativo</span>}</td>
                    <td>
                      {escrever ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="botao discreto" onClick={() => setEquip(e)}>Editar</button>
                          <button className="botao discreto" disabled={alternar.isPending}
                                  onClick={() => alternar.mutate({ tabela: 'equipamentos_catalogo', id: e.id, ativo: !e.ativo })}>
                            {e.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(equipamentos.data ?? []).length ? <p className="vazio">Nenhum equipamento cadastrado.</p> : null}
          </div>
        )
      ) : (
        servicos.isLoading ? <div className="carregando">Carregando…</div> : (
          <div className="cartao" style={{ overflowX: 'auto' }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Código</th><th>Serviço</th><th>Cobrança</th>
                  <th className="dir">Preço sugerido</th><th>Situação</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {(servicos.data ?? []).map((s) => (
                  <tr key={s.id} style={{ opacity: s.ativo ? 1 : 0.55 }}>
                    <td><b>{s.codigo}</b><div className="meta">{nomeLinha(s.linha) || rot(CATEGORIAS, s.categoria)}</div></td>
                    <td>{s.nome}{s.descricao ? <div className="meta">{s.descricao}</div> : null}</td>
                    <td>{rot(COBRANCAS, s.tipo_cobranca)}<div className="meta">por {s.unidade}</div></td>
                    <td className="dir">{s.preco_sugerido > 0 ? moeda(s.preco_sugerido) : <span className="meta">por proposta</span>}</td>
                    <td>{s.ativo ? <span className="pilula bom">ativo</span> : <span className="pilula">inativo</span>}</td>
                    <td>
                      {escrever ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="botao discreto" onClick={() => setServico(s)}>Editar</button>
                          <button className="botao discreto" disabled={alternar.isPending}
                                  onClick={() => alternar.mutate({ tabela: 'servicos_catalogo', id: s.id, ativo: !s.ativo })}>
                            {s.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ===== Equipamento ===== */}
      {equip ? (
        <div className="painel-fundo" onClick={() => setEquip(null)}>
          <aside className="painel" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{equip.id ? 'Editar equipamento' : 'Novo equipamento'}</h2>
              <button className="botao discreto" onClick={() => setEquip(null)}>Fechar</button>
            </header>
            <div className="painel-corpo">
              <div className="grade2">
                <label className="campo">
                  <span>Tipo *</span>
                  <select value={equip.tipo ?? 'modulo'}
                          onChange={(e) => setEquip({ ...equip, tipo: e.target.value as Equipamento['tipo'] })}>
                    <option value="modulo">Módulo</option>
                    <option value="inversor">Inversor</option>
                    <option value="bateria">Bateria</option>
                    <option value="outro">Outro</option>
                  </select>
                </label>
                <label className="campo">
                  <span>{equip.tipo === 'inversor' ? 'Potência (kW) *' : 'Potência (Wp) *'}</span>
                  {equip.tipo === 'inversor' ? (
                    <input type="number" step="0.01" value={equip.potencia_kw ?? ''}
                           onChange={(e) => setEquip({ ...equip, potencia_kw: Number(e.target.value) })} />
                  ) : (
                    <input type="number" value={equip.potencia_wp ?? ''}
                           onChange={(e) => setEquip({ ...equip, potencia_wp: Number(e.target.value) })} />
                  )}
                </label>
                <label className="campo">
                  <span>Fabricante *</span>
                  <input value={equip.fabricante ?? ''} placeholder="OSDA Solar"
                         onChange={(e) => setEquip({ ...equip, fabricante: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Modelo *</span>
                  <input value={equip.modelo ?? ''} placeholder="ODA-710N"
                         onChange={(e) => setEquip({ ...equip, modelo: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Garantia do produto (anos)</span>
                  <input type="number" value={equip.garantia_produto_anos ?? ''}
                         onChange={(e) => setEquip({ ...equip, garantia_produto_anos: Number(e.target.value) })} />
                </label>
                {equip.tipo === 'modulo' ? (
                  <label className="campo">
                    <span>Garantia de geração (anos)</span>
                    <input type="number" value={equip.garantia_geracao_anos ?? ''}
                           onChange={(e) => setEquip({ ...equip, garantia_geracao_anos: Number(e.target.value) })} />
                  </label>
                ) : null}
              </div>
              <div className="aviso info">
                Na proposta vai aparecer como <b>{equip.fabricante && equip.modelo
                  ? descreverEquipamento(equip as Equipamento) : '…'}</b>, e a garantia entra
                automaticamente no quadro do sistema.
              </div>
            </div>
            <footer>
              <button className="botao secundario" onClick={() => setEquip(null)}>Cancelar</button>
              <button className="botao" disabled={gravarEquip.isPending} onClick={() => gravarEquip.mutate()}>
                {gravarEquip.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}

      {/* ===== Serviço ===== */}
      {servico ? (
        <div className="painel-fundo" onClick={() => setServico(null)}>
          <aside className="painel" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{servico.id ? 'Editar serviço' : 'Novo serviço'}</h2>
              <button className="botao discreto" onClick={() => setServico(null)}>Fechar</button>
            </header>
            <div className="painel-corpo">
              <div className="grade2">
                <label className="campo">
                  <span>Código *</span>
                  <input value={servico.codigo ?? ''} placeholder="MANUT-ANUAL" disabled={!!servico.id}
                         onChange={(e) => setServico({ ...servico, codigo: e.target.value })} />
                  {servico.id ? <small style={{ color: 'var(--suave)', fontSize: 11.5 }}>
                    O código não muda depois de usado numa proposta.
                  </small> : null}
                </label>
                <label className="campo">
                  <span>Categoria</span>
                  <select value={servico.categoria ?? 'servico'}
                          onChange={(e) => setServico({ ...servico, categoria: e.target.value })}>
                    {CATEGORIAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                </label>
                <label className="campo">
                  <span>Linha de serviço</span>
                  <select value={servico.linha ?? ''}
                          onChange={(e) => setServico({ ...servico, linha: e.target.value || null })}>
                    <option value="">Sem linha</option>
                    {(linhas.data ?? []).map((l) => <option key={l.codigo} value={l.codigo}>{l.nome}</option>)}
                  </select>
                </label>
                <label className="campo" style={{ gridColumn: '1 / -1' }}>
                  <span>Nome *</span>
                  <input value={servico.nome ?? ''} onChange={(e) => setServico({ ...servico, nome: e.target.value })} />
                </label>
                <label className="campo" style={{ gridColumn: '1 / -1' }}>
                  <span>Descrição</span>
                  <input value={servico.descricao ?? ''} onChange={(e) => setServico({ ...servico, descricao: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Forma de cobrança</span>
                  <select value={servico.tipo_cobranca ?? 'avulso'}
                          onChange={(e) => setServico({ ...servico, tipo_cobranca: e.target.value })}>
                    {COBRANCAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                </label>
                <label className="campo">
                  <span>Unidade</span>
                  <input value={servico.unidade ?? 'un'} placeholder="un · visita · mês · ano"
                         onChange={(e) => setServico({ ...servico, unidade: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Preço sugerido</span>
                  <input type="number" step="0.01" value={servico.preco_sugerido ?? 0}
                         onChange={(e) => setServico({ ...servico, preco_sugerido: Number(e.target.value) })} />
                  <small style={{ color: 'var(--suave)', fontSize: 11.5 }}>
                    Zero = o preço é definido em cada proposta (caso da usina).
                  </small>
                </label>
                <label className="campo">
                  <span>Situação</span>
                  <select value={servico.ativo === false ? 'nao' : 'sim'}
                          onChange={(e) => setServico({ ...servico, ativo: e.target.value === 'sim' })}>
                    <option value="sim">Ativo — aparece nas propostas</option>
                    <option value="nao">Inativo</option>
                  </select>
                </label>
              </div>
            </div>
            <footer>
              <button className="botao secundario" onClick={() => setServico(null)}>Cancelar</button>
              <button className="botao" disabled={gravarServico.isPending} onClick={() => gravarServico.mutate()}>
                {gravarServico.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </>
  );
}
