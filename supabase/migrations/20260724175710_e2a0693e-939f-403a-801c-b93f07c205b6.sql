
-- Restrict gerente writes on empreendimentos to their own grupo
DROP POLICY IF EXISTS empreendimentos_write_master_gerente ON public.empreendimentos;
CREATE POLICY empreendimentos_write_master_gerente ON public.empreendimentos
FOR ALL TO authenticated
USING (
  pode_dar_suporte() OR (
    empresa_id = get_minha_empresa_id() AND (
      (SELECT role FROM get_my_profile()) = 'master' OR
      ((SELECT role FROM get_my_profile()) = 'gerente' AND grupo_id = (SELECT grupo_id FROM get_my_profile()))
    )
  )
)
WITH CHECK (
  pode_dar_suporte() OR (
    empresa_id = get_minha_empresa_id() AND (
      (SELECT role FROM get_my_profile()) = 'master' OR
      ((SELECT role FROM get_my_profile()) = 'gerente' AND grupo_id = (SELECT grupo_id FROM get_my_profile()))
    )
  )
);

-- Restrict gerente writes on unidades to units of their grupo (via empreendimentos)
DROP POLICY IF EXISTS unidades_write_master_gerente ON public.unidades;
CREATE POLICY unidades_write_master_gerente ON public.unidades
FOR ALL TO authenticated
USING (
  pode_dar_suporte() OR (
    empresa_id = get_minha_empresa_id() AND (
      (SELECT role FROM get_my_profile()) = 'master' OR
      ((SELECT role FROM get_my_profile()) = 'gerente' AND EXISTS (
        SELECT 1 FROM public.empreendimentos e
        WHERE e.id = unidades.empreendimento_id
          AND e.grupo_id = (SELECT grupo_id FROM get_my_profile())
      ))
    )
  )
)
WITH CHECK (
  pode_dar_suporte() OR (
    empresa_id = get_minha_empresa_id() AND (
      (SELECT role FROM get_my_profile()) = 'master' OR
      ((SELECT role FROM get_my_profile()) = 'gerente' AND EXISTS (
        SELECT 1 FROM public.empreendimentos e
        WHERE e.id = unidades.empreendimento_id
          AND e.grupo_id = (SELECT grupo_id FROM get_my_profile())
      ))
    )
  )
);

-- Fix mutable search_path on the 4 pgmq wrapper functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
