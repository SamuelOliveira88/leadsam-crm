
-- 1) Fix corretores insert WITH CHECK to enforce empresa scope
DROP POLICY IF EXISTS corretores_write_escopo ON public.corretores;
CREATE POLICY corretores_write_escopo ON public.corretores
  FOR ALL
  USING (
    public.sou_super_admin()
    OR (empresa_id = public.get_minha_empresa_id()
        AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente')))
  )
  WITH CHECK (
    public.sou_super_admin()
    OR (empresa_id = public.get_minha_empresa_id()
        AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente')))
  );

-- 2) fila_notificacoes: block all client writes; only service_role/definer functions write
DROP POLICY IF EXISTS fila_notificacoes_no_insert ON public.fila_notificacoes;
DROP POLICY IF EXISTS fila_notificacoes_no_update ON public.fila_notificacoes;
DROP POLICY IF EXISTS fila_notificacoes_no_delete ON public.fila_notificacoes;
CREATE POLICY fila_notificacoes_no_insert ON public.fila_notificacoes FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY fila_notificacoes_no_update ON public.fila_notificacoes FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY fila_notificacoes_no_delete ON public.fila_notificacoes FOR DELETE TO authenticated USING (false);

-- 3) notificacoes: block insert; allow delete only for the recipient
DROP POLICY IF EXISTS notificacoes_no_insert ON public.notificacoes;
DROP POLICY IF EXISTS notificacoes_delete_dono ON public.notificacoes;
CREATE POLICY notificacoes_no_insert ON public.notificacoes FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY notificacoes_delete_dono ON public.notificacoes FOR DELETE TO authenticated USING (destinatario_id = auth.uid());

-- 4) lead_notas: only the author (or master/gerente same empresa) may update/delete
DROP POLICY IF EXISTS lead_notas_update_dono ON public.lead_notas;
DROP POLICY IF EXISTS lead_notas_delete_dono ON public.lead_notas;
CREATE POLICY lead_notas_update_dono ON public.lead_notas
  FOR UPDATE TO authenticated
  USING (
    autor_id = auth.uid()
    OR public.sou_super_admin()
    OR (empresa_id = public.get_minha_empresa_id()
        AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente')))
  )
  WITH CHECK (
    autor_id = auth.uid()
    OR public.sou_super_admin()
    OR (empresa_id = public.get_minha_empresa_id()
        AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente')))
  );
CREATE POLICY lead_notas_delete_dono ON public.lead_notas
  FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR public.sou_super_admin()
    OR (empresa_id = public.get_minha_empresa_id()
        AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente')))
  );

-- 5) Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.tocar_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END;
$function$;
