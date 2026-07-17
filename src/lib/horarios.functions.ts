import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listarHorarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ grupo_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("horarios_atendimento")
      .select("id, grupo_id, dia_semana, hora_inicio, hora_fim, ativo")
      .eq("grupo_id", data.grupo_id)
      .order("dia_semana");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const HorarioInput = z.object({
  grupo_id: z.string().uuid(),
  dia_semana: z.number().int().min(0).max(6),
  hora_inicio: z.string(),
  hora_fim: z.string(),
  ativo: z.boolean(),
});

export const upsertHorario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HorarioInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("horarios_atendimento")
      .upsert(data, { onConflict: "grupo_id,dia_semana" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
