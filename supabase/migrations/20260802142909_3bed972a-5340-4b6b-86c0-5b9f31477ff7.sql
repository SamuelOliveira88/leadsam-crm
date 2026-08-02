CREATE OR REPLACE FUNCTION public.setup_whatsapp_cron(p_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'webhook_lead_token';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_token, 'webhook_lead_token');
  ELSE
    PERFORM vault.update_secret(v_id, p_token, 'webhook_lead_token');
  END IF;

  BEGIN
    PERFORM cron.unschedule('process-whatsapp-queue');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM cron.schedule(
    'process-whatsapp-queue',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://alexandria-leds.lovable.app/api/public/hooks/processar-fila?limit=50',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'webhook_lead_token')
      ),
      body := '{}'::jsonb
    );
    $cron$
  );

  RETURN 'ok';
END;
$fn$;

REVOKE ALL ON FUNCTION public.setup_whatsapp_cron(text) FROM PUBLIC, anon, authenticated;