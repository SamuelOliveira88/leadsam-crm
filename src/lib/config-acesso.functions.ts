import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function minhaEmpresaId(context: any): Promise<string> {
  const { data } = await context.supabase
    .from("perfis").select("empresa_id").eq("id", context.userId).maybeSingle();
  if (!data?.empresa_id) throw new Error("Usuário sem empresa vinculada.");
  return data.empresa_id;
}

export const getConfigAcesso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const empresa_id = await minhaEmpresaId(context);
    const { data, error } = await context.supabase
      .from("config_acesso")
      .select("restringir_horario, hora_inicio, hora_fim, liberado_ate")
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    if (error) throw error;
    return data ?? { restringir_horario: true, hora_inicio: "08:00:00", hora_fim: "09:30:00", liberado_ate: null };
  });

export const salvarConfigAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    restringir_horario: boolean;
    hora_inicio: string;
    hora_fim: string;
    liberado_ate: string | null;
  }) => z.object({
    restringir_horario: z.boolean(),
    hora_inicio: z.string(),
    hora_fim: z.string(),
    liberado_ate: z.string().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const empresa_id = await minhaEmpresaId(context);
    const { error } = await context.supabase
      .from("config_acesso")
      .upsert({ empresa_id, ...data, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true };
  });

export const liberarAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { minutos: number }) => z.object({ minutos: z.number().int().min(5).max(24 * 60) }).parse(d))
  .handler(async ({ data, context }) => {
    const empresa_id = await minhaEmpresaId(context);
    const ate = new Date(Date.now() + data.minutos * 60_000).toISOString();
    const { error } = await context.supabase
      .from("config_acesso")
      .upsert({ empresa_id, liberado_ate: ate, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { liberado_ate: ate };
  });

export const revogarLiberacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const empresa_id = await minhaEmpresaId(context);
    const { error } = await context.supabase
      .from("config_acesso")
      .upsert({ empresa_id, liberado_ate: null, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true };
  });
