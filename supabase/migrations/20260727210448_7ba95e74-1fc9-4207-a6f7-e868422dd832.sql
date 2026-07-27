
CREATE TABLE IF NOT EXISTS public.notif_pausa (
  id integer PRIMARY KEY DEFAULT 1,
  pausada_ate timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notif_pausa_singleton CHECK (id = 1)
);
GRANT SELECT ON public.notif_pausa TO authenticated, anon;
GRANT ALL ON public.notif_pausa TO service_role;
ALTER TABLE public.notif_pausa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_pausa_read_all" ON public.notif_pausa FOR SELECT USING (true);

INSERT INTO public.notif_pausa (id, pausada_ate)
VALUES (1, ((date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo')) + interval '1 day' + interval '8 hours') AT TIME ZONE 'America/Sao_Paulo'))
ON CONFLICT (id) DO UPDATE SET pausada_ate = EXCLUDED.pausada_ate, updated_at = now();

UPDATE public.fila_notificacoes SET status = 'cancelado' WHERE status = 'pendente';
