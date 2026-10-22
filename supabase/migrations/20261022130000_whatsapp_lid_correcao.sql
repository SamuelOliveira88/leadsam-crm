-- Correção da migração anterior: o FOUND do PostgreSQL ficava "verdadeiro" depois do bloqueio
-- (PERFORM pg_advisory_xact_lock) e a busca pelo identificador era pulada, quebrando o caso sem número.
-- Agora a função usa uma variável própria (v_achou). Mesmo contrato e mesmas permissões.
CREATE OR REPLACE FUNCTION public.receber_mensagem_whatsapp(
  p_segredo text, p_instancia text, p_telefone text, p_nome text,
  p_texto text, p_midia_tipo text DEFAULT NULL, p_midia_url text DEFAULT NULL,
  p_wa_msg_id text DEFAULT NULL, p_lid text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst record; v_lead record; v_lead_id uuid; v_corretor uuid; v_msg uuid; v_novo boolean := false;
  v_tel text; v_tem_tel boolean; v_lid text; v_achou boolean := false;
BEGIN
  IF NOT public.numero_mae_segredo_ok(p_segredo) THEN RAISE EXCEPTION 'nao autorizado'; END IF;

  SELECT i.empresa_id, i.grupo_id INTO v_inst
    FROM public.instancias_whatsapp i WHERE i.instancia = p_instancia AND i.ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'instancia desconhecida'; END IF;

  v_tel := regexp_replace(split_part(coalesce(p_telefone, ''), '@', 1), '\D', '', 'g');
  v_tem_tel := length(v_tel) >= 10;
  v_lid := nullif(btrim(coalesce(p_lid, '')), '');
  IF NOT v_tem_tel AND v_lid IS NULL THEN RAISE EXCEPTION 'telefone invalido'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_inst.empresa_id::text ||
            CASE WHEN v_tem_tel THEN coalesce(public.elo_chave(v_tel), v_tel) ELSE v_lid END));

  IF p_wa_msg_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.lead_mensagens m WHERE m.empresa_id = v_inst.empresa_id AND m.wa_msg_id = p_wa_msg_id)
  THEN RETURN jsonb_build_object('duplicada', true); END IF;

  -- Acha o lead: pelo número (DDD + 8 últimos dígitos) e, se não achar, pelo identificador.
  IF v_tem_tel THEN
    SELECT l.id, l.corretor_id, l.telefone INTO v_lead
      FROM public.leads l
     WHERE l.empresa_id = v_inst.empresa_id AND public.elo_chave(l.telefone) = public.elo_chave(v_tel)
     ORDER BY l.created_at DESC LIMIT 1;
    v_achou := FOUND;
  END IF;
  IF NOT v_achou AND v_lid IS NOT NULL THEN
    SELECT l.id, l.corretor_id, l.telefone INTO v_lead
      FROM public.leads l
     WHERE l.empresa_id = v_inst.empresa_id AND l.wa_lid = v_lid
     ORDER BY l.created_at DESC LIMIT 1;
    v_achou := FOUND;
  END IF;

  IF v_achou THEN
    v_lead_id := v_lead.id; v_corretor := v_lead.corretor_id;
    -- Guarda o identificador; e se o número apareceu depois, troca o telefone provisório pelo real.
    UPDATE public.leads SET
      wa_lid = coalesce(wa_lid, v_lid),
      telefone = CASE WHEN v_tem_tel AND telefone LIKE 'sem-numero-%' THEN v_tel ELSE telefone END
     WHERE id = v_lead_id;
  ELSE
    v_novo := true;
    INSERT INTO public.leads (nome, telefone, grupo_id, empresa_id, status, fonte, canal, wa_lid)
    VALUES (coalesce(nullif(btrim(p_nome), ''), CASE WHEN v_tem_tel THEN v_tel ELSE 'Cliente sem nome' END),
            CASE WHEN v_tem_tel THEN v_tel ELSE 'sem-numero-' || substr(md5(v_lid), 1, 10) END,
            v_inst.grupo_id, v_inst.empresa_id, 'represado', 'numero_mae', 'whatsapp', v_lid)
    RETURNING id INTO v_lead_id;
    SELECT corretor_id INTO v_corretor FROM public.leads WHERE id = v_lead_id;
    IF v_corretor IS NOT NULL THEN
      UPDATE public.leads SET status = 'distribuido', represado_em = NULL WHERE id = v_lead_id;
    END IF;
  END IF;

  IF v_corretor IS NULL THEN
    v_corretor := public.escolher_corretor_online(v_inst.grupo_id);
    IF v_corretor IS NOT NULL THEN
      UPDATE public.leads SET corretor_id = v_corretor, status = 'distribuido', represado_em = NULL
       WHERE id = v_lead_id;
    ELSE
      UPDATE public.leads SET status = 'represado', represado_em = coalesce(represado_em, now())
       WHERE id = v_lead_id;
      INSERT INTO public.notificacoes (destinatario_id, tipo, titulo, descricao, lead_id)
      SELECT p.id, 'conversa_sem_dono', 'Conversa sem corretor',
             'Chegou mensagem no número mãe e não há corretor online.', v_lead_id
        FROM public.perfis p
       WHERE p.empresa_id = v_inst.empresa_id
         AND (p.role = 'master' OR (p.role = 'gerente' AND p.grupo_id = v_inst.grupo_id))
         AND NOT EXISTS (SELECT 1 FROM public.notificacoes n
                          WHERE n.destinatario_id = p.id AND n.lead_id = v_lead_id
                            AND n.tipo = 'conversa_sem_dono' AND NOT n.lida);
    END IF;
  END IF;

  INSERT INTO public.lead_mensagens (empresa_id, lead_id, direcao, texto, midia_tipo, midia_url, wa_msg_id, corretor_id, status)
  VALUES (v_inst.empresa_id, v_lead_id, 'entrada', p_texto, p_midia_tipo, p_midia_url, p_wa_msg_id, v_corretor, 'recebida')
  RETURNING id INTO v_msg;

  UPDATE public.leads SET ultimo_contato = now() WHERE id = v_lead_id;

  RETURN jsonb_build_object('lead_id', v_lead_id, 'corretor_id', v_corretor, 'mensagem_id', v_msg,
                            'lead_novo', v_novo, 'sem_dono', v_corretor IS NULL);
END $$;
