-- Cria a RPC distribuir_lead_rr, chamada pelo webhook público e por leads.functions.ts.
-- Estava ausente em produção (o webhook respondia 500 "function does not exist").
-- Diferença para distribuir_lead_round_robin: devolve jsonb { lead_id, corretor_id } e
-- aceita chamada do service_role (sem auth.uid()), que é como o webhook entra.
create or replace function public.distribuir_lead_rr(
  p_nome text, p_telefone text, p_email text, p_grupo_id uuid, p_extra jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_corretor_id uuid := null;
  v_lead_id uuid;
begin
  -- Usuário logado precisa poder operar o grupo; service_role (auth.uid() nulo) é confiável.
  if auth.uid() is not null and not public.posso_operar_grupo(p_grupo_id) then
    raise exception 'Você não tem permissão para enviar leads a este grupo.';
  end if;

  if public.dentro_do_horario(p_grupo_id) then
    select c.id into v_corretor_id
    from public.corretores c
    left join (
      select corretor_id, max(created_at) as ultimo_lead
      from public.leads where grupo_id = p_grupo_id group by corretor_id
    ) l on l.corretor_id = c.id
    where c.grupo_id = p_grupo_id and c.ativo = true
    order by l.ultimo_lead nulls first, c.created_at asc
    limit 1 for update of c skip locked;
  end if;

  insert into public.leads (
    nome, telefone, email, grupo_id, corretor_id, status, represado_em, fonte, canal, cidade,
    etapa_funil, motivo_perda, observacoes, ultima_atividade, data_atividade, valor_negociacao,
    codigo_imovel, campanha, corretor_origem_nome
  ) values (
    p_nome, p_telefone, p_email, p_grupo_id, v_corretor_id,
    case when v_corretor_id is null then 'represado' else 'distribuido' end,
    case when v_corretor_id is null then now() else null end,
    p_extra->>'fonte', p_extra->>'canal', p_extra->>'cidade', p_extra->>'etapa_funil',
    p_extra->>'motivo_perda', p_extra->>'observacoes', p_extra->>'ultima_atividade',
    nullif(p_extra->>'data_atividade','')::timestamptz,
    nullif(p_extra->>'valor_negociacao','')::numeric,
    p_extra->>'codigo_imovel', p_extra->>'campanha', p_extra->>'corretor_origem_nome'
  ) returning id into v_lead_id;

  return jsonb_build_object('lead_id', v_lead_id, 'corretor_id', v_corretor_id);
end;
$$;

revoke all on function public.distribuir_lead_rr(text,text,text,uuid,jsonb) from public, anon;
grant execute on function public.distribuir_lead_rr(text,text,text,uuid,jsonb) to authenticated, service_role;
