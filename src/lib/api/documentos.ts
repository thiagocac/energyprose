import { sb, SUPABASE_URL, SUPABASE_KEY } from '../supabase';

// Cliente da Edge Function que gera o PDF comercial.
// A função devolve o PDF BINÁRIO (não um link): o Blob vira uma URL temporária
// no navegador. A trilha vem nos cabeçalhos.

export type DocumentoGerado = {
  blob: Blob;
  nomeArquivo: string;
  documentoId: string;
  caminho: string;
  /** 'marca' = fontes da Energy PRO · 'padrao' = fallback (fontes não chegaram) */
  fontes: 'marca' | 'padrao';
};

export async function gerarDocumentoPdf(
  tipo: 'proposta' | 'contrato',
  id: string,
): Promise<DocumentoGerado> {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/gerar-documento-pdf`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tipo, id }),
  });

  if (!resp.ok) {
    const erro = await resp.json().catch(() => ({})) as { erro?: string; campos?: string[] };
    let msg = erro.erro ?? 'Não foi possível gerar o documento.';
    // A função lista o que falta em vez de emitir um PDF com lacunas.
    if (erro.campos?.length) msg += ` Falta: ${erro.campos.join(', ')}.`;
    throw new Error(msg);
  }

  const nomeCabecalho = /filename="([^"]+)"/.exec(resp.headers.get('content-disposition') ?? '')?.[1];
  return {
    blob: await resp.blob(),
    nomeArquivo: nomeCabecalho ?? `${tipo}-${id}.pdf`,
    documentoId: resp.headers.get('x-documento-id') ?? '',
    caminho: resp.headers.get('x-storage-path') ?? '',
    fontes: (resp.headers.get('x-fontes') as 'marca' | 'padrao') ?? 'padrao',
  };
}

/**
 * Link temporário para o documento que JÁ foi emitido e arquivado.
 *
 * Sem isto, o único botão da tela gerava um PDF NOVO a cada clique — que pode
 * sair diferente do que o cliente tem na mão, porque `config_empresa`
 * (benefícios, condições, prazos) ou o catálogo podem ter mudado desde o envio.
 * Discutir preço com dois documentos diferentes é perder a conversa.
 *
 * O bucket `documentos` é privado; quem libera é a política
 * `equipe le documentos do bucket`, que exige `is_equipe()`.
 */
export async function linkDoDocumento(caminho: string): Promise<string> {
  const { data, error } = await sb.storage.from('documentos').createSignedUrl(caminho, 300);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Não foi possível abrir o arquivo arquivado.');
  }
  return data.signedUrl;
}

/**
 * Abre o PDF numa aba já existente. A aba é aberta ANTES da chamada, no clique,
 * senão o bloqueador de pop-up do navegador barra: o gesto do usuário já passou
 * quando a geração termina.
 */
export function abrirAbaDiferida(mensagem = 'Gerando o PDF…') {
  const aba = window.open('', '_blank');
  if (aba) {
    aba.document.write(
      `<!doctype html><meta charset="utf-8"><title>${mensagem}</title>`
      + '<body style="font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0;'
      + 'background:#F4F7FA;color:#29395F">' + mensagem + '</body>',
    );
  }
  return {
    mostrar(blob: Blob, nome: string) {
      const url = URL.createObjectURL(blob);
      if (aba) { aba.location.href = url; } else {
        // Pop-up bloqueado: cai para download, para o usuário não ficar sem o arquivo.
        const a = document.createElement('a');
        a.href = url; a.download = nome; a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    /**
     * Manda a aba para outro endereço — o WhatsApp, por exemplo. Devolve
     * `false` quando o pop-up foi bloqueado, para quem chamou poder oferecer
     * o link na própria tela em vez de mentir que abriu.
     */
    irPara(url: string) {
      if (!aba) return false;
      aba.location.href = url;
      return true;
    },
    falhar(msg: string) {
      if (aba) aba.document.body.textContent = msg;
    },
  };
}
