# energyprose

Site e sistema da **Energy PRO**, num único domínio (`energyprose.netlify.app`).

## O que vive aqui

| Rota | O que é | Onde está no repo |
|---|---|---|
| `/` | Formulário público de cadastro — o cliente preenche sozinho, sem login | `publico/` (estático, sem build) |
| `/p/:token` | Aceite da proposta pelo cliente, por link seguro | `src/paginas/PropostaPublica.tsx` |
| `/login` `/crm` `/propostas` `/contratos` `/catalogo` `/configuracoes` | **Energy PRO Gestão** — CRM, propostas e contratos | `src/` (React + Vite) |
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
- Edge Function que gera o PDF da proposta (layout pronto e aprovado).
- Telas de Propostas, Contratos, Catálogo e Configurações.
- Portar Cadastros para o React e aposentar `publico/painel.html` + `publico/app.js`.
- No painel do Supabase: desligar autocadastro e ligar proteção de senha vazada.
- Texto jurídico do contrato (o gerador sai como minuta até o aval).
