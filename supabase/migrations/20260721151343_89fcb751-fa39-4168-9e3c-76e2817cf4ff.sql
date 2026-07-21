
CREATE TABLE IF NOT EXISTS public.config_acesso (
  id int PRIMARY KEY DEFAULT 1,
  restringir_horario boolean NOT NULL DEFAULT true,
  hora_inicio time NOT NULL DEFAULT '08:00:00',
  hora_fim time NOT NULL DEFAULT '09:30:00',
  liberado_ate timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT config_acesso_single CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.config_acesso TO authenticated;
GRANT ALL ON public.config_acesso TO service_role;

ALTER TABLE public.config_acesso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth pode ler config" ON public.config_acesso
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "master/gerente edita config" ON public.config_acesso
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master','gerente')));

INSERT INTO public.config_acesso (id) VALUES (1) ON CONFLICT DO NOTHING;
