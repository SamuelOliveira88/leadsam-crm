import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listarGrupos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("grupos")
      .select("id, nome, whatsapp_distribuicao, whatsapp_importacao, created_at")
      .order("nome");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const GrupoInput = z.object({
  nome: z.string().min(1),
  whatsapp_distribuicao: z.string().optional().nullable(),
  whatsapp_importacao: z.string().optional().nullable(),
});

export const criarGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GrupoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("grupos").insert({
      nome: data.nome,
      whatsapp_distribuicao: data.whatsapp_distribuicao || null,
      whatsapp_importacao: data.whatsapp_importacao || null,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const atualizarGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GrupoInput.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("grupos").update({
      nome: data.nome,
      whatsapp_distribuicao: data.whatsapp_distribuicao || null,
      whatsapp_importacao: data.whatsapp_importacao || null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("grupos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
