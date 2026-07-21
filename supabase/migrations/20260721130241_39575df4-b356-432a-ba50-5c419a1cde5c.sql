CREATE OR REPLACE FUNCTION public.dentro_do_horario(p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_agora timestamp := now() at time zone 'America/Sao_Paulo';
  v_dia int := extract(dow from v_agora);
  v_hora time := v_agora::time;
  v_ok boolean;
begin
  select exists (
    select 1 from public.horarios_atendimento
    where grupo_id = p_grupo_id
      and dia_semana = v_dia
      and ativo = true
      and v_hora between hora_inicio and hora_fim
  ) into v_ok;
  return v_ok;
end;
$function$;