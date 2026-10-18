-- ============================================================================
-- NÚMERO MÃE — conversas de WhatsApp dentro da Alexandria
--
--  * lead_mensagens: quem vê a mensagem é quem vê o lead (mesma RLS da tabela leads,
--    herdada por EXISTS). Única exceção, por LGPD: nem o super admin vê mensagens de
--    OUTRA empresa (policy RESTRICTIVE).
--  * instancias_whatsapp: liga uma instância da Evolution a uma empresa + grupo.
--    Proibido usar a "sara-vendedora".
--  * receber_mensagem_whatsapp: o n8n chama quando chega mensagem (segredo PRÓPRIO,
--    separado do segredo do relé). Acha o lead pelo telefone; cliente que volta fica com o mesmo corretor;
--    lead novo usa escolher_corretor_online; sem ninguém online fica sem dono
--    (status 'represado') e master/gerente do grupo são avisados em notificacoes.
--  * Saída: o corretor grava a mensagem (direcao 'saida'); um trigger põe na
--    envios_whatsapp, e o relay_pegar_envios / relay_confirmar atuais enviam.
--
--  * Lead criado pelo número mãe tem fonte = 'numero_mae'. O elo Alexandria <-> Sara
--    (elo_aplicar_etapa / elo_mudancas_etapa) passa a IGNORAR esses leads, para que
--    nada deles chegue na Sara (sara_leads, Reativação, Disparo).
--
-- Não altera colunas de tabela existente. Idempotente.
-- ============================================================================

-- 0) Segredo próprio do número mãe (separado do relé) -----------------------------
CREATE TABLE IF NOT EXISTS public.numero_mae_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  segredo_hash text
);
INSERT INTO public.numero_mae_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.numero_mae_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numero_mae_config FROM anon, authenticated;
GRANT ALL ON public.numero_mae_config TO service_role;
-- Para definir o segredo (rodar à mão, uma vez, com um segredo de 24+ caracteres):
--   UPDATE public.numero_mae_config
--      SET segredo_hash = encode(sha256(convert_to('<SEGREDO>', 'UTF8')), 'hex') WHERE id = 1;

CREATE OR REPLACE FUNCTION public.numero_mae_segredo_ok(p_segredo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.segredo_hash IS NOT NULL
        AND p_segredo IS NOT NULL
        AND length(p_segredo) >= 24
        AND c.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex')
       FROM public.numero_mae_config c WHERE c.id = 1),
    false)
$$;
REVOKE ALL ON FUNCTION public.numero_mae_segredo_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.numero_mae_segredo_ok(text) TO service_role;

-- 1) Instâncias do número mãe ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instancias_whatsapp (
  instancia  text PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  grupo_id   uuid NOT NULL REFERENCES public.grupos(id)   ON DELETE CASCADE,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instancia_nao_e_sara CHECK (lower(instancia) NOT LIKE 'sara%')
);
ALTER TABLE public.instancias_whatsapp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instancias_whatsapp FROM anon, authenticated;
GRANT ALL ON public.instancias_whatsapp TO service_role;
-- (sem policy para authenticated: só o servidor mexe; cadastro é feito uma vez, à mão)

-- 2) Mensagens ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_mensagens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES public.leads(id)    ON DELETE CASCADE,
  direcao     text NOT NULL CHECK (direcao IN ('entrada','saida')),
  texto       text,
  midia_tipo  text CHECK (midia_tipo IN ('imagem','audio','video','documento')),
  midia_url   text,
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL, -- quem respondeu
  wa_msg_id   text,                                                      -- id na Evolution (dedupe)
  status      text NOT NULL DEFAULT 'recebida'
              CHECK (status IN ('recebida','pendente','enviada','erro')),
  envio_id    uuid,                                                      -- linha em envios_whatsapp
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (texto IS NOT NULL OR midia_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lead_mensagens_lead_idx ON public.lead_mensagens (lead_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS lead_mensagens_wa_unico
  ON public.lead_mensagens (empresa_id, wa_msg_id) WHERE wa_msg_id IS NOT NULL;

ALTER TABLE public.lead_mensagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_mensagens FROM anon;
GRANT SELECT, INSERT ON public.lead_mensagens TO authenticated;
GRANT ALL ON public.lead_mensagens TO service_role;

DROP POLICY IF EXISTS lead_mensagens_ver ON public.lead_mensagens;
DROP POLICY IF EXISTS lead_mensagens_enviar ON public.lead_mensagens;
DROP POLICY IF EXISTS lead_mensagens_so_minha_empresa ON public.lead_mensagens;

-- Vê a mensagem quem vê o lead: o EXISTS roda sob a RLS da tabela leads (invoker).
CREATE POLICY lead_mensagens_ver ON public.lead_mensagens FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_mensagens.lead_id));

-- Responde quem vê o lead. Só mensagem de saída; o resto é forçado pelo trigger abaixo.
CREATE POLICY lead_mensagens_enviar ON public.lead_mensagens FOR INSERT TO authenticated
WITH CHECK (
  direcao = 'saida'
  AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_mensagens.lead_id)
);

-- LGPD: ninguém (nem super admin) lê/grava mensagem de outra empresa.
CREATE POLICY lead_mensagens_so_minha_empresa ON public.lead_mensagens AS RESTRICTIVE
FOR ALL TO authenticated
USING (empresa_id = public.get_minha_empresa_id())
WITH CHECK (empresa_id = public.get_minha_empresa_id());

-- 3) Saída: antes de gravar, força os campos; depois, enfileira no relé -------
CREATE OR REPLACE FUNCTION public.lead_mensagens_antes_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.direcao <> 'saida' THEN RETURN NEW; END IF; -- entrada vem da função do servidor
  IF coalesce(btrim(NEW.texto), '') = '' THEN
    RAISE EXCEPTION 'mensagem vazia';
  END IF;
  SELECT l.empresa_id INTO NEW.empresa_id FROM public.leads l WHERE l.id = NEW.lead_id;
  NEW.corretor_id := public.get_meu_corretor_id();   -- nulo se quem responde é gerente/master
  NEW.status      := 'pendente';
  NEW.wa_msg_id   := NULL;
  NEW.envio_id    := NULL;
  NEW.midia_tipo  := NULL;
  NEW.midia_url   := NULL;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.lead_mensagens_depois_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_lead record; v_inst text; v_envio uuid;
BEGIN
  IF NEW.direcao <> 'saida' OR NEW.status <> 'pendente' THEN RETURN NEW; END IF;
  SELECT l.telefone, l.grupo_id, l.empresa_id INTO v_lead FROM public.leads l WHERE l.id = NEW.lead_id;
  SELECT i.instancia INTO v_inst FROM public.instancias_whatsapp i
   WHERE i.empresa_id = v_lead.empresa_id AND i.grupo_id = v_lead.grupo_id AND i.ativo
   ORDER BY i.created_at LIMIT 1;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Este grupo não tem número de WhatsApp configurado.';
  END IF;
  INSERT INTO public.envios_whatsapp (instancia, numero, mensagem)
  VALUES (v_inst, regexp_replace(coalesce(v_lead.telefone, ''), '[^0-9]', '', 'g'), NEW.texto)
  RETURNING id INTO v_envio;
  UPDATE public.lead_mensagens SET envio_id = v_envio WHERE id = NEW.id;
  UPDATE public.leads SET ultimo_contato = now() WHERE id = NEW.lead_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_mensagens_antes  ON public.lead_mensagens;
DROP TRIGGER IF EXISTS trg_lead_mensagens_depois ON public.lead_mensagens;
CREATE TRIGGER trg_lead_mensagens_antes  BEFORE INSERT ON public.lead_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.lead_mensagens_antes_insert();
CREATE TRIGGER trg_lead_mensagens_depois AFTER  INSERT ON public.lead_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.lead_mensagens_depois_insert();

-- O relay_confirmar já marca envios_whatsapp como enviado/erro; este trigger (único
-- ponto que encosta numa tabela existente) repete o resultado na mensagem.
CREATE OR REPLACE FUNCTION public.envio_whatsapp_refletir_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.lead_mensagens
     SET status = CASE NEW.status WHEN 'enviado' THEN 'enviada' ELSE 'erro' END
   WHERE envio_id = NEW.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_envio_whatsapp_refletir ON public.envios_whatsapp;
CREATE TRIGGER trg_envio_whatsapp_refletir AFTER UPDATE OF status ON public.envios_whatsapp
  FOR EACH ROW WHEN (NEW.status IN ('enviado','erro') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.envio_whatsapp_refletir_status();

-- 4) Entrada: o n8n chama esta função quando chega mensagem ---------------------
CREATE OR REPLACE FUNCTION public.receber_mensagem_whatsapp(
  p_segredo text, p_instancia text, p_telefone text, p_nome text,
  p_texto text, p_midia_tipo text DEFAULT NULL, p_midia_url text DEFAULT NULL,
  p_wa_msg_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst record; v_lead record; v_lead_id uuid; v_corretor uuid; v_msg uuid; v_novo boolean := false;
BEGIN
  IF NOT public.numero_mae_segredo_ok(p_segredo) THEN RAISE EXCEPTION 'nao autorizado'; END IF;

  SELECT i.empresa_id, i.grupo_id INTO v_inst
    FROM public.instancias_whatsapp i WHERE i.instancia = p_instancia AND i.ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'instancia desconhecida'; END IF;

  -- Mensagem repetida (a Evolution reenvia): não duplica.
  IF p_wa_msg_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.lead_mensagens m WHERE m.empresa_id = v_inst.empresa_id AND m.wa_msg_id = p_wa_msg_id)
  THEN RETURN jsonb_build_object('duplicada', true); END IF;

  -- Cliente que volta: mesmo lead (DDD + 8 últimos dígitos, só dentro da empresa).
  SELECT l.id, l.corretor_id INTO v_lead
    FROM public.leads l
   WHERE l.empresa_id = v_inst.empresa_id AND public.elo_chave(l.telefone) = public.elo_chave(p_telefone)
   ORDER BY l.created_at DESC LIMIT 1;

  IF FOUND THEN
    v_lead_id := v_lead.id; v_corretor := v_lead.corretor_id;
  ELSE
    v_novo := true;
    INSERT INTO public.leads (nome, telefone, grupo_id, empresa_id, status, fonte, canal)
    VALUES (coalesce(nullif(btrim(p_nome), ''), p_telefone), p_telefone, v_inst.grupo_id, v_inst.empresa_id,
            'represado', 'numero_mae', 'whatsapp')
    RETURNING id INTO v_lead_id;
  END IF;

  -- Sem dono (lead novo, ou antigo que ficou sem corretor): rodízio entre quem está online.
  IF v_corretor IS NULL THEN
    v_corretor := public.escolher_corretor_online(v_inst.grupo_id);
    IF v_corretor IS NOT NULL THEN
      UPDATE public.leads SET corretor_id = v_corretor, status = 'distribuido', represado_em = NULL
       WHERE id = v_lead_id;
    ELSE
      UPDATE public.leads SET status = 'represado', represado_em = coalesce(represado_em, now())
       WHERE id = v_lead_id;
      -- Avisa master e gerente do grupo (uma vez por conversa, enquanto não lerem).
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

REVOKE ALL ON FUNCTION public.receber_mensagem_whatsapp(text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receber_mensagem_whatsapp(text,text,text,text,text,text,text,text)
  TO anon, authenticated, service_role;   -- quem protege é o segredo próprio (numero_mae_config)

-- 5) Elo Alexandria <-> Sara ignora os leads do número mãe ------------------------
-- (mesma função de antes, só com o filtro fonte <> 'numero_mae' acrescentado)
CREATE OR REPLACE FUNCTION public.elo_aplicar_etapa(p_empresa_id uuid, p_telefone text, p_etapa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_chave text := public.elo_chave(p_telefone); v_id uuid; v_nova text; v_antes text;
BEGIN
  IF p_empresa_id IS NULL OR v_chave IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  END IF;
  v_nova := public.normalizar_etapa_funil(p_etapa);
  SELECT id, etapa_funil INTO v_id, v_antes
    FROM public.leads
   WHERE empresa_id = p_empresa_id AND public.elo_chave(telefone) = v_chave
     AND coalesce(fonte, '') <> 'numero_mae'
   ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'achou', false);
  END IF;
  IF v_antes IS NOT DISTINCT FROM v_nova THEN
    RETURN jsonb_build_object('ok', true, 'achou', true, 'alterou', false);
  END IF;
  PERFORM set_config('elo.origem', 'Elo WhatsApp', true);
  UPDATE public.leads SET etapa_funil = v_nova WHERE id = v_id AND empresa_id = p_empresa_id;
  RETURN jsonb_build_object('ok', true, 'achou', true, 'alterou', true, 'etapa', v_nova);
END;
$$;

CREATE OR REPLACE FUNCTION public.elo_mudancas_etapa(p_empresa_id uuid, p_desde timestamptz, p_limite int DEFAULT 200)
RETURNS TABLE (telefone text, etapa text, em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT l.telefone, h.etapa_nova, h.created_at
    FROM public.lead_historico h
    JOIN public.leads l ON l.id = h.lead_id AND l.empresa_id = h.empresa_id
   WHERE h.empresa_id = p_empresa_id
     AND h.created_at > p_desde
     AND h.usuario_nome IS DISTINCT FROM 'Elo WhatsApp'
     AND l.telefone IS NOT NULL
     AND coalesce(l.fonte, '') <> 'numero_mae'
   ORDER BY h.created_at
   LIMIT least(greatest(coalesce(p_limite, 200), 1), 500)
$$;

REVOKE ALL ON FUNCTION public.elo_aplicar_etapa(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.elo_mudancas_etapa(uuid, timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elo_aplicar_etapa(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.elo_mudancas_etapa(uuid, timestamptz, int) TO service_role;
