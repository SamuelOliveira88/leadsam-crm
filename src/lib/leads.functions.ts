import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listarLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, nome, telefone, email, status, grupo_id, corretor_id, created_at, corretores(nome), grupos(nome)")
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

export const excluirLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
