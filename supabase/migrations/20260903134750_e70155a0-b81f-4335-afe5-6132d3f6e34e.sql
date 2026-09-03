create or replace function public.distribuir_lote_diario_planilha()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_res jsonb := '{}'::jsonb;
  v_c record;
begin
  for v_c in select * from (values
      ('181c21fb-a90f-4655-b413-c347aacdf66f'::uuid, 20),
      ('50de721b-4f14-42bc-8e9e-218c0e085a3c'::uuid, 3)) as t(cid, qtd) loop

    with sel as (
      select id from public.leads
      where fonte = 'planilha_samuelimob'
        and status = 'represado'
        and corretor_id is null
      order by created_at
      limit v_c.qtd
      for update skip locked
    ), upd as (
      update public.leads l
        set corretor_id = v_c.cid,
            status = 'distribuido',
            represado_em = null,
            liberado_em = now(),
            ultima_atividade_em = now()
      from sel
      where l.id = sel.id
      returning l.id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from upd;

    delete from public.fila_notificacoes f
    where f.corretor_id = v_c.cid
      and f.status = 'pendente'
      and f.lead_id = any(v_ids)
      and f.id <> (
        select f2.id from public.fila_notificacoes f2
        where f2.corretor_id = v_c.cid
          and f2.status = 'pendente'
          and f2.lead_id = any(v_ids)
        order by f2.created_at
        limit 1
      );

    v_res := v_res || jsonb_build_object(v_c.cid::text, coalesce(array_length(v_ids,1),0));
  end loop;
  return v_res;
end;
$$;

revoke all on function public.distribuir_lote_diario_planilha() from public, anon, authenticated;
grant execute on function public.distribuir_lote_diario_planilha() to service_role;