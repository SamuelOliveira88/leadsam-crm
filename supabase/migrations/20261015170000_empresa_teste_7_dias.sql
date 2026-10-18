-- Teste de 7 dias por imobiliária (empresa).
-- Não mexe em RLS, tokens, funil ou geolocalização: só acrescenta status/validade e uma função de checagem.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS teste_ate timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empresas_status_check'
  ) THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT empresas_status_check
      CHECK (status IN ('teste', 'ativa', 'em_atraso', 'suspensa'));
  END IF;
END $$;

-- true  = empresa pode usar o sistema e receber leads
-- false = suspensa, ou em teste com o prazo vencido
CREATE OR REPLACE FUNCTION public.empresa_liberada(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT NOT (
       e.status = 'suspensa'
       OR (e.status = 'teste' AND e.teste_ate IS NOT NULL AND e.teste_ate < now())
     )
     FROM public.empresas e
     WHERE e.id = p_empresa_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.empresa_liberada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empresa_liberada(uuid) TO authenticated, service_role;

-- Rotina diária (03:00 de Brasília = 06:00 UTC): suspende testes vencidos.
-- Se a extensão pg_cron não estiver disponível, a migration segue normalmente:
-- a função empresa_liberada() já bloqueia o teste vencido em tempo real.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule('suspender-testes-vencidos')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'suspender-testes-vencidos');
  PERFORM cron.schedule(
    'suspender-testes-vencidos',
    '0 6 * * *',
    $job$UPDATE public.empresas SET status = 'suspensa' WHERE status = 'teste' AND teste_ate < now()$job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível, rotina diária não criada: %', SQLERRM;
END $$;
