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
                  →  proposta (kWp e geração calculados de src/lib/solar.ts)
                  →  PDF (Edge Function, layout fixo em código)
                  →  envio por WhatsApp com link /p/<token>
                  →  cliente aceita ou recusa (decisão imutável)
                  →  contrato
```

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

### Edge Functions

| Função | O que faz |
|---|---|
| `gerar-documento-pdf` | Gera o PDF da proposta a partir de `render_document_context`, arquiva no bucket `documentos` e registra a trilha. Ver `supabase/functions/gerar-documento-pdf/LEIA-ME.md`. |

A extensão **`pg_net`** está habilitada: foi o caminho para testar a Edge Function
de dentro do banco (a rede do sandbox de desenvolvimento não alcança `supabase.co`)
e é o mecanismo previsto para o aviso de lead novo. Ela é inerte enquanto ninguém
a chama. Se algum dia sobrar histórico em `net._http_response`, **apague**: essa
tabela guarda o corpo das requisições, incluindo tokens.

> **Pendência do repositório:** os arquivos `.sql` dessas migrations ainda não estão em
> `supabase/migrations/`. Elas estão aplicadas em produção e registradas no histórico do
> próprio Supabase; exportar para cá é o próximo passo, para o repositório voltar a ser
> reconstrutível do zero.

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

- Exportar as migrations `08`–`15` para `supabase/migrations/`.
- Tela de Contratos + PDF do contrato (depende do texto jurídico).
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
