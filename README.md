# energyprose

Site e sistema da **Energy PRO**, num único domínio (`energyprose.netlify.app`).

## O que vive aqui

| Rota | O que é | Onde está no repo |
|---|---|---|
| `/` | Formulário público de cadastro — o cliente preenche sozinho, sem login | `publico/` (estático, sem build) |
| `/p/:token` | Aceite da proposta pelo cliente, por link seguro | `src/paginas/PropostaPublica.tsx` |
| `/login` `/crm` `/propostas` `/contratos` `/catalogo` `/configuracoes` | **Energy PRO Gestão** — CRM, propostas e contratos | `src/` (React + Vite) |

### O ciclo comercial, ponta a ponta

```
cadastro no site  →  lead no funil (automático, gatilho)
                  →  proposta (a LINHA DE SERVIÇO decide o resto)
                  →  PDF (Edge Function, layout fixo em código)
                  →  envio por WhatsApp com link /p/<token>
                  →  cliente aceita ou recusa (decisão imutável)
                  →  contrato (só nas linhas que geram contrato)
```

## Linhas de serviço

A Energy PRO não vende só usina — o site a posiciona como *Soluções em
Engenharia*, e o portfólio tem oito linhas. Duas coisas diferentes têm nome
próprio, na tabela `linhas_servico`:

- **linha** — o que se vende (usina, projeto elétrico, homologação, …)
- **documento** — qual PDF sai: `usina` (a proposta rica) ou `servico` (a
  Proposta Comercial enxuta, formato de CRM de mercado)
- **contrato_tipo** — que contrato aquilo gera; `NULL` significa que a linha
  fecha no aceite da proposta e não gera contrato nenhum

| Linha | Documento | Contrato |
|---|---|---|
| Usina Solar Fotovoltaica | proposta de usina | fornecimento e instalação |
| Projeto Elétrico de Baixa Tensão | Proposta Comercial | — |
| Projeto de Microgeração Distribuída (MMGD) | Proposta Comercial | — |
| Homologação junto à Concessionária | Proposta Comercial | — |
| Extensão de Rede de Distribuição | Proposta Comercial | — |
| Limpeza Técnica de Módulos Fotovoltaicos | Proposta Comercial | — |
| Manutenção de Sistema Fotovoltaico | Proposta Comercial | manutenção |
| Manutenção Elétrica Predial | Proposta Comercial | — |

O vendedor escolhe **a linha**; `propostas.tipo`, a exigência do bloco do
sistema e a existência do botão "Criar contrato" são consequência disso. Antes
`tipo` era escolha livre e nada garantia que batesse com o que estava sendo
vendido — dava para ter uma proposta de limpeza marcada como usina.

Cadastrar uma linha nova é inserir uma linha na tabela: os dois PDFs e o front
já se orientam por ela. O que **não** é automático é um layout novo.

**Dois números são calculados e podem ser sobrescritos**: potência instalada e
geração média. Assim que o vendedor digita um deles à mão, o cálculo automático
para de sobrescrever aquele campo — ele às vezes ajusta a geração para o número
que combinou com o cliente, e o sistema não pode desfazer isso a cada tecla.
A tela mostra "automática" ou "manual" ao lado do rótulo.
| `/novo` `/cadastros` `/cadastros/:id` | Painel de cadastros anterior, ainda no ar | `publico/painel.html` + `publico/app.js` |

As duas aplicações usam **o mesmo Supabase Auth e a mesma tabela `perfis`**. A sessão fica
na mesma origem, então entrar em um lado já entra no outro — é o que permite a migração ser
gradual em vez de um corte único.

## Como o build monta o site

```
npm run build
   ├── tsc --noEmit                 confere os tipos
   ├── vite build                   app React  → dist/painel/
   └── scripts/montar-dist.mjs      copia publico/* → dist/  (painel.html vira painel-legado.html)
```

Só `dist/` é publicado. **O código-fonte nunca vai ao ar** — que era o problema de publicar a
raiz do repositório, como estava antes.

No Netlify: build `npm run build`, publish `dist`, Node 22 (tudo já em `netlify.toml`).

### Rotas

Ficam em `netlify.toml`, não num arquivo `_redirects`. **A primeira regra que casa vence** —
rota nova entra *antes* do `/*` final, senão cai no formulário público e dá 404 aparente.

## Banco de dados

Projeto Supabase `mgcgmdiymqpxcsxhelhs` (São Paulo). Migrations `01`–`07` criaram o cadastro
público; `08`–`15` acrescentaram o módulo comercial:

| Migration | O que trouxe |
|---|---|
| `08_comercial_base` | config da empresa, catálogos de serviços e equipamentos, CRM, propostas, contratos, numeração `PROP-AAAA-NNNN` / `CTR-AAAA-NNNN` |
| `09_comercial_rls` | RLS de todas as tabelas novas + bucket privado `documentos` |
| `10_comercial_rpcs_crm_propostas` | `crm_snapshot`, `save_crm_lead`, `move_crm_lead`, `save_crm_activity`, `save_proposta`, `convert_crm_lead_to_proposal`, `duplicar_proposta`, `criar_revisao_proposta`, `expirar_propostas` |
| `11_comercial_publico_contrato_documentos` | `preparar_envio_proposta`, `proposta_publica_ler`, `proposta_publica_decidir`, `converter_proposta_em_contrato`, `render_document_context` |
| `12_comercial_seeds` | dados reais da Energy PRO: funil, catálogos, textos da proposta |
| `13_integracao_cadastro_para_lead` | cadastro do site vira oportunidade no funil |
| `14_fix_gatilho_lead_after_insert` | correção: o gatilho precisa ser `AFTER INSERT` (ver abaixo) |
| `15_hardening_grants_funcoes` | fecha o `EXECUTE` que PUBLIC herdava (ver abaixo) |
| `16_linhas_de_servico` | tabela `linhas_servico`, coluna `linha` em `propostas` e `servicos_catalogo`, `tipo` aceita `servico` |
| `17_catalogo_por_linha` | catálogo reescrito com a nomenclatura técnica das oito linhas (22 itens) |
| `18_contexto_de_documento_por_linha` | `render_document_context` passa a devolver a linha e o `detalhe` de cada item; `propostas.prazo_execucao` |
| `19_salvar_e_converter_por_linha` | `save_proposta` deriva `tipo` da linha e apaga o bloco de sistema fora da usina; `converter_proposta_em_contrato` respeita `contrato_tipo` |
| `20_save_contrato` | `save_contrato` e `arquivar_contrato` — abre a edição de recorrência, visitas e vigência, e o contrato avulso sem proposta |
| `21_expiracao_automatica` | `pg_cron` + job diário; `expirar_propostas()` passa a registrar evento |
| `22_fecha_anon_nas_funcoes_novas` | fecha o grant EXPLÍCITO que o Supabase dá a `anon` em toda função nova (ver armadilha 3) |
| `23_correcoes_auditoria` | `duplicar_proposta` copia a linha; gatilho deriva `tipo` da linha; aceite recusa proposta expirada; `expirar_propostas` ganha gate |
| `24_numeracao_e_contratos` | `numero_seq` sempre gravado e ano em Brasília; um contrato por proposta; vínculo imutável; conversão preenche o plano de manutenção |
| `25_restaura_crm_snapshot` | restaura a função da 10 com o filtro de etapa arquivada nos KPIs (a 24 a havia reescrito errado) |
| `26_pdf_publico_por_token` | `proposta_publica_pdf`: quinta porta pública, devolve o caminho do PDF de uma proposta |
| `27_fecha_net_e_sal_do_ip` | tira `sal_ip`, `ip_hash` e `limpar_envios_publicos` do alcance do `anon` |

### Edge Functions

| Função | O que faz | JWT |
|---|---|---|
| `gerar-documento-pdf` | Gera **três** documentos a partir de `render_document_context`, arquiva no bucket `documentos` e registra a trilha. Ver o `LEIA-ME.md` da função. | exigido |
| `proposta-publica-pdf` | Entrega o PDF ao CLIENTE pelo link do WhatsApp. Sem login: a autorização é o token, conferido pela RPC `proposta_publica_pdf`. A chave de serviço não sai da função, e o caminho do arquivo vem do banco, nunca do pedido. | não |

O caminho bonito `/p/<token>/pdf` é um **proxy** do Netlify (status 200) para a
segunda função: o cliente nunca vê o domínio do Supabase, e o link que ele
guardou continua sendo o da Energy PRO. A regra fica ANTES do `/p/*`, senão o
app React responde primeiro e o cliente vê a tela de aceite em vez do arquivo.

Os três layouts, e quem escolhe:

| Entrada | Layout | Arquivo-fonte |
|---|---|---|
| `tipo=proposta` + linha com `documento = 'usina'` | proposta rica de usina, 1 página | `src/layout-proposta.mjs` |
| `tipo=proposta` + linha com `documento = 'servico'` | Proposta Comercial, 1–2 páginas | `src/layout-servico.mjs` |
| `tipo=contrato` | contrato de usina **ou** de manutenção | `src/layout-contrato.mjs` |

Quem escolhe é o banco, não o front: a função lê `ctx.linha.documento`. O
cabeçalho `x-layout` da resposta diz qual saiu.

A extensão **`pg_net`** está habilitada: foi o caminho para testar a Edge Function
de dentro do banco (a rede do sandbox de desenvolvimento não alcança `supabase.co`)
e é o mecanismo previsto para o aviso de lead novo. Ela é inerte enquanto ninguém
a chama. Se algum dia sobrar histórico em `net._http_response`, **apague**: essa
tabela guarda o corpo das requisições, incluindo tokens.

> **Pendência do repositório:** os arquivos `.sql` dessas migrations ainda não estão em
> `supabase/migrations/`. Elas estão aplicadas em produção e registradas no histórico do
> próprio Supabase; exportar para cá é o próximo passo (ver Pendências).

### Duas armadilhas que já custaram caro

**1. Gatilho que cria o lead precisa ser `AFTER INSERT`.** Num `BEFORE INSERT` a linha do
cadastro ainda não existe, então a FK `crm_leads.cadastro_id` estoura. Como o corpo do gatilho
vive dentro de um bloco de exceção (o cadastro do cliente nunca pode ser perdido por causa do
lead), o erro sumia em silêncio: o formulário funcionava e nenhum lead nascia. Hoje a falha,
se houver, fica registrada em `cadastro_eventos` com `acao = 'lead_falhou'`.

**2. `revoke execute ... from anon` não basta.** No Postgres toda função nasce com `EXECUTE`
para `PUBLIC`, e `anon` herda de `PUBLIC`. Revogue **de `PUBLIC`** e conceda nominalmente.
Confira com:

```sql
select proname, coalesce(array_to_string(proacl::text[], ' | '), 'SEM ACL → PUBLIC executa')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' order by proname;
```

Uma ACL com `=X/postgres` significa que PUBLIC executa.

**3. `revoke from public` NÃO fecha o `anon` no Supabase.** A armadilha 2 conta
só metade da história, e a outra metade custou uma regressão real na migration
20. O Supabase mantém

```sql
alter default privileges in schema public grant all on functions
  to anon, authenticated, service_role;
```

então toda função **nova** nasce com um grant EXPLÍCITO para `anon`, que
`revoke ... from public` não encosta. O `save_contrato` ficou aberto ao mundo
mesmo com o revoke escrito na migration. `save_proposta` escapou por acidente:
a 19 usou `CREATE OR REPLACE` sobre função que já existia, e o replace preserva
a ACL — os default privileges só entram num CREATE de verdade.

A 22 fecha o que havia e desliga o default para o futuro. A conferência que
importa não é ler a ACL, é perguntar ao Postgres:

```sql
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and has_function_privilege('anon', p.oid, 'execute');
```

Só quatro nomes podem aparecer: `cadastro_publico`, `cadastro_publico_finalizar`,
`proposta_publica_ler`, `proposta_publica_decidir`. Qualquer outro é regressão.

> O sweep também tirou `EXECUTE` de `authenticated` nas duas funções de gatilho
> (`criar_lead_de_cadastro`, `set_numero_comercial`). Isso é inofensivo e foi
> testado: o Postgres não reconfere esse privilégio na hora de disparar um
> gatilho. Um cadastro inserido como `authenticated` continua gerando lead, e a
> proposta continua saindo numerada.

**4. Escape unicode não sobrevive ao deploy da Edge Function.** O bundle
`layout.js` é um arquivo de 64 KB numa linha só, e o deploy passa por
transcrição — sequências `\uXXXX` não atravessam esse caminho intactas. Por
isso o build usa `esbuild --charset=utf8` (acento vira caractere literal, não
escape) e o código-fonte evita `\uXXXX` em regex: `moeda()` normaliza o espaço
inquebrável com `/\s/g`, não com `/[\u00A0]/g`. Antes de qualquer deploy:

```bash
grep -c '\\u[0-9a-fA-F]\{4\}' supabase/functions/gerar-documento-pdf/layout.js   # tem que dar 0
```

**5. Fontes em subconjunto não têm todo caractere que o JavaScript produz.**
`toLocaleString` separa "R$" do número com espaço inquebrável (U+00A0) e ele
saía como um retângulo vazio no meio do valor. O mesmo vale para o marcador
"•", que no contrato é **desenhado** como um retângulo âmbar em vez de escrito.
Regra prática: no PDF só entra caractere do alfabeto latino comum.

### Uma falha silenciosa que o front precisa tratar

No Supabase, um **UPDATE barrado pelo RLS não devolve erro** — apenas afeta zero
linhas. Um `if (error)` sozinho, então, reporta sucesso quando nada foi gravado.
Toda escrita por tabela neste app usa `.select()` e confere se voltou linha:

```ts
const { data, error } = await sb.from('config_empresa').update({...}).eq('id', true).select('id');
if (error) throw new Error(error.message);
if (!data?.length) throw new Error('Nada foi salvo: só um administrador pode alterar.');
```

Vale para `config_empresa` (só admin), `servicos_catalogo` e `equipamentos_catalogo`
(admin e vendedor). INSERT é diferente: esse **estoura** quando o RLS barra.

### Segurança, em uma frase

O role `anon` não tem policy nenhuma nas tabelas. As únicas portas públicas são funções
`SECURITY DEFINER` que validam por dentro: `cadastro_publico` (honeypot + limite por IP) e
`proposta_publica_ler` / `proposta_publica_decidir` (token opaco de 32 bytes, guardado como
hash SHA-256, com validade).

Por isso o Security Advisor mostra avisos `security_definer_function_executable` — todos
**intencionais**. A linha de base hoje é ~21 avisos (as RPCs da equipe + as 4 públicas +
`auth_leaked_password_protection`, que é ajuste de painel). Alerta de outro tipo é regressão.

### Um item que só o painel do Supabase resolve

O schema `net` (pg_net) é executável pelo `anon`: as duas tabelas sem RLS e as
funções `http_*` liberadas. **Não dá para corrigir por migration** — o schema
pertence a `supabase_admin`, e o `postgres` do projeto não tem permissão para
revogar (o comando roda sem erro e sem efeito).

Hoje é inalcançável, porque o PostgREST só expõe `public` e `graphql_public`.
A regra prática, então, é uma só: **nunca acrescente `net` (nem `seguranca`) à
lista de "Exposed schemas"** em Settings → API. Se um dia isso acontecer,
`net._http_response` — que guarda corpo e cabeçalhos, `Authorization` incluído —
vira leitura pública, e `net.http_post` vira SSRF.

## Rotinas automáticas

| Job | Quando | O que faz |
|---|---|---|
| `expirar-propostas` | todo dia às 03:05 UTC (00:05 de Brasília) | marca como `expirada` toda proposta `enviada` com validade vencida, e registra o evento com `actor_id` nulo — não foi pessoa nenhuma, foi o relógio |

O `cron` do Postgres roda em UTC. O horário é o começo do dia brasileiro de
propósito: a proposta que venceu ontem já aparece expirada quando a equipe abre
o sistema, e não no meio do expediente. Para conferir:

```sql
select jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 5;
```

## Navegação entre as duas aplicações

O painel de cadastros (`publico/`) e o app de gestão (`src/`) são shells
separados, cada um com seu roteador. O caminho entre eles é link comum, **sem**
`data-rota` — o roteador do painel legado intercepta só o que é dele, e um link
sem esse atributo recarrega a página e entrega a rota a quem sabe tratá-la. A
sessão é a mesma, então a troca é transparente para quem está usando.

| De | Para | Onde |
|---|---|---|
| Gestão | Cadastros | item "Cadastros" no menu lateral (`Layout.tsx`) |
| Cadastros | Funil | botão "← Funil", em destaque âmbar (`publico/app.js`) |
| Cadastros | Propostas | link "Propostas" no canto direito |

O botão de volta tem cor da marca de propósito: sair do painel é troca de
contexto, não mais uma aba — quem chegou pelo CRM precisa enxergar o caminho
de volta sem procurar.

## Desenvolvimento

```bash
npm install
npm run dev        # app em http://localhost:5173/painel/
npm test           # cálculos de dimensionamento
npm run build      # gera dist/ igual ao que o Netlify publica
```

O formulário público não tem build: editar `publico/` e publicar já basta.

### Onde as regras vivem em dois lugares

Máscaras e formatação existem em `publico/comum.js` (site, sem build) **e** em
`src/lib/formato.ts` (app). Não dá para importar um do outro sem colocar build no site
público. A paridade é responsabilidade dos testes — se mudar uma regra, mude nos dois.

## Pendências conhecidas

- **Redeployar a Edge Function.** É a única pendência que trava função nova.
  O que está em produção hoje (versão 3) gera a proposta de usina e os dois
  contratos; **não** conhece a Proposta Comercial de serviço. O código já está
  aqui, testado e com o bundle gerado — falta subir:

  ```bash
  npm run build:ef
  supabase functions deploy gerar-documento-pdf --project-ref mgcgmdiymqpxcsxhelhs
  ```

  Enquanto não subir, uma proposta de linha de serviço sai com o layout de
  usina e é barrada na validação por falta do bloco do sistema.
- Exportar as migrations `08`–`19` para `supabase/migrations/`, para o
  repositório voltar a ser reconstrutível do zero:

  ```bash
  supabase link --project-ref mgcgmdiymqpxcsxhelhs
  supabase db pull
  ```
- Revisão jurídica do texto do contrato antes do primeiro uso real.
- Envio só por WhatsApp — não há e-mail nem registro de "o cliente abriu o link".
- **Decidir a assinatura da marca.** O site `energyprose.com.br` usa
  *Soluções em Engenharia*; o logo embutido no PDF (`src/glifos.mjs`) diz
  *Soluções em Energia Solar*. Com projeto elétrico, extensão de rede e
  manutenção predial no portfólio, a do site descreve melhor a empresa — mas
  trocar exige reextrair os contornos vetoriais da tagline.
- Preencher CNPJ, endereço e e-mail comercial em Configurações: hoje estão em
  branco e o contrato imprime "—" no lugar do CNPJ da CONTRATADA.
- Servir as fontes: elas já estão em `publico/fontes/`, mas só passam a valer
  depois do primeiro deploy. Até lá o PDF sai com as fontes padrão — o cabeçalho
  `x-fontes` da resposta diz qual foi usada, e a tela avisa.
- Remover a Edge Function `diag-pdf` pelo painel (já neutralizada, devolve 410).
- Apagar 1 PDF de teste órfão no bucket `documentos`
  (`propostas/908a5b5a-.../PROP-2026-0001-R0.pdf`) — o Storage não permite
  remoção por SQL.
- Portar Cadastros para o React e aposentar `publico/painel.html` + `publico/app.js`.
- No painel do Supabase: desligar autocadastro e ligar proteção de senha vazada.
- Texto jurídico do contrato (o gerador sai como minuta até o aval).
