-- ===========================================================================
-- 30 — a proposta passa a se apresentar ao funil
--
-- ESTE ARQUIVO É O QUE FOI APLICADO EM PRODUÇÃO, palavra por palavra.
--
-- O vínculo entre proposta e oportunidade é `crm_leads.metadata->>'proposta_id'`.
-- CINCO funções o LEEM:
--   save_proposta                   -> atualiza `expected_value` do lead
--   preparar_envio_proposta         -> cria a tarefa de follow-up e o next_action_at
--   proposta_publica_decidir        -> move o card quando o cliente aceita/recusa
--   converter_proposta_em_contrato  -> move o card para "ganho"
--   crm_snapshot                    -> entrega o `proposta_id` para a tela
--
-- E UMA SÓ o escrevia: `convert_crm_lead_to_proposal`, que só roda quando a
-- proposta nasce pelo botão do funil. Quem cria pela tela de Propostas — o
-- caminho normal — nunca passava por ali. Em produção antes desta migração:
-- 8 oportunidades, ZERO vinculadas, zero com próxima ação, zero atividades.
-- Cinco automações escritas e apagadas.
--
-- PATCH POR SUBSTITUIÇÃO, e não reescrita: o corpo da função é lido de
-- `pg_proc` e recebe dois enxertos. Assim o resto sai byte a byte igual ao que
-- está em produção — reescrever de memória já me custou duas correções neste
-- projeto (a migração 24 apagou metade do crm_snapshot; a 28 inventou uma
-- coluna). As duas âncoras foram conferidas antes: aparecem exatamente 1 vez.
-- ===========================================================================
do $migracao$
declare
  v_src text;
  v_declare_de text := E'        v_linha text; v_doc text; v_tipo text;';
  v_declare_para text := E'        v_linha text; v_doc text; v_tipo text;\n'
    || E'        -- Novos: o vínculo com o funil (migração 30).\n'
    || E'        v_cadastro uuid; v_lead uuid; v_lead_prop text; v_prop_viva boolean;';
  v_valor_de text := E'  update crm_leads set expected_value = v_total';
  v_valor_para text :=
       E'  -- ===== O VÍNCULO COM O FUNIL (migração 30) =====\n'
    || E'  -- O `cadastro_id` efetivo é lido de volta da tabela, e não do payload: na\n'
    || E'  -- edição o UPDATE usa `coalesce(payload, coluna)`, então o que vale pode\n'
    || E'  -- ser o que já estava gravado.\n'
    || E'  select cadastro_id into v_cadastro from propostas where id = v_id;\n'
    || E'  if v_cadastro is not null then\n'
    || E'    select id, metadata->>''proposta_id'' into v_lead, v_lead_prop\n'
    || E'      from crm_leads where cadastro_id = v_cadastro and deleted_at is null limit 1;\n'
    || E'    if v_lead is not null then\n'
    || E'      v_prop_viva := null;\n'
    || E'      if coalesce(v_lead_prop,'''') <> '''' then\n'
    || E'        begin\n'
    || E'          select true into v_prop_viva from propostas\n'
    || E'           where id = v_lead_prop::uuid and deleted_at is null\n'
    || E'             and status in (''rascunho'',''enviada'',''aceita'');\n'
    || E'        exception when invalid_text_representation then\n'
    || E'          -- metadata com lixo no lugar do uuid: trata como sem vínculo, em\n'
    || E'          -- vez de derrubar a gravação da proposta inteira.\n'
    || E'          v_prop_viva := false;\n'
    || E'        end;\n'
    || E'      end if;\n'
    || E'      -- Nunca ROUBA o vínculo de uma proposta viva: cliente que fechou a\n'
    || E'      -- usina e depois recebe orçamento de manutenção não pode ter o card\n'
    || E'      -- de ganho re-apontado para o rascunho novo.\n'
    || E'      if not coalesce(v_prop_viva, false) then\n'
    || E'        update crm_leads set metadata = metadata || jsonb_build_object(''proposta_id'', v_id)\n'
    || E'         where id = v_lead;\n'
    || E'      end if;\n'
    || E'    end if;\n'
    || E'  end if;\n\n'
    || E'  update crm_leads set expected_value = v_total';
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'save_proposta';

  if v_src is null then raise exception 'save_proposta não existe'; end if;
  if position(v_declare_de in v_src) = 0 then raise exception 'âncora do declare não encontrada'; end if;
  if position(v_valor_de in v_src) = 0 then raise exception 'âncora do expected_value não encontrada'; end if;
  if position('v_cadastro' in v_src) > 0 then raise exception 'migração 30 já aplicada'; end if;

  v_src := replace(v_src, v_declare_de, v_declare_para);
  v_src := replace(v_src, v_valor_de, v_valor_para);

  execute 'create or replace function public.save_proposta(p_payload jsonb) returns uuid '
       || 'language plpgsql security definer set search_path to ''public'' as $corpo$'
       || v_src || '$corpo$';
end $migracao$;

-- Conferência: se o enxerto não pegou, para tudo antes do backfill.
do $conf$
begin
  if (select position('v_prop_viva' in prosrc) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.prokind='f' and p.proname='save_proposta') = 0 then
    raise exception 'o enxerto não entrou em save_proposta';
  end if;
end $conf$;

-- ===========================================================================
-- Recuperar o que já está no ar: leads que hoje têm proposta e nenhum vínculo.
-- Sem isto eles só se ligariam na próxima vez que alguém salvasse aquelas
-- propostas. Com mais de uma proposta viva, vale a mais recente.
--
-- ARMADILHA: `update ... from lateral (...)` NÃO enxerga a tabela alvo (falha
-- com 42P10). Tem de ser subconsulta correlacionada no SET, com o mesmo filtro
-- repetido no WHERE para não gravar `null` em quem não tem proposta nenhuma.
-- ===========================================================================
update crm_leads l
   set metadata = l.metadata || jsonb_build_object('proposta_id', (
         select p.id from propostas p
          where p.cadastro_id = l.cadastro_id and p.deleted_at is null
            and p.status in ('rascunho','enviada','aceita')
          order by p.created_at desc limit 1))
 where l.deleted_at is null
   and l.cadastro_id is not null
   and coalesce(l.metadata->>'proposta_id','') = ''
   and exists (select 1 from propostas p
                where p.cadastro_id = l.cadastro_id and p.deleted_at is null
                  and p.status in ('rascunho','enviada','aceita'));

-- E o valor esperado, que dependia do vínculo para existir.
update crm_leads l
   set expected_value = p.valor_total
  from propostas p
 where p.id::text = l.metadata->>'proposta_id'
   and l.deleted_at is null
   and p.deleted_at is null
   and l.expected_value is distinct from p.valor_total;
