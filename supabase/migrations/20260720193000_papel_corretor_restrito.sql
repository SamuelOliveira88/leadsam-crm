-- ============ CORREÇÃO: PAPEL "CORRETOR" DE VERDADE + ACESSO RESTRITO AOS PRÓPRIOS LEADS ============
-- Bug corrigido: o gatilho handle_new_user() ignorava o metadado role:"corretor"
-- enviado no convite e classificava todo mundo (exceto o master) como "gerente",
-- dando acesso a TODOS os leads do grupo. Corretor agora só vê e edita os
-- próprios leads.

-- 1) Vincula o perfil ao registro de corretor
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL;

-- 2) Permite o valor 'corretor' no papel do perfil
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_role_check CHECK (role IN ('master', 'gerente', 'corretor'));

-- 3) Corrige o gatilho para respeitar o papel enviado no convite
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_grupo_id uuid;
  v_corretor_id uuid;
BEGIN
  IF lower(COALESCE(NEW.email, '')) = 'samuelrodrigodeoliveira@gmail.com' THEN
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
END; $$;

-- 4) Corrige retroativamente quem já foi convidado como corretor e ficou com papel de gerente
UPDATE public.perfis p
SET
  role = 'corretor',
  corretor_id = NULLIF(u.raw_user_meta_data->>'corretor_id', '')::uuid,
  grupo_id = COALESCE(p.grupo_id, NULLIF(u.raw_user_meta_data->>'grupo_id', '')::uuid)
FROM auth.users u
WHERE u.id = p.id
  AND u.raw_user_meta_data->>'role' = 'corretor'
  AND p.role <> 'master';

-- 5) Função auxiliar: corretor_id do usuário logado
CREATE OR REPLACE FUNCTION public.get_meu_corretor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT corretor_id FROM public.perfis WHERE id = auth.uid() $$;

-- ============ POLÍTICAS: FECHA O ACESSO AMPLO DE "GRUPO_ID" PARA CORRETOR ============
-- Antes, qualquer perfil (inclusive corretor) com grupo_id igual ganhava
-- escrita total em corretores/leads/horarios. Agora essas policies exigem
-- explicitamente master OU gerente.

DROP POLICY IF EXISTS "corretores_write_escopo" ON public.corretores;
CREATE POLICY "corretores_write_escopo" ON public.corretores
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))
  WITH CHECK (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id));

DROP POLICY IF EXISTS "horarios_write_escopo" ON public.horarios_atendimento;
CREATE POLICY "horarios_write_escopo" ON public.horarios_atendimento
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))
  WITH CHECK (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id));

-- ============ LEADS: CORRETOR SÓ VÊ E EDITA OS PRÓPRIOS LEADS ============
DROP POLICY IF EXISTS "leads_read_escopo" ON public.leads;
CREATE POLICY "leads_read_escopo" ON public.leads
  FOR SELECT TO authenticated USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id) OR
    ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id()));

DROP POLICY IF EXISTS "leads_write_escopo" ON public.leads;
CREATE POLICY "leads_write_master_gerente" ON public.leads
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id))
  WITH CHECK (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM public.get_my_profile()) = grupo_id));

-- Corretor só pode ATUALIZAR (não inserir/excluir) os próprios leads, e não
-- consegue reatribuir o lead para outro corretor (WITH CHECK exige o mesmo corretor_id).
CREATE POLICY "leads_update_corretor" ON public.leads
  FOR UPDATE TO authenticated
  USING ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id())
  WITH CHECK ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id());

-- ============ FILA DE NOTIFICAÇÕES: CORRETOR SÓ VÊ AS PRÓPRIAS ============
DROP POLICY IF EXISTS "fila_read_escopo" ON public.fila_notificacoes;
CREATE POLICY "fila_read_escopo" ON public.fila_notificacoes
  FOR SELECT TO authenticated USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    ((SELECT role FROM public.get_my_profile()) = 'gerente' AND EXISTS (
      SELECT 1 FROM public.corretores c
      WHERE c.id = fila_notificacoes.corretor_id
      AND c.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))) OR
    ((SELECT role FROM public.get_my_profile()) = 'corretor' AND corretor_id = public.get_meu_corretor_id()));
