-- Discador próprio (modo preview): ramais dos corretores, chamadas e lista "não ligar mais".
-- Quem escreve nas chamadas é só o servidor (service_role). O corretor só lê as dele.

-- ============ RAMAIS ============
CREATE TABLE IF NOT EXISTS public.discador_ramais (
  perfil_id uuid PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  ramal text NOT NULL UNIQUE,
  sip_senha text NOT NULL,
  estado text NOT NULL DEFAULT 'offline'
    CHECK (estado IN ('offline', 'pronto', 'pausa', 'preenchendo', 'ocupado')),
  estado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discador_ramais_empresa ON public.discador_ramais(empresa_id);

ALTER TABLE public.discador_ramais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discador_ramais FROM anon, authenticated;
GRANT SELECT ON public.discador_ramais TO authenticated;
GRANT ALL ON public.discador_ramais TO service_role;

-- Cada um lê só o próprio ramal (a senha SIP vai para o telefone do navegador).
DROP POLICY IF EXISTS "ramal_leitura_propria" ON public.discador_ramais;
CREATE POLICY "ramal_leitura_propria" ON public.discador_ramais
  FOR SELECT TO authenticated USING (perfil_id = auth.uid());

-- ============ CHAMADAS ============
CREATE TABLE IF NOT EXISTS public.discador_chamadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  perfil_id uuid NOT NULL REFERENCES public.perfis(id),
  ramal text NOT NULL,
  telefone text NOT NULL,
  -- pedida: o Alexandria pediu | discando: a ponte pegou o pedido | atendida: o lead atendeu | encerrada | falhou
  status text NOT NULL DEFAULT 'pedida'
    CHECK (status IN ('pedida', 'discando', 'atendida', 'encerrada', 'falhou')),
  motivo_falha text,
  -- resultado marcado pelo corretor depois da ligação
  resultado text
    CHECK (resultado IS NULL OR resultado IN ('atendeu', 'nao_atendeu', 'caixa_postal', 'numero_errado', 'ligar_depois', 'nao_ligar_mais')),
  duracao_seg integer,
  gravacao_path text,
  atendida_em timestamptz,
  encerrada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discador_chamadas_perfil ON public.discador_chamadas(perfil_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discador_chamadas_lead ON public.discador_chamadas(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discador_chamadas_status ON public.discador_chamadas(status) WHERE status IN ('pedida', 'discando', 'atendida');

ALTER TABLE public.discador_chamadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discador_chamadas FROM anon, authenticated;
GRANT SELECT ON public.discador_chamadas TO authenticated;
GRANT ALL ON public.discador_chamadas TO service_role;

DROP POLICY IF EXISTS "chamadas_leitura" ON public.discador_chamadas;
CREATE POLICY "chamadas_leitura" ON public.discador_chamadas FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR perfil_id = auth.uid() OR (
    empresa_id = public.get_minha_empresa_id() AND
    EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('master', 'gerente'))));

-- ============ NÃO LIGAR MAIS ============
CREATE TABLE IF NOT EXISTS public.discador_optout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  telefone text NOT NULL,
  motivo text,
  criado_por uuid REFERENCES public.perfis(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, telefone)
);

ALTER TABLE public.discador_optout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discador_optout FROM anon, authenticated;
GRANT SELECT ON public.discador_optout TO authenticated;
GRANT ALL ON public.discador_optout TO service_role;

DROP POLICY IF EXISTS "optout_leitura" ON public.discador_optout;
CREATE POLICY "optout_leitura" ON public.discador_optout FOR SELECT TO authenticated USING (
  public.pode_dar_suporte() OR empresa_id = public.get_minha_empresa_id());
