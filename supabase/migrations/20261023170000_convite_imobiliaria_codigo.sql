-- Convite por código para uma NOVA imobiliária (sem saber nome nem e-mail antes).
-- 1) O super admin gera um código. 2) O cliente cria a conta e usa o código na tela /cadastro-empresa.
-- 3) O banco cria a imobiliária (teste de 7 dias), o grupo Principal e deixa o cliente como master.

CREATE TABLE IF NOT EXISTS public.convites_codigo (
  codigo     text PRIMARY KEY,
  criado_por uuid,
  expira_em  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  usado_em   timestamptz,
  usado_por  uuid,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.convites_codigo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.convites_codigo FROM anon, authenticated;
GRANT ALL ON public.convites_codigo TO service_role;
-- sem policy: ninguém lê a tabela direto; só as funções abaixo

-- A trava que impede alguém de virar master/trocar de empresa precisa deixar passar UMA situação:
-- a função aceitar_convite_imobiliaria, que marca a transação com app.convite_imobiliaria (só vale nela).
CREATE OR REPLACE FUNCTION public.proteger_privilegios_perfis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.convite_imobiliaria', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF (NEW.super_admin IS DISTINCT FROM OLD.super_admin)
     OR (NEW.acesso_total IS DISTINCT FROM OLD.acesso_total)
     OR (NEW.role IS DISTINCT FROM OLD.role AND NEW.role IN ('master','suporte'))
     OR (OLD.role IN ('master','suporte') AND NEW.role IS DISTINCT FROM OLD.role)
     OR (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id) THEN
    IF auth.uid() IS NOT NULL AND NOT public.sou_super_admin() THEN
      RAISE EXCEPTION 'Apenas super admins podem alterar privilegios, papel elevado ou empresa de um perfil';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_convite_imobiliaria(p_validade_dias integer DEFAULT 7)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cod text; v_i int := 0;
BEGIN
  IF NOT coalesce(public.sou_super_admin(), false) THEN
    RAISE EXCEPTION 'Só o super admin gera convite.';
  END IF;
  LOOP
    -- 8 letras/números sem 0, O, 1, I (evita confusão ao digitar)
    SELECT string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
      INTO v_cod FROM generate_series(1, 8);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.convites_codigo WHERE codigo = v_cod);
    v_i := v_i + 1;
    IF v_i > 10 THEN RAISE EXCEPTION 'Não consegui gerar um código novo. Tente de novo.'; END IF;
  END LOOP;
  INSERT INTO public.convites_codigo (codigo, criado_por, expira_em)
  VALUES (v_cod, auth.uid(), now() + make_interval(days => greatest(1, least(coalesce(p_validade_dias, 7), 60))));
  RETURN v_cod;
END; $function$;

CREATE OR REPLACE FUNCTION public.aceitar_convite_imobiliaria(p_codigo text, p_nome_empresa text, p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_conv public.convites_codigo%ROWTYPE;
  v_perfil public.perfis%ROWTYPE;
  v_emp uuid; v_grp uuid;
  v_nome_emp text := btrim(coalesce(p_nome_empresa, ''));
  v_slug text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre com a sua conta primeiro.'; END IF;
  IF length(v_nome_emp) < 2 THEN RAISE EXCEPTION 'Escreva o nome da imobiliária.'; END IF;

  SELECT * INTO v_perfil FROM public.perfis WHERE id = v_uid;
  IF FOUND AND v_perfil.empresa_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta conta já pertence a uma imobiliária.';
  END IF;

  SELECT * INTO v_conv FROM public.convites_codigo
   WHERE codigo = upper(btrim(coalesce(p_codigo, ''))) AND usado_em IS NULL AND expira_em > now()
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Código inválido, vencido ou já usado.'; END IF;

  v_slug := regexp_replace(lower(translate(v_nome_emp,
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
      '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-') || '-' || substr(md5(random()::text), 1, 4);

  INSERT INTO public.empresas (nome, slug, plano, status, teste_ate)
  VALUES (v_nome_emp, v_slug, 'starter', 'teste', now() + interval '7 days')
  RETURNING id INTO v_emp;

  INSERT INTO public.grupos (nome, empresa_id, is_principal)
  VALUES ('Principal', v_emp, true)
  RETURNING id INTO v_grp;

  PERFORM set_config('app.convite_imobiliaria', 'on', true);
  INSERT INTO public.perfis (id, nome, role, empresa_id, grupo_id)
  VALUES (v_uid, coalesce(nullif(btrim(p_nome), ''), 'Master'), 'master', v_emp, v_grp)
  ON CONFLICT (id) DO UPDATE
    SET role = 'master', empresa_id = v_emp, grupo_id = v_grp,
        nome = coalesce(nullif(btrim(p_nome), ''), public.perfis.nome);

  PERFORM set_config('app.convite_imobiliaria', 'off', true);
  UPDATE public.convites_codigo SET usado_em = now(), usado_por = v_uid, empresa_id = v_emp
   WHERE codigo = v_conv.codigo;
  RETURN jsonb_build_object('empresa_id', v_emp, 'grupo_id', v_grp);
END; $function$;

REVOKE ALL ON FUNCTION public.gerar_convite_imobiliaria(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aceitar_convite_imobiliaria(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_convite_imobiliaria(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aceitar_convite_imobiliaria(text, text, text) TO authenticated;
