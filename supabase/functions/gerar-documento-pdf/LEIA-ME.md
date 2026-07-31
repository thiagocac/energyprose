# gerar-documento-pdf

Gera o PDF da proposta comercial da Energy PRO.

## Fonte × artefato

- **`src/`** é o código-fonte legível do layout (comentado, um módulo por assunto).
- **`layout.js`** é o BUNDLE gerado a partir dele — minificado, um arquivo só.
  Não edite `layout.js` à mão: edite `src/` e regenere.

```bash
npm run build:ef      # gera supabase/functions/gerar-documento-pdf/layout.js
```

O bundle existe porque a Edge Function sobe como um conjunto de arquivos, e um
arquivo só reduz superfície de erro no deploy. O `pdf-lib` fica externo (resolvido
pelo `deno.json` como `npm:`).

## Armadilhas já pagas

**1. `response.ok` não prova que veio uma fonte.** O Netlify responde HTTP 200 com
o `index.html` para qualquer caminho inexistente (a regra `/*` do SPA). A função
buscava `/fontes/*.ttf`, recebia HTML com status 200, e o `embedFont` estourava —
derrubando a geração inteira. Hoje conferimos a assinatura sfnt dos bytes
(`00 01 00 00`, `OTTO`, `true`, `ttcf`) antes de aceitar o arquivo como fonte, e
o `embedFont` está dentro de try/catch. Se a fonte não vier, o PDF sai com as
fontes padrão em vez de não sair — e o cabeçalho `x-fontes` diz qual foi usada.

**2. O logo não depende de fonte.** Wordmark e tagline são contornos vetoriais
(`src/glifos.mjs`), extraídos uma vez do Jost Light e do Open Sans Bold. A marca
sai idêntica mesmo no modo de fallback.

## Teste

A rede do sandbox de desenvolvimento não alcança `supabase.co`. Para exercitar a
função de verdade, chame-a de dentro do banco com `pg_net`:

```sql
select net.http_post(
  url := 'https://mgcgmdiymqpxcsxhelhs.supabase.co/functions/v1/gerar-documento-pdf',
  headers := jsonb_build_object('apikey', '<publishable>', 'Authorization', 'Bearer <jwt>',
                                'Content-Type', 'application/json'),
  body := jsonb_build_object('tipo','proposta','id','<uuid>'));
-- e depois:
select status_code, content_type, headers->>'x-fontes', left(content, 8) from net._http_response;
```

**Apague o histórico depois** (`delete from net._http_response`): ele guarda o JWT
usado no teste, e um token válido não pode ficar parado numa tabela.
