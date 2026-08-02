// ============================================================================
// EnergyPRO — painel da equipe (/login · /novo · /cadastros · /cadastros/:id)
// Backend: Supabase (projeto EnergyPRO, sa-east-1)
//
// O formulário que o CLIENTE preenche não está aqui — é a página pública em
// `/` (index.html + publico.js), que grava por RPC. Este arquivo é a parte
// autenticada: exige login e enxerga tudo.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  SUPABASE_URL, SUPABASE_KEY, BUCKET,
  SLOTS, TELHADOS, STATUS, ORIGENS, UFS, MIMES_OK, TAM_MAX,
  rotStatus, rotTelhado, rotOrigem,
  esc, soDigitos, maskCPF, maskFone, maskMoeda, maskInt, maskIdent,
  moedaParaNum, intParaNum,
  fmtMoeda, fmtInt, fmtData, fmtDataHora, fmtCPF, fmtFone, fmtTam,
  cpfValido, emailValido, nomeSeguro
} from './comum.js';
import { folha, gerarXLSX, MIME_XLSX } from './xlsx.js';

// Número que recebe o resumo por WhatsApp (só dígitos, com DDI 55). Vazio = botão oculto.
const WHATSAPP_DESTINO = '';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const POR_PAGINA = 25;

// ============================================================================
// Utilidades locais do painel
// ============================================================================
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function baixarBlob(conteudo, nome, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

// ============================================================================
// Estado da sessão
// ============================================================================
const App = { user: null, perfil: null };

async function registrarEvento(cadastroId, acao, detalhe) {
  try {
    await sb.from('cadastro_eventos').insert({
      cadastro_id: cadastroId, ator_id: App.user.id, acao, detalhe: detalhe || null
    });
  } catch (_) { /* auditoria nunca deve quebrar a tela */ }
}

// ============================================================================
// Roteador
// ============================================================================
function navegar(rota, repor) {
  if (repor) history.replaceState({}, '', rota); else history.pushState({}, '', rota);
  render();
}

window.addEventListener('popstate', render);

document.addEventListener('click', e => {
  const a = e.target.closest('a[data-rota]');
  if (a) { e.preventDefault(); navegar(a.getAttribute('href')); }
});

// ============================================================================
// Layout
// ============================================================================
function layout(conteudo, ativo) {
  return `
  <header class="topbar">
    <div class="wrap topbar-in">
      <div class="brand"><span class="dot"></span>EnergyPRO</div>
      <nav class="navlinks">
        <!-- SEM data-rota: /crm é do app React, não deste roteador. Um link
             comum recarrega a página e entrega a rota a quem sabe tratá-la;
             a sessão é a mesma, então a troca é transparente. -->
        <a href="/crm" class="volta-funil" title="Voltar ao funil de vendas">← Funil</a>
        <a href="/cadastros" data-rota class="${ativo === 'lista' ? 'on' : ''}">Cadastros</a>
        <a href="/novo" data-rota class="${ativo === 'form' ? 'on' : ''}">Novo cadastro</a>
      </nav>
      <div class="topbar-right">
        <a class="link-gestao" href="/propostas">Propostas</a>
        <!-- Link comum de propósito: sai do painel e abre a página do cliente. -->
        <a class="link-site" href="/" target="_blank" rel="noopener">Página do cliente ↗</a>
        <span class="whoami">${esc(App.perfil?.nome || App.user?.email || '')}</span>
        <button class="btn-sair" id="sair">Sair</button>
      </div>
    </div>
  </header>
  ${conteudo}
  <div class="rodape">EnergyPRO · ConsulteGEO — uso interno. Dados pessoais protegidos pela LGPD.</div>`;
}

/**
 * UPDATE barrado pelo RLS no Supabase NÃO devolve erro — só afeta zero linhas.
 * Sem pedir as linhas de volta, o painel dizia "Status alterado" e "Observações
 * salvas" sem ter salvado nada. Toda escrita por tabela passa por aqui.
 */
async function gravar(tabela, dados, id, oQue) {
  const { data, error } = await sb.from(tabela).update(dados).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || !data.length) {
    throw new Error('Nada foi salvo' + (oQue ? ' (' + oQue + ')' : '')
      + ': seu perfil pode não ter permissão para essa alteração.');
  }
}

function ligarSair() {
  const b = $('#sair');
  if (b) b.onclick = async () => { await sb.auth.signOut(); location.href = '/login'; };
}

// ============================================================================
// Tela: login
// ============================================================================
function telaLogin(msg) {
  $('#app').innerHTML = `
  <div class="login-tela">
    <div class="login-box">
      <div class="brand"><span class="dot"></span>EnergyPRO</div>
      <p class="intro">Área restrita da equipe. Entre com seu e-mail corporativo.</p>
      ${msg ? `<div class="aviso aviso-erro">${esc(msg)}</div>` : ''}
      <form id="fl">
        <div class="campo">
          <label for="le">E-mail</label>
          <input id="le" type="email" autocomplete="username" required>
        </div>
        <div class="campo">
          <label for="ls">Senha</label>
          <input id="ls" type="password" autocomplete="current-password" required>
        </div>
        <button class="btn btn-primario" id="lb" type="submit">Entrar</button>
      </form>
      <p class="login-volta"><a href="/">← Voltar ao formulário de cadastro</a></p>
    </div>
  </div>`;

  $('#fl').onsubmit = async ev => {
    ev.preventDefault();
    const b = $('#lb');
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Entrando…';
    const { error } = await sb.auth.signInWithPassword({
      email: $('#le').value.trim(), password: $('#ls').value
    });
    if (error) {
      telaLogin(error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.' : error.message);
      return;
    }
    await iniciar();
  };
}

// ============================================================================
// Tela: formulário de cadastro
// ============================================================================
const CamposTexto = [
  { n: 'nome',              rot: 'Nome completo',           obr: true },
  { n: 'cpf',               rot: 'CPF',                     mask: maskCPF, ph: '000.000.000-00' },
  { n: 'whatsapp',          rot: 'WhatsApp',                mask: maskFone, ph: '(00) 00000-0000' },
  { n: 'email',             rot: 'E-mail',                  tipo: 'email' },
  { n: 'cidade',            rot: 'Cidade da instalação' },
  { n: 'concessionaria',    rot: 'Concessionária' },
  { n: 'numero_instalacao', rot: 'Nº da conta / instalação', mask: maskIdent },
  { n: 'consumo_medio_kwh', rot: 'Consumo médio (kWh/mês)', mask: maskInt },
  { n: 'valor_medio_conta', rot: 'Valor médio da conta',    mask: maskMoeda, ph: 'R$ 0,00' },
  { n: 'kit_descricao',     rot: 'Kit de placas e inversor' },
  { n: 'valor_proposta',    rot: 'Orçamento do concorrente', mask: maskMoeda, ph: 'R$ 0,00' }
];

const TOTAL_ITENS = 13 + SLOTS.length; // mesma contagem do formulário original

function telaFormulario() {
  const arquivos = {};   // slot -> File[]
  let enviado = null;

  function campoHTML(c) {
    return `
    <div class="campo">
      <label for="f_${c.n}">${esc(c.rot)}${c.obr ? ' <span class="req">*</span>' : ''}</label>
      <input id="f_${c.n}" name="${c.n}" type="${c.tipo || 'text'}"
             ${c.ph ? `placeholder="${c.ph}"` : ''} autocomplete="off">
      <small class="erro hidden" data-erro="${c.n}"></small>
    </div>`;
  }
  const c = n => CamposTexto.find(x => x.n === n);

  function desenhar() {
    $('#app').innerHTML = layout(`
    <div class="wrap-form" style="padding-top:28px">
      <h1 style="font-size:26px;font-weight:700;letter-spacing:-.7px;margin-bottom:5px">Cadastro do cliente e do projeto</h1>
      <p style="color:var(--texto-md);margin-bottom:22px;font-size:14px">
        Só o nome é obrigatório. O que faltar pode ser completado depois pelo painel.
      </p>
      <form id="fc" novalidate>

        <section class="card">
          <div class="card-head"><span class="card-num">1</span><h2>Dados do cliente</h2></div>
          <div class="card-body">
            <div class="grid grid-2">
              ${campoHTML(c('nome'))}
              ${campoHTML(c('cpf'))}
              ${campoHTML(c('whatsapp'))}
              ${campoHTML(c('email'))}
              ${campoHTML(c('cidade'))}
              <div class="campo">
                <label for="f_uf">UF</label>
                <select id="f_uf" name="uf">
                  <option value="">Selecione</option>
                  ${UFS.map(u => `<option value="${u}">${u}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><span class="card-num">2</span><h2>Energia</h2></div>
          <div class="card-body">
            <div class="grid grid-2">
              ${campoHTML(c('concessionaria'))}
              ${campoHTML(c('numero_instalacao'))}
              ${campoHTML(c('consumo_medio_kwh'))}
              ${campoHTML(c('valor_medio_conta'))}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><span class="card-num">3</span><h2>Sistema</h2></div>
          <div class="card-body">
            <div class="grid grid-2">
              <div class="campo">
                <label>Área</label>
                <div class="radios">
                  <label data-r><input type="radio" name="zona" value="urbana">Urbana</label>
                  <label data-r><input type="radio" name="zona" value="rural">Rural</label>
                </div>
              </div>
              <div class="campo">
                <label for="f_tipo_telhado">Tipo de telhado</label>
                <select id="f_tipo_telhado" name="tipo_telhado">
                  <option value="">Selecione</option>
                  ${TELHADOS.map(([v, r]) => `<option value="${v}">${esc(r)}</option>`).join('')}
                </select>
              </div>
              ${campoHTML(c('kit_descricao'))}
              ${campoHTML(c('valor_proposta'))}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><span class="card-num">4</span><h2>Documentos</h2></div>
          <div class="card-body">
            <div class="slots">
              ${SLOTS.map(s => `
              <div class="slot" data-slot="${s.k}">
                <div class="slot-top"><strong>${esc(s.rot)}</strong></div>
                <span style="font-size:12px;color:var(--texto-fr)">${esc(s.dica)}</span>
                <div>
                  <button type="button" class="slot-add" data-add="${s.k}">＋ Anexar arquivo</button>
                  <input type="file" class="hidden" multiple data-input="${s.k}"
                         accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif">
                </div>
                <ul class="arqs" data-lista="${s.k}"></ul>
              </div>`).join('')}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-body">
            <label style="display:flex;gap:11px;align-items:flex-start;cursor:pointer;font-size:14px">
              <input type="checkbox" id="lgpd" style="margin-top:4px;width:17px;height:17px;flex:none;accent-color:var(--laranja)">
              <span>O cliente autorizou a coleta e o uso destes dados e documentos para
              elaboração e execução da proposta de energia solar. <span class="req">*</span></span>
            </label>
            <small class="erro hidden" data-erro="lgpd" style="margin-top:7px;display:block"></small>
          </div>
        </section>

        <div id="aviso-envio"></div>
        <div id="progresso-upload"></div>

        <div style="display:flex;gap:10px;margin-bottom:26px">
          <button type="submit" class="btn btn-primario" id="bt-enviar">Salvar cadastro</button>
          <a href="/cadastros" data-rota class="btn btn-neutro">Ver cadastros</a>
        </div>
      </form>
    </div>

    <div class="progresso">
      <div class="progresso-in">
        <div class="barra"><i id="pb" style="width:0%"></i></div>
        <small id="pl">0 de ${TOTAL_ITENS} itens preenchidos</small>
      </div>
    </div>`, 'form');

    ligarSair();
    ligarFormulario();
  }

  function recontar() {
    const f = $('#fc'); if (!f) return;
    let n = 0;
    CamposTexto.forEach(c => { const el = f.elements[c.n]; if (el && el.value.trim()) n++; });
    if (f.querySelector('input[name="zona"]:checked')) n++;
    if (f.elements.tipo_telhado.value) n++;
    SLOTS.forEach(s => { if ((arquivos[s.k] || []).length) n++; });
    $('#pb').style.width = Math.round((n / TOTAL_ITENS) * 100) + '%';
    $('#pl').textContent = `${n} de ${TOTAL_ITENS} itens preenchidos`;
  }

  function desenharLista(slot) {
    const ul = $(`[data-lista="${slot}"]`);
    const lista = arquivos[slot] || [];
    ul.innerHTML = lista.map((f, i) => `
      <li class="arq">
        <span class="nome">${esc(f.name)}</span>
        <span class="tam">${fmtTam(f.size)}</span>
        <button type="button" class="x" data-rm="${slot}" data-i="${i}" title="Remover">×</button>
      </li>`).join('');
    ul.querySelectorAll('[data-rm]').forEach(b => {
      b.onclick = () => {
        arquivos[slot].splice(+b.dataset.i, 1);
        desenharLista(slot); recontar();
      };
    });
  }

  function adicionar(slot, files) {
    const novos = Array.from(files || []);
    if (!novos.length) return;
    const recusados = [];
    const aceitos = novos.filter(f => {
      if (f.size > TAM_MAX) { recusados.push(`${f.name} (maior que 20 MB)`); return false; }
      if (f.type && !MIMES_OK.includes(f.type)) { recusados.push(`${f.name} (formato não aceito)`); return false; }
      return true;
    });
    if (recusados.length) {
      $('#aviso-envio').innerHTML =
        `<div class="aviso aviso-erro">Não anexados: ${esc(recusados.join('; '))}</div>`;
    }
    if (!aceitos.length) return;
    arquivos[slot] = (arquivos[slot] || []).concat(aceitos);
    desenharLista(slot); recontar();
  }

  function ligarFormulario() {
    const f = $('#fc');

    CamposTexto.forEach(c => {
      const el = f.elements[c.n];
      if (!el) return;
      el.addEventListener('input', () => {
        if (c.mask) {
          const p = el.selectionStart, antes = el.value.length;
          el.value = c.mask(el.value);
          if (p !== null && p < antes) el.setSelectionRange(p + (el.value.length - antes), p + (el.value.length - antes));
        }
        el.setAttribute('aria-invalid', 'false');
        const box = f.querySelector(`[data-erro="${c.n}"]`);
        if (box) box.classList.add('hidden');
        recontar();
      });
    });

    $$('[data-r]', f).forEach(l => {
      l.addEventListener('click', () => {
        $$('[data-r]', f).forEach(x => x.classList.remove('sel'));
        l.classList.add('sel');
        recontar();
      });
    });
    f.elements.tipo_telhado.addEventListener('change', recontar);
    f.elements.uf.addEventListener('change', recontar);

    SLOTS.forEach(s => {
      const zona = f.querySelector(`[data-slot="${s.k}"]`);
      const input = f.querySelector(`[data-input="${s.k}"]`);
      f.querySelector(`[data-add="${s.k}"]`).onclick = () => input.click();
      input.onchange = e => { adicionar(s.k, e.target.files); e.target.value = ''; };
      zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('drag'); });
      zona.addEventListener('dragleave', () => zona.classList.remove('drag'));
      zona.addEventListener('drop', e => {
        e.preventDefault(); zona.classList.remove('drag');
        adicionar(s.k, e.dataTransfer.files);
      });
    });

    $('#lgpd').addEventListener('change', () => {
      f.querySelector('[data-erro="lgpd"]').classList.add('hidden');
    });

    f.onsubmit = enviar;
  }

  function erroCampo(nome, msg) {
    const f = $('#fc');
    const box = f.querySelector(`[data-erro="${nome}"]`);
    if (box) { box.textContent = msg; box.classList.remove('hidden'); }
    const el = f.elements[nome];
    if (el && el.setAttribute) el.setAttribute('aria-invalid', 'true');
  }

  async function enviar(ev) {
    ev.preventDefault();
    const f = $('#fc');
    $('#aviso-envio').innerHTML = '';
    f.querySelectorAll('.erro').forEach(e => e.classList.add('hidden'));

    // ---- validação ----
    let erros = 0, primeiro = null;
    if (!f.elements.nome.value.trim()) { erroCampo('nome', 'Informe o nome do cliente.'); erros++; primeiro = primeiro || f.elements.nome; }
    if (f.elements.cpf.value.trim() && !cpfValido(f.elements.cpf.value)) { erroCampo('cpf', 'CPF inválido — confira os dígitos.'); erros++; primeiro = primeiro || f.elements.cpf; }
    if (f.elements.email.value.trim() && !emailValido(f.elements.email.value)) { erroCampo('email', 'E-mail inválido.'); erros++; primeiro = primeiro || f.elements.email; }
    if (f.elements.whatsapp.value.trim() && soDigitos(f.elements.whatsapp.value).length < 10) { erroCampo('whatsapp', 'Telefone incompleto (DDD + número).'); erros++; primeiro = primeiro || f.elements.whatsapp; }
    if (!$('#lgpd').checked) { erroCampo('lgpd', 'É necessário confirmar a autorização do cliente.'); erros++; primeiro = primeiro || $('#lgpd'); }
    if (erros) {
      $('#aviso-envio').innerHTML = `<div class="aviso aviso-erro">Corrija ${erros === 1 ? 'o campo indicado' : `os ${erros} campos indicados`} para salvar.</div>`;
      if (primeiro) primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const bt = $('#bt-enviar');
    bt.disabled = true; bt.innerHTML = '<span class="spin"></span> Salvando…';

    const zona = f.querySelector('input[name="zona"]:checked');
    const registro = {
      nome:              f.elements.nome.value.trim(),
      cpf:               soDigitos(f.elements.cpf.value) || null,
      whatsapp:          soDigitos(f.elements.whatsapp.value) || null,
      email:             f.elements.email.value.trim() || null,
      cidade:            f.elements.cidade.value.trim() || null,
      uf:                f.elements.uf.value || null,
      concessionaria:    f.elements.concessionaria.value.trim() || null,
      numero_instalacao: soDigitos(f.elements.numero_instalacao.value) || null,
      consumo_medio_kwh: intParaNum(f.elements.consumo_medio_kwh.value),
      valor_medio_conta: moedaParaNum(f.elements.valor_medio_conta.value),
      zona:              zona ? zona.value : null,
      tipo_telhado:      f.elements.tipo_telhado.value || null,
      kit_descricao:     f.elements.kit_descricao.value.trim() || null,
      valor_proposta:    moedaParaNum(f.elements.valor_proposta.value),
      status:            'rascunho',
      created_by:        App.user.id,
      consentimento_lgpd: true,
      consentimento_em:  new Date().toISOString()
    };

    const { data: novo, error } = await sb.from('cadastros').insert(registro).select().single();
    if (error) {
      bt.disabled = false; bt.textContent = 'Salvar cadastro';
      $('#aviso-envio').innerHTML = `<div class="aviso aviso-erro">Não foi possível salvar: ${esc(error.message)}</div>`;
      return;
    }

    // ---- upload dos arquivos ----
    const pendentes = [];
    SLOTS.forEach(s => (arquivos[s.k] || []).forEach(file => pendentes.push({ slot: s.k, file })));

    const falhas = [];
    if (pendentes.length) {
      const cx = $('#progresso-upload');
      cx.innerHTML = `<div class="card"><div class="card-body">
        <strong style="font-size:14px;display:block;margin-bottom:9px">Enviando ${pendentes.length} arquivo(s)…</strong>
        <div id="up-linhas"></div></div></div>`;
      const linhas = $('#up-linhas');
      linhas.innerHTML = pendentes.map((p, i) => `
        <div class="up-linha">
          <span style="flex:0 0 44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.file.name)}</span>
          <span class="mini"><i id="up${i}" style="width:0%"></i></span>
          <span id="us${i}" style="flex:none;color:var(--texto-fr);font-size:12px">aguardando</span>
        </div>`).join('');

      for (let i = 0; i < pendentes.length; i++) {
        const { slot, file } = pendentes[i];
        $('#us' + i).textContent = 'enviando';
        $('#up' + i).style.width = '45%';
        const caminho = `${novo.id}/${slot}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
        const up = await sb.storage.from(BUCKET).upload(caminho, file, {
          contentType: file.type || 'application/octet-stream', upsert: false
        });
        if (up.error) {
          falhas.push(file.name);
          $('#up' + i).style.width = '100%';
          $('#up' + i).style.background = 'var(--erro)';
          $('#us' + i).textContent = 'falhou';
          continue;
        }
        const reg = await sb.from('cadastro_arquivos').insert({
          cadastro_id: novo.id, slot, storage_path: caminho,
          nome_original: file.name, mime_type: file.type || null,
          tamanho_bytes: file.size, uploaded_by: App.user.id
        });
        if (reg.error) { falhas.push(file.name); $('#us' + i).textContent = 'falhou'; continue; }
        $('#up' + i).style.width = '100%';
        $('#us' + i).textContent = 'ok';
      }
    }

    // Só vira "novo" quando os uploads terminam sem falha — evita cadastro sem anexo silencioso
    if (!falhas.length) {
      await gravar('cadastros', { status: 'novo' }, novo.id, 'status do novo cadastro');
      novo.status = 'novo';
    }
    await registrarEvento(novo.id, 'criou', {
      arquivos: pendentes.length, falhas: falhas.length
    });

    enviado = { registro: novo, total: pendentes.length, falhas };
    telaEnviado();
  }

  function resumoTexto(r, nArq) {
    const L = ['*NOVO CADASTRO — ENERGYPRO*', new Date().toLocaleString('pt-BR')];
    const bloco = (t, pares) => {
      const linhas = pares.filter(([, v]) => v !== null && v !== undefined && v !== '');
      if (linhas.length) L.push('', t, ...linhas.map(([k, v]) => `${k}: ${v}`));
    };
    bloco('1. CLIENTE', [
      ['Nome', r.nome], ['CPF', r.cpf && maskCPF(r.cpf)], ['WhatsApp', r.whatsapp && maskFone(r.whatsapp)],
      ['E-mail', r.email], ['Cidade', [r.cidade, r.uf].filter(Boolean).join('/')]
    ]);
    bloco('2. ENERGIA', [
      ['Concessionária', r.concessionaria], ['Nº instalação', r.numero_instalacao],
      ['Consumo médio', r.consumo_medio_kwh && fmtInt(r.consumo_medio_kwh) + ' kWh/mês'],
      ['Valor médio da conta', r.valor_medio_conta && fmtMoeda(r.valor_medio_conta)]
    ]);
    bloco('3. SISTEMA', [
      ['Área', r.zona && (r.zona === 'urbana' ? 'Urbana' : 'Rural')],
      ['Tipo de telhado', r.tipo_telhado && rotTelhado(r.tipo_telhado)],
      ['Kit', r.kit_descricao], ['Orçamento do concorrente', r.valor_proposta && fmtMoeda(r.valor_proposta)]
    ]);
    L.push('', '4. DOCUMENTOS', nArq ? `${nArq} arquivo(s) anexado(s)` : 'Nenhum arquivo anexado');
    L.push('', `Ficha completa: ${location.origin}/cadastros/${r.id}`);
    return L.join('\n');
  }

  function telaEnviado() {
    const { registro, total, falhas } = enviado;
    const txt = resumoTexto(registro, total - falhas.length);
    const wa = WHATSAPP_DESTINO
      ? `https://wa.me/${WHATSAPP_DESTINO}?text=${encodeURIComponent(txt)}` : null;

    $('#app').innerHTML = layout(`
    <div class="wrap-form" style="padding-top:34px">
      <div class="enviado">
        <div class="check">✓</div>
        <h1>Cadastro salvo</h1>
        <p>${esc(registro.nome.split(' ')[0])} já está na base${total ? ` com ${total - falhas.length} de ${total} arquivo(s)` : ''}.</p>
        ${falhas.length ? `<div class="aviso aviso-erro" style="text-align:left">
          ${falhas.length} arquivo(s) não subiram (${esc(falhas.join(', '))}). O cadastro ficou como
          <b>rascunho</b> — reenvie os documentos pela ficha.</div>` : ''}
        <div class="enviado-acoes">
          <a href="/cadastros/${registro.id}" data-rota class="btn btn-primario">Abrir ficha</a>
          ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="btn btn-escuro">Enviar pelo WhatsApp</a>` : ''}
          <button class="btn btn-neutro" id="bcopiar">Copiar resumo</button>
          <button class="btn btn-neutro" id="bnovo">Novo cadastro</button>
        </div>
        <div class="resumo">${esc(txt)}</div>
      </div>
    </div>`, 'form');

    ligarSair();
    $('#bnovo').onclick = () => navegar('/novo');
    $('#bcopiar').onclick = async () => {
      try { await navigator.clipboard.writeText(txt); $('#bcopiar').textContent = 'Resumo copiado'; }
      catch (_) { $('#bcopiar').textContent = 'Não foi possível copiar'; }
    };
  }

  desenhar();
}

// ============================================================================
// Tela: lista de cadastros
// ============================================================================
const filtros = { busca: '', status: '', origem: '', ordem: 'created_at', asc: false, pagina: 0 };

async function telaLista() {
  $('#app').innerHTML = layout(`
    <div class="wrap" style="padding-top:26px">
      <div class="det-head">
        <div>
          <h1>Cadastros</h1>
          <div class="sub" id="sub">carregando…</div>
        </div>
        <div class="det-acoes">
          <button class="btn btn-neutro btn-sm" id="bxlsx">Exportar Excel</button>
          <a href="/novo" data-rota class="btn btn-primario btn-sm">＋ Novo cadastro</a>
        </div>
      </div>
      <div class="kpis" id="kpis"></div>
      <div class="toolbar">
        <div class="busca">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
          <input id="q" placeholder="Buscar por nome, CPF, cidade ou instalação" value="${esc(filtros.busca)}">
        </div>
        <select id="fstatus">
          <option value="">Todos os status</option>
          ${STATUS.map(([v, r]) => `<option value="${v}" ${filtros.status === v ? 'selected' : ''}>${esc(r)}</option>`).join('')}
        </select>
        <select id="forigem">
          <option value="">Toda origem</option>
          ${ORIGENS.map(([v, r]) => `<option value="${v}" ${filtros.origem === v ? 'selected' : ''}>${esc(r)}</option>`).join('')}
        </select>
      </div>
      <div id="tabela"><div class="carregando">Carregando cadastros…</div></div>
      <div class="paginacao" id="pag"></div>
    </div>`, 'lista');

  ligarSair();

  let tdebounce;
  $('#q').oninput = e => {
    clearTimeout(tdebounce);
    tdebounce = setTimeout(() => { filtros.busca = e.target.value.trim(); filtros.pagina = 0; carregar(); }, 300);
  };
  $('#fstatus').onchange = e => { filtros.status = e.target.value; filtros.pagina = 0; carregar(); };
  $('#forigem').onchange = e => { filtros.origem = e.target.value; filtros.pagina = 0; carregar(); };
  $('#bxlsx').onclick = exportarExcel;

  await carregar();
}

function consultaBase() {
  let q = sb.from('cadastros').select('*, cadastro_arquivos(count)', { count: 'exact' });
  if (filtros.status) q = q.eq('status', filtros.status);
  if (filtros.origem) q = q.eq('origem', filtros.origem);
  if (filtros.busca) {
    const t = filtros.busca.replace(/[%,()]/g, ' ').trim();
    const d = soDigitos(t);
    const ors = [`nome.ilike.%${t}%`, `cidade.ilike.%${t}%`, `concessionaria.ilike.%${t}%`];
    if (d) { ors.push(`cpf.ilike.%${d}%`); ors.push(`numero_instalacao.ilike.%${d}%`); }
    q = q.or(ors.join(','));
  }
  return q;
}

async function carregar() {
  const de = filtros.pagina * POR_PAGINA;
  const { data, count, error } = await consultaBase()
    .order(filtros.ordem, { ascending: filtros.asc })
    .range(de, de + POR_PAGINA - 1);

  if (error) {
    $('#tabela').innerHTML = `<div class="aviso aviso-erro">Erro ao carregar: ${esc(error.message)}</div>`;
    return;
  }

  $('#sub').textContent = count === 1 ? '1 cadastro' : `${count} cadastros`;
  desenharKPIs();

  const comFiltro = filtros.busca || filtros.status || filtros.origem;
  if (!data.length) {
    $('#tabela').innerHTML = `<div class="tabela-wrap"><div class="vazio-estado">
      <b>${comFiltro ? 'Nenhum cadastro com esses filtros' : 'Nenhum cadastro ainda'}</b>
      ${comFiltro ? 'Ajuste a busca, o status ou a origem.' : 'Comece criando o primeiro cadastro.'}
    </div></div>`;
    $('#pag').innerHTML = '';
    return;
  }

  const th = (campo, rot, cls) =>
    `<th class="ord ${cls || ''}" data-ord="${campo}">${rot}${filtros.ordem === campo ? (filtros.asc ? ' ↑' : ' ↓') : ''}</th>`;

  $('#tabela').innerHTML = `<div class="tabela-wrap"><table>
    <thead><tr>
      ${th('created_at', 'Data')}
      ${th('nome', 'Cliente')}
      ${th('cidade', 'Cidade')}
      ${th('concessionaria', 'Concessionária')}
      ${th('consumo_medio_kwh', 'Consumo', 'num')}
      ${th('valor_medio_conta', 'Conta', 'num')}
      ${th('valor_proposta', 'Concorrente', 'num')}
      <th>Anexos</th>
      ${th('origem', 'Origem')}
      ${th('status', 'Status')}
    </tr></thead>
    <tbody>${data.map(r => {
      const n = r.cadastro_arquivos?.[0]?.count || 0;
      return `<tr data-id="${r.id}">
        <td style="white-space:nowrap;color:var(--texto-md)">${fmtData(r.created_at)}</td>
        <td class="forte">${esc(r.nome)}${r.cpf ? `<div style="font-size:12px;color:var(--texto-fr);font-weight:400">${fmtCPF(r.cpf)}</div>` : ''}</td>
        <td>${esc([r.cidade, r.uf].filter(Boolean).join('/') || '—')}</td>
        <td>${esc(r.concessionaria || '—')}</td>
        <td class="num">${r.consumo_medio_kwh ? fmtInt(r.consumo_medio_kwh) : '—'}</td>
        <td class="num">${r.valor_medio_conta ? fmtMoeda(r.valor_medio_conta) : '—'}</td>
        <td class="num">${r.valor_proposta ? fmtMoeda(r.valor_proposta) : '—'}</td>
        <td><span class="badge-arq ${n ? '' : 'zero'}">📎 ${n}</span></td>
        <td><span class="tag o-${r.origem || 'equipe'}">${r.origem === 'publico' ? 'Cliente' : 'Equipe'}</span></td>
        <td><span class="tag t-${r.status}">${esc(rotStatus(r.status))}</span></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;

  $$('#tabela tbody tr').forEach(tr => {
    tr.onclick = () => navegar('/cadastros/' + tr.dataset.id);
  });
  $$('#tabela th[data-ord]').forEach(h => {
    h.onclick = () => {
      const c = h.dataset.ord;
      if (filtros.ordem === c) filtros.asc = !filtros.asc;
      else { filtros.ordem = c; filtros.asc = false; }
      carregar();
    };
  });

  const ultima = Math.ceil(count / POR_PAGINA) - 1;
  $('#pag').innerHTML = `
    <span>${de + 1}–${Math.min(de + POR_PAGINA, count)} de ${count}</span>
    <div style="display:flex;gap:8px">
      <button class="btn btn-neutro btn-sm" id="ant" ${filtros.pagina === 0 ? 'disabled' : ''}>← Anterior</button>
      <button class="btn btn-neutro btn-sm" id="prox" ${filtros.pagina >= ultima ? 'disabled' : ''}>Próxima →</button>
    </div>`;
  $('#ant').onclick = () => { filtros.pagina--; carregar(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('#prox').onclick = () => { filtros.pagina++; carregar(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
}

async function desenharKPIs() {
  const box = $('#kpis'); if (!box) return;
  const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);

  const [mes, doCliente, analise, fechados, props] = await Promise.all([
    sb.from('cadastros').select('id', { count: 'exact', head: true }).gte('created_at', ini.toISOString()),
    sb.from('cadastros').select('id', { count: 'exact', head: true })
      .eq('origem', 'publico').gte('created_at', ini.toISOString()),
    sb.from('cadastros').select('id', { count: 'exact', head: true }).in('status', ['novo', 'em_analise']),
    sb.from('cadastros').select('id', { count: 'exact', head: true }).eq('status', 'fechado'),
    sb.from('cadastros').select('valor_proposta').not('valor_proposta', 'is', null)
  ]);

  // ARMADILHA CORRIGIDA: `valor_proposta` é o preço que o CONCORRENTE já deu ao
  // cliente — o formulário público pergunta isso de propósito, na seção do
  // sistema, ao lado do anexo "Proposta — se já houver". Este indicador se
  // chamava "Proposta média", que é o nome do ticket da própria empresa. Era o
  // único número de dinheiro agregado do sistema e ia assim para a planilha de
  // reunião: quem decidisse preço ou meta por ele estaria decidindo pelo dado
  // do concorrente. O ticket de verdade sai de `propostas.valor_total` das
  // aceitas, e agora está na tela de Propostas.
  const vals = (props.data || []).map(r => Number(r.valor_proposta));
  const media = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

  box.innerHTML = `
    <div class="kpi"><span>Este mês</span><b>${mes.count ?? 0}</b></div>
    <div class="kpi kpi-cliente"><span>Do cliente (mês)</span><b>${doCliente.count ?? 0}</b></div>
    <div class="kpi"><span>Em aberto</span><b>${analise.count ?? 0}</b></div>
    <div class="kpi"><span>Fechados</span><b>${fechados.count ?? 0}</b></div>
    <div class="kpi" title="Média do que estes clientes já tinham orçado com outra empresa. NÃO é o preço da Energy PRO — o ticket médio fica na tela de Propostas."
      ><span>Concorrente (média)</span><b style="font-size:19px">${media ? fmtMoeda(media) : '—'}</b></div>`;
}

async function exportarExcel() {
  const b = $('#bxlsx'); b.disabled = true; b.textContent = 'Gerando…';
  const { data, error } = await consultaBase().order(filtros.ordem, { ascending: filtros.asc }).range(0, 4999);
  if (error) {
    b.disabled = false; b.textContent = 'Exportar Excel';
    alert('Erro ao exportar: ' + error.message);
    return;
  }

  // Cada coluna declara o tipo. O que é número vai como número (o Excel soma,
  // filtra e monta tabela dinâmica) e o que é data vai como data. Era isso que
  // o CSV não entregava: lá tudo virava texto, e o `replace(/\./g, ',')` que
  // acertava a vírgula decimal também estragava e-mail e URL.
  const cols = [
    ['Data',              'data',    12, r => r.created_at],
    ['Nome',              'texto',   30, r => r.nome],
    ['CPF',               'texto',   16, r => r.cpf ? maskCPF(r.cpf) : ''],
    ['WhatsApp',          'texto',   17, r => r.whatsapp ? maskFone(r.whatsapp) : ''],
    ['E-mail',            'texto',   28, r => r.email || ''],
    ['Cidade',            'texto',   20, r => r.cidade || ''],
    ['UF',                'texto',    6, r => r.uf || ''],
    ['Concessionária',    'texto',   22, r => r.concessionaria || ''],
    ['Nº instalação',     'texto',   18, r => r.numero_instalacao || ''],
    ['Consumo (kWh/mês)', 'inteiro', 18, r => r.consumo_medio_kwh],
    ['Valor da conta',    'moeda',   16, r => r.valor_medio_conta],
    ['Área',              'texto',   10, r => r.zona === 'urbana' ? 'Urbana' : r.zona === 'rural' ? 'Rural' : ''],
    ['Tipo de telhado',   'texto',   22, r => r.tipo_telhado ? rotTelhado(r.tipo_telhado) : ''],
    ['Kit',               'texto',   34, r => r.kit_descricao || ''],
    // Não é a nossa proposta: é o que o cliente já tinha em mãos.
    ['Orçamento do concorrente', 'moeda', 24, r => r.valor_proposta],
    ['Origem',            'texto',   20, r => rotOrigem(r.origem || 'equipe')],
    ['Status',            'texto',   17, r => rotStatus(r.status)],
    ['Anexos',            'inteiro',  9, r => r.cadastro_arquivos?.[0]?.count || 0],
    ['Ficha',             'link',    13, r => `${location.origin}/cadastros/${r.id}`]
  ];

  const cadastros = folha(
    'Cadastros',
    cols.map(([rot, tipo, largura]) => ({ rot, tipo, largura })),
    data.map(r => cols.map(c => c[3](r)))
  );

  try {
    const bytes = await gerarXLSX([cadastros, folhaResumo(data)]);
    baixarBlob(bytes,
      `energypro-cadastros-${new Date().toISOString().slice(0, 10)}.xlsx`,
      MIME_XLSX);
  } catch (e) {
    alert('Não foi possível gerar a planilha: ' + (e?.message || e));
  } finally {
    b.disabled = false; b.textContent = 'Exportar Excel';
  }
}

// Segunda aba: o retrato do que foi exportado — contagem por status e por
// origem, mais o valor das propostas. Suficiente para levar a uma reunião sem
// ter de montar tabela dinâmica.
function folhaResumo(data) {
  const conta = (campo, valor, padrao) =>
    data.filter(r => (r[campo] || padrao) === valor).length;
  const propostas = data.map(r => Number(r.valor_proposta)).filter(n => isFinite(n) && n > 0);
  const soma = propostas.reduce((a, c) => a + c, 0);

  const linhas = [
    ['Cadastros exportados', String(data.length), null],
    ['Gerado em', new Date().toLocaleString('pt-BR'), null],
    [null, null, null],
    ['Por status', null, null]
  ];
  STATUS.forEach(([v, rot]) => linhas.push([rot, String(conta('status', v, '')), null]));
  linhas.push([null, null, null], ['Por origem', null, null]);
  ORIGENS.forEach(([v, rot]) => linhas.push([rot, String(conta('origem', v, 'equipe')), null]));
  // Estes três números descrevem a CONCORRÊNCIA, não a Energy PRO. Os rótulos
  // antigos ("Propostas", "Soma das propostas", "Proposta média") liam como se
  // fossem o desempenho da casa — numa planilha que vai para reunião.
  linhas.push(
    [null, null, null],
    ['Orçamento que o cliente já tinha', null, null],
    ['Clientes que chegaram com orçamento', String(propostas.length), null],
    ['Soma dos orçamentos do concorrente', null, soma || null],
    ['Média do concorrente', null, propostas.length ? soma / propostas.length : null]
  );

  const f = folha('Resumo', [
    { rot: 'Indicador', tipo: 'texto', largura: 30 },
    { rot: 'Valor',     tipo: 'texto', largura: 22 },
    { rot: 'Em R$',     tipo: 'moeda', largura: 20 }
  ], linhas);
  f.semFiltro = true;   // filtro não faz sentido numa folha de indicadores
  return f;
}

// ============================================================================
// Tela: ficha do cadastro
// ============================================================================
async function telaFicha(id) {
  $('#app').innerHTML = layout('<div class="wrap" style="padding-top:26px"><div class="carregando">Carregando ficha…</div></div>', 'lista');
  ligarSair();

  const [{ data: r, error }, { data: arqs }, { data: evs }] = await Promise.all([
    sb.from('cadastros').select('*').eq('id', id).maybeSingle(),
    sb.from('cadastro_arquivos').select('*').eq('cadastro_id', id).order('created_at'),
    sb.from('cadastro_eventos').select('*').eq('cadastro_id', id).order('created_at', { ascending: false }).limit(40)
  ]);

  if (error || !r) {
    $('#app').innerHTML = layout(`<div class="wrap" style="padding-top:26px">
      <div class="aviso aviso-erro">Cadastro não encontrado.</div>
      <a href="/cadastros" data-rota class="btn btn-neutro">← Voltar</a></div>`, 'lista');
    ligarSair();
    return;
  }

  registrarEvento(id, 'visualizou');

  const porSlot = {};
  (arqs || []).forEach(a => { (porSlot[a.slot] = porSlot[a.slot] || []).push(a); });

  const item = (rot, val, vazio) =>
    `<div><dt>${rot}</dt><dd class="${val ? '' : 'vazio'}">${val ? esc(val) : (vazio || 'não informado')}</dd></div>`;

  $('#app').innerHTML = layout(`
  <div class="wrap" style="padding-top:22px">
    <a href="/cadastros" data-rota style="font-size:13.5px;text-decoration:none;display:inline-block;margin-bottom:14px">← Todos os cadastros</a>

    <div class="det-head">
      <div>
        <h1>${esc(r.nome)}</h1>
        <div class="sub">
          <span class="tag o-${r.origem || 'equipe'}">${esc(rotOrigem(r.origem || 'equipe'))}</span>
          Criado em ${fmtDataHora(r.created_at)} · atualizado em ${fmtDataHora(r.updated_at)}
        </div>
      </div>
      <div class="det-acoes">
        <select id="mstatus" style="padding:9px 12px;border:1px solid var(--linha-forte);border-radius:9px;background:#fff;font-weight:600">
          ${STATUS.map(([v, rot]) => `<option value="${v}" ${r.status === v ? 'selected' : ''}>${esc(rot)}</option>`).join('')}
        </select>
        <button class="btn btn-neutro btn-sm" id="beditar">Editar</button>
        ${(arqs || []).length ? '<button class="btn btn-primario btn-sm" id="bzip">Baixar todos</button>' : ''}
      </div>
    </div>

    <div id="aviso-ficha"></div>

    <section class="card">
      <div class="card-head"><span class="card-num">1</span><h2>Dados do cliente</h2></div>
      <dl class="dl">
        ${item('CPF', r.cpf ? maskCPF(r.cpf) : '')}
        ${item('WhatsApp', r.whatsapp ? maskFone(r.whatsapp) : '')}
        ${item('E-mail', r.email)}
        ${item('Cidade da instalação', [r.cidade, r.uf].filter(Boolean).join(' / '))}
      </dl>
    </section>

    <section class="card">
      <div class="card-head"><span class="card-num">2</span><h2>Energia</h2></div>
      <dl class="dl">
        ${item('Concessionária', r.concessionaria)}
        ${item('Nº da conta / instalação', r.numero_instalacao)}
        ${item('Consumo médio', r.consumo_medio_kwh ? fmtInt(r.consumo_medio_kwh) + ' kWh/mês' : '')}
        ${item('Valor médio da conta', r.valor_medio_conta ? fmtMoeda(r.valor_medio_conta) : '')}
      </dl>
    </section>

    <section class="card">
      <div class="card-head"><span class="card-num">3</span><h2>Sistema</h2></div>
      <dl class="dl">
        ${item('Área', r.zona === 'urbana' ? 'Urbana' : r.zona === 'rural' ? 'Rural' : '')}
        ${item('Tipo de telhado', r.tipo_telhado ? rotTelhado(r.tipo_telhado) : '')}
        ${item('Kit de placas e inversor', r.kit_descricao)}
        ${item('Orçamento do concorrente', r.valor_proposta ? fmtMoeda(r.valor_proposta) : '')}
      </dl>
    </section>

    <section class="card">
      <div class="card-head"><span class="card-num">4</span><h2>Documentos</h2></div>
      <div class="card-body">
        ${(arqs || []).length ? `<div class="anexos">${SLOTS.filter(s => porSlot[s.k]).map(s => `
          <div class="anexo-grupo">
            <strong>${esc(s.rot)}</strong>
            <div class="anexo-lista">
              ${porSlot[s.k].map(a => `
                <div class="anexo">
                  <span class="ico">${esc((a.nome_original.split('.').pop() || '?').toUpperCase().slice(0, 4))}</span>
                  <span class="nome">${esc(a.nome_original)}</span>
                  <span style="color:var(--texto-fr);font-size:12.5px;flex:none">${a.tamanho_bytes ? fmtTam(a.tamanho_bytes) : ''}</span>
                  <button class="btn btn-neutro btn-sm" data-ver="${esc(a.storage_path)}">Abrir</button>
                  <button class="btn btn-neutro btn-sm" data-baixar="${esc(a.storage_path)}" data-nome="${esc(a.nome_original)}">Baixar</button>
                </div>`).join('')}
            </div>
          </div>`).join('')}</div>`
        : '<div class="vazio-estado" style="padding:28px"><b>Nenhum documento anexado</b>Use o botão Editar para adicionar.</div>'}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><span class="card-num">5</span><h2>Observações internas</h2></div>
      <div class="card-body">
        <div class="campo">
          <textarea id="obs" rows="3" placeholder="Anotações da equipe sobre este cadastro">${esc(r.observacoes || '')}</textarea>
        </div>
        <button class="btn btn-neutro btn-sm" id="bobs" style="margin-top:10px">Salvar observações</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Histórico de acesso</h2></div>
      <div class="card-body">
        <ul class="timeline">
          ${(evs || []).length ? evs.map(e => `
            <li><span class="quando">${fmtDataHora(e.created_at)}</span>
                <span>${esc(e.ator_id ? (App.perfil?.nome || 'Equipe') : 'Cliente (formulário público)')} <b>${esc(e.acao)}</b>${
                  e.detalhe?.arquivo ? ' — ' + esc(e.detalhe.arquivo) : ''}</span></li>`).join('')
            : '<li style="color:var(--texto-fr)">Sem registros.</li>'}
        </ul>
      </div>
    </section>
  </div>`, 'lista');

  ligarSair();

  // --- ações ---
  $('#mstatus').onchange = async e => {
    const novo = e.target.value;
    const { error } = await gravar('cadastros', { status: novo }, id, 'status');
    $('#aviso-ficha').innerHTML = error
      ? `<div class="aviso aviso-erro">Erro ao mudar status: ${esc(error.message)}</div>`
      : `<div class="aviso aviso-ok">Status alterado para <b>${esc(rotStatus(novo))}</b>.</div>`;
    if (!error) registrarEvento(id, 'editou', { campo: 'status', para: novo });
  };

  $('#bobs').onclick = async () => {
    const b = $('#bobs'); b.disabled = true; b.textContent = 'Salvando…';
    const { error } = await gravar('cadastros', { observacoes: $('#obs').value.trim() || null }, id, 'observações');
    b.disabled = false; b.textContent = 'Salvar observações';
    $('#aviso-ficha').innerHTML = error
      ? `<div class="aviso aviso-erro">${esc(error.message)}</div>`
      : '<div class="aviso aviso-ok">Observações salvas.</div>';
    if (!error) registrarEvento(id, 'editou', { campo: 'observacoes' });
  };

  $$('[data-ver]').forEach(b => {
    b.onclick = async () => {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(b.dataset.ver, 300);
      if (error) { alert('Erro ao abrir: ' + error.message); return; }
      registrarEvento(id, 'visualizou_arquivo', { arquivo: b.dataset.ver.split('/').pop() });
      window.open(data.signedUrl, '_blank', 'noopener');
    };
  });

  $$('[data-baixar]').forEach(b => {
    b.onclick = async () => {
      const rot = b.textContent; b.disabled = true; b.textContent = '…';
      const { data, error } = await sb.storage.from(BUCKET)
        .createSignedUrl(b.dataset.baixar, 300, { download: b.dataset.nome });
      b.disabled = false; b.textContent = rot;
      if (error) { alert('Erro ao baixar: ' + error.message); return; }
      registrarEvento(id, 'baixou', { arquivo: b.dataset.nome });
      const a = document.createElement('a');
      a.href = data.signedUrl; a.download = b.dataset.nome;
      document.body.appendChild(a); a.click(); a.remove();
    };
  });

  const bzip = $('#bzip');
  if (bzip) bzip.onclick = async () => {
    bzip.disabled = true; bzip.innerHTML = '<span class="spin"></span> Preparando…';
    for (const a of arqs) {
      const { data, error } = await sb.storage.from(BUCKET)
        .createSignedUrl(a.storage_path, 300, { download: a.nome_original });
      if (error) continue;
      const el = document.createElement('a');
      el.href = data.signedUrl; el.download = a.nome_original;
      document.body.appendChild(el); el.click(); el.remove();
      await new Promise(r => setTimeout(r, 700)); // evita bloqueio de downloads múltiplos
    }
    registrarEvento(id, 'baixou', { arquivo: `todos (${arqs.length})` });
    bzip.disabled = false; bzip.textContent = 'Baixar todos';
  };

  $('#beditar').onclick = () => telaEditar(r, arqs || []);
}

// ============================================================================
// Tela: edição
// ============================================================================
function telaEditar(r, arqs) {
  const novos = {};

  const campo = (n, rot, val, mask) => `
    <div class="campo">
      <label for="e_${n}">${rot}</label>
      <input id="e_${n}" name="${n}" value="${esc(val ?? '')}" data-mask="${mask || ''}">
      <small class="erro hidden" data-erro="${n}"></small>
    </div>`;

  $('#app').innerHTML = layout(`
  <div class="wrap-form" style="padding-top:26px">
    <h1 style="font-size:23px;font-weight:700;letter-spacing:-.5px;margin-bottom:18px">Editar — ${esc(r.nome)}</h1>
    <div id="aviso-ed"></div>
    <form id="fe" novalidate>
      <section class="card">
        <div class="card-head"><span class="card-num">1</span><h2>Dados do cliente</h2></div>
        <div class="card-body"><div class="grid grid-2">
          ${campo('nome', 'Nome completo', r.nome)}
          ${campo('cpf', 'CPF', r.cpf ? maskCPF(r.cpf) : '', 'cpf')}
          ${campo('whatsapp', 'WhatsApp', r.whatsapp ? maskFone(r.whatsapp) : '', 'fone')}
          ${campo('email', 'E-mail', r.email)}
          ${campo('cidade', 'Cidade da instalação', r.cidade)}
          <div class="campo"><label for="e_uf">UF</label>
            <select id="e_uf" name="uf"><option value="">Selecione</option>
            ${UFS.map(u => `<option value="${u}" ${r.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        </div></div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-num">2</span><h2>Energia</h2></div>
        <div class="card-body"><div class="grid grid-2">
          ${campo('concessionaria', 'Concessionária', r.concessionaria)}
          ${campo('numero_instalacao', 'Nº da conta / instalação', r.numero_instalacao, 'ident')}
          ${campo('consumo_medio_kwh', 'Consumo médio (kWh/mês)', r.consumo_medio_kwh ? fmtInt(r.consumo_medio_kwh) : '', 'int')}
          ${campo('valor_medio_conta', 'Valor médio da conta', r.valor_medio_conta ? fmtMoeda(r.valor_medio_conta) : '', 'moeda')}
        </div></div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-num">3</span><h2>Sistema</h2></div>
        <div class="card-body"><div class="grid grid-2">
          <div class="campo"><label>Área</label><div class="radios">
            <label data-r class="${r.zona === 'urbana' ? 'sel' : ''}"><input type="radio" name="zona" value="urbana" ${r.zona === 'urbana' ? 'checked' : ''}>Urbana</label>
            <label data-r class="${r.zona === 'rural' ? 'sel' : ''}"><input type="radio" name="zona" value="rural" ${r.zona === 'rural' ? 'checked' : ''}>Rural</label>
          </div></div>
          <div class="campo"><label for="e_tipo_telhado">Tipo de telhado</label>
            <select id="e_tipo_telhado" name="tipo_telhado"><option value="">Selecione</option>
            ${TELHADOS.map(([v, rot]) => `<option value="${v}" ${r.tipo_telhado === v ? 'selected' : ''}>${esc(rot)}</option>`).join('')}</select></div>
          ${campo('kit_descricao', 'Kit de placas e inversor', r.kit_descricao)}
          ${campo('valor_proposta', 'Orçamento do concorrente', r.valor_proposta ? fmtMoeda(r.valor_proposta) : '', 'moeda')}
        </div></div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-num">4</span><h2>Adicionar documentos</h2></div>
        <div class="card-body"><div class="slots">
          ${SLOTS.map(s => {
            const jaTem = arqs.filter(a => a.slot === s.k).length;
            return `<div class="slot" data-slot="${s.k}">
              <div class="slot-top"><strong>${esc(s.rot)}</strong>
                ${jaTem ? `<span>${jaTem} já anexado(s)</span>` : ''}</div>
              <span style="font-size:12px;color:var(--texto-fr)">${esc(s.dica)}</span>
              <div><button type="button" class="slot-add" data-add="${s.k}">＋ Anexar arquivo</button>
                <input type="file" class="hidden" multiple data-input="${s.k}"
                       accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"></div>
              <ul class="arqs" data-lista="${s.k}"></ul>
            </div>`;
          }).join('')}
        </div></div>
      </section>

      <div id="prog-ed"></div>
      <div style="display:flex;gap:10px;margin-bottom:28px">
        <button type="submit" class="btn btn-primario" id="bsalvar">Salvar alterações</button>
        <button type="button" class="btn btn-neutro" id="bcancelar">Cancelar</button>
      </div>
    </form>
  </div>`, 'lista');

  ligarSair();

  const f = $('#fe');
  const masks = { cpf: maskCPF, fone: maskFone, moeda: maskMoeda, int: maskInt, ident: maskIdent };
  $$('input[data-mask]', f).forEach(el => {
    const m = masks[el.dataset.mask];
    if (m) el.addEventListener('input', () => { el.value = m(el.value); });
  });
  $$('[data-r]', f).forEach(l => l.addEventListener('click', () => {
    $$('[data-r]', f).forEach(x => x.classList.remove('sel')); l.classList.add('sel');
  }));

  function lista(slot) {
    const ul = f.querySelector(`[data-lista="${slot}"]`);
    ul.innerHTML = (novos[slot] || []).map((x, i) => `
      <li class="arq"><span class="nome">${esc(x.name)}</span>
        <span class="tam">${fmtTam(x.size)}</span>
        <button type="button" class="x" data-rm="${slot}" data-i="${i}">×</button></li>`).join('');
    ul.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      novos[slot].splice(+b.dataset.i, 1); lista(slot);
    });
  }

  SLOTS.forEach(s => {
    const inp = f.querySelector(`[data-input="${s.k}"]`);
    f.querySelector(`[data-add="${s.k}"]`).onclick = () => inp.click();
    inp.onchange = e => {
      const ok = Array.from(e.target.files).filter(x =>
        x.size <= TAM_MAX && (!x.type || MIMES_OK.includes(x.type)));
      if (ok.length < e.target.files.length) {
        $('#aviso-ed').innerHTML = '<div class="aviso aviso-erro">Alguns arquivos foram ignorados (acima de 20 MB ou formato não aceito).</div>';
      }
      novos[s.k] = (novos[s.k] || []).concat(ok);
      lista(s.k); e.target.value = '';
    };
    const z = f.querySelector(`[data-slot="${s.k}"]`);
    z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('drag'); });
    z.addEventListener('dragleave', () => z.classList.remove('drag'));
    z.addEventListener('drop', e => {
      e.preventDefault(); z.classList.remove('drag');
      novos[s.k] = (novos[s.k] || []).concat(Array.from(e.dataTransfer.files)
        .filter(x => x.size <= TAM_MAX && (!x.type || MIMES_OK.includes(x.type))));
      lista(s.k);
    });
  });

  $('#bcancelar').onclick = () => navegar('/cadastros/' + r.id);

  f.onsubmit = async ev => {
    ev.preventDefault();
    f.querySelectorAll('.erro').forEach(e => e.classList.add('hidden'));
    $('#aviso-ed').innerHTML = '';

    if (!f.elements.nome.value.trim()) {
      f.querySelector('[data-erro="nome"]').textContent = 'Informe o nome.';
      f.querySelector('[data-erro="nome"]').classList.remove('hidden');
      return;
    }
    if (f.elements.cpf.value.trim() && !cpfValido(f.elements.cpf.value)) {
      const b = f.querySelector('[data-erro="cpf"]');
      b.textContent = 'CPF inválido — confira os dígitos.'; b.classList.remove('hidden');
      return;
    }
    if (f.elements.email.value.trim() && !emailValido(f.elements.email.value)) {
      const b = f.querySelector('[data-erro="email"]');
      b.textContent = 'E-mail inválido.'; b.classList.remove('hidden');
      return;
    }

    const bt = $('#bsalvar'); bt.disabled = true; bt.innerHTML = '<span class="spin"></span> Salvando…';
    const zona = f.querySelector('input[name="zona"]:checked');

    const { error } = await gravar('cadastros', {
      nome: f.elements.nome.value.trim(),
      cpf: soDigitos(f.elements.cpf.value) || null,
      whatsapp: soDigitos(f.elements.whatsapp.value) || null,
      email: f.elements.email.value.trim() || null,
      cidade: f.elements.cidade.value.trim() || null,
      uf: f.elements.uf.value || null,
      concessionaria: f.elements.concessionaria.value.trim() || null,
      numero_instalacao: soDigitos(f.elements.numero_instalacao.value) || null,
      consumo_medio_kwh: intParaNum(f.elements.consumo_medio_kwh.value),
      valor_medio_conta: moedaParaNum(f.elements.valor_medio_conta.value),
      zona: zona ? zona.value : null,
      tipo_telhado: f.elements.tipo_telhado.value || null,
      kit_descricao: f.elements.kit_descricao.value.trim() || null,
      valor_proposta: moedaParaNum(f.elements.valor_proposta.value)
    }, r.id, 'dados do cadastro');

    if (error) {
      bt.disabled = false; bt.textContent = 'Salvar alterações';
      $('#aviso-ed').innerHTML = `<div class="aviso aviso-erro">${esc(error.message)}</div>`;
      return;
    }

    const pend = [];
    SLOTS.forEach(s => (novos[s.k] || []).forEach(file => pend.push({ slot: s.k, file })));
    const falhas = [];
    if (pend.length) {
      $('#prog-ed').innerHTML = `<div class="aviso aviso-info">Enviando ${pend.length} arquivo(s)…</div>`;
      for (const { slot, file } of pend) {
        const caminho = `${r.id}/${slot}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
        const up = await sb.storage.from(BUCKET).upload(caminho, file, {
          contentType: file.type || 'application/octet-stream'
        });
        if (up.error) { falhas.push(file.name); continue; }
        const ins = await sb.from('cadastro_arquivos').insert({
          cadastro_id: r.id, slot, storage_path: caminho, nome_original: file.name,
          mime_type: file.type || null, tamanho_bytes: file.size, uploaded_by: App.user.id
        });
        if (ins.error) falhas.push(file.name);
      }
    }

    await registrarEvento(r.id, 'editou', { arquivos_novos: pend.length - falhas.length });

    if (falhas.length) {
      bt.disabled = false; bt.textContent = 'Salvar alterações';
      $('#prog-ed').innerHTML = `<div class="aviso aviso-erro">Dados salvos, mas ${falhas.length} arquivo(s) falharam: ${esc(falhas.join(', '))}</div>`;
      return;
    }
    navegar('/cadastros/' + r.id);
  };
}

// ============================================================================
// Render / bootstrap
// ============================================================================
// Rotas do painel. `/` NÃO está aqui: aquela rota é servida pelo index.html,
// a página pública. Quem cair em `/` vindo daqui sai da aplicação de propósito.
function render() {
  const p = location.pathname.replace(/\/+$/, '') || '/';

  // Sem sessão, tudo dentro do painel vira a tela de login.
  if (!App.user) { telaLogin(); return; }

  const ficha = p.match(/^\/cadastros\/([0-9a-f-]{36})$/i);
  if (ficha)            return telaFicha(ficha[1]);
  if (p === '/cadastros') return telaLista();
  if (p === '/novo')      return telaFormulario();
  if (p === '/login')     return navegar('/cadastros', true);
  navegar('/cadastros', true);
}

async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { telaLogin(); return; }

  App.user = session.user;
  const { data: perfil } = await sb.from('perfis').select('*').eq('id', session.user.id).maybeSingle();

  if (!perfil || !perfil.ativo) {
    await sb.auth.signOut();
    App.user = null;
    telaLogin('Este e-mail não tem acesso liberado ao painel. Fale com o administrador.');
    return;
  }
  App.perfil = perfil;

  // Quem acabou de entrar pela tela de login cai na lista, não numa rota vazia.
  const p = location.pathname.replace(/\/+$/, '') || '/';
  if (p === '/login' || p === '/') { navegar('/cadastros', true); return; }
  render();
}

sb.auth.onAuthStateChange((evt) => {
  if (evt === 'SIGNED_OUT') { App.user = null; App.perfil = null; telaLogin(); }
});

iniciar();
