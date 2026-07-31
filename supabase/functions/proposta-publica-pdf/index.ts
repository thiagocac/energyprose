// ============================================================================
// proposta-publica-pdf — baixar a proposta pelo link do cliente
//
// O cliente recebe por WhatsApp um link de aceite (/p/<token>) e, agora,
// tambem um de download (/p/<token>/pdf). O bucket `documentos` e privado e o
// role `anon` nao le nada dele, entao alguem com a chave de servico precisa
// buscar os bytes — e esse alguem e esta funcao.
//
// verify_jwt = FALSE de proposito: quem chama e o cliente, que nao tem login.
// A autorizacao e o token, e quem a confere e o banco:
//
//   token -> proposta_publica_pdf (SECURITY DEFINER, valida hash e validade)
//         -> caminho de UM arquivo
//         -> download com a chave de servico
//         -> bytes
//
// A chave de servico nunca sai daqui, e o caminho vem do banco, nunca do
// pedido: mesmo que alguem descubra um caminho do bucket, nao ha parametro
// onde injeta-lo.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? '';
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CHAVE_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

/** Pagina simples de erro: quem clica no link e o cliente, nao um programa. */
function paginaErro(msg: string, status: number): Response {
  const corpo = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Energy PRO</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F7FA;
       font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#16202F;padding:24px}
  .cx{background:#fff;border:1px solid #E3E8EF;border-radius:14px;padding:32px 28px;max-width:420px;text-align:center;
      box-shadow:0 8px 24px rgba(16,32,58,.06)}
  h1{font-size:18px;margin:0 0 10px;color:#002A54}
  p{margin:0;color:#667085;font-size:14.5px}
</style></head><body><div class="cx">
<h1>Nao foi possivel abrir a proposta</h1><p>${msg}</p></div></body></html>`;
  return new Response(corpo, {
    status, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8' },
  });
}

const seguro = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // O token vem da query (?t=) ou do fim do caminho (/p/<token>/pdf), porque
    // o Netlify encaminha a rota bonita para ca preservando o caminho.
    const url = new URL(req.url);
    let token = (url.searchParams.get('t') ?? '').trim();
    if (!token) {
      const m = url.pathname.match(/\/p\/([0-9a-f]{32,256})\/pdf\/?$/i);
      if (m) token = m[1];
    }
    if (!token) return paginaErro('O link esta incompleto. Peca um novo ao seu consultor.', 400);

    // Cliente ANON: a RPC e SECURITY DEFINER e valida o token por dentro.
    // Usar a chave de servico aqui seria dar mais poder do que a tarefa pede.
    const anon = createClient(URL_SUPABASE, CHAVE_ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.rpc('proposta_publica_pdf', { p_token: token });
    if (error) {
      console.error('rpc proposta_publica_pdf:', error.message);
      return paginaErro('Nao conseguimos validar este link agora. Tente de novo em instantes.', 500);
    }
    if (!data?.ok) {
      const msg = String(data?.erro ?? 'Link invalido.');
      return paginaErro(msg + ' Fale com o seu consultor da Energy PRO.', 404);
    }

    const servico = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });
    const { data: arquivo, error: erroArq } = await servico.storage
      .from('documentos').download(String(data.caminho));
    if (erroArq || !arquivo) {
      console.error('download do bucket:', erroArq?.message);
      return paginaErro('O arquivo desta proposta nao esta disponivel. Fale com o seu consultor.', 404);
    }

    const nome = seguro(String(data.nome ?? 'proposta.pdf')) || 'proposta.pdf';
    return new Response(await arquivo.arrayBuffer(), {
      status: 200,
      headers: {
        ...CORS,
        'content-type': 'application/pdf',
        // `inline`: no celular o WhatsApp abre o PDF na hora, e quem quiser
        // guardar usa o botao de salvar do proprio visualizador.
        'content-disposition': `inline; filename="${nome}"`,
        // Documento de cliente nao entra em cache compartilhado.
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (e) {
    console.error('proposta-publica-pdf:', (e as Error).stack ?? e);
    return paginaErro('Tivemos um problema ao abrir a proposta. Tente novamente.', 500);
  }
});
