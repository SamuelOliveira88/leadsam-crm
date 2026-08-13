CREATE OR REPLACE FUNCTION public.escolher_corretor_online(p_grupo_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id
  FROM public.corretores c
  LEFT JOIN (
    SELECT corretor_id, max(created_at) AS ultimo
    FROM public.leads WHERE grupo_id = p_grupo_id GROUP BY corretor_id
  ) l ON l.corretor_id = c.id
  WHERE public.posso_operar_grupo(p_grupo_id)
    AND c.grupo_id = p_grupo_id
    AND c.ativo = true
    AND c.ultimo_ping IS NOT NULL
    AND c.ultimo_ping > now() - interval '3 minutes'
  ORDER BY l.ultimo NULLS FIRST, c.created_at ASC
  LIMIT 1;
$function$;

DROP POLICY IF EXISTS corretores_write_escopo ON public.corretores;

CREATE POLICY corretores_write_escopo ON public.corretores
FOR ALL
USING (
  public.tem_acesso_total()
  OR (
    empresa_id IS NOT NULL
    AND empresa_id = public.get_minha_empresa_id()
    AND (
      grupo_id IS NULL
      OR EXISTS (SELECT 1 FROM public.grupos g WHERE g.id = corretores.grupo_id AND g.empresa_id = public.get_minha_empresa_id())
    )
    AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR (
        (SELECT role FROM public.get_my_profile()) = 'gerente'
        AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL
        AND corretores.grupo_id IS NOT NULL
        AND (SELECT grupo_id FROM public.get_my_profile()) = corretores.grupo_id
      )
    )
  )
)
WITH CHECK (
  public.tem_acesso_total()
  OR (
    empresa_id IS NOT NULL
    AND empresa_id = public.get_minha_empresa_id()
    AND (
      grupo_id IS NULL
      OR EXISTS (SELECT 1 FROM public.grupos g WHERE g.id = corretores.grupo_id AND g.empresa_id = public.get_minha_empresa_id())
    )
    AND (
      (SELECT role FROM public.get_my_profile()) = 'master'
      OR (
        (SELECT role FROM public.get_my_profile()) = 'gerente'
        AND (SELECT grupo_id FROM public.get_my_profile()) IS NOT NULL
        AND corretores.grupo_id IS NOT NULL
        AND (SELECT grupo_id FROM public.get_my_profile()) = corretores.grupo_id
      )
    )
  )
);