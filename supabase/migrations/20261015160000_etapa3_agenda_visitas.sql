-- Etapa 3: agenda de compromissos (visita, ligação, reunião) com lembrete no WhatsApp.

CREATE TABLE IF NOT EXISTS public.compromissos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL,
  empreendimento text,
  data_hora timestamptz NOT NULL,
  tipo text NOT NULL DEFAULT 'visita',
  status text NOT NULL DEFAULT 'agendado',
  observacoes text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Caso a tabela já exista em algum ambiente com o formato antigo, completa as colunas.
ALTER TABLE public.compromissos
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS empreendimento text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'agendado',
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS criado_por uuid,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compromissos_tipo_check') THEN
    ALTER TABLE public.compromissos ADD CONSTRAINT compromissos_tipo_check
      CHECK (tipo IN ('visita', 'ligacao', 'reuniao'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compromissos_status_check') THEN
    ALTER TABLE public.compromissos ADD CONSTRAINT compromissos_status_check
      CHECK (status IN ('agendado', 'realizado', 'cancelado', 'nao_compareceu'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compromissos_empresa_data ON public.compromissos (empresa_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_compromissos_corretor_data ON public.compromissos (corretor_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_compromissos_lead ON public.compromissos (lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compromissos TO authenticated;
GRANT ALL ON public.compromissos TO service_role;
ALTER TABLE public.compromissos ENABLE ROW LEVEL SECURITY;

-- Quem enxerga/mexe: super admin (tudo), master (empresa toda), gerente (corretores do seu grupo),
-- corretor (só os seus). Qualquer um que seja o corretor do compromisso também mexe nele.
CREATE OR REPLACE FUNCTION public.posso_gerir_compromisso(p_empresa uuid, p_corretor uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.sou_super_admin() THEN RETURN true; END IF;
  SELECT p.role, p.grupo_id, p.corretor_id, p.empresa_id INTO v FROM public.perfis p WHERE p.id = auth.uid();
  IF NOT FOUND OR v.empresa_id IS NULL OR v.empresa_id IS DISTINCT FROM p_empresa THEN RETURN false; END IF;
  IF v.corretor_id IS NOT NULL AND v.corretor_id = p_corretor THEN RETURN true; END IF;
  IF v.role = 'master' THEN RETURN true; END IF;
  IF v.role = 'gerente' AND v.grupo_id IS NOT NULL AND p_corretor IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM public.corretores c WHERE c.id = p_corretor AND c.grupo_id = v.grupo_id);
  END IF;
  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.posso_gerir_compromisso(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.posso_gerir_compromisso(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS compromissos_admin_all ON public.compromissos;
DROP POLICY IF EXISTS compromissos_super_admin_all ON public.compromissos;
DROP POLICY IF EXISTS compromissos_consultor_all ON public.compromissos;
DROP POLICY IF EXISTS compromissos_authenticated_all ON public.compromissos;
DROP POLICY IF EXISTS compromissos_select ON public.compromissos;
DROP POLICY IF EXISTS compromissos_insert ON public.compromissos;
DROP POLICY IF EXISTS compromissos_update ON public.compromissos;
DROP POLICY IF EXISTS compromissos_delete ON public.compromissos;

CREATE POLICY compromissos_select ON public.compromissos FOR SELECT TO authenticated
  USING (public.posso_gerir_compromisso(empresa_id, corretor_id));
CREATE POLICY compromissos_insert ON public.compromissos FOR INSERT TO authenticated
  WITH CHECK (public.posso_gerir_compromisso(empresa_id, corretor_id));
CREATE POLICY compromissos_update ON public.compromissos FOR UPDATE TO authenticated
  USING (public.posso_gerir_compromisso(empresa_id, corretor_id))
  WITH CHECK (public.posso_gerir_compromisso(empresa_id, corretor_id));
CREATE POLICY compromissos_delete ON public.compromissos FOR DELETE TO authenticated
  USING (public.posso_gerir_compromisso(empresa_id, corretor_id));

-- Preenche a empresa, impede lead/corretor de outra empresa e reagenda o lembrete.
CREATE OR REPLACE FUNCTION public.compromissos_validar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      SELECT p.empresa_id INTO NEW.empresa_id FROM public.perfis p WHERE p.id = auth.uid();
    END IF;
    IF NEW.empresa_id IS NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT l.empresa_id INTO NEW.empresa_id FROM public.leads l WHERE l.id = NEW.lead_id;
    END IF;
    IF NEW.empresa_id IS NULL AND NEW.corretor_id IS NOT NULL THEN
      SELECT c.empresa_id INTO NEW.empresa_id FROM public.corretores c WHERE c.id = NEW.corretor_id;
    END IF;
    IF NEW.empresa_id IS NULL THEN RAISE EXCEPTION 'Compromisso sem empresa.'; END IF;
    NEW.criado_por := COALESCE(NEW.criado_por, auth.uid());
  ELSE
    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
      RAISE EXCEPTION 'Não é possível mudar o compromisso de empresa.';
    END IF;
    NEW.atualizado_em := now();
  END IF;

  IF NEW.lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND l.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'Lead não encontrado.';
  END IF;
  IF NEW.corretor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.corretores c WHERE c.id = NEW.corretor_id AND c.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'Corretor não encontrado.';
  END IF;

  -- Remarcou (ou trocou o corretor): o lembrete antigo não vale mais; um novo será criado.
  IF TG_OP = 'UPDATE' AND (NEW.data_hora IS DISTINCT FROM OLD.data_hora OR NEW.corretor_id IS DISTINCT FROM OLD.corretor_id) THEN
    DELETE FROM public.fila_notificacoes WHERE compromisso_id = NEW.id AND tipo = 'lembrete_visita';
  END IF;
  RETURN NEW;
END; $$;

-- A coluna compromisso_id da fila precisa existir antes do gatilho rodar.
ALTER TABLE public.fila_notificacoes
  ADD COLUMN IF NOT EXISTS compromisso_id uuid REFERENCES public.compromissos(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fila_lembrete_por_compromisso
  ON public.fila_notificacoes (compromisso_id) WHERE tipo = 'lembrete_visita';

DROP TRIGGER IF EXISTS trg_compromissos_validar ON public.compromissos;
CREATE TRIGGER trg_compromissos_validar BEFORE INSERT OR UPDATE ON public.compromissos
  FOR EACH ROW EXECUTE FUNCTION public.compromissos_validar();

-- Agendar: cria o compromisso e, se for visita, move o lead para "Visita agendada" (tudo ou nada).
-- Roda com as permissões de quem chama (RLS vale): só agenda quem pode ver/mexer no lead e no corretor.
CREATE OR REPLACE FUNCTION public.agendar_compromisso(
  p_lead_id uuid,
  p_tipo text,
  p_data_hora timestamptz,
  p_empreendimento text DEFAULT NULL,
  p_corretor_id uuid DEFAULT NULL,
  p_observacoes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_corretor uuid;
  v_comp public.compromissos;
  v_linhas integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('visita', 'ligacao', 'reuniao') THEN
    RAISE EXCEPTION 'Tipo de compromisso inválido.';
  END IF;
  IF p_data_hora IS NULL OR p_data_hora < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Escolha uma data e hora no futuro.';
  END IF;

  SELECT l.id, l.nome, l.corretor_id, l.etapa_funil INTO v_lead FROM public.leads l WHERE l.id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado ou sem permissão.'; END IF;

  v_corretor := COALESCE(p_corretor_id, v_lead.corretor_id, public.get_meu_corretor_id());
  IF v_corretor IS NULL THEN RAISE EXCEPTION 'Escolha o corretor responsável.'; END IF;

  INSERT INTO public.compromissos (lead_id, corretor_id, empreendimento, data_hora, tipo, observacoes)
  VALUES (p_lead_id, v_corretor, NULLIF(btrim(p_empreendimento), ''), p_data_hora, p_tipo, NULLIF(btrim(p_observacoes), ''))
  RETURNING * INTO v_comp;

  IF p_tipo = 'visita' AND v_lead.etapa_funil IS DISTINCT FROM 'Vendido' THEN
    UPDATE public.leads SET etapa_funil = 'Visita agendada' WHERE id = p_lead_id;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas = 0 THEN RAISE EXCEPTION 'Sem permissão para mover este lead.'; END IF;
  END IF;

  RETURN to_jsonb(v_comp) || jsonb_build_object('lead_nome', v_lead.nome);
END; $$;
REVOKE ALL ON FUNCTION public.agendar_compromisso(uuid, text, timestamptz, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_compromisso(uuid, text, timestamptz, text, uuid, text) TO authenticated;

-- Lembrete: chamada a cada minuto pela rotina da fila. Cria UM aviso por compromisso
-- quando falta 1 hora ou menos (e o horário ainda não passou).
CREATE OR REPLACE FUNCTION public.enfileirar_lembretes_visita()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  WITH novos AS (
    INSERT INTO public.fila_notificacoes (empresa_id, corretor_id, lead_id, tipo, status, compromisso_id)
    SELECT c.empresa_id, c.corretor_id, c.lead_id, 'lembrete_visita', 'pendente', c.id
      FROM public.compromissos c
      JOIN public.corretores r ON r.id = c.corretor_id
     WHERE c.status = 'agendado'
       AND c.data_hora > now()
       AND c.data_hora <= now() + interval '60 minutes'
       AND r.ativo
       AND r.canal_notificacao IN ('whatsapp', 'ambos')
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM novos;
  RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.enfileirar_lembretes_visita() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_lembretes_visita() TO service_role;
