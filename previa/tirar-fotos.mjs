// Fotografa as telas da prévia. Roda contra previa-dist/ servido em :4178.
//
//   npx vite build --config vite.config.previa.ts
//   cp publico/logo-energypro*.png previa-dist/
//   (cd previa-dist && python3 -m http.server 4178) &
//   node previa/tirar-fotos.mjs
//
// Precisa do playwright instalado (não é dependência do projeto: só serve para
// conferência visual, não entra no que é publicado).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4178';
const SAIDA = new URL('../previa-fotos/', import.meta.url).pathname;
mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch();

async function foto(nome, tela, largura, altura, antes) {
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 2, locale: 'pt-BR',
  });
  const pag = await ctx.newPage();
  const erros = [];
  pag.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  pag.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  await pag.goto(`${BASE}/?t=${tela}`, { waitUntil: 'networkidle' });
  await pag.waitForTimeout(400);
  if (antes) await antes(pag);
  await pag.screenshot({ path: `${SAIDA}${nome}.png`, fullPage: true });
  await ctx.close();
  console.log(`${nome.padEnd(28)} ${largura}px  ${erros.length ? '⚠ ' + erros.join(' | ') : 'sem erro de console'}`);
}

await foto('propostas-desktop', 'propostas', 1366, 900);
await foto('propostas-celular', 'propostas', 390, 780);
await foto('propostas-painel', 'propostas', 1366, 1000, async (pag) => {
  await pag.getByRole('button', { name: 'Nova proposta' }).click();
  await pag.waitForTimeout(250);
  await pag.locator('.painel select').first().selectOption({ index: 1 });
  await pag.waitForTimeout(300);
});
await foto('funil-desktop', 'funil', 1366, 900);
await foto('funil-celular', 'funil', 390, 780);
await foto('publica-celular', 'publica', 390, 780);
await foto('publica-desktop', 'publica', 1100, 900);
await foto('catalogo-desktop', 'catalogo', 1366, 900);

await navegador.close();
