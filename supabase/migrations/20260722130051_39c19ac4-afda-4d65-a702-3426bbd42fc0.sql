ALTER TABLE public.grupos
  ADD COLUMN IF NOT EXISTS whatsapp_distribuicao text,
  ADD COLUMN IF NOT EXISTS whatsapp_importacao text;