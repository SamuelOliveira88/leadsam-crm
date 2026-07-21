CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text UNIQUE,
  plano text NOT NULL DEFAULT 'starter' CHECK (plano IN ('starter', 'pro', 'enterprise')),
  limite_corretores int,
  limite_leads_mes int,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

INSERT INTO public.empresas (nome, slug, plano, ativo)
VALUES ('Equipe Lavile', 'equipe-lavile', 'enterprise', true)
ON CONFLICT DO NOTHING;

ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.grupos ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.corretores ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.empreendimentos ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.horarios_atendimento ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.fila_notificacoes ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.campanhas_anuncios ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.config_acesso ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.lead_notas ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);

CREATE POLICY "empresas_read_propria" ON public.empresas
  FOR SELECT TO authenticated USING (
    id = (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_perfis_empresa ON public.perfis(empresa_id);
CREATE INDEX IF NOT EXISTS idx_grupos_empresa ON public.grupos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_corretores_empresa ON public.corretores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_leads_empresa ON public.leads(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empreendimentos_empresa ON public.empreendimentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_unidades_empresa ON public.unidades(empresa_id);

DO $$
DECLARE v_empresa_id uuid;
BEGIN
  SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = 'equipe-lavile';

  UPDATE public.perfis SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.grupos SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.corretores SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.leads SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.empreendimentos SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.unidades SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.horarios_atendimento SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.fila_notificacoes SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.campanhas_anuncios SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.config_acesso SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
  UPDATE public.lead_notas SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_grupo_id uuid;
  v_corretor_id uuid;
  v_empresa_id uuid;
  v_email text;
BEGIN
  v_email := lower(COALESCE(NEW.email, ''));
  SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = 'equipe-lavile';

  IF v_email IN ('samuelrodrigodeoliveira@gmail.com', 'equipelavile@hotmail.com', 'toni.boacasa@gmi.com', 'toni.boacasa@gmail.com') THEN
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

  INSERT INTO public.perfis (id, nome, role, grupo_id, corretor_id, empresa_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    v_role, v_grupo_id, v_corretor_id, v_empresa_id
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    grupo_id = COALESCE(public.perfis.grupo_id, EXCLUDED.grupo_id),
    corretor_id = COALESCE(public.perfis.corretor_id, EXCLUDED.corretor_id),
    empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id);

  RETURN NEW;
END; $$;