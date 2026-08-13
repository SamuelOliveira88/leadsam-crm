import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function exigirSuperAdmin(context: any) {
  const { data } = await context.supabase
    .from("perfis").select("super_admin, empresa_id").eq("id", context.userId).maybeSingle();
  if (!data?.super_admin) throw new Error("Apenas o super-admin pode trocar de empresa.");
  return data;
}

/** Empresas disponíveis para troca de contexto (somente super-admin). */
export const listarEmpresasContexto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const perfil = await exigirSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("empresas").select("id, nome").eq("ativo", true).order("nome");
    if (error) throw new Error(error.message);
    return { atual: perfil.empresa_id as string | null, empresas: data ?? [] };
  });

/** Troca a empresa ativa do próprio perfil (somente super-admin). */
export const trocarEmpresaContexto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { empresa_id: string }) => z.object({ empresa_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp } = await supabaseAdmin
      .from("empresas").select("id").eq("id", data.empresa_id).eq("ativo", true).maybeSingle();
    if (!emp) throw new Error("Empresa não encontrada ou inativa.");
    const { error } = await supabaseAdmin
      .from("perfis").update({ empresa_id: data.empresa_id, grupo_id: null }).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, empresa_id: data.empresa_id };
  });
