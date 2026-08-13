-- 1) Coluna de acesso total
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS acesso_total boolean NOT NULL DEFAULT false;

-- 2) Backfill
UPDATE public.perfis SET acesso_total = true
 WHERE id IN ('5fe00450-e8c5-4d45-a30e-c074b7da9eee','2617adfe-194a-4b22-9ed7-24b1a6c8f72e');

UPDATE public.perfis
   SET acesso_total = false,
       super_admin = false,
       grupo_id = '2cf1e84a-b58b-4acf-9024-e11ad39c697b',
       corretor_id = '80306ef9-bcfb-41fb-a6c0-5d541955a269'
 WHERE id = '35b7565f-51b1-4af5-8548-80d7fb62b902';

UPDATE public.corretores
   SET user_id = '35b7565f-51b1-4af5-8548-80d7fb62b902'
 WHERE id = '80306ef9-bcfb-41fb-a6c0-5d541955a269';

-- 3) Função de acesso total
CREATE OR REPLACE FUNCTION public.tem_acesso_total()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT super_admin OR acesso_total FROM public.perfis WHERE id = auth.uid()), false)
$$;

-- 4) Papel efetivo: master sem acesso total é tratado como gerente do próprio grupo
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE(role text, grupo_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
           WHEN p.role = 'master'
                AND NOT COALESCE(p.super_admin, false)
                AND NOT COALESCE(p.acesso_total, false)
           THEN 'gerente'
           ELSE p.role
         END,
         p.grupo_id
    FROM public.perfis p
   WHERE p.id = auth.uid();
$$;

-- 5) Suporte deixa de depender de super_admin puro e passa a considerar acesso total
CREATE OR REPLACE FUNCTION public.pode_dar_suporte()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.tem_acesso_total() OR COALESCE(
    (SELECT role = 'suporte' FROM public.perfis WHERE id = auth.uid()), false
  );
$$;

-- 6) posso_operar_grupo passa a usar o papel efetivo
CREATE OR REPLACE FUNCTION public.posso_operar_grupo(p_grupo_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_empresa_grupo uuid;
  v_role text;
  v_meu_grupo uuid;
  v_meu_corretor uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  IF public.pode_dar_suporte() THEN RETURN true; END IF;

  SELECT empresa_id INTO v_empresa_grupo FROM public.grupos WHERE id = p_grupo_id;
  IF v_empresa_grupo IS NULL OR v_empresa_grupo IS DISTINCT FROM public.get_minha_empresa_id() THEN
    RETURN false;
  END IF;

  SELECT g.role, g.grupo_id INTO v_role, v_meu_grupo FROM public.get_my_profile() g;
  SELECT corretor_id INTO v_meu_corretor FROM public.perfis WHERE id = auth.uid();

  IF v_role IN ('master','financeiro') THEN RETURN true; END IF;
  IF v_role = 'gerente' AND v_meu_grupo IS NOT NULL AND v_meu_grupo = p_grupo_id THEN RETURN true; END IF;
  IF v_role = 'corretor' AND EXISTS (
      SELECT 1 FROM public.corretores c WHERE c.id = v_meu_corretor AND c.grupo_id = p_grupo_id
  ) THEN RETURN true; END IF;

  RETURN false;
END; $$;

-- 7) config_acesso: escrita usa papel efetivo em vez de ler perfis.role direto
DROP POLICY IF EXISTS config_escrita ON public.config_acesso;
CREATE POLICY config_escrita ON public.config_acesso FOR ALL TO authenticated
USING (
  public.tem_acesso_total() OR (
    empresa_id IS NOT NULL
    AND empresa_id = public.get_minha_empresa_id()
    AND (SELECT role FROM public.get_my_profile()) = 'master'
  )
)
WITH CHECK (
  public.tem_acesso_total() OR (
    empresa_id IS NOT NULL
    AND empresa_id = public.get_minha_empresa_id()
    AND (SELECT role FROM public.get_my_profile()) = 'master'
  )
);
