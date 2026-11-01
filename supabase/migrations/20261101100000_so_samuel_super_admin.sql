-- Só o Samuel é super admin. Os e-mails do Toni saem da lista fixa (quem se cadastrar com eles
-- não vira mais master nem super admin) e o acesso de super admin deles é retirado.
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
  v_grupo_id uuid := NULL;
  v_corretor_id uuid := NULL;
  v_convite RECORD;
BEGIN
  v_email := lower(COALESCE(NEW.email, ''));

  IF v_email IN ('samuelrodrigodeoliveira@gmail.com','equipelavile@hotmail.com') THEN
    v_is_admin_fixo := true;
    v_role := 'master';
    v_super_admin := v_email = 'samuelrodrigodeoliveira@gmail.com';
    SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = 'equipe-lavile';
  END IF;

  IF NOT v_is_admin_fixo THEN
    SELECT * INTO v_convite
      FROM public.convites_admin
     WHERE lower(email) = v_email
       AND usado_em IS NULL
       AND expira_em > now()
     ORDER BY created_at DESC
     LIMIT 1;

    IF FOUND THEN
      v_role := CASE WHEN v_convite.role IN ('master','gerente','corretor','financeiro','suporte')
                     THEN v_convite.role ELSE 'pendente' END;
      v_empresa_id := v_convite.empresa_id;
      v_grupo_id := v_convite.grupo_id;
      v_corretor_id := v_convite.corretor_id;
      UPDATE public.convites_admin SET usado_em = now() WHERE id = v_convite.id;
    END IF;
  END IF;

  INSERT INTO public.perfis (id, nome, role, grupo_id, corretor_id, empresa_id, super_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    v_role, v_grupo_id, v_corretor_id, v_empresa_id, v_super_admin
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    grupo_id = COALESCE(public.perfis.grupo_id, EXCLUDED.grupo_id),
    corretor_id = COALESCE(public.perfis.corretor_id, EXCLUDED.corretor_id),
    empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id),
    super_admin = public.perfis.super_admin OR EXCLUDED.super_admin;

  RETURN NEW;
END; $function$;

UPDATE public.perfis SET super_admin = false
 WHERE super_admin AND id IN (SELECT id FROM auth.users WHERE lower(email) IN ('toni.boacasa@gmi.com','toni.boacasa@gmail.com'));
