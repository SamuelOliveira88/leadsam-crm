import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const LeadInput = z.object({
  nome: z.string().min(1),
  telefone: z.string().min(8),
  origem: z.string().default("Manual"),
  estagio: z.enum(["novo", "em_contato", "proposta", "fechado", "perdido"]).default("novo"),
  interesse: z.string().nullable().optional(),
  valor_estimado: z.number().nullable().optional(),
  consultor_id: z.string().uuid().nullable().optional(),
  notas: z.string().nullable().optional(),
});

export const listarLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("*, consultores(id, nome, numero_whatsapp)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const criarLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("leads").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const atualizarLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), patch: LeadInput.partial() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("leads")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const excluirLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const moverEstagio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      estagio: z.enum(["novo", "em_contato", "proposta", "fechado", "perdido"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").update({ estagio: data.estagio }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
