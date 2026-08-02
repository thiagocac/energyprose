// ============================================================================
// Dados de mentira para a PRÉVIA visual. Nada aqui vai para o bundle publicado:
// esta pasta só é lida pelo vite.config.previa.ts.
//
// Os nomes e números são inventados de propósito — a prévia nunca toca o banco
// de produção, e o container não alcança supabase.co de qualquer forma.
// ============================================================================

const hoje = new Date('2026-07-31T12:00:00-03:00');
const dias = (n: number) => new Date(hoje.getTime() - n * 864e5).toISOString();

export const CADASTROS = [
  {
    id: 'c1', nome: 'Marcos Vinícius Andrade', cidade: 'Vitória da Conquista', uf: 'BA',
    consumo_medio_kwh: 780, valor_medio_conta: 812.4, tipo_telhado: 'ceramico', zona: 'urbana',
    whatsapp: '77988112233', email: 'marcos@exemplo.com.br',
    concessionaria: 'Neoenergia Coelba', numero_instalacao: '3009182741',
    kit_descricao: '12 módulos 610 Wp + inversor 6 kW', valor_proposta: 41800,
  },
  {
    id: 'c2', nome: 'Padaria Pão da Serra Ltda', cidade: 'Barra do Choça', uf: 'BA',
    consumo_medio_kwh: 2140, valor_medio_conta: 2380, tipo_telhado: 'metalico', zona: 'urbana',
    whatsapp: '77991445566', email: null,
    concessionaria: 'Neoenergia Coelba', numero_instalacao: null,
    kit_descricao: null, valor_proposta: null,
  },
  {
    id: 'c3', nome: 'Fazenda Santa Luzia', cidade: 'Planalto', uf: 'BA',
    consumo_medio_kwh: 1490, valor_medio_conta: 1610, tipo_telhado: 'solo', zona: 'rural',
    whatsapp: null, email: 'contato@santaluzia.com.br',
    concessionaria: null, numero_instalacao: null, kit_descricao: null, valor_proposta: null,
  },
];

/** Uma linha por situação de acompanhamento — é o que a prévia precisa exercitar. */
export const PROPOSTAS = [
  { // respondida COM recado — o item 1 da lista
    id: 'p1', numero: 'PRO-2026-0031', revision: 1, tipo: 'usina', linha: 'usina_fotovoltaica',
    titulo: 'Usina solar 7,32 kWp', validade: '2026-08-14', status: 'recusada',
    valor_total: 38900, cadastro_id: 'c1', contrato_id: null,
    followup_at: dias(2), sent_at: dias(9), pdf_path: 'propostas/p1.pdf',
    public_first_view_at: dias(8), public_last_view_at: dias(3), public_views: 4,
    response_comment: 'Achei o valor acima do que eu tinha em mãos. Consegue parcelar em 12x sem juros?',
    public_action_at: dias(1),
    cadastros: { nome: 'Marcos Vinícius Andrade', cidade: 'Vitória da Conquista' },
    proposta_sistema: { potencia_instalada_kwp: 7.32, modulo_qtd: 12 },
  },
  { // recusada, para a taxa de aceite ter denominador
    id: 'p6', numero: 'PRO-2026-0022', revision: 0, tipo: 'usina', linha: 'usina_fotovoltaica',
    titulo: 'Usina solar 9,15 kWp', validade: '2026-07-20', status: 'recusada',
    valor_total: 47600, cadastro_id: 'c3', contrato_id: null,
    followup_at: null, sent_at: dias(30), pdf_path: 'propostas/p6.pdf',
    public_first_view_at: dias(29), public_last_view_at: dias(28), public_views: 2,
    response_comment: null, public_action_at: dias(27),
    cadastros: { nome: 'Fazenda Santa Luzia', cidade: 'Planalto' },
    proposta_sistema: { potencia_instalada_kwp: 9.15, modulo_qtd: 15 },
  },
  { // respondida SEM recado
    id: 'p2', numero: 'PRO-2026-0029', revision: 0, tipo: 'usina', linha: 'usina_fotovoltaica',
    titulo: 'Usina solar 24,4 kWp', validade: '2026-08-09', status: 'aceita',
    valor_total: 118400, cadastro_id: 'c2', contrato_id: null,
    followup_at: null, sent_at: dias(16), pdf_path: 'propostas/p2.pdf',
    public_first_view_at: dias(15), public_last_view_at: dias(14), public_views: 2,
    response_comment: null, public_action_at: dias(13),
    cadastros: { nome: 'Padaria Pão da Serra Ltda', cidade: 'Barra do Choça' },
    proposta_sistema: { potencia_instalada_kwp: 24.4, modulo_qtd: 40 },
  },
  { // aberta e sem responder
    recipient_whatsapp: null, recipient_email: 'contato@santaluzia.com.br',
    recipient_name: 'Fazenda Santa Luzia', itens: [], sistema: null,
    id: 'p3', numero: 'PRO-2026-0034', revision: 0, tipo: 'servico', linha: 'homologacao',
    titulo: 'Homologação junto à concessionária', validade: '2026-08-20', status: 'enviada',
    valor_total: 2400, cadastro_id: 'c3', contrato_id: null,
    followup_at: dias(1), sent_at: dias(6), pdf_path: 'propostas/p3.pdf',
    public_first_view_at: dias(5), public_last_view_at: dias(2), public_views: 3,
    response_comment: null, public_action_at: null,
    cadastros: { nome: 'Fazenda Santa Luzia', cidade: 'Planalto' },
    proposta_sistema: null,
  },
  { // enviada e nunca aberta
    id: 'p4', numero: 'PRO-2026-0035', revision: 0, tipo: 'servico', linha: 'lavagem_modulos',
    titulo: 'Lavagem técnica de módulos', validade: '2026-08-22', status: 'enviada',
    valor_total: 1850, cadastro_id: 'c2', contrato_id: null,
    followup_at: dias(-2), sent_at: dias(4), pdf_path: null,
    public_first_view_at: null, public_last_view_at: null, public_views: 0,
    response_comment: null, public_action_at: null,
    cadastros: { nome: 'Padaria Pão da Serra Ltda', cidade: 'Barra do Choça' },
    proposta_sistema: null,
  },
  { // rascunho
    id: 'p5', numero: null, revision: 0, tipo: 'servico', linha: 'projeto_eletrico',
    titulo: 'Projeto elétrico predial', validade: '2026-08-28', status: 'rascunho',
    valor_total: 3200, cadastro_id: 'c1', contrato_id: null,
    followup_at: null, sent_at: null, pdf_path: null,
    public_first_view_at: null, public_last_view_at: null, public_views: 0,
    response_comment: null, public_action_at: null,
    cadastros: { nome: 'Marcos Vinícius Andrade', cidade: 'Vitória da Conquista' },
    proposta_sistema: null,
  },
];

export const LINHAS = [
  { codigo: 'usina_fotovoltaica', nome: 'Usina Solar — Sistema Fotovoltaico', apelido: 'Usina Solar',
    descricao: 'Geração própria conectada à rede.', documento: 'usina', contrato_tipo: 'usina', ordem: 1 },
  { codigo: 'projeto_eletrico', nome: 'Projeto Elétrico', apelido: null,
    descricao: 'Projeto e ART de instalações elétricas.', documento: 'servico', contrato_tipo: null, ordem: 2 },
  { codigo: 'homologacao', nome: 'Homologação junto à Concessionária', apelido: 'Homologação',
    descricao: 'Parecer de acesso e vistoria.', documento: 'servico', contrato_tipo: null, ordem: 3 },
  { codigo: 'lavagem_modulos', nome: 'Lavagem Técnica de Módulos', apelido: 'Lavagem', descricao: 'Limpeza especializada.',
    documento: 'servico', contrato_tipo: 'manutencao', ordem: 4 },
];

export const EQUIPAMENTOS = [
  { id: 'e1', tipo: 'modulo', fabricante: 'Canadian Solar', modelo: 'CS7L-610MS',
    potencia_wp: 610, potencia_kw: null, garantia_produto_anos: 12, garantia_geracao_anos: 25, ativo: true },
  { id: 'e2', tipo: 'inversor', fabricante: 'Growatt', modelo: 'MIN 6000TL-X',
    potencia_wp: null, potencia_kw: 6, garantia_produto_anos: 10, garantia_geracao_anos: null, ativo: true },
  { id: 'e3', tipo: 'bateria', fabricante: 'BYD', modelo: 'Battery-Box HVM 11.0',
    potencia_wp: null, potencia_kw: 11, garantia_produto_anos: 10, garantia_geracao_anos: null, ativo: true },
  { id: 'e4', tipo: 'outro', fabricante: 'Intelbras', modelo: 'String Box CC 2E/2S',
    potencia_wp: null, potencia_kw: null, garantia_produto_anos: 2, garantia_geracao_anos: null, ativo: false },
];

export const SERVICOS = [
  { id: 's1', codigo: 'USI-KIT', nome: 'Fornecimento de kit fotovoltaico', descricao: 'Módulos, inversor e proteções.',
    categoria: 'usina', linha: 'usina_fotovoltaica', unidade: 'kit', tipo_cobranca: 'avulso', preco_sugerido: 24800, ativo: true },
  { id: 's2', codigo: 'HOM-PAD', nome: 'Homologação padrão até 10 kWp', descricao: 'Parecer de acesso e vistoria.',
    categoria: 'servico', linha: 'homologacao', unidade: 'serviço', tipo_cobranca: 'avulso', preco_sugerido: 2400, ativo: true },
  { id: 's3', codigo: 'LAV-MOD', nome: 'Lavagem técnica por módulo', descricao: 'Água deionizada e escova macia.',
    categoria: 'manutencao', linha: 'lavagem_modulos', unidade: 'módulo', tipo_cobranca: 'mensal', preco_sugerido: 38, ativo: true },
];

export const CONFIG = {
  validade_proposta_dias: 15, hsp_default: 5.2, pr_default: 0.78,
  prazo_entrega_min_dias: 30, prazo_entrega_max_dias: 60,
  nome_exibicao: 'Energy PRO', whatsapp: '77999887766',
  instagram: '@energyprose', engenheiro_nome: 'Eng. Thiago Cardoso', engenheiro_crea: 'CREA-BA 00000000',
};

/** crm_snapshot */
export const FUNIL = {
  pipeline_id: 'pl1',
  pipelines: [{ id: 'pl1', nome: 'Comercial', padrao: true }],
  stages: [
    { id: 'st1', key: 'novo', nome: 'Novo', ordem: 1, probability: 10, color: null, won: false, lost: false },
    { id: 'st2', key: 'contato', nome: 'Em contato', ordem: 2, probability: 25, color: null, won: false, lost: false },
    { id: 'st3', key: 'visita', nome: 'Visita técnica', ordem: 3, probability: 45, color: null, won: false, lost: false },
    { id: 'st4', key: 'proposta', nome: 'Proposta enviada', ordem: 4, probability: 70, color: null, won: false, lost: false },
    { id: 'st5', key: 'ganho', nome: 'Fechado', ordem: 5, probability: 100, color: null, won: true, lost: false },
    { id: 'st6', key: 'perdido', nome: 'Perdido', ordem: 6, probability: 0, color: null, won: false, lost: true },
  ],
  leads: [
    { id: 'l1', pipeline_id: 'pl1', stage_id: 'st1', title: 'Marcos Vinícius — residencial 780 kWh',
      contact_name: 'Marcos Vinícius Andrade', email: null, phone: '77988112233', source: 'site',
      expected_value: 38900, probability: 10, cadastro_id: 'c1', next_action_at: dias(-1),
      last_contact_at: dias(3), lost_reason: null, created_at: dias(4), updated_at: dias(1),
      cidade: 'Vitória da Conquista', uf: 'BA', consumo_medio_kwh: 780, valor_medio_conta: 812.4,
      cadastro_status: 'novo', proposta_id: 'p1' },
    { id: 'l2', pipeline_id: 'pl1', stage_id: 'st2', title: 'Padaria Pão da Serra — comercial',
      contact_name: 'Dona Ivone', email: null, phone: '77991445566', source: 'indicacao',
      expected_value: 118400, probability: 25, cadastro_id: 'c2', next_action_at: dias(-3),
      last_contact_at: dias(6), lost_reason: null, created_at: dias(12), updated_at: dias(2),
      cidade: 'Barra do Choça', uf: 'BA', consumo_medio_kwh: 2140, valor_medio_conta: 2380,
      cadastro_status: 'qualificado', proposta_id: null },
    { id: 'l3', pipeline_id: 'pl1', stage_id: 'st3', title: 'Fazenda Santa Luzia — irrigação',
      contact_name: 'Sr. Antônio', email: null, phone: null, source: 'whatsapp',
      expected_value: 74000, probability: 45, cadastro_id: 'c3', next_action_at: null,
      last_contact_at: dias(2), lost_reason: null, created_at: dias(20), updated_at: dias(2),
      cidade: 'Planalto', uf: 'BA', consumo_medio_kwh: 1490, valor_medio_conta: 1610,
      cadastro_status: 'qualificado', proposta_id: null },
    { id: 'l4', pipeline_id: 'pl1', stage_id: 'st4', title: 'Mercadinho do Bairro — 12 kWp',
      contact_name: 'Cleber', email: null, phone: '77998001122', source: 'site',
      expected_value: 52300, probability: 70, cadastro_id: null, next_action_at: dias(-5),
      last_contact_at: dias(8), lost_reason: null, created_at: dias(26), updated_at: dias(5),
      cidade: 'Vitória da Conquista', uf: 'BA', consumo_medio_kwh: null, valor_medio_conta: null,
      cadastro_status: null, proposta_id: null },
    { id: 'l5', pipeline_id: 'pl1', stage_id: 'st5', title: 'Clínica Vida — 18 kWp',
      contact_name: 'Dra. Helena', email: null, phone: null, source: 'indicacao',
      expected_value: 96500, probability: 100, cadastro_id: null, next_action_at: null,
      last_contact_at: dias(10), lost_reason: null, created_at: dias(40), updated_at: dias(9),
      cidade: 'Vitória da Conquista', uf: 'BA', consumo_medio_kwh: null, valor_medio_conta: null,
      cadastro_status: null, proposta_id: null },
    { id: 'l6', pipeline_id: 'pl1', stage_id: 'st6', title: 'Sítio Boa Vista — 9 kWp',
      contact_name: 'Seu Joaquim', email: null, phone: '77997654321', source: 'site',
      expected_value: 44200, probability: 0, cadastro_id: null, next_action_at: null,
      last_contact_at: dias(21), lost_reason: 'Fechou com a concorrência — R$ 6 mil mais barato',
      created_at: dias(55), updated_at: dias(20),
      cidade: 'Barra do Choça', uf: 'BA', consumo_medio_kwh: null, valor_medio_conta: null,
      cadastro_status: null, proposta_id: null },
    { id: 'l7', pipeline_id: 'pl1', stage_id: 'st6', title: 'Mercearia Central — 6 kWp',
      contact_name: 'Rita', email: null, phone: null, source: 'Indicação',
      expected_value: 31000, probability: 0, cadastro_id: null, next_action_at: null,
      last_contact_at: dias(35), lost_reason: 'Achou o preço alto',
      created_at: dias(70), updated_at: dias(34),
      cidade: 'Vitória da Conquista', uf: 'BA', consumo_medio_kwh: null, valor_medio_conta: null,
      cadastro_status: null, proposta_id: null },
    { id: 'l8', pipeline_id: 'pl1', stage_id: 'st6', title: 'Oficina do Zé — 4 kWp',
      contact_name: 'Zé', email: null, phone: null, source: 'Placa na obra',
      expected_value: 22400, probability: 0, cadastro_id: null, next_action_at: null,
      last_contact_at: dias(48), lost_reason: 'Achou o preço alto',
      created_at: dias(80), updated_at: dias(47),
      cidade: 'Planalto', uf: 'BA', consumo_medio_kwh: null, valor_medio_conta: null,
      cadastro_status: null, proposta_id: null },
  ],
  activities: [
    { id: 'a1', lead_id: 'l1', activity_type: 'ligacao', subject: 'Retornar sobre parcelamento',
      detail: null, due_at: dias(-1), created_at: dias(3) },
    { id: 'a2', lead_id: 'l2', activity_type: 'visita', subject: 'Medir telhado',
      detail: null, due_at: dias(-3), created_at: dias(6) },
  ],
  kpis: {
    open: 5, pipeline_value: 380100, weighted_value: 214835,
    overdue_actions: 3, ganhos_mes: 96500, novos_7d: 2,
  },
};

/** proposta_publica_ler */
export const PUBLICA = {
  ok: true,
  numero: 'PRO-2026-0031', titulo: 'Usina solar 7,32 kWp', status: 'enviada',
  validade: '14/08/2026', valor_total: 38900,
  condicao_pagamento: 'Entrada de 30% na assinatura e o restante em até 12x no cartão, '
    + 'ou financiamento em até 72 meses com carência de 90 dias (sujeito a aprovação).',
  observacoes: 'Prazo de execução: 30 a 60 dias após aprovação do projeto pela concessionária.\n'
    + 'Inclui projeto, ART, homologação e monitoramento por aplicativo.',
  decidida_em: null, comentario: null, tem_pdf: true,
  cliente_nome: 'Marcos Vinícius Andrade', cidade: 'Vitória da Conquista',
  empresa: { nome: 'Energy PRO', whatsapp: '77999887766', instagram: '@energyprose',
             engenheiro: 'Eng. Thiago Cardoso', crea: 'CREA-BA 00000000' },
  sistema: {
    modulo_qtd: 12, modulo_descricao: 'Canadian Solar CS7L-610MS 610 Wp',
    inversor_descricao: 'Growatt MIN 6000TL-X 6 kW',
    potencia_instalada_kwp: 7.32, geracao_media_kwh_mes: 890,
    garantia_modulos_anos: 25, garantia_inversor_anos: 10,
  },
  itens: [],
};
