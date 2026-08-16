CREATE OR REPLACE FUNCTION public.proteger_privilegios_perfis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.super_admin IS DISTINCT FROM OLD.super_admin)
     OR (NEW.acesso_total IS DISTINCT FROM OLD.acesso_total) THEN
    IF auth.uid() IS NOT NULL AND NOT public.sou_super_admin() THEN
      RAISE EXCEPTION 'Apenas super admins podem alterar super_admin/acesso_total';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_privilegios_perfis ON public.perfis;
CREATE TRIGGER trg_proteger_privilegios_perfis
BEFORE UPDATE ON public.perfis
FOR EACH ROW
EXECUTE FUNCTION public.proteger_privilegios_perfis();