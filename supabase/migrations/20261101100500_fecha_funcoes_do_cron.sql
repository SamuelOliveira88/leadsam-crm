-- Funções que só o agendador (cron) deve chamar não ficam abertas para a chave pública do site.
-- O cron roda como dono do banco, então continua funcionando.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('reatribuir_leads_parados','reatribuir_leads_sem_visualizacao','liberar_leads_represados',
                         'liberar_leads_inativos_6d','distribuir_gota_planilha','mia_varrer')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.f);
  END LOOP;
END $$;
