-- Áudio enviado pelo Alexandria agora mostra quem mandou: antes do áudio vai uma linha "*Nome:* 🎤",
-- igual à assinatura das mensagens de texto.
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
  -- Áudio não leva assinatura. Então manda antes uma linha curta com o nome de quem enviou
  -- (mesmo jeito do texto: *Nome:*) e logo depois o áudio.
  IF NEW.midia_tipo = 'audio' AND v_quem IS NOT NULL THEN
    INSERT INTO public.envios_whatsapp (instancia, numero, mensagem, tipo, created_at)
    VALUES (v_inst, v_destino, '*' || v_quem || ':* 🎤', 'texto', clock_timestamp() - interval '2 seconds');
  END IF;
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

