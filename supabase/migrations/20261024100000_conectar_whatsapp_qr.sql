-- Conectar o WhatsApp da imobiliária lendo um QR code dentro do Alexandria.
-- O master pede a conexão (pedir_conexao_whatsapp). O n8n do computador do dono (que fala com o
-- Evolution) busca os pedidos, cria a instância, devolve o QR e depois avisa quando conectou.
-- O n8n usa o mesmo segredo do relé (relay_segredo_ok), como já faz com a caixa de saída.

CREATE TABLE IF NOT EXISTS public.conexoes_whatsapp (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  grupo_id   uuid NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  instancia  text NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'pedido'
             CHECK (status IN ('pedido','qr','conectado','desconectar','desconectado','erro')),
  qr         text,
  numero     text,
  erro       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conexao_nao_e_sara CHECK (lower(instancia) NOT LIKE 'sara%')
);
ALTER TABLE public.conexoes_whatsapp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conexoes_whatsapp FROM anon, authenticated;
GRANT SELECT ON public.conexoes_whatsapp TO authenticated;
GRANT ALL ON public.conexoes_whatsapp TO service_role;

DROP POLICY IF EXISTS conexoes_whatsapp_ver ON public.conexoes_whatsapp;
CREATE POLICY conexoes_whatsapp_ver ON public.conexoes_whatsapp FOR SELECT TO authenticated
  USING (empresa_id = public.get_minha_empresa_id()
         AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role = 'master'));

-- Master pede a conexão (ou um novo QR).
CREATE OR REPLACE FUNCTION public.pedir_conexao_whatsapp()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_emp uuid := public.get_minha_empresa_id();
  v_role text; v_grp uuid; v_inst text; v_atual text;
BEGIN
  SELECT role INTO v_role FROM public.perfis WHERE id = auth.uid();
  IF v_emp IS NULL OR v_role IS DISTINCT FROM 'master' THEN
    RAISE EXCEPTION 'Só o master da imobiliária conecta o WhatsApp.';
  END IF;
  SELECT status INTO v_atual FROM public.conexoes_whatsapp WHERE empresa_id = v_emp;
  IF v_atual = 'conectado' THEN
    RAISE EXCEPTION 'O WhatsApp já está conectado. Desconecte antes de conectar outro número.';
  END IF;
  SELECT g.id INTO v_grp FROM public.grupos g WHERE g.empresa_id = v_emp
   ORDER BY g.is_principal DESC NULLS LAST, g.created_at LIMIT 1;
  IF v_grp IS NULL THEN RAISE EXCEPTION 'A imobiliária não tem grupo.'; END IF;
  v_inst := 'imob-' || substr(replace(v_emp::text, '-', ''), 1, 12);

  INSERT INTO public.conexoes_whatsapp (empresa_id, grupo_id, instancia, status, qr, erro)
  VALUES (v_emp, v_grp, v_inst, 'pedido', NULL, NULL)
  ON CONFLICT (empresa_id) DO UPDATE
    SET status = 'pedido', qr = NULL, erro = NULL, grupo_id = EXCLUDED.grupo_id, updated_at = now();

  INSERT INTO public.instancias_whatsapp (instancia, empresa_id, grupo_id, ativo)
  VALUES (v_inst, v_emp, v_grp, true)
  ON CONFLICT (instancia) DO UPDATE SET grupo_id = EXCLUDED.grupo_id, ativo = true;

  RETURN jsonb_build_object('instancia', v_inst, 'status', 'pedido');
END; $function$;

CREATE OR REPLACE FUNCTION public.desconectar_whatsapp()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_emp uuid := public.get_minha_empresa_id(); v_role text;
BEGIN
  SELECT role INTO v_role FROM public.perfis WHERE id = auth.uid();
  IF v_emp IS NULL OR v_role IS DISTINCT FROM 'master' THEN
    RAISE EXCEPTION 'Só o master da imobiliária desconecta o WhatsApp.';
  END IF;
  UPDATE public.conexoes_whatsapp SET status = 'desconectar', qr = NULL, updated_at = now()
   WHERE empresa_id = v_emp AND status IN ('qr','conectado','pedido','erro');
END; $function$;

-- n8n: o que precisa ser feito agora.
CREATE OR REPLACE FUNCTION public.whatsapp_pendentes(p_segredo text)
 RETURNS TABLE (empresa_id uuid, instancia text, status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.relay_segredo_ok(p_segredo) THEN RAISE EXCEPTION 'não autorizado'; END IF;
  RETURN QUERY SELECT c.empresa_id, c.instancia, c.status
    FROM public.conexoes_whatsapp c WHERE c.status IN ('pedido','qr','desconectar');
END; $function$;

-- n8n: devolve o andamento (QR, conectado, erro...).
CREATE OR REPLACE FUNCTION public.whatsapp_atualizar(
  p_segredo text, p_empresa uuid, p_status text, p_qr text DEFAULT NULL, p_numero text DEFAULT NULL, p_erro text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.relay_segredo_ok(p_segredo) THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF p_status NOT IN ('qr','conectado','desconectado','erro') THEN RAISE EXCEPTION 'status inválido'; END IF;
  UPDATE public.conexoes_whatsapp
     SET status = p_status,
         qr = CASE WHEN p_status = 'qr' THEN p_qr ELSE NULL END,
         numero = CASE WHEN p_status = 'conectado' THEN coalesce(p_numero, numero) ELSE numero END,
         erro = p_erro, updated_at = now()
   WHERE empresa_id = p_empresa;
END; $function$;

REVOKE ALL ON FUNCTION public.pedir_conexao_whatsapp() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desconectar_whatsapp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedir_conexao_whatsapp() TO authenticated;
GRANT EXECUTE ON FUNCTION public.desconectar_whatsapp() TO authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_pendentes(text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_atualizar(text, uuid, text, text, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_pendentes(text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_atualizar(text, uuid, text, text, text, text) TO anon, service_role;
