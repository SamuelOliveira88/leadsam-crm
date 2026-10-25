-- Corretores extras: cada imobiliária tem 10 ativos incluídos; o master compra extras (R$ 30 no Alexandria, R$ 50 com Mi.IA, por corretor/mês).
-- Os extras valem enquanto o pagamento estiver em dia (31 dias por mensalidade confirmada). Passou da data, volta ao limite base sozinho.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS corretores_extras integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extras_ate timestamptz;

-- Limite que vale agora: base (limite_corretores, padrão 10) + extras enquanto não vencidos.
CREATE OR REPLACE FUNCTION public.limite_efetivo_corretores(p_empresa uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(limite_corretores, 10)
         + CASE WHEN extras_ate > now() THEN corretores_extras ELSE 0 END
  FROM public.empresas WHERE id = p_empresa
$$;
REVOKE ALL ON FUNCTION public.limite_efetivo_corretores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limite_efetivo_corretores(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.travar_limite_corretores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp uuid; v_lim int; v_uso int;
BEGIN
  v_emp := COALESCE(NEW.empresa_id, public.get_minha_empresa_id());
  IF v_emp IS NULL OR NEW.ativo IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.ativo IS TRUE AND OLD.empresa_id IS NOT DISTINCT FROM NEW.empresa_id THEN RETURN NEW; END IF;
  v_lim := COALESCE(public.limite_efetivo_corretores(v_emp), 10);
  SELECT count(*) INTO v_uso FROM public.corretores
    WHERE empresa_id = v_emp AND ativo IS TRUE AND id <> NEW.id;
  IF v_uso >= v_lim THEN
    RAISE EXCEPTION 'Limite de % corretores do plano atingido. Desative um corretor ou contrate corretores extras em Meu plano.', v_lim;
  END IF;
  RETURN NEW;
END $$;

-- Só o super admin (ou o servidor) muda limite e extras.
CREATE OR REPLACE FUNCTION public.proteger_limite_corretores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.limite_corretores IS DISTINCT FROM OLD.limite_corretores
      OR NEW.corretores_extras IS DISTINCT FROM OLD.corretores_extras
      OR NEW.extras_ate IS DISTINCT FROM OLD.extras_ate)
     AND auth.uid() IS NOT NULL AND NOT coalesce(public.sou_super_admin(), false) THEN
    RAISE EXCEPTION 'O limite de corretores só muda pelo pagamento ou pelo suporte.';
  END IF;
  RETURN NEW;
END $$;

-- Chamada pelo webhook do Asaas quando o pagamento dos extras é confirmado. Idempotente pelo id do pagamento.
CREATE OR REPLACE FUNCTION public.ativar_extras_corretores(
  p_empresa uuid, p_extras integer, p_valor numeric, p_asaas_id text, p_evento text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  IF p_extras < 1 OR p_extras > 90 THEN RAISE EXCEPTION 'quantidade inválida'; END IF;
  INSERT INTO public.cobrancas_asaas (asaas_id, empresa_id, plano, valor, evento)
  VALUES (p_asaas_id, p_empresa, 'extra_' || p_extras, p_valor, p_evento)
  ON CONFLICT (asaas_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN false; END IF;
  UPDATE public.empresas
     SET corretores_extras = p_extras,
         extras_ate = greatest(coalesce(extras_ate, now()), now()) + interval '31 days'
   WHERE id = p_empresa;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ativar_extras_corretores(uuid, integer, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_extras_corretores(uuid, integer, numeric, text, text) TO service_role;
