import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listarLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, nome, telefone, email, status, grupo_id, corretor_id, etapa_funil, fonte, cidade, created_at, corretores(nome), grupos(nome)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("dashboard_corretores").select("*");
    if (error) throw new Error(error.message);
    const { data: leads } = await context.supabase.from("leads").select("id, status, created_at");
    const total = leads?.length ?? 0;
    const represados = leads?.filter((l) => l.status === "represado").length ?? 0;
    const hoje = leads?.filter((l) => new Date(l.created_at).toDateString() === new Date().toDateString()).length ?? 0;
    return { corretores: data ?? [], total, represados, hoje };
  });

const LeadImportInput = z.object({
  grupo_id: z.string().uuid(),
  modo: z.enum(["rodizio", "direcionado"]),
  corretores_ids: z.array(z.string().uuid()).optional(),
  leads: z.array(z.object({
    nome: z.string().min(1),
    telefone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
  })).min(1),
});

export const importarLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeadImportInput.parse(d))
  .handler(async ({ data, context }) => {
    let sucesso = 0;
    let erros = 0;
    for (const lead of data.leads) {
      const rpc = data.modo === "rodizio"
        ? context.supabase.rpc("distribuir_lead_round_robin", {
            p_nome: lead.nome, p_telefone: lead.telefone ?? "", p_email: lead.email ?? "", p_grupo_id: data.grupo_id,
          })
        : context.supabase.rpc("distribuir_lead_direcionado", {
            p_nome: lead.nome, p_telefone: lead.telefone ?? "", p_email: lead.email ?? "",
            p_grupo_id: data.grupo_id, p_corretores_ids: data.corretores_ids ?? [],
          });
      const { error } = await rpc;
      if (error) erros++; else sucesso++;
    }
    return { sucesso, erros };
  });

// ============ IMPORTAÇÃO ROBUSTA DE PLANILHA (ex: Leadfy) ============
// Diferente do importarLeads (rodízio ao vivo), aqui os leads já têm histórico
// próprio (corretor original, status de negociação, datas, etc.) — inserção
// direta em lote, tentando casar o corretor pelo nome informado na planilha.
const LeadPlanilhaRow = z.object({
  nome: z.string().min(1),
  telefone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  corretor_nome: z.string().optional().nullable(),
  fonte: z.string().optional().nullable(),
  canal: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  etapa_funil: z.string().optional().nullable(),
  motivo_perda: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  ultima_atividade: z.string().optional().nullable(),
  data_atividade: z.string().optional().nullable(),
  valor_negociacao: z.number().optional().nullable(),
  codigo_imovel: z.string().optional().nullable(),
  campanha: z.string().optional().nullable(),
  criado_em: z.string().optional().nullable(),
});

const LeadPlanilhaImportInput = z.object({
  grupo_id: z.string().uuid(),
  leads: z.array(LeadPlanilhaRow).min(1).max(1000),
});

export const importarLeadsPlanilha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeadPlanilhaImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: corretores } = await context.supabase
      .from("corretores")
      .select("id, nome")
      .eq("grupo_id", data.grupo_id);
    const porNome = new Map<string, string>(
      (corretores ?? []).map((c: any) => [String(c.nome).trim().toLowerCase(), c.id]),
    );

    let sucesso = 0;
    let erros = 0;
    let semCorretor = 0;

    const linhas = data.leads.map((l) => {
      const corretorId = l.corretor_nome ? (porNome.get(l.corretor_nome.trim().toLowerCase()) ?? null) : null;
      if (!corretorId) semCorretor++;
      return {
        nome: l.nome,
        telefone: l.telefone ?? null,
        email: l.email ?? null,
        grupo_id: data.grupo_id,
        corretor_id: corretorId,
        status: corretorId ? "distribuido" : "represado",
        represado_em: corretorId ? null : new Date().toISOString(),
        fonte: l.fonte ?? null,
        canal: l.canal ?? null,
        cidade: l.cidade ?? null,
        etapa_funil: l.etapa_funil ?? null,
        motivo_perda: l.motivo_perda ?? null,
        observacoes: l.observacoes ?? null,
        ultima_atividade: l.ultima_atividade ?? null,
        data_atividade: l.data_atividade || null,
        valor_negociacao: l.valor_negociacao ?? null,
        codigo_imovel: l.codigo_imovel ?? null,
        campanha: l.campanha ?? null,
        corretor_origem_nome: l.corretor_nome ?? null,
        ...(l.criado_em ? { created_at: l.criado_em } : {}),
      };
    });

    const { error } = await context.supabase.from("leads").insert(linhas);
    if (error) { erros = linhas.length; } else { sucesso = linhas.length; }

    return { sucesso, erros, semCorretor };
  });

// ============ EXPORTAÇÃO DE LEADS ============
export const exportarLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select(`
        nome, telefone, email, status, etapa_funil, fonte, canal, cidade,
        motivo_perda, observacoes, ultima_atividade, data_atividade,
        valor_negociacao, codigo_imovel, campanha, corretor_origem_nome,
        created_at, corretores(nome), grupos(nome)
      `)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const excluirLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
