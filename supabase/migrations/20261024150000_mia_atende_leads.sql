-- A Mi.IA atende o lead novo do número mãe ANTES do corretor (plano Alexandria + Mi.IA, dentro do horário escolhido).
-- Quando bate a regra de passagem, o cliente pára de falar ou a Mi.IA falha, o lead segue o rodízio de sempre.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS mia_estado text CHECK (mia_estado IN ('atendendo','passada')),
  ADD COLUMN IF NOT EXISTS mia_ultima_em timestamptz;
ALTER TABLE public.lead_mensagens
  ADD COLUMN IF NOT EXISTS mia_processada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mia boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS leads_mia_atendendo_idx ON public.leads (mia_ultima_em) WHERE mia_estado = 'atendendo';

-- A Mi.IA desta imobiliária pode atender agora? (plano liberado + ligada + dentro do horário de Brasília)
CREATE OR REPLACE FUNCTION public.mia_pode_atender(p_empresa uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c record; v_now timestamp := now() AT TIME ZONE 'America/Sao_Paulo'; v_t time; v_dow int; v_i time; v_f time;
BEGIN
  IF NOT public.empresa_tem_mia(p_empresa) THEN RETURN false; END IF;
  SELECT ativa, horario INTO c FROM public.mia_config WHERE empresa_id = p_empresa;
  IF NOT FOUND OR NOT c.ativa THEN RETURN false; END IF;
  IF coalesce((c.horario->>'sempre')::boolean, true) THEN RETURN true; END IF;
  v_t := v_now::time; v_dow := extract(dow FROM v_now)::int;
  IF NOT (c.horario->'dias') @> to_jsonb(v_dow) THEN RETURN false; END IF;
  v_i := coalesce(nullif(c.horario->>'inicio','')::time, '08:00'::time);
  v_f := coalesce(nullif(c.horario->>'fim','')::time, '20:00'::time);
  RETURN CASE WHEN v_i <= v_f THEN v_t >= v_i AND v_t < v_f ELSE v_t >= v_i OR v_t < v_f END;
END $$;
REVOKE ALL ON FUNCTION public.mia_pode_atender(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mia_pode_atender(uuid) TO service_role;

-- Entrega o lead ao corretor (mesmo rodízio do número mãe). Idempotente: só age se a Mi.IA ainda estava atendendo.
CREATE OR REPLACE FUNCTION public.mia_passar_corretor(p_lead uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lead record; v_corretor uuid;
BEGIN
  SELECT id, grupo_id, empresa_id, corretor_id, mia_estado INTO v_lead FROM public.leads WHERE id = p_lead FOR UPDATE;
  IF NOT FOUND OR v_lead.mia_estado IS DISTINCT FROM 'atendendo' THEN RETURN jsonb_build_object('passou', false); END IF;
  v_corretor := v_lead.corretor_id;
  IF v_corretor IS NULL THEN v_corretor := public.escolher_corretor_online(v_lead.grupo_id); END IF;
  IF v_corretor IS NOT NULL THEN
    UPDATE public.leads SET corretor_id = v_corretor, status = 'distribuido', represado_em = NULL, mia_estado = 'passada' WHERE id = p_lead;
    UPDATE public.lead_mensagens SET corretor_id = v_corretor WHERE lead_id = p_lead AND corretor_id IS NULL;
  ELSE
    UPDATE public.leads SET status = 'represado', represado_em = coalesce(represado_em, now()), mia_estado = 'passada' WHERE id = p_lead;
    INSERT INTO public.notificacoes (destinatario_id, tipo, titulo, descricao, lead_id)
    SELECT p.id, 'conversa_sem_dono', 'Conversa sem corretor',
           'A Mi.IA atendeu um cliente e não há corretor online para assumir.', p_lead
      FROM public.perfis p
     WHERE p.empresa_id = v_lead.empresa_id
       AND (p.role = 'master' OR (p.role = 'gerente' AND p.grupo_id = v_lead.grupo_id))
       AND NOT EXISTS (SELECT 1 FROM public.notificacoes n
                        WHERE n.destinatario_id = p.id AND n.lead_id = p_lead
                          AND n.tipo = 'conversa_sem_dono' AND NOT n.lida);
  END IF;
  RETURN jsonb_build_object('passou', true, 'corretor_id', v_corretor);
END $$;
REVOKE ALL ON FUNCTION public.mia_passar_corretor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mia_passar_corretor(uuid) TO service_role;

-- A Mi.IA responde: grava a mensagem de saída (o gatilho de sempre coloca na fila do WhatsApp).
CREATE OR REPLACE FUNCTION public.mia_enviar(p_lead uuid, p_texto text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp uuid; v_id uuid;
BEGIN
  SELECT empresa_id INTO v_emp FROM public.leads WHERE id = p_lead AND mia_estado = 'atendendo';
  IF v_emp IS NULL OR coalesce(btrim(p_texto), '') = '' THEN RETURN NULL; END IF;
  INSERT INTO public.lead_mensagens (empresa_id, lead_id, direcao, texto, status, mia, mia_processada)
  VALUES (v_emp, p_lead, 'saida', left(p_texto, 1500), 'pendente', true, true)
  RETURNING id INTO v_id;
  UPDATE public.leads SET mia_ultima_em = now() WHERE id = p_lead;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.mia_enviar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mia_enviar(uuid, text) TO service_role;

-- Rede de segurança: se a Mi.IA não respondeu em 3 min, ou o cliente sumiu por 20 min, passa para o corretor.
CREATE OR REPLACE FUNCTION public.mia_varrer()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT l.id FROM public.leads l
     WHERE l.mia_estado = 'atendendo'
       AND ( l.mia_ultima_em < now() - interval '20 minutes'
          OR EXISTS (SELECT 1 FROM public.lead_mensagens m
                      WHERE m.lead_id = l.id AND m.direcao = 'entrada' AND NOT m.mia_processada
                        AND m.created_at < now() - interval '3 minutes') )
     LIMIT 50
  LOOP
    PERFORM public.mia_passar_corretor(r.id); n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.mia_varrer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mia_varrer() TO service_role;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule('mia-varrer') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mia-varrer');
  PERFORM cron.schedule('mia-varrer', '* * * * *', 'SELECT public.mia_varrer()');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron indisponível: %', SQLERRM;
END $$;

-- A liberação automática de represados não pode tirar o lead da Mi.IA enquanto ela atende.
CREATE OR REPLACE FUNCTION public.liberar_leads_represados()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lead record; v_corretor_id uuid;
BEGIN
  FOR v_lead IN
    SELECT * FROM public.leads
     WHERE status = 'represado'
       AND COALESCE(fonte, '') <> 'planilha_samuelimob'
       AND mia_estado IS DISTINCT FROM 'atendendo'
  LOOP
    IF public.dentro_do_horario(v_lead.grupo_id) THEN
      SELECT c.id INTO v_corretor_id
      FROM public.corretores c
      LEFT JOIN (
        SELECT corretor_id, max(created_at) AS ultimo_lead
        FROM public.leads WHERE grupo_id = v_lead.grupo_id GROUP BY corretor_id
      ) l ON l.corretor_id = c.id
      WHERE c.grupo_id = v_lead.grupo_id AND c.ativo = true
      ORDER BY l.ultimo_lead NULLS FIRST, c.created_at ASC
      LIMIT 1 FOR UPDATE OF c SKIP LOCKED;
      IF v_corretor_id IS NOT NULL THEN
        UPDATE public.leads SET corretor_id = v_corretor_id, status = 'distribuido', liberado_em = now() WHERE id = v_lead.id;
      END IF;
    END IF;
  END LOOP;
END; $function$;

-- Recebimento do número mãe: igual ao anterior, mas lead novo (ou já em atendimento) fica com a Mi.IA quando ela pode atender.
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
  v_mia boolean := false; v_mia_estado text;
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

  IF v_tem_tel THEN
    SELECT l.id, l.corretor_id, l.telefone, l.mia_estado INTO v_lead
      FROM public.leads l
     WHERE l.empresa_id = v_inst.empresa_id AND public.elo_chave(l.telefone) = public.elo_chave(v_tel)
     ORDER BY l.created_at DESC LIMIT 1;
    v_achou := FOUND;
  END IF;
  IF NOT v_achou AND v_lid IS NOT NULL THEN
    SELECT l.id, l.corretor_id, l.telefone, l.mia_estado INTO v_lead
      FROM public.leads l
     WHERE l.empresa_id = v_inst.empresa_id AND l.wa_lid = v_lid
     ORDER BY l.created_at DESC LIMIT 1;
    v_achou := FOUND;
  END IF;

  IF v_achou THEN
    v_lead_id := v_lead.id; v_corretor := v_lead.corretor_id; v_mia_estado := v_lead.mia_estado;
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

  -- Mi.IA: lead novo sem dono, ou que ela já está atendendo, e a imobiliária deixou a Mi.IA atender agora.
  IF v_corretor IS NULL AND (v_novo OR v_mia_estado = 'atendendo') AND public.mia_pode_atender(v_inst.empresa_id) THEN
    v_mia := true;
    UPDATE public.leads SET mia_estado = 'atendendo', status = 'represado', represado_em = coalesce(represado_em, now()),
                            mia_ultima_em = coalesce(mia_ultima_em, now())
     WHERE id = v_lead_id;
  ELSIF v_mia_estado = 'atendendo' THEN
    PERFORM public.mia_passar_corretor(v_lead_id);   -- saiu do horário/plano: entrega agora
    SELECT corretor_id INTO v_corretor FROM public.leads WHERE id = v_lead_id;
  END IF;

  IF NOT v_mia AND v_corretor IS NULL THEN
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

  INSERT INTO public.lead_mensagens (empresa_id, lead_id, direcao, texto, midia_tipo, midia_url, wa_msg_id, corretor_id, status, mia_processada)
  VALUES (v_inst.empresa_id, v_lead_id, 'entrada', p_texto, p_midia_tipo, p_midia_url, p_wa_msg_id, v_corretor, 'recebida', NOT v_mia)
  RETURNING id INTO v_msg;

  UPDATE public.leads SET ultimo_contato = now() WHERE id = v_lead_id;

  IF v_mia THEN
    BEGIN  -- avisa o servidor para a Mi.IA responder; se falhar, a varredura de 3 minutos entrega ao corretor
      PERFORM net.http_post(
        url := 'https://www.alexandrialeads.app/api/public/mia-atender',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('mensagem_id', v_msg));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('lead_id', v_lead_id, 'corretor_id', v_corretor, 'mensagem_id', v_msg,
                            'lead_novo', v_novo, 'sem_dono', v_corretor IS NULL AND NOT v_mia, 'mia', v_mia);
END $$;
REVOKE ALL ON FUNCTION public.receber_mensagem_whatsapp(text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receber_mensagem_whatsapp(text,text,text,text,text,text,text,text,text)
  TO anon, authenticated, service_role;
