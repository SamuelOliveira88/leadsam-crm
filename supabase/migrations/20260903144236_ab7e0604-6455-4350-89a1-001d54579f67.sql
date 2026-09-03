CREATE OR REPLACE FUNCTION public.liberar_leads_represados()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lead record; v_corretor_id uuid;
BEGIN
  FOR v_lead IN
    SELECT * FROM public.leads
     WHERE status = 'represado'
       AND COALESCE(fonte, '') <> 'planilha_samuelimob'
  LOOP
    IF public.dentro_do_horario(v_lead.grupo_id) THEN
      SELECT c.id INTO v_corretor_id
      FROM public.corretores c
      LEFT JOIN (
        SELECT corretor_id, max(created_at) AS ultimo_lead
        FROM public.leads WHERE grupo_id = v_lead.grupo_id GROUP BY corretor_id
      ) l ON l.corretor_id = c.id
      WHERE c.grupo_id = v_lead.grupo_id AND c.ativo = true
      ORDER BY l.ultimo_lead NULLS FIRST, c.created_at ASC
      LIMIT 1 FOR UPDATE OF c SKIP LOCKED;

      IF v_corretor_id IS NOT NULL THEN
        UPDATE public.leads
        SET corretor_id = v_corretor_id, status = 'distribuido', liberado_em = now()
        WHERE id = v_lead.id;
      END IF;
    END IF;
  END LOOP;
END; $function$;