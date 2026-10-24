-- Aceite online do contrato de prestação de serviço (quem aceitou, quando, qual plano e versão).
CREATE TABLE IF NOT EXISTS public.aceites_contrato (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  plano      text NOT NULL,
  versao     text NOT NULL,
  dados      jsonb NOT NULL DEFAULT '{}'::jsonb,
  aceito_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aceites_contrato_empresa_idx ON public.aceites_contrato (empresa_id, aceito_em DESC);
ALTER TABLE public.aceites_contrato ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aceites_contrato FROM anon, authenticated;
GRANT SELECT, INSERT ON public.aceites_contrato TO authenticated;
GRANT ALL ON public.aceites_contrato TO service_role;
DROP POLICY IF EXISTS aceites_ver ON public.aceites_contrato;
CREATE POLICY aceites_ver ON public.aceites_contrato FOR SELECT TO authenticated
  USING (empresa_id = public.get_minha_empresa_id());
DROP POLICY IF EXISTS aceites_criar ON public.aceites_contrato;
CREATE POLICY aceites_criar ON public.aceites_contrato FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_minha_empresa_id() AND user_id = auth.uid());
