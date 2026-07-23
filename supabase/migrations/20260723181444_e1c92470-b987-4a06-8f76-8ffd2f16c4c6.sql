
UPDATE public.fila_notificacoes
SET status = 'ignorado'
WHERE status = 'pendente'
  AND lead_id NOT IN (
    SELECT id FROM public.leads
    WHERE grupo_id='10b02e8a-3ae0-40ad-b4d3-fe62396939ee'
      AND nome LIKE 'Teste %'
  );
