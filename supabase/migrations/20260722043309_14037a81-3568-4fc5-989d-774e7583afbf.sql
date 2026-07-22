-- 1) Revogar EXECUTE público das RPCs de distribuição de leads (assinaturas jsonb)
REVOKE EXECUTE ON FUNCTION public.distribuir_lead_round_robin(text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.distribuir_lead_direcionado(text, text, text, uuid, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_round_robin(text, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_direcionado(text, text, text, uuid, uuid[], jsonb) TO service_role;

-- Revogar também as assinaturas antigas (defesa em profundidade)
DO $$ BEGIN
  BEGIN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.distribuir_lead_round_robin(text, text, text, uuid) FROM PUBLIC, anon, authenticated';
  EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.distribuir_lead_direcionado(text, text, text, uuid, uuid[]) FROM PUBLIC, anon, authenticated';
  EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

-- 2) Endurecer handle_new_user:
--    - Nunca confiar em role/empresa_id/grupo_id vindos de raw_user_meta_data para signups comuns.
--    - Apenas o e-mail admin fixo entra como master/super_admin da empresa Lavile.
--    - Qualquer outro signup entra SEM empresa/grupo/role definidos (perfil neutro).
--      O acesso comercial acontece apenas via convite emitido pelo super-admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_is_admin_fixo boolean := false;
  v_super_admin boolean := false;
  v_role text := 'pendente';
  v_empresa_id uuid := NULL;
  v_invite_role text;
  v_invite_empresa uuid;
  v_invite_grupo uuid;
  v_invite_corretor uuid;
  v_is_invite boolean := false;
BEGIN
  v_email := lower(COALESCE(NEW.email, ''));

  -- Admins fixos do produto
  IF v_email IN ('samuelrodrigodeoliveira@gmail.com','equipelavile@hotmail.com','toni.boacasa@gmi.com','toni.boacasa@gmail.com') THEN
    v_is_admin_fixo := true;
    v_role := 'master';
    v_super_admin := v_email IN ('samuelrodrigodeoliveira@gmail.com','toni.boacasa@gmi.com','toni.boacasa@gmail.com');
    SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = 'equipe-lavile';
  END IF;

  -- Fluxo de convite (Admin API): metadata contém flag confiável 'invited_by_admin' = true
  -- e os campos role/empresa/grupo devem ser gravados apenas nesse caso.
  IF NOT v_is_admin_fixo THEN
    v_is_invite := COALESCE((NEW.raw_user_meta_data->>'invited_by_admin')::boolean, false);
    IF v_is_invite THEN
      v_invite_role    := NULLIF(NEW.raw_user_meta_data->>'role','');
      v_invite_empresa := NULLIF(NEW.raw_user_meta_data->>'empresa_id','')::uuid;
      v_invite_grupo   := NULLIF(NEW.raw_user_meta_data->>'grupo_id','')::uuid;
      v_invite_corretor:= NULLIF(NEW.raw_user_meta_data->>'corretor_id','')::uuid;
      IF v_invite_role NOT IN ('master','gerente','corretor') THEN
        v_invite_role := 'gerente';
      END IF;
      v_role := v_invite_role;
      v_empresa_id := v_invite_empresa;
    END IF;
  END IF;

  INSERT INTO public.perfis (id, nome, role, grupo_id, corretor_id, empresa_id, super_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    v_role,
    CASE WHEN v_is_invite THEN v_invite_grupo ELSE NULL END,
    CASE WHEN v_is_invite THEN v_invite_corretor ELSE NULL END,
    v_empresa_id,
    v_super_admin
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    grupo_id = COALESCE(public.perfis.grupo_id, EXCLUDED.grupo_id),
    corretor_id = COALESCE(public.perfis.corretor_id, EXCLUDED.corretor_id),
    empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id),
    super_admin = public.perfis.super_admin OR EXCLUDED.super_admin;

  RETURN NEW;
END; $function$;