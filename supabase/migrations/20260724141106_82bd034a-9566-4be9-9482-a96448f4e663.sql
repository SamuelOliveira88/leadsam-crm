
CREATE OR REPLACE FUNCTION public.descartar_lead(_lead_id uuid, _motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meu_corretor uuid;
  v_lead RECORD;
  v_grupo RECORD;
  v_grupos_alvo uuid[];
  v_novo_id uuid;
  v_novo_nome text;
  v_novo_grupo uuid;
  v_agora timestamptz := now();
BEGIN
  v_meu_corretor := public.get_meu_corretor_id();
  IF v_meu_corretor IS NULL THEN
    RAISE EXCEPTION 'Corretor não identificado';
  END IF;

  SELECT id, grupo_id, corretor_id, nome, empresa_id
    INTO v_lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;
  IF v_lead.corretor_id IS DISTINCT FROM v_meu_corretor THEN
    RAISE EXCEPTION 'Você não pode descartar um lead que não é seu';
  END IF;
  IF v_lead.grupo_id IS NULL THEN RAISE EXCEPTION 'Lead sem grupo'; END IF;

  SELECT id, is_principal, empresa_id INTO v_grupo
    FROM public.grupos WHERE id = v_lead.grupo_id;

  IF v_grupo.is_principal THEN
    SELECT array_agg(id) INTO v_grupos_alvo
      FROM public.grupos
      WHERE empresa_id = COALESCE(v_grupo.empresa_id, v_lead.empresa_id)
        AND is_principal = false;
  ELSE
    v_grupos_alvo := ARRAY[v_lead.grupo_id];
  END IF;

  IF v_grupos_alvo IS NOT NULL AND array_length(v_grupos_alvo, 1) > 0 THEN
    SELECT c.id, c.nome, c.grupo_id INTO v_novo_id, v_novo_nome, v_novo_grupo
    FROM public.corretores c
    LEFT JOIN LATERAL (
      SELECT max(created_at) AS ult FROM public.leads WHERE corretor_id = c.id
    ) l ON true
    WHERE c.grupo_id = ANY(v_grupos_alvo)
      AND c.ativo = true
      AND c.id <> v_meu_corretor
    ORDER BY COALESCE(l.ult, 'epoch'::timestamptz) ASC
    LIMIT 1;
  END IF;

  UPDATE public.leads SET
    corretor_id = v_novo_id,
    grupo_id = COALESCE(v_novo_grupo, v_lead.grupo_id),
    status = CASE WHEN v_novo_id IS NOT NULL THEN 'distribuido' ELSE 'represado' END,
    represado_em = CASE WHEN v_novo_id IS NULL THEN v_agora ELSE NULL END,
    visualizado_em = NULL,
    ultima_atividade_em = v_agora
  WHERE id = _lead_id;

  INSERT INTO public.lead_notas (lead_id, texto)
  VALUES (_lead_id,
    'Lead descartado pelo corretor.'
    || CASE WHEN _motivo IS NOT NULL AND btrim(_motivo) <> '' THEN ' Motivo: ' || _motivo ELSE '' END
    || CASE WHEN v_novo_nome IS NOT NULL THEN ' Redistribuído para ' || v_novo_nome || '.' ELSE ' Nenhum corretor elegível — represado.' END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'novo_corretor_id', v_novo_id,
    'novo_corretor_nome', v_novo_nome,
    'represado', v_novo_id IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.descartar_lead(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.descartar_lead(uuid, text) TO authenticated;
