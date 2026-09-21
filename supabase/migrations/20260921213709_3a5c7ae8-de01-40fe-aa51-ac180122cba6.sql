CREATE OR REPLACE FUNCTION public.proteger_privilegios_perfis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.super_admin IS DISTINCT FROM OLD.super_admin)
     OR (NEW.acesso_total IS DISTINCT FROM OLD.acesso_total)
     OR (NEW.role IS DISTINCT FROM OLD.role AND NEW.role IN ('master','suporte'))
     OR (OLD.role IN ('master','suporte') AND NEW.role IS DISTINCT FROM OLD.role)
     OR (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id) THEN
    IF auth.uid() IS NOT NULL AND NOT public.sou_super_admin() THEN
      RAISE EXCEPTION 'Apenas super admins podem alterar privilegios, papel elevado ou empresa de um perfil';
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