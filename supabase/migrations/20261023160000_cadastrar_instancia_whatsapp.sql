-- Número próprio por imobiliária: o banco já separa tudo por empresa (instancias_whatsapp liga uma
-- instância da Evolution a uma empresa + grupo). Faltava um jeito seguro de cadastrar a instância
-- de um cliente novo sem escrever SQL solto. Só super admin usa estas duas funções.

CREATE OR REPLACE FUNCTION public.cadastrar_instancia_whatsapp(p_empresa uuid, p_grupo uuid, p_instancia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_nome text := lower(btrim(coalesce(p_instancia, '')));
BEGIN
  IF NOT coalesce(public.sou_super_admin(), false) THEN
    RAISE EXCEPTION 'Só o super admin cadastra instância.';
  END IF;
  IF v_nome !~ '^[a-z0-9][a-z0-9-]{2,39}$' THEN
    RAISE EXCEPTION 'Nome da instância: 3 a 40 letras minúsculas, números ou hífen.';
  END IF;
  IF v_nome LIKE 'sara%' THEN
    RAISE EXCEPTION 'O nome da instância não pode começar com "sara".';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.grupos g WHERE g.id = p_grupo AND g.empresa_id = p_empresa) THEN
    RAISE EXCEPTION 'Esse grupo não é dessa empresa.';
  END IF;
  -- Uma instância pertence a UMA empresa: não deixa trocar de dono por engano.
  IF EXISTS (SELECT 1 FROM public.instancias_whatsapp i WHERE i.instancia = v_nome AND i.empresa_id <> p_empresa) THEN
    RAISE EXCEPTION 'Essa instância já pertence a outra empresa.';
  END IF;
  INSERT INTO public.instancias_whatsapp (instancia, empresa_id, grupo_id, ativo)
  VALUES (v_nome, p_empresa, p_grupo, true)
  ON CONFLICT (instancia) DO UPDATE SET grupo_id = EXCLUDED.grupo_id, ativo = true;
  RETURN jsonb_build_object('instancia', v_nome, 'empresa_id', p_empresa, 'grupo_id', p_grupo);
END; $function$;

CREATE OR REPLACE FUNCTION public.listar_instancias_whatsapp()
 RETURNS TABLE (instancia text, empresa text, grupo text, ativo boolean, created_at timestamptz)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT coalesce(public.sou_super_admin(), false) THEN
    RAISE EXCEPTION 'Só o super admin vê as instâncias.';
  END IF;
  RETURN QUERY
    SELECT i.instancia, e.nome::text, g.nome::text, i.ativo, i.created_at
    FROM public.instancias_whatsapp i
    JOIN public.empresas e ON e.id = i.empresa_id
    JOIN public.grupos g ON g.id = i.grupo_id
    ORDER BY i.created_at;
END; $function$;

REVOKE ALL ON FUNCTION public.cadastrar_instancia_whatsapp(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_instancias_whatsapp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadastrar_instancia_whatsapp(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_instancias_whatsapp() TO authenticated;
