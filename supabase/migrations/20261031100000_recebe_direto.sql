-- "Recebe leads direto": quem está marcado entra no rodízio e recebe aviso no WhatsApp.
-- Quem está desmarcado só vê na tela os leads que forem passados para ele (não entra no rodízio, sem aviso).
-- Hoje todos estão marcados (padrão), então nada muda até alguém ser desmarcado.
CREATE OR REPLACE FUNCTION public.escolher_corretor_online(p_grupo_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id
  FROM public.corretores c
  LEFT JOIN (
    SELECT corretor_id, max(created_at) AS ultimo
    FROM public.leads WHERE grupo_id = p_grupo_id GROUP BY corretor_id
  ) l ON l.corretor_id = c.id
  WHERE public.posso_operar_grupo(p_grupo_id)
    AND c.grupo_id = p_grupo_id
    AND c.ativo = true
    AND c.recebe_via_whatsapp = true
    AND c.ultimo_ping IS NOT NULL
    AND c.ultimo_ping > now() - interval '3 minutes'
  ORDER BY l.ultimo NULLS FIRST, c.created_at ASC
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.notificar_corretor_novo_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_corretor record;
BEGIN
  IF NEW.corretor_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    SELECT * INTO v_corretor FROM public.corretores WHERE id = NEW.corretor_id;
    IF v_corretor.canal_notificacao IN ('whatsapp','ambos') AND v_corretor.recebe_via_whatsapp THEN
      INSERT INTO public.fila_notificacoes (corretor_id, lead_id, tipo, status)
      VALUES (NEW.corretor_id, NEW.id, 'whatsapp', 'pendente');
    END IF;
    IF v_corretor.canal_notificacao IN ('email','ambos') THEN
      INSERT INTO public.fila_notificacoes (corretor_id, lead_id, tipo, status)
      VALUES (NEW.corretor_id, NEW.id, 'email', 'pendente');
    END IF;
  END IF;
  RETURN NEW;
END; $$;
