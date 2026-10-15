-- ============================================================================
-- ETAPA 1 — Isolamento entre imobiliárias (multiempresa)
--
-- Regra: toda linha com empresa_id só é lida/alterada por usuários da MESMA
-- empresa. A única exceção é o super administrador (perfis.super_admin = true).
--
-- Antes desta migration, três caminhos atravessavam empresas:
--   * pode_dar_suporte()  = super_admin OU acesso_total OU role 'suporte'
--   * tem_acesso_total()  usado direto nas policies de config_acesso e corretores
--   * is_admin_email()    (e-mail fixo no código) nas policies de leads
-- Aqui todos passam a depender só de sou_super_admin().
--
-- Escrita idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- 1) Só o super admin atravessa empresas ------------------------------------
CREATE OR REPLACE FUNCTION public.pode_dar_suporte()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.sou_super_admin() $$;

-- 2) webhook_tokens (já existe no banco; garante o desenho e a segurança) ---
CREATE TABLE IF NOT EXISTS public.webhook_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  token_hash text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_tokens_token_hash_key ON public.webhook_tokens (token_hash);
CREATE INDEX IF NOT EXISTS webhook_tokens_empresa_id_idx ON public.webhook_tokens (empresa_id);
ALTER TABLE public.webhook_tokens ENABLE ROW LEVEL SECURITY;

-- A policy antiga deixava QUALQUER usuário da empresa ler os tokens; substituída abaixo.
DROP POLICY IF EXISTS webhook_tokens_select_empresa ON public.webhook_tokens;
DROP POLICY IF EXISTS webhook_tokens_select ON public.webhook_tokens;
DROP POLICY IF EXISTS webhook_tokens_insert ON public.webhook_tokens;
DROP POLICY IF EXISTS webhook_tokens_update ON public.webhook_tokens;

-- Master da própria empresa (ou super admin). Sem DELETE: token só se desativa.
CREATE POLICY webhook_tokens_select ON public.webhook_tokens FOR SELECT TO authenticated
USING (
  public.sou_super_admin()
  OR EXISTS (SELECT 1 FROM public.perfis p
             WHERE p.id = auth.uid() AND p.role = 'master' AND p.empresa_id = webhook_tokens.empresa_id)
);
CREATE POLICY webhook_tokens_insert ON public.webhook_tokens FOR INSERT TO authenticated
WITH CHECK (
  public.sou_super_admin()
  OR EXISTS (SELECT 1 FROM public.perfis p
             WHERE p.id = auth.uid() AND p.role = 'master' AND p.empresa_id = webhook_tokens.empresa_id)
);
CREATE POLICY webhook_tokens_update ON public.webhook_tokens FOR UPDATE TO authenticated
USING (
  public.sou_super_admin()
  OR EXISTS (SELECT 1 FROM public.perfis p
             WHERE p.id = auth.uid() AND p.role = 'master' AND p.empresa_id = webhook_tokens.empresa_id)
)
WITH CHECK (
  public.sou_super_admin()
  OR EXISTS (SELECT 1 FROM public.perfis p
             WHERE p.id = auth.uid() AND p.role = 'master' AND p.empresa_id = webhook_tokens.empresa_id)
);

-- Permissões por coluna: o hash do token nunca sai do servidor, e o navegador
-- só consegue criar (nome) e ativar/desativar. Quem lê/valida o hash é o servidor.
REVOKE ALL ON public.webhook_tokens FROM authenticated, anon;
GRANT SELECT (id, empresa_id, nome, ativo, created_at) ON public.webhook_tokens TO authenticated;
GRANT INSERT (empresa_id, nome, token_hash) ON public.webhook_tokens TO authenticated;
GRANT UPDATE (nome, ativo) ON public.webhook_tokens TO authenticated;
GRANT ALL ON public.webhook_tokens TO service_role;

-- 3) Policies que atravessavam empresas ---------------------------------------
-- 3.1 leads: acesso por e-mail fixo vira super admin; consultor fica na empresa
DROP POLICY IF EXISTS leads_admin_all ON public.leads;
DROP POLICY IF EXISTS leads_super_admin_all ON public.leads;
CREATE POLICY leads_super_admin_all ON public.leads FOR ALL TO authenticated
USING (public.sou_super_admin()) WITH CHECK (public.sou_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_consultor_update')
     AND to_regprocedure('public.current_consultor_id()') IS NOT NULL THEN
    ALTER POLICY leads_consultor_update ON public.leads
      USING (consultor_id = public.current_consultor_id() AND empresa_id = public.get_minha_empresa_id())
      WITH CHECK (consultor_id = public.current_consultor_id() AND empresa_id = public.get_minha_empresa_id());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_consultor_select')
     AND to_regprocedure('public.current_consultor_id()') IS NOT NULL THEN
    ALTER POLICY leads_consultor_select ON public.leads
      USING (consultor_id = public.current_consultor_id() AND empresa_id = public.get_minha_empresa_id());
  END IF;
END $$;

-- 3.2 corretores e config_acesso: acesso_total deixa de cruzar empresas
DROP POLICY IF EXISTS corretores_write_escopo ON public.corretores;
CREATE POLICY corretores_write_escopo ON public.corretores FOR ALL TO authenticated USING ( public.sou_super_admin() OR ( empresa_id IS NOT NULL AND empresa_id = public.get_minha_empresa_id() AND (grupo_id IS NULL OR EXISTS ( SELECT 1 FROM public.grupos g WHERE g.id = corretores.grupo_id AND g.empresa_id = public.get_minha_empresa_id() )) AND ( (SELECT role FROM public.get_my_profile()) = 'master' OR ( (SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL AND grupo_id IS NOT NULL AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id ) ) ) ) WITH CHECK ( public.sou_super_admin() OR ( empresa_id IS NOT NULL AND empresa_id = public.get_minha_empresa_id() AND (grupo_id IS NULL OR EXISTS ( SELECT 1 FROM public.grupos g WHERE g.id = corretores.grupo_id AND g.empresa_id = public.get_minha_empresa_id() )) AND ( (SELECT role FROM public.get_my_profile()) = 'master' OR ( (SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL AND grupo_id IS NOT NULL AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id ) ) ) );

DROP POLICY IF EXISTS config_escrita ON public.config_acesso;
CREATE POLICY config_escrita ON public.config_acesso FOR ALL TO authenticated USING ( public.sou_super_admin() OR ( empresa_id IS NOT NULL AND empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master' ) ) WITH CHECK ( public.sou_super_admin() OR ( empresa_id IS NOT NULL AND empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master' ) );

-- 3.3 propostas: o corretor não pode criar/mover proposta para outra empresa
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='propostas' AND policyname='propostas_insert_corretor') THEN
    ALTER POLICY propostas_insert_corretor ON public.propostas
      WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'corretor'
                  AND corretor_id = public.get_meu_corretor_id()
                  AND empresa_id = public.get_minha_empresa_id());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='propostas' AND policyname='propostas_update_corretor') THEN
    ALTER POLICY propostas_update_corretor ON public.propostas
      WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'corretor'
                  AND corretor_id = public.get_meu_corretor_id()
                  AND empresa_id = public.get_minha_empresa_id());
  END IF;
END $$;

-- 3.4 Tabelas antigas que podem ainda existir em algum ambiente (guardadas)
DO $$
BEGIN
  IF to_regclass('public.consultores') IS NOT NULL THEN
    DROP POLICY IF EXISTS consultores_admin_all ON public.consultores;
    DROP POLICY IF EXISTS consultores_super_admin_all ON public.consultores;
    CREATE POLICY consultores_super_admin_all ON public.consultores FOR ALL TO authenticated
      USING (public.sou_super_admin()) WITH CHECK (public.sou_super_admin());
  END IF;
  IF to_regclass('public.compromissos') IS NOT NULL THEN
    DROP POLICY IF EXISTS compromissos_admin_all ON public.compromissos;
    DROP POLICY IF EXISTS compromissos_super_admin_all ON public.compromissos;
    CREATE POLICY compromissos_super_admin_all ON public.compromissos FOR ALL TO authenticated
      USING (public.sou_super_admin()) WITH CHECK (public.sou_super_admin());
  END IF;
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;
    CREATE POLICY user_roles_self_read ON public.user_roles FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR public.sou_super_admin());
  END IF;
  IF to_regclass('public.rodizio_estado') IS NOT NULL THEN
    DROP POLICY IF EXISTS rodizio_read_admin ON public.rodizio_estado;
    CREATE POLICY rodizio_read_admin ON public.rodizio_estado FOR SELECT TO authenticated
      USING (public.sou_super_admin());
  END IF;
END $$;

-- 4) Rede de segurança em todas as tabelas com empresa_id ---------------------
-- 4.1 Ninguém (a não ser super admin ou o servidor) muda a empresa de uma linha.
CREATE OR REPLACE FUNCTION public.proteger_empresa_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     AND auth.uid() IS NOT NULL
     AND NOT public.sou_super_admin() THEN
    RAISE EXCEPTION 'Nao e permitido mudar a empresa de um registro';
  END IF;
  RETURN NEW;
END;
$$;

-- 4.2 Liga o gatilho e garante RLS ligado (falha fechada) em toda tabela do
--     schema public que tenha a coluna empresa_id. perfis já tem proteção própria.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name AS t
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.column_name = 'empresa_id'
       AND c.table_name NOT IN ('perfis')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_proteger_empresa_id ON public.%I', r.t);
    EXECUTE format('CREATE TRIGGER trg_proteger_empresa_id BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.proteger_empresa_id()', r.t);
  END LOOP;
END $$;
