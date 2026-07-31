// ============================================================================
// gerar-documento-pdf — Edge Function
//
// Gera os documentos comerciais da Energy PRO a partir dos dados reais. Sao
// TRES layouts, e quem escolhe nao e o front:
//
//   proposta + linha.documento = 'usina'   -> proposta rica de usina solar
//   proposta + linha.documento = 'servico' -> Proposta Comercial (engenharia)
//   contrato                               -> contrato (usina ou manutencao)
//
// A linha de servico vem do banco junto com o contexto, entao a regra fica num
// lugar so: quem cadastra uma linha nova decide ali qual documento ela usa.
//
// Fluxo: autentica -> render_document_context (o RLS decide o que o usuario ve)
// -> desenha -> guarda no bucket privado `documentos` -> devolve o PDF binario.
//
// O layout e FIXO, em codigo (nao ha editor de template). O que muda de tempos
// em tempos — beneficios, itens inclusos, condicoes, prazos, engenheiro — vem
// de config_empresa, editavel em tela.
//
// FONTES: buscadas do proprio site (/fontes/*.ttf) e mantidas em cache no
// escopo do modulo — so o cold start paga. ARMADILHA JA PAGA: o Netlify
// responde HTTP 200 com o index.html para QUALQUER caminho inexistente (regra
// /* do SPA), entao `response.ok` NAO prova que veio uma fonte. Conferimos a
// assinatura sfnt dos bytes; se nao for fonte de verdade, o PDF sai com as
// fontes padrao em vez de estourar. O logo nao depende disso — e contorno
// vetorial e sai identico.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { renderContrato, renderProposta, renderPropostaServico } from './layout.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-expose-headers': 'x-documento-id, x-storage-path, x-fontes, x-layout',
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

// Assinaturas de arquivo de fonte: TrueType, OpenType/CFF, 'true', colecao.
const ASSINATURAS = [0x00010000, 0x4f54544f, 0x74727565, 0x74746366];
function pareceFonte(b: Uint8Array): boolean {
  if (b.length < 2048) return false;
  const magica = (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0);
  return ASSINATURAS.includes(magica);
}

let cacheFontes: Record<string, Uint8Array> | null = null;

async function baixarFontes(): Promise<Record<string, Uint8Array> | null> {
  if (cacheFontes) return cacheFontes;
  try {
    const pares = await Promise.all(
      Object.entries(ARQUIVOS_FONTE).map(async ([chave, arq]) => {
        const r = await fetch(`${BASE_SITE}/fontes/${arq}`);
        if (!r.ok) throw new Error(`${arq}: HTTP ${r.status}`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (!pareceFonte(bytes)) {
          throw new Error(`${arq}: nao e fonte (provavelmente o index.html do site; ${bytes.length} bytes)`);
        }
        return [chave, bytes] as const;
      }),
    );
    cacheFontes = Object.fromEntries(pares);
    return cacheFontes;
  } catch (e) {
    console.warn('fontes da marca indisponiveis, usando as padrao:', (e as Error).message);
    return null;
  }
}

const jsonErro = (msg: string, status: number, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: false, erro: msg, ...extra }), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  });

const seguro = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

// deno-lint-ignore no-explicit-any
type Ctx = Record<string, any>;

/** 'usina' | 'servico' | 'contrato' — qual funcao de desenho usar. */
function escolherLayout(tipo: string, ctx: Ctx): string {
  if (tipo === 'contrato') return 'contrato';
  return ctx.linha?.documento === 'servico' ? 'servico' : 'usina';
}

const CAMPOS_SISTEMA: Array<[string, string]> = [
  ['modulo_qtd', 'quantidade de modulos'],
  ['modulo_descricao', 'modelo dos modulos'],
  ['inversor_descricao', 'modelo do inversor'],
  ['potencia_instalada_kwp', 'potencia instalada'],
];

/**
 * O que cada documento exige para poder ser emitido.
 *
 * Usina precisa do quadro tecnico: sem modulos e inversor a proposta sai com
 * buracos onde o cliente procura o que esta comprando. Servico nao tem quadro
 * tecnico nenhum — precisa e de ITEM, porque uma Proposta Comercial sem linha
 * na grade e uma folha com preco e nenhuma justificativa.
 */
function conferir(layout: string, ctx: Ctx): string[] {
  const faltando: string[] = [];
  if (!ctx.cliente?.nome) faltando.push('cliente');

  if (layout === 'contrato') {
    if (!ctx.contrato?.numero) faltando.push('numero do contrato');
    if (!Number(ctx.contrato?.valor_total)) faltando.push('valor do contrato');
    // Contrato de MANUTENCAO nao exige sistema: a Energy PRO vende plano para
    // usina que ela mesma nao instalou. Nesse caso o Anexo I so nao sai.
    if (ctx.contrato?.tipo !== 'manutencao') {
      for (const [k, rot] of CAMPOS_SISTEMA) if (!ctx.sistema?.[k]) faltando.push(rot);
    }
    return faltando;
  }

  if (!ctx.proposta?.numero) faltando.push('numero da proposta');
  if (!Number(ctx.proposta?.valor_total)) faltando.push('valor (a proposta esta sem itens)');
  if (layout === 'usina') {
    for (const [k, rot] of CAMPOS_SISTEMA) if (!ctx.sistema?.[k]) faltando.push(rot);
  } else if (!Array.isArray(ctx.itens) || ctx.itens.length === 0) {
    faltando.push('itens da proposta');
  }
  return faltando;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return jsonErro('Metodo nao permitido.', 405);

  try {
    const corpo = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tipo = String(corpo.tipo ?? corpo.entity_type ?? '').trim();
    const id = String(corpo.id ?? corpo.entity_id ?? '').trim();
    if (!['proposta', 'contrato'].includes(tipo)) return jsonErro('tipo deve ser proposta ou contrato.', 400);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonErro('id invalido.', 400);
    const ehContrato = tipo === 'contrato';

    const auth = req.headers.get('Authorization') ?? '';
    if (!auth) return jsonErro('Nao autorizado.', 401);

    const comUsuario = createClient(URL_SUPABASE, CHAVE_ANON, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: usuario } = await comUsuario.auth.getUser();
    if (!usuario?.user) return jsonErro('Sessao invalida.', 401);

    const { data: ctx, error: erroCtx } = await comUsuario.rpc('render_document_context', {
      p_tipo: tipo, p_id: id,
    });
    if (erroCtx) {
      const negado = erroCtx.code === '42501';
      return jsonErro(negado ? 'Sem permissao para emitir este documento.' : erroCtx.message, negado ? 403 : 400);
    }
    if (ehContrato ? !ctx?.contrato : !ctx?.proposta) {
      return jsonErro(ehContrato ? 'Contrato nao encontrado.' : 'Proposta nao encontrada.', 404);
    }

    const layout = escolherLayout(tipo, ctx);
    const faltando = conferir(layout, ctx);
    if (faltando.length) {
      return jsonErro(`Faltam dados para gerar ${ehContrato ? 'o contrato' : 'a proposta'}.`, 422, { campos: faltando });
    }

    // ---- desenho ----
    const doc = await PDFDocument.create();
    const F: Record<string, unknown> = {};
    let usouMarca = false;
    const fontes = await baixarFontes();
    if (fontes) {
      try {
        doc.registerFontkit(fontkit);
        for (const [chave, bytes] of Object.entries(fontes)) {
          F[chave] = await doc.embedFont(bytes, { subset: true });
        }
        usouMarca = true;
      } catch (e) {
        console.warn('falha ao embutir as fontes da marca:', (e as Error).message);
        cacheFontes = null;   // nao guarda bytes ruins no cache
      }
    }
    if (!usouMarca) {
      F.os4 = await doc.embedFont(StandardFonts.Helvetica);
      F.pop6 = await doc.embedFont(StandardFonts.HelveticaBold);
      F.pop7 = await doc.embedFont(StandardFonts.HelveticaBold);
    }
    F.os6 = F.os4;   // rotulos em regular (decisao de tipografia)

    const numero = String((ehContrato ? ctx.contrato?.numero : ctx.proposta?.numero) ?? '');
    doc.setTitle(`${ehContrato ? 'Contrato' : 'Proposta'} ${numero} — ${ctx.cliente.nome}`);
    doc.setAuthor(String(ctx.empresa?.nome ?? 'Energy PRO'));
    doc.setProducer('Energy PRO Gestao');
    doc.setCreationDate(new Date());

    if (layout === 'contrato') {
      // O contrato nao tem QR: e documento de assinatura, nao peca de venda.
      renderContrato(doc, ctx, F);
    } else {
      const whatsapp = String(ctx.empresa?.whatsapp ?? '').replace(/\D/g, '');
      const qr = whatsapp ? QRCode.create(`https://wa.me/${whatsapp}`, { errorCorrectionLevel: 'M' }).modules : null;
      if (layout === 'servico') renderPropostaServico(doc, ctx, F, qr);
      else renderProposta(doc, ctx, F, qr);
    }
    const bytes = await doc.save();

    // ---- trilha e arquivo ----
    const servico = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });
    const revisao = ehContrato ? null : (ctx.proposta?.revisao ?? 0);
    const nome = `${seguro(numero)}${revisao === null ? '' : `-R${revisao}`}.pdf`;
    const caminho = `${ehContrato ? 'contratos' : 'propostas'}/${id}/${Date.now()}-${nome}`;

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
      const detalhe = { caminho, sha256: sha, fontes: usouMarca ? 'marca' : 'padrao', layout };
      if (ehContrato) {
        await servico.from('contratos').update({ pdf_path: caminho }).eq('id', id);
        await servico.from('contrato_eventos').insert({
          contrato_id: id, event_type: 'pdf_gerado', actor_id: usuario.user.id, detail: detalhe,
        });
      } else {
        await servico.from('propostas').update({ pdf_path: caminho }).eq('id', id);
        await servico.from('proposta_eventos').insert({
          proposta_id: id, event_type: 'pdf_gerado', actor_id: usuario.user.id, detail: detalhe,
        });
      }
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        ...CORS,
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${nome}"`,
        'x-documento-id': registro?.id ?? '',
        'x-storage-path': erroUp ? '' : caminho,
        'x-fontes': usouMarca ? 'marca' : 'padrao',
        'x-layout': layout,
      },
    });
  } catch (e) {
    console.error('gerar-documento-pdf:', (e as Error).stack ?? e);
    return jsonErro('Nao foi possivel gerar o documento.', 500, { detalhe: (e as Error).message?.slice(0, 200) });
  }
});
