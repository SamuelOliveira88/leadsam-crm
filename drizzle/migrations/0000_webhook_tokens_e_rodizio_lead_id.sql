CREATE TABLE public.webhook_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_tokens TO authenticated;
GRANT ALL ON public.webhook_tokens TO service_role;
ALTER TABLE public.webhook_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_tokens_select_empresa ON public.webhook_tokens
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.get_minha_empresa_id()) OR (SELECT public.sou_super_admin()));

CREATE OR REPLACE FUNCTION public.distribuir_lead_rr(p_nome text, p_telefone text, p_email text, p_grupo_id uuid, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_corretor_id uuid := NULL; v_lead_id uuid;
BEGIN
  IF NOT public.posso_operar_grupo(p_grupo_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para enviar leads a este grupo.';
  END IF;
  IF public.dentro_do_horario(p_grupo_id) THEN
    SELECT c.id INTO v_corretor_id
    FROM public.corretores c
    LEFT JOIN (
      SELECT corretor_id, max(created_at) AS ultimo_lead
      FROM public.leads WHERE grupo_id = p_grupo_id GROUP BY corretor_id
    ) l ON l.corretor_id = c.id
    WHERE c.grupo_id = p_grupo_id AND c.ativo = true
    ORDER BY l.ultimo_lead NULLS FIRST, c.created_at ASC
    LIMIT 1 FOR UPDATE OF c SKIP LOCKED;
  END IF;
  INSERT INTO public.leads (
    nome, telefone, email, grupo_id, corretor_id, status, represado_em,
    fonte, canal, cidade, etapa_funil, motivo_perda, observacoes,
    ultima_atividade, data_atividade, valor_negociacao, codigo_imovel, campanha, corretor_origem_nome
  )
  VALUES (
    p_nome, p_telefone, p_email, p_grupo_id, v_corretor_id,
    CASE WHEN v_corretor_id IS NULL THEN 'represado' ELSE 'distribuido' END,
    CASE WHEN v_corretor_id IS NULL THEN now() ELSE NULL END,
    p_extra->>'fonte', p_extra->>'canal', p_extra->>'cidade', p_extra->>'etapa_funil',
    p_extra->>'motivo_perda', p_extra->>'observacoes', p_extra->>'ultima_atividade',
    NULLIF(p_extra->>'data_atividade','')::timestamptz,
    NULLIF(p_extra->>'valor_negociacao','')::numeric,
    p_extra->>'codigo_imovel', p_extra->>'campanha', p_extra->>'corretor_origem_nome'
  ) RETURNING id INTO v_lead_id;
  RETURN jsonb_build_object('lead_id', v_lead_id, 'corretor_id', v_corretor_id);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.distribuir_lead_rr(text,text,text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_rr(text,text,text,uuid,jsonb) TO authenticated, service_role;