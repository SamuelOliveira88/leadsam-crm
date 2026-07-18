
-- 1) Corretores: novos campos
ALTER TABLE public.corretores
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recebe_via_web boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recebe_via_whatsapp boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS corretores_user_id_uidx ON public.corretores(user_id) WHERE user_id IS NOT NULL;

-- 2) Leads: campos de SLA/atividade
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS visualizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_atividade_em timestamptz NOT NULL DEFAULT now();

-- 3) Notas / histórico livre
CREATE TABLE IF NOT EXISTS public.lead_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  texto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_notas_lead_id_idx ON public.lead_notas(lead_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notas TO authenticated;
GRANT ALL ON public.lead_notas TO service_role;
ALTER TABLE public.lead_notas ENABLE ROW LEVEL SECURITY;

-- helper: usuário atual é corretor dono do lead?
CREATE OR REPLACE FUNCTION public.sou_corretor_do_lead(p_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.corretores c ON c.id = l.corretor_id
    WHERE l.id = p_lead_id AND c.user_id = auth.uid()
  );
$$;

CREATE POLICY "notas: master vê tudo" ON public.lead_notas FOR SELECT TO authenticated
  USING ((SELECT role FROM public.get_my_profile()) = 'master');
CREATE POLICY "notas: gerente vê do seu grupo" ON public.lead_notas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id
      AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile())
  ));
CREATE POLICY "notas: corretor vê próprias" ON public.lead_notas FOR SELECT TO authenticated
  USING (public.sou_corretor_do_lead(lead_id));
CREATE POLICY "notas: inserir se pode ver lead" ON public.lead_notas FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.get_my_profile()) = 'master'
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id
               AND l.grupo_id = (SELECT grupo_id FROM public.get_my_profile()))
    OR public.sou_corretor_do_lead(lead_id)
  );

-- 4) Notificações do gerente
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  descricao text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificacoes_dest_idx ON public.notificacoes(destinatario_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif: destinatário lê" ON public.notificacoes FOR SELECT TO authenticated
  USING (destinatario_id = auth.uid());
CREATE POLICY "notif: destinatário atualiza" ON public.notificacoes FOR UPDATE TO authenticated
  USING (destinatario_id = auth.uid());
CREATE POLICY "notif: master lê tudo" ON public.notificacoes FOR SELECT TO authenticated
  USING ((SELECT role FROM public.get_my_profile()) = 'master');

-- 5) RLS extra para corretor ver os próprios leads/notas
DROP POLICY IF EXISTS "leads: corretor vê próprios" ON public.leads;
CREATE POLICY "leads: corretor vê próprios" ON public.leads FOR SELECT TO authenticated
  USING (corretor_id IN (SELECT id FROM public.corretores WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "leads: corretor atualiza próprios" ON public.leads;
CREATE POLICY "leads: corretor atualiza próprios" ON public.leads FOR UPDATE TO authenticated
  USING (corretor_id IN (SELECT id FROM public.corretores WHERE user_id = auth.uid()));

-- 6) Trigger: nota atualiza ultima_atividade_em
CREATE OR REPLACE FUNCTION public.on_nota_criada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.leads SET ultima_atividade_em = now() WHERE id = NEW.lead_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_on_nota_criada ON public.lead_notas;
CREATE TRIGGER trg_on_nota_criada AFTER INSERT ON public.lead_notas
  FOR EACH ROW EXECUTE FUNCTION public.on_nota_criada();

-- 7) Trigger: novo lead / mudança de corretor → notifica gerente do grupo
CREATE OR REPLACE FUNCTION public.notificar_gerente_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gerente uuid; v_nome_corretor text;
BEGIN
  IF NEW.corretor_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.corretor_id IS NOT DISTINCT FROM NEW.corretor_id THEN RETURN NEW; END IF;

  SELECT nome INTO v_nome_corretor FROM public.corretores WHERE id = NEW.corretor_id;

  FOR v_gerente IN
    SELECT id FROM public.perfis WHERE role IN ('master','gerente')
      AND (role = 'master' OR grupo_id = NEW.grupo_id)
  LOOP
    INSERT INTO public.notificacoes (destinatario_id, tipo, titulo, descricao, lead_id)
    VALUES (v_gerente, 'lead_recebido',
            'Novo lead atribuído',
            COALESCE(v_nome_corretor,'Corretor') || ' recebeu o lead ' || COALESCE(NEW.nome,''),
            NEW.id);
  END LOOP;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notificar_gerente_lead ON public.leads;
CREATE TRIGGER trg_notificar_gerente_lead AFTER INSERT OR UPDATE OF corretor_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notificar_gerente_lead();

-- 8) Reatribuir leads sem visualização em 10min
CREATE OR REPLACE FUNCTION public.reatribuir_leads_sem_visualizacao()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lead record; v_novo uuid;
BEGIN
  FOR v_lead IN
    SELECT * FROM public.leads
    WHERE status = 'distribuido' AND visualizado_em IS NULL
      AND corretor_id IS NOT NULL
      AND created_at < now() - interval '10 minutes'
  LOOP
    SELECT c.id INTO v_novo
    FROM public.corretores c
    LEFT JOIN (
      SELECT corretor_id, max(created_at) AS ultimo FROM public.leads
      WHERE grupo_id = v_lead.grupo_id GROUP BY corretor_id
    ) l ON l.corretor_id = c.id
    WHERE c.grupo_id = v_lead.grupo_id AND c.ativo = true AND c.id <> v_lead.corretor_id
    ORDER BY l.ultimo NULLS FIRST, c.created_at ASC
    LIMIT 1 FOR UPDATE OF c SKIP LOCKED;

    IF v_novo IS NOT NULL THEN
      UPDATE public.leads
      SET corretor_id = v_novo, ultima_atividade_em = now(), created_at = now()
      WHERE id = v_lead.id;
    ELSE
      UPDATE public.leads
      SET corretor_id = NULL, status = 'represado', represado_em = now()
      WHERE id = v_lead.id;
    END IF;
  END LOOP;
END; $$;

-- 9) Liberar leads inativos há 6 dias
CREATE OR REPLACE FUNCTION public.liberar_leads_inativos_6d()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.leads
  SET corretor_id = NULL, status = 'represado', represado_em = now(), visualizado_em = NULL
  WHERE status = 'distribuido'
    AND corretor_id IS NOT NULL
    AND ultima_atividade_em < now() - interval '6 days';
END; $$;

-- 10) Registrar login de corretor → notificar gerente
CREATE OR REPLACE FUNCTION public.registrar_login_corretor()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_corretor record; v_gerente uuid;
BEGIN
  SELECT c.* INTO v_corretor FROM public.corretores c WHERE c.user_id = auth.uid();
  IF v_corretor.id IS NULL THEN RETURN; END IF;

  FOR v_gerente IN
    SELECT id FROM public.perfis WHERE role IN ('master','gerente')
      AND (role = 'master' OR grupo_id = v_corretor.grupo_id)
  LOOP
    INSERT INTO public.notificacoes (destinatario_id, tipo, titulo, descricao)
    VALUES (v_gerente, 'login_corretor', 'Corretor conectado',
            v_corretor.nome || ' fez login no sistema');
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.registrar_login_corretor() TO authenticated;

-- 11) pg_cron: 5 min (SLA) e diário (6d)
DO $$ BEGIN
  PERFORM cron.unschedule('sla-leads-10min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('inatividade-leads-6d');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('sla-leads-10min', '*/5 * * * *',
  $$ SELECT public.reatribuir_leads_sem_visualizacao(); $$);
SELECT cron.schedule('inatividade-leads-6d', '15 3 * * *',
  $$ SELECT public.liberar_leads_inativos_6d(); $$);
