-- Contador simples da página de vendas: visitas e cliques (sem dados pessoais).
CREATE TABLE IF NOT EXISTS public.vendas_eventos (
  id bigserial PRIMARY KEY,
  tipo text NOT NULL,
  ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendas_eventos ENABLE ROW LEVEL SECURITY;
-- Sem política: ninguém lê/grava direto. Só pelas funções abaixo.

CREATE OR REPLACE FUNCTION public.registrar_evento_vendas(p_tipo text, p_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tipo NOT IN ('visita','clique_whatsapp','clique_entrar','chat_mia') THEN RETURN; END IF;
  INSERT INTO public.vendas_eventos (tipo, ref) VALUES (p_tipo, left(p_ref, 80));
END $$;
GRANT EXECUTE ON FUNCTION public.registrar_evento_vendas(text, text) TO anon, authenticated;

-- Resumo por dia (só super admin).
CREATE OR REPLACE FUNCTION public.resumo_vendas(p_dias int DEFAULT 30)
RETURNS TABLE (dia date, tipo text, total bigint) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date, tipo, count(*)
  FROM public.vendas_eventos
  WHERE public.sou_super_admin() AND created_at >= now() - make_interval(days => p_dias)
  GROUP BY 1, 2 ORDER BY 1 DESC, 2
$$;
GRANT EXECUTE ON FUNCTION public.resumo_vendas(int) TO authenticated;
