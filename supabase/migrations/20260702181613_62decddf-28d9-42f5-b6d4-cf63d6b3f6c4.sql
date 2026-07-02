
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.lead_estagio AS ENUM ('novo', 'em_contato', 'proposta', 'fechado', 'perdido');
CREATE TYPE public.compromisso_tipo AS ENUM ('visita', 'ligacao', 'reuniao');

-- ============ HELPER: updated_at ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT lower(coalesce((auth.jwt() ->> 'email')::text, '')) = 'samuelrodrigodeoliveira@gmail.com';
$$;

CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin_email());

-- Auto-grant admin role on user creation for the fixed admin email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) = 'samuelrodrigodeoliveira@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CONSULTORES ============
CREATE TABLE public.consultores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  numero_whatsapp text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem_rodizio integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultores TO authenticated;
GRANT ALL ON public.consultores TO service_role;
ALTER TABLE public.consultores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultores_admin_all" ON public.consultores FOR ALL TO authenticated
USING (public.is_admin_email()) WITH CHECK (public.is_admin_email());

CREATE TRIGGER trg_consultores_updated BEFORE UPDATE ON public.consultores
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enforce max 10 consultores
CREATE OR REPLACE FUNCTION public.enforce_consultores_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.consultores) >= 10 THEN
    RAISE EXCEPTION 'Limite de 10 consultores atingido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_consultores_limit BEFORE INSERT ON public.consultores
FOR EACH ROW EXECUTE FUNCTION public.enforce_consultores_limit();

-- ============ LEADS ============
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text NOT NULL,
  origem text NOT NULL DEFAULT 'Manual',
  estagio public.lead_estagio NOT NULL DEFAULT 'novo',
  interesse text,
  valor_estimado numeric(14,2),
  consultor_id uuid REFERENCES public.consultores(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Todos os usuários autenticados podem ver e gerenciar leads (CRM interno da equipe)
CREATE POLICY "leads_authenticated_all" ON public.leads FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_leads_estagio ON public.leads(estagio);
CREATE INDEX idx_leads_consultor ON public.leads(consultor_id);
CREATE INDEX idx_leads_created ON public.leads(created_at DESC);

-- ============ COMPROMISSOS ============
CREATE TABLE public.compromissos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo public.compromisso_tipo NOT NULL,
  titulo text NOT NULL,
  data_hora timestamptz NOT NULL,
  notas text,
  concluido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compromissos TO authenticated;
GRANT ALL ON public.compromissos TO service_role;
ALTER TABLE public.compromissos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compromissos_authenticated_all" ON public.compromissos FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX idx_compromissos_data ON public.compromissos(data_hora);

-- ============ RODIZIO ============
CREATE TABLE public.rodizio_estado (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ultimo_consultor_id uuid REFERENCES public.consultores(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rodizio_estado TO authenticated;
GRANT ALL ON public.rodizio_estado TO service_role;
ALTER TABLE public.rodizio_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rodizio_read_admin" ON public.rodizio_estado FOR SELECT TO authenticated
USING (public.is_admin_email());

INSERT INTO public.rodizio_estado (id, ultimo_consultor_id) VALUES (1, NULL);

-- Atômica: pega o próximo consultor ativo em ordem, sequencial
CREATE OR REPLACE FUNCTION public.escolher_proximo_consultor()
RETURNS public.consultores LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ultimo uuid;
  v_ultima_ordem integer;
  v_proximo public.consultores;
BEGIN
  -- Lock atômico da linha de estado
  SELECT ultimo_consultor_id INTO v_ultimo FROM public.rodizio_estado WHERE id = 1 FOR UPDATE;

  IF v_ultimo IS NULL THEN
    v_ultima_ordem := -1;
  ELSE
    SELECT ordem_rodizio INTO v_ultima_ordem FROM public.consultores WHERE id = v_ultimo;
    IF v_ultima_ordem IS NULL THEN v_ultima_ordem := -1; END IF;
  END IF;

  -- Próximo consultor ativo com ordem > última
  SELECT * INTO v_proximo FROM public.consultores
  WHERE ativo = true AND ordem_rodizio > v_ultima_ordem
  ORDER BY ordem_rodizio ASC, created_at ASC LIMIT 1;

  IF v_proximo.id IS NULL THEN
    -- Voltou ao início
    SELECT * INTO v_proximo FROM public.consultores
    WHERE ativo = true
    ORDER BY ordem_rodizio ASC, created_at ASC LIMIT 1;
  END IF;

  IF v_proximo.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.rodizio_estado SET ultimo_consultor_id = v_proximo.id, updated_at = now() WHERE id = 1;
  RETURN v_proximo;
END;
$$;
