CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_corretor ON public.leads (corretor_id);
CREATE INDEX IF NOT EXISTS idx_leads_visibilidade ON public.leads (visibilidade);
CREATE INDEX IF NOT EXISTS idx_leads_empresa_created ON public.leads (empresa_id, created_at DESC);