-- ============ CAMPOS ENRIQUECIDOS DE LEADS ============
-- Suporte a importação robusta de planilhas externas (ex: Leadfy) e exportação completa
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fonte text,
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS etapa_funil text,
  ADD COLUMN IF NOT EXISTS motivo_perda text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS ultima_atividade text,
  ADD COLUMN IF NOT EXISTS data_atividade timestamptz,
  ADD COLUMN IF NOT EXISTS valor_negociacao numeric(14,2),
  ADD COLUMN IF NOT EXISTS codigo_imovel text,
  ADD COLUMN IF NOT EXISTS campanha text,
  ADD COLUMN IF NOT EXISTS corretor_origem_nome text;

CREATE INDEX IF NOT EXISTS idx_leads_etapa_funil ON public.leads(etapa_funil);
CREATE INDEX IF NOT EXISTS idx_leads_fonte ON public.leads(fonte);

-- ============ ATUALIZA FUNÇÕES DE DISTRIBUIÇÃO (retrocompatíveis: novo parâmetro opcional) ============
CREATE OR REPLACE FUNCTION public.distribuir_lead_round_robin(
  p_nome text, p_telefone text, p_email text, p_grupo_id uuid, p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_corretor_id uuid := NULL;
BEGIN
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
  );
  RETURN v_corretor_id;
END; $$;

CREATE OR REPLACE FUNCTION public.distribuir_lead_direcionado(
  p_nome text, p_telefone text, p_email text, p_grupo_id uuid, p_corretores_ids uuid[], p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_corretor_id uuid;
BEGIN
  IF NOT public.dentro_do_horario(p_grupo_id) THEN
    INSERT INTO public.leads (
      nome, telefone, email, grupo_id, status, represado_em,
      fonte, canal, cidade, etapa_funil, motivo_perda, observacoes,
      ultima_atividade, data_atividade, valor_negociacao, codigo_imovel, campanha, corretor_origem_nome
    )
    VALUES (
      p_nome, p_telefone, p_email, p_grupo_id, 'represado', now(),
      p_extra->>'fonte', p_extra->>'canal', p_extra->>'cidade', p_extra->>'etapa_funil',
      p_extra->>'motivo_perda', p_extra->>'observacoes', p_extra->>'ultima_atividade',
      NULLIF(p_extra->>'data_atividade','')::timestamptz,
      NULLIF(p_extra->>'valor_negociacao','')::numeric,
      p_extra->>'codigo_imovel', p_extra->>'campanha', p_extra->>'corretor_origem_nome'
    );
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_corretor_id
  FROM public.corretores c
  LEFT JOIN (
    SELECT corretor_id, max(created_at) AS ultimo_lead
    FROM public.leads WHERE grupo_id = p_grupo_id GROUP BY corretor_id
  ) l ON l.corretor_id = c.id
  WHERE c.id = ANY(p_corretores_ids) AND c.ativo = true AND c.grupo_id = p_grupo_id
  ORDER BY l.ultimo_lead NULLS FIRST, c.created_at ASC
  LIMIT 1 FOR UPDATE OF c SKIP LOCKED;

  IF v_corretor_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum corretor ativo encontrado na lista selecionada.';
  END IF;

  INSERT INTO public.leads (
    nome, telefone, email, grupo_id, corretor_id, status,
    fonte, canal, cidade, etapa_funil, motivo_perda, observacoes,
    ultima_atividade, data_atividade, valor_negociacao, codigo_imovel, campanha, corretor_origem_nome
  )
  VALUES (
    p_nome, p_telefone, p_email, p_grupo_id, v_corretor_id, 'distribuido',
    p_extra->>'fonte', p_extra->>'canal', p_extra->>'cidade', p_extra->>'etapa_funil',
    p_extra->>'motivo_perda', p_extra->>'observacoes', p_extra->>'ultima_atividade',
    NULLIF(p_extra->>'data_atividade','')::timestamptz,
    NULLIF(p_extra->>'valor_negociacao','')::numeric,
    p_extra->>'codigo_imovel', p_extra->>'campanha', p_extra->>'corretor_origem_nome'
  );
  RETURN v_corretor_id;
END; $$;
