DROP POLICY IF EXISTS leads_update_corretor ON public.leads;
CREATE POLICY leads_update_corretor ON public.leads FOR UPDATE TO authenticated
USING (
  empresa_id = get_minha_empresa_id()
  AND (SELECT role FROM get_my_profile()) = 'corretor'
  AND corretor_id = get_meu_corretor_id()
)
WITH CHECK (
  empresa_id = get_minha_empresa_id()
  AND (SELECT role FROM get_my_profile()) = 'corretor'
  AND corretor_id = get_meu_corretor_id()
);