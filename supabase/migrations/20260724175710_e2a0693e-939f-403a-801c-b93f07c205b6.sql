
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

-- Fix mutable search_path on the 4 pgmq wrapper functions (if they still exist)
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('enqueue_email','read_email_batch','delete_email','move_to_dlq')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END
$do$;
