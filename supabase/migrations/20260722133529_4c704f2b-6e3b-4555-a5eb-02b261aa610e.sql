
-- 1) Tighten corretores write policy: gerente must scope to own grupo
DROP POLICY IF EXISTS corretores_write_escopo ON public.corretores;
CREATE POLICY corretores_write_escopo ON public.corretores
FOR ALL TO authenticated
USING (
  public.sou_super_admin() OR (
    empresa_id = public.get_minha_empresa_id() AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR (
        (SELECT role FROM public.get_my_profile()) = 'gerente'
        AND grupo_id = (SELECT grupo_id FROM public.get_my_profile())
      )
    )
  )
)
WITH CHECK (
  public.sou_super_admin() OR (
    empresa_id = public.get_minha_empresa_id() AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR (
        (SELECT role FROM public.get_my_profile()) = 'gerente'
        AND grupo_id = (SELECT grupo_id FROM public.get_my_profile())
      )
    )
  )
);

-- 2) fila_notificacoes: replace deny-all with explicit scoped policies
DROP POLICY IF EXISTS fila_notificacoes_no_insert ON public.fila_notificacoes;
DROP POLICY IF EXISTS fila_notificacoes_no_update ON public.fila_notificacoes;
DROP POLICY IF EXISTS fila_notificacoes_no_delete ON public.fila_notificacoes;

CREATE POLICY fila_notificacoes_insert_master ON public.fila_notificacoes
FOR INSERT TO authenticated
WITH CHECK (
  public.sou_super_admin() OR (
    empresa_id = public.get_minha_empresa_id()
    AND (SELECT role FROM public.get_my_profile()) = 'master'
  )
);

CREATE POLICY fila_notificacoes_update_master ON public.fila_notificacoes
FOR UPDATE TO authenticated
USING (
  public.sou_super_admin() OR (
    empresa_id = public.get_minha_empresa_id()
    AND (SELECT role FROM public.get_my_profile()) = 'master'
  )
)
WITH CHECK (
  public.sou_super_admin() OR (
    empresa_id = public.get_minha_empresa_id()
    AND (SELECT role FROM public.get_my_profile()) = 'master'
  )
);

CREATE POLICY fila_notificacoes_delete_master ON public.fila_notificacoes
FOR DELETE TO authenticated
USING (
  public.sou_super_admin() OR (
    empresa_id = public.get_minha_empresa_id()
    AND (SELECT role FROM public.get_my_profile()) = 'master'
  )
);

-- 3) notificacoes: replace deny-all insert with scoped insert; ensure delete policy exists
DROP POLICY IF EXISTS notificacoes_no_insert ON public.notificacoes;

CREATE POLICY notificacoes_insert_self_or_master ON public.notificacoes
FOR INSERT TO authenticated
WITH CHECK (
  public.sou_super_admin()
  OR destinatario_id = auth.uid()
  OR (SELECT role FROM public.get_my_profile()) = 'master'
);
