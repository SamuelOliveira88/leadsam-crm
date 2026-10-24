-- Planos comerciais do Alexandria + pagamento pelo Asaas.
-- gratis | pago (R$ 199,90/ano) | pago_ia (R$ 49,90/mês). O teste de 7 dias libera tudo (conta pela data).
-- Quem muda o plano é o webhook do Asaas (service_role) ou o super admin. Master não consegue se promover.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS plano_comercial text NOT NULL DEFAULT 'gratis'
    CHECK (plano_comercial IN ('gratis','pago','pago_ia')),
  ADD COLUMN IF NOT EXISTS plano_ate timestamptz;

CREATE TABLE IF NOT EXISTS public.cobrancas_asaas (
  asaas_id   text PRIMARY KEY,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  plano      text NOT NULL,
  valor      numeric(10,2),
  evento     text,
  pago_em    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cobrancas_asaas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cobrancas_asaas FROM anon, authenticated;
GRANT SELECT ON public.cobrancas_asaas TO authenticated;
GRANT ALL ON public.cobrancas_asaas TO service_role;
DROP POLICY IF EXISTS cobrancas_minha_empresa ON public.cobrancas_asaas;
CREATE POLICY cobrancas_minha_empresa ON public.cobrancas_asaas FOR SELECT TO authenticated
  USING (empresa_id = public.get_minha_empresa_id());

-- Trava: só super admin (ou o servidor, sem usuário logado) muda o plano.
CREATE OR REPLACE FUNCTION public.proteger_plano_comercial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.plano_comercial IS DISTINCT FROM OLD.plano_comercial OR NEW.plano_ate IS DISTINCT FROM OLD.plano_ate)
     AND auth.uid() IS NOT NULL AND NOT coalesce(public.sou_super_admin(), false) THEN
    RAISE EXCEPTION 'O plano só muda pelo pagamento.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_plano_comercial ON public.empresas;
CREATE TRIGGER trg_proteger_plano_comercial BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_plano_comercial();

-- Plano da minha imobiliária (para a tela "Meu plano").
CREATE OR REPLACE FUNCTION public.meu_plano()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp uuid := public.get_minha_empresa_id(); e record; v_efetivo text;
BEGIN
  IF v_emp IS NULL THEN RETURN NULL; END IF;
  SELECT status, teste_ate, plano_comercial, plano_ate INTO e FROM public.empresas WHERE id = v_emp;
  v_efetivo := CASE
    WHEN e.status = 'teste' AND e.teste_ate > now() THEN 'teste'
    WHEN e.plano_ate > now() THEN e.plano_comercial
    ELSE 'gratis' END;
  RETURN jsonb_build_object('empresa_id', v_emp, 'efetivo', v_efetivo, 'plano', e.plano_comercial,
                            'plano_ate', e.plano_ate, 'teste_ate', e.teste_ate);
END $$;
REVOKE ALL ON FUNCTION public.meu_plano() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_plano() TO authenticated, service_role;

-- Chamada só pelo servidor quando o Asaas confirma um pagamento. Idempotente pelo id do pagamento.
CREATE OR REPLACE FUNCTION public.ativar_plano(
  p_empresa uuid, p_plano text, p_valor numeric, p_asaas_id text, p_evento text, p_estender boolean DEFAULT true
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  IF p_plano NOT IN ('pago','pago_ia') THEN RAISE EXCEPTION 'plano inválido'; END IF;
  INSERT INTO public.cobrancas_asaas (asaas_id, empresa_id, plano, valor, evento)
  VALUES (p_asaas_id, p_empresa, p_plano, p_valor, p_evento)
  ON CONFLICT (asaas_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 OR NOT p_estender THEN RETURN false; END IF;
  UPDATE public.empresas
     SET plano_comercial = p_plano,
         plano_ate = greatest(coalesce(plano_ate, now()), now())
                     + CASE p_plano WHEN 'pago' THEN interval '365 days' ELSE interval '31 days' END
   WHERE id = p_empresa;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ativar_plano(uuid, text, numeric, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_plano(uuid, text, numeric, text, text, boolean) TO service_role;
