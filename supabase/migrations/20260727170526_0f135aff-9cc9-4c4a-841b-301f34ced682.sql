
DELETE FROM public.lead_notas WHERE lead_id IN (
  SELECT id FROM public.leads WHERE telefone LIKE '%932368278%'
    AND id <> (SELECT id FROM public.leads WHERE telefone LIKE '%932368278%' ORDER BY created_at ASC LIMIT 1)
);
DELETE FROM public.fila_notificacoes WHERE lead_id IN (
  SELECT id FROM public.leads WHERE telefone LIKE '%932368278%'
    AND id <> (SELECT id FROM public.leads WHERE telefone LIKE '%932368278%' ORDER BY created_at ASC LIMIT 1)
);
DELETE FROM public.notificacoes WHERE lead_id IN (
  SELECT id FROM public.leads WHERE telefone LIKE '%932368278%'
    AND id <> (SELECT id FROM public.leads WHERE telefone LIKE '%932368278%' ORDER BY created_at ASC LIMIT 1)
);
DELETE FROM public.leads WHERE telefone LIKE '%932368278%'
  AND id <> (SELECT id FROM public.leads WHERE telefone LIKE '%932368278%' ORDER BY created_at ASC LIMIT 1);
