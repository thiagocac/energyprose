// ============================================================================
// Monta a pasta publicada: o app React já está em dist/painel/ (saída do Vite);
// aqui copiamos o site público por cima, na raiz de dist/.
//
// Só dist/ vai ao ar. O código-fonte não é publicado — que é exatamente o
// motivo de o repositório ter deixado de publicar a própria raiz.
// ============================================================================
import { cp, readdir, stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const RAIZ = new URL('..', import.meta.url).pathname;
const ORIGEM = join(RAIZ, 'publico');
const DESTINO = join(RAIZ, 'dist');

// O painel antigo responde por /novo e /cadastros até as telas serem portadas
// para o React. Ele é servido como painel-legado.html (ver netlify.toml).
const RENOMEAR = { 'painel.html': 'painel-legado.html' };
const IGNORAR = new Set(['_redirects.legado']);

const existe = async (p) => { try { await access(p); return true; } catch { return false; } };

if (!await existe(join(DESTINO, 'painel', 'index.html'))) {
  console.error('✗ dist/painel/index.html não existe — o build do Vite não rodou.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// ARMADILHA QUE ESTE BLOCO PAGA: o site público não passa por bundler nem por
// TypeScript — os .js são copiados como estão. Quer dizer que `npm run build`
// inteiro passava com um erro de sintaxe dentro deles, e o painel de Cadastros
// ia ao ar sem carregar nada.
//
// Foi o que aconteceu: um comentário HTML que eu escrevi DENTRO de um template
// literal continha crases; elas fecharam o template no meio e quebraram o
// arquivo. `tsc`, `vite build` e os testes passaram todos.
//
// `node --check` é a rede que faltava. Custa milissegundos.
// ---------------------------------------------------------------------------
const scripts = (await readdir(ORIGEM)).filter((n) => n.endsWith('.js'));
for (const nome of scripts) {
  try {
    execFileSync(process.execPath, ['--check', join(ORIGEM, nome)], { stdio: 'pipe' });
  } catch (e) {
    console.error(`✗ erro de sintaxe em publico/${nome} — o site público iria ao ar quebrado:\n`);
    console.error(String(e.stderr ?? e.message).trim());
    process.exit(1);
  }
}
console.log(`✓ ${scripts.length} scripts do site público sem erro de sintaxe`);

let copiados = 0;
for (const nome of await readdir(ORIGEM)) {
  if (IGNORAR.has(nome)) continue;
  const de = join(ORIGEM, nome);
  if ((await stat(de)).isDirectory()) { await cp(de, join(DESTINO, nome), { recursive: true }); copiados++; continue; }
  await cp(de, join(DESTINO, RENOMEAR[nome] ?? nome));
  copiados++;
}

// Verificação: as duas aplicações precisam existir no que vai ao ar.
const obrigatorios = ['index.html', 'publico.js', 'comum.js', 'painel-legado.html', 'painel/index.html'];
const faltando = [];
for (const f of obrigatorios) if (!await existe(join(DESTINO, f))) faltando.push(f);
if (faltando.length) {
  console.error('✗ faltam arquivos em dist/:', faltando.join(', '));
  process.exit(1);
}

console.log(`✓ dist/ montado — ${copiados} itens do site público + app React em /painel/`);
