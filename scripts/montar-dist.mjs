// ============================================================================
// Monta a pasta publicada: o app React já está em dist/painel/ (saída do Vite);
// aqui copiamos o site público por cima, na raiz de dist/.
//
// Só dist/ vai ao ar. O código-fonte não é publicado — que é exatamente o
// motivo de o repositório ter deixado de publicar a própria raiz.
// ============================================================================
import { cp, readdir, stat, access } from 'node:fs/promises';
import { join } from 'node:path';

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
