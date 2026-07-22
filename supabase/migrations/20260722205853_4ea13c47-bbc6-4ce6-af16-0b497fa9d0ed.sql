DROP POLICY IF EXISTS "corretores_write_escopo" ON public.corretores;

CREATE POLICY "corretores_write_escopo" ON public.corretores FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))))
  WITH CHECK (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))));