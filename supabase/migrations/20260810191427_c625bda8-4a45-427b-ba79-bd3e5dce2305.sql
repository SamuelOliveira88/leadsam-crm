-- 1) corretores: WITH CHECK revalida consistência empresa/grupo
DROP POLICY IF EXISTS corretores_write_escopo ON public.corretores;
CREATE POLICY corretores_write_escopo ON public.corretores
FOR ALL TO authenticated
USING (
  public.pode_dar_suporte() OR (
    empresa_id = public.get_minha_empresa_id() AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR ((SELECT role FROM public.get_my_profile()) = 'gerente'
          AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
    )
  )
)
WITH CHECK (
  public.pode_dar_suporte() OR (
    empresa_id IS NOT NULL
    AND empresa_id = public.get_minha_empresa_id()
    AND (
      grupo_id IS NULL
      OR EXISTS (SELECT 1 FROM public.grupos g WHERE g.id = grupo_id AND g.empresa_id = empresa_id)
    )
    AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR ((SELECT role FROM public.get_my_profile()) = 'gerente'
          AND grupo_id IS NOT NULL
          AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id)
    )
  )
);

-- 2) fila_notificacoes: cobertura de escrita para gerente (escopo do grupo) e corretor (próprias linhas)
CREATE POLICY fila_insert_escopo ON public.fila_notificacoes
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.get_minha_empresa_id()
  AND (SELECT role FROM public.get_my_profile()) = 'gerente'
  AND EXISTS (
    SELECT 1 FROM public.corretores c
    WHERE c.id = corretor_id
      AND c.empresa_id = public.get_minha_empresa_id()
      AND c.grupo_id = (SELECT grupo_id FROM public.get_my_profile())
  )
);

CREATE POLICY fila_update_escopo ON public.fila_notificacoes
FOR UPDATE TO authenticated
USING (
  empresa_id = public.get_minha_empresa_id() AND (
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.corretores c
      WHERE c.id = corretor_id AND c.grupo_id = (SELECT grupo_id FROM public.get_my_profile())
    ))
    OR ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id())
  )
)
WITH CHECK (
  empresa_id = public.get_minha_empresa_id() AND (
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.corretores c
      WHERE c.id = corretor_id AND c.grupo_id = (SELECT grupo_id FROM public.get_my_profile())
    ))
    OR ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id())
  )
);

CREATE POLICY fila_delete_escopo ON public.fila_notificacoes
FOR DELETE TO authenticated
USING (
  empresa_id = public.get_minha_empresa_id()
  AND (SELECT role FROM public.get_my_profile()) = 'gerente'
  AND EXISTS (
    SELECT 1 FROM public.corretores c
    WHERE c.id = corretor_id AND c.grupo_id = (SELECT grupo_id FROM public.get_my_profile())
  )
);

-- 3) lead_notas: autoria e empresa obrigatórias no insert
DROP POLICY IF EXISTS notas_insercao ON public.lead_notas;
CREATE POLICY notas_insercao ON public.lead_notas
FOR INSERT TO authenticated
WITH CHECK (
  (autor_id IS NULL OR autor_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_id
      AND l.empresa_id = public.get_minha_empresa_id()
      AND (
        (SELECT role FROM public.get_my_profile()) = 'master'
        OR ((SELECT role FROM public.get_my_profile()) = 'gerente' AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))
        OR ((SELECT role FROM public.get_my_profile()) = 'corretor' AND l.corretor_id = public.get_meu_corretor_id())
      )
  )
);

-- 4) notificacoes: update não pode transferir destinatário
DROP POLICY IF EXISTS "notif: destinatário atualiza" ON public.notificacoes;
CREATE POLICY "notif: destinatário atualiza" ON public.notificacoes
FOR UPDATE TO authenticated
USING (destinatario_id = auth.uid())
WITH CHECK (destinatario_id = auth.uid());

-- 5) notif_pausa: leitura restrita a administradores
DROP POLICY IF EXISTS notif_pausa_read_auth ON public.notif_pausa;
CREATE POLICY notif_pausa_read_admin ON public.notif_pausa
FOR SELECT TO authenticated
USING (
  public.sou_super_admin()
  OR public.pode_dar_suporte()
  OR (SELECT role FROM public.get_my_profile()) = 'master'
);