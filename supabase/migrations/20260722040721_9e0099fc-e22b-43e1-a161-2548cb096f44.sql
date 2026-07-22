-- ============ GESTÃO DE PROPOSTAS ============
CREATE TABLE public.propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL,
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL,
  valor_proposto numeric(14,2) NOT NULL,
  valor_entrada numeric(14,2),
  parcelas int,
  condicoes text,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'enviada', 'em_analise', 'aprovada', 'recusada', 'cancelada')),
  motivo_recusa text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_propostas_lead ON public.propostas(lead_id);
CREATE INDEX idx_propostas_status ON public.propostas(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propostas TO authenticated;
GRANT ALL ON public.propostas TO service_role;
ALTER TABLE public.propostas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tocar_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_propostas_atualizado_em
  BEFORE UPDATE ON public.propostas
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- ============ FASE 2 + 3 — ISOLAMENTO POR EMPRESA + SUPER-ADMIN ============
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS super_admin boolean NOT NULL DEFAULT false;

UPDATE public.perfis SET super_admin = true
WHERE id IN (SELECT id FROM auth.users WHERE lower(email) IN (
  'samuelrodrigodeoliveira@gmail.com', 'toni.boacasa@gmi.com', 'toni.boacasa@gmail.com'
));

CREATE OR REPLACE FUNCTION public.sou_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT super_admin FROM public.perfis WHERE id = auth.uid()), false) $$;

CREATE OR REPLACE FUNCTION public.get_minha_empresa_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT empresa_id FROM public.perfis WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.preencher_empresa_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_empresa uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT empresa_id INTO v_empresa FROM public.perfis WHERE id = auth.uid();
    IF v_empresa IS NOT NULL THEN
      NEW.empresa_id := v_empresa;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.empresa_id IS NOT NULL THEN RETURN NEW; END IF;

  CASE TG_TABLE_NAME
    WHEN 'leads' THEN SELECT empresa_id INTO v_empresa FROM public.grupos WHERE id = NEW.grupo_id;
    WHEN 'corretores' THEN SELECT empresa_id INTO v_empresa FROM public.grupos WHERE id = NEW.grupo_id;
    WHEN 'horarios_atendimento' THEN SELECT empresa_id INTO v_empresa FROM public.grupos WHERE id = NEW.grupo_id;
    WHEN 'campanhas_anuncios' THEN SELECT empresa_id INTO v_empresa FROM public.grupos WHERE id = NEW.grupo_id;
    WHEN 'unidades' THEN SELECT empresa_id INTO v_empresa FROM public.empreendimentos WHERE id = NEW.empreendimento_id;
    WHEN 'propostas' THEN SELECT empresa_id INTO v_empresa FROM public.leads WHERE id = NEW.lead_id;
    WHEN 'fila_notificacoes' THEN SELECT empresa_id INTO v_empresa FROM public.corretores WHERE id = NEW.corretor_id;
    WHEN 'lead_notas' THEN SELECT empresa_id INTO v_empresa FROM public.leads WHERE id = NEW.lead_id;
    ELSE NULL;
  END CASE;

  NEW.empresa_id := v_empresa;
  RETURN NEW;
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','corretores','horarios_atendimento','campanhas_anuncios','unidades','propostas','fila_notificacoes','lead_notas','grupos','empreendimentos']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_empresa_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_empresa_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.preencher_empresa_id()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_grupo_id uuid;
  v_corretor_id uuid;
  v_empresa_id uuid;
  v_super_admin boolean := false;
  v_email text;
BEGIN
  v_email := lower(COALESCE(NEW.email, ''));
  v_empresa_id := NULLIF(NEW.raw_user_meta_data->>'empresa_id', '')::uuid;
  v_grupo_id := NULLIF(NEW.raw_user_meta_data->>'grupo_id', '')::uuid;
  v_corretor_id := NULLIF(NEW.raw_user_meta_data->>'corretor_id', '')::uuid;
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'gerente');

  IF v_email IN ('samuelrodrigodeoliveira@gmail.com', 'equipelavile@hotmail.com', 'toni.boacasa@gmi.com', 'toni.boacasa@gmail.com') THEN
    v_role := 'master';
    v_super_admin := v_email IN ('samuelrodrigodeoliveira@gmail.com', 'toni.boacasa@gmi.com', 'toni.boacasa@gmail.com');
    v_grupo_id := NULL;
    v_corretor_id := NULL;
    IF v_empresa_id IS NULL THEN
      SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = 'equipe-lavile';
    END IF;
  ELSE
    IF v_role NOT IN ('gerente', 'corretor', 'master') THEN
      v_role := 'gerente';
    END IF;
    IF v_role = 'master' THEN
      IF v_empresa_id IS NULL OR EXISTS (SELECT 1 FROM public.perfis WHERE empresa_id = v_empresa_id) THEN
        v_role := 'gerente';
      END IF;
    END IF;
    IF v_empresa_id IS NULL THEN
      SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = 'equipe-lavile';
    END IF;
  END IF;

  INSERT INTO public.perfis (id, nome, role, grupo_id, corretor_id, empresa_id, super_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    v_role, v_grupo_id, v_corretor_id, v_empresa_id, v_super_admin
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    grupo_id = COALESCE(public.perfis.grupo_id, EXCLUDED.grupo_id),
    corretor_id = COALESCE(public.perfis.corretor_id, EXCLUDED.corretor_id),
    empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id),
    super_admin = public.perfis.super_admin OR EXCLUDED.super_admin;

  RETURN NEW;
END; $$;

-- ============ POLÍTICAS COM ISOLAMENTO POR EMPRESA ============

DROP POLICY IF EXISTS "perfis_self_read" ON public.perfis;
DROP POLICY IF EXISTS "perfis_master_all" ON public.perfis;
DROP POLICY IF EXISTS "perfis_empresa_admin" ON public.perfis;
CREATE POLICY "perfis_self_read" ON public.perfis FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "perfis_empresa_admin" ON public.perfis FOR ALL TO authenticated
  USING (public.sou_super_admin() OR ((SELECT role FROM public.get_my_profile()) = 'master' AND empresa_id = public.get_minha_empresa_id()))
  WITH CHECK (public.sou_super_admin() OR ((SELECT role FROM public.get_my_profile()) = 'master' AND empresa_id = public.get_minha_empresa_id()));

DROP POLICY IF EXISTS "grupos_read_escopo" ON public.grupos;
DROP POLICY IF EXISTS "grupos_write_master" ON public.grupos;
CREATE POLICY "grupos_read_escopo" ON public.grupos FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = id)));
CREATE POLICY "grupos_write_master" ON public.grupos FOR ALL TO authenticated
  USING (public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master'))
  WITH CHECK (public.sou_super_admin() OR (SELECT role FROM public.get_my_profile()) = 'master');

DROP POLICY IF EXISTS "corretores_read_escopo" ON public.corretores;
DROP POLICY IF EXISTS "corretores_write_escopo" ON public.corretores;
CREATE POLICY "corretores_read_escopo" ON public.corretores FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));
CREATE POLICY "corretores_write_escopo" ON public.corretores FOR ALL TO authenticated
  USING (public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))))
  WITH CHECK (public.sou_super_admin() OR (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));

DROP POLICY IF EXISTS "leads: corretor atualiza próprios" ON public.leads;
DROP POLICY IF EXISTS "leads: corretor vê próprios" ON public.leads;
DROP POLICY IF EXISTS "leads_authenticated_all" ON public.leads;
DROP POLICY IF EXISTS "leads_read_escopo" ON public.leads;
DROP POLICY IF EXISTS "leads_update_corretor" ON public.leads;
DROP POLICY IF EXISTS "leads_write_escopo" ON public.leads;
DROP POLICY IF EXISTS "leads_write_master_gerente" ON public.leads;
CREATE POLICY "leads_read_escopo" ON public.leads FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id) OR
    ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id()))));
CREATE POLICY "leads_write_master_gerente" ON public.leads FOR ALL TO authenticated
  USING (public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))))
  WITH CHECK (public.sou_super_admin() OR (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));
CREATE POLICY "leads_update_corretor" ON public.leads FOR UPDATE TO authenticated
  USING (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id())
  WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id());

DROP POLICY IF EXISTS "empreendimentos_read_todos" ON public.empreendimentos;
DROP POLICY IF EXISTS "empreendimentos_write_master_gerente" ON public.empreendimentos;
DROP POLICY IF EXISTS "empreendimentos_read_escopo" ON public.empreendimentos;
CREATE POLICY "empreendimentos_read_escopo" ON public.empreendimentos FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR empresa_id = public.get_minha_empresa_id());
CREATE POLICY "empreendimentos_write_master_gerente" ON public.empreendimentos FOR ALL TO authenticated
  USING (public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente')))
  WITH CHECK (public.sou_super_admin() OR (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente'));

DROP POLICY IF EXISTS "unidades_read_todos" ON public.unidades;
DROP POLICY IF EXISTS "unidades_write_master_gerente" ON public.unidades;
DROP POLICY IF EXISTS "unidades_read_escopo" ON public.unidades;
CREATE POLICY "unidades_read_escopo" ON public.unidades FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR empresa_id = public.get_minha_empresa_id());
CREATE POLICY "unidades_write_master_gerente" ON public.unidades FOR ALL TO authenticated
  USING (public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente')))
  WITH CHECK (public.sou_super_admin() OR (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente'));

DROP POLICY IF EXISTS "horarios_read_escopo" ON public.horarios_atendimento;
DROP POLICY IF EXISTS "horarios_write_escopo" ON public.horarios_atendimento;
CREATE POLICY "horarios_read_escopo" ON public.horarios_atendimento FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR empresa_id = public.get_minha_empresa_id());
CREATE POLICY "horarios_write_escopo" ON public.horarios_atendimento FOR ALL TO authenticated
  USING (public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))))
  WITH CHECK (public.sou_super_admin() OR (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));

DROP POLICY IF EXISTS "fila_read_escopo" ON public.fila_notificacoes;
CREATE POLICY "fila_read_escopo" ON public.fila_notificacoes FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.corretores c WHERE c.id = fila_notificacoes.corretor_id
      AND c.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))) OR
    ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id()))));

DROP POLICY IF EXISTS "campanhas_read_escopo" ON public.campanhas_anuncios;
DROP POLICY IF EXISTS "campanhas_write_master" ON public.campanhas_anuncios;
CREATE POLICY "campanhas_read_escopo" ON public.campanhas_anuncios FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));
CREATE POLICY "campanhas_write_master" ON public.campanhas_anuncios FOR ALL TO authenticated
  USING (public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master'))
  WITH CHECK (public.sou_super_admin() OR (SELECT role FROM public.get_my_profile()) = 'master');

DROP POLICY IF EXISTS "notas: corretor vê próprias" ON public.lead_notas;
DROP POLICY IF EXISTS "notas: gerente vê do seu grupo" ON public.lead_notas;
DROP POLICY IF EXISTS "notas: inserir se pode ver lead" ON public.lead_notas;
DROP POLICY IF EXISTS "notas: master vê tudo" ON public.lead_notas;
DROP POLICY IF EXISTS "notas_leitura" ON public.lead_notas;
DROP POLICY IF EXISTS "notas_insercao" ON public.lead_notas;
CREATE POLICY "notas_leitura" ON public.lead_notas FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_notas.lead_id AND (
      (SELECT role FROM public.get_my_profile()) = 'master' OR
      ((SELECT role FROM public.get_my_profile()) = 'gerente' AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile())) OR
      ((SELECT role FROM public.get_my_profile()) = 'corretor' AND l.corretor_id = public.get_meu_corretor_id())))));
CREATE POLICY "notas_insercao" ON public.lead_notas FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_notas.lead_id AND (
      (SELECT role FROM public.get_my_profile()) = 'master' OR
      ((SELECT role FROM public.get_my_profile()) = 'gerente' AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile())) OR
      ((SELECT role FROM public.get_my_profile()) = 'corretor' AND l.corretor_id = public.get_meu_corretor_id()))));

-- config_acesso passa a ter 1 linha por empresa
ALTER TABLE public.config_acesso DROP CONSTRAINT IF EXISTS config_acesso_single;
ALTER TABLE public.config_acesso DROP CONSTRAINT IF EXISTS config_acesso_pkey;
UPDATE public.config_acesso SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'equipe-lavile') WHERE empresa_id IS NULL;
ALTER TABLE public.config_acesso ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE public.config_acesso ADD PRIMARY KEY (empresa_id);
ALTER TABLE public.config_acesso DROP COLUMN IF EXISTS id;

DROP POLICY IF EXISTS "auth pode ler config" ON public.config_acesso;
DROP POLICY IF EXISTS "master/gerente edita config" ON public.config_acesso;
DROP POLICY IF EXISTS "config_leitura" ON public.config_acesso;
DROP POLICY IF EXISTS "config_escrita" ON public.config_acesso;
CREATE POLICY "config_leitura" ON public.config_acesso FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR empresa_id = public.get_minha_empresa_id());
CREATE POLICY "config_escrita" ON public.config_acesso FOR ALL TO authenticated
  USING (public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND
    EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master', 'gerente'))))
  WITH CHECK (public.sou_super_admin() OR
    EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master', 'gerente')));

DROP POLICY IF EXISTS "empresas_super_admin_all" ON public.empresas;
CREATE POLICY "empresas_super_admin_all" ON public.empresas FOR ALL TO authenticated
  USING (public.sou_super_admin()) WITH CHECK (public.sou_super_admin());

DROP POLICY IF EXISTS "propostas_read_escopo" ON public.propostas;
DROP POLICY IF EXISTS "propostas_write_master_gerente" ON public.propostas;
DROP POLICY IF EXISTS "propostas_insert_corretor" ON public.propostas;
DROP POLICY IF EXISTS "propostas_update_corretor" ON public.propostas;
CREATE POLICY "propostas_read_escopo" ON public.propostas FOR SELECT TO authenticated USING (
  public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = propostas.lead_id
      AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))) OR
    ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id()))));
CREATE POLICY "propostas_write_master_gerente" ON public.propostas FOR ALL TO authenticated
  USING (public.sou_super_admin() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = propostas.lead_id
      AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))))))
  WITH CHECK (public.sou_super_admin() OR (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = propostas.lead_id
      AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile())))));
CREATE POLICY "propostas_insert_corretor" ON public.propostas FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id());
CREATE POLICY "propostas_update_corretor" ON public.propostas FOR UPDATE TO authenticated
  USING (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'corretor'
    AND corretor_id = public.get_meu_corretor_id() AND status IN ('rascunho', 'enviada', 'em_analise'))
  WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id()
    AND status IN ('rascunho', 'enviada', 'em_analise'));

-- reservar/liberar unidade: reforço de isolamento por empresa
CREATE OR REPLACE FUNCTION public.reservar_unidade(
  p_unidade_id uuid, p_lead_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_corretor_id uuid;
  v_status_atual text;
  v_empresa_unidade uuid;
BEGIN
  SELECT role, corretor_id INTO v_role, v_corretor_id FROM public.perfis WHERE id = auth.uid();
  IF v_role = 'corretor' AND v_corretor_id IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a um corretor.';
  END IF;
  SELECT status, empresa_id INTO v_status_atual, v_empresa_unidade FROM public.unidades WHERE id = p_unidade_id FOR UPDATE;
  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Unidade não encontrada.';
  END IF;
  IF NOT public.sou_super_admin() AND v_empresa_unidade IS DISTINCT FROM public.get_minha_empresa_id() THEN
    RAISE EXCEPTION 'Unidade não pertence à sua empresa.';
  END IF;
  IF v_status_atual <> 'disponivel' THEN
    RAISE EXCEPTION 'Esta unidade não está mais disponível.';
  END IF;
  UPDATE public.unidades SET
    status = 'reservada',
    corretor_id = CASE WHEN v_role = 'corretor' THEN v_corretor_id ELSE COALESCE(v_corretor_id, corretor_id) END,
    lead_id = p_lead_id,
    cliente_nome = p_cliente_nome,
    reservado_em = now()
  WHERE id = p_unidade_id;
END; $$;

CREATE OR REPLACE FUNCTION public.liberar_unidade(p_unidade_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_corretor_id uuid;
  v_dono uuid;
  v_empresa_unidade uuid;
BEGIN
  SELECT role, corretor_id INTO v_role, v_corretor_id FROM public.perfis WHERE id = auth.uid();
  SELECT corretor_id, empresa_id INTO v_dono, v_empresa_unidade FROM public.unidades WHERE id = p_unidade_id FOR UPDATE;
  IF NOT public.sou_super_admin() AND v_empresa_unidade IS DISTINCT FROM public.get_minha_empresa_id() THEN
    RAISE EXCEPTION 'Unidade não pertence à sua empresa.';
  END IF;
  IF v_role = 'corretor' AND (v_dono IS DISTINCT FROM v_corretor_id) THEN
    RAISE EXCEPTION 'Você só pode liberar reservas feitas por você.';
  END IF;
  UPDATE public.unidades SET
    status = 'disponivel', corretor_id = NULL, lead_id = NULL, cliente_nome = NULL, reservado_em = NULL
  WHERE id = p_unidade_id;
END; $$;
