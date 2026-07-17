
-- ============ DROP OLD SCHEMA ============
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TABLE IF EXISTS public.compromissos CASCADE;
DROP TABLE IF EXISTS public.rodizio_estado CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.consultores CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_email() CASCADE;
DROP FUNCTION IF EXISTS public.current_consultor_id() CASCADE;
DROP FUNCTION IF EXISTS public.escolher_proximo_consultor() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_consultores_limit() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.compromisso_tipo CASCADE;
DROP TYPE IF EXISTS public.lead_estagio CASCADE;

-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============ TABLES ============
CREATE TABLE public.grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos TO authenticated;
GRANT ALL ON public.grupos TO service_role;
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.corretores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  grupo_id uuid REFERENCES public.grupos(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  canal_notificacao text NOT NULL DEFAULT 'whatsapp' CHECK (canal_notificacao IN ('whatsapp','email','ambos','nenhum')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretores TO authenticated;
GRANT ALL ON public.corretores TO service_role;
ALTER TABLE public.corretores ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.perfis (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text,
  role text NOT NULL DEFAULT 'gerente' CHECK (role IN ('master','gerente')),
  grupo_id uuid REFERENCES public.grupos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfis TO authenticated;
GRANT ALL ON public.perfis TO service_role;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  email text,
  grupo_id uuid REFERENCES public.grupos(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'distribuido' CHECK (status IN ('distribuido','represado')),
  represado_em timestamptz,
  liberado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.horarios_atendimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  dia_semana int NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL DEFAULT '08:00:00',
  hora_fim time NOT NULL DEFAULT '18:00:00',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, dia_semana)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.horarios_atendimento TO authenticated;
GRANT ALL ON public.horarios_atendimento TO service_role;
ALTER TABLE public.horarios_atendimento ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fila_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo text,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz
);
GRANT SELECT ON public.fila_notificacoes TO authenticated;
GRANT ALL ON public.fila_notificacoes TO service_role;
ALTER TABLE public.fila_notificacoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.campanhas_anuncios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_campanha text NOT NULL,
  meta_campaign_id text UNIQUE,
  grupo_id uuid REFERENCES public.grupos(id) ON DELETE SET NULL,
  empreendimento text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas_anuncios TO authenticated;
GRANT ALL ON public.campanhas_anuncios TO service_role;
ALTER TABLE public.campanhas_anuncios ENABLE ROW LEVEL SECURITY;

-- ============ HELPER FUNCTION ============
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (role text, grupo_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role, grupo_id FROM public.perfis WHERE id = auth.uid(); $$;

-- ============ NEW USER TRIGGER (auto master for admin email) ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, role, grupo_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    CASE WHEN lower(COALESCE(NEW.email,'')) = 'samuelrodrigodeoliveira@gmail.com' THEN 'master' ELSE 'gerente' END,
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill master profile for existing admin user
INSERT INTO public.perfis (id, nome, role)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', 'Master'), 'master'
FROM auth.users u
WHERE lower(u.email) = 'samuelrodrigodeoliveira@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'master';

-- ============ HORÁRIO ============
CREATE OR REPLACE FUNCTION public.dentro_do_horario(p_grupo_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_agora timestamptz := now();
  v_dia int := extract(dow from v_agora);
  v_hora time := v_agora::time;
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.horarios_atendimento
    WHERE grupo_id = p_grupo_id AND dia_semana = v_dia
      AND ativo = true AND v_hora BETWEEN hora_inicio AND hora_fim
  ) INTO v_ok;
  RETURN v_ok;
END; $$;

-- ============ DISTRIBUIÇÃO ROUND-ROBIN ============
CREATE OR REPLACE FUNCTION public.distribuir_lead_round_robin(
  p_nome text, p_telefone text, p_email text, p_grupo_id uuid
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

  INSERT INTO public.leads (nome, telefone, email, grupo_id, corretor_id, status, represado_em)
  VALUES (p_nome, p_telefone, p_email, p_grupo_id, v_corretor_id,
    CASE WHEN v_corretor_id IS NULL THEN 'represado' ELSE 'distribuido' END,
    CASE WHEN v_corretor_id IS NULL THEN now() ELSE NULL END);
  RETURN v_corretor_id;
END; $$;

-- ============ DISTRIBUIÇÃO DIRECIONADA ============
CREATE OR REPLACE FUNCTION public.distribuir_lead_direcionado(
  p_nome text, p_telefone text, p_email text, p_grupo_id uuid, p_corretores_ids uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_corretor_id uuid;
BEGIN
  IF NOT public.dentro_do_horario(p_grupo_id) THEN
    INSERT INTO public.leads (nome, telefone, email, grupo_id, status, represado_em)
    VALUES (p_nome, p_telefone, p_email, p_grupo_id, 'represado', now());
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

  INSERT INTO public.leads (nome, telefone, email, grupo_id, corretor_id, status)
  VALUES (p_nome, p_telefone, p_email, p_grupo_id, v_corretor_id, 'distribuido');
  RETURN v_corretor_id;
END; $$;

-- ============ LIBERAR REPRESADOS ============
CREATE OR REPLACE FUNCTION public.liberar_leads_represados()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lead record; v_corretor_id uuid;
BEGIN
  FOR v_lead IN SELECT * FROM public.leads WHERE status = 'represado' LOOP
    IF public.dentro_do_horario(v_lead.grupo_id) THEN
      SELECT c.id INTO v_corretor_id
      FROM public.corretores c
      LEFT JOIN (
        SELECT corretor_id, max(created_at) AS ultimo_lead
        FROM public.leads WHERE grupo_id = v_lead.grupo_id GROUP BY corretor_id
      ) l ON l.corretor_id = c.id
      WHERE c.grupo_id = v_lead.grupo_id AND c.ativo = true
      ORDER BY l.ultimo_lead NULLS FIRST, c.created_at ASC
      LIMIT 1 FOR UPDATE OF c SKIP LOCKED;

      IF v_corretor_id IS NOT NULL THEN
        UPDATE public.leads
        SET corretor_id = v_corretor_id, status = 'distribuido', liberado_em = now()
        WHERE id = v_lead.id;
      END IF;
    END IF;
  END LOOP;
END; $$;

SELECT cron.schedule('liberar-leads-represados', '*/15 * * * *',
  $$ SELECT public.liberar_leads_represados(); $$);

-- ============ NOTIFICAÇÃO ============
CREATE OR REPLACE FUNCTION public.notificar_corretor_novo_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_corretor record;
BEGIN
  IF NEW.corretor_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    SELECT * INTO v_corretor FROM public.corretores WHERE id = NEW.corretor_id;
    IF v_corretor.canal_notificacao IN ('whatsapp','ambos') THEN
      INSERT INTO public.fila_notificacoes (corretor_id, lead_id, tipo, status)
      VALUES (NEW.corretor_id, NEW.id, 'whatsapp', 'pendente');
    END IF;
    IF v_corretor.canal_notificacao IN ('email','ambos') THEN
      INSERT INTO public.fila_notificacoes (corretor_id, lead_id, tipo, status)
      VALUES (NEW.corretor_id, NEW.id, 'email', 'pendente');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_lead_atribuido
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE PROCEDURE public.notificar_corretor_novo_lead();

-- ============ VIEW DASHBOARD ============
CREATE OR REPLACE VIEW public.dashboard_corretores
WITH (security_invoker = true) AS
SELECT c.id AS corretor_id, c.nome AS corretor, c.grupo_id, g.nome AS grupo,
  count(l.id) AS total_leads, max(l.created_at) AS ultimo_lead_recebido
FROM public.corretores c
LEFT JOIN public.leads l ON l.corretor_id = c.id
LEFT JOIN public.grupos g ON g.id = c.grupo_id
GROUP BY c.id, c.nome, c.grupo_id, g.nome
ORDER BY total_leads DESC;
GRANT SELECT ON public.dashboard_corretores TO authenticated;

-- ============ RLS POLICIES ============
CREATE POLICY "perfis_self_read" ON public.perfis
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "perfis_master_all" ON public.perfis
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.get_my_profile()) = 'master')
  WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'master');

CREATE POLICY "grupos_read_escopo" ON public.grupos
  FOR SELECT TO authenticated USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = id);
CREATE POLICY "grupos_write_master" ON public.grupos
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.get_my_profile()) = 'master')
  WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'master');

CREATE POLICY "corretores_read_escopo" ON public.corretores
  FOR SELECT TO authenticated USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id);
CREATE POLICY "corretores_write_escopo" ON public.corretores
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
  WITH CHECK (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id);

CREATE POLICY "leads_read_escopo" ON public.leads
  FOR SELECT TO authenticated USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id);
CREATE POLICY "leads_write_escopo" ON public.leads
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
  WITH CHECK (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id);

CREATE POLICY "horarios_read_escopo" ON public.horarios_atendimento
  FOR SELECT TO authenticated USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id);
CREATE POLICY "horarios_write_escopo" ON public.horarios_atendimento
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
  WITH CHECK (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id);

CREATE POLICY "fila_read_escopo" ON public.fila_notificacoes
  FOR SELECT TO authenticated USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    EXISTS (SELECT 1 FROM public.corretores c
      WHERE c.id = fila_notificacoes.corretor_id
      AND c.grupo_id = (SELECT grupo_id FROM public.get_my_profile())));

CREATE POLICY "campanhas_read_escopo" ON public.campanhas_anuncios
  FOR SELECT TO authenticated USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT grupo_id FROM public.get_my_profile()) = grupo_id);
CREATE POLICY "campanhas_write_master" ON public.campanhas_anuncios
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.get_my_profile()) = 'master')
  WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'master');
