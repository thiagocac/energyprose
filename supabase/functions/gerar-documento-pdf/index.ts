// ============================================================================
// gerar-documento-pdf — Edge Function
//
// Gera o PDF comercial da Energy PRO a partir dos dados reais da proposta.
// Fluxo: autentica → render_document_context (RLS decide o que o usuário vê)
// → desenha → guarda no bucket privado `documentos` → devolve o PDF binário.
//
// O layout é FIXO, em código (não há editor de template). O que muda de tempos
// em tempos vem de config_empresa, editável em tela.
//
// FONTES: as três fontes do documento são buscadas do próprio site
// (/fontes/*.ttf) e ficam em cache no escopo do módulo — só o cold start paga.
// Se a busca falhar, o PDF ainda sai, com as fontes padrão do PDF: melhor um
// documento com tipografia genérica do que uma proposta que não sai.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { renderProposta } from './layout.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-expose-headers': 'x-documento-id, x-storage-path, x-fontes',
};

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? '';
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CHAVE_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const BASE_SITE = Deno.env.get('SITE_URL') ?? 'https://energyprose.netlify.app';

const ARQUIVOS_FONTE: Record<string, string> = {
  os4: 'open-sans-400.ttf',
  pop6: 'poppins-600.ttf',
  pop7: 'poppins-700.ttf',
};

let cacheFontes: Record<string, Uint8Array> | null = null;

/** Baixa as fontes uma vez por instância. Devolve null se não conseguir. */
async function baixarFontes(): Promise<Record<string, Uint8Array> | null> {
  if (cacheFontes) return cacheFontes;
  try {
    const pares = await Promise.all(
      Object.entries(ARQUIVOS_FONTE).map(async ([chave, arq]) => {
        const r = await fetch(`${BASE_SITE}/fontes/${arq}`);
        if (!r.ok) throw new Error(`${arq}: HTTP ${r.status}`);
        return [chave, new Uint8Array(await r.arrayBuffer())] as const;
      }),
    );
    cacheFontes = Object.fromEntries(pares);
    return cacheFontes;
  } catch (e) {
    console.warn('fontes indisponíveis, usando as padrão do PDF:', (e as Error).message);
    return null;
  }
}

const jsonErro = (msg: string, status: number, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: false, erro: msg, ...extra }), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  });

const seguro = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return jsonErro('Método não permitido.', 405);

  try {
    const corpo = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tipo = String(corpo.tipo ?? corpo.entity_type ?? '').trim();
    const id = String(corpo.id ?? corpo.entity_id ?? '').trim();
    if (!['proposta', 'contrato'].includes(tipo)) return jsonErro('tipo deve ser proposta ou contrato.', 400);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonErro('id inválido.', 400);
    if (tipo === 'contrato') return jsonErro('O documento de contrato ainda não está disponível.', 422);

    const auth = req.headers.get('Authorization') ?? '';
    if (!auth) return jsonErro('Não autorizado.', 401);

    // Cliente COM o token do usuário: o gate de is_equipe() dentro da RPC decide.
    const comUsuario = createClient(URL_SUPABASE, CHAVE_ANON, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: usuario } = await comUsuario.auth.getUser();
    if (!usuario?.user) return jsonErro('Sessão inválida.', 401);

    const { data: ctx, error: erroCtx } = await comUsuario.rpc('render_document_context', {
      p_tipo: tipo, p_id: id,
    });
    if (erroCtx) {
      const negado = erroCtx.code === '42501';
      return jsonErro(negado ? 'Sem permissão para emitir este documento.' : erroCtx.message, negado ? 403 : 400);
    }
    if (!ctx?.proposta) return jsonErro('Proposta não encontrada.', 404);

    // ---- validação do que o layout exige ----
    const faltando: string[] = [];
    if (!ctx.cliente?.nome) faltando.push('cliente');
    if (!ctx.proposta?.numero) faltando.push('número da proposta');
    if (!Number(ctx.proposta?.valor_total)) faltando.push('valor (a proposta está sem itens)');
    const s = ctx.sistema ?? {};
    if (!s.modulo_qtd) faltando.push('quantidade de módulos');
    if (!s.modulo_descricao) faltando.push('modelo dos módulos');
    if (!s.inversor_descricao) faltando.push('modelo do inversor');
    if (!s.potencia_instalada_kwp) faltando.push('potência instalada');
    if (faltando.length) {
      return jsonErro('Faltam dados para gerar a proposta.', 422, { campos: faltando });
    }

    // ---- desenho ----
    const doc = await PDFDocument.create();
    const fontes = await baixarFontes();
    const F: Record<string, unknown> = {};
    if (fontes) {
      doc.registerFontkit(fontkit);
      for (const [chave, bytes] of Object.entries(fontes)) {
        F[chave] = await doc.embedFont(bytes, { subset: true });
      }
    } else {
      F.os4 = await doc.embedFont(StandardFonts.Helvetica);
      F.pop6 = await doc.embedFont(StandardFonts.HelveticaBold);
      F.pop7 = await doc.embedFont(StandardFonts.HelveticaBold);
    }
    F.os6 = F.os4;   // rótulos em regular (decisão de tipografia, ver README)

    const whatsapp = String(ctx.empresa?.whatsapp ?? '').replace(/\D/g, '');
    const qr = whatsapp ? QRCode.create(`https://wa.me/${whatsapp}`, { errorCorrectionLevel: 'M' }).modules : null;

    doc.setTitle(`Proposta ${ctx.proposta.numero} — ${ctx.cliente.nome}`);
    doc.setAuthor(String(ctx.empresa?.nome ?? 'Energy PRO'));
    doc.setProducer('Energy PRO Gestão');
    doc.setCreationDate(new Date());
    renderProposta(doc, ctx, F, qr);
    const bytes = await doc.save();

    // ---- trilha e arquivo ----
    const servico = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });
    const nome = `${seguro(ctx.proposta.numero)}-R${ctx.proposta.revisao ?? 0}.pdf`;
    const caminho = `propostas/${id}/${Date.now()}-${nome}`;

    const { error: erroUp } = await servico.storage.from('documentos')
      .upload(caminho, bytes, { contentType: 'application/pdf', upsert: false });
    if (erroUp) console.error('falha ao arquivar o PDF:', erroUp.message);

    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

    const { data: registro } = await servico.from('documentos_gerados').insert({
      tipo, ref_id: id,
      storage_path: erroUp ? null : caminho,
      sha256: sha,
      status: erroUp ? 'failed' : 'done',
      error_message: erroUp?.message ?? null,
      gerado_por: usuario.user.id,
    }).select('id').single();

    if (!erroUp) {
      await servico.from('propostas').update({ pdf_path: caminho }).eq('id', id);
      await servico.from('proposta_eventos').insert({
        proposta_id: id, event_type: 'pdf_gerado', actor_id: usuario.user.id,
        detail: { caminho, sha256: sha, fontes: fontes ? 'marca' : 'padrao' },
      });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        ...CORS,
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${nome}"`,
        'x-documento-id': registro?.id ?? '',
        'x-storage-path': erroUp ? '' : caminho,
        'x-fontes': fontes ? 'marca' : 'padrao',
      },
    });
  } catch (e) {
    console.error('gerar-documento-pdf:', e);
    return jsonErro('Não foi possível gerar o documento.', 500);
  }
});
