-- O super admin enxergava os dados de TODAS as imobiliárias ao mesmo tempo
-- (a empresa escolhida no seletor não filtrava nada). Agora, dentro de uma empresa,
-- ele só vê e altera os dados dessa empresa (perfis.empresa_id = empresa ativa).
--
-- Policy RESTRICTIVE: é somada (AND) às policies que já existem.
--  * Quem não é super admin não é afetado (as policies atuais já isolam por empresa).
--  * Linhas sem empresa_id e super admin sem empresa ativa continuam visíveis (sem trava).
--  * A tela de Empresas (tabela empresas) não é afetada: o super admin segue vendo todas.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'empresa_id'
      AND c.table_name <> 'empresas'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS ctx_super_admin_empresa ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE POLICY ctx_super_admin_empresa ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (NOT public.sou_super_admin() OR empresa_id IS NULL OR public.get_minha_empresa_id() IS NULL OR empresa_id = public.get_minha_empresa_id()) '
      'WITH CHECK (NOT public.sou_super_admin() OR empresa_id IS NULL OR public.get_minha_empresa_id() IS NULL OR empresa_id = public.get_minha_empresa_id())',
      r.table_name);
  END LOOP;
END $$;
