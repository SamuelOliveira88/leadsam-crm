-- ============================================================================
-- ETAPA 2 — Funil do lead
--
--  * etapa_funil passa a aceitar só: Novo, Em atendimento, Visita agendada,
--    Proposta, Vendido, Perdido.
--  * Registros atuais migrados: "Já contatado" -> Em atendimento, vazio -> Novo.
--    Qualquer outro texto livre é mapeado por palavra-chave (ver função abaixo);
--    o texto ORIGINAL fica guardado em lead_historico (etapa_anterior).
--  * lead_historico registra cada mudança de etapa (quando, quem, de, para).
--
-- Escrita idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1) Normalização de etapa -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalizar_etapa_funil(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN s = '' OR s ~ '^novo' OR s IN ('new', 'lead novo') THEN 'Novo'
    WHEN s ~ 'perd|descart|desisti|sem interesse|invalid' THEN 'Perdido'
    WHEN s ~ 'vend|fechad|ganh' THEN 'Vendido'
    WHEN s ~ 'propost' THEN 'Proposta'
    WHEN s ~ 'visit' THEN 'Visita agendada'
    ELSE 'Em atendimento'
  END
  FROM (
    SELECT lower(translate(btrim(coalesce(p, '')),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) AS s
  ) x
$$;

-- 2) Histórico de mudanças de etapa ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  usuario_id uuid,
  usuario_nome text,
  etapa_anterior text,
  etapa_nova text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_historico_lead_idx ON public.lead_historico (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_historico_empresa_idx ON public.lead_historico (empresa_id, created_at DESC);
ALTER TABLE public.lead_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_historico_select ON public.lead_historico;
-- Quem enxerga o lead (RLS de leads) enxerga o histórico dele, sempre dentro da própria empresa.
CREATE POLICY lead_historico_select ON public.lead_historico FOR SELECT TO authenticated
USING (
  public.sou_super_admin()
  OR (
    empresa_id = public.get_minha_empresa_id()
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_historico.lead_id)
  )
);

-- Só os gatilhos (e o servidor) gravam histórico; o navegador apenas lê.
REVOKE ALL ON public.lead_historico FROM authenticated, anon;
GRANT SELECT ON public.lead_historico TO authenticated;
GRANT ALL ON public.lead_historico TO service_role;

-- 3) Migração dos dados atuais ---------------------------------------------------
-- 3.1 Guarda o texto original de quem vai mudar (auditável). Só roda se ainda houver o que migrar.
INSERT INTO public.lead_historico (empresa_id, lead_id, usuario_id, usuario_nome, etapa_anterior, etapa_nova)
SELECT l.empresa_id, l.id, NULL, 'Migração do funil', l.etapa_funil, public.normalizar_etapa_funil(l.etapa_funil)
  FROM public.leads l
 WHERE l.etapa_funil IS NOT NULL
   AND btrim(l.etapa_funil) <> ''
   AND l.etapa_funil IS DISTINCT FROM public.normalizar_etapa_funil(l.etapa_funil);

-- 3.2 Aplica os valores novos (vazio vira Novo).
UPDATE public.leads
   SET etapa_funil = public.normalizar_etapa_funil(etapa_funil)
 WHERE etapa_funil IS DISTINCT FROM public.normalizar_etapa_funil(etapa_funil);

-- 4) Gatilhos --------------------------------------------------------------------
-- 4.1 Toda escrita passa pela normalização: nulo/vazio -> Novo; texto livre -> etapa válida.
--     (Importações, webhook e RPCs gravam texto livre em etapa_funil.)
CREATE OR REPLACE FUNCTION public.normalizar_etapa_lead()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  NEW.etapa_funil := public.normalizar_etapa_funil(NEW.etapa_funil);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalizar_etapa_lead ON public.leads;
CREATE TRIGGER trg_normalizar_etapa_lead
BEFORE INSERT OR UPDATE OF etapa_funil ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.normalizar_etapa_lead();

-- 4.2 Registra cada mudança de etapa (data, usuário, etapa anterior e nova).
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
  INSERT INTO public.lead_historico (empresa_id, lead_id, usuario_id, usuario_nome, etapa_anterior, etapa_nova)
  VALUES (NEW.empresa_id, NEW.id, auth.uid(), v_nome, OLD.etapa_funil, NEW.etapa_funil);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrar_historico_etapa ON public.leads;
CREATE TRIGGER trg_registrar_historico_etapa
AFTER UPDATE OF etapa_funil ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.registrar_historico_etapa();

-- 5) Valores fixos ---------------------------------------------------------------
ALTER TABLE public.leads ALTER COLUMN etapa_funil SET DEFAULT 'Novo';
ALTER TABLE public.leads ALTER COLUMN etapa_funil SET NOT NULL;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_etapa_funil_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_etapa_funil_check
  CHECK (etapa_funil IN ('Novo', 'Em atendimento', 'Visita agendada', 'Proposta', 'Vendido', 'Perdido'));
