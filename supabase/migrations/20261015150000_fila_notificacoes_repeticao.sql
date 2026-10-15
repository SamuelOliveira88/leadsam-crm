-- Fila de avisos de WhatsApp: repetição automática e motivo do erro.
ALTER TABLE public.fila_notificacoes
  ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proxima_tentativa timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ultimo_erro text;

CREATE INDEX IF NOT EXISTS idx_fila_notificacoes_pendentes
  ON public.fila_notificacoes (proxima_tentativa)
  WHERE status = 'pendente';
