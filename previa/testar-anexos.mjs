// ============================================================================
// Teste de ponta a ponta dos ANEXOS do painel de Cadastros.
//
// POR QUE ELE EXISTE: eu quebrei o envio de anexos duas vezes em dois dias, e
// nenhuma das duas foi pega por `tsc`, `vite build` ou pelos testes de unidade —
// porque o painel legado não passa por nenhum dos três. O defeito também não
// era de dado nem de permissão: era CONTROLE DE FLUXO. O arquivo era salvo e o
// laço de upload, logo abaixo, nunca chegava a rodar.
//
// A única forma de pegar isso é executar a tela de verdade e conferir se a
// chamada de upload aconteceu. É o que este arquivo faz:
//
//   - roda o `app.js` REAL num Chromium de verdade;
//   - devolve o supabase-js de um pacote local, porque o esm.sh não é
//     alcançável daqui (e porque teste não deve depender de CDN);
//   - intercepta TODA a rede para supabase.co e responde com dublês que
//     REGISTRAM cada chamada;
//   - no fim, afirma que o PUT no bucket e o INSERT em `cadastro_arquivos`
//     aconteceram, com o slot e o nome certos.
//
// Nada aqui toca a produção: o Playwright aborta qualquer pedido que escape
// dos dublês.
//
//   node previa/testar-anexos.mjs
// ============================================================================
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORTA = 4180;
const BASE = `http://127.0.0.1:${PORTA}`;
const PROJETO = 'mgcgmdiymqpxcsxhelhs.supabase.co';
const SUPABASE_LOCAL = '/tmp/harness-anexos/supabase.js';
const AQUI = (p) => fileURLToPath(new URL(p, import.meta.url));

// O teste se vira sozinho: monta o supabase-js a partir do node_modules (o
// esm.sh não é alcançável, e teste não deve depender de CDN) e sobe o servidor
// estático com as mesmas rotas do Netlify.
if (!existsSync(SUPABASE_LOCAL)) {
  mkdirSync('/tmp/harness-anexos', { recursive: true });
  execFileSync('npx', ['esbuild', 'node_modules/@supabase/supabase-js/dist/index.mjs',
    '--bundle', '--format=esm', '--platform=browser', `--outfile=${SUPABASE_LOCAL}`],
    { cwd: AQUI('..'), stdio: 'pipe' });
}
const servidor = spawn(process.execPath, [AQUI('servir-publico.mjs'), String(PORTA)],
  { stdio: 'ignore', detached: false });
const encerrar = () => { try { servidor.kill(); } catch { /* já morreu */ } };
process.on('exit', encerrar);
await new Promise((r) => setTimeout(r, 900));

const USUARIO = { id: '11111111-1111-4111-8111-111111111111', email: 'teste@energypro' };
const CADASTRO = {
  id: '22222222-2222-4222-8222-222222222222',
  nome: 'Cliente de Teste', cpf: null, whatsapp: '77988112233', email: null,
  cidade: 'Vitória da Conquista', uf: 'BA', concessionaria: 'Neoenergia Coelba',
  numero_instalacao: null, consumo_medio_kwh: 500, valor_medio_conta: null,
  zona: 'urbana', tipo_telhado: 'ceramico_colonial', kit_descricao: null,
  valor_proposta: null, status: 'novo', origem: 'equipe', observacoes: null,
  created_at: '2026-08-01T12:00:00Z', created_by: USUARIO.id,
};

const NOVO_ID = '33333333-3333-4333-8333-333333333333';
const chamadas = [];   // tudo o que a tela tentou fazer na rede do Supabase
const registrar = (o) => { chamadas.push(o); };

function json(corpo, status = 200, pedido = null) {
  // ARMADILHA DO DUBLÊ: com `.single()`, o supabase-js manda
  // `Accept: application/vnd.pgrst.object+json` e o PostgREST responde um
  // OBJETO, não uma lista. Um dublê que devolve lista faz a tela receber um
  // array onde espera um registro — e o defeito parece ser da aplicação.
  const querObjeto = (pedido?.headers()['accept'] ?? '').includes('vnd.pgrst.object');
  const saida = querObjeto && Array.isArray(corpo) ? (corpo[0] ?? null) : corpo;
  return {
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' },
    body: JSON.stringify(saida),
  };
}

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });

// ARMADILHA: no Playwright vale a rota registrada POR ÚLTIMO. O curinga tem de
// vir ANTES dos específicos, senão ele engole tudo — inclusive o supabase-js.
await ctx.route('**', (rota) => {
  const u = rota.request().url();
  if (u.startsWith(BASE)) return rota.continue();
  console.log('   (pedido externo bloqueado:', u.slice(0, 80) + ')');
  return rota.abort();
});

// O supabase-js vem de um arquivo local. Sem isto o import do esm.sh falha e a
// página não boota — e um teste que depende de CDN não é um teste.
await ctx.route('**/esm.sh/**', (rota) => rota.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: readFileSync(SUPABASE_LOCAL, 'utf8'),
}));

await ctx.route(`**://${PROJETO}/**`, (rota) => {
  const pedido = rota.request();
  const url = new URL(pedido.url());
  const caminho = url.pathname;
  const metodo = pedido.method();
  registrar({ metodo, caminho, corpo: pedido.postData() });

  if (metodo === 'OPTIONS') return rota.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

  // ---- Auth ----
  if (caminho.startsWith('/auth/v1/user')) return rota.fulfill(json(USUARIO));
  if (caminho.startsWith('/auth/v1/token')) {
    return rota.fulfill(json({ access_token: 'fake', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USUARIO }));
  }
  if (caminho.startsWith('/auth/v1/logout')) return rota.fulfill(json({}, 204));

  // ---- Storage: A CHAMADA QUE IMPORTA ----
  if (caminho.startsWith('/storage/v1/object/')) {
    return rota.fulfill(json({ Key: caminho.replace('/storage/v1/object/', '') }));
  }

  // ---- REST ----
  if (caminho.startsWith('/rest/v1/perfis')) {
    return rota.fulfill(json([{ id: USUARIO.id, nome: 'Equipe Teste', email: USUARIO.email, papel: 'admin', ativo: true }], 200, pedido));
  }
  if (caminho.startsWith('/rest/v1/cadastro_arquivos')) return rota.fulfill(json(metodo === 'POST' ? [{ id: 'a1' }] : [], 200, pedido));
  if (caminho.startsWith('/rest/v1/cadastro_eventos')) return rota.fulfill(json(metodo === 'POST' ? [{ id: 'e1' }] : [], 200, pedido));
  if (caminho.startsWith('/rest/v1/cadastros')) {
    // O PATCH pede `.select('id')` de volta: devolver lista vazia aqui faria
    // `gravar()` dizer "nada foi salvo". Devolvemos a linha, como o banco faz.
    if (metodo === 'PATCH') return rota.fulfill(json([{ id: CADASTRO.id }], 200, pedido));
    if (metodo === 'POST') return rota.fulfill(json([{ ...CADASTRO, id: NOVO_ID }], 201, pedido));
    return rota.fulfill(json([CADASTRO], 200, pedido));
  }
  return rota.fulfill(json([], 200, pedido));
});

const pag = await ctx.newPage();
const errosDeConsole = [];
pag.on('pageerror', (e) => errosDeConsole.push('pageerror: ' + e.message));
pag.on('console', (m) => {
  // O ERR_FAILED é o Google Fonts, que o próprio teste bloqueia de propósito.
  const txt = m.text();
  if (m.type() === 'error' && !txt.includes('net::ERR_FAILED')) errosDeConsole.push(txt);
});

// Semeia a sessão antes de a página bootar: `sb.auth.getSession()` lê daqui.
await pag.addInitScript(({ ref, user }) => {
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: 'fake', token_type: 'bearer', refresh_token: 'r',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user,
  }));
}, { ref: PROJETO.split('.')[0], user: USUARIO });

const falhas = [];
const conferir = (ok, oQue) => {
  console.log((ok ? '  ok    ' : '  FALHA ') + oQue);
  if (!ok) falhas.push(oQue);
};

// ---------------------------------------------------------------------------
console.log('\n1) EDIÇÃO de um cadastro existente — anexar e salvar\n');
// ---------------------------------------------------------------------------
await pag.goto(`${BASE}/cadastros/${CADASTRO.id}`, { waitUntil: 'networkidle' });
await pag.waitForTimeout(800);

conferir(await pag.getByText('Cliente de Teste').first().isVisible(), 'a ficha do cliente abriu');

await pag.locator('#beditar').click();
await pag.waitForTimeout(500);
conferir(await pag.locator('input[type="file"]').first().count() > 0, 'a tela de edição abriu com campos de anexo');

chamadas.length = 0;   // conta só o que a gravação fizer

await pag.locator('input[type="file"]').first().setInputFiles({
  name: 'conta-de-energia.pdf', mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 conta de energia de teste'),
});
await pag.waitForTimeout(300);
await pag.getByRole('button', { name: /Salvar alterações/ }).click();
await pag.waitForTimeout(1500);

const uploads = chamadas.filter((c) => c.caminho.includes('/storage/v1/object/') && c.metodo === 'POST');
const insercoes = chamadas.filter((c) => c.caminho.startsWith('/rest/v1/cadastro_arquivos') && c.metodo === 'POST');
const patches = chamadas.filter((c) => c.caminho.startsWith('/rest/v1/cadastros') && c.metodo === 'PATCH');

conferir(patches.length === 1, 'o cadastro foi gravado (1 PATCH)');
conferir(uploads.length === 1, `O ARQUIVO SUBIU AO BUCKET (${uploads.length} upload)`);
conferir(uploads[0]?.caminho.includes('/cadastros/'), 'subiu no bucket `cadastros`');
conferir(uploads[0]?.caminho.includes('conta-de-energia.pdf'), 'o nome do arquivo foi preservado no caminho');
conferir(uploads[0]?.caminho.includes('/conta_energia/'), 'foi para o slot conta_energia');
conferir(insercoes.length === 1, 'a linha em `cadastro_arquivos` foi criada');
const linha = insercoes[0] ? JSON.parse(insercoes[0].corpo) : {};
conferir((Array.isArray(linha) ? linha[0] : linha)?.slot === 'conta_energia', 'a linha registra o slot certo');
conferir(errosDeConsole.length === 0, `nenhum erro de JavaScript${errosDeConsole.length ? ' — ' + errosDeConsole[0].slice(0, 120) : ''}`);

// ---------------------------------------------------------------------------
console.log('\n2) CADASTRO NOVO — anexar dois arquivos e salvar\n');
// ---------------------------------------------------------------------------
errosDeConsole.length = 0;
await pag.goto(`${BASE}/novo`, { waitUntil: 'networkidle' });
await pag.waitForTimeout(700);

conferir(await pag.locator('#f_nome, [name="nome"]').first().count() > 0, 'o formulário de novo cadastro abriu');
await pag.locator('#f_nome, [name="nome"]').first().fill('Cliente Novo de Teste');

const campos = pag.locator('input[type="file"]');
await campos.nth(0).setInputFiles({
  name: 'conta.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF conta'),
});
await campos.nth(1).setInputFiles({
  name: 'cnh.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('\xff\xd8\xff cnh'),
});
// A caixa de LGPD é obrigatória na criação: sem ela a validação barra antes
// de gravar, que é o comportamento certo.
await pag.locator('#lgpd').check();
await pag.waitForTimeout(300);

chamadas.length = 0;
await pag.getByRole('button', { name: /Salvar cadastro/ }).click();
await pag.waitForTimeout(2000);

const uploads2 = chamadas.filter((c) => c.caminho.includes('/storage/v1/object/') && c.metodo === 'POST');
const insercoes2 = chamadas.filter((c) => c.caminho.startsWith('/rest/v1/cadastro_arquivos') && c.metodo === 'POST');
const posts2 = chamadas.filter((c) => c.caminho.startsWith('/rest/v1/cadastros') && c.metodo === 'POST');

conferir(posts2.length === 1, 'o cadastro foi criado (1 POST)');
conferir(uploads2.length === 2, `OS DOIS ARQUIVOS SUBIRAM (${uploads2.length} de 2)`);
conferir(insercoes2.length >= 1, 'as linhas em `cadastro_arquivos` foram criadas');
conferir(uploads2.every((u) => u.caminho.includes(NOVO_ID)),
  'os arquivos foram para a pasta do cadastro recém-criado');
conferir(errosDeConsole.length === 0, `nenhum erro de JavaScript${errosDeConsole.length ? ' — ' + errosDeConsole[0].slice(0, 120) : ''}`);

await navegador.close();
encerrar();

console.log('\n' + '='.repeat(64));
if (falhas.length) {
  console.log(`FALHOU — ${falhas.length} verificação(ões):`);
  falhas.forEach((f) => console.log('  · ' + f));
  process.exit(1);
}
console.log('TUDO CERTO — os anexos sobem na criação e na edição.');
