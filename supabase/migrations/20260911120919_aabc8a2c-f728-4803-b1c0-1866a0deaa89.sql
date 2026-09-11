ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS empreendimento_interesse text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ultimo_contato timestamptz;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY['distribuido'::text,'represado'::text,'frio'::text,'contatado_reativacao'::text]));
CREATE INDEX IF NOT EXISTS idx_leads_reativacao ON public.leads (empresa_id, status) WHERE opt_out = false;