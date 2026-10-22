-- Cada imobiliária decide se o corretor vê o telefone dos leads de lista (planilha).
-- true  = blindado (corretor só vê o nome e conversa pela tela Conversas)  <- padrão
-- false = aberto (corretor vê o telefone como em qualquer lead)
-- Leads do número mãe continuam sempre blindados.
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS lista_blindada boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.minha_lista_blindada()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT e.lista_blindada FROM public.empresas e
                   JOIN public.perfis p ON p.empresa_id = e.id
                   WHERE p.id = auth.uid()), true);
$function$;

CREATE OR REPLACE FUNCTION public.definir_lista_blindada(p_blindada boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_emp uuid; v_role text; v_super boolean;
BEGIN
  SELECT empresa_id, role, coalesce(super_admin, false) INTO v_emp, v_role, v_super
  FROM public.perfis WHERE id = auth.uid();
  IF v_emp IS NULL OR NOT (v_role = 'master' OR v_super) THEN
    RAISE EXCEPTION 'Só o master da imobiliária pode mudar isso.';
  END IF;
  UPDATE public.empresas SET lista_blindada = p_blindada WHERE id = v_emp;
  RETURN p_blindada;
END; $function$;

GRANT EXECUTE ON FUNCTION public.minha_lista_blindada() TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_lista_blindada(boolean) TO authenticated;
