-- Caixa de saída do WhatsApp (modo "relé").
-- Em vez de o servidor do app bater no Evolution pela internet (caminho que quebra quando o
-- endereço do túnel muda), o app grava a mensagem aqui e o n8n do computador do dono busca
-- a cada minuto e envia pelo Evolution local. Só o n8n precisa saber o segredo.

CREATE TABLE IF NOT EXISTS public.relay_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ativo boolean NOT NULL DEFAULT false,
  segredo_hash text
);
INSERT INTO public.relay_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.relay_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.relay_config FROM anon, authenticated;
GRANT ALL ON public.relay_config TO service_role;

CREATE TABLE IF NOT EXISTS public.envios_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia text,
  numero text NOT NULL,
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro')),
  tentativas integer NOT NULL DEFAULT 0,
  proxima_tentativa timestamptz NOT NULL DEFAULT now(),
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz
);
CREATE INDEX IF NOT EXISTS idx_envios_whatsapp_pendentes
  ON public.envios_whatsapp (proxima_tentativa) WHERE status = 'pendente';
ALTER TABLE public.envios_whatsapp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.envios_whatsapp FROM anon, authenticated;
GRANT ALL ON public.envios_whatsapp TO service_role;

CREATE OR REPLACE FUNCTION public.relay_segredo_ok(p_segredo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.segredo_hash IS NOT NULL
        AND p_segredo IS NOT NULL
        AND length(p_segredo) >= 24
        AND c.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex')
       FROM public.relay_config c WHERE c.id = 1),
    false)
$$;
REVOKE ALL ON FUNCTION public.relay_segredo_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relay_segredo_ok(text) TO service_role;

-- O n8n pega até p_limite mensagens. Cada uma fica "reservada" por 3 min para duas
-- execuções simultâneas não enviarem em dobro.
CREATE OR REPLACE FUNCTION public.relay_pegar_envios(p_segredo text, p_limite integer DEFAULT 10)
RETURNS TABLE (id uuid, instancia text, numero text, mensagem text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.relay_segredo_ok(p_segredo) THEN
    RAISE EXCEPTION 'nao autorizado';
  END IF;
  RETURN QUERY
  WITH sel AS (
    SELECT e.id FROM public.envios_whatsapp e
     WHERE e.status = 'pendente' AND e.proxima_tentativa <= now()
     ORDER BY e.created_at
     LIMIT LEAST(GREATEST(COALESCE(p_limite, 10), 1), 20)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.envios_whatsapp x
     SET proxima_tentativa = now() + interval '3 minutes'
    FROM sel
   WHERE x.id = sel.id
  RETURNING x.id, x.instancia, x.numero, x.mensagem;
END;
$$;

-- O n8n conta o que aconteceu. Falha passageira: tenta de novo (1, 2, 5, 10, 20, 30 min).
-- Falha definitiva, 6 falhas ou mais de 12 h de espera: desiste e marca como erro.
CREATE OR REPLACE FUNCTION public.relay_confirmar(
  p_segredo text, p_id uuid, p_ok boolean, p_erro text DEFAULT NULL, p_permanente boolean DEFAULT false
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v record;
  v_novas integer;
  v_espera integer[] := ARRAY[1, 2, 5, 10, 20, 30];
BEGIN
  IF NOT public.relay_segredo_ok(p_segredo) THEN
    RAISE EXCEPTION 'nao autorizado';
  END IF;
  SELECT e.tentativas, e.created_at INTO v FROM public.envios_whatsapp e WHERE e.id = p_id;
  IF NOT FOUND THEN RETURN 'nao_encontrado'; END IF;

  IF p_ok THEN
    UPDATE public.envios_whatsapp SET status = 'enviado', enviado_em = now(), ultimo_erro = NULL WHERE id = p_id;
    RETURN 'enviado';
  END IF;

  v_novas := v.tentativas + 1;
  IF p_permanente OR v_novas >= 6 OR v.created_at < now() - interval '12 hours' THEN
    UPDATE public.envios_whatsapp
       SET status = 'erro', tentativas = v_novas, ultimo_erro = left(COALESCE(p_erro, 'Falha ao enviar'), 300)
     WHERE id = p_id;
    RETURN 'erro';
  END IF;
  UPDATE public.envios_whatsapp
     SET tentativas = v_novas,
         proxima_tentativa = now() + make_interval(mins => v_espera[LEAST(v.tentativas + 1, 6)]),
         ultimo_erro = left(COALESCE(p_erro, 'Falha ao enviar'), 300)
   WHERE id = p_id;
  RETURN 'tentar_de_novo';
END;
$$;

REVOKE ALL ON FUNCTION public.relay_pegar_envios(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.relay_confirmar(text, uuid, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relay_pegar_envios(text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.relay_confirmar(text, uuid, boolean, text, boolean) TO anon, authenticated, service_role;
