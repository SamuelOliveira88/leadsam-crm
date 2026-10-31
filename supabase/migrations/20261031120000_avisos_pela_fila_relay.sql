-- Aviso de novo lead no WhatsApp do corretor passa a sair pela fila do relay (envios_whatsapp, n8n),
-- a mesma que já envia as mensagens e áudios. Não depende mais da rotina do site (que precisava de senha na Vercel).
-- Regras mantidas: só quem tem canal WhatsApp/ambos e "Recebe leads direto"; respeita a pausa global,
-- o horário de atendimento do grupo e o telefone oculto (número mãe e lista blindada).
-- Se a imobiliária não tiver número conectado, cai no jeito antigo (fila_notificacoes).
CREATE OR REPLACE FUNCTION public.notificar_corretor_novo_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_corretor record; v_inst text; v_blind boolean; v_oculto boolean; v_nome text; v_msg text;
  v_pausada boolean; v_dentro boolean;
BEGIN
  IF NEW.corretor_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    SELECT * INTO v_corretor FROM public.corretores WHERE id = NEW.corretor_id;

    IF v_corretor.canal_notificacao IN ('whatsapp','ambos') AND v_corretor.recebe_via_whatsapp THEN
      SELECT i.instancia INTO v_inst FROM public.instancias_whatsapp i
       WHERE i.empresa_id = NEW.empresa_id AND i.ativo
       ORDER BY (i.grupo_id IS NOT DISTINCT FROM NEW.grupo_id) DESC, i.created_at LIMIT 1;

      IF v_inst IS NULL THEN
        INSERT INTO public.fila_notificacoes (corretor_id, lead_id, tipo, status)
        VALUES (NEW.corretor_id, NEW.id, 'whatsapp', 'pendente');
      ELSE
        SELECT coalesce((SELECT n.pausada_ate > now() FROM public.notif_pausa n WHERE n.id = 1), false) INTO v_pausada;
        v_dentro := CASE WHEN NEW.grupo_id IS NULL THEN true ELSE coalesce(public.dentro_do_horario(NEW.grupo_id), true) END;
        IF NOT v_pausada AND v_dentro AND coalesce(v_corretor.telefone, '') <> '' THEN
          SELECT coalesce((SELECT e.lista_blindada FROM public.empresas e WHERE e.id = NEW.empresa_id), true) INTO v_blind;
          v_oculto := NEW.fonte = 'numero_mae' OR (NEW.fonte = 'planilha_samuelimob' AND v_blind);
          v_nome := trim(coalesce(NEW.nome, ''));
          IF v_oculto THEN
            IF length(regexp_replace(v_nome, '\D', '', 'g')) >= 8 OR v_nome LIKE 'sem-numero-%' THEN v_nome := 'Cliente sem nome';
            ELSIF v_nome = '' THEN v_nome := 'Cliente'; END IF;
          END IF;
          v_msg := E'🔔 *Novo lead recebido — Alexandria Leds*\nNome: ' || v_nome
            || CASE WHEN NEW.telefone IS NOT NULL AND NOT v_oculto THEN E'\nTelefone: ' || NEW.telefone ELSE '' END
            || CASE WHEN coalesce(NEW.email, '') <> '' THEN E'\nEmail: ' || NEW.email ELSE '' END
            || E'\n\nAtenda em até 10 minutos para não perder a preferência.';
          INSERT INTO public.envios_whatsapp (instancia, numero, mensagem, tipo)
          VALUES (v_inst, regexp_replace(v_corretor.telefone, '[^0-9]', '', 'g'), v_msg, 'texto');
        END IF;
      END IF;
    END IF;

    IF v_corretor.canal_notificacao IN ('email','ambos') THEN
      INSERT INTO public.fila_notificacoes (corretor_id, lead_id, tipo, status)
      VALUES (NEW.corretor_id, NEW.id, 'email', 'pendente');
    END IF;
  END IF;
  RETURN NEW;
END; $$;
