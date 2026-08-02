// Servidor estático do site público, com as MESMAS regras de rota do
// netlify.toml — sem elas o painel legado não abre em /cadastros/<id>, porque
// o roteador dele lê `location.pathname` e o arquivo não existe nesse caminho.
//
//   node previa/servir-publico.mjs [porta]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const RAIZ = new URL('../publico/', import.meta.url).pathname;
const PORTA = Number(process.argv[2] ?? 4180);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.json': 'application/json',
};

// Espelha o netlify.toml: /novo e /cadastros* são o painel legado.
const ehPainel = (p) => p === '/novo' || p === '/cadastros' || p.startsWith('/cadastros/') || p === '/login';

createServer(async (req, res) => {
  const caminho = new URL(req.url, 'http://x').pathname;
  let arquivo = ehPainel(caminho) ? 'painel.html'
    : caminho === '/' ? 'index.html'
    : caminho.replace(/^\//, '');
  try {
    const corpo = await readFile(join(RAIZ, arquivo));
    res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
    res.end(corpo);
  } catch {
    // Resto cai no formulário público, como a regra /* do Netlify.
    try {
      const corpo = await readFile(join(RAIZ, 'index.html'));
      res.writeHead(200, { 'content-type': TIPOS['.html'] });
      res.end(corpo);
    } catch { res.writeHead(404); res.end('nao encontrado'); }
  }
}).listen(PORTA, '127.0.0.1', () => console.log(`site público em http://127.0.0.1:${PORTA}`));
