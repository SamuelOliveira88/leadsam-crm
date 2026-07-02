import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CompromissoInput = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  tipo: z.enum(["visita", "ligacao", "reuniao"]),
  titulo: z.string().min(1),
  data_hora: z.string(),
  notas: z.string().nullable().optional(),
});

export const listarCompromissos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("compromissos")
      .select("*, leads(id, nome)")
      .order("data_hora", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const criarCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompromissoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("compromissos").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const excluirCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("compromissos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
