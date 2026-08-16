-- 1) role 'pendente' aceito
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_role_check
  CHECK (role = ANY (ARRAY['master','gerente','corretor','financeiro','suporte','pendente']));

-- 2) triggers de notificação filtrando por empresa
CREATE OR REPLACE FUNCTION public.notificar_gerente_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_gerente uuid; v_nome_corretor text;
BEGIN
  IF NEW.corretor_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.corretor_id IS NOT DISTINCT FROM NEW.corretor_id THEN RETURN NEW; END IF;

  SELECT nome INTO v_nome_corretor FROM public.corretores WHERE id = NEW.corretor_id;

  FOR v_gerente IN
    SELECT id FROM public.perfis
     WHERE role IN ('master','gerente')
       AND empresa_id IS NOT DISTINCT FROM NEW.empresa_id
       AND (role = 'master' OR grupo_id = NEW.grupo_id)
  LOOP
    INSERT INTO public.notificacoes (destinatario_id, tipo, titulo, descricao, lead_id)
    VALUES (v_gerente, 'lead_recebido', 'Novo lead atribuído',
            COALESCE(v_nome_corretor,'Corretor') || ' recebeu o lead ' || COALESCE(NEW.nome,''),
            NEW.id);
  END LOOP;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.registrar_login_corretor()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_corretor record; v_gerente uuid;
BEGIN
  SELECT c.* INTO v_corretor FROM public.corretores c WHERE c.user_id = auth.uid();
  IF v_corretor.id IS NULL THEN RETURN; END IF;

  FOR v_gerente IN
    SELECT id FROM public.perfis
     WHERE role IN ('master','gerente')
       AND empresa_id IS NOT DISTINCT FROM v_corretor.empresa_id
       AND (role = 'master' OR grupo_id = v_corretor.grupo_id)
  LOOP
    INSERT INTO public.notificacoes (destinatario_id, tipo, titulo, descricao)
    VALUES (v_gerente, 'login_corretor', 'Corretor conectado',
            v_corretor.nome || ' fez login no sistema');
  END LOOP;
END; $function$;

-- 3) policies de notificacoes com escopo de empresa
DROP POLICY IF EXISTS "notif: master lê tudo" ON public.notificacoes;
CREATE POLICY "notif: master lê da empresa" ON public.notificacoes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.perfis d
     WHERE d.id = notificacoes.destinatario_id
       AND d.empresa_id IS NOT NULL
       AND d.empresa_id = public.get_minha_empresa_id()
  )
  AND (SELECT role FROM public.get_my_profile()) = 'master'
);

DROP POLICY IF EXISTS notificacoes_insert_self_or_master ON public.notificacoes;
CREATE POLICY notificacoes_insert_self_or_master ON public.notificacoes
FOR INSERT TO authenticated
WITH CHECK (
  destinatario_id = auth.uid()
  OR (
    (SELECT role FROM public.get_my_profile()) = 'master'
    AND EXISTS (
      SELECT 1 FROM public.perfis d
       WHERE d.id = notificacoes.destinatario_id
         AND d.empresa_id IS NOT NULL
         AND d.empresa_id = public.get_minha_empresa_id()
    )
  )
);