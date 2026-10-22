-- Lead de lista (fonte 'planilha_samuelimob') pode receber VÁRIAS mensagens antes de responder, com travas:
--   * até 5 mensagens por lead enquanto o cliente não responder;
--   * cada corretor contata no máximo 20 leads novos por dia (dia de Brasília).
-- Quem já escreveu para o número mãe continua respondendo livre; lead de outra origem continua só respondendo quem chamou.
-- Substitui a regra anterior de "uma única primeira mensagem".

CREATE OR REPLACE FUNCTION public.lead_mensagens_antes_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fonte text; v_corr uuid; v_ja_escreveu boolean; v_hoje timestamptz; v_n int; v_ja_hoje boolean; v_enviadas int;
  c_max_por_lead constant int := 5;
  c_limite_dia   constant int := 20;
BEGIN
  IF auth.uid() IS NULL OR NEW.direcao <> 'saida' THEN RETURN NEW; END IF; -- entrada vem da função do servidor
  IF coalesce(btrim(NEW.texto), '') = '' THEN
    RAISE EXCEPTION 'mensagem vazia';
  END IF;
  SELECT l.empresa_id, l.fonte INTO NEW.empresa_id, v_fonte FROM public.leads l WHERE l.id = NEW.lead_id;
  IF EXISTS (SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND coalesce(l.opt_out, false)) THEN
    RAISE EXCEPTION 'Este contato pediu para não receber mensagens.';
  END IF;
  v_corr := public.get_meu_corretor_id();   -- nulo se quem responde é gerente/master
  v_ja_escreveu := EXISTS (SELECT 1 FROM public.lead_mensagens m WHERE m.lead_id = NEW.lead_id AND m.direcao = 'entrada');

  IF NOT v_ja_escreveu THEN
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
  NEW.midia_tipo  := NULL;
  NEW.midia_url   := NULL;
  RETURN NEW;
END $$;
