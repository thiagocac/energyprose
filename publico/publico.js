// ============================================================================
// EnergyPRO — formulário público (/)
//
// Quem preenche aqui é o próprio cliente, sem login. O caminho de gravação é
// diferente do painel de propósito:
//
//   painel  → INSERT direto em `cadastros` (RLS exige usuário da equipe)
//   público → RPC `cadastro_publico()`, única porta de escrita do anônimo
//
// O role `anon` NÃO tem policy de select/insert/update/delete em `cadastros`.
// Ou seja: quem envia o cadastro não consegue nem ler o próprio de volta, e
// nada do que for adulterado neste arquivo abre acesso a dado de terceiro —
// a validação que vale é a da função no banco (migration 06).
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  SUPABASE_URL, SUPABASE_KEY, BUCKET,
  SLOTS, TELHADOS, UFS, MAX_ARQUIVOS_PUBLICO,
  esc, soDigitos, maskCPF, maskFone, maskMoeda, maskInt, maskIdent,
  moedaParaNum, intParaNum, fmtTam, fmtInt, fmtMoeda,
  cpfValido, emailValido, nomeSeguro, recusaArquivo, rotTelhado
} from './comum.js';

// Número que recebe o resumo por WhatsApp se a gravação falhar (só dígitos,
// com DDI 55). Vazio = o botão de contingência não aparece.
const WHATSAPP_DESTINO = '';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const CONCESSIONARIAS = [
  'CEMIG','CPFL Paulista','CPFL Piratininga','Enel SP','Enel RJ','Enel CE','Light','Copel',
  'Celesc','RGE','EDP SP','EDP ES','Elektro','Neoenergia Coelba','Neoenergia Pernambuco',
  'Neoenergia Cosern','Neoenergia Brasília','Equatorial Goiás','Equatorial Pará',
  'Equatorial Maranhão','Equatorial Piauí','Equatorial Alagoas','Energisa MT','Energisa MS',
  'Energisa MG','Energisa PB','Energisa SE','Energisa TO','Amazonas Energia','Roraima Energia','Outra'
];

// Os 13 campos que contam na barra de progresso — mesma lista do formulário
// original. `uf` foi acrescentado depois e fica de fora da contagem para o
// "x de 18 itens" continuar batendo com o que o cliente via antes.
const CAMPOS = [
  { n: 'nome',              rot: 'Nome completo',            ph: 'Como consta no documento', auto: 'name', largo: true },
  { n: 'cpf',               rot: 'CPF',                      ph: '000.000.000-00', mask: maskCPF, modo: 'numeric', max: 14 },
  { n: 'whatsapp',          rot: 'WhatsApp',                 ph: '(00) 00000-0000', mask: maskFone, tipo: 'tel', modo: 'tel', max: 16 },
  { n: 'email',             rot: 'E-mail',                   ph: 'nome@email.com', tipo: 'email', auto: 'email' },
  { n: 'cidade',            rot: 'Cidade da instalação',     ph: 'Sua cidade' },
  { n: 'concessionaria',    rot: 'Concessionária',           ph: 'Selecione ou digite', lista: 'ep-conc' },
  { n: 'numero_instalacao', rot: 'Nº da conta / instalação', ph: 'Código do cliente na conta', mask: maskIdent, modo: 'numeric', max: 20 },
  { n: 'consumo_medio_kwh', rot: 'Consumo médio (kWh/mês)',  ph: 'Ex.: 480', mask: maskInt, modo: 'numeric' },
  { n: 'valor_medio_conta', rot: 'Valor médio da conta',     ph: 'R$ 0,00', mask: maskMoeda, modo: 'numeric' },
  { n: 'valor_proposta',    rot: 'Valor da proposta',        ph: 'R$ 0,00', mask: maskMoeda, modo: 'numeric' },
  { n: 'kit_descricao',     rot: 'Kit de placas e inversor', ph: 'Ex.: 12 placas 585W + inversor 5 kW', area: true, largo: true }
];
const TOTAL_ITENS = 13 + SLOTS.length;   // 11 campos + Área + Tipo de telhado + 5 anexos

const RASCUNHO = 'energypro-cadastro-publico';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const campo = n => CAMPOS.find(c => c.n === n);

const tela = () => $('#tela');
const arquivos = {};      // slot -> File[]
let enviando = false;

// ============================================================================
// Formulário
// ============================================================================
function campoHTML(c) {
  const comum = `id="f_${c.n}" name="${c.n}" placeholder="${esc(c.ph || '')}"`;
  const entrada = c.area
    ? `<textarea ${comum} rows="3"></textarea>`
    : `<input ${comum} type="${c.tipo || 'text'}"
         ${c.modo ? `inputmode="${c.modo}"` : ''}
         ${c.max ? `maxlength="${c.max}"` : ''}
         ${c.lista ? `list="${c.lista}"` : ''}
         ${c.auto ? `autocomplete="${c.auto}"` : 'autocomplete="off"'}>`;
  return `
    <label class="campo ${c.largo ? 'largo' : ''}">
      <span class="rot">${esc(c.rot)}${c.n === 'nome' ? ' *' : ''}</span>
      ${entrada}
      <small class="erro-campo oculto" data-erro="${c.n}"></small>
    </label>`;
}

function desenharFormulario() {
  tela().innerHTML = `
  <div class="cabeca">
    <h2>Cadastro do cliente e do projeto</h2>
    <p>Preencha apenas o que souber agora. Você pode deixar campos em branco e enviar
       mesmo assim — o que faltar a gente combina no contato.</p>
  </div>

  <form id="fp" novalidate>

    <!-- Campo isca: fica escondido e nenhum humano preenche. Se vier
         preenchido, o banco descarta o envio sem gravar nada. -->
    <div aria-hidden="true" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden">
      <label>Não preencha este campo
        <input type="text" name="_isca" tabindex="-1" autocomplete="off"></label>
    </div>

    <fieldset>
      <legend><span class="num">1</span><span class="tit">Dados do cliente</span></legend>
      <div class="linhas">
        ${campoHTML(campo('nome'))}
        ${campoHTML(campo('cpf'))}
        ${campoHTML(campo('whatsapp'))}
        ${campoHTML(campo('email'))}
        ${campoHTML(campo('cidade'))}
        <label class="campo">
          <span class="rot">UF</span>
          <select id="f_uf" name="uf">
            <option value="">Selecione</option>
            ${UFS.map(u => `<option value="${u}">${u}</option>`).join('')}
          </select>
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend><span class="num">2</span><span class="tit">Energia</span></legend>
      <div class="linhas">
        ${campoHTML(campo('concessionaria'))}
        ${campoHTML(campo('numero_instalacao'))}
        ${campoHTML(campo('consumo_medio_kwh'))}
        ${campoHTML(campo('valor_medio_conta'))}
      </div>
      <datalist id="ep-conc">
        ${CONCESSIONARIAS.map(c => `<option value="${esc(c)}"></option>`).join('')}
      </datalist>
    </fieldset>

    <fieldset>
      <legend><span class="num">3</span><span class="tit">Sistema</span></legend>
      <div class="linhas">
        <div class="campo">
          <span class="rot">Área</span>
          <div class="opcoes">
            <label data-opcao><input type="radio" name="zona" value="urbana">Urbana</label>
            <label data-opcao><input type="radio" name="zona" value="rural">Rural</label>
          </div>
        </div>
        <label class="campo">
          <span class="rot">Tipo de telhado</span>
          <select id="f_tipo_telhado" name="tipo_telhado">
            <option value="">Selecione</option>
            ${TELHADOS.map(([v, r]) => `<option value="${v}">${esc(r)}</option>`).join('')}
          </select>
        </label>
        ${campoHTML(campo('valor_proposta'))}
        ${campoHTML(campo('kit_descricao'))}
      </div>
    </fieldset>

    <fieldset>
      <legend><span class="num">4</span><span class="tit">Documentos</span></legend>
      <p style="font-size:15px;line-height:1.55;color:var(--texto-md);margin-bottom:18px">
        Toque para escolher no celular ou arraste os arquivos. Pode anexar mais de um em
        cada item — PDF, JPG ou PNG, até 20 MB cada. Todos são opcionais.
      </p>
      <div class="anexos">
        ${SLOTS.map(s => `
        <div class="anexo-slot" data-slot="${s.k}">
          <div class="anexo-topo"><strong>${esc(s.rot)}</strong><em>${esc(s.dica)}</em></div>
          <button type="button" class="anexo-add" data-add="${s.k}">＋ Anexar arquivo</button>
          <input type="file" class="oculto" multiple data-input="${s.k}"
                 accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif">
          <ul class="arqs" data-lista="${s.k}"></ul>
        </div>`).join('')}
      </div>
    </fieldset>

    <fieldset>
      <label class="lgpd">
        <input type="checkbox" id="lgpd">
        <span>Autorizo a EnergyPRO a coletar e usar os dados e documentos deste formulário
          para elaborar e executar a minha proposta de energia solar. Posso pedir a correção
          ou a exclusão desses dados a qualquer momento. *</span>
      </label>
      <small class="erro-campo oculto" data-erro="lgpd" style="margin-top:8px;display:block"></small>
    </fieldset>

    <div id="aviso"></div>
    <div id="progresso-upload"></div>

    <div class="rodape-form">
      <div class="rodape-in">
        <div class="barra">
          <div class="trilho"><i id="pb"></i></div>
          <small id="pl">0 de ${TOTAL_ITENS} itens preenchidos</small>
        </div>
        <button type="submit" class="b b-enviar b-grande" id="bt-enviar">Enviar cadastro</button>
      </div>
    </div>
  </form>`;

  ligar();
  recuperarRascunho();
  recontar();
}

// ============================================================================
// Interação
// ============================================================================
function ligar() {
  const f = $('#fp');

  CAMPOS.forEach(c => {
    const el = f.elements[c.n];
    if (!el) return;
    el.addEventListener('input', () => {
      if (c.mask) {
        const pos = el.selectionStart, antes = el.value.length;
        el.value = c.mask(el.value);
        if (pos !== null && pos < antes) {
          const d = el.value.length - antes;
          el.setSelectionRange(pos + d, pos + d);
        }
      }
      limparErro(c.n);
      recontar(); salvarRascunho();
    });
  });

  $$('[data-opcao]', f).forEach(l => l.addEventListener('click', () => {
    $$('[data-opcao]', f).forEach(x => x.classList.remove('sel'));
    l.classList.add('sel');
    recontar(); salvarRascunho();
  }));

  f.elements.tipo_telhado.addEventListener('change', () => { recontar(); salvarRascunho(); });
  f.elements.uf.addEventListener('change', salvarRascunho);

  SLOTS.forEach(s => {
    const zona  = f.querySelector(`[data-slot="${s.k}"]`);
    const input = f.querySelector(`[data-input="${s.k}"]`);
    f.querySelector(`[data-add="${s.k}"]`).onclick = () => input.click();
    input.onchange = e => { adicionar(s.k, e.target.files); e.target.value = ''; };
    zona.addEventListener('dragover',  e => { e.preventDefault(); zona.classList.add('arrasta'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('arrasta'));
    zona.addEventListener('drop', e => {
      e.preventDefault(); zona.classList.remove('arrasta');
      adicionar(s.k, e.dataTransfer.files);
    });
  });

  $('#lgpd').addEventListener('change', () => limparErro('lgpd'));
  f.onsubmit = enviar;
}

function limparErro(nome) {
  const box = document.querySelector(`[data-erro="${nome}"]`);
  if (box) box.classList.add('oculto');
  const el = $('#fp').elements[nome];
  if (el && el.setAttribute) el.setAttribute('aria-invalid', 'false');
}

function erroCampo(nome, msg) {
  const box = document.querySelector(`[data-erro="${nome}"]`);
  if (box) { box.textContent = msg; box.classList.remove('oculto'); }
  const el = $('#fp').elements[nome];
  if (el && el.setAttribute) el.setAttribute('aria-invalid', 'true');
}

function recontar() {
  const f = $('#fp'); if (!f) return;
  let n = 0;
  CAMPOS.forEach(c => { const el = f.elements[c.n]; if (el && el.value.trim()) n++; });
  if (f.querySelector('input[name="zona"]:checked')) n++;
  if (f.elements.tipo_telhado.value) n++;
  SLOTS.forEach(s => { if ((arquivos[s.k] || []).length) n++; });
  $('#pb').style.width = Math.round((n / TOTAL_ITENS) * 100) + '%';
  $('#pl').textContent = `${n} de ${TOTAL_ITENS} itens preenchidos`;
}

function totalArquivos() {
  return SLOTS.reduce((t, s) => t + (arquivos[s.k] || []).length, 0);
}

function desenharLista(slot) {
  const ul = document.querySelector(`[data-lista="${slot}"]`);
  const lista = arquivos[slot] || [];
  ul.innerHTML = lista.map((f, i) => `
    <li class="arq">
      <span class="nome">${esc(f.name)}</span>
      <span class="tam">${fmtTam(f.size)}</span>
      <button type="button" class="x" data-rm="${i}" title="Remover">✕</button>
    </li>`).join('');
  ul.querySelectorAll('[data-rm]').forEach(b => {
    b.onclick = () => { arquivos[slot].splice(+b.dataset.rm, 1); desenharLista(slot); recontar(); };
  });
}

function adicionar(slot, files) {
  const novos = Array.from(files || []);
  if (!novos.length) return;

  const recusados = [];
  let aceitos = [];
  novos.forEach(f => {
    const motivo = recusaArquivo(f);
    if (motivo) recusados.push(`${f.name} (${motivo})`); else aceitos.push(f);
  });

  // Teto igual ao da policy no banco: mais que isso o upload seria recusado
  // lá na frente, então é melhor avisar aqui.
  const espaco = MAX_ARQUIVOS_PUBLICO - totalArquivos();
  if (aceitos.length > espaco) {
    recusados.push(`${aceitos.length - Math.max(espaco, 0)} arquivo(s) além do limite de ${MAX_ARQUIVOS_PUBLICO}`);
    aceitos = aceitos.slice(0, Math.max(espaco, 0));
  }

  $('#aviso').innerHTML = recusados.length
    ? `<div class="aviso aviso-erro">Não anexados: ${esc(recusados.join('; '))}</div>` : '';

  if (!aceitos.length) return;
  arquivos[slot] = (arquivos[slot] || []).concat(aceitos);
  desenharLista(slot);
  recontar();
}

// ============================================================================
// Rascunho — sessionStorage, não localStorage
// O formulário original guardava CPF em localStorage por tempo indeterminado.
// Aqui o rascunho morre junto com a aba e é apagado assim que o envio dá certo.
// Arquivos nunca entram no rascunho (não são serializáveis).
// ============================================================================
function salvarRascunho() {
  clearTimeout(salvarRascunho._t);
  salvarRascunho._t = setTimeout(() => {
    try {
      const f = $('#fp'); if (!f) return;
      const d = {};
      CAMPOS.forEach(c => { const el = f.elements[c.n]; if (el && el.value.trim()) d[c.n] = el.value; });
      if (f.elements.uf.value) d.uf = f.elements.uf.value;
      if (f.elements.tipo_telhado.value) d.tipo_telhado = f.elements.tipo_telhado.value;
      const z = f.querySelector('input[name="zona"]:checked');
      if (z) d.zona = z.value;
      sessionStorage.setItem(RASCUNHO, JSON.stringify(d));
    } catch (_) { /* modo anônimo/quota — rascunho é conveniência, não requisito */ }
  }, 400);
}

function recuperarRascunho() {
  let d;
  try { d = JSON.parse(sessionStorage.getItem(RASCUNHO) || 'null'); } catch (_) { return; }
  if (!d) return;
  const f = $('#fp');
  Object.entries(d).forEach(([k, v]) => {
    if (k === 'zona') {
      const r = f.querySelector(`input[name="zona"][value="${v}"]`);
      if (r) { r.checked = true; r.closest('[data-opcao]').classList.add('sel'); }
      return;
    }
    const el = f.elements[k];
    if (el && el.type !== 'file') el.value = v;
  });
}

const limparRascunho = () => { try { sessionStorage.removeItem(RASCUNHO); } catch (_) {} };

// ============================================================================
// Envio
// ============================================================================
function validar(f) {
  let erros = 0, primeiro = null;
  const falha = (n, msg, el) => { erroCampo(n, msg); erros++; primeiro = primeiro || el; };

  if (!f.elements.nome.value.trim()) {
    falha('nome', 'Informe seu nome completo.', f.elements.nome);
  } else if (f.elements.nome.value.trim().length < 3) {
    falha('nome', 'Nome muito curto.', f.elements.nome);
  }
  if (f.elements.cpf.value.trim() && !cpfValido(f.elements.cpf.value)) {
    falha('cpf', 'CPF inválido — confira os dígitos.', f.elements.cpf);
  }
  if (f.elements.email.value.trim() && !emailValido(f.elements.email.value)) {
    falha('email', 'E-mail inválido.', f.elements.email);
  }
  if (f.elements.whatsapp.value.trim() && soDigitos(f.elements.whatsapp.value).length < 10) {
    falha('whatsapp', 'Telefone incompleto (DDD + número).', f.elements.whatsapp);
  }
  if (!$('#lgpd').checked) {
    falha('lgpd', 'Precisamos da sua autorização para usar os dados.', $('#lgpd'));
  }
  return { erros, primeiro };
}

function montarDados(f) {
  const zona = f.querySelector('input[name="zona"]:checked');
  const num  = v => { const n = v; return n === null || n === undefined ? null : String(n); };
  return {
    nome:              f.elements.nome.value.trim(),
    cpf:               soDigitos(f.elements.cpf.value) || null,
    whatsapp:          soDigitos(f.elements.whatsapp.value) || null,
    email:             f.elements.email.value.trim() || null,
    cidade:            f.elements.cidade.value.trim() || null,
    uf:                f.elements.uf.value || null,
    concessionaria:    f.elements.concessionaria.value.trim() || null,
    numero_instalacao: soDigitos(f.elements.numero_instalacao.value) || null,
    // A função no banco recebe número como texto e valida com regex antes de
    // converter — evita que um valor estranho vire erro 500 no PostgREST.
    consumo_medio_kwh: num(intParaNum(f.elements.consumo_medio_kwh.value)),
    valor_medio_conta: num(moedaParaNum(f.elements.valor_medio_conta.value)),
    zona:              zona ? zona.value : null,
    tipo_telhado:      f.elements.tipo_telhado.value || null,
    kit_descricao:     f.elements.kit_descricao.value.trim() || null,
    valor_proposta:    num(moedaParaNum(f.elements.valor_proposta.value)),
    consentimento:     true,
    _isca:             f.elements._isca.value || ''
  };
}

async function enviar(ev) {
  ev.preventDefault();
  if (enviando) return;

  const f = $('#fp');
  $('#aviso').innerHTML = '';
  $$('.erro-campo').forEach(e => e.classList.add('oculto'));

  const { erros, primeiro } = validar(f);
  if (erros) {
    $('#aviso').innerHTML = `<div class="aviso aviso-erro">Corrija ${
      erros === 1 ? 'o campo indicado' : `os ${erros} campos indicados`} para enviar.</div>`;
    if (primeiro) primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  enviando = true;
  const bt = $('#bt-enviar');
  bt.disabled = true;
  bt.innerHTML = '<span class="spin"></span> Enviando…';

  const dados = montarDados(f);

  const { data: id, error } = await sb.rpc('cadastro_publico', { dados });

  if (error || !id) {
    enviando = false;
    bt.disabled = false;
    bt.textContent = 'Enviar cadastro';
    falhaNoEnvio(error, dados);
    return;
  }

  // ---- anexos ----
  const pendentes = [];
  SLOTS.forEach(s => (arquivos[s.k] || []).forEach(file => pendentes.push({ slot: s.k, file })));
  const falhas = await subirArquivos(id, pendentes);

  await sb.rpc('cadastro_publico_finalizar', {
    p_id: id, p_arquivos: pendentes.length - falhas.length
  });

  limparRascunho();
  telaEnviado(id, dados, pendentes.length, falhas);
}

async function subirArquivos(id, pendentes) {
  const falhas = [];
  if (!pendentes.length) return falhas;

  const cx = $('#progresso-upload');
  cx.innerHTML = `<div class="aviso aviso-info" style="margin-bottom:10px">
      Enviando ${pendentes.length} arquivo(s). Não feche a página.</div>
    <div id="up-linhas"></div>`;
  $('#up-linhas').innerHTML = pendentes.map((p, i) => `
    <div class="up-linha">
      <span style="flex:0 0 44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.file.name)}</span>
      <span class="mini"><i id="up${i}"></i></span>
      <span id="us${i}" style="flex:none;color:var(--texto-md)">aguardando</span>
    </div>`).join('');

  for (let i = 0; i < pendentes.length; i++) {
    const { slot, file } = pendentes[i];
    $('#us' + i).textContent = 'enviando';
    $('#up' + i).style.width = '45%';

    const caminho = `${id}/${slot}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
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
      cadastro_id: id, slot, storage_path: caminho,
      nome_original: file.name, mime_type: file.type || null,
      tamanho_bytes: file.size, uploaded_by: null
    });
    if (reg.error) {
      falhas.push(file.name);
      $('#us' + i).textContent = 'falhou';
      continue;
    }

    $('#up' + i).style.width = '100%';
    $('#us' + i).textContent = 'ok';
  }
  return falhas;
}

// Gravar falhou. Em vez de deixar o cliente na mão, mostra o motivo e oferece
// o resumo para mandar por WhatsApp — que era exatamente o que o formulário
// antigo fazia sempre.
function falhaNoEnvio(error, dados) {
  const msg = error?.message || 'não foi possível falar com o servidor';
  const txt = resumoTexto(dados, totalArquivos());
  const wa = WHATSAPP_DESTINO ? `https://wa.me/${WHATSAPP_DESTINO}?text=${encodeURIComponent(txt)}` : null;

  $('#aviso').innerHTML = `
    <div class="aviso aviso-erro">
      <strong>Não conseguimos salvar seu cadastro.</strong><br>${esc(msg)}
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="b b-linha" id="bt-tentar">Tentar de novo</button>
        ${wa ? `<a class="b b-linha" href="${wa}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ''}
        <button type="button" class="b b-linha" id="bt-copiar">Copiar meus dados</button>
      </div>
    </div>`;
  $('#bt-tentar').onclick = () => $('#fp').requestSubmit();
  $('#bt-copiar').onclick = async () => {
    try { await navigator.clipboard.writeText(txt); $('#bt-copiar').textContent = 'Copiado'; }
    catch (_) { $('#bt-copiar').textContent = 'Não foi possível copiar'; }
  };
  $('#aviso').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================================================
// Confirmação
// ============================================================================
function resumoTexto(d, nArq) {
  const L = ['*CADASTRO ENERGYPRO*', new Date().toLocaleString('pt-BR')];
  const bloco = (t, pares) => {
    const linhas = pares.filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (linhas.length) L.push('', t, ...linhas.map(([k, v]) => `${k}: ${v}`));
  };
  bloco('1. CLIENTE', [
    ['Nome', d.nome], ['CPF', d.cpf && maskCPF(d.cpf)], ['WhatsApp', d.whatsapp && maskFone(d.whatsapp)],
    ['E-mail', d.email], ['Cidade', [d.cidade, d.uf].filter(Boolean).join('/')]
  ]);
  bloco('2. ENERGIA', [
    ['Concessionária', d.concessionaria], ['Nº instalação', d.numero_instalacao],
    ['Consumo médio', d.consumo_medio_kwh && fmtInt(Number(d.consumo_medio_kwh)) + ' kWh/mês'],
    ['Valor médio da conta', d.valor_medio_conta && fmtMoeda(Number(d.valor_medio_conta))]
  ]);
  bloco('3. SISTEMA', [
    ['Área', d.zona && (d.zona === 'urbana' ? 'Urbana' : 'Rural')],
    ['Tipo de telhado', d.tipo_telhado && rotTelhado(d.tipo_telhado)],
    ['Kit', d.kit_descricao],
    ['Valor da proposta', d.valor_proposta && fmtMoeda(Number(d.valor_proposta))]
  ]);
  L.push('', '4. DOCUMENTOS', nArq ? `${nArq} arquivo(s) anexado(s)` : 'Nenhum arquivo anexado');
  return L.join('\n');
}

function telaEnviado(id, dados, total, falhas) {
  const protocolo = String(id).slice(0, 8).toUpperCase();
  const enviados = total - falhas.length;
  const txt = resumoTexto(dados, enviados) + `\n\nProtocolo: ${protocolo}`;

  tela().innerHTML = `
  <div class="enviado">
    <span class="check">✓</span>
    <h2>Cadastro enviado</h2>
    <p>Recebemos seus dados${enviados ? ` e ${enviados} arquivo(s)` : ''}, ${esc(dados.nome.split(' ')[0])}.
       Nossa equipe analisa e retorna com a proposta em até 24 horas úteis.</p>
    <p style="margin-top:8px">Guarde o número de protocolo: <strong>${esc(protocolo)}</strong>.</p>

    ${falhas.length ? `<div class="aviso aviso-erro" style="margin-top:20px">
      ${falhas.length} arquivo(s) não subiram (${esc(falhas.join(', '))}).
      Seu cadastro foi salvo mesmo assim — a equipe vai pedir esses documentos no contato.</div>` : ''}

    <div class="acoes">
      <button type="button" class="b b-sol" id="bt-novo">Fazer um novo cadastro</button>
      <button type="button" class="b b-linha" id="bt-copiar2">Copiar meus dados</button>
    </div>
    <div class="protocolo">${esc(txt)}</div>
  </div>`;

  SLOTS.forEach(s => delete arquivos[s.k]);
  enviando = false;

  $('#bt-novo').onclick = () => {
    desenharFormulario();
    document.getElementById('formulario').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#bt-copiar2').onclick = async () => {
    try { await navigator.clipboard.writeText(txt); $('#bt-copiar2').textContent = 'Copiado'; }
    catch (_) { $('#bt-copiar2').textContent = 'Não foi possível copiar'; }
  };
  window.scrollTo({ top: document.getElementById('formulario').offsetTop - 20, behavior: 'smooth' });
}

// ============================================================================
// Início
// ============================================================================
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ir-form]');
  if (!b) return;
  document.getElementById('formulario').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const primeiro = document.getElementById('f_nome');
  if (primeiro) setTimeout(() => primeiro.focus({ preventScroll: true }), 450);
});

desenharFormulario();

export { desenharFormulario, resumoTexto, montarDados, validar, TOTAL_ITENS };
