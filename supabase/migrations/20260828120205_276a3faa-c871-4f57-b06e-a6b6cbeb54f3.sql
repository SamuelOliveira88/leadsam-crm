DROP POLICY IF EXISTS corretores_write_escopo ON public.corretores;

CREATE POLICY corretores_write_escopo ON public.corretores
FOR ALL
TO authenticated
USING (
  public.tem_acesso_total() OR (
    empresa_id IS NOT NULL
    AND empresa_id = public.get_minha_empresa_id()
    AND (grupo_id IS NULL OR EXISTS (
      SELECT 1 FROM public.grupos g
      WHERE g.id = corretores.grupo_id AND g.empresa_id = public.get_minha_empresa_id()
    ))
    AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR (
        (SELECT role FROM public.get_my_profile()) = 'gerente'
        AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL
        AND grupo_id IS NOT NULL
        AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id
      )
    )
  )
)
WITH CHECK (
  public.tem_acesso_total() OR (
    empresa_id IS NOT NULL
    AND empresa_id = public.get_minha_empresa_id()
    AND (grupo_id IS NULL OR EXISTS (
      SELECT 1 FROM public.grupos g
      WHERE g.id = corretores.grupo_id AND g.empresa_id = public.get_minha_empresa_id()
    ))
    AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR (
        (SELECT role FROM public.get_my_profile()) = 'gerente'
        AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL
        AND grupo_id IS NOT NULL
        AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id
      )
    )
  )
);