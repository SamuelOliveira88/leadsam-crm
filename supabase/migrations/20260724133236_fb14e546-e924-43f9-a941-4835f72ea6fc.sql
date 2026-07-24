CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

DO $$ BEGIN
  PERFORM cron.unschedule('process-whatsapp-queue');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'process-whatsapp-queue',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://alexandria-leds.lovable.app/api/public/hooks/processar-fila?limit=30',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);