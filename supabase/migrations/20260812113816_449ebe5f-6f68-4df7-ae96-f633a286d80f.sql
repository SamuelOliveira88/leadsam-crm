
-- 1) Convites administrativos (fonte de verdade para cargo/empresa em novos cadastros)
CREATE TABLE IF NOT EXISTS public.convites_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES public.grupos(id) ON DELETE SET NULL,
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL,
  nome text,
  criado_por uuid,
  expira_em timestamptz NOT NULL DEFAULT now() + interval '30 days',
  usado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS convites_admin_email_idx ON public.convites_admin (lower(email));

GRANT ALL ON public.convites_admin TO service_role;
ALTER TABLE public.convites_admin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS convites_admin_suporte ON public.convites_admin;
CREATE POLICY convites_admin_suporte ON public.convites_admin
  FOR SELECT TO authenticated USING (public.pode_dar_suporte());

-- 2) handle_new_user: não confia mais em metadados do cliente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_is_admin_fixo boolean := false;
  v_super_admin boolean := false;
  v_role text := 'pendente';
  v_empresa_id uuid := NULL;
  v_grupo_id uuid := NULL;
  v_corretor_id uuid := NULL;
  v_convite RECORD;
BEGIN
  v_email := lower(COALESCE(NEW.email, ''));

  IF v_email IN ('samuelrodrigodeoliveira@gmail.com','equipelavile@hotmail.com','toni.boacasa@gmi.com','toni.boacasa@gmail.com') THEN
    v_is_admin_fixo := true;
    v_role := 'master';
    v_super_admin := v_email IN ('samuelrodrigodeoliveira@gmail.com','toni.boacasa@gmi.com','toni.boacasa@gmail.com');
    SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = 'equipe-lavile';
  END IF;

  IF NOT v_is_admin_fixo THEN
    SELECT * INTO v_convite
      FROM public.convites_admin
     WHERE lower(email) = v_email
       AND usado_em IS NULL
       AND expira_em > now()
     ORDER BY created_at DESC
     LIMIT 1;

    IF FOUND THEN
      v_role := CASE WHEN v_convite.role IN ('master','gerente','corretor','financeiro','suporte')
                     THEN v_convite.role ELSE 'pendente' END;
      v_empresa_id := v_convite.empresa_id;
      v_grupo_id := v_convite.grupo_id;
      v_corretor_id := v_convite.corretor_id;
      UPDATE public.convites_admin SET usado_em = now() WHERE id = v_convite.id;
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
END; $function$;

-- 3) Helper: o chamador pode operar leads neste grupo?
CREATE OR REPLACE FUNCTION public.posso_operar_grupo(p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_grupo uuid;
  v_role text;
  v_meu_grupo uuid;
  v_meu_corretor uuid;
BEGIN
  -- chamadas do backend (service_role / cron / webhook) não têm auth.uid()
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  IF public.pode_dar_suporte() THEN RETURN true; END IF;

  SELECT empresa_id INTO v_empresa_grupo FROM public.grupos WHERE id = p_grupo_id;
  IF v_empresa_grupo IS NULL OR v_empresa_grupo IS DISTINCT FROM public.get_minha_empresa_id() THEN
    RETURN false;
  END IF;

  SELECT role, grupo_id, corretor_id INTO v_role, v_meu_grupo, v_meu_corretor
    FROM public.perfis WHERE id = auth.uid();

  IF v_role IN ('master','financeiro') THEN RETURN true; END IF;
  IF v_role = 'gerente' AND v_meu_grupo IS NOT NULL AND v_meu_grupo = p_grupo_id THEN RETURN true; END IF;
  IF v_role = 'corretor' AND EXISTS (
      SELECT 1 FROM public.corretores c WHERE c.id = v_meu_corretor AND c.grupo_id = p_grupo_id
  ) THEN RETURN true; END IF;

  RETURN false;
END; $function$;

GRANT EXECUTE ON FUNCTION public.posso_operar_grupo(uuid) TO authenticated, service_role;

-- 4) RPCs de distribuição passam a validar empresa/permissão
CREATE OR REPLACE FUNCTION public.distribuir_lead_round_robin(p_nome text, p_telefone text, p_email text, p_grupo_id uuid, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_corretor_id uuid := NULL;
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
  );
  RETURN v_corretor_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.distribuir_lead_direcionado(p_nome text, p_telefone text, p_email text, p_grupo_id uuid, p_corretores_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.distribuir_lead_direcionado(p_nome, p_telefone, p_email, p_grupo_id, p_corretores_ids, '{}'::jsonb);
END; $function$;

CREATE OR REPLACE FUNCTION public.distribuir_lead_direcionado(p_nome text, p_telefone text, p_email text, p_grupo_id uuid, p_corretores_ids uuid[], p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_corretor_id uuid;
BEGIN
  IF NOT public.posso_operar_grupo(p_grupo_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para enviar leads a este grupo.';
  END IF;

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
END; $function$;

-- 5) Unidades: exigir empresa correspondente (empresa nula deixa de ser aceita)
CREATE OR REPLACE FUNCTION public.reservar_unidade(p_unidade_id uuid, p_lead_id uuid DEFAULT NULL::uuid, p_cliente_nome text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF NOT public.sou_super_admin() AND (
       v_empresa_unidade IS NULL
       OR public.get_minha_empresa_id() IS NULL
       OR v_empresa_unidade IS DISTINCT FROM public.get_minha_empresa_id()
     ) THEN
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
END; $function$;

CREATE OR REPLACE FUNCTION public.liberar_unidade(p_unidade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_corretor_id uuid;
  v_dono uuid;
  v_empresa_unidade uuid;
BEGIN
  SELECT role, corretor_id INTO v_role, v_corretor_id FROM public.perfis WHERE id = auth.uid();
  SELECT corretor_id, empresa_id INTO v_dono, v_empresa_unidade FROM public.unidades WHERE id = p_unidade_id FOR UPDATE;
  IF v_empresa_unidade IS NULL AND NOT public.sou_super_admin() THEN
    RAISE EXCEPTION 'Unidade não pertence à sua empresa.';
  END IF;
  IF NOT public.sou_super_admin() AND (
       public.get_minha_empresa_id() IS NULL
       OR v_empresa_unidade IS DISTINCT FROM public.get_minha_empresa_id()
     ) THEN
    RAISE EXCEPTION 'Unidade não pertence à sua empresa.';
  END IF;
  IF v_role = 'corretor' AND (v_dono IS DISTINCT FROM v_corretor_id) THEN
    RAISE EXCEPTION 'Você só pode liberar reservas feitas por você.';
  END IF;
  UPDATE public.unidades SET
    status = 'disponivel', corretor_id = NULL, lead_id = NULL, cliente_nome = NULL, reservado_em = NULL
  WHERE id = p_unidade_id;
END; $function$;

-- 6) corretores: corrige checagem g.empresa_id = g.empresa_id (no-op)
DROP POLICY IF EXISTS corretores_write_escopo ON public.corretores;
CREATE POLICY corretores_write_escopo ON public.corretores
  FOR ALL TO authenticated
  USING (
    public.pode_dar_suporte() OR (
      empresa_id = public.get_minha_empresa_id() AND (
        (SELECT role FROM public.get_my_profile()) = 'master'
        OR ((SELECT role FROM public.get_my_profile()) = 'gerente'
            AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL
            AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
      )
    )
  )
  WITH CHECK (
    public.pode_dar_suporte() OR (
      empresa_id IS NOT NULL
      AND empresa_id = public.get_minha_empresa_id()
      AND (
        grupo_id IS NULL OR EXISTS (
          SELECT 1 FROM public.grupos g
          WHERE g.id = corretores.grupo_id AND g.empresa_id = public.get_minha_empresa_id()
        )
      )
      AND (
        (SELECT role FROM public.get_my_profile()) = 'master'
        OR ((SELECT role FROM public.get_my_profile()) = 'gerente'
            AND grupo_id IS NOT NULL
            AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
      )
    )
  );

-- 7) empreendimentos: gerente precisa ter grupo definido
DROP POLICY IF EXISTS empreendimentos_write_master_gerente ON public.empreendimentos;
CREATE POLICY empreendimentos_write_master_gerente ON public.empreendimentos
  FOR ALL TO authenticated
  USING (
    public.pode_dar_suporte() OR (
      empresa_id = public.get_minha_empresa_id() AND (
        (SELECT role FROM public.get_my_profile()) = 'master'
        OR ((SELECT role FROM public.get_my_profile()) = 'gerente'
            AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL
            AND grupo_id IS NOT NULL
            AND grupo_id = (SELECT grupo_id FROM public.get_my_profile()))
      )
    )
  )
  WITH CHECK (
    public.pode_dar_suporte() OR (
      empresa_id IS NOT NULL
      AND empresa_id = public.get_minha_empresa_id() AND (
        (SELECT role FROM public.get_my_profile()) = 'master'
        OR ((SELECT role FROM public.get_my_profile()) = 'gerente'
            AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL
            AND grupo_id IS NOT NULL
            AND grupo_id = (SELECT grupo_id FROM public.get_my_profile()))
      )
    )
  );

-- 8) config_acesso: escrita apenas para master da própria empresa
DROP POLICY IF EXISTS config_escrita ON public.config_acesso;
CREATE POLICY config_escrita ON public.config_acesso
  FOR ALL TO authenticated
  USING (
    public.pode_dar_suporte() OR (
      empresa_id IS NOT NULL
      AND empresa_id = public.get_minha_empresa_id()
      AND EXISTS (
        SELECT 1 FROM public.perfis p
        WHERE p.id = auth.uid() AND p.role = 'master' AND p.empresa_id = config_acesso.empresa_id
      )
    )
  )
  WITH CHECK (
    public.pode_dar_suporte() OR (
      empresa_id IS NOT NULL
      AND empresa_id = public.get_minha_empresa_id()
      AND EXISTS (
        SELECT 1 FROM public.perfis p
        WHERE p.id = auth.uid() AND p.role = 'master' AND p.empresa_id = config_acesso.empresa_id
      )
    )
  );
