
ALTER TABLE public.corretores ADD COLUMN IF NOT EXISTS ultimo_ping timestamptz;

CREATE OR REPLACE FUNCTION public.corretor_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.corretores SET ultimo_ping = now() WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.corretor_heartbeat() TO authenticated;

CREATE OR REPLACE FUNCTION public.escolher_corretor_online(p_grupo_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.corretores c
  LEFT JOIN (
    SELECT corretor_id, max(created_at) AS ultimo
    FROM public.leads WHERE grupo_id = p_grupo_id GROUP BY corretor_id
  ) l ON l.corretor_id = c.id
  WHERE c.grupo_id = p_grupo_id
    AND c.ativo = true
    AND c.ultimo_ping IS NOT NULL
    AND c.ultimo_ping > now() - interval '3 minutes'
  ORDER BY l.ultimo NULLS FIRST, c.created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.escolher_corretor_online(uuid) TO authenticated;
