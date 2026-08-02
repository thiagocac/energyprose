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

async function foto(nome, tela, largura, altura, antes, opcoes = {}) {
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 2, locale: 'pt-BR',
  });
  const pag = await ctx.newPage();
  // O WhatsApp e o PDF abrem em aba nova; sem rede, elas só atrapalhariam.
  await ctx.route('**/wa.me/**', (r) => r.abort());
  if (opcoes.popupBloqueado) {
    await pag.addInitScript(() => { window.open = () => null; });
  }
  const erros = [];
  pag.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  pag.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  await pag.goto(`${BASE}/?t=${tela}${opcoes.extra ?? ''}`, { waitUntil: 'networkidle' });
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
// Envio: recibo com link, pop-up bloqueado, e envio sem PDF.
const enviarPrimeira = async (pag) => {
  await pag.getByRole('button', { name: /^Enviar$/ }).first().click();
  await pag.waitForTimeout(900);
};
await foto('envio-recibo', 'propostas', 1366, 900, enviarPrimeira);
await foto('envio-popup-bloqueado', 'propostas', 1366, 900, enviarPrimeira, { popupBloqueado: true });
await foto('envio-sem-pdf', 'propostas', 1366, 900, enviarPrimeira, { extra: '&pdf=falha' });
await foto('envio-recibo-celular', 'propostas', 390, 780, enviarPrimeira, { popupBloqueado: true });

// Erro de validação DENTRO do painel — era o que ficava atrás do véu escuro.
await foto('erro-no-painel', 'propostas', 1366, 900, async (pag) => {
  await pag.getByRole('button', { name: 'Nova proposta' }).click();
  await pag.waitForTimeout(250);
  await pag.getByRole('button', { name: 'Salvar proposta' }).click();
  await pag.waitForTimeout(350);
});
await foto('erro-no-painel-celular', 'propostas', 390, 780, async (pag) => {
  await pag.getByRole('button', { name: 'Nova proposta' }).click();
  await pag.waitForTimeout(250);
  await pag.getByRole('button', { name: 'Salvar proposta' }).click();
  await pag.waitForTimeout(350);
});

// Trocar senha: aberto, com crítica, e o erro de senha atual errada.
const abrirSenha = async (pag) => {
  await pag.getByRole('button', { name: 'Senha' }).click();
  await pag.waitForTimeout(250);
};
await foto('senha-vazia', 'funil', 1366, 900, abrirSenha);
await foto('senha-critica', 'funil', 1366, 900, async (pag) => {
  await abrirSenha(pag);
  await pag.locator('.painel input[type="password"]').nth(0).fill('previa-atual');
  await pag.locator('.painel input[type="password"]').nth(1).fill('energypro2026');
  await pag.waitForTimeout(200);
});
await foto('senha-sugerida', 'funil', 1366, 900, async (pag) => {
  await abrirSenha(pag);
  await pag.locator('.painel input[type="password"]').nth(0).fill('previa-atual');
  await pag.getByRole('button', { name: 'sugerir uma forte' }).click();
  await pag.waitForTimeout(200);
});
await foto('senha-erro-atual', 'funil', 1366, 900, async (pag) => {
  await abrirSenha(pag);
  await pag.locator('.painel input[type="password"]').nth(0).fill('senha-que-nao-e');
  await pag.getByRole('button', { name: 'sugerir uma forte' }).click();
  await pag.getByRole('button', { name: 'Alterar senha' }).click();
  await pag.waitForTimeout(400);
});
await foto('senha-feito', 'funil', 1366, 900, async (pag) => {
  await abrirSenha(pag);
  await pag.locator('.painel input[type="password"]').nth(0).fill('previa-atual');
  await pag.getByRole('button', { name: 'sugerir uma forte' }).click();
  await pag.getByRole('button', { name: 'Alterar senha' }).click();
  await pag.waitForTimeout(400);
});
await foto('senha-celular', 'funil', 390, 780, abrirSenha);

// Nova oportunidade e os indicadores de resultado.
await foto('funil-nova-oportunidade', 'funil', 1366, 950, async (pag) => {
  await pag.getByRole('button', { name: 'Nova oportunidade' }).click();
  await pag.waitForTimeout(250);
  await pag.locator('.painel input').first().fill('João Batista');
  await pag.locator('.painel input').nth(1).fill('Encruzilhada');
  await pag.locator('.painel input').nth(2).fill('77 99814-2200');
  await pag.locator('.painel input').nth(4).fill('34.000');
  await pag.locator('.painel select').first().selectOption({ index: 1 });
  await pag.waitForTimeout(250);
});
await foto('propostas-resultado', 'propostas', 1366, 900);

// Funil: busca, "Falei hoje" aberto, e o motivo da perda no card.
await foto('funil-busca', 'funil', 1366, 900, async (pag) => {
  await pag.getByRole('searchbox').fill('padaria');
  await pag.waitForTimeout(300);
});
await foto('funil-falei-hoje', 'funil', 1366, 900, async (pag) => {
  await pag.getByRole('button', { name: 'Falei hoje' }).first().click();
  await pag.waitForTimeout(250);
  await pag.locator('.anotar input').fill('Ligou perguntando o prazo de instalação');
  await pag.waitForTimeout(200);
});

await foto('funil-desktop', 'funil', 1366, 900);
await foto('funil-celular', 'funil', 390, 780);
await foto('publica-celular', 'publica', 390, 780);
await foto('publica-desktop', 'publica', 1100, 900);
await foto('catalogo-desktop', 'catalogo', 1366, 900);

await navegador.close();
