
WITH ativos AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn, COUNT(*) OVER () AS total
  FROM public.corretores
  WHERE grupo_id='10b02e8a-3ae0-40ad-b4d3-fe62396939ee' AND ativo=true
),
represados AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
  FROM public.leads
  WHERE grupo_id='10b02e8a-3ae0-40ad-b4d3-fe62396939ee' AND status='represado'
)
UPDATE public.leads l
SET corretor_id = a.id,
    status = 'distribuido',
    represado_em = NULL
FROM represados r
JOIN ativos a ON a.rn = ((r.rn - 1) % (SELECT total FROM ativos LIMIT 1)) + 1
WHERE l.id = r.id;
