
DROP POLICY IF EXISTS "leads_read_escopo" ON public.leads;
DROP POLICY IF EXISTS "leads_write_master_gerente" ON public.leads;
DROP POLICY IF EXISTS "leads_update_corretor" ON public.leads;

CREATE POLICY "leads_read_escopo" ON public.leads
FOR SELECT TO authenticated
USING (
  CASE WHEN visibilidade = 'privado' THEN criado_por = (SELECT auth.uid())
  ELSE (
    (SELECT public.pode_dar_suporte())
    OR (
      empresa_id = (SELECT public.get_minha_empresa_id())
      AND (
        (SELECT role FROM public.get_my_profile()) = 'master'
        OR ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
        OR ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = (SELECT public.get_meu_corretor_id()))
      )
    )
  ) END
);

CREATE POLICY "leads_write_master_gerente" ON public.leads
FOR ALL TO authenticated
USING (
  CASE WHEN visibilidade = 'privado' THEN criado_por = (SELECT auth.uid())
  ELSE (
    (SELECT public.pode_dar_suporte())
    OR (
      empresa_id = (SELECT public.get_minha_empresa_id())
      AND (
        (SELECT role FROM public.get_my_profile()) = 'master'
        OR ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
      )
    )
  ) END
)
WITH CHECK (
  CASE WHEN visibilidade = 'privado' THEN criado_por = (SELECT auth.uid())
  ELSE (
    (SELECT public.pode_dar_suporte())
    OR (
      empresa_id = (SELECT public.get_minha_empresa_id())
      AND (
        (SELECT role FROM public.get_my_profile()) = 'master'
        OR ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
      )
    )
  ) END
);

CREATE POLICY "leads_update_corretor" ON public.leads
FOR UPDATE TO authenticated
USING (
  visibilidade <> 'privado'
  AND empresa_id = (SELECT public.get_minha_empresa_id())
  AND (SELECT role FROM public.get_my_profile()) = 'corretor'
  AND corretor_id = (SELECT public.get_meu_corretor_id())
)
WITH CHECK (
  visibilidade <> 'privado'
  AND empresa_id = (SELECT public.get_minha_empresa_id())
  AND (SELECT role FROM public.get_my_profile()) = 'corretor'
  AND corretor_id = (SELECT public.get_meu_corretor_id())
);

CREATE INDEX IF NOT EXISTS idx_leads_empresa_status ON public.leads (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_corretor_created ON public.leads (corretor_id, created_at DESC);
