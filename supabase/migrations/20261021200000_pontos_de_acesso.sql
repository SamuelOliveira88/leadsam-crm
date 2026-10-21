-- Pontos de acesso: até 10 por imobiliária, com nome editável, métodos de login
-- (localização/GPS e/ou IP fixo) e um QR FIXO por ponto.
-- Evolui a tabela locais_checkin. Nada do que existe deixa de funcionar:
-- os locais atuais continuam valendo (GPS ligado, IP desligado).

-- ============ 1) COLUNAS NOVAS ============
ALTER TABLE public.locais_checkin ADD COLUMN IF NOT EXISTS usa_gps boolean NOT NULL DEFAULT true;
ALTER TABLE public.locais_checkin ADD COLUMN IF NOT EXISTS usa_ip boolean NOT NULL DEFAULT false;
ALTER TABLE public.locais_checkin ADD COLUMN IF NOT EXISTS ip_fixo text;
-- Código do QR: gerado uma vez e nunca muda (só a função regerar_qr_local troca, a pedido do master).
ALTER TABLE public.locais_checkin ADD COLUMN IF NOT EXISTS qr_codigo text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS locais_checkin_qr_codigo_key ON public.locais_checkin (qr_codigo);

-- Um ponto só de IP não tem coordenadas.
ALTER TABLE public.locais_checkin ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE public.locais_checkin ALTER COLUMN longitude DROP NOT NULL;

ALTER TABLE public.locais_checkin DROP CONSTRAINT IF EXISTS locais_checkin_metodo_chk;
ALTER TABLE public.locais_checkin ADD CONSTRAINT locais_checkin_metodo_chk CHECK (
  (usa_gps OR usa_ip)
  AND (NOT usa_gps OR (latitude IS NOT NULL AND longitude IS NOT NULL))
  AND (NOT usa_ip OR ip_fixo IS NOT NULL)
);
ALTER TABLE public.locais_checkin DROP CONSTRAINT IF EXISTS locais_checkin_ip_chk;
ALTER TABLE public.locais_checkin ADD CONSTRAINT locais_checkin_ip_chk CHECK (
  ip_fixo IS NULL OR ip_fixo ~ '^[0-9a-fA-F:.]{3,45}$'
);

-- Registros de presença: ponto só de IP não tem coordenadas; guarda o IP e o método usado.
ALTER TABLE public.checkins ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE public.checkins ALTER COLUMN longitude DROP NOT NULL;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS metodo text;

-- ============ 2) LIMITE DE 10 PONTOS POR IMOBILIÁRIA ============
CREATE OR REPLACE FUNCTION public.limitar_pontos_por_empresa()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.locais_checkin WHERE empresa_id = NEW.empresa_id) >= 10 THEN
    RAISE EXCEPTION 'Cada imobiliária pode ter no máximo 10 pontos de acesso.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_limite_pontos ON public.locais_checkin;
-- O nome começa depois de trg_empresa_id, então roda depois de preencher a empresa.
CREATE TRIGGER trg_limite_pontos BEFORE INSERT ON public.locais_checkin
  FOR EACH ROW EXECUTE FUNCTION public.limitar_pontos_por_empresa();

-- ============ 3) QR FIXO: ninguém altera o código por UPDATE ============
CREATE OR REPLACE FUNCTION public.proteger_qr_codigo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.qr_codigo IS DISTINCT FROM OLD.qr_codigo
     AND COALESCE(current_setting('app.regerar_qr', true), '') <> 'on' THEN
    RAISE EXCEPTION 'O código do QR é fixo e não pode ser alterado.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_qr ON public.locais_checkin;
CREATE TRIGGER trg_proteger_qr BEFORE UPDATE ON public.locais_checkin
  FOR EACH ROW EXECUTE FUNCTION public.proteger_qr_codigo();

-- Troca o QR de um ponto. Só o master da empresa (ou o super admin) e só de propósito.
CREATE OR REPLACE FUNCTION public.regerar_qr_local(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid;
  v_novo text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  SELECT empresa_id INTO v_empresa FROM public.locais_checkin WHERE id = p_id;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'Ponto não encontrado.'; END IF;
  IF NOT (
    public.sou_super_admin() OR EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid() AND p.role = 'master' AND p.empresa_id = v_empresa)
  ) THEN
    RAISE EXCEPTION 'Apenas o master pode gerar um QR novo.';
  END IF;
  PERFORM set_config('app.regerar_qr', 'on', true);
  UPDATE public.locais_checkin SET qr_codigo = v_novo WHERE id = p_id;
  PERFORM set_config('app.regerar_qr', 'off', true);
  RETURN v_novo;
END $$;
REVOKE ALL ON FUNCTION public.regerar_qr_local(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regerar_qr_local(uuid) TO authenticated;

-- ============ 4) CHECK-IN "NO MAIS PERTO" SÓ CONSIDERA PONTOS COM GPS ============
-- Igual à função anterior; a única mudança é o filtro "AND l.usa_gps" no ponto mais próximo.
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
   WHERE l.empresa_id = v_perfil.empresa_id AND l.ativo AND l.usa_gps AND l.latitude IS NOT NULL
   ORDER BY dist
   LIMIT 1;
  v_achou := FOUND;

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
    local_id, local_nome, latitude, longitude, precisao_metros, distancia_metros, dentro_do_raio, metodo
  ) VALUES (
    v_perfil.empresa_id, auth.uid(), v_perfil.nome, v_perfil.corretor_id, v_perfil.grupo_id, p_tipo,
    CASE WHEN v_achou THEN v_local.id END, CASE WHEN v_achou THEN v_local.nome END,
    p_latitude, p_longitude, v_prec,
    CASE WHEN v_achou THEN round(v_local.dist::numeric, 1)::double precision END,
    v_dentro, 'gps'
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

-- ============ 5) CHECK-IN PELO QR DE UM PONTO ============
-- Só o servidor do app chama (service_role): o IP só o servidor conhece, então quem confere
-- o IP é o app, e esta função confere o resto. Quem tentar chamar direto do navegador não consegue.
CREATE OR REPLACE FUNCTION public.registrar_checkin_ponto(
  p_usuario_id uuid,
  p_local_id uuid,
  p_ip text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_precisao_metros double precision DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_perfil record;
  v_local record;
  v_prec double precision;
  v_dist double precision;
  v_dentro boolean;
  v_metodo text;
  v_id uuid;
  v_criado timestamptz;
BEGIN
  SELECT p.nome, p.empresa_id, p.grupo_id, p.corretor_id INTO v_perfil
    FROM public.perfis p WHERE p.id = p_usuario_id;
  IF v_perfil.empresa_id IS NULL THEN RAISE EXCEPTION 'Seu perfil não está ligado a uma empresa.'; END IF;

  SELECT * INTO v_local FROM public.locais_checkin WHERE id = p_local_id;
  IF NOT FOUND OR v_local.empresa_id <> v_perfil.empresa_id THEN
    RAISE EXCEPTION 'Ponto não encontrado.';
  END IF;
  IF NOT v_local.ativo THEN RAISE EXCEPTION 'Este ponto está desativado.'; END IF;

  v_prec := LEAST(GREATEST(COALESCE(p_precisao_metros, 0), 0), 100000);

  IF v_local.usa_ip THEN
    IF p_ip IS NULL OR lower(btrim(p_ip)) <> lower(btrim(v_local.ip_fixo)) THEN
      RAISE EXCEPTION 'Você precisa estar na internet do ponto "%" para fazer o check-in.', v_local.nome;
    END IF;
  END IF;

  IF v_local.usa_gps THEN
    IF p_latitude IS NULL OR p_longitude IS NULL
       OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
      RAISE EXCEPTION 'Ative a localização do aparelho para fazer o check-in neste ponto.';
    END IF;
    IF v_prec > 500 THEN
      RAISE EXCEPTION 'O sinal de GPS está fraco (erro de % m). Vá para um lugar aberto e tente de novo.', round(v_prec);
    END IF;
    v_dist := public.distancia_metros(p_latitude, p_longitude, v_local.latitude, v_local.longitude);
    v_dentro := v_dist - LEAST(v_prec, v_local.raio_metros) <= v_local.raio_metros;
    IF NOT v_dentro THEN
      RAISE EXCEPTION 'Você está a % m do ponto "%". Chegue mais perto para fazer o check-in.', round(v_dist), v_local.nome;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.checkins c
     WHERE c.usuario_id = p_usuario_id AND c.tipo = 'checkin' AND c.created_at > now() - interval '2 minutes'
  ) THEN
    RAISE EXCEPTION 'Você acabou de fazer check-in. Aguarde alguns minutos para repetir.';
  END IF;

  v_metodo := CASE WHEN v_local.usa_gps AND v_local.usa_ip THEN 'gps+ip'
                   WHEN v_local.usa_ip THEN 'ip' ELSE 'gps' END;

  INSERT INTO public.checkins (
    empresa_id, usuario_id, usuario_nome, corretor_id, grupo_id, tipo,
    local_id, local_nome, latitude, longitude, precisao_metros, distancia_metros, dentro_do_raio, ip, metodo
  ) VALUES (
    v_perfil.empresa_id, p_usuario_id, v_perfil.nome, v_perfil.corretor_id, v_perfil.grupo_id, 'checkin',
    v_local.id, v_local.nome,
    CASE WHEN v_local.usa_gps THEN p_latitude END, CASE WHEN v_local.usa_gps THEN p_longitude END,
    CASE WHEN v_local.usa_gps THEN v_prec END,
    CASE WHEN v_local.usa_gps THEN round(v_dist::numeric, 1)::double precision END,
    CASE WHEN v_local.usa_gps THEN v_dentro ELSE true END,
    p_ip, v_metodo
  ) RETURNING id, created_at INTO v_id, v_criado;

  RETURN jsonb_build_object(
    'id', v_id,
    'tipo', 'checkin',
    'dentro', true,
    'distancia_metros', CASE WHEN v_local.usa_gps THEN round(v_dist::numeric, 1) END,
    'local_nome', v_local.nome,
    'metodo', v_metodo,
    'created_at', v_criado
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_checkin_ponto(uuid, uuid, text, double precision, double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_checkin_ponto(uuid, uuid, text, double precision, double precision, double precision) TO service_role;
