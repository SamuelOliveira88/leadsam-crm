-- ============ DOCUMENTOS DA PROPOSTA + ANÁLISE DE CRÉDITO ============
ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS status_credito text NOT NULL DEFAULT 'pendente'
    CHECK (status_credito IN ('pendente', 'aprovado', 'reprovado')),
  ADD COLUMN IF NOT EXISTS credito_observacoes text,
  ADD COLUMN IF NOT EXISTS credito_analisado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS credito_analisado_em timestamptz;

CREATE TABLE public.documentos_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id),
  proposta_id uuid NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  tipo_documento text NOT NULL,
  pessoa text NOT NULL DEFAULT 'titular' CHECK (pessoa IN ('titular', 'conjuge', 'procurador', 'outro')),
  nome_arquivo text NOT NULL,
  storage_path text NOT NULL,
  enviado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documentos_proposta ON public.documentos_propostas(proposta_id);
GRANT SELECT, INSERT, DELETE ON public.documentos_propostas TO authenticated;
GRANT ALL ON public.documentos_propostas TO service_role;
ALTER TABLE public.documentos_propostas ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_empresa_id ON public.documentos_propostas;
CREATE TRIGGER trg_empresa_id BEFORE INSERT ON public.documentos_propostas
  FOR EACH ROW EXECUTE FUNCTION public.preencher_empresa_id();

CREATE OR REPLACE FUNCTION public.posso_acessar_proposta(p_proposta_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.sou_super_admin() OR EXISTS (
    SELECT 1 FROM public.propostas p
    WHERE p.id = p_proposta_id
      AND p.empresa_id = public.get_minha_empresa_id()
      AND (
        (SELECT role FROM public.get_my_profile()) = 'master' OR
        ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
          SELECT 1 FROM public.leads l WHERE l.id = p.lead_id
          AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))) OR
        ((SELECT role FROM public.get_my_profile()) = 'corretor' AND p.corretor_id = public.get_meu_corretor_id())
      )
  );
$$;

CREATE POLICY "docs_read" ON public.documentos_propostas FOR SELECT TO authenticated
  USING (public.posso_acessar_proposta(proposta_id));
CREATE POLICY "docs_insert" ON public.documentos_propostas FOR INSERT TO authenticated
  WITH CHECK (public.posso_acessar_proposta(proposta_id));
CREATE POLICY "docs_delete" ON public.documentos_propostas FOR DELETE TO authenticated
  USING (public.posso_acessar_proposta(proposta_id));

DROP POLICY IF EXISTS "docs_propostas_select" ON storage.objects;
DROP POLICY IF EXISTS "docs_propostas_insert" ON storage.objects;
DROP POLICY IF EXISTS "docs_propostas_delete" ON storage.objects;

CREATE POLICY "docs_propostas_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-propostas' AND public.posso_acessar_proposta((storage.foldername(name))[1]::uuid));
CREATE POLICY "docs_propostas_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-propostas' AND public.posso_acessar_proposta((storage.foldername(name))[1]::uuid));
CREATE POLICY "docs_propostas_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documentos-propostas' AND public.posso_acessar_proposta((storage.foldername(name))[1]::uuid));

-- ============ NOVOS PAPÉIS: FINANCEIRO E SUPORTE TÉCNICO ============
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_role_check
  CHECK (role IN ('master', 'gerente', 'corretor', 'financeiro', 'suporte'));

CREATE OR REPLACE FUNCTION public.pode_dar_suporte()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.sou_super_admin() OR COALESCE(
    (SELECT role = 'suporte' FROM public.perfis WHERE id = auth.uid()), false
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_email text;
  v_is_admin_fixo boolean := false;
  v_super_admin boolean := false;
  v_role text := 'pendente';
  v_empresa_id uuid := NULL;
  v_invite_role text;
  v_invite_empresa uuid;
  v_invite_grupo uuid;
  v_invite_corretor uuid;
  v_is_invite boolean := false;
BEGIN
  v_email := lower(COALESCE(NEW.email, ''));

  IF v_email IN ('samuelrodrigodeoliveira@gmail.com','equipelavile@hotmail.com','toni.boacasa@gmi.com','toni.boacasa@gmail.com') THEN
    v_is_admin_fixo := true;
    v_role := 'master';
    v_super_admin := v_email IN ('samuelrodrigodeoliveira@gmail.com','toni.boacasa@gmi.com','toni.boacasa@gmail.com');
    SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = 'equipe-lavile';
  END IF;

  IF NOT v_is_admin_fixo THEN
    v_is_invite := COALESCE((NEW.raw_user_meta_data->>'invited_by_admin')::boolean, false);
    IF v_is_invite THEN
      v_invite_role    := NULLIF(NEW.raw_user_meta_data->>'role','');
      v_invite_empresa := NULLIF(NEW.raw_user_meta_data->>'empresa_id','')::uuid;
      v_invite_grupo   := NULLIF(NEW.raw_user_meta_data->>'grupo_id','')::uuid;
      v_invite_corretor:= NULLIF(NEW.raw_user_meta_data->>'corretor_id','')::uuid;
      IF v_invite_role NOT IN ('master','gerente','corretor','financeiro','suporte') THEN
        v_invite_role := 'gerente';
      END IF;
      v_role := v_invite_role;
      v_empresa_id := v_invite_empresa;
    END IF;
  END IF;

  INSERT INTO public.perfis (id, nome, role, grupo_id, corretor_id, empresa_id, super_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    v_role,
    CASE WHEN v_is_invite THEN v_invite_grupo ELSE NULL END,
    CASE WHEN v_is_invite THEN v_invite_corretor ELSE NULL END,
    v_empresa_id,
    v_super_admin
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    grupo_id = COALESCE(public.perfis.grupo_id, EXCLUDED.grupo_id),
    corretor_id = COALESCE(public.perfis.corretor_id, EXCLUDED.corretor_id),
    empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id),
    super_admin = public.perfis.super_admin OR EXCLUDED.super_admin;

  RETURN NEW;
END; $function$;

-- ============ REABRE POLÍTICAS OPERACIONAIS INCLUINDO O SUPORTE ============
DROP POLICY IF EXISTS "perfis_empresa_admin" ON public.perfis;
CREATE POLICY "perfis_empresa_admin" ON public.perfis FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR ((SELECT role FROM public.get_my_profile()) = 'master' AND empresa_id = public.get_minha_empresa_id()))
  WITH CHECK (public.pode_dar_suporte() OR ((SELECT role FROM public.get_my_profile()) = 'master' AND empresa_id = public.get_minha_empresa_id()));

DROP POLICY IF EXISTS "grupos_read_escopo" ON public.grupos;
DROP POLICY IF EXISTS "grupos_write_master" ON public.grupos;
CREATE POLICY "grupos_read_escopo" ON public.grupos FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR (SELECT grupo_id FROM public.get_my_profile()) = id)));
CREATE POLICY "grupos_write_master" ON public.grupos FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master'))
  WITH CHECK (public.pode_dar_suporte() OR (SELECT role FROM public.get_my_profile()) = 'master');

DROP POLICY IF EXISTS "corretores_read_escopo" ON public.corretores;
DROP POLICY IF EXISTS "corretores_write_escopo" ON public.corretores;
CREATE POLICY "corretores_read_escopo" ON public.corretores FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));
CREATE POLICY "corretores_write_escopo" ON public.corretores FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))))
  WITH CHECK (public.pode_dar_suporte() OR (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));

DROP POLICY IF EXISTS "leads_read_escopo" ON public.leads;
DROP POLICY IF EXISTS "leads_write_master_gerente" ON public.leads;
CREATE POLICY "leads_read_escopo" ON public.leads FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id) OR
    ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id()))));
CREATE POLICY "leads_write_master_gerente" ON public.leads FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))))
  WITH CHECK (public.pode_dar_suporte() OR (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));

DROP POLICY IF EXISTS "empreendimentos_read_escopo" ON public.empreendimentos;
DROP POLICY IF EXISTS "empreendimentos_write_master_gerente" ON public.empreendimentos;
CREATE POLICY "empreendimentos_read_escopo" ON public.empreendimentos FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR empresa_id = public.get_minha_empresa_id());
CREATE POLICY "empreendimentos_write_master_gerente" ON public.empreendimentos FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente')))
  WITH CHECK (public.pode_dar_suporte() OR (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente'));

DROP POLICY IF EXISTS "unidades_read_escopo" ON public.unidades;
DROP POLICY IF EXISTS "unidades_write_master_gerente" ON public.unidades;
CREATE POLICY "unidades_read_escopo" ON public.unidades FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR empresa_id = public.get_minha_empresa_id());
CREATE POLICY "unidades_write_master_gerente" ON public.unidades FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente')))
  WITH CHECK (public.pode_dar_suporte() OR (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente'));

DROP POLICY IF EXISTS "horarios_read_escopo" ON public.horarios_atendimento;
DROP POLICY IF EXISTS "horarios_write_escopo" ON public.horarios_atendimento;
CREATE POLICY "horarios_read_escopo" ON public.horarios_atendimento FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR empresa_id = public.get_minha_empresa_id());
CREATE POLICY "horarios_write_escopo" ON public.horarios_atendimento FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))))
  WITH CHECK (public.pode_dar_suporte() OR (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));

DROP POLICY IF EXISTS "fila_read_escopo" ON public.fila_notificacoes;
CREATE POLICY "fila_read_escopo" ON public.fila_notificacoes FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.corretores c WHERE c.id = fila_notificacoes.corretor_id
      AND c.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))) OR
    ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id()))));

DROP POLICY IF EXISTS "campanhas_read_escopo" ON public.campanhas_anuncios;
DROP POLICY IF EXISTS "campanhas_write_master" ON public.campanhas_anuncios;
CREATE POLICY "campanhas_read_escopo" ON public.campanhas_anuncios FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)));
CREATE POLICY "campanhas_write_master" ON public.campanhas_anuncios FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master'))
  WITH CHECK (public.pode_dar_suporte() OR (SELECT role FROM public.get_my_profile()) = 'master');

DROP POLICY IF EXISTS "notas_leitura" ON public.lead_notas;
CREATE POLICY "notas_leitura" ON public.lead_notas FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_notas.lead_id AND (
      (SELECT role FROM public.get_my_profile()) = 'master' OR
      ((SELECT role FROM public.get_my_profile()) = 'gerente' AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile())) OR
      ((SELECT role FROM public.get_my_profile()) = 'corretor' AND l.corretor_id = public.get_meu_corretor_id())))));

DROP POLICY IF EXISTS "config_leitura" ON public.config_acesso;
DROP POLICY IF EXISTS "config_escrita" ON public.config_acesso;
CREATE POLICY "config_leitura" ON public.config_acesso FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR empresa_id = public.get_minha_empresa_id());
CREATE POLICY "config_escrita" ON public.config_acesso FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND
    EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master', 'gerente'))))
  WITH CHECK (public.pode_dar_suporte() OR
    EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master', 'gerente')));

-- ============ PROPOSTAS: financeiro enxerga a empresa toda ============
DROP POLICY IF EXISTS "propostas_read_escopo" ON public.propostas;
DROP POLICY IF EXISTS "propostas_write_master_gerente" ON public.propostas;
CREATE POLICY "propostas_read_escopo" ON public.propostas FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) IN ('master', 'financeiro') OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = propostas.lead_id
      AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))) OR
    ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id()))));
CREATE POLICY "propostas_write_master_gerente" ON public.propostas FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = propostas.lead_id
      AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))))))
  WITH CHECK (public.pode_dar_suporte() OR (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = propostas.lead_id
      AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile())))));

CREATE POLICY "propostas_update_financeiro" ON public.propostas FOR UPDATE TO authenticated
  USING (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'financeiro')
  WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'financeiro');

-- ============ DOCUMENTOS: corretor só enxerga o que ele mesmo enviou ============
DROP POLICY IF EXISTS "docs_read" ON public.documentos_propostas;
CREATE POLICY "docs_read" ON public.documentos_propostas FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR
  ((SELECT role FROM public.get_my_profile()) = 'corretor' AND enviado_por = auth.uid()) OR
  ((SELECT role FROM public.get_my_profile()) <> 'corretor' AND public.posso_acessar_proposta(proposta_id))
);

DROP POLICY IF EXISTS "docs_delete" ON public.documentos_propostas;
CREATE POLICY "docs_delete" ON public.documentos_propostas FOR DELETE TO authenticated USING (
  public.pode_dar_suporte() OR
  ((SELECT role FROM public.get_my_profile()) <> 'corretor' AND public.posso_acessar_proposta(proposta_id))
);

CREATE OR REPLACE FUNCTION public.posso_acessar_proposta(p_proposta_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.pode_dar_suporte() OR EXISTS (
    SELECT 1 FROM public.propostas p
    WHERE p.id = p_proposta_id
      AND p.empresa_id = public.get_minha_empresa_id()
      AND (
        (SELECT role FROM public.get_my_profile()) IN ('master', 'financeiro') OR
        ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
          SELECT 1 FROM public.leads l WHERE l.id = p.lead_id AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))) OR
        ((SELECT role FROM public.get_my_profile()) = 'corretor' AND p.corretor_id = public.get_meu_corretor_id())
      )
  );
$$;

DROP POLICY IF EXISTS "docs_propostas_select" ON storage.objects;
DROP POLICY IF EXISTS "docs_propostas_delete" ON storage.objects;
CREATE POLICY "docs_propostas_select" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documentos-propostas' AND (
    public.pode_dar_suporte() OR
    EXISTS (
      SELECT 1 FROM public.documentos_propostas d
      WHERE d.storage_path = name AND (
        ((SELECT role FROM public.get_my_profile()) = 'corretor' AND d.enviado_por = auth.uid()) OR
        ((SELECT role FROM public.get_my_profile()) <> 'corretor' AND public.posso_acessar_proposta(d.proposta_id))
      )
    )
  )
);
CREATE POLICY "docs_propostas_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'documentos-propostas' AND (
    public.pode_dar_suporte() OR
    EXISTS (
      SELECT 1 FROM public.documentos_propostas d
      WHERE d.storage_path = name
        AND (SELECT role FROM public.get_my_profile()) <> 'corretor'
        AND public.posso_acessar_proposta(d.proposta_id)
    )
  )
);