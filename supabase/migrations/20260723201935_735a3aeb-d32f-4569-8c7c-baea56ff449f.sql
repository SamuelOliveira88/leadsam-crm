-- Corrige o isolamento entre empresas: adiciona empresa_id ao WITH CHECK
-- (mesmo padrão já usado em fix_corretores_with_check_escopo.sql)

DROP POLICY IF EXISTS "grupos_write_master" ON public.grupos;
CREATE POLICY "grupos_write_master" ON public.grupos FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master'))
  WITH CHECK (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master'));

DROP POLICY IF EXISTS "leads_write_master_gerente" ON public.leads;
CREATE POLICY "leads_write_master_gerente" ON public.leads FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))))
  WITH CHECK (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))));

DROP POLICY IF EXISTS "empreendimentos_write_master_gerente" ON public.empreendimentos;
CREATE POLICY "empreendimentos_write_master_gerente" ON public.empreendimentos FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente')))
  WITH CHECK (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente')));

DROP POLICY IF EXISTS "unidades_write_master_gerente" ON public.unidades;
CREATE POLICY "unidades_write_master_gerente" ON public.unidades FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente')))
  WITH CHECK (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) IN ('master', 'gerente')));

DROP POLICY IF EXISTS "horarios_write_escopo" ON public.horarios_atendimento;
CREATE POLICY "horarios_write_escopo" ON public.horarios_atendimento FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))))
  WITH CHECK (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))));

DROP POLICY IF EXISTS "campanhas_write_master" ON public.campanhas_anuncios;
CREATE POLICY "campanhas_write_master" ON public.campanhas_anuncios FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master'))
  WITH CHECK (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'master'));

DROP POLICY IF EXISTS "propostas_write_master_gerente" ON public.propostas;
CREATE POLICY "propostas_write_master_gerente" ON public.propostas FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = propostas.lead_id
      AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))))))
  WITH CHECK (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = propostas.lead_id
      AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))))));

DROP POLICY IF EXISTS "propostas_update_financeiro" ON public.propostas;
CREATE POLICY "propostas_update_financeiro" ON public.propostas FOR UPDATE TO authenticated
  USING (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'financeiro')
  WITH CHECK (empresa_id = public.get_minha_empresa_id() AND (SELECT role FROM public.get_my_profile()) = 'financeiro');

DROP POLICY IF EXISTS "config_escrita" ON public.config_acesso;
CREATE POLICY "config_escrita" ON public.config_acesso FOR ALL TO authenticated
  USING (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND
    EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master', 'gerente'))))
  WITH CHECK (public.pode_dar_suporte() OR (empresa_id = public.get_minha_empresa_id() AND
    EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master', 'gerente'))));
