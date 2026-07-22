import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const meuPerfil = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("perfis")
      .select("id, nome, role, grupo_id, corretor_id, super_admin, corretores(liberado_ate)")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const liberado_ate = (data as any).corretores?.liberado_ate ?? null;
    return {
      id: data.id,
      nome: data.nome,
      role: data.role,
      grupo_id: data.grupo_id,
      corretor_id: (data as any).corretor_id ?? null,
      super_admin: (data as any).super_admin ?? false,
      liberado_ate,
    };
  });
