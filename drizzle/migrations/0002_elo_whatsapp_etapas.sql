-- ============================================================================
-- ELO COM A SARA/JARBAS (WhatsApp) — etapas do funil nos dois sentidos
--
--  * elo_aplicar_etapa:   recebe uma etapa vinda do WhatsApp e aplica no lead
--                         da empresa certa (casa pelo telefone: DDD + 8 últimos dígitos).
--  * elo_mudancas_etapa:  lista as mudanças de etapa feitas no CRM (para a
--                         Sara/Jarbas copiar), SEM as que vieram do próprio elo
--                         (evita ir e voltar em loop).
--  * O histórico passa a marcar "Elo WhatsApp" quando a mudança veio do elo.
--
-- Segurança: tudo filtrado por empresa_id; as funções só rodam com a chave de
-- servidor (service_role). Nenhuma chave neste arquivo. Idempotente.
-- ============================================================================

-- 1) Chave de telefone: DDD + 8 últimos dígitos (ignora 55 e o 9º dígito)
CREATE OR REPLACE FUNCTION public.elo_chave(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  WITH d AS (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS x),
       s AS (SELECT CASE WHEN length(x) >= 12 AND left(x, 2) = '55' THEN substr(x, 3) ELSE x END AS y FROM d)
  SELECT CASE WHEN length(y) >= 10 THEN left(y, 2) || right(y, 8) ELSE NULL END FROM s
$$;

CREATE INDEX IF NOT EXISTS leads_elo_chave_idx ON public.leads (empresa_id, public.elo_chave(telefone));

-- 2) Histórico: mudança vinda do elo fica marcada
CREATE OR REPLACE FUNCTION public.registrar_historico_etapa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_nome text;
BEGIN
  IF NEW.etapa_funil IS NOT DISTINCT FROM OLD.etapa_funil THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT nome INTO v_nome FROM public.perfis WHERE id = auth.uid();
  END IF;
  v_nome := coalesce(v_nome, nullif(current_setting('elo.origem', true), ''));
  INSERT INTO public.lead_historico (empresa_id, lead_id, usuario_id, usuario_nome, etapa_anterior, etapa_nova)
  VALUES (NEW.empresa_id, NEW.id, auth.uid(), v_nome, OLD.etapa_funil, NEW.etapa_funil);
  RETURN NEW;
END;
$$;

-- 3) WhatsApp -> CRM: aplica a etapa no lead da empresa informada
CREATE OR REPLACE FUNCTION public.elo_aplicar_etapa(p_empresa_id uuid, p_telefone text, p_etapa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_chave text := public.elo_chave(p_telefone); v_id uuid; v_nova text; v_antes text;
BEGIN
  IF p_empresa_id IS NULL OR v_chave IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  END IF;
  v_nova := public.normalizar_etapa_funil(p_etapa);
  SELECT id, etapa_funil INTO v_id, v_antes
    FROM public.leads
   WHERE empresa_id = p_empresa_id AND public.elo_chave(telefone) = v_chave
   ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'achou', false);
  END IF;
  IF v_antes IS NOT DISTINCT FROM v_nova THEN
    RETURN jsonb_build_object('ok', true, 'achou', true, 'alterou', false);
  END IF;
  PERFORM set_config('elo.origem', 'Elo WhatsApp', true);
  UPDATE public.leads SET etapa_funil = v_nova WHERE id = v_id AND empresa_id = p_empresa_id;
  RETURN jsonb_build_object('ok', true, 'achou', true, 'alterou', true, 'etapa', v_nova);
END;
$$;

-- 4) CRM -> WhatsApp: mudanças feitas por pessoas no CRM, desde um instante
CREATE OR REPLACE FUNCTION public.elo_mudancas_etapa(p_empresa_id uuid, p_desde timestamptz, p_limite int DEFAULT 200)
RETURNS TABLE (telefone text, etapa text, em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT l.telefone, h.etapa_nova, h.created_at
    FROM public.lead_historico h
    JOIN public.leads l ON l.id = h.lead_id AND l.empresa_id = h.empresa_id
   WHERE h.empresa_id = p_empresa_id
     AND h.created_at > p_desde
     AND h.usuario_nome IS DISTINCT FROM 'Elo WhatsApp'
     AND l.telefone IS NOT NULL
   ORDER BY h.created_at
   LIMIT least(greatest(coalesce(p_limite, 200), 1), 500)
$$;

-- 5) Só o servidor executa
REVOKE ALL ON FUNCTION public.elo_aplicar_etapa(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.elo_mudancas_etapa(uuid, timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elo_aplicar_etapa(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.elo_mudancas_etapa(uuid, timestamptz, int) TO service_role;
