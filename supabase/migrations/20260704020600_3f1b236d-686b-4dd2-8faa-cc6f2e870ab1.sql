
-- 1) Vincular consultor a uma conta de login
ALTER TABLE public.consultores ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Helper: id do consultor logado
CREATE OR REPLACE FUNCTION public.current_consultor_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT id FROM public.consultores WHERE user_id = auth.uid() LIMIT 1 $$;

-- 3) RLS consultores: admin tudo; consultor lê a própria linha
DROP POLICY IF EXISTS consultores_admin_all ON public.consultores;
CREATE POLICY consultores_admin_all ON public.consultores
  FOR ALL TO authenticated
  USING (public.is_admin_email())
  WITH CHECK (public.is_admin_email());
CREATE POLICY consultores_self_read ON public.consultores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4) RLS leads: admin tudo; consultor vê/edita só os dele
DROP POLICY IF EXISTS leads_authenticated_all ON public.leads;
CREATE POLICY leads_admin_all ON public.leads
  FOR ALL TO authenticated
  USING (public.is_admin_email())
  WITH CHECK (public.is_admin_email());
CREATE POLICY leads_consultor_select ON public.leads
  FOR SELECT TO authenticated
  USING (consultor_id = public.current_consultor_id());
CREATE POLICY leads_consultor_update ON public.leads
  FOR UPDATE TO authenticated
  USING (consultor_id = public.current_consultor_id())
  WITH CHECK (consultor_id = public.current_consultor_id());

-- 5) RLS compromissos: admin tudo; consultor vê/gerencia os do próprio lead
DROP POLICY IF EXISTS compromissos_authenticated_all ON public.compromissos;
CREATE POLICY compromissos_admin_all ON public.compromissos
  FOR ALL TO authenticated
  USING (public.is_admin_email())
  WITH CHECK (public.is_admin_email());
CREATE POLICY compromissos_consultor_all ON public.compromissos
  FOR ALL TO authenticated
  USING (
    lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = compromissos.lead_id AND l.consultor_id = public.current_consultor_id()
    )
  )
  WITH CHECK (
    lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = compromissos.lead_id AND l.consultor_id = public.current_consultor_id()
    )
  );
