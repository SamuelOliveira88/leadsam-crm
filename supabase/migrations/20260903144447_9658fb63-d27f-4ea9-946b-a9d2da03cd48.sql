CREATE OR REPLACE FUNCTION public.distribuir_gota_planilha()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sofia uuid := '181c21fb-a90f-4655-b413-c347aacdf66f';
  v_sidney uuid := '50de721b-4f14-42bc-8e9e-218c0e085a3c';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_min int := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int * 60
             + extract(minute from (now() at time zone 'America/Sao_Paulo'))::int;
  v_slot int;
  v_res jsonb := '{}'::jsonb;
  v_c record;
  v_feitos int;
  v_dado int;
begin
  -- janela 9:00 -> 18:45 (SP), passos de 15 min
  if v_min < 540 or v_min > 1125 then
    return jsonb_build_object('skip', 'fora da janela');
  end if;
  v_slot := (v_min - 540) / 15;

  for v_c in select * from (values (v_sofia, 30, 1), (v_sidney, 3, 13)) as t(cid, meta, cada) loop
    select count(*) into v_feitos from public.leads
      where corretor_id = v_c.cid
        and fonte = 'planilha_samuelimob'
        and (liberado_em at time zone 'America/Sao_Paulo')::date = v_hoje;

    if v_feitos >= v_c.meta or (v_slot % v_c.cada) <> 0 then
      v_res := v_res || jsonb_build_object(v_c.cid::text, 0);
      continue;
    end if;

    with sel as (
      select id from public.leads
      where fonte = 'planilha_samuelimob'
        and status = 'represado'
        and corretor_id is null
      order by created_at
      limit 1
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
    select count(*)::int into v_dado from upd;

    v_res := v_res || jsonb_build_object(v_c.cid::text, v_dado);
  end loop;
  return v_res;
end;
$function$;