CREATE OR REPLACE FUNCTION public.on_nota_criada()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.leads SET ultima_atividade_em = now(),
    etapa_funil = COALESCE(NULLIF(etapa_funil,''), 'Já contatado')
  WHERE id = NEW.lead_id;
  RETURN NEW;
END; $function$;