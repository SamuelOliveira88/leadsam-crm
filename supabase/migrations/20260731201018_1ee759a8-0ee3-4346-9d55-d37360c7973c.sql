-- 1) config_acesso: escrita restrita a master/suporte (config é da empresa inteira)
DROP POLICY IF EXISTS config_escrita ON public.config_acesso;
CREATE POLICY config_escrita ON public.config_acesso
FOR ALL TO authenticated
USING (
  public.pode_dar_suporte() OR (
    empresa_id = public.get_minha_empresa_id()
    AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role = 'master')
  )
)
WITH CHECK (
  public.pode_dar_suporte() OR (
    empresa_id = public.get_minha_empresa_id()
    AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role = 'master')
  )
);

-- 2) notif_pausa: leitura apenas autenticada
DROP POLICY IF EXISTS notif_pausa_read_all ON public.notif_pausa;
REVOKE SELECT ON public.notif_pausa FROM anon;
GRANT SELECT ON public.notif_pausa TO authenticated;
GRANT ALL ON public.notif_pausa TO service_role;
CREATE POLICY notif_pausa_read_auth ON public.notif_pausa
FOR SELECT TO authenticated
USING (true);

-- 3) unidades: escopo por grupo para gerente (leitura e escrita), null-safe
DROP POLICY IF EXISTS unidades_read_escopo ON public.unidades;
CREATE POLICY unidades_read_escopo ON public.unidades
FOR SELECT TO authenticated
USING (
  public.pode_dar_suporte() OR (
    empresa_id = public.get_minha_empresa_id()
    AND (
      (SELECT role FROM public.get_my_profile()) <> 'gerente'
      OR EXISTS (
        SELECT 1 FROM public.empreendimentos e
        WHERE e.id = unidades.empreendimento_id
          AND e.grupo_id IS NOT NULL
          AND e.grupo_id = (SELECT grupo_id FROM public.get_my_profile())
      )
    )
  )
);

DROP POLICY IF EXISTS unidades_write_master_gerente ON public.unidades;
CREATE POLICY unidades_write_master_gerente ON public.unidades
FOR ALL TO authenticated
USING (
  public.pode_dar_suporte() OR (
    empresa_id = public.get_minha_empresa_id()
    AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR (
        (SELECT role FROM public.get_my_profile()) = 'gerente'
        AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.empreendimentos e
          WHERE e.id = unidades.empreendimento_id
            AND e.grupo_id IS NOT NULL
            AND e.grupo_id = (SELECT grupo_id FROM public.get_my_profile())
        )
      )
    )
  )
)
WITH CHECK (
  public.pode_dar_suporte() OR (
    empresa_id = public.get_minha_empresa_id()
    AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR (
        (SELECT role FROM public.get_my_profile()) = 'gerente'
        AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.empreendimentos e
          WHERE e.id = unidades.empreendimento_id
            AND e.grupo_id IS NOT NULL
            AND e.grupo_id = (SELECT grupo_id FROM public.get_my_profile())
        )
      )
    )
  )
);