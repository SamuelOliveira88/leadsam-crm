CREATE OR REPLACE FUNCTION public.limitar_notificacoes_por_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'whatsapp' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.fila_notificacoes
  WHERE lead_id = NEW.lead_id
    AND tipo = 'whatsapp'
    AND status IN ('enviado', 'pendente');

  IF v_total >= 2 THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limitar_notificacoes_por_lead ON public.fila_notificacoes;
CREATE TRIGGER trg_limitar_notificacoes_por_lead
BEFORE INSERT ON public.fila_notificacoes
FOR EACH ROW EXECUTE FUNCTION public.limitar_notificacoes_por_lead();