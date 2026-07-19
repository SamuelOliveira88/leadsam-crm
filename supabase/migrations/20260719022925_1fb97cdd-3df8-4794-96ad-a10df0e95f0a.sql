
-- Permitir role 'corretor' na tabela de perfis
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_role_check
  CHECK (role = ANY (ARRAY['master'::text, 'gerente'::text, 'corretor'::text]));

-- Atualizar handle_new_user para respeitar metadata do convite (role, grupo_id, corretor_id)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meta_role text := NULLIF(NEW.raw_user_meta_data->>'role','');
  v_meta_grupo text := NULLIF(NEW.raw_user_meta_data->>'grupo_id','');
  v_meta_corretor text := NULLIF(NEW.raw_user_meta_data->>'corretor_id','');
  v_role text;
  v_grupo uuid;
BEGIN
  IF lower(COALESCE(NEW.email,'')) = 'samuelrodrigodeoliveira@gmail.com' THEN
    v_role := 'master';
  ELSIF v_meta_role IN ('corretor','gerente','master') THEN
    v_role := v_meta_role;
  ELSE
    v_role := 'gerente';
  END IF;

  BEGIN v_grupo := v_meta_grupo::uuid; EXCEPTION WHEN others THEN v_grupo := NULL; END;

  INSERT INTO public.perfis (id, nome, role, grupo_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', NEW.email, 'Novo Usuário'),
    v_role,
    v_grupo
  )
  ON CONFLICT (id) DO NOTHING;

  -- Vincular à linha de corretor pré-criada pelo convite
  IF v_meta_corretor IS NOT NULL THEN
    BEGIN
      UPDATE public.corretores
      SET user_id = NEW.id
      WHERE id = v_meta_corretor::uuid AND user_id IS NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
