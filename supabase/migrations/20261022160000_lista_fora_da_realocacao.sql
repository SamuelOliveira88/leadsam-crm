-- Leads de lista (fonte 'planilha_samuelimob') ficam fora da realocação automática por tempo.
-- Sem isso, lead que o corretor ainda não abriu (10 min) ou parado (60 min) é passado para outro corretor e fica trocando de mão.
-- Só acrescenta uma condição nas duas funções; o resto é igual ao que já existia.

CREATE OR REPLACE FUNCTION public.reatribuir_leads_sem_visualizacao()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lead record; v_novo uuid;
BEGIN
  FOR v_lead IN
    SELECT l.* FROM public.leads l
    JOIN public.corretores co ON co.id = l.corretor_id
    WHERE l.status = 'distribuido' AND l.visualizado_em IS NULL
      AND l.corretor_id IS NOT NULL
      AND co.isento_realocacao = false
      AND coalesce(l.fonte, '') <> 'planilha_samuelimob'   -- leads de lista não são realocados por tempo
      AND l.created_at < now() - interval '10 minutes'
  LOOP
    SELECT c.id INTO v_novo
    FROM public.corretores c
    LEFT JOIN (
      SELECT corretor_id, max(created_at) AS ultimo FROM public.leads
      WHERE grupo_id = v_lead.grupo_id GROUP BY corretor_id
    ) l ON l.corretor_id = c.id
    WHERE c.grupo_id = v_lead.grupo_id AND c.ativo = true AND c.id <> v_lead.corretor_id
    ORDER BY l.ultimo NULLS FIRST, c.created_at ASC
    LIMIT 1 FOR UPDATE OF c SKIP LOCKED;

    IF v_novo IS NOT NULL THEN
      UPDATE public.leads
      SET corretor_id = v_novo, ultima_atividade_em = now(), created_at = now()
      WHERE id = v_lead.id;
    ELSE
      UPDATE public.leads
      SET corretor_id = NULL, status = 'represado', represado_em = now()
      WHERE id = v_lead.id;
    END IF;
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.reatribuir_leads_parados(p_minutos integer DEFAULT 60)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lead record; v_novo uuid;
BEGIN
  FOR v_lead IN
    SELECT l.* FROM public.leads l
    JOIN public.corretores co ON co.id = l.corretor_id
    WHERE l.status = 'distribuido'
      AND l.corretor_id IS NOT NULL
      AND co.isento_realocacao = false
      AND coalesce(l.fonte, '') <> 'planilha_samuelimob'   -- leads de lista não são realocados por tempo
      AND l.ultima_atividade_em < now() - (p_minutos || ' minutes')::interval
  LOOP
    SELECT c.id INTO v_novo
    FROM public.corretores c
    LEFT JOIN (
      SELECT corretor_id, max(created_at) AS ultimo FROM public.leads
      WHERE grupo_id = v_lead.grupo_id GROUP BY corretor_id
    ) l ON l.corretor_id = c.id
    WHERE c.grupo_id = v_lead.grupo_id AND c.ativo = true AND c.id <> v_lead.corretor_id
    ORDER BY l.ultimo NULLS FIRST, c.created_at ASC
    LIMIT 1 FOR UPDATE OF c SKIP LOCKED;

    IF v_novo IS NOT NULL THEN
      UPDATE public.leads
      SET corretor_id = v_novo,
          visualizado_em = NULL,
          ultima_atividade_em = now(),
          created_at = now()
      WHERE id = v_lead.id;

      INSERT INTO public.fila_notificacoes (corretor_id, lead_id, tipo, status)
      VALUES (v_novo, v_lead.id, 'whatsapp', 'pendente');
    ELSE
      UPDATE public.leads
      SET corretor_id = NULL, status = 'represado', represado_em = now(), visualizado_em = NULL
      WHERE id = v_lead.id;
    END IF;
  END LOOP;
END;
$function$;
