-- Geolocalização: locais de plantão (raio) e registros de check-in/login.
-- O check-in só é gravado pela função registrar_checkin, que calcula a distância no
-- servidor (o aparelho não decide se está "dentro").

-- Distância em metros entre dois pontos (Haversine).
CREATE OR REPLACE FUNCTION public.distancia_metros(
  lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

-- ============ LOCAIS DE PLANTÃO ============
CREATE TABLE IF NOT EXISTS public.locais_checkin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 80),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  raio_metros integer NOT NULL DEFAULT 150 CHECK (raio_metros BETWEEN 20 AND 5000),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_locais_checkin_empresa ON public.locais_checkin(empresa_id) WHERE ativo;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locais_checkin TO authenticated;
GRANT ALL ON public.locais_checkin TO service_role;
ALTER TABLE public.locais_checkin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS locais_checkin_select ON public.locais_checkin;
CREATE POLICY locais_checkin_select ON public.locais_checkin FOR SELECT TO authenticated
USING (public.sou_super_admin() OR empresa_id = public.get_minha_empresa_id());

DROP POLICY IF EXISTS locais_checkin_write ON public.locais_checkin;
CREATE POLICY locais_checkin_write ON public.locais_checkin FOR ALL TO authenticated
USING (
  public.sou_super_admin() OR EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = auth.uid() AND p.role = 'master' AND p.empresa_id = locais_checkin.empresa_id)
)
WITH CHECK (
  public.sou_super_admin() OR EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = auth.uid() AND p.role = 'master' AND p.empresa_id = locais_checkin.empresa_id)
);

DROP TRIGGER IF EXISTS trg_empresa_id ON public.locais_checkin;
CREATE TRIGGER trg_empresa_id BEFORE INSERT ON public.locais_checkin
  FOR EACH ROW EXECUTE FUNCTION public.preencher_empresa_id();

-- ============ CHECK-INS E LOGINS ============
CREATE TABLE IF NOT EXISTS public.checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL,
  usuario_nome text,
  corretor_id uuid,
  grupo_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('login', 'checkin')),
  local_id uuid REFERENCES public.locais_checkin(id) ON DELETE SET NULL,
  local_nome text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  precisao_metros double precision,
  distancia_metros double precision,
  dentro_do_raio boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checkins_empresa_data ON public.checkins(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_usuario_data ON public.checkins(usuario_id, created_at DESC);

-- Só leitura para o app. Ninguém grava nem apaga direto: a escrita passa por registrar_checkin.
GRANT SELECT ON public.checkins TO authenticated;
GRANT ALL ON public.checkins TO service_role;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checkins_select ON public.checkins;
CREATE POLICY checkins_select ON public.checkins FOR SELECT TO authenticated
USING (
  public.sou_super_admin()
  OR usuario_id = auth.uid()
  OR (
    empresa_id = public.get_minha_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid()
        AND (p.role = 'master' OR (p.role = 'gerente' AND p.grupo_id IS NOT NULL AND p.grupo_id = checkins.grupo_id))
    )
  )
);

-- ============ REGISTRAR ============
CREATE OR REPLACE FUNCTION public.registrar_checkin(
  p_tipo text,
  p_latitude double precision,
  p_longitude double precision,
  p_precisao_metros double precision DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_perfil record;
  v_local record;
  v_achou boolean;
  v_prec double precision;
  v_dentro boolean;
  v_dist_txt text;
  v_id uuid;
  v_criado timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para continuar.'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('login', 'checkin') THEN RAISE EXCEPTION 'Tipo de registro inválido.'; END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Localização inválida.';
  END IF;

  SELECT p.nome, p.empresa_id, p.grupo_id, p.corretor_id INTO v_perfil
    FROM public.perfis p WHERE p.id = auth.uid();
  IF v_perfil.empresa_id IS NULL THEN RAISE EXCEPTION 'Seu perfil não está ligado a uma empresa.'; END IF;

  v_prec := LEAST(GREATEST(COALESCE(p_precisao_metros, 0), 0), 100000);

  SELECT l.id, l.nome, l.raio_metros,
         public.distancia_metros(p_latitude, p_longitude, l.latitude, l.longitude) AS dist
    INTO v_local
    FROM public.locais_checkin l
   WHERE l.empresa_id = v_perfil.empresa_id AND l.ativo
   ORDER BY dist
   LIMIT 1;
  v_achou := FOUND;

  -- Mesma regra do aparelho: a imprecisão do GPS joga a favor de quem está no local.
  v_dentro := CASE WHEN v_achou
                   THEN v_local.dist - LEAST(v_prec, v_local.raio_metros) <= v_local.raio_metros
                   ELSE NULL END;

  IF p_tipo = 'checkin' THEN
    IF NOT v_achou THEN
      RAISE EXCEPTION 'Sua imobiliária ainda não cadastrou o local do plantão. Peça ao master para cadastrar.';
    END IF;
    IF v_prec > 500 THEN
      RAISE EXCEPTION 'O sinal de GPS está fraco (erro de % m). Vá para um lugar aberto e tente de novo.', round(v_prec);
    END IF;
    IF NOT v_dentro THEN
      v_dist_txt := CASE WHEN v_local.dist < 1000
                         THEN round(v_local.dist)::text || ' m'
                         ELSE replace(to_char(v_local.dist / 1000, 'FM999990.0'), '.', ',') || ' km' END;
      RAISE EXCEPTION 'Você está a % do local "%". Chegue mais perto para fazer o check-in.', v_dist_txt, v_local.nome;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.checkins c
       WHERE c.usuario_id = auth.uid() AND c.tipo = 'checkin' AND c.created_at > now() - interval '2 minutes'
    ) THEN
      RAISE EXCEPTION 'Você acabou de fazer check-in. Aguarde alguns minutos para repetir.';
    END IF;
  END IF;

  INSERT INTO public.checkins (
    empresa_id, usuario_id, usuario_nome, corretor_id, grupo_id, tipo,
    local_id, local_nome, latitude, longitude, precisao_metros, distancia_metros, dentro_do_raio
  ) VALUES (
    v_perfil.empresa_id, auth.uid(), v_perfil.nome, v_perfil.corretor_id, v_perfil.grupo_id, p_tipo,
    CASE WHEN v_achou THEN v_local.id END, CASE WHEN v_achou THEN v_local.nome END,
    p_latitude, p_longitude, v_prec,
    CASE WHEN v_achou THEN round(v_local.dist::numeric, 1)::double precision END,
    v_dentro
  ) RETURNING id, created_at INTO v_id, v_criado;

  RETURN jsonb_build_object(
    'id', v_id,
    'tipo', p_tipo,
    'dentro', v_dentro,
    'distancia_metros', CASE WHEN v_achou THEN round(v_local.dist::numeric, 1) END,
    'local_nome', CASE WHEN v_achou THEN v_local.nome END,
    'created_at', v_criado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_checkin(text, double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_checkin(text, double precision, double precision, double precision) TO authenticated;
