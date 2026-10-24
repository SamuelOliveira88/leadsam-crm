-- Corretores extras: cada imobiliária tem 10 ativos incluídos; o master compra extras (R$ 30 no Alexandria, R$ 50 com Mi.IA, por corretor/mês).
-- O webhook do Asaas chama esta função quando o pagamento dos extras é confirmado. O limite vira 10 + extras (valor absoluto, repetir não soma).
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
  UPDATE public.empresas SET limite_corretores = 10 + p_extras WHERE id = p_empresa;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ativar_extras_corretores(uuid, integer, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_extras_corretores(uuid, integer, numeric, text, text) TO service_role;
