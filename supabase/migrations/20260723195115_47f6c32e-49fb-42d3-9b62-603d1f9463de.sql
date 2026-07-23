ALTER TABLE public.grupos ADD COLUMN IF NOT EXISTS is_principal boolean NOT NULL DEFAULT false;
UPDATE public.grupos SET is_principal = true WHERE nome = 'leadsOn';