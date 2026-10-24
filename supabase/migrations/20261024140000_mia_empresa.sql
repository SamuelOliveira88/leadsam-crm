-- Mi.IA dentro do Alexandria: segundo plano (alexandria_ia) e as 8 respostas que a imobiliária ensina à Mi.IA.

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_plano_comercial_check;
ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_plano_comercial_check CHECK (plano_comercial IN ('gratis','alexandria','alexandria_ia'));

-- Plano da minha imobiliária: agora diz também se a Mi.IA está liberada (teste libera tudo).
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
                            'plano_ate', e.plano_ate, 'teste_ate', e.teste_ate,
                            'mia', v_efetivo IN ('teste','alexandria_ia'));
END $$;
REVOKE ALL ON FUNCTION public.meu_plano() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_plano() TO authenticated, service_role;

-- Para uso do servidor: a Mi.IA dessa imobiliária está liberada pelo plano?
CREATE OR REPLACE FUNCTION public.empresa_tem_mia(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresas e
     WHERE e.id = p_empresa AND e.ativo IS NOT FALSE AND e.status <> 'suspensa'
       AND ((e.status = 'teste' AND e.teste_ate > now())
            OR (e.plano_comercial = 'alexandria_ia' AND e.plano_ate > now()))
  );
$$;
REVOKE ALL ON FUNCTION public.empresa_tem_mia(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.empresa_tem_mia(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ativar_plano(
  p_empresa uuid, p_plano text, p_valor numeric, p_asaas_id text, p_evento text, p_estender boolean DEFAULT true
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  IF p_plano NOT IN ('alexandria','alexandria_ia') THEN RAISE EXCEPTION 'plano inválido'; END IF;
  INSERT INTO public.cobrancas_asaas (asaas_id, empresa_id, plano, valor, evento)
  VALUES (p_asaas_id, p_empresa, p_plano, p_valor, p_evento)
  ON CONFLICT (asaas_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 OR NOT p_estender THEN RETURN false; END IF;
  UPDATE public.empresas
     SET plano_comercial = p_plano,
         plano_ate = greatest(coalesce(plano_ate, now()), now()) + interval '31 days'
   WHERE id = p_empresa;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ativar_plano(uuid, text, numeric, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_plano(uuid, text, numeric, text, text, boolean) TO service_role;

-- As 8 respostas da "Minha Mi.IA" (uma linha por imobiliária).
CREATE TABLE IF NOT EXISTS public.mia_config (
  empresa_id     uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  respostas      jsonb NOT NULL DEFAULT '{}'::jsonb,
  site_referencia text,
  ativa          boolean NOT NULL DEFAULT false,
  horario        jsonb NOT NULL DEFAULT '{"sempre":true,"dias":[0,1,2,3,4,5,6],"inicio":"08:00","fim":"20:00"}'::jsonb, -- quando a Mi.IA atende (horário de Brasília)
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mia_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mia_config FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mia_config TO authenticated;
GRANT ALL ON public.mia_config TO service_role;

DROP POLICY IF EXISTS mia_config_ler ON public.mia_config;
CREATE POLICY mia_config_ler ON public.mia_config FOR SELECT TO authenticated
  USING (empresa_id = public.get_minha_empresa_id());
DROP POLICY IF EXISTS mia_config_inserir ON public.mia_config;
CREATE POLICY mia_config_inserir ON public.mia_config FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_minha_empresa_id()
    AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente')));
DROP POLICY IF EXISTS mia_config_alterar ON public.mia_config;
CREATE POLICY mia_config_alterar ON public.mia_config FOR UPDATE TO authenticated
  USING (empresa_id = public.get_minha_empresa_id()
    AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente')))
  WITH CHECK (empresa_id = public.get_minha_empresa_id());

-- Ligar a Mi.IA só vale com o plano certo (a trava fica no banco, não só na tela).
CREATE OR REPLACE FUNCTION public.mia_config_trava()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em := now();
  IF NEW.ativa AND auth.uid() IS NOT NULL AND NOT public.empresa_tem_mia(NEW.empresa_id) THEN
    RAISE EXCEPTION 'A Mi.IA precisa do plano Alexandria + Mi.IA.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mia_config_trava ON public.mia_config;
CREATE TRIGGER trg_mia_config_trava BEFORE INSERT OR UPDATE ON public.mia_config
  FOR EACH ROW EXECUTE FUNCTION public.mia_config_trava();
