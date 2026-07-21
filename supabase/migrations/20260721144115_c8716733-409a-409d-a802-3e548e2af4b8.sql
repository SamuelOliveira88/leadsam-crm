CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_grupo_id uuid;
  v_corretor_id uuid;
  v_email text;
BEGIN
  v_email := lower(COALESCE(NEW.email, ''));
  IF v_email IN ('samuelrodrigodeoliveira@gmail.com', 'equipelavile@hotmail.com') THEN
    v_role := 'master';
    v_grupo_id := NULL;
    v_corretor_id := NULL;
  ELSE
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'gerente');
    IF v_role NOT IN ('gerente', 'corretor') THEN
      v_role := 'gerente';
    END IF;
    v_grupo_id := NULLIF(NEW.raw_user_meta_data->>'grupo_id', '')::uuid;
    v_corretor_id := NULLIF(NEW.raw_user_meta_data->>'corretor_id', '')::uuid;
  END IF;

  INSERT INTO public.perfis (id, nome, role, grupo_id, corretor_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    v_role, v_grupo_id, v_corretor_id
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    grupo_id = COALESCE(public.perfis.grupo_id, EXCLUDED.grupo_id),
    corretor_id = COALESCE(public.perfis.corretor_id, EXCLUDED.corretor_id);

  RETURN NEW;
END; $function$;