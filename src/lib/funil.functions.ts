import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ETAPAS_FUNIL } from "@/lib/funil";

const MoverEtapaInput = z
  .object({
    lead_id: z.string().uuid(),
    etapa: z.enum(ETAPAS_FUNIL),
    motivo_perda: z.string().trim().max(500).optional().nullable(),
    valor_negociacao: z.number().finite().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.etapa === "Perdido" && (v.motivo_perda ?? "").trim().length < 3) {
      ctx.addIssue({ code: "custom", path: ["motivo_perda"], message: "Informe o motivo da perda." });
    }
    if (v.etapa === "Vendido" && !(typeof v.valor_negociacao === "number" && v.valor_negociacao > 0)) {
      ctx.addIssue({ code: "custom", path: ["valor_negociacao"], message: "Informe o valor da venda." });
    }
  });

/**
 * Muda a etapa do lead. Perdido exige motivo; Vendido exige valor.
 * O histórico (quando, quem, de/para) é gravado por gatilho no banco.
 * Respeita a RLS: só move quem enxerga/edita o lead.
 */
export const moverEtapaLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MoverEtapaInput.parse(d))
  .handler(async ({ data, context }) => {
    const patch: { etapa_funil: string; motivo_perda?: string; valor_negociacao?: number } = { etapa_funil: data.etapa };
    if (data.etapa === "Perdido") patch.motivo_perda = (data.motivo_perda ?? "").trim();
    if (data.etapa === "Vendido" && typeof data.valor_negociacao === "number") patch.valor_negociacao = data.valor_negociacao;

    const { data: rows, error } = await context.supabase
      .from("leads")
      .update(patch)
      .eq("id", data.lead_id)
      .select("id, etapa_funil, motivo_perda, valor_negociacao");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) throw new Error("Você não tem permissão para mover este lead.");
    return rows[0];
  });

export const listarHistoricoLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lead_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_historico")
      .select("id, etapa_anterior, etapa_nova, usuario_nome, created_at")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
