-- Trava de corretores por imobiliária: o plano inclui até 10 corretores ativos.
-- O limite vive em empresas.limite_corretores (vazio = 10). Só o super admin (ou o servidor) muda esse número.
-- Quem já tem mais de 10 não é mexido; só fica impedido de cadastrar/reativar mais um.

CREATE OR REPLACE FUNCTION public.travar_limite_corretores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp uuid; v_lim int; v_uso int;
BEGIN
  v_emp := COALESCE(NEW.empresa_id, public.get_minha_empresa_id());
  IF v_emp IS NULL OR NEW.ativo IS NOT TRUE THEN RETURN NEW; END IF;
  -- Em UPDATE só confere quando está reativando ou trocando de empresa
  IF TG_OP = 'UPDATE' AND OLD.ativo IS TRUE AND OLD.empresa_id IS NOT DISTINCT FROM NEW.empresa_id THEN RETURN NEW; END IF;
  SELECT COALESCE(limite_corretores, 10) INTO v_lim FROM public.empresas WHERE id = v_emp;
  SELECT count(*) INTO v_uso FROM public.corretores
    WHERE empresa_id = v_emp AND ativo IS TRUE AND id <> NEW.id;
  IF v_uso >= COALESCE(v_lim, 10) THEN
    RAISE EXCEPTION 'Limite de % corretores do plano atingido. Desative um corretor ou fale com o suporte para aumentar.', COALESCE(v_lim, 10);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_limite_corretores ON public.corretores;
CREATE TRIGGER trg_limite_corretores BEFORE INSERT OR UPDATE ON public.corretores
  FOR EACH ROW EXECUTE FUNCTION public.travar_limite_corretores();

-- O limite não pode ser mudado pelo master da imobiliária.
CREATE OR REPLACE FUNCTION public.proteger_limite_corretores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.limite_corretores IS DISTINCT FROM OLD.limite_corretores
     AND auth.uid() IS NOT NULL AND NOT coalesce(public.sou_super_admin(), false) THEN
    RAISE EXCEPTION 'O limite de corretores só muda pelo suporte.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_limite_corretores ON public.empresas;
CREATE TRIGGER trg_proteger_limite_corretores BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_limite_corretores();
