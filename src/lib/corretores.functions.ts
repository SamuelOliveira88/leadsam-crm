import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CorretorInput = z.object({
  nome: z.string().min(1),
  telefone: z.string().optional().nullable(),
  grupo_id: z.string().uuid().nullable().optional(),
  ativo: z.boolean().default(true),
  canal_notificacao: z.enum(["whatsapp", "email", "ambos", "nenhum"]).default("whatsapp"),
  recebe_via_web: z.boolean().default(true),
  recebe_via_whatsapp: z.boolean().default(true),
});

export const listarCorretores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("corretores")
      .select("id, nome, telefone, grupo_id, ativo, canal_notificacao, recebe_via_web, recebe_via_whatsapp, created_at, grupos(nome)")
      .order("nome");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const criarCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CorretorInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("corretores").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const atualizarCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), patch: CorretorInput.partial() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("corretores")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const excluirCorretor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("corretores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
