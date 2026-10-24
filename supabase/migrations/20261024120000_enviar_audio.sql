-- Enviar áudio pelo Alexandria (gravador na tela Conversas).
-- O áudio (até ~1 MB em base64) fica na própria mensagem; o relé entrega ao n8n, que manda pela Evolution.
-- Regras: só para quem já escreveu para o número mãe (evita spam e bloqueio do número).

ALTER TABLE public.lead_mensagens
  ADD COLUMN IF NOT EXISTS audio_dados text,
  ADD COLUMN IF NOT EXISTS audio_mimetype text;
ALTER TABLE public.envios_whatsapp
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto','audio')),
  ADD COLUMN IF NOT EXISTS mensagem_id uuid;

CREATE OR REPLACE FUNCTION public.lead_mensagens_antes_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fonte text; v_corr uuid; v_ja_escreveu boolean; v_hoje timestamptz; v_n int; v_ja_hoje boolean; v_enviadas int;
  c_max_por_lead constant int := 5;
  c_limite_dia   constant int := 20;
BEGIN
  IF auth.uid() IS NULL OR NEW.direcao <> 'saida' THEN RETURN NEW; END IF; -- entrada vem da função do servidor
  IF NEW.midia_tipo = 'audio' THEN
    IF coalesce(NEW.audio_dados, '') = '' OR length(NEW.audio_dados) > 1500000 THEN
      RAISE EXCEPTION 'Áudio vazio ou grande demais (máximo 2 minutos).';
    END IF;
    IF coalesce(NEW.audio_mimetype, '') !~ '^audio/' THEN RAISE EXCEPTION 'Formato de áudio inválido.'; END IF;
    NEW.texto := '🎤 Áudio';
  ELSIF coalesce(btrim(NEW.texto), '') = '' THEN
    RAISE EXCEPTION 'mensagem vazia';
  END IF;
  SELECT l.empresa_id, l.fonte INTO NEW.empresa_id, v_fonte FROM public.leads l WHERE l.id = NEW.lead_id;
  IF EXISTS (SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND coalesce(l.opt_out, false)) THEN
    RAISE EXCEPTION 'Este contato pediu para não receber mensagens.';
  END IF;
  v_corr := public.get_meu_corretor_id();   -- nulo se quem responde é gerente/master
  v_ja_escreveu := EXISTS (SELECT 1 FROM public.lead_mensagens m WHERE m.lead_id = NEW.lead_id AND m.direcao = 'entrada');

  IF NOT v_ja_escreveu THEN
    IF NEW.midia_tipo = 'audio' THEN
      RAISE EXCEPTION 'Áudio só pode ser enviado a quem já respondeu.';
    END IF;
    IF v_fonte IS DISTINCT FROM 'planilha_samuelimob' THEN
      RAISE EXCEPTION 'Só é possível responder quem já escreveu para o número mãe.';
    END IF;
    SELECT count(*) INTO v_enviadas FROM public.lead_mensagens m WHERE m.lead_id = NEW.lead_id AND m.direcao = 'saida';
    IF v_enviadas >= c_max_por_lead THEN
      RAISE EXCEPTION 'Limite de % mensagens para quem ainda não respondeu. Aguarde o cliente responder.', c_max_por_lead;
    END IF;
    v_hoje := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
    -- leads novos contatados hoje por este corretor (um lead conta uma vez, não importa quantas mensagens)
    SELECT count(DISTINCT m.lead_id) INTO v_n
      FROM public.lead_mensagens m
     WHERE m.direcao = 'saida' AND m.created_at >= v_hoje
       AND m.corretor_id IS NOT DISTINCT FROM v_corr
       AND m.empresa_id = NEW.empresa_id
       AND m.lead_id <> NEW.lead_id
       AND NOT EXISTS (SELECT 1 FROM public.lead_mensagens e WHERE e.lead_id = m.lead_id AND e.direcao = 'entrada');
    v_ja_hoje := EXISTS (SELECT 1 FROM public.lead_mensagens m
                          WHERE m.lead_id = NEW.lead_id AND m.direcao = 'saida' AND m.created_at >= v_hoje
                            AND m.corretor_id IS NOT DISTINCT FROM v_corr);
    IF NOT v_ja_hoje AND v_n >= c_limite_dia THEN
      RAISE EXCEPTION 'Limite de % contatos novos por dia atingido. Continue amanhã ou responda quem já escreveu.', c_limite_dia;
    END IF;
  END IF;

  NEW.corretor_id := v_corr;
  NEW.status      := 'pendente';
  NEW.wa_msg_id   := NULL;
  NEW.envio_id    := NULL;
  NEW.midia_url   := NULL;
  IF NEW.midia_tipo IS DISTINCT FROM 'audio' THEN
    NEW.midia_tipo := NULL; NEW.audio_dados := NULL; NEW.audio_mimetype := NULL;
  END IF;
  RETURN NEW;
END $$;

-- Saída: texto como antes; áudio vai para a fila com tipo 'audio' (sem assinatura de texto).
CREATE OR REPLACE FUNCTION public.lead_mensagens_depois_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lead record; v_inst text; v_envio uuid; v_quem text; v_destino text;
BEGIN
  IF NEW.direcao <> 'saida' OR NEW.status <> 'pendente' THEN RETURN NEW; END IF;
  SELECT l.telefone, l.grupo_id, l.empresa_id, l.wa_lid INTO v_lead FROM public.leads l WHERE l.id = NEW.lead_id;
  SELECT i.instancia INTO v_inst FROM public.instancias_whatsapp i
   WHERE i.empresa_id = v_lead.empresa_id AND i.grupo_id = v_lead.grupo_id AND i.ativo
   ORDER BY i.created_at LIMIT 1;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Este grupo não tem número de WhatsApp configurado.';
  END IF;
  v_destino := CASE
    WHEN coalesce(v_lead.telefone, '') LIKE 'sem-numero-%' AND v_lead.wa_lid IS NOT NULL THEN v_lead.wa_lid
    ELSE regexp_replace(coalesce(v_lead.telefone, ''), '[^0-9]', '', 'g') END;
  SELECT coalesce((SELECT c.nome FROM public.corretores c WHERE c.id = NEW.corretor_id),
                  (SELECT p.nome FROM public.perfis p WHERE p.id = auth.uid()))
    INTO v_quem;
  INSERT INTO public.envios_whatsapp (instancia, numero, mensagem, tipo, mensagem_id)
  VALUES (v_inst, v_destino,
          CASE WHEN NEW.midia_tipo = 'audio' THEN ''
               WHEN v_quem IS NOT NULL THEN '*' || v_quem || ':*' || E'\n' || NEW.texto ELSE NEW.texto END,
          CASE WHEN NEW.midia_tipo = 'audio' THEN 'audio' ELSE 'texto' END,
          NEW.id)
  RETURNING id INTO v_envio;
  UPDATE public.lead_mensagens SET envio_id = v_envio WHERE id = NEW.id;
  UPDATE public.leads SET ultimo_contato = now() WHERE id = NEW.lead_id;
  RETURN NEW;
END $$;

-- O n8n pega também o tipo e, para áudio, os dados. A assinatura muda, então recria a função.
DROP FUNCTION IF EXISTS public.relay_pegar_envios(text, integer);
CREATE FUNCTION public.relay_pegar_envios(p_segredo text, p_limite integer DEFAULT 10)
RETURNS TABLE (id uuid, instancia text, numero text, mensagem text, tipo text, audio_base64 text, audio_mimetype text)
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
  ), upd AS (
    UPDATE public.envios_whatsapp x
       SET proxima_tentativa = now() + interval '3 minutes'
      FROM sel
     WHERE x.id = sel.id
    RETURNING x.id, x.instancia, x.numero, x.mensagem, x.tipo, x.mensagem_id
  )
  SELECT u.id, u.instancia, u.numero, u.mensagem, u.tipo,
         CASE WHEN u.tipo = 'audio' THEN m.audio_dados END,
         CASE WHEN u.tipo = 'audio' THEN m.audio_mimetype END
    FROM upd u LEFT JOIN public.lead_mensagens m ON m.id = u.mensagem_id;
END;
$$;
REVOKE ALL ON FUNCTION public.relay_pegar_envios(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relay_pegar_envios(text, integer) TO anon, authenticated, service_role;
