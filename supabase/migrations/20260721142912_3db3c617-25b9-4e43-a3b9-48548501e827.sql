CREATE TABLE public.empreendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  incorporadora text,
  cidade text,
  grupo_id uuid REFERENCES public.grupos(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empreendimentos TO authenticated;
GRANT ALL ON public.empreendimentos TO service_role;
ALTER TABLE public.empreendimentos ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendimento_id uuid NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
  torre text NOT NULL DEFAULT 'Único',
  andar int NOT NULL DEFAULT 1,
  numero text NOT NULL,
  tipologia text,
  area_m2 numeric(8,2),
  valor numeric(14,2),
  status text NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel', 'reservada', 'vendida', 'bloqueada')),
  corretor_id uuid REFERENCES public.corretores(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  cliente_nome text,
  reservado_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empreendimento_id, torre, numero)
);
CREATE INDEX idx_unidades_empreendimento ON public.unidades(empreendimento_id);
CREATE INDEX idx_unidades_status ON public.unidades(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades TO authenticated;
GRANT ALL ON public.unidades TO service_role;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empreendimentos_read_todos" ON public.empreendimentos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "empreendimentos_write_master_gerente" ON public.empreendimentos
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT role FROM public.get_my_profile()) = 'gerente')
  WITH CHECK (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT role FROM public.get_my_profile()) = 'gerente');

CREATE POLICY "unidades_read_todos" ON public.unidades
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "unidades_write_master_gerente" ON public.unidades
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT role FROM public.get_my_profile()) = 'gerente')
  WITH CHECK (
    (SELECT role FROM public.get_my_profile()) = 'master' OR
    (SELECT role FROM public.get_my_profile()) = 'gerente');

CREATE OR REPLACE FUNCTION public.reservar_unidade(
  p_unidade_id uuid, p_lead_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_corretor_id uuid;
  v_status_atual text;
BEGIN
  SELECT role, corretor_id INTO v_role, v_corretor_id FROM public.perfis WHERE id = auth.uid();

  IF v_role = 'corretor' AND v_corretor_id IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a um corretor.';
  END IF;

  SELECT status INTO v_status_atual FROM public.unidades WHERE id = p_unidade_id FOR UPDATE;
  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Unidade não encontrada.';
  END IF;
  IF v_status_atual <> 'disponivel' THEN
    RAISE EXCEPTION 'Esta unidade não está mais disponível.';
  END IF;

  UPDATE public.unidades SET
    status = 'reservada',
    corretor_id = CASE WHEN v_role = 'corretor' THEN v_corretor_id ELSE COALESCE(v_corretor_id, corretor_id) END,
    lead_id = p_lead_id,
    cliente_nome = p_cliente_nome,
    reservado_em = now()
  WHERE id = p_unidade_id;
END; $$;

CREATE OR REPLACE FUNCTION public.liberar_unidade(p_unidade_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_corretor_id uuid;
  v_dono uuid;
BEGIN
  SELECT role, corretor_id INTO v_role, v_corretor_id FROM public.perfis WHERE id = auth.uid();
  SELECT corretor_id INTO v_dono FROM public.unidades WHERE id = p_unidade_id FOR UPDATE;

  IF v_role = 'corretor' AND (v_dono IS DISTINCT FROM v_corretor_id) THEN
    RAISE EXCEPTION 'Você só pode liberar reservas feitas por você.';
  END IF;

  UPDATE public.unidades SET
    status = 'disponivel', corretor_id = NULL, lead_id = NULL, cliente_nome = NULL, reservado_em = NULL
  WHERE id = p_unidade_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.reservar_unidade(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.liberar_unidade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_unidade(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_unidade(uuid) TO authenticated;

INSERT INTO public.empreendimentos (nome, incorporadora, ativo) VALUES
  ('Áurea Sky', 'Abiatar Incorporadora', true),
  ('Vista Plaza', 'Abiatar Incorporadora', true),
  ('Clube Laguna', 'Abiatar Incorporadora', true),
  ('Griffe Jasmins II', 'Abiatar Incorporadora', true),
  ('Residence Tower', 'Abiatar Incorporadora', true),
  ('Innovare Portal do Morumbi', 'Abiatar Incorporadora', true),
  ('Vista Parque', 'Abiatar Incorporadora', true),
  ('Villa São Francisco IV', 'Abiatar Incorporadora', true),
  ('Griffe Algarve', 'Abiatar Incorporadora', true)
ON CONFLICT (nome) DO NOTHING;