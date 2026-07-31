# gerar-documento-pdf

Gera os três documentos comerciais da Energy PRO.

| Entrada | Layout que sai | Fonte |
|---|---|---|
| `{"tipo":"proposta","id":…}` + linha com `documento = 'usina'` | proposta rica de usina, 1 página | `src/layout-proposta.mjs` |
| `{"tipo":"proposta","id":…}` + linha com `documento = 'servico'` | Proposta Comercial, 1–2 páginas | `src/layout-servico.mjs` |
| `{"tipo":"contrato","id":…}` | contrato de usina ou de manutenção | `src/layout-contrato.mjs` |

Quem escolhe é o banco: a função lê `ctx.linha.documento`, devolvido por
`render_document_context`. O cabeçalho `x-layout` da resposta diz qual saiu.

## Fonte × artefato

- **`src/`** é o código-fonte legível do layout (comentado, um módulo por assunto).
- **`layout.js`** é o BUNDLE gerado a partir dele — minificado, um arquivo só.
  Não edite `layout.js` à mão: edite `src/` e regenere.

```bash
npm run build:ef      # gera supabase/functions/gerar-documento-pdf/layout.js
```

O bundle existe porque a Edge Function sobe como um conjunto de arquivos, e um
arquivo só reduz superfície de erro no deploy. O `pdf-lib` fica externo
(resolvido pelo `deno.json` como `npm:`).

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

**3. `--charset=utf8` não é enfeite.** O bundle tem 64 KB numa linha só e o
deploy passa por transcrição; sequências `\uXXXX` não atravessam esse caminho
intactas. Com `--charset=utf8` o esbuild emite o caractere acentuado literal, e
aí o arquivo transcreve. O código-fonte também evita `\uXXXX` em regex — por
isso `moeda()` usa `/\s/g` e não `/[\u00A0]/g`. Confira antes de subir:

```bash
grep -c '\\u[0-9a-fA-F]\{4\}' layout.js     # tem que dar 0
md5sum layout.js                            # confira depois do deploy
```

**4. Fonte em subconjunto não tem todo caractere.** O espaço inquebrável que o
`toLocaleString` põe entre "R$" e o número saía como retângulo vazio; o marcador
de lista "•" saía invisível. O primeiro virou espaço comum em `moeda()`, o
segundo virou um retângulo âmbar desenhado. No PDF só entra alfabeto latino comum.

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
select status_code, content_type, headers->>'x-layout', headers->>'x-fontes',
       headers->>'content-length', left(content, 8)
  from net._http_response;
```

**Apague o histórico depois** (`delete from net._http_response`): ele guarda o JWT
usado no teste, e um token válido não pode ficar parado numa tabela.

Para conferir o layout sem rede, os três renderizadores rodam local:

```bash
cd ../../..            # raiz do projeto de PDF
node teste-servico.mjs     # Proposta Comercial, 3 cenários
node teste-contrato2.mjs   # contrato de usina e de manutenção
```
