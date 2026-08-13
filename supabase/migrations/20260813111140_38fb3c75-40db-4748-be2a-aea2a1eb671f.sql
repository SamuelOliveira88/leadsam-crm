ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS visibilidade text NOT NULL DEFAULT 'equipe',
  ADD COLUMN IF NOT EXISTS criado_por uuid DEFAULT auth.uid();

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_visibilidade_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_visibilidade_check CHECK (visibilidade IN ('equipe','privado'));

CREATE INDEX IF NOT EXISTS idx_leads_criado_por ON public.leads(criado_por);

DROP POLICY IF EXISTS leads_read_escopo ON public.leads;
CREATE POLICY leads_read_escopo ON public.leads
FOR SELECT TO authenticated
USING (
  CASE WHEN visibilidade = 'privado' THEN criado_por = auth.uid()
  ELSE (
    pode_dar_suporte() OR (
      empresa_id = get_minha_empresa_id() AND (
        (SELECT role FROM get_my_profile()) = 'master' OR
        ((SELECT role FROM get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM get_my_profile()) = grupo_id) OR
        ((SELECT role FROM get_my_profile()) = 'corretor' AND corretor_id = get_meu_corretor_id())
      )
    )
  ) END
);

DROP POLICY IF EXISTS leads_write_master_gerente ON public.leads;
CREATE POLICY leads_write_master_gerente ON public.leads
FOR ALL TO authenticated
USING (
  CASE WHEN visibilidade = 'privado' THEN criado_por = auth.uid()
  ELSE (
    pode_dar_suporte() OR (
      empresa_id = get_minha_empresa_id() AND (
        (SELECT role FROM get_my_profile()) = 'master' OR
        ((SELECT role FROM get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM get_my_profile()) = grupo_id)
      )
    )
  ) END
)
WITH CHECK (
  CASE WHEN visibilidade = 'privado' THEN criado_por = auth.uid()
  ELSE (
    pode_dar_suporte() OR (
      empresa_id = get_minha_empresa_id() AND (
        (SELECT role FROM get_my_profile()) = 'master' OR
        ((SELECT role FROM get_my_profile()) = 'gerente' AND (SELECT grupo_id FROM get_my_profile()) = grupo_id)
      )
    )
  ) END
);

DROP POLICY IF EXISTS leads_update_corretor ON public.leads;
CREATE POLICY leads_update_corretor ON public.leads
FOR UPDATE TO authenticated
USING (
  visibilidade <> 'privado'
  AND empresa_id = get_minha_empresa_id()
  AND (SELECT role FROM get_my_profile()) = 'corretor'
  AND corretor_id = get_meu_corretor_id()
)
WITH CHECK (
  visibilidade <> 'privado'
  AND empresa_id = get_minha_empresa_id()
  AND (SELECT role FROM get_my_profile()) = 'corretor'
  AND corretor_id = get_meu_corretor_id()
);

CREATE TABLE IF NOT EXISTS public.notas_pessoais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id),
  criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  conteudo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_pessoais TO authenticated;
GRANT ALL ON public.notas_pessoais TO service_role;

ALTER TABLE public.notas_pessoais ENABLE ROW LEVEL SECURITY;

CREATE POLICY notas_pessoais_owner_only ON public.notas_pessoais
FOR ALL TO authenticated
USING (criado_por = auth.uid())
WITH CHECK (criado_por = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notas_pessoais_criado_por ON public.notas_pessoais(criado_por);

CREATE OR REPLACE FUNCTION public.notas_pessoais_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_notas_pessoais_touch ON public.notas_pessoais;
CREATE TRIGGER trg_notas_pessoais_touch BEFORE UPDATE ON public.notas_pessoais
FOR EACH ROW EXECUTE FUNCTION public.notas_pessoais_touch();